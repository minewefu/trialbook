import { round } from '../lib/format';

export type ExperimentId = 'projectile' | 'pendulum' | 'predator_prey';

export type ParamValue = number | string;
export type Params = Record<string, ParamValue>;
export type Measurements = Record<string, number>;
export type SeriesPoint = Record<string, number>;

export type NumberParamSpec = {
  kind: 'number';
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  description: string;
  presets?: { label: string; value: number }[];
};

export type EnumParamSpec = {
  kind: 'enum';
  key: string;
  label: string;
  options: readonly string[];
  default: string;
  description: string;
};

export type ParamSpec = NumberParamSpec | EnumParamSpec;

export type MeasurementSpec = { key: string; label: string; unit: string; description: string };

export type TrialResult = { measurements: Measurements; series: SeriesPoint[] };

export type ExperimentDef = {
  id: ExperimentId;
  title: string;
  summary: string;
  /** Keys present on every series point, e.g. t, x, y for a trajectory. */
  seriesKeys: string[];
  params: ParamSpec[];
  measurements: MeasurementSpec[];
  /** Pure and deterministic: runs the simulation headless and returns measurements plus a downsampled series. */
  run: (params: Params) => TrialResult;
  /** One or two sentences of domain guidance the agent sees in tool descriptions. */
  agentGuidance: string;
};

export function defaultParams(def: ExperimentDef): Params {
  const out: Params = {};
  for (const spec of def.params) out[spec.key] = spec.default;
  return out;
}

export function describeParam(spec: ParamSpec): string {
  return spec.kind === 'number'
    ? `${spec.key} (${spec.min} to ${spec.max}${spec.unit ? ' ' + spec.unit : ''})`
    : `${spec.key} (one of ${spec.options.join(', ')})`;
}

/** Strict validation: unknown keys, out-of-range numbers and unknown options are errors, never silently clamped. */
export function validatePatch(
  def: ExperimentDef,
  patch: Record<string, unknown>,
): { values: Params; errors: string[] } {
  const values: Params = {};
  const errors: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    const spec = def.params.find((p) => p.key === key);
    if (!spec) {
      errors.push(`Unknown parameter "${key}". Valid parameters: ${def.params.map(describeParam).join('; ')}.`);
      continue;
    }
    if (raw === undefined || raw === null) continue;
    if (spec.kind === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        errors.push(`${key} must be a number between ${spec.min} and ${spec.max} ${spec.unit}.`.trim());
        continue;
      }
      if (n < spec.min || n > spec.max) {
        errors.push(`${key} = ${n} is outside the allowed range ${spec.min} to ${spec.max} ${spec.unit}.`.trim());
        continue;
      }
      values[key] = n;
    } else {
      const s = String(raw).trim().toLowerCase();
      if (!spec.options.includes(s)) {
        errors.push(`${key} must be one of ${spec.options.join(', ')} (got "${String(raw)}").`);
        continue;
      }
      values[key] = s;
    }
  }
  return { values, errors };
}

export function formatMeasurements(def: ExperimentDef, m: Measurements): string {
  return def.measurements
    .filter((spec) => m[spec.key] !== undefined)
    .map((spec) =>
      Number.isFinite(m[spec.key])
        ? `${spec.label.toLowerCase()} ${round(m[spec.key], 3)} ${spec.unit}`.trim()
        : `${spec.label.toLowerCase()} n/a`,
    )
    .join(', ');
}

export function summarizeParams(def: ExperimentDef, params: Params): string {
  return def.params
    .map((spec) =>
      spec.kind === 'number'
        ? `${spec.label.toLowerCase()} ${params[spec.key]} ${spec.unit}`.trim()
        : `${spec.label.toLowerCase()} ${params[spec.key]}`,
    )
    .join(' · ');
}
