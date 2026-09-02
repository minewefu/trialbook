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

describe('lab store measurement error', () => {
  it('applies deterministic synthetic noise per trial and repeats scatter around the exact value', async () => {
    const lab = useLab.getState();
    lab.openExperiment('projectile', 'you');
    lab.setParams('projectile', { angle: 45, speed: 30, drag: 'none', height: 0, gravity: 9.81 }, 'you');
    const exact = lab.runTrial('projectile', 'you').measurements.range_m;
    expect(useLab.getState().trials.at(-1)?.noisy).toBeUndefined();
    lab.setMeasurementError(true, 'you');
    const noisyTrial = useLab.getState().runTrial('projectile', 'you');
    expect(noisyTrial.noisy).toBe(true);
    const sweep = await useLab.getState().runRepeats('projectile', 12, 'agent', { watch: false });
    expect(sweep.kind).toBe('repeats');
    const ranges = sweep.trialIds.map((id) => useLab.getState().trials.find((t) => t.id === id)!.measurements.range_m);
    const mean = ranges.reduce((s, v) => s + v, 0) / ranges.length;
    const sd = Math.sqrt(ranges.reduce((s, v) => s + (v - mean) ** 2, 0) / (ranges.length - 1));
    expect(sd).toBeGreaterThan(0.05);
    expect(sd).toBeLessThan(2);
    expect(Math.abs(mean - exact)).toBeLessThan(4 * sd / Math.sqrt(ranges.length) + 0.05);
    expect(new Set(ranges).size).toBeGreaterThan(1);
    lab.setMeasurementError(false, 'you');
    expect(useLab.getState().takeChanges().some((c) => c.text.includes('measurement error'))).toBe(true);
  });
});

describe('lab store assignment mode', () => {
  it('gates agent batches behind a hypothesis for the open experiment only', async () => {
    const lab = useLab.getState();
    lab.openExperiment('pendulum', 'you');
    lab.setAssignmentMode(true);
    expect(useLab.getState().hypothesisGate('pendulum')).toMatch(/hypothesis/);
    await expect(useLab.getState().runSweep('pendulum', 'length', [1, 2], 'agent', { watch: false })).rejects.toThrow(/hypothesis/);
    await expect(useLab.getState().runRepeats('pendulum', 3, 'agent')).rejects.toThrow(/hypothesis/);
    await expect(
      useLab.getState().runOptimization('pendulum', 'length', { measurement: 'period_s', goal: 'min', watch: false }, 'agent'),
    ).rejects.toThrow(/hypothesis/);
    expect(() => useLab.getState().runTrial('pendulum', 'agent')).not.toThrow();
    lab.addNote({ author: 'you', kind: 'hypothesis', text: 'Longer pendulums swing more slowly.', });
    expect(useLab.getState().hypothesisGate('pendulum')).toBeNull();
    expect(useLab.getState().hypothesisGate('projectile')).toMatch(/hypothesis/);
    const sweep = await useLab.getState().runSweep('pendulum', 'length', [1, 2], 'agent', { watch: false });
    expect(sweep.status).toBe('done');
    lab.setAssignmentMode(false);
    expect(useLab.getState().hypothesisGate('projectile')).toBeNull();
  });

  it('turns agent conclusions into proposals that the person accepts, edits or rejects', () => {
    const lab = useLab.getState();
    lab.setAssignmentMode(true);
    const proposal = lab.addNote({ author: 'agent', kind: 'conclusion', text: 'Period scales with the square root of length.' });
    expect(proposal.status).toBe('pending');
    const observation = lab.addNote({ author: 'agent', kind: 'observation', text: 'Ran two trials.' });
    expect(observation.status).toBeUndefined();
    const own = lab.addNote({ author: 'you', kind: 'conclusion', text: 'Confirmed.' });
    expect(own.status).toBeUndefined();
    lab.takeChanges();
    lab.resolveProposal(proposal.id, 'rejected');
    expect(useLab.getState().notebook.find((n) => n.id === proposal.id)?.status).toBe('rejected');
    const second = lab.addNote({ author: 'agent', kind: 'conclusion', text: 'T grows with sqrt(L).' });
    lab.resolveProposal(second.id, 'accepted', 'T grows with the square root of L, exponent 0.50.');
    const stored = useLab.getState().notebook.find((n) => n.id === second.id)!;
    expect(stored.status).toBe('accepted');
    expect(stored.edited).toBe(true);
    expect(stored.text).toContain('0.50');
    const changes = useLab.getState().takeChanges().map((c) => c.text);
    expect(changes.some((c) => c.startsWith('rejected the proposed conclusion'))).toBe(true);
    expect(changes.some((c) => c.includes('accepted the proposed conclusion') && c.includes('after editing'))).toBe(true);
    lab.setAssignmentMode(false);
    const direct = lab.addNote({ author: 'agent', kind: 'conclusion', text: 'Normal mode again.' });
    expect(direct.status).toBeUndefined();
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
