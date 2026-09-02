import { EXPERIMENTS } from '../sims';
import { STAGES } from '../sims/stages';
import { formatMeasurements } from '../sims/types';
import { useLab } from '../store';

export function SimStage() {
  const experiment = useLab((s) => s.experiment);
  const trials = useLab((s) => s.trials);
  const currentTrialId = useLab((s) => s.currentTrialId);
  const watch = useLab((s) => s.watchMode);
  const setWatch = useLab((s) => s.setWatchMode);
  const replayNonce = useLab((s) => s.replayNonce);
  const replay = useLab((s) => s.replay);
  const runTrial = useLab((s) => s.runTrial);
  const activeSweepId = useLab((s) => s.activeSweepId);
  const progress = useLab((s) => s.sweepProgress);
  const cancelSweep = useLab((s) => s.cancelSweep);

  const def = experiment ? EXPERIMENTS[experiment] : undefined;
  const Stage = experiment ? STAGES[experiment] : undefined;
  if (!def || !experiment || !Stage) {
    return (
      <section className="card">
        <p className="muted">Pick an experiment to begin.</p>
      </section>
    );
  }

  const trial = trials.find((t) => t.id === currentTrialId) ?? null;
  const sweepId = trial?.sweepId ?? activeSweepId;
  const related = trials.filter((t) => t.experiment === experiment && t.id !== trial?.id);
  const ghosts = sweepId ? related.filter((t) => t.sweepId === sweepId).slice(-49) : related.slice(-4);

  return (
    <section className="card stage">
      <header className="card-head">
        <div>
          <h2>{def.title}</h2>
          <p className="muted small">{def.summary}</p>
        </div>
        <div className="row">
          <label className="toggle small">
            <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} /> Watch trials
          </label>
          <button className="btn ghost" onClick={replay} disabled={!trial}>
            Replay
          </button>
          <button className="btn" onClick={() => runTrial(experiment, 'you')} disabled={activeSweepId !== null}>
            Run trial
          </button>
        </div>
      </header>
      <div className="stage-host">
        <Stage trial={trial} ghosts={ghosts} watch={watch} replayNonce={replayNonce} />
      </div>
      {activeSweepId && progress && (
        <div className="sweep-bar">
          <div className="row between">
            <span className="small">
              Your agent is running {activeSweepId}: {progress.done} of {progress.total} trials
            </span>
            <button className="btn ghost small" onClick={() => cancelSweep()}>
              Cancel sweep
            </button>
          </div>
          <progress value={progress.done} max={progress.total} />
        </div>
      )}
      {trial && (
        <p className="muted small stage-caption">
          Showing {trial.id} by {trial.actor === 'agent' ? 'your agent' : 'you'}
          {trial.label ? ` · ${trial.label}` : ''}: {formatMeasurements(def, trial.measurements)}
          {ghosts.length > 0 && ` · ${ghosts.length} earlier ${ghosts.length === 1 ? 'trial' : 'trials'} shown faintly`}
        </p>
      )}
    </section>
  );
}
