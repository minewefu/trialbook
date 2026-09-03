import { describe, expect, it } from 'vitest';
import { fitModel } from '../../lib/fit';
import { capacitorVoltage, runRc, simulateRc } from './engine';

const base = { resistance: 10, capacitance: 100, supply_voltage: 9, mode: 'charge' as const, duration: 5 };
const pct = (a: number, b: number) => (Math.abs(a - b) / Math.abs(b)) * 100;

describe('RC circuit engine', () => {
  it('measures the time constant as R·C and the half-time as τ ln 2', () => {
    const { measurements } = simulateRc(base);
    expect(measurements.rc_product_s).toBeCloseTo(1, 9);
    expect(pct(measurements.time_constant_s, 1)).toBeLessThan(0.01);
    expect(pct(measurements.half_time_s, Math.LN2)).toBeLessThan(0.01);
  });

  it('charges to 99.3% of the supply after five time constants and stores ½CV²', () => {
    const { measurements } = simulateRc(base);
    expect(measurements.final_voltage_v).toBeCloseTo(9 * (1 - Math.exp(-5)), 6);
    expect(measurements.initial_current_ma).toBeCloseTo(0.9, 9);
    expect(measurements.energy_stored_mj).toBeCloseTo(0.5 * 100e-6 * measurements.final_voltage_v ** 2 * 1e3, 9);
  });

  it('discharges symmetrically and the time constant doubles with the resistance', () => {
    const discharge = simulateRc({ ...base, mode: 'discharge' }).measurements;
    expect(discharge.final_voltage_v).toBeCloseTo(9 * Math.exp(-5), 6);
    expect(pct(discharge.time_constant_s, 1)).toBeLessThan(0.01);
    const doubled = simulateRc({ ...base, resistance: 20, duration: 10 }).measurements;
    expect(pct(doubled.time_constant_s, 2)).toBeLessThan(0.01);
    const bigger = simulateRc({ ...base, capacitance: 200, duration: 10 }).measurements;
    expect(pct(bigger.time_constant_s, 2)).toBeLessThan(0.01);
  });

  it('reports no time constant when the curve does not get there within the duration', () => {
    const { measurements } = simulateRc({ ...base, duration: 0.5 });
    expect(Number.isNaN(measurements.time_constant_s)).toBe(true);
    expect(Number.isFinite(measurements.half_time_s)).toBe(false);
    expect(measurements.final_voltage_v).toBeCloseTo(9 * (1 - Math.exp(-0.5)), 6);
  });

  it('series starts at zero when charging, at the supply when discharging, and is dense', () => {
    const charge = simulateRc(base).series;
    expect(charge[0]).toMatchObject({ t: 0, voltage: 0 });
    expect(charge[0].current).toBeCloseTo(0.9, 9);
    expect(charge.length).toBe(401);
    const discharge = simulateRc({ ...base, mode: 'discharge' }).series;
    expect(discharge[0].voltage).toBeCloseTo(9, 9);
    expect(discharge[discharge.length - 1].voltage).toBeCloseTo(capacitorVoltage({ ...base, mode: 'discharge' }, 5), 9);
  });

  it('a discharge curve fits an exponential whose rate is exactly −1/τ', () => {
    const { series } = simulateRc({ ...base, mode: 'discharge' });
    const fit = fitModel(series.filter((_, i) => i % 10 === 0).map((p) => ({ x: p.t, y: p.voltage })), 'exponential');
    expect(fit.params.k).toBeCloseTo(-1, 6);
    expect(fit.params.A).toBeCloseTo(9, 6);
  });

  it('runs 50 trials quickly and coerces loose input', () => {
    const started = performance.now();
    for (let i = 0; i < 50; i++) runRc({ resistance: 1 + i, capacitance: '100', supply_voltage: '12', mode: 'DISCHARGE', duration: 5 });
    expect(performance.now() - started).toBeLessThan(2000);
    const { measurements } = runRc({ resistance: '5', capacitance: '50', supply_voltage: '3', mode: 'nonsense', duration: '2' });
    expect(measurements.rc_product_s).toBeCloseTo(0.25, 9);
    expect(measurements.final_voltage_v).toBeGreaterThan(2.9);
  });
});
