import type { Params, SeriesPoint, TrialResult } from '../types';

export type RcMode = 'charge' | 'discharge';

export type RcParams = {
  /** kilo-ohms */
  resistance: number;
  /** microfarads */
  capacitance: number;
  /** volts */
  supply_voltage: number;
  mode: RcMode;
  /** seconds */
  duration: number;
};

const SERIES_POINTS = 400;

/** Capacitor voltage at time t for the exact first-order RC solution. */
export function capacitorVoltage(p: RcParams, t: number): number {
  const tau = p.resistance * 1e3 * p.capacitance * 1e-6;
  return p.mode === 'charge' ? p.supply_voltage * (1 - Math.exp(-t / tau)) : p.supply_voltage * Math.exp(-t / tau);
}

/** Circuit current in milliamps at time t. */
export function circuitCurrent(p: RcParams, t: number): number {
  const R = p.resistance * 1e3;
  const v = capacitorVoltage(p, t);
  return ((p.mode === 'charge' ? p.supply_voltage - v : v) / R) * 1e3;
}

/** Time at which the voltage crosses `target`, found by bisection on the exact curve; NaN if never within the duration. */
function crossingTime(p: RcParams, target: number): number {
  const v0 = capacitorVoltage(p, 0);
  const vEnd = capacitorVoltage(p, p.duration);
  const rising = vEnd >= v0;
  const reached = rising ? vEnd >= target && v0 <= target : vEnd <= target && v0 >= target;
  if (!reached) return Number.NaN;
  let lo = 0;
  let hi = p.duration;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const v = capacitorVoltage(p, mid);
    if ((rising && v < target) || (!rising && v > target)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The exact solution of dV/dt = (V_supply − V)/RC (charging) or −V/RC (discharging), sampled for
 * the stage, with the time constant measured the way a student would: the time to reach 63.2% of the
 * final change, and the half-time. The R·C product is reported separately as the theoretical value.
 */
export function simulateRc(p: RcParams): TrialResult {
  const R = p.resistance * 1e3;
  const C = p.capacitance * 1e-6;
  const tau = R * C;
  const V0 = p.supply_voltage;
  const series: SeriesPoint[] = [];
  for (let i = 0; i <= SERIES_POINTS; i++) {
    const t = (p.duration * i) / SERIES_POINTS;
    series.push({ t, voltage: capacitorVoltage(p, t), current: circuitCurrent(p, t) });
  }
  const e1 = Math.exp(-1);
  const tauTarget = p.mode === 'charge' ? V0 * (1 - e1) : V0 * e1;
  const halfTarget = V0 / 2;
  const finalVoltage = capacitorVoltage(p, p.duration);
  return {
    measurements: {
      time_constant_s: crossingTime(p, tauTarget),
      rc_product_s: tau,
      half_time_s: crossingTime(p, halfTarget),
      final_voltage_v: finalVoltage,
      initial_current_ma: (V0 / R) * 1e3,
      energy_stored_mj: 0.5 * C * finalVoltage * finalVoltage * 1e3,
    },
    series,
  };
}

function coerce(params: Params): RcParams {
  const num = (key: string, fallback: number) => {
    const v = Number(params[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  const mode = String(params.mode ?? 'charge').toLowerCase();
  return {
    resistance: num('resistance', 10),
    capacitance: num('capacitance', 100),
    supply_voltage: num('supply_voltage', 9),
    mode: mode === 'discharge' ? 'discharge' : 'charge',
    duration: num('duration', 5),
  };
}

export function runRc(params: Params): TrialResult {
  return simulateRc(coerce(params));
}
