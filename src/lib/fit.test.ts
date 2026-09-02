import { describe, expect, it } from 'vitest';
import { runPendulum } from '../sims/pendulum/engine';
import { runProjectile } from '../sims/projectile/engine';
import { runPredatorPrey } from '../sims/predator_prey/engine';
import { equationFor, evaluate, fitAuto, fitModel, readingFor } from './fit';
import { linspace } from './format';

describe('least-squares fits', () => {
  it('recovers an exact line and an exact parabola', () => {
    const line = fitModel([1, 2, 3, 4, 5].map((x) => ({ x, y: 3 - 2 * x })), 'linear');
    expect(line.params.a).toBeCloseTo(3, 9);
    expect(line.params.b).toBeCloseTo(-2, 9);
    expect(line.r2).toBeCloseTo(1, 9);
    const parabola = fitModel([50, 80, 110, 140, 170, 200].map((x) => ({ x, y: 1 + 0.5 * x - 0.02 * x * x })), 'quadratic');
    expect(parabola.params.a).toBeCloseTo(1, 6);
    expect(parabola.params.b).toBeCloseTo(0.5, 6);
    expect(parabola.params.c).toBeCloseTo(-0.02, 6);
  });

  it('finds the square-root law of the pendulum from a length sweep', () => {
    const points = linspace(0.25, 4, 8).map((length) => ({
      x: length,
      y: runPendulum({ length, amplitude: 5, gravity: 9.81, damping: 'none' }).measurements.period_s,
    }));
    const fit = fitModel(points, 'power');
    expect(fit.params.p).toBeCloseTo(0.5, 2);
    expect(fit.params.A).toBeCloseTo((2 * Math.PI) / Math.sqrt(9.81), 2);
    expect(fit.r2).toBeGreaterThan(0.9999);
    const { best, candidates } = fitAuto(points);
    expect(best.model).toBe('power');
    expect(candidates.power).toBeGreaterThan(0.999);
    expect(equationFor(fit, 'length', 'period_s')).toMatch(/^period_s = 2\.00\d·length\^0\.5/);
    expect(readingFor(fit, 'length', 'period_s')).toContain('square root');
  });

  it('finds the square law of range against speed without drag', () => {
    const points = linspace(10, 100, 10).map((speed) => ({
      x: speed,
      y: runProjectile({ speed, angle: 45, height: 0, gravity: 9.81, drag: 'none' }).measurements.range_m,
    }));
    const fit = fitModel(points, 'power');
    expect(fit.params.p).toBeCloseTo(2, 4);
    expect(fit.params.A).toBeCloseTo(1 / 9.81, 4);
    expect(fitAuto(points).best.model).toBe('power');
  });

  it('finds the linear time-average law of the predator-prey model', () => {
    const points = linspace(0.3, 1.2, 7).map((death) => ({
      x: death,
      y: runPredatorPrey({
        prey_growth: 1,
        predation: 0.1,
        predator_efficiency: 0.05,
        predator_death: death,
        initial_prey: 20,
        initial_predators: 5,
        duration: 300,
      }).measurements.mean_prey,
    }));
    const fit = fitModel(points, 'linear');
    expect(fit.params.b).toBeCloseTo(1 / 0.05, 0);
    expect(fit.r2).toBeGreaterThan(0.995);
  });

  it('recovers an exponential decay and reads it as a decay', () => {
    const points = linspace(0, 6, 13).map((x) => ({ x, y: 3 * Math.exp(-0.7 * x) }));
    const fit = fitModel(points, 'exponential');
    expect(fit.params.A).toBeCloseTo(3, 6);
    expect(fit.params.k).toBeCloseTo(-0.7, 6);
    expect(readingFor(fit, 'time', 'voltage')).toContain('decays');
    expect(evaluate('exponential', fit.params, 2)).toBeCloseTo(3 * Math.exp(-1.4), 6);
  });

  it('refuses fits that do not apply and says why', () => {
    const withZero = [0, 1, 2, 3].map((x) => ({ x, y: x * x }));
    expect(() => fitModel(withZero, 'power')).toThrow(/above zero/);
    expect(() => fitModel([{ x: 1, y: 1 }, { x: 2, y: 2 }], 'quadratic')).toThrow(/at least 4 points/);
    expect(() => fitModel([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }], 'linear')).toThrow(/same/);
    expect(fitAuto(withZero).best.model).toBe('quadratic');
  });
});
