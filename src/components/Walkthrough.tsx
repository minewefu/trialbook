import { useState } from 'react';

const KEY = 'trialbook-walkthrough-dismissed';

/** A first-visit card that explains the lab in three steps. Dismissed once per browser. */
export function Walkthrough() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* private mode: the card simply returns next visit */
    }
    setDismissed(true);
  };
  return (
    <section className="card walkthrough" aria-label="How Trialbook works">
      <header className="card-head">
        <h2>A science lab for you and your agent</h2>
        <button className="btn ghost small" onClick={dismiss}>
          Got it
        </button>
      </header>
      <ol className="steps">
        <li>
          <strong>Pick an experiment and move a slider.</strong> Run a trial and watch it play out on the stage.
        </li>
        <li>
          <strong>Bring your agent.</strong> Open this page in ChatGPT's built-in browser, or in Chrome with WebMCP
          enabled, and ask it to run a sweep, plot the results, or test a hypothesis. It works through the tools
          listed under "Tools your agent can call".
        </li>
        <li>
          <strong>Keep one notebook.</strong> You both write hypotheses, observations and conclusions. Every entry
          records who wrote it and the settings at the time, and the report exports as Markdown.
        </li>
      </ol>
      <p className="muted small">
        Your agent's changes glow purple and yours are blue. The agent is told what you changed since it last looked.
      </p>
    </section>
  );
}
