import { ActivityLog } from './components/ActivityLog';
import { SetupPanel } from './components/SetupPanel';
import { StatusPill } from './components/StatusPill';
import { ToolsPanel } from './components/ToolsPanel';
import { PLANNED_EXPERIMENTS } from './tools/global';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={30} height={30} />
          <div>
            <h1>Trialbook</h1>
            <p className="tagline">Run experiments with your agent. Keep the lab notebook together.</p>
          </div>
        </div>
        <StatusPill />
      </header>

      <main className="layout">
        <section className="main-col">
          <div className="card hero">
            <h2>A science lab built for people and their agents</h2>
            <p>
              Trialbook is a browser lab where you and your AI agent run experiments side by side. You adjust the
              sliders and watch the simulation. Your agent, through WebMCP tools, sets parameters, runs trials and
              parameter sweeps, plots the results, and writes in the shared lab notebook under its own name.
            </p>
            <p className="muted small">
              Milestone 1 of 5: the WebMCP layer and the first tool are live. Experiments arrive next.
            </p>
          </div>

          <div className="card">
            <header className="card-head">
              <h2>Experiments</h2>
              <span className="muted small">coming next</span>
            </header>
            <ul className="experiments">
              {PLANNED_EXPERIMENTS.map((experiment) => (
                <li key={experiment.id}>
                  <strong>{experiment.title}</strong>
                  <span className="muted small">{experiment.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="side-col">
          <ToolsPanel />
          <SetupPanel />
          <ActivityLog />
        </aside>
      </main>

      <footer className="foot muted small">
        Trialbook is an open-source entry for the OpenAI WebMCP Challenge. Simulations are simplified teaching
        models, not engineering references. <a href="https://github.com/minewefu/trialbook">Source on GitHub</a>
      </footer>
    </div>
  );
}
