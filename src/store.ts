import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { clip } from './lib/format';
import { EXPERIMENTS, mustDef } from './sims';
import {
  defaultParams,
  formatMeasurements,
  validatePatch,
  type ExperimentId,
  type Measurements,
  type ParamValue,
  type Params,
  type SeriesPoint,
} from './sims/types';

export type Actor = 'you' | 'agent';
export type NoteKind = 'hypothesis' | 'observation' | 'conclusion' | 'note';
export const NOTE_KINDS: readonly NoteKind[] = ['hypothesis', 'observation', 'conclusion', 'note'];

export type Trial = {
  id: string;
  experiment: ExperimentId;
  params: Params;
  measurements: Measurements;
  series: SeriesPoint[];
  actor: Actor;
  ts: number;
  sweepId?: string;
  label?: string;
};

export type SweepStatus = 'running' | 'done' | 'cancelled' | 'failed';
export type SweepKind = 'sweep' | 'optimize' | 'repeats';

export type Sweep = {
  id: string;
  experiment: ExperimentId;
  parameter: string;
  values: ParamValue[];
  trialIds: string[];
  actor: Actor;
  ts: number;
  status: SweepStatus;
  kind?: SweepKind;
  label?: string;
  error?: string;
};

export type OptimizeOptions = {
  measurement: string;
  goal: 'max' | 'min';
  from?: number;
  to?: number;
  tolerance?: number;
  maxTrials?: number;
  watch?: boolean;
  signal?: AbortSignal;
  label?: string;
};

export type OptimizeResult = {
  sweep: Sweep;
  best: Trial | null;
  bracket: [number, number];
  tolerance: number;
  trialsUsed: number;
  converged: boolean;
  atBound: 'low' | 'high' | null;
};

export type ChartPoint = { x: number; y: number; label?: string; trialId?: string; sd?: number; n?: number };

/** A fitted model drawn over a chart's points. */
export type ChartFit = {
  model: 'linear' | 'quadratic' | 'power' | 'exponential';
  params: Record<string, number>;
  equation: string;
  r2: number;
  rmse: number;
  n: number;
};

export type Chart = {
  id: string;
  title: string;
  experiment: ExperimentId;
  xKey: string;
  xLabel: string;
  yKey: string;
  yLabel: string;
  points: ChartPoint[];
  sweepId?: string;
  fit?: ChartFit;
  actor: Actor;
  ts: number;
};

export type NotebookEntry = {
  id: string;
  ts: number;
  author: Actor;
  kind: NoteKind;
  text: string;
  experiment: ExperimentId | null;
  params?: Params;
  trialId?: string;
  sweepId?: string;
  chartId?: string;
  edited?: boolean;
};

export type Change = { ts: number; actor: Actor; text: string; key?: string };
export type Toast = { id: number; text: string; actor: Actor; ts: number };
export type SweepOptions = { watch?: boolean; signal?: AbortSignal; label?: string };

const MAX_TRIALS = 200;
const MAX_CHANGES = 30;
const MAX_TOASTS = 4;
const HIGHLIGHT_MS = 2500;
export const MAX_SWEEP_VALUES = 50;

type Counters = { trial: number; sweep: number; chart: number; note: number; toast: number };

type LabData = {
  experiment: ExperimentId | null;
  params: Partial<Record<ExperimentId, Params>>;
  trials: Trial[];
  sweeps: Sweep[];
  charts: Chart[];
  notebook: NotebookEntry[];
  counters: Counters;
  watchMode: boolean;
};

type LabTransient = {
  currentTrialId: string | null;
  activeSweepId: string | null;
  sweepProgress: { done: number; total: number } | null;
  /** What the person did since the agent last read the lab state. */
  changes: Change[];
  toasts: Toast[];
  /** Parameter keys the agent changed recently, with the time until which they stay highlighted. */
  highlights: Record<string, number>;
  replayNonce: number;
};

type LabActions = {
  paramsFor: (id: ExperimentId) => Params;
  openExperiment: (id: ExperimentId, actor: Actor) => void;
  setParams: (id: ExperimentId, patch: Record<string, unknown>, actor: Actor) => { params: Params; changed: string[] };
  resetParams: (id: ExperimentId, actor: Actor) => Params;
  runTrial: (id: ExperimentId, actor: Actor, overrides?: Record<string, unknown>, label?: string) => Trial;
  runSweep: (id: ExperimentId, parameter: string, values: unknown[], actor: Actor, opts?: SweepOptions) => Promise<Sweep>;
  runOptimization: (id: ExperimentId, parameter: string, opts: OptimizeOptions, actor: Actor) => Promise<OptimizeResult>;
  cancelSweep: () => boolean;
  showTrial: (trialId: string | null) => void;
  replay: () => void;
  setWatchMode: (on: boolean) => void;
  addNote: (input: {
    author: Actor;
    kind: NoteKind;
    text: string;
    trialId?: string;
    sweepId?: string;
    chartId?: string;
  }) => NotebookEntry;
  updateNote: (id: string, text: string) => void;
  deleteNote: (id: string, actor: Actor) => void;
  addChart: (chart: Omit<Chart, 'id' | 'ts'>) => Chart;
  setChartFit: (id: string, fit: ChartFit, actor: Actor) => void;
  removeChart: (id: string, actor: Actor) => void;
  recordChange: (actor: Actor, text: string, key?: string) => void;
  takeChanges: () => Change[];
  pushToast: (text: string, actor: Actor) => void;
  dismissToast: (id: number) => void;
  highlight: (keys: string[]) => void;
  clearLab: () => void;
};

export type LabStore = LabData & LabTransient & LabActions;

const memory = new Map<string, string>();
const memoryStorage: StateStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
  removeItem: (key) => {
    memory.delete(key);
  },
};

function pickStorage(): StateStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem('__trialbook_probe__');
      return localStorage;
    }
  } catch {
    /* storage blocked: fall back to memory */
  }
  return memoryStorage;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let sweepController: AbortController | null = null;

const initialData: LabData = {
  experiment: 'projectile',
  params: {},
  trials: [],
  sweeps: [],
  charts: [],
  notebook: [],
  counters: { trial: 0, sweep: 0, chart: 0, note: 0, toast: 0 },
  watchMode: true,
};

const initialTransient: LabTransient = {
  currentTrialId: null,
  activeSweepId: null,
  sweepProgress: null,
  changes: [],
  toasts: [],
  highlights: {},
  replayNonce: 0,
};

export const useLab = create<LabStore>()(
  persist(
    (set, get) => {
      const nextId = (kind: keyof Counters): string => {
        const n = get().counters[kind] + 1;
        set((s) => ({ counters: { ...s.counters, [kind]: n } }));
        return `${kind}-${n}`;
      };

      /** Human actions are queued for the agent; agent actions are shown to the human as toasts. */
      const announce = (actor: Actor, text: string, key?: string) => {
        if (actor === 'you') get().recordChange(actor, text, key);
        else get().pushToast(`Agent ${text}`, actor);
      };

      const createTrial = (id: ExperimentId, params: Params, actor: Actor, label?: string, sweepId?: string): Trial => {
        const def = mustDef(id);
        const { measurements, series } = def.run(params);
        const trial: Trial = {
          id: nextId('trial'),
          experiment: id,
          params: { ...params },
          measurements,
          series,
          actor,
          ts: Date.now(),
          ...(sweepId ? { sweepId } : {}),
          ...(label ? { label: clip(label, 60) } : {}),
        };
        set((s) => ({ trials: [...s.trials, trial].slice(-MAX_TRIALS), currentTrialId: trial.id }));
        return trial;
      };

      return {
        ...initialData,
        ...initialTransient,

        paramsFor: (id) => get().params[id] ?? defaultParams(mustDef(id)),

        openExperiment: (id, actor) => {
          const def = mustDef(id);
          if (get().experiment === id) return;
          const latest = [...get().trials].reverse().find((t) => t.experiment === id);
          set((s) => ({
            experiment: id,
            params: { ...s.params, [id]: s.params[id] ?? defaultParams(def) },
            currentTrialId: latest?.id ?? null,
          }));
          announce(actor, `opened the ${def.title} experiment`);
        },

        setParams: (id, patch, actor) => {
          const def = mustDef(id);
          const { values, errors } = validatePatch(def, patch);
          if (errors.length) throw new Error(errors.join(' '));
          const current = get().paramsFor(id);
          const changed = Object.keys(values).filter((key) => values[key] !== current[key]);
          if (changed.length === 0) return { params: current, changed };
          const next = { ...current, ...values };
          set((s) => ({ params: { ...s.params, [id]: next } }));
          for (const key of changed) {
            const spec = def.params.find((p) => p.key === key);
            const unit = spec?.kind === 'number' && spec.unit ? ` ${spec.unit}` : '';
            announce(actor, `set ${key} to ${next[key]}${unit}`, `set:${key}`);
          }
          if (actor === 'agent') get().highlight(changed);
          return { params: next, changed };
        },

        resetParams: (id, actor) => {
          const def = mustDef(id);
          const next = defaultParams(def);
          set((s) => ({ params: { ...s.params, [id]: next } }));
          announce(actor, `reset the ${def.title} parameters to their defaults`);
          if (actor === 'agent') get().highlight(Object.keys(next));
          return next;
        },

        runTrial: (id, actor, overrides, label) => {
          let params = get().paramsFor(id);
          if (overrides && Object.keys(overrides).length > 0) params = get().setParams(id, overrides, actor).params;
          const trial = createTrial(id, params, actor, label);
          announce(actor, `ran ${trial.id}: ${formatMeasurements(mustDef(id), trial.measurements)}`);
          return trial;
        },

        runSweep: async (id, parameter, values, actor, opts = {}) => {
          const def = mustDef(id);
          const spec = def.params.find((p) => p.key === parameter);
          if (!spec) {
            throw new Error(`Unknown parameter "${parameter}". Valid parameters: ${def.params.map((p) => p.key).join(', ')}.`);
          }
          if (values.length === 0) throw new Error('Provide at least one value to sweep.');
          if (values.length > MAX_SWEEP_VALUES) {
            throw new Error(`A sweep can run at most ${MAX_SWEEP_VALUES} values; you asked for ${values.length}.`);
          }
          const validated: ParamValue[] = [];
          for (const value of values) {
            const { values: ok, errors } = validatePatch(def, { [parameter]: value });
            if (errors.length) throw new Error(errors.join(' '));
            validated.push(ok[parameter]);
          }
          if (get().activeSweepId) throw new Error('Another sweep is still running. Wait for it to finish or cancel it first.');

          const controller = new AbortController();
          sweepController = controller;
          opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });

          const sweepId = nextId('sweep');
          const base = get().paramsFor(id);
          const sweep: Sweep = {
            id: sweepId,
            experiment: id,
            parameter,
            values: validated,
            trialIds: [],
            actor,
            ts: Date.now(),
            status: 'running',
            ...(opts.label ? { label: clip(opts.label, 60) } : {}),
          };
          set((s) => ({
            sweeps: [...s.sweeps, sweep],
            activeSweepId: sweepId,
            sweepProgress: { done: 0, total: validated.length },
          }));
          announce(actor, `started ${sweepId}: ${parameter} over ${validated.length} values`);

          const pause = opts.watch ? Math.max(120, Math.min(600, 4000 / validated.length)) : 0;
          let status: SweepStatus = 'done';
          let error: string | undefined;
          try {
            for (let i = 0; i < validated.length; i++) {
              if (controller.signal.aborted) {
                status = 'cancelled';
                break;
              }
              const trial = createTrial(id, { ...base, [parameter]: validated[i] }, actor, undefined, sweepId);
              set((s) => ({
                sweeps: s.sweeps.map((w) => (w.id === sweepId ? { ...w, trialIds: [...w.trialIds, trial.id] } : w)),
                sweepProgress: { done: i + 1, total: validated.length },
              }));
              if (pause) await sleep(pause);
              else if (i % 4 === 3) await sleep(0);
            }
          } catch (err) {
            status = 'failed';
            error = err instanceof Error ? err.message : String(err);
          }
          set((s) => ({
            sweeps: s.sweeps.map((w) => (w.id === sweepId ? { ...w, status, ...(error ? { error } : {}) } : w)),
            activeSweepId: null,
            sweepProgress: null,
          }));
          sweepController = null;
          const finished = get().sweeps.find((w) => w.id === sweepId)!;
          announce(actor, `${status === 'done' ? 'finished' : status} ${sweepId} (${finished.trialIds.length} trials)`);
          return finished;
        },

        runOptimization: async (id, parameter, opts, actor) => {
          const def = mustDef(id);
          const spec = def.params.find((p) => p.key === parameter);
          if (!spec) throw new Error(`Unknown parameter "${parameter}". Valid parameters: ${def.params.map((p) => p.key).join(', ')}.`);
          if (spec.kind !== 'number') {
            throw new Error(`${parameter} is a choice (${spec.options.join(', ')}), not a number. Use sweep_parameter to compare its options.`);
          }
          const mSpec = def.measurements.find((m) => m.key === opts.measurement);
          if (!mSpec) throw new Error(`measurement must be one of ${def.measurements.map((m) => m.key).join(', ')}.`);
          const lo0 = opts.from ?? spec.min;
          const hi0 = opts.to ?? spec.max;
          if (!Number.isFinite(lo0) || !Number.isFinite(hi0) || lo0 < spec.min || hi0 > spec.max || lo0 >= hi0) {
            throw new Error(`from and to must satisfy ${spec.min} <= from < to <= ${spec.max} for ${parameter}.`);
          }
          const tolerance = Math.max((hi0 - lo0) / 1e6, opts.tolerance ?? (hi0 - lo0) / 100);
          const maxTrials = Math.min(30, Math.max(4, Math.round(opts.maxTrials ?? 20)));
          if (get().activeSweepId) throw new Error('Another sweep is still running. Wait for it to finish or cancel it first.');

          const controller = new AbortController();
          sweepController = controller;
          opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });
          const sweepId = nextId('sweep');
          const base = get().paramsFor(id);
          const sweep: Sweep = {
            id: sweepId,
            experiment: id,
            parameter,
            values: [],
            trialIds: [],
            actor,
            ts: Date.now(),
            status: 'running',
            kind: 'optimize',
            label: clip(opts.label ?? `${opts.goal === 'max' ? 'maximise' : 'minimise'} ${opts.measurement}`, 60),
          };
          set((s) => ({ sweeps: [...s.sweeps, sweep], activeSweepId: sweepId, sweepProgress: { done: 0, total: maxTrials } }));
          announce(actor, `started ${sweepId}: searching ${parameter} to ${opts.goal === 'max' ? 'maximise' : 'minimise'} ${opts.measurement}`);

          const pause = opts.watch === false ? 0 : 150;
          const evaluated: Trial[] = [];
          const evaluate = async (x: number): Promise<Trial> => {
            const value = Number(x.toPrecision(8));
            const trial = createTrial(id, { ...base, [parameter]: value }, actor, undefined, sweepId);
            evaluated.push(trial);
            set((s) => ({
              sweeps: s.sweeps.map((w) => (w.id === sweepId ? { ...w, values: [...w.values, value], trialIds: [...w.trialIds, trial.id] } : w)),
              sweepProgress: { done: evaluated.length, total: maxTrials },
            }));
            if (pause) await sleep(pause);
            else if (evaluated.length % 4 === 0) await sleep(0);
            return trial;
          };
          const score = (t: Trial) => {
            const v = t.measurements[opts.measurement];
            if (!Number.isFinite(v)) return Number.NEGATIVE_INFINITY;
            return opts.goal === 'max' ? v : -v;
          };

          let lo = lo0;
          let hi = hi0;
          let status: SweepStatus = 'done';
          let error: string | undefined;
          try {
            const phi = (Math.sqrt(5) - 1) / 2;
            await evaluate(lo);
            await evaluate(hi);
            let c = hi - phi * (hi - lo);
            let d = lo + phi * (hi - lo);
            let tc = await evaluate(c);
            let td = await evaluate(d);
            while (hi - lo > tolerance && evaluated.length < maxTrials) {
              if (controller.signal.aborted) {
                status = 'cancelled';
                break;
              }
              if (score(tc) > score(td)) {
                hi = d;
                d = c;
                td = tc;
                c = hi - phi * (hi - lo);
                tc = await evaluate(c);
              } else {
                lo = c;
                c = d;
                tc = td;
                d = lo + phi * (hi - lo);
                td = await evaluate(d);
              }
            }
          } catch (err) {
            status = 'failed';
            error = err instanceof Error ? err.message : String(err);
          }
          set((s) => ({
            sweeps: s.sweeps.map((w) => (w.id === sweepId ? { ...w, status, ...(error ? { error } : {}) } : w)),
            activeSweepId: null,
            sweepProgress: null,
          }));
          sweepController = null;

          let best: Trial | null = null;
          for (const t of evaluated) if (!best || score(t) > score(best)) best = t;
          const bestX = best ? Number(best.params[parameter]) : Number.NaN;
          const atBound = !best ? null : bestX - lo0 <= tolerance ? 'low' : hi0 - bestX <= tolerance ? 'high' : null;
          const finished = get().sweeps.find((w) => w.id === sweepId)!;
          announce(
            actor,
            `${status === 'done' ? 'finished' : status} ${sweepId} after ${evaluated.length} trials${best ? `: best ${parameter} ${bestX}` : ''}`,
          );
          return { sweep: finished, best, bracket: [lo, hi], tolerance, trialsUsed: evaluated.length, converged: hi - lo <= tolerance, atBound };
        },

        cancelSweep: () => {
          if (!sweepController) return false;
          sweepController.abort();
          return true;
        },

        showTrial: (trialId) => set({ currentTrialId: trialId }),
        replay: () => set((s) => ({ replayNonce: s.replayNonce + 1 })),
        setWatchMode: (on) => set({ watchMode: on }),

        addNote: (input) => {
          const state = get();
          const experiment = state.experiment;
          const entry: NotebookEntry = {
            id: nextId('note'),
            ts: Date.now(),
            author: input.author,
            kind: input.kind,
            text: input.text.trim().slice(0, 4000),
            experiment,
            ...(experiment && EXPERIMENTS[experiment] ? { params: { ...state.paramsFor(experiment) } } : {}),
            ...(input.trialId ? { trialId: input.trialId } : {}),
            ...(input.sweepId ? { sweepId: input.sweepId } : {}),
            ...(input.chartId ? { chartId: input.chartId } : {}),
          };
          set((s) => ({ notebook: [...s.notebook, entry] }));
          announce(input.author, `added a ${input.kind} to the notebook: "${clip(entry.text, 80)}"`);
          return entry;
        },

        updateNote: (id, text) => {
          set((s) => ({
            notebook: s.notebook.map((n) => (n.id === id ? { ...n, text: text.trim().slice(0, 4000), edited: true } : n)),
          }));
          get().recordChange('you', `edited notebook entry ${id}`);
        },

        deleteNote: (id, actor) => {
          set((s) => ({ notebook: s.notebook.filter((n) => n.id !== id) }));
          announce(actor, `deleted notebook entry ${id}`);
        },

        addChart: (chart) => {
          const full: Chart = { ...chart, id: nextId('chart'), ts: Date.now() };
          set((s) => ({ charts: [...s.charts, full] }));
          announce(chart.actor, `plotted "${chart.title}"`);
          return full;
        },

        setChartFit: (id, fit, actor) => {
          set((s) => ({ charts: s.charts.map((c) => (c.id === id ? { ...c, fit } : c)) }));
          announce(actor, `fitted ${fit.equation} to ${id}`);
        },

        removeChart: (id, actor) => {
          set((s) => ({ charts: s.charts.filter((c) => c.id !== id) }));
          announce(actor, `removed chart ${id}`);
        },

        recordChange: (actor, text, key) =>
          set((s) => {
            const now = Date.now();
            const entry: Change = { ts: now, actor, text, ...(key ? { key } : {}) };
            const last = s.changes[s.changes.length - 1];
            if (last && key && last.key === key && now - last.ts < 3000) {
              return { changes: [...s.changes.slice(0, -1), entry] };
            }
            return { changes: [...s.changes, entry].slice(-MAX_CHANGES) };
          }),

        takeChanges: () => {
          const pending = get().changes;
          if (pending.length) set({ changes: [] });
          return pending;
        },

        pushToast: (text, actor) => {
          const id = get().counters.toast + 1;
          set((s) => ({
            counters: { ...s.counters, toast: id },
            toasts: [...s.toasts, { id, text, actor, ts: Date.now() }].slice(-MAX_TOASTS),
          }));
          if (typeof window !== 'undefined') setTimeout(() => get().dismissToast(id), 6000);
        },

        dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

        highlight: (keys) =>
          set((s) => {
            const until = Date.now() + HIGHLIGHT_MS;
            const highlights = { ...s.highlights };
            for (const key of keys) highlights[key] = until;
            return { highlights };
          }),

        clearLab: () => set({ trials: [], sweeps: [], charts: [], notebook: [], currentTrialId: null, changes: [] }),
      };
    },
    {
      name: 'trialbook-lab-v1',
      version: 1,
      storage: createJSONStorage(pickStorage),
      partialize: (s) => ({
        experiment: s.experiment,
        params: s.params,
        trials: s.trials,
        sweeps: s.sweeps,
        charts: s.charts,
        notebook: s.notebook,
        counters: s.counters,
        watchMode: s.watchMode,
      }),
    },
  ),
);

/** Repairs state after hydration: a sweep cannot survive a reload, and the open experiment must exist. */
export function bootLab(): void {
  useLab.setState((s) => {
    const experiment = s.experiment && EXPERIMENTS[s.experiment] ? s.experiment : 'projectile';
    const latest = [...s.trials].reverse().find((t) => t.experiment === experiment);
    return {
      experiment,
      sweeps: s.sweeps.map((w) => (w.status === 'running' ? { ...w, status: 'cancelled' as const } : w)),
      activeSweepId: null,
      sweepProgress: null,
      currentTrialId: latest?.id ?? null,
    };
  });
}
