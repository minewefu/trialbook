import { describe, expect, it } from 'vitest';
import { linspace } from './lib/format';
import { useLab } from './store';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('lab store sweeps', () => {
  it('runs 50 headless projectile trials in under two seconds', async () => {
    const started = performance.now();
    const sweep = await useLab.getState().runSweep('projectile', 'angle', linspace(1, 89, 50), 'agent', { watch: false });
    expect(sweep.status).toBe('done');
    expect(sweep.trialIds.length).toBe(50);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(useLab.getState().activeSweepId).toBeNull();
  });

  it('runs 50 headless pendulum trials in under two seconds', async () => {
    useLab.getState().openExperiment('pendulum', 'you');
    const started = performance.now();
    const sweep = await useLab.getState().runSweep('pendulum', 'amplitude', linspace(1, 170, 50), 'agent', { watch: false });
    expect(sweep.status).toBe('done');
    expect(sweep.trialIds.length).toBe(50);
    expect(performance.now() - started).toBeLessThan(2000);
    useLab.getState().openExperiment('projectile', 'you');
  });

  it('cancels a running sweep through the abort signal and keeps the partial results', async () => {
    const controller = new AbortController();
    const promise = useLab
      .getState()
      .runSweep('projectile', 'speed', linspace(10, 100, 30), 'agent', { watch: true, signal: controller.signal });
    await wait(350);
    controller.abort();
    const sweep = await promise;
    expect(sweep.status).toBe('cancelled');
    expect(sweep.trialIds.length).toBeGreaterThan(0);
    expect(sweep.trialIds.length).toBeLessThan(30);
    expect(useLab.getState().activeSweepId).toBeNull();
    expect(useLab.getState().sweepProgress).toBeNull();
  });

  it('cancels through the Cancel button path and refuses overlapping sweeps', async () => {
    const promise = useLab.getState().runSweep('projectile', 'height', linspace(0, 50, 20), 'agent', { watch: true });
    await wait(150);
    await expect(
      useLab.getState().runSweep('projectile', 'angle', [10, 20], 'agent', { watch: false }),
    ).rejects.toThrow(/still running/);
    expect(useLab.getState().cancelSweep()).toBe(true);
    const sweep = await promise;
    expect(sweep.status).toBe('cancelled');
    expect(useLab.getState().cancelSweep()).toBe(false);
  });

  it('validates sweep values before running anything', async () => {
    const before = useLab.getState().trials.length;
    await expect(useLab.getState().runSweep('projectile', 'angle', [10, 95], 'agent')).rejects.toThrow(/outside the allowed range/);
    await expect(useLab.getState().runSweep('projectile', 'mass', [1], 'agent')).rejects.toThrow(/Unknown parameter/);
    expect(useLab.getState().trials.length).toBe(before);
  });
});

describe('lab store optimisation', () => {
  it('finds the 45 degree optimum for range without drag to within 0.1 degree', async () => {
    useLab.getState().openExperiment('projectile', 'you');
    useLab.getState().setParams('projectile', { drag: 'none', gravity: 9.81, height: 0, speed: 30 }, 'you');
    const result = await useLab.getState().runOptimization(
      'projectile',
      'angle',
      { measurement: 'range_m', goal: 'max', tolerance: 0.05, maxTrials: 30, watch: false },
      'agent',
    );
    expect(result.sweep.status).toBe('done');
    expect(result.sweep.kind).toBe('optimize');
    expect(result.converged).toBe(true);
    expect(Math.abs(Number(result.best!.params.angle) - 45)).toBeLessThan(0.1);
    expect(result.trialsUsed).toBeLessThanOrEqual(30);
    expect(result.atBound).toBeNull();
  });

  it('finds an optimum below 45 degrees with heavy drag and reports a bound when the response is monotonic', async () => {
    useLab.getState().setParams('projectile', { drag: 'heavy' }, 'you');
    const drag = await useLab.getState().runOptimization('projectile', 'angle', { measurement: 'range_m', goal: 'max', watch: false }, 'agent');
    expect(Number(drag.best!.params.angle)).toBeLessThan(45);
    expect(Number(drag.best!.params.angle)).toBeGreaterThan(20);
    const speed = await useLab.getState().runOptimization('projectile', 'speed', { measurement: 'range_m', goal: 'max', watch: false }, 'agent');
    expect(speed.atBound).toBe('high');
    useLab.getState().setParams('projectile', { drag: 'none' }, 'you');
  });

  it('refuses enum parameters and bad ranges, and can be cancelled', async () => {
    await expect(
      useLab.getState().runOptimization('projectile', 'drag', { measurement: 'range_m', goal: 'max' }, 'agent'),
    ).rejects.toThrow(/choice/);
    await expect(
      useLab.getState().runOptimization('projectile', 'angle', { measurement: 'range_m', goal: 'max', from: 50, to: 40 }, 'agent'),
    ).rejects.toThrow(/from < to/);
    const controller = new AbortController();
    const promise = useLab.getState().runOptimization(
      'projectile',
      'angle',
      { measurement: 'range_m', goal: 'max', watch: true, signal: controller.signal },
      'agent',
    );
    await wait(400);
    controller.abort();
    const result = await promise;
    expect(result.sweep.status).toBe('cancelled');
    expect(result.trialsUsed).toBeGreaterThan(0);
    expect(useLab.getState().activeSweepId).toBeNull();
  });
});

describe('lab store attribution', () => {
  it('queues the person’s changes for the agent and toasts the agent’s changes for the person', () => {
    const lab = useLab.getState();
    lab.takeChanges();
    lab.setParams('projectile', { angle: 50 }, 'you');
    lab.setParams('projectile', { angle: 55 }, 'you');
    expect(lab.takeChanges().map((c) => c.text)).toEqual(['set angle to 55 deg']);
    lab.setParams('projectile', { speed: 40 }, 'agent');
    expect(useLab.getState().toasts.length).toBeLessThanOrEqual(4);
    expect(useLab.getState().toasts.at(-1)?.text).toBe('Agent set speed to 40 m/s');
    expect(useLab.getState().changes).toEqual([]);
    expect(useLab.getState().highlights.speed).toBeGreaterThan(Date.now());
  });
});
