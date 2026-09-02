import { describe, expect, it } from 'vitest';
import { ellipticK, exactPeriod, integratePendulum, runPendulum, smallAnglePeriod } from './engine';

const base = { length: 1, amplitude: 20, gravity: 9.81, damping: 'none' as const };
const pct = (a: number, b: number) => (Math.abs(a - b) / Math.abs(b)) * 100;

describe('pendulum engine', () => {
  it('K(0) is π/2 and K(sin 45°) matches the tabulated 1.8541', () => {
    expect(ellipticK(0)).toBeCloseTo(Math.PI / 2, 12);
    expect(ellipticK(Math.sin(Math.PI / 4))).toBeCloseTo(1.85407, 4);
  });

  it('measured period matches the exact elliptic-integral period within 0.5%', () => {
    for (const amplitude of [5, 30, 60, 90, 120, 150, 170]) {
      for (const length of [0.5, 2]) {
        for (const gravity of [9.81, 1.62]) {
          const { measurements } = integratePendulum({ ...base, amplitude, length, gravity });
          const exact = exactPeriod(length, gravity, (amplitude * Math.PI) / 180);
          expect(pct(measurements.period_s, exact)).toBeLessThan(0.5);
        }
      }
    }
  });

  it('small angles follow 2π√(L/g); 90 degrees runs about 18% slow', () => {
    const small = integratePendulum({ ...base, amplitude: 5 }).measurements;
    expect(small.small_angle_period_s).toBeCloseTo(smallAnglePeriod(1, 9.81), 9);
    expect(Math.abs(small.period_deviation_pct)).toBeLessThan(0.2);
    const wide = integratePendulum({ ...base, amplitude: 90 }).measurements;
    expect(wide.period_deviation_pct).toBeGreaterThan(17.5);
    expect(wide.period_deviation_pct).toBeLessThan(18.5);
  });

  it('damping lowers the peak speed and produces a decay time near 2/b', () => {
    const none = integratePendulum(base).measurements;
    const light = integratePendulum({ ...base, damping: 'light' }).measurements;
    const heavy = integratePendulum({ ...base, damping: 'heavy' }).measurements;
    expect(Number.isNaN(none.decay_time_s)).toBe(true);
    expect(light.max_speed_mps).toBeLessThanOrEqual(none.max_speed_mps);
    expect(heavy.max_speed_mps).toBeLessThan(light.max_speed_mps);
    expect(pct(light.decay_time_s, 20)).toBeLessThan(15);
    expect(heavy.decay_time_s).toBeLessThan(light.decay_time_s);
  });

  it('peak speed of a small swing matches energy conservation', () => {
    const { measurements } = integratePendulum({ ...base, amplitude: 30 });
    const expected = Math.sqrt(2 * 9.81 * 1 * (1 - Math.cos(Math.PI / 6)));
    expect(pct(measurements.max_speed_mps, expected)).toBeLessThan(0.2);
  });

  it('series starts at the release angle and covers a few periods at watchable resolution', () => {
    const { series, measurements } = integratePendulum(base);
    expect(series[0]).toMatchObject({ t: 0, angle: 20, omega: 0 });
    const last = series[series.length - 1];
    expect(last.t).toBeGreaterThan(3 * measurements.period_s);
    expect(series.length).toBeGreaterThan(200);
    expect(series.length).toBeLessThanOrEqual(420);
  });

  it('runs 50 headless trials in well under two seconds', () => {
    const started = performance.now();
    for (let i = 0; i < 50; i++) runPendulum({ length: 1, amplitude: 1 + i * 3, gravity: 9.81, damping: 'light' });
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('coerces loose input and never returns NaN for the period of a normal swing', () => {
    const { measurements } = runPendulum({ length: '2', amplitude: '45', gravity: '3.71', damping: 'HEAVY' });
    expect(Number.isFinite(measurements.period_s)).toBe(true);
    expect(Number.isFinite(measurements.max_speed_mps)).toBe(true);
  });
});
