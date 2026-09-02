import { beforeAll, describe, expect, it } from 'vitest';
import { listTools, runTool } from '../lib/webmcp';
import { EXPERIMENTS } from '../sims';
import { useLab } from '../store';
import { experimentTools } from './experiment';
import { initTools } from './index';

const MAX = 1400;
const size = (value: unknown) => JSON.stringify(value).length;
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

type Result = Record<string, any>;

beforeAll(async () => {
  await initTools();
});

describe('tool registry', () => {
  it('registers the global tools and the projectile tools', () => {
    const names = listTools().map((t) => t.def.name);
    for (const expected of [
      'get_lab_state',
      'open_experiment',
      'get_results',
      'plot_results',
      'fit_model',
      'notebook_add_entry',
      'notebook_read',
      'export_report',
      'set_parameters',
      'run_trial',
      'sweep_parameter',
      'run_repeats',
      'optimize_parameter',
      'reset_experiment',
    ]) {
      expect(names).toContain(expected);
    }
    expect(names).not.toContain('list_experiments');
    expect(names.length).toBeLessThanOrEqual(14);
  });

  it('keeps names, descriptions and schemas within the guidance limits for every experiment', () => {
    const defs = [
      ...listTools().map((t) => t.def),
      ...Object.values(EXPERIMENTS).flatMap((experiment) => experimentTools(experiment)),
    ];
    expect(defs.length).toBeGreaterThan(14);
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
  it('get_lab_state reports the open experiment, its ranges and the experiment list, and stays small', async () => {
    const r = (await runTool('get_lab_state', {})) as Result;
    expect(r.experiment).toBe('projectile');
    expect(r.parameters).toMatchObject({ speed: 30, angle: 45 });
    expect(r.parameter_ranges.angle).toBe('0 to 90 deg');
    expect(r.parameter_ranges.drag).toBe('none | light | heavy');
    expect(r.experiments).toEqual(['projectile', 'pendulum', 'predator_prey']);
    expect(r.measurements).toContain('range_m');
    expect(r.assignment_mode).toBe(false);
    expect(size(r)).toBeLessThan(MAX);
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
    expect(r.measurement_error).toBeUndefined();
    expect(size(r)).toBeLessThan(MAX);
    expect(useLab.getState().trials.length).toBeGreaterThan(0);
  });

  it('sweep_parameter runs the values, summarises, and the follow-up tools stay small', async () => {
    const sweep = (await runTool('sweep_parameter', { parameter: 'angle', from: 20, to: 70, steps: 11, watch: false })) as Result;
    expect(sweep.status).toBe('done');
    expect(sweep.cancelled).toBe(false);
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
    expect(added.status).toBeUndefined();
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
    useLab.getState().setParams('projectile', { gravity: 9.81 }, 'you');
    await runTool('get_lab_state', {});
  });

  it('export_report returns a preview, the attribution counts, and no download outside a browser', async () => {
    const r = (await runTool('export_report', {})) as Result;
    expect(r.characters).toBeGreaterThan(200);
    expect(r.downloaded).toBe(false);
    expect(r.preview).toContain('# Trialbook lab report');
    expect(r.attribution.agent.trials).toBeGreaterThan(10);
    expect(r.attribution.person.hypotheses).toBe(1);
    expect(size(r)).toBeLessThan(MAX);
  });

  it('fit_model finds the square-root law from a pendulum length sweep and draws it on the chart', async () => {
    useLab.getState().openExperiment('pendulum', 'you');
    await settle();
    const sweep = (await runTool('sweep_parameter', { parameter: 'length', from: 0.25, to: 4, steps: 8, watch: false })) as Result;
    expect(sweep.count).toBe(8);
    const fit = (await runTool('fit_model', { sweep_id: sweep.sweep_id, y: 'period_s', model: 'power' })) as Result;
    expect(fit.model).toBe('power');
    expect(fit.parameters.p).toBeCloseTo(0.5, 2);
    expect(fit.equation).toMatch(/^period_s = .*·length\^0\.5/);
    expect(fit.r2).toBeGreaterThan(0.9999);
    expect(fit.reading).toContain('square root');
    expect(size(fit)).toBeLessThan(MAX);
    const chart = useLab.getState().charts.find((c) => c.id === fit.chart_id)!;
    expect(chart.fit?.model).toBe('power');
    expect(chart.points.length).toBe(8);

    const auto = (await runTool('fit_model', { chart_id: fit.chart_id })) as Result;
    expect(auto.model).toBe('power');
    expect(auto.candidates_r2.power).toBeGreaterThan(0.999);
    expect(size(auto)).toBeLessThan(MAX);

    const bad = (await runTool('fit_model', { chart_id: fit.chart_id, model: 'cubic' })) as Result;
    expect(bad.ok).toBe(false);
    const trialAxis = (await runTool('plot_results', { y: 'period_s', x: 'trial', sweep_id: sweep.sweep_id })) as Result;
    const refused = (await runTool('fit_model', { chart_id: trialAxis.chart_id })) as Result;
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/trial number/);
  });

  it('open_experiment swaps the experiment tools and the pendulum measures a real period', async () => {
    const opened = (await runTool('open_experiment', { experiment: 'pendulum' })) as Result;
    expect(opened.ok).toBe(true);
    expect(opened.experiment).toBe('pendulum');
    expect(Object.keys(opened.parameter_ranges)).toEqual(['length', 'amplitude', 'gravity', 'damping']);
    expect(opened.guidance).toContain('2π√(L/g)');
    expect(size(opened)).toBeLessThan(MAX);
    await settle();
    const setTool = listTools().find((t) => t.def.name === 'set_parameters')!;
    const props = (setTool.def.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props)).toContain('length');
    expect(Object.keys(props)).not.toContain('speed');
    expect(listTools().length).toBeLessThanOrEqual(14);

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

  it('optimize_parameter returns the optimum with its bracket and stays small', async () => {
    useLab.getState().openExperiment('projectile', 'you');
    useLab.getState().setParams('projectile', { drag: 'none', speed: 30, height: 0, gravity: 9.81 }, 'you');
    await settle();
    const r = (await runTool('optimize_parameter', { parameter: 'angle', measurement: 'range_m', goal: 'max', tolerance: 0.1, watch: false })) as Result;
    expect(r.status).toBe('done');
    expect(Math.abs(r.best.angle - 45)).toBeLessThan(0.15);
    expect(r.best.range_m).toBeCloseTo(91.74, 1);
    expect(r.bracket_width).toBeLessThanOrEqual(0.1);
    expect(r.converged).toBe(true);
    expect(size(r)).toBeLessThan(MAX);
    const bad = (await runTool('optimize_parameter', { parameter: 'drag', measurement: 'range_m', goal: 'max' })) as Result;
    expect(bad.ok).toBe(false);
  });

  it('run_repeats quantifies uncertainty with synthetic noise and plot_results draws error bars', async () => {
    const identical = (await runTool('run_repeats', { n: 3, noise: false })) as Result;
    expect(identical.n).toBe(3);
    expect(identical.statistics.range_m.sd).toBe(0);
    expect(identical.measurement_error).toMatch(/off/);

    const noisy = (await runTool('run_repeats', { n: 10 })) as Result;
    expect(noisy.n).toBe(10);
    expect(noisy.statistics.range_m.sd).toBeGreaterThan(0);
    expect(Math.abs(noisy.statistics.range_m.mean - 91.74)).toBeLessThan(2);
    expect(noisy.statistics.range_m.sem).toBeCloseTo(noisy.statistics.range_m.sd / Math.sqrt(10), 3);
    expect(size(noisy)).toBeLessThan(MAX);
    const results = (await runTool('get_results', { sweep_id: noisy.sweep_id })) as Result;
    expect(results.kind).toBe('repeats');
    expect(results.rows[0].noisy).toBe(true);
    expect(results.rows[0].by).toBe('agent');
    expect(size(results)).toBeLessThan(MAX);

    const refused = (await runTool('sweep_parameter', { parameter: 'angle', from: 20, to: 60, steps: 3, repeats: 3, watch: false })) as Result;
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/measurement error/);
    const sweep = (await runTool('sweep_parameter', { parameter: 'angle', from: 20, to: 60, steps: 3, repeats: 3, noise: true, watch: false })) as Result;
    expect(sweep.count).toBe(9);
    expect(sweep.repeats_per_value).toBe(3);
    expect(size(sweep)).toBeLessThan(MAX);
    const chart = (await runTool('plot_results', { sweep_id: sweep.sweep_id, y: 'range_m' })) as Result;
    expect(chart.points).toBe(3);
    expect(chart.error_bars).toBeDefined();
    expect(chart.y_max.n).toBe(3);
    const stored = useLab.getState().charts.find((c) => c.id === chart.chart_id)!;
    expect(stored.points.every((p) => p.sd !== undefined && p.n === 3)).toBe(true);
    const fit = (await runTool('fit_model', { chart_id: chart.chart_id, model: 'linear' })) as Result;
    expect(fit.n).toBe(3);
    expect(fit.ok).toBeUndefined();
    const tooFew = (await runTool('fit_model', { chart_id: chart.chart_id, model: 'quadratic' })) as Result;
    expect(tooFew.ok).toBe(false);
    expect(tooFew.error).toMatch(/at least 4 points/);
  });

  it('assignment mode gates batches behind a hypothesis and turns agent conclusions into proposals', async () => {
    const lab = useLab.getState();
    lab.openExperiment('predator_prey', 'you');
    await settle();
    lab.setAssignmentMode(true);
    const state = (await runTool('get_lab_state', {})) as Result;
    expect(state.assignment_mode).toBe(true);
    expect(state.person_hypotheses_for_this_experiment).toBe(0);
    expect(state.hint).toMatch(/hypothesis/);
    expect(size(state)).toBeLessThan(MAX);

    const blocked = (await runTool('sweep_parameter', { parameter: 'predator_death', from: 0.3, to: 1.2, steps: 4, watch: false })) as Result;
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/hypothesis/);
    const blockedRepeats = (await runTool('run_repeats', { n: 3 })) as Result;
    expect(blockedRepeats.ok).toBe(false);
    const single = (await runTool('run_trial', {})) as Result;
    expect(single.trial_id).toMatch(/^trial-/);

    lab.addNote({ author: 'you', kind: 'hypothesis', text: 'Faster predator death lengthens the cycle.' });
    const allowed = (await runTool('sweep_parameter', { parameter: 'predator_death', from: 0.3, to: 1.2, steps: 4, watch: false })) as Result;
    expect(allowed.count).toBe(4);

    const proposal = (await runTool('notebook_add_entry', { kind: 'conclusion', text: 'The cycle lengthens as predators die faster.' })) as Result;
    expect(proposal.status).toBe('pending');
    const pending = (await runTool('get_lab_state', {})) as Result;
    expect(pending.pending_proposals.map((p: Result) => p.id)).toContain(proposal.entry_id);
    useLab.getState().resolveProposal(proposal.entry_id, 'accepted', 'The cycle lengthens as predators die faster, from 8.9 to 15 seasons.');
    const after = (await runTool('get_lab_state', {})) as Result;
    expect(after.pending_proposals).toEqual([]);
    expect(after.changes_since_last_read.some((c: string) => c.includes('accepted the proposed conclusion'))).toBe(true);
    const read = (await runTool('notebook_read', { entry_id: proposal.entry_id })) as Result;
    expect(read.status).toBe('accepted');
    expect(read.text).toContain('15 seasons');

    const observation = (await runTool('notebook_add_entry', { kind: 'observation', text: 'Peaks got taller.' })) as Result;
    expect(observation.status).toBeUndefined();
    const report = (await runTool('export_report', {})) as Result;
    expect(report.attribution.proposals.accepted_after_editing).toBe(1);
    expect(report.preview).toContain('# Trialbook lab report');

    lab.setAssignmentMode(false);
    useLab.getState().openExperiment('projectile', 'you');
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
    await settle();
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
