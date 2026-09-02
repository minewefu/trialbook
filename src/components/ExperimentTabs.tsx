import { EXPERIMENTS, EXPERIMENT_ORDER } from '../sims';
import { useLab } from '../store';

export function ExperimentTabs() {
  const experiment = useLab((s) => s.experiment);
  const open = useLab((s) => s.openExperiment);
  const busy = useLab((s) => s.activeSweepId !== null);
  return (
    <nav className="tabs" aria-label="Experiments">
      {EXPERIMENT_ORDER.map((meta) => {
        const available = Boolean(EXPERIMENTS[meta.id]);
        return (
          <button
            key={meta.id}
            className={`tab ${experiment === meta.id ? 'active' : ''}`}
            disabled={!available || busy}
            onClick={() => open(meta.id, 'you')}
            title={meta.summary}
          >
            {meta.title}
            {!available && <span className="soon">soon</span>}
          </button>
        );
      })}
    </nav>
  );
}
