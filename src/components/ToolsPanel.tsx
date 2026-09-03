import { useState } from 'react';
import { useRegistryVersion } from '../hooks/useRegistry';
import { listTools, runTool, type ToolEntry } from '../lib/webmcp';
import { EXPERIMENTS } from '../sims';
import { useLab } from '../store';

export function ToolsPanel() {
  useRegistryVersion();
  const experiment = useLab((s) => s.experiment);
  const tools = listTools();
  const global = tools.filter((t) => t.group === 'global').length;
  const scoped = tools.length - global;
  const title = experiment ? EXPERIMENTS[experiment]?.title : undefined;
  const [active, setActive] = useState<string | null>(null);
  const activeEntry = tools.find((t) => t.def.name === active);

  return (
    <section className="card">
      <header className="card-head">
        <h2>Tools your agent can call</h2>
        <span className="muted small">{tools.length} live</span>
      </header>
      <p className="muted tiny">
        {global} lab-wide{scoped > 0 && title ? ` and ${scoped} for ${title}` : ''}, registered through{' '}
        <code>document.modelContext.registerTool</code>. Green dot: read-only. Click one to read it or run it yourself.
      </p>
      {tools.length === 0 ? (
        <p className="muted small">No tools registered yet.</p>
      ) : (
        <div className="tool-chips">
          {tools.map((entry) => {
            const readOnly = entry.def.annotations?.readOnlyHint === true;
            return (
              <button
                key={entry.def.name}
                className={`tool-chip ${readOnly ? 'read' : 'write'} ${active === entry.def.name ? 'active' : ''}`}
                onClick={() => setActive(active === entry.def.name ? null : entry.def.name)}
                title={entry.def.description}
                aria-expanded={active === entry.def.name}
              >
                <span className="dot" />
                {entry.def.name}
              </button>
            );
          })}
        </div>
      )}
      {activeEntry && <ToolDetail key={activeEntry.def.name} entry={activeEntry} onClose={() => setActive(null)} />}
    </section>
  );
}

function ToolDetail({ entry, onClose }: { entry: ToolEntry; onClose: () => void }) {
  const { def } = entry;
  const [input, setInput] = useState(() => JSON.stringify(def.example ?? {}, null, 2));
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const readOnly = def.annotations?.readOnlyHint === true;
  const untrusted = def.annotations?.untrustedContentHint === true;

  async function run() {
    let parsed: unknown;
    try {
      parsed = input.trim() ? JSON.parse(input) : {};
    } catch (err) {
      setOutput(`Input is not valid JSON: ${(err as Error).message}`);
      return;
    }
    setBusy(true);
    try {
      const result = await runTool(def.name, parsed);
      setOutput(JSON.stringify(result, null, 2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tool-detail">
      <div className="tool-row">
        <code className="tool-name">{def.name}</code>
        <span className={`badge ${readOnly ? 'badge-read' : 'badge-write'}`}>{readOnly ? 'read-only' : 'makes changes'}</span>
        {untrusted && <span className="badge badge-untrusted">returns people's text</span>}
        <span className="badge badge-group">{entry.group}</span>
        {!entry.inBrowser && (
          <span className="badge badge-local" title="Registered in the app only; this browser has no WebMCP">
            app only
          </span>
        )}
        <span className="spacer" />
        <button className="linkish small" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted small">{def.description}</p>
      <div className="runner">
        <label className="small" htmlFor={`input-${def.name}`}>
          Input (JSON)
        </label>
        <textarea
          id={`input-${def.name}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          spellCheck={false}
        />
        <div className="row">
          <button className="btn small" onClick={run} disabled={busy}>
            {busy ? 'Running' : 'Run tool'}
          </button>
          <details className="small">
            <summary>Input schema</summary>
            <pre>{JSON.stringify(def.inputSchema, null, 2)}</pre>
          </details>
        </div>
        {output !== null && <pre className="output">{output}</pre>}
      </div>
    </div>
  );
}
