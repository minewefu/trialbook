import { EXPERIMENTS, EXPERIMENT_ORDER } from '../sims';
import { formatMeasurements, summarizeParams } from '../sims/types';
import type { LabStore } from '../store';
import { round } from './format';

const MAX_TRIAL_ROWS = 40;
const MAX_CHART_ROWS = 25;

/** Builds a Markdown lab report from everything in the lab: trials, sweeps, charts and the notebook. */
export function buildReport(s: Pick<LabStore, 'trials' | 'sweeps' | 'charts' | 'notebook'>): string {
  const lines: string[] = [];
  const date = new Date();
  lines.push('# Trialbook lab report', '', `Generated ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '');
  lines.push(
    `${s.trials.length} trials, ${s.sweeps.length} sweeps, ${s.charts.length} charts, ${s.notebook.length} notebook entries.`,
    '',
  );

  for (const meta of EXPERIMENT_ORDER) {
    const def = EXPERIMENTS[meta.id];
    const trials = s.trials.filter((t) => t.experiment === meta.id);
    if (!def || trials.length === 0) continue;
    lines.push(`## ${def.title}`, '', def.summary, '');

    const sweeps = s.sweeps.filter((w) => w.experiment === meta.id);
    if (sweeps.length) {
      lines.push('### Sweeps', '');
      for (const w of sweeps) {
        lines.push(`- **${w.id}** by ${w.actor === 'agent' ? 'the agent' : 'you'}: ${w.parameter} over ${w.values.join(', ')} (${w.status}, ${w.trialIds.length} trials)`);
      }
      lines.push('');
    }

    lines.push('### Trials', '');
    const header = ['Trial', 'By', 'Parameters', ...def.measurements.map((m) => `${m.label} (${m.unit})`)];
    lines.push(`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`);
    for (const t of trials.slice(-MAX_TRIAL_ROWS)) {
      const cells = [
        t.id + (t.sweepId ? ` (${t.sweepId})` : ''),
        t.actor === 'agent' ? 'agent' : 'you',
        summarizeParams(def, t.params),
        ...def.measurements.map((m) => String(round(t.measurements[m.key], 4))),
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
      lines.push(`- **${when} · ${who} · ${n.kind}**${context}`, '', `  ${n.text.replace(/\n/g, '\n  ')}`, '');
    }
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
