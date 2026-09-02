import { round } from '../lib/format';
import { EXPERIMENTS } from '../sims';
import { summarizeParams } from '../sims/types';
import { useLab, type Chart } from '../store';
import { LineChart } from './LineChart';

const ROWS = 12;

export function ResultsPanel() {
  const experiment = useLab((s) => s.experiment);
  const trials = useLab((s) => s.trials);
  const sweeps = useLab((s) => s.sweeps);
  const charts = useLab((s) => s.charts);
  const currentTrialId = useLab((s) => s.currentTrialId);
  const showTrial = useLab((s) => s.showTrial);
  const removeChart = useLab((s) => s.removeChart);
  const clearLab = useLab((s) => s.clearLab);

  const def = experiment ? EXPERIMENTS[experiment] : undefined;
  if (!def || !experiment) return null;

  const mine = trials.filter((t) => t.experiment === experiment);
  const rows = mine.slice(-ROWS).reverse();
  const myCharts = charts.filter((c) => c.experiment === experiment).reverse();
  const sweepCount = sweeps.filter((w) => w.experiment === experiment).length;

  return (
    <section className="card">
      <header className="card-head">
        <h2>Results</h2>
        <span className="muted small">
          {mine.length} {mine.length === 1 ? 'trial' : 'trials'} · {sweepCount} {sweepCount === 1 ? 'sweep' : 'sweeps'} ·{' '}
          {myCharts.length} {myCharts.length === 1 ? 'chart' : 'charts'}
        </span>
      </header>

      {myCharts.length > 0 && (
        <div className="charts">
          {myCharts.map((chart) => (
            <ChartCard key={chart.id} chart={chart} onRemove={() => removeChart(chart.id, 'you')} />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="muted small">No trials yet. Run one with the button above, or ask your agent to run a sweep.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Trial</th>
                <th>By</th>
                <th>Parameters</th>
                {def.measurements.map((m) => (
                  <th key={m.key}>
                    {m.label} <span className="muted">({m.unit})</span>
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className={t.id === currentTrialId ? 'current' : ''}>
                  <td className="mono">
                    {t.id}
                    {t.sweepId && <span className="muted small"> · {t.sweepId}</span>}
                  </td>
                  <td>
                    <span className={`badge ${t.actor === 'agent' ? 'badge-agent' : 'badge-you'}`}>{t.actor}</span>
                  </td>
                  <td className="small">{summarizeParams(def, t.params)}</td>
                  {def.measurements.map((m) => (
                    <td key={m.key} className="mono">
                      {Number.isFinite(t.measurements[m.key]) ? round(t.measurements[m.key], 4) : 'n/a'}
                    </td>
                  ))}
                  <td>
                    <button className="linkish small" onClick={() => showTrial(t.id)}>
                      Show
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mine.length > ROWS && (
        <p className="muted small">
          Showing the latest {ROWS} of {mine.length} trials. Your agent can read all of them with get_results.
        </p>
      )}
      {(trials.length > 0 || charts.length > 0) && (
        <div className="row end">
          <button
            className="linkish small muted"
            onClick={() => {
              if (window.confirm('Clear every trial, sweep, chart and notebook entry in this lab?')) clearLab();
            }}
          >
            Clear the lab
          </button>
        </div>
      )}
    </section>
  );
}

function ChartCard({ chart, onRemove }: { chart: Chart; onRemove: () => void }) {
  return (
    <figure className="chart-card">
      <figcaption className="row between">
        <span>
          <strong>{chart.title}</strong>{' '}
          <span className="muted small">
            {chart.id} · {chart.points.length} points · by {chart.actor === 'agent' ? 'your agent' : 'you'}
          </span>
        </span>
        <button className="linkish small" onClick={onRemove}>
          Remove
        </button>
      </figcaption>
      <LineChart points={chart.points} xLabel={chart.xLabel} yLabel={chart.yLabel} />
    </figure>
  );
}
