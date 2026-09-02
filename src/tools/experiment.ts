import { clampInt, linspace, round, roundAll } from '../lib/format';
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

/** Builds the four per-experiment tools. Schemas describe `def`; handlers read the open experiment at call time. */
export function experimentTools(def: ExperimentDef): ToolDef[] {
  const props = paramProperties(def);
  const paramKeys = def.params.map((p) => p.key);
  const numberSpecs = def.params.filter((p): p is Extract<ParamSpec, { kind: 'number' }> => p.kind === 'number');
  const sweepExample = numberSpecs[1] ?? numberSpecs[0];

  return [
    {
      name: 'set_parameters',
      description: `Change one or more ${def.title} parameters without running anything. Parameters: ${def.params
        .map(describeParam)
        .join('; ')}. The sliders update on screen. ${def.agentGuidance}`,
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
      description: `Run the ${def.title} experiment once and measure it. Uses the current parameters; any parameter you pass is applied first and stays set. Returns ${def.measurements
        .map((m) => m.key)
        .join(', ')}. The person watches the trial on screen.`,
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
          if (!trials.length) break;
          let min = trials[0];
          let max = trials[0];
          for (const t of trials) {
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
        return {
          sweep_id: sweep.id,
          experiment: d.id,
          parameter: spec.key,
          status: sweep.status,
          ...(sweep.error ? { error: sweep.error } : {}),
          count: trials.length,
          summary,
          rows: rows.slice(0, MAX_SWEEP_ROWS),
          ...(rows.length > MAX_SWEEP_ROWS ? { more_rows: `get_results with sweep_id ${sweep.id}` } : {}),
          hint: `Call plot_results with sweep_id "${sweep.id}" and a measurement key to chart it, then notebook_add_entry to record the conclusion.`,
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
