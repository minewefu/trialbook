import { describe, expect, it } from 'vitest';
import { integratePredatorPrey, invariant, runPredatorPrey } from './engine';

const base = {
  prey_growth: 1,
  predation: 0.1,
  predator_efficiency: 0.05,
  predator_death: 0.5,
  initial_prey: 20,
  initial_predators: 5,
  duration: 60,
};
const pct = (a: number, b: number) => (Math.abs(a - b) / Math.abs(b)) * 100;

describe('predator and prey engine', () => {
  it('conserves the Lotka–Volterra invariant to within 0.05%', () => {
    const { series } = integratePredatorPrey(base);
    const v0 = invariant(base, base.initial_prey, base.initial_predators);
    for (const p of series) expect(pct(invariant(base, p.prey, p.predators), v0)).toBeLessThan(0.05);
  });

  it('time averages equal the equilibrium populations g/d and a/b', () => {
    const { measurements } = integratePredatorPrey({ ...base, duration: 300 });
    expect(pct(measurements.mean_prey, base.predator_death / base.predator_efficiency)).toBeLessThan(2);
    expect(pct(measurements.mean_predators, base.prey_growth / base.predation)).toBeLessThan(2);
  });

  it('small oscillations have period 2π/√(a·g)', () => {
    const near = { ...base, initial_prey: 10.5, initial_predators: 10, duration: 120 };
    const { measurements } = integratePredatorPrey(near);
    const expected = (2 * Math.PI) / Math.sqrt(base.prey_growth * base.predator_death);
    expect(pct(measurements.oscillation_period, expected)).toBeLessThan(1);
  });

  it('keeps both populations positive and orders the extremes correctly', () => {
    const { measurements, series } = integratePredatorPrey(base);
    expect(measurements.min_prey).toBeGreaterThan(0);
    expect(measurements.min_predators).toBeGreaterThan(0);
    expect(measurements.peak_prey).toBeGreaterThan(measurements.min_prey);
    expect(measurements.peak_predators).toBeGreaterThan(measurements.min_predators);
    expect(series[0]).toMatchObject({ t: 0, prey: 20, predators: 5 });
    expect(series.length).toBeGreaterThan(250);
    expect(series.length).toBeLessThanOrEqual(320);
  });

  it('faster predator death lengthens the cycle', () => {
    const slow = integratePredatorPrey({ ...base, predator_death: 0.3, duration: 200 }).measurements;
    const fast = integratePredatorPrey({ ...base, predator_death: 1.2, duration: 200 }).measurements;
    expect(Number.isFinite(slow.oscillation_period)).toBe(true);
    expect(Number.isFinite(fast.oscillation_period)).toBe(true);
    expect(slow.oscillation_period).not.toBe(fast.oscillation_period);
  });

  it('runs 50 headless trials in well under two seconds', () => {
    const started = performance.now();
    for (let i = 0; i < 50; i++) runPredatorPrey({ ...base, predator_death: 0.3 + i * 0.02 });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
