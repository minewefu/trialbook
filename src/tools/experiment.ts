import { clampInt, fitToBudget, linspace, round, roundAll } from '../lib/format';
import type { ToolDef } from '../lib/webmcp';
import { mustDef } from '../sims';
import { describeParam, formatMeasurements, type ExperimentDef, type ParamSpec } from '../sims/types';
import { MAX_SWEEP_VALUES, useLab, type Trial } from '../store';
import { objectSchema } from './global';

const MAX_SWEEP_ROWS = 8;

/** Experiment tools always act on the experiment that is open right now, so a stale registration still behaves. */
function activeDef(): ExperimentDef {
  const id = useLab.getState().experiment;
  if (!id) throw new Error('No experiment is open. Call open_experiment first.');
  return mustDef(id);
}

function schemaFor(spec: ParamSpec): Record<string, unknown> {
  if (spec.kind === 'number') {
    return {
      type: 'number',
      minimum: spec.min,
      maximum: spec.max,
      description: `${spec.description} Unit: ${spec.unit || 'none'}.`,
    };
  }
  return { type: 'string', enum: [...spec.options], description: spec.description };
}

function paramProperties(def: ExperimentDef): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const spec of def.params) props[spec.key] = schemaFor(spec);
  return props;
}

/** Joins sentences while the result stays within the description limit; trailing parts are dropped first. */
function compose(parts: string[], limit = 500): string {
  let out = '';
  for (const part of parts) {
    const next = out ? `${out} ${part}` : part;
    if (next.length > limit) break;
    out = next;
  }
  return out;
}

/** Builds the four per-experiment tools. Schemas describe `def`; handlers read the open experiment at call time. */
export function experimentTools(def: ExperimentDef): ToolDef[] {
  const props = paramProperties(def);
  const paramKeys = def.params.map((p) => p.key);
  const numberSpecs = def.params.filter((p): p is Extract<ParamSpec, { kind: 'number' }> => p.kind === 'number');
  const sweepExample = numberSpecs[1] ?? numberSpecs[0];

  return [
    {
      name: 'set_parameters',
      description: compose([
        `Change ${def.title} parameters without running anything; the sliders update on screen.`,
        `Parameters: ${def.params.map(describeParam).join('; ')}.`,
        def.agentGuidance,
      ]),
      inputSchema: objectSchema(props),
      example: numberSpecs[0] ? { [numberSpecs[0].key]: numberSpecs[0].default } : {},
      execute: async (input: Record<string, unknown>) => {
        const d = activeDef();
        const { params, changed } = useLab.getState().setParams(d.id, input, 'agent');
        return {
          experiment: d.id,
          changed,
          parameters: params,
          hint: changed.length
            ? 'Call run_trial to measure with these parameters.'
            : 'Nothing changed. Pass at least one parameter with a new value.',
        };
      },
    },
    {
      name: 'run_trial',
      description: compose([
        `Run the ${def.title} experiment once and measure it. Uses the current parameters; any parameter you pass is applied first and stays set.`,
        `Returns ${def.measurements.map((m) => m.key).join(', ')}.`,
        'The person watches the trial on screen.',
      ]),
      inputSchema: objectSchema({
        ...props,
        label: { type: 'string', maxLength: 60, description: 'Optional short label for this trial.' },
      }),
      example: {},
      execute: async (input: Record<string, unknown>) => {
        const d = activeDef();
        const { label, ...overrides } = input ?? {};
        const trial = useLab.getState().runTrial(d.id, 'agent', overrides, typeof label === 'string' ? label : undefined);
        return {
          trial_id: trial.id,
          experiment: d.id,
          parameters: trial.params,
          measurements: roundAll(trial.measurements, 4),
          summary: formatMeasurements(d, trial.measurements),
          hint: 'Record what you observed with notebook_add_entry, or explore a range with sweep_parameter.',
        };
      },
    },
    {
      name: 'sweep_parameter',
      description: `Run a series of ${def.title} trials while one parameter changes and the others stay at their current values. Give from, to and steps for an even spread, or an explicit values list (up to ${MAX_SWEEP_VALUES}). The person watches a progress bar and can cancel. Returns per-value measurements plus the minimum and maximum of each measurement.`,
      inputSchema: objectSchema(
        {
          parameter: { type: 'string', enum: paramKeys, description: 'Which parameter to vary.' },
          from: { type: 'number', description: 'First value, for numeric parameters.' },
          to: { type: 'number', description: 'Last value, for numeric parameters.' },
          steps: {
            type: 'integer',
            minimum: 2,
            maximum: MAX_SWEEP_VALUES,
            description: 'How many evenly spaced values from first to last, both ends included. Default 10.',
          },
          values: {
            type: 'array',
            items: { type: ['number', 'string'] },
            maxItems: MAX_SWEEP_VALUES,
            description: 'Explicit list of values to try instead of from, to and steps.',
          },
          watch: { type: 'boolean', description: 'Animate each trial briefly so the person can watch. Default true.' },
          label: { type: 'string', maxLength: 60, description: 'Optional short label for the sweep.' },
        },
        ['parameter'],
      ),
      example: sweepExample
        ? { parameter: sweepExample.key, from: sweepExample.min, to: sweepExample.max, steps: 6 }
        : { parameter: paramKeys[0] },
      execute: async (
        input: { parameter: string; from?: number; to?: number; steps?: number; values?: unknown[]; watch?: boolean; label?: string },
        opts?: { signal?: AbortSignal },
      ) => {
        const d = activeDef();
        const spec = d.params.find((p) => p.key === input.parameter);
        if (!spec) throw new Error(`parameter must be one of ${d.params.map((p) => p.key).join(', ')}.`);
        let values: unknown[];
        if (Array.isArray(input.values) && input.values.length > 0) {
          values = input.values;
        } else if (spec.kind === 'enum') {
          values = [...spec.options];
        } else {
          const from = Number(input.from);
          const to = Number(input.to);
          if (!Number.isFinite(from) || !Number.isFinite(to)) {
            throw new Error(`Give from and to for ${spec.key} (${spec.min} to ${spec.max} ${spec.unit}), or a values list.`.trim());
          }
          values = linspace(from, to, clampInt(input.steps, 2, MAX_SWEEP_VALUES, 10));
        }
        const sweep = await useLab.getState().runSweep(d.id, spec.key, values, 'agent', {
          watch: input.watch !== false,
          signal: opts?.signal,
          ...(typeof input.label === 'string' ? { label: input.label } : {}),
        });
        const s = useLab.getState();
        const trials = sweep.trialIds.map((id) => s.trials.find((t) => t.id === id)).filter((t): t is Trial => Boolean(t));
        const summary: Record<string, unknown> = {};
        for (const m of d.measurements) {
          const finite = trials.filter((t) => Number.isFinite(t.measurements[m.key]));
          if (!finite.length) {
            summary[m.key] = null;
            continue;
          }
          let min = finite[0];
          let max = finite[0];
          for (const t of finite) {
            if (t.measurements[m.key] < min.measurements[m.key]) min = t;
            if (t.measurements[m.key] > max.measurements[m.key]) max = t;
          }
          summary[m.key] = {
            min: round(min.measurements[m.key], 4),
            min_at: min.params[spec.key],
            max: round(max.measurements[m.key], 4),
            max_at: max.params[spec.key],
          };
        }
        const rows = trials.map((t) => ({ [spec.key]: t.params[spec.key], ...roundAll(t.measurements, 4) }));
        const build = (n: number) => ({
          sweep_id: sweep.id,
          experiment: d.id,
          parameter: spec.key,
          status: sweep.status,
          cancelled: sweep.status === 'cancelled',
          ...(sweep.error ? { error: sweep.error } : {}),
          count: trials.length,
          summary,
          rows: rows.slice(0, n),
          ...(rows.length > n ? { more_rows: `get_results with sweep_id ${sweep.id}` } : {}),
          hint: `Call plot_results with sweep_id "${sweep.id}" and a measurement key to chart it, then notebook_add_entry to record the conclusion.`,
        });
        return fitToBudget(build, Math.min(rows.length, MAX_SWEEP_ROWS), 1350, Math.min(rows.length, 2)).value;
      },
    },
    {
      name: 'optimize_parameter',
      description: `Search for the value of one ${def.title} parameter that maximises or minimises a measurement, using golden-section search over a range (about 20 trials for 1% of the range). Assumes a single peak or valley; run a coarse sweep_parameter first if unsure. Recorded as a sweep so plot_results can show every point tried.`,
      inputSchema: objectSchema(
        {
          parameter: { type: 'string', enum: numberSpecs.map((p) => p.key), description: 'Numeric parameter to search.' },
          measurement: { type: 'string', enum: def.measurements.map((m) => m.key), description: 'Measurement to optimise.' },
          goal: { type: 'string', enum: ['max', 'min'], description: 'Maximise or minimise the measurement.' },
          from: { type: 'number', description: 'Lower end of the search range. Default: the parameter minimum.' },
          to: { type: 'number', description: 'Upper end of the search range. Default: the parameter maximum.' },
          tolerance: { type: 'number', description: 'Stop when the bracket is this narrow. Default: 1% of the range.' },
          max_trials: { type: 'integer', minimum: 4, maximum: 30, description: 'Trial budget, 4 to 30. Default 20.' },
          watch: { type: 'boolean', description: 'Pause briefly after each trial so the person can watch. Default true.' },
        },
        ['parameter', 'measurement', 'goal'],
      ),
      example: numberSpecs[1]
        ? { parameter: numberSpecs[1].key, measurement: def.measurements[0].key, goal: 'max', tolerance: 0.1 }
        : { parameter: numberSpecs[0]?.key ?? '', measurement: def.measurements[0].key, goal: 'max' },
      execute: async (
        input: { parameter: string; measurement: string; goal: 'max' | 'min'; from?: number; to?: number; tolerance?: number; max_trials?: number; watch?: boolean },
        opts?: { signal?: AbortSignal },
      ) => {
        const d = activeDef();
        if (input.goal !== 'max' && input.goal !== 'min') throw new Error('goal must be "max" or "min".');
        const result = await useLab.getState().runOptimization(
          d.id,
          input.parameter,
          {
            measurement: input.measurement,
            goal: input.goal,
            ...(input.from !== undefined ? { from: Number(input.from) } : {}),
            ...(input.to !== undefined ? { to: Number(input.to) } : {}),
            ...(input.tolerance !== undefined ? { tolerance: Number(input.tolerance) } : {}),
            ...(input.max_trials !== undefined ? { maxTrials: Number(input.max_trials) } : {}),
            watch: input.watch !== false,
            signal: opts?.signal,
          },
          'agent',
        );
        const spec = d.params.find((p) => p.key === input.parameter);
        const unit = spec?.kind === 'number' ? spec.unit : '';
        return {
          sweep_id: result.sweep.id,
          experiment: d.id,
          parameter: input.parameter,
          measurement: input.measurement,
          goal: input.goal,
          status: result.sweep.status,
          cancelled: result.sweep.status === 'cancelled',
          best: result.best
            ? {
                [input.parameter]: result.best.params[input.parameter],
                unit,
                [input.measurement]: round(result.best.measurements[input.measurement], 5),
                trial_id: result.best.id,
              }
            : null,
          bracket: [round(result.bracket[0], 5), round(result.bracket[1], 5)],
          bracket_width: round(result.bracket[1] - result.bracket[0], 5),
          tolerance: round(result.tolerance, 5),
          trials_used: result.trialsUsed,
          converged: result.converged,
          ...(result.atBound ? { at_bound: result.atBound, note: `The best value sits at the ${result.atBound} end of the range, so the true optimum may lie outside it or the response is monotonic.` } : {}),
          caveat: 'Golden-section search assumes one peak or valley in the range.',
          hint: `plot_results with sweep_id "${result.sweep.id}" shows every point tried; record the optimum with notebook_add_entry.`,
        };
      },
    },
    {
      name: 'reset_experiment',
      description: `Reset every ${def.title} parameter to its default value. Trials, charts and notebook entries are kept.`,
      inputSchema: objectSchema({}),
      example: {},
      execute: async () => {
        const d = activeDef();
        const parameters = useLab.getState().resetParams(d.id, 'agent');
        return { experiment: d.id, parameters };
      },
    },
  ];
}
