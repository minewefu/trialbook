import { useEffect, useState } from 'react';
import { EXPERIMENTS } from '../sims';
import { defaultParams, type ParamValue } from '../sims/types';
import { useLab } from '../store';

export function ParameterPanel() {
  const experiment = useLab((s) => s.experiment);
  const params = useLab((s) => (s.experiment ? s.params[s.experiment] : undefined));
  const setParams = useLab((s) => s.setParams);
  const resetParams = useLab((s) => s.resetParams);
  const highlights = useLab((s) => s.highlights);
  const busy = useLab((s) => s.activeSweepId !== null);
  const measurementError = useLab((s) => s.measurementError);
  const setMeasurementError = useLab((s) => s.setMeasurementError);
  const [, tick] = useState(0);

  // Re-render once the agent's highlight has expired so the glow fades on time.
  useEffect(() => {
    const until = Math.max(0, ...Object.values(highlights));
    const wait = until - Date.now();
    if (wait <= 0) return;
    const timer = setTimeout(() => tick((n) => n + 1), wait + 20);
    return () => clearTimeout(timer);
  }, [highlights]);

  const def = experiment ? EXPERIMENTS[experiment] : undefined;
  if (!def || !experiment) return null;
  const values = params ?? defaultParams(def);
  const now = Date.now();

  const update = (key: string, value: ParamValue) => {
    try {
      setParams(experiment, { [key]: value }, 'you');
    } catch (err) {
      console.warn(err);
    }
  };

  return (
    <section className="card">
      <header className="card-head">
        <h2>Parameters</h2>
        <button className="btn ghost small" onClick={() => resetParams(experiment, 'you')} disabled={busy}>
          Reset to defaults
        </button>
      </header>
      <label
        className="toggle small mode-toggle"
        title="Adds a synthetic reading resolution and a small relative error to every new measurement, so repeats scatter and error bars mean something. The motion itself stays exact."
      >
        <input type="checkbox" checked={measurementError} onChange={(e) => setMeasurementError(e.target.checked, 'you')} disabled={busy} />{' '}
        Simulate measurement error on new readings <span className="muted">(synthetic noise)</span>
      </label>
      <div className="params">
        {def.params.map((spec) => {
          const hot = (highlights[spec.key] ?? 0) > now;
          const value = values[spec.key];
          return (
            <div key={spec.key} className={`param ${hot ? 'hot' : ''}`}>
              <div className="param-head">
                <label htmlFor={`param-${spec.key}`}>{spec.label}</label>
                <span className="param-value mono">
                  {spec.kind === 'number' ? `${value} ${spec.unit}` : String(value)}
                  {hot && <span className="badge badge-agent">agent</span>}
                </span>
              </div>
              {spec.kind === 'number' ? (
                <>
                  <input
                    id={`param-${spec.key}`}
                    type="range"
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    value={Number(value)}
                    disabled={busy}
                    onChange={(e) => update(spec.key, Number(e.target.value))}
                  />
                  {spec.presets && (
                    <div className="presets">
                      {spec.presets.map((preset) => (
                        <button
                          key={preset.label}
                          className={`chip ${Number(value) === preset.value ? 'active' : ''}`}
                          disabled={busy}
                          onClick={() => update(spec.key, preset.value)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="segmented" role="group" aria-label={spec.label} id={`param-${spec.key}`}>
                  {spec.options.map((option) => (
                    <button
                      key={option}
                      className={value === option ? 'active' : ''}
                      disabled={busy}
                      onClick={() => update(spec.key, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
              <p className="muted small">{spec.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
