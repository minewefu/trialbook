import { beforeAll, describe, expect, it } from 'vitest';
import { listTools, runTool } from '../lib/webmcp';
import { EXPERIMENTS } from '../sims';
import { useLab } from '../store';
import { experimentTools } from './experiment';
import { initTools } from './index';

const MAX = 1400;
const size = (value: unknown) => JSON.stringify(value).length;

type Result = Record<string, any>;

beforeAll(async () => {
  await initTools();
});

describe('tool registry', () => {
  it('registers the global tools and the projectile tools', () => {
    const names = listTools().map((t) => t.def.name);
    for (const expected of [
      'get_lab_state',
      'list_experiments',
      'open_experiment',
      'get_results',
      'plot_results',
      'notebook_add_entry',
      'notebook_read',
      'export_report',
      'set_parameters',
      'run_trial',
      'sweep_parameter',
      'reset_experiment',
    ]) {
      expect(names).toContain(expected);
    }
    expect(names.length).toBeLessThanOrEqual(12);
  });

  it('keeps names, descriptions and schemas within the guidance limits for every experiment', () => {
    const defs = [
      ...listTools().map((t) => t.def),
      ...Object.values(EXPERIMENTS).flatMap((experiment) => experimentTools(experiment)),
    ];
    expect(defs.length).toBeGreaterThan(12);
    for (const def of defs) {
      expect(def.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
      expect(def.description.length).toBeLessThanOrEqual(500);
      expect(def.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      const properties = (def.inputSchema as { properties: Record<string, { description?: string }> }).properties;
      for (const property of Object.values(properties)) {
        expect((property.description ?? '').length).toBeLessThanOrEqual(150);
      }
      expect(def.annotations?.readOnlyHint === true || def.annotations?.readOnlyHint === undefined).toBe(true);
    }
  });
});

describe('tool behaviour', () => {
  it('get_lab_state reports the open experiment and stays small', async () => {
    const r = (await runTool('get_lab_state', {})) as Result;
    expect(r.experiment).toBe('projectile');
    expect(r.parameters).toMatchObject({ speed: 30, angle: 45 });
    expect(size(r)).toBeLessThan(MAX);
  });

  it('list_experiments overview and detail stay small', async () => {
    const overview = (await runTool('list_experiments', {})) as Result;
    expect(overview.experiments.length).toBe(3);
    expect(size(overview)).toBeLessThan(MAX);
    const detail = (await runTool('list_experiments', { experiment: 'projectile' })) as Result;
    expect(detail.parameters.length).toBe(5);
    expect(size(detail)).toBeLessThan(MAX);
  });

  it('set_parameters validates strictly and reports what changed', async () => {
    const ok = (await runTool('set_parameters', { angle: 60 })) as Result;
    expect(ok.changed).toEqual(['angle']);
    expect(ok.parameters.angle).toBe(60);
    const bad = (await runTool('set_parameters', { angle: 120 })) as Result;
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/0 to 90/);
    const unknown = (await runTool('set_parameters', { mass: 3 })) as Result;
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toMatch(/Unknown parameter "mass"/);
  });

  it('run_trial measures and records the person-visible summary', async () => {
    const r = (await runTool('run_trial', { angle: 45, speed: 30, drag: 'none' })) as Result;
    expect(r.trial_id).toMatch(/^trial-\d+$/);
    expect(r.measurements.range_m).toBeCloseTo(91.74, 1);
    expect(size(r)).toBeLessThan(MAX);
    expect(useLab.getState().trials.length).toBeGreaterThan(0);
  });

  it('sweep_parameter runs the values, summarises, and the follow-up tools stay small', async () => {
    const sweep = (await runTool('sweep_parameter', { parameter: 'angle', from: 20, to: 70, steps: 11, watch: false })) as Result;
    expect(sweep.status).toBe('done');
    expect(sweep.count).toBe(11);
    expect(sweep.summary.range_m.max_at).toBe(45);
    expect(sweep.rows.length).toBeLessThanOrEqual(8);
    expect(size(sweep)).toBeLessThan(MAX);

    const results = (await runTool('get_results', { sweep_id: sweep.sweep_id, limit: 8 })) as Result;
    expect(results.total).toBe(11);
    expect(results.pages).toBe(2);
    expect(results.rows.length).toBe(8);
    expect(results.by).toBe('agent');
    expect(results.fixed_parameters.speed).toBe(30);
    expect(size(results)).toBeLessThan(MAX);
    const page2 = (await runTool('get_results', { sweep_id: sweep.sweep_id, limit: 8, page: 2 })) as Result;
    expect(page2.rows.length).toBe(3);

    const general = (await runTool('get_results', { limit: 8 })) as Result;
    expect(general.total).toBe(12);
    expect(general.rows.length).toBe(6);
    expect(general.rows[0].by).toBe('agent');
    expect(general.rows[0].speed).toBe(30);
    expect(size(general)).toBeLessThan(MAX);

    const chart = (await runTool('plot_results', { sweep_id: sweep.sweep_id, y: 'range_m' })) as Result;
    expect(chart.chart_id).toMatch(/^chart-\d+$/);
    expect(chart.points).toBe(11);
    expect(chart.y_max.x).toBe(45);
    expect(size(chart)).toBeLessThan(MAX);
  });

  it('rejects an out-of-range sweep and an unknown parameter with actionable errors', async () => {
    const r = (await runTool('sweep_parameter', { parameter: 'angle', from: 0, to: 120, steps: 5 })) as Result;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/outside the allowed range/);
    const u = (await runTool('sweep_parameter', { parameter: 'mass', from: 1, to: 2 })) as Result;
    expect(u.ok).toBe(false);
  });

  it('notebook tools write as the agent and read back people-authored text as untrusted content', async () => {
    const added = (await runTool('notebook_add_entry', { kind: 'observation', text: 'Range peaked at 45 degrees.', link: 'latest_sweep' })) as Result;
    expect(added.entry_id).toMatch(/^note-\d+$/);
    expect(added.attached).toMatch(/^sweep-/);
    useLab.getState().addNote({ author: 'you', kind: 'hypothesis', text: 'Heavy drag will lower the best angle.' });
    const read = (await runTool('notebook_read', { limit: 4 })) as Result;
    expect(read.entries[0].author).toBe('you');
    expect(read.entries[1].author).toBe('agent');
    expect(size(read)).toBeLessThan(MAX);
    const tool = listTools().find((t) => t.def.name === 'notebook_read')!;
    expect(tool.def.annotations?.untrustedContentHint).toBe(true);
    const single = (await runTool('notebook_read', { entry_id: added.entry_id })) as Result;
    expect(single.text).toContain('45 degrees');
  });

  it('get_lab_state hands the agent what the person changed since the last read', async () => {
    await runTool('get_lab_state', {});
    useLab.getState().setParams('projectile', { gravity: 1.62 }, 'you');
    const r = (await runTool('get_lab_state', {})) as Result;
    expect(r.changes_since_last_read).toEqual(['you: set gravity to 1.62 m/s²']);
    const again = (await runTool('get_lab_state', {})) as Result;
    expect(again.changes_since_last_read).toEqual([]);
  });

  it('export_report returns a preview and reports that no download happened outside a browser', async () => {
    const r = (await runTool('export_report', {})) as Result;
    expect(r.characters).toBeGreaterThan(200);
    expect(r.downloaded).toBe(false);
    expect(r.preview).toContain('# Trialbook lab report');
    expect(size(r)).toBeLessThan(MAX);
  });

  it('open_experiment swaps the experiment tools and the pendulum measures a real period', async () => {
    const opened = (await runTool('open_experiment', { experiment: 'pendulum' })) as Result;
    expect(opened.ok).toBe(true);
    expect(opened.experiment).toBe('pendulum');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const setTool = listTools().find((t) => t.def.name === 'set_parameters')!;
    const props = (setTool.def.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props)).toContain('length');
    expect(Object.keys(props)).not.toContain('speed');
    expect(listTools().length).toBeLessThanOrEqual(12);

    const trial = (await runTool('run_trial', { amplitude: 20, length: 1 })) as Result;
    expect(trial.experiment).toBe('pendulum');
    expect(trial.measurements.period_s).toBeCloseTo(2.022, 2);
    expect(trial.measurements.small_angle_period_s).toBeCloseTo(2.006, 2);
    expect(trial.measurements.decay_time_s).toBeNull();
    expect(size(trial)).toBeLessThan(MAX);

    const wrong = (await runTool('set_parameters', { speed: 30 })) as Result;
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toMatch(/Unknown parameter "speed"/);

    const sweep = (await runTool('sweep_parameter', { parameter: 'damping', watch: false })) as Result;
    expect(sweep.count).toBe(3);
    expect(sweep.summary.decay_time_s.min_at).toBe('heavy');
    expect(size(sweep)).toBeLessThan(MAX);

    const back = (await runTool('open_experiment', { experiment: 'projectile' })) as Result;
    expect(back.experiment).toBe('projectile');
  });

  it('open_experiment refuses experiments that do not exist and keeps the current one open', async () => {
    useLab.getState().openExperiment('projectile', 'you');
    const r = (await runTool('open_experiment', { experiment: 'quantum' })) as Result;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not available/);
    expect(useLab.getState().experiment).toBe('projectile');
  });

  it('predator and prey tools produce many measurements and still fit the output budget', async () => {
    const opened = (await runTool('open_experiment', { experiment: 'predator_prey' })) as Result;
    expect(opened.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const trial = (await runTool('run_trial', {})) as Result;
    expect(trial.measurements.peak_prey).toBeGreaterThan(trial.measurements.min_prey);
    expect(size(trial)).toBeLessThan(MAX);
    const sweep = (await runTool('sweep_parameter', { parameter: 'predator_death', from: 0.3, to: 1.2, steps: 10, watch: false })) as Result;
    expect(sweep.count).toBe(10);
    expect(size(sweep)).toBeLessThan(MAX);
    const results = (await runTool('get_results', { limit: 6 })) as Result;
    expect(results.rows.length).toBeGreaterThan(0);
    expect(results.per_page).toBeLessThanOrEqual(6);
    expect(size(results)).toBeLessThan(MAX);
    const chart = (await runTool('plot_results', { sweep_id: sweep.sweep_id, y: 'oscillation_period' })) as Result;
    expect(chart.points).toBe(10);
    useLab.getState().openExperiment('projectile', 'you');
  });
});
