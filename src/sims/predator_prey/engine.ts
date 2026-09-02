import type { Params, SeriesPoint, TrialResult } from '../types';

export type PredatorPreyParams = {
  prey_growth: number;
  predation: number;
  predator_efficiency: number;
  predator_death: number;
  initial_prey: number;
  initial_predators: number;
  duration: number;
};

const DT = 0.005;
const SERIES_POINTS = 300;

/** The conserved quantity of the Lotka–Volterra system; used to check integration accuracy. */
export function invariant(p: PredatorPreyParams, prey: number, predators: number): number {
  return p.predator_efficiency * prey - p.predator_death * Math.log(prey) + p.predation * predators - p.prey_growth * Math.log(predators);
}

/**
 * Fourth-order Runge–Kutta integration of the Lotka–Volterra equations
 *   prey' = a·prey − b·prey·predators,  predators' = d·prey·predators − g·predators.
 * Measures the population extremes, the time averages (which theory says equal the equilibrium
 * g/d and a/b), and the oscillation period from successive prey peaks.
 */
export function integratePredatorPrey(p: PredatorPreyParams): TrialResult {
  const a = p.prey_growth;
  const b = p.predation;
  const d = p.predator_efficiency;
  const g = p.predator_death;
  const fx = (x: number, y: number) => a * x - b * x * y;
  const fy = (x: number, y: number) => d * x * y - g * y;
  const steps = Math.ceil(p.duration / DT);
  const every = Math.max(1, Math.floor(steps / SERIES_POINTS));

  let x = p.initial_prey;
  let y = p.initial_predators;
  let maxX = x;
  let minX = x;
  let maxY = y;
  let minY = y;
  let sumX = 0;
  let sumY = 0;
  let prevSlope = fx(x, y);
  const peakTimes: number[] = [];
  const series: SeriesPoint[] = [{ t: 0, prey: x, predators: y }];

  for (let i = 1; i <= steps; i++) {
    const k1x = fx(x, y);
    const k1y = fy(x, y);
    const k2x = fx(x + 0.5 * DT * k1x, y + 0.5 * DT * k1y);
    const k2y = fy(x + 0.5 * DT * k1x, y + 0.5 * DT * k1y);
    const k3x = fx(x + 0.5 * DT * k2x, y + 0.5 * DT * k2y);
    const k3y = fy(x + 0.5 * DT * k2x, y + 0.5 * DT * k2y);
    const k4x = fx(x + DT * k3x, y + DT * k3y);
    const k4y = fy(x + DT * k3x, y + DT * k3y);
    x += (DT / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    y += (DT / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    const t = i * DT;

    if (x > maxX) maxX = x;
    if (x < minX) minX = x;
    if (y > maxY) maxY = y;
    if (y < minY) minY = y;
    sumX += x * DT;
    sumY += y * DT;
    const slope = fx(x, y);
    if (prevSlope > 0 && slope <= 0) peakTimes.push(t);
    prevSlope = slope;
    if (i % every === 0) series.push({ t, prey: x, predators: y });
  }

  const period =
    peakTimes.length >= 2 ? (peakTimes[peakTimes.length - 1] - peakTimes[0]) / (peakTimes.length - 1) : Number.NaN;
  return {
    measurements: {
      peak_prey: maxX,
      min_prey: minX,
      peak_predators: maxY,
      min_predators: minY,
      oscillation_period: period,
      mean_prey: sumX / p.duration,
      mean_predators: sumY / p.duration,
    },
    series,
  };
}

function coerce(params: Params): PredatorPreyParams {
  const num = (key: string, fallback: number) => {
    const v = Number(params[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    prey_growth: num('prey_growth', 1),
    predation: num('predation', 0.1),
    predator_efficiency: num('predator_efficiency', 0.05),
    predator_death: num('predator_death', 0.5),
    initial_prey: num('initial_prey', 20),
    initial_predators: num('initial_predators', 5),
    duration: num('duration', 60),
  };
}

export function runPredatorPrey(params: Params): TrialResult {
  return integratePredatorPrey(coerce(params));
}
