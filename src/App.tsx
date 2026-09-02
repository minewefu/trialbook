import { ActivityLog } from './components/ActivityLog';
import { ExperimentTabs } from './components/ExperimentTabs';
import { Notebook } from './components/Notebook';
import { ParameterPanel } from './components/ParameterPanel';
import { PromptIdeas } from './components/PromptIdeas';
import { ResultsPanel } from './components/ResultsPanel';
import { SetupPanel } from './components/SetupPanel';
import { SimStage } from './components/SimStage';
import { StatusPill } from './components/StatusPill';
import { Toasts } from './components/Toasts';
import { ToolsPanel } from './components/ToolsPanel';

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

      <ExperimentTabs />

      <main className="layout">
        <section className="main-col">
          <SimStage />
          <ParameterPanel />
          <ResultsPanel />
        </section>
        <aside className="side-col">
          <Notebook />
          <PromptIdeas />
          <ToolsPanel />
          <SetupPanel />
          <ActivityLog />
        </aside>
      </main>

      <Toasts />

      <footer className="foot muted small">
        Trialbook is an open-source entry for the OpenAI WebMCP Challenge. Simulations are simplified teaching
        models, not engineering references. <a href="https://github.com/minewefu/trialbook">Source on GitHub</a>
      </footer>
    </div>
  );
}
