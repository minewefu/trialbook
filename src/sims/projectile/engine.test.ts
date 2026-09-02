import { describe, expect, it } from 'vitest';
import { analyticProjectile, DRAG_COEFFICIENT, integrateProjectile, runProjectile } from './engine';

const base = { speed: 30, angle: 45, height: 0, gravity: 9.81, drag: 'none' as const };
const pct = (a: number, b: number) => (Math.abs(a - b) / Math.abs(b)) * 100;

describe('projectile engine', () => {
  it('closed form matches range = v² sin(2θ) / g, max height and impact speed', () => {
    const { measurements } = analyticProjectile(base);
    const expectedRange = (30 * 30 * Math.sin(Math.PI / 2)) / 9.81;
    expect(pct(measurements.range_m, expectedRange)).toBeLessThan(1e-6);
    expect(measurements.max_height_m).toBeCloseTo((30 * Math.SQRT1_2) ** 2 / (2 * 9.81), 6);
    expect(measurements.impact_speed_mps).toBeCloseTo(30, 6);
    expect(measurements.flight_time_s).toBeCloseTo((2 * 30 * Math.SQRT1_2) / 9.81, 6);
  });

  it('numeric integrator without drag matches the closed form within 0.5%', () => {
    for (const angle of [15, 30, 45, 60, 80]) {
      for (const height of [0, 25]) {
        for (const gravity of [9.81, 1.62]) {
          const p = { ...base, angle, height, gravity };
          const a = analyticProjectile(p).measurements;
          const n = integrateProjectile(p, 0).measurements;
          expect(pct(n.range_m, a.range_m)).toBeLessThan(0.5);
          expect(pct(n.flight_time_s, a.flight_time_s)).toBeLessThan(0.5);
          expect(pct(n.max_height_m, a.max_height_m)).toBeLessThan(0.5);
        }
      }
    }
  });

  it('drag shortens the range and lowers the impact speed', () => {
    const none = runProjectile(base).measurements;
    const light = runProjectile({ ...base, drag: 'light' }).measurements;
    const heavy = runProjectile({ ...base, drag: 'heavy' }).measurements;
    expect(light.range_m).toBeLessThan(none.range_m);
    expect(heavy.range_m).toBeLessThan(light.range_m);
    expect(light.impact_speed_mps).toBeLessThan(none.impact_speed_mps);
    expect(DRAG_COEFFICIENT.heavy).toBeGreaterThan(DRAG_COEFFICIENT.light);
  });

  it('45 degrees maximises range from ground level without drag', () => {
    let best = 0;
    let bestAngle = 0;
    for (let angle = 1; angle < 90; angle++) {
      const r = runProjectile({ ...base, angle }).measurements.range_m;
      if (r > best) {
        best = r;
        bestAngle = angle;
      }
    }
    expect(bestAngle).toBe(45);
  });

  it('with heavy drag the best angle drops below 45 degrees', () => {
    let best = 0;
    let bestAngle = 0;
    for (let angle = 5; angle <= 85; angle += 5) {
      const r = runProjectile({ ...base, angle, drag: 'heavy' }).measurements.range_m;
      if (r > best) {
        best = r;
        bestAngle = angle;
      }
    }
    expect(bestAngle).toBeLessThan(45);
  });

  it('handles a flat launch from the ground and a drop from a height', () => {
    const flat = runProjectile({ ...base, angle: 0 }).measurements;
    expect(flat.range_m).toBe(0);
    expect(flat.flight_time_s).toBe(0);
    const drop = runProjectile({ ...base, speed: 1, angle: 0, height: 20, drag: 'light' }).measurements;
    expect(drop.flight_time_s).toBeGreaterThan(Math.sqrt((2 * 20) / 9.81) * 0.99);
    expect(drop.range_m).toBeGreaterThan(0);
  });

  it('series starts at the launch point and ends on the ground', () => {
    for (const drag of ['none', 'heavy'] as const) {
      const { series, measurements } = runProjectile({ ...base, height: 10, drag });
      expect(series[0]).toMatchObject({ t: 0, x: 0, y: 10 });
      const last = series[series.length - 1];
      expect(last.y).toBe(0);
      expect(last.x).toBeCloseTo(measurements.range_m, 6);
      expect(series.length).toBeLessThanOrEqual(200);
    }
  });

  it('coerces loose input and never returns NaN', () => {
    const { measurements } = runProjectile({ speed: '40', angle: '30', height: '5', gravity: '3.71', drag: 'LIGHT' });
    for (const value of Object.values(measurements)) expect(Number.isFinite(value)).toBe(true);
  });
});
