import { EXPERIMENTS, EXPERIMENT_ORDER } from '../sims';
import { formatMeasurements, summarizeParams } from '../sims/types';
import type { LabStore, NotebookEntry } from '../store';
import { round } from './format';

const MAX_TRIAL_ROWS = 40;
const MAX_CHART_ROWS = 25;

type ReportState = Pick<LabStore, 'trials' | 'sweeps' | 'charts' | 'notebook'> & Partial<Pick<LabStore, 'assignmentMode' | 'measurementError'>>;

/** Counts of who did what, for the report and for the export_report tool. */
export function buildAttribution(s: ReportState) {
  const by = (actor: 'you' | 'agent') => ({
    trials: s.trials.filter((t) => t.actor === actor).length,
    sweeps: s.sweeps.filter((w) => w.actor === actor && (w.kind ?? 'sweep') === 'sweep').length,
    optimisations: s.sweeps.filter((w) => w.actor === actor && w.kind === 'optimize').length,
    repeat_runs: s.sweeps.filter((w) => w.actor === actor && w.kind === 'repeats').length,
    charts: s.charts.filter((c) => c.actor === actor).length,
    notebook_entries: s.notebook.filter((n) => n.author === actor).length,
    hypotheses: s.notebook.filter((n) => n.author === actor && n.kind === 'hypothesis').length,
    conclusions: s.notebook.filter((n) => n.author === actor && n.kind === 'conclusion' && n.status !== 'rejected' && n.status !== 'pending').length,
  });
  const proposals = s.notebook.filter((n) => n.status !== undefined);
  return {
    person: by('you'),
    agent: by('agent'),
    proposals: {
      total: proposals.length,
      accepted: proposals.filter((n) => n.status === 'accepted' && !n.edited).length,
      accepted_after_editing: proposals.filter((n) => n.status === 'accepted' && n.edited).length,
      rejected: proposals.filter((n) => n.status === 'rejected').length,
      pending: proposals.filter((n) => n.status === 'pending').length,
    },
    noisy_trials: s.trials.filter((t) => t.noisy).length,
  };
}

function statusLabel(n: NotebookEntry): string {
  if (n.status === 'pending') return ' · proposed by the agent, awaiting your decision';
  if (n.status === 'rejected') return ' · proposed by the agent, rejected';
  if (n.status === 'accepted') return n.edited ? ' · proposed by the agent, accepted after editing' : ' · proposed by the agent, accepted';
  return '';
}

/** Builds a Markdown lab report from everything in the lab: trials, sweeps, charts and the notebook. */
export function buildReport(s: ReportState): string {
  const lines: string[] = [];
  const date = new Date();
  lines.push('# Trialbook lab report', '', `Generated ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '');
  lines.push(
    `${s.trials.length} trials, ${s.sweeps.length} sweeps, ${s.charts.length} charts, ${s.notebook.length} notebook entries.`,
    '',
  );
  const noisy = s.trials.filter((t) => t.noisy).length;
  if (noisy) {
    lines.push(
      `${noisy} trials were recorded with simulated measurement error: a synthetic reading resolution plus a small relative error, not a calibrated instrument model. The motion itself is exact.`,
      '',
    );
  }

  for (const meta of EXPERIMENT_ORDER) {
    const def = EXPERIMENTS[meta.id];
    const trials = s.trials.filter((t) => t.experiment === meta.id);
    if (!def || trials.length === 0) continue;
    lines.push(`## ${def.title}`, '', def.summary, '');

    const sweeps = s.sweeps.filter((w) => w.experiment === meta.id);
    if (sweeps.length) {
      lines.push('### Sweeps, optimisations and repeats', '');
      for (const w of sweeps) {
        const who = w.actor === 'agent' ? 'the agent' : 'you';
        const what =
          w.kind === 'optimize'
            ? `searched ${w.parameter} (${w.label ?? 'optimise'})`
            : w.kind === 'repeats'
              ? `${w.trialIds.length} repeated trials`
              : `${w.parameter} over ${[...new Set(w.values)].join(', ')}`;
        lines.push(`- **${w.id}** by ${who}: ${what} (${w.status}, ${w.trialIds.length} trials)`);
      }
      lines.push('');
    }

    lines.push('### Trials', '');
    const header = ['Trial', 'By', 'Parameters', ...def.measurements.map((m) => `${m.label} (${m.unit})`)];
    lines.push(`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`);
    for (const t of trials.slice(-MAX_TRIAL_ROWS)) {
      const cells = [
        t.id + (t.sweepId ? ` (${t.sweepId})` : '') + (t.noisy ? ' ±' : ''),
        t.actor === 'agent' ? 'agent' : 'you',
        summarizeParams(def, t.params),
        ...def.measurements.map((m) => (Number.isFinite(t.measurements[m.key]) ? String(round(t.measurements[m.key], 4)) : 'n/a')),
      ];
      lines.push(`| ${cells.join(' | ')} |`);
    }
    if (trials.length > MAX_TRIAL_ROWS) lines.push('', `Showing the last ${MAX_TRIAL_ROWS} of ${trials.length} trials.`);
    lines.push('');

    const charts = s.charts.filter((c) => c.experiment === meta.id);
    for (const c of charts) {
      lines.push(`### Chart ${c.id}: ${c.title}`, '');
      if (c.fit) lines.push(`Fit: \`${c.fit.equation}\` (${c.fit.model}, R² ${round(c.fit.r2, 4)}, n ${c.fit.n})`, '');
      const withSd = c.points.some((p) => p.sd !== undefined);
      lines.push(`| ${c.xLabel} | ${c.yLabel} |${withSd ? ' sd | n |' : ''}`, `| --- | --- |${withSd ? ' --- | --- |' : ''}`);
      for (const p of c.points.slice(0, MAX_CHART_ROWS)) {
        lines.push(`| ${p.label ?? round(p.x, 4)} | ${round(p.y, 4)} |${withSd ? ` ${p.sd !== undefined ? round(p.sd, 3) : ''} | ${p.n ?? 1} |` : ''}`);
      }
      lines.push('');
    }
  }

  if (s.notebook.length) {
    lines.push('## Lab notebook', '');
    for (const n of s.notebook) {
      const when = new Date(n.ts).toISOString().slice(0, 16).replace('T', ' ');
      const who = n.author === 'agent' ? 'Agent' : 'You';
      const def = n.experiment ? EXPERIMENTS[n.experiment] : undefined;
      const context = def && n.params ? ` _(${def.title}: ${summarizeParams(def, n.params)})_` : '';
      lines.push(`- **${when} · ${who} · ${n.kind}${statusLabel(n)}**${context}`, '', `  ${n.text.replace(/\n/g, '\n  ')}`, '');
    }
  }

  const a = buildAttribution(s);
  lines.push('## Who did what', '');
  lines.push('| | You | Agent |', '| --- | --- | --- |');
  lines.push(`| Trials run | ${a.person.trials} | ${a.agent.trials} |`);
  lines.push(`| Sweeps | ${a.person.sweeps} | ${a.agent.sweeps} |`);
  lines.push(`| Optimisations | ${a.person.optimisations} | ${a.agent.optimisations} |`);
  lines.push(`| Repeat runs | ${a.person.repeat_runs} | ${a.agent.repeat_runs} |`);
  lines.push(`| Charts | ${a.person.charts} | ${a.agent.charts} |`);
  lines.push(`| Hypotheses | ${a.person.hypotheses} | ${a.agent.hypotheses} |`);
  lines.push(`| Conclusions standing | ${a.person.conclusions} | ${a.agent.conclusions} |`);
  lines.push(`| Notebook entries | ${a.person.notebook_entries} | ${a.agent.notebook_entries} |`, '');
  if (a.proposals.total) {
    lines.push(
      `Assignment mode: the agent proposed ${a.proposals.total} conclusions; ${a.proposals.accepted} accepted as written, ${a.proposals.accepted_after_editing} accepted after editing, ${a.proposals.rejected} rejected, ${a.proposals.pending} still pending.`,
      '',
    );
  }

  const last = s.trials[s.trials.length - 1];
  if (last) {
    const def = EXPERIMENTS[last.experiment];
    if (def) lines.push('', `Latest trial: ${last.id}, ${formatMeasurements(def, last.measurements)}.`);
  }
  return lines.join('\n');
}

/** Triggers a file download in the browser. No-op outside a document (tests). */
export function downloadText(filename: string, text: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false;
  try {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
