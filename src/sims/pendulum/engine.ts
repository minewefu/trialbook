import type { Params, SeriesPoint, TrialResult } from '../types';

export type DampingLevel = 'none' | 'light' | 'heavy';

/** Damping coefficient b in 1/s: angular acceleration = -(g/L) sin θ - b · ω. */
export const DAMPING_COEFFICIENT: Record<DampingLevel, number> = { none: 0, light: 0.1, heavy: 0.8 };

export type PendulumParams = { length: number; amplitude: number; gravity: number; damping: DampingLevel };

const DT = 0.002;
const WATCH_POINTS = 400;
const WATCH_PERIODS = 6;
const MAX_HORIZON = 600;

/** Complete elliptic integral of the first kind K(k), by the arithmetic-geometric mean. */
export function ellipticK(k: number): number {
  let a = 1;
  let b = Math.sqrt(1 - k * k);
  for (let i = 0; i < 60 && Math.abs(a - b) > 1e-15; i++) {
    const next = (a + b) / 2;
    b = Math.sqrt(a * b);
    a = next;
  }
  return Math.PI / (2 * a);
}

/** Exact period of an undamped pendulum released from rest at `amplitudeRad`. */
export function exactPeriod(length: number, gravity: number, amplitudeRad: number): number {
  return 4 * Math.sqrt(length / gravity) * ellipticK(Math.sin(amplitudeRad / 2));
}

/** The textbook small-angle period 2π√(L/g). */
export function smallAnglePeriod(length: number, gravity: number): number {
  return 2 * Math.PI * Math.sqrt(length / gravity);
}

/**
 * Fourth-order Runge–Kutta integration of the full nonlinear pendulum with viscous damping.
 * Measures the period from the first two downward zero crossings, the peak bob speed, and the time
 * for the amplitude to decay to 1/e of its starting value.
 */
export function integratePendulum(p: PendulumParams): TrialResult {
  const g = p.gravity;
  const L = p.length;
  const b = DAMPING_COEFFICIENT[p.damping];
  const theta0 = (p.amplitude * Math.PI) / 180;
  const T0 = smallAnglePeriod(L, g);
  const Tref = exactPeriod(L, g, theta0);
  const horizon = Math.min(MAX_HORIZON, Math.max(4 * Tref, b > 0 ? Math.min(10 / b, 30 * Tref) : 0));
  const watchWindow = Math.min(horizon, WATCH_PERIODS * Tref);
  const steps = Math.ceil(horizon / DT);
  const every = Math.max(1, Math.floor(watchWindow / DT / WATCH_POINTS));

  const f = (theta: number, omega: number) => -(g / L) * Math.sin(theta) - b * omega;
  let theta = theta0;
  let omega = 0;
  let maxSpeed = 0;
  const crossings: number[] = [];
  let decayTime = Number.NaN;
  const series: SeriesPoint[] = [{ t: 0, angle: p.amplitude, omega: 0 }];

  for (let i = 1; i <= steps; i++) {
    const k1t = omega;
    const k1o = f(theta, omega);
    const k2t = omega + 0.5 * DT * k1o;
    const k2o = f(theta + 0.5 * DT * k1t, omega + 0.5 * DT * k1o);
    const k3t = omega + 0.5 * DT * k2o;
    const k3o = f(theta + 0.5 * DT * k2t, omega + 0.5 * DT * k2o);
    const k4t = omega + DT * k3o;
    const k4o = f(theta + DT * k3t, omega + DT * k3o);
    const nextTheta = theta + (DT / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    const nextOmega = omega + (DT / 6) * (k1o + 2 * k2o + 2 * k3o + k4o);
    const t = i * DT;

    if (theta > 0 && nextTheta <= 0 && crossings.length < 2) crossings.push(t - DT + DT * (theta / (theta - nextTheta)));
    const turning = (omega > 0 && nextOmega <= 0) || (omega < 0 && nextOmega >= 0);
    if (turning && b > 0 && Number.isNaN(decayTime) && Math.abs(nextTheta) <= theta0 / Math.E) decayTime = t;
    const speed = Math.abs(nextOmega) * L;
    if (speed > maxSpeed) maxSpeed = speed;

    theta = nextTheta;
    omega = nextOmega;
    if (t <= watchWindow + 1e-9 && i % every === 0) series.push({ t, angle: (theta * 180) / Math.PI, omega });
  }

  const period = crossings.length >= 2 ? crossings[1] - crossings[0] : Number.NaN;
  return {
    measurements: {
      period_s: period,
      small_angle_period_s: T0,
      period_deviation_pct: Number.isFinite(period) ? ((period - T0) / T0) * 100 : Number.NaN,
      max_speed_mps: maxSpeed,
      decay_time_s: decayTime,
    },
    series,
  };
}

function coerce(params: Params): PendulumParams {
  const num = (key: string, fallback: number) => {
    const v = Number(params[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  const damping = String(params.damping ?? 'none').toLowerCase() as DampingLevel;
  return {
    length: num('length', 1),
    amplitude: num('amplitude', 20),
    gravity: num('gravity', 9.81),
    damping: damping in DAMPING_COEFFICIENT ? damping : 'none',
  };
}

export function runPendulum(params: Params): TrialResult {
  return integratePendulum(coerce(params));
}
