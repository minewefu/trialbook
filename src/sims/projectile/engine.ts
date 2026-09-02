import type { Params, SeriesPoint, TrialResult } from '../types';

export type DragLevel = 'none' | 'light' | 'heavy';

/**
 * Quadratic drag coefficient k in 1/m, so that acceleration = -k · |v| · v.
 * "light" is roughly a baseball (k ≈ ρ·Cd·A / 2m ≈ 0.005 per metre); "heavy" is a light foam ball.
 */
export const DRAG_COEFFICIENT: Record<DragLevel, number> = { none: 0, light: 0.005, heavy: 0.02 };

export type ProjectileParams = {
  speed: number;
  angle: number;
  height: number;
  gravity: number;
  drag: DragLevel;
};

const SERIES_POINTS = 160;
const DT = 0.001;
const MAX_STEPS = 4_000_000;

/** Closed-form solution without drag. Exact, so it is the reference the integrator is tested against. */
export function analyticProjectile(p: ProjectileParams): TrialResult {
  const rad = (p.angle * Math.PI) / 180;
  const vx = p.speed * Math.cos(rad);
  const vy = p.speed * Math.sin(rad);
  const g = p.gravity;
  const flight = (vy + Math.sqrt(vy * vy + 2 * g * p.height)) / g;
  const range = vx * flight;
  const maxHeight = vy > 0 ? p.height + (vy * vy) / (2 * g) : p.height;
  const impact = Math.sqrt(p.speed * p.speed + 2 * g * p.height);
  const n = flight > 0 ? SERIES_POINTS : 1;
  const series: SeriesPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (flight * i) / (n - 1);
    series.push({ t, x: vx * t, y: Math.max(0, p.height + vy * t - 0.5 * g * t * t) });
  }
  return {
    measurements: { range_m: range, flight_time_s: flight, max_height_m: maxHeight, impact_speed_mps: impact },
    series,
  };
}

/** Semi-implicit Euler integration with quadratic drag. Interpolates the ground crossing for accuracy. */
export function integrateProjectile(p: ProjectileParams, k: number, dt = DT): TrialResult {
  const rad = (p.angle * Math.PI) / 180;
  let x = 0;
  let y = p.height;
  let vx = p.speed * Math.cos(rad);
  let vy = p.speed * Math.sin(rad);
  let t = 0;
  let maxY = y;
  // Drag only shortens the flight, so the no-drag flight time bounds the number of steps to record.
  const estimate = analyticProjectile(p).measurements.flight_time_s;
  const every = Math.max(1, Math.floor(estimate / dt / SERIES_POINTS));
  const series: SeriesPoint[] = [{ t: 0, x: 0, y }];

  for (let i = 1; i <= MAX_STEPS; i++) {
    const v = Math.hypot(vx, vy);
    vx += -k * v * vx * dt;
    vy += (-p.gravity - k * v * vy) * dt;
    const nx = x + vx * dt;
    const ny = y + vy * dt;
    t += dt;
    if (ny > maxY) maxY = ny;
    if (ny < 0) {
      const f = y / (y - ny);
      const xi = x + (nx - x) * f;
      const ti = t - dt + dt * f;
      series.push({ t: ti, x: xi, y: 0 });
      return {
        measurements: { range_m: xi, flight_time_s: ti, max_height_m: maxY, impact_speed_mps: Math.hypot(vx, vy) },
        series,
      };
    }
    x = nx;
    y = ny;
    if (i % every === 0) series.push({ t, x, y });
  }
  throw new Error('The projectile did not land within the simulation limit. Lower the speed or raise gravity.');
}

function coerce(params: Params): ProjectileParams {
  const num = (key: string, fallback: number) => {
    const v = Number(params[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  const drag = String(params.drag ?? 'none') as DragLevel;
  return {
    speed: num('speed', 30),
    angle: num('angle', 45),
    height: num('height', 0),
    gravity: num('gravity', 9.81),
    drag: drag in DRAG_COEFFICIENT ? drag : 'none',
  };
}

/** Entry point used by the experiment definition: exact solution without drag, integrator with drag. */
export function runProjectile(params: Params): TrialResult {
  const p = coerce(params);
  const k = DRAG_COEFFICIENT[p.drag];
  return k === 0 ? analyticProjectile(p) : integrateProjectile(p, k);
}
