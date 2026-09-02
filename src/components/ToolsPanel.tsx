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
  return (
    <section className="card">
      <header className="card-head">
        <h2>Tools your agent can call</h2>
        <span className="muted small">{tools.length} live</span>
      </header>
      <p className="muted small">
        {global} lab-wide{scoped > 0 && title ? ` and ${scoped} for ${title}` : ''}, registered through{' '}
        <code>document.modelContext.registerTool</code>. Click a tool to read what it does and run it yourself; the
        call takes the same path the agent uses.
      </p>
      {tools.length === 0 ? (
        <p className="muted small">No tools registered yet.</p>
      ) : (
        <ul className="tool-list">
          {tools.map((entry) => (
            <ToolRow key={entry.def.name} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ToolRow({ entry }: { entry: ToolEntry }) {
  const { def } = entry;
  const [open, setOpen] = useState(false);
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
    <li className={`tool ${open ? 'open' : ''}`}>
      <div className="tool-row">
        <button className="linkish" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <code className="tool-name">{def.name}</code>
        </button>
        <span className={`badge ${readOnly ? 'badge-read' : 'badge-write'}`}>
          {readOnly ? 'read-only' : 'makes changes'}
        </span>
        {untrusted && <span className="badge badge-untrusted">returns people's text</span>}
        <span className="badge badge-group">{entry.group}</span>
        {!entry.inBrowser && (
          <span className="badge badge-local" title="Registered in the app only; this browser has no WebMCP">
            app only
          </span>
        )}
      </div>
      {open && (
        <div className="runner">
          <p className="muted small">{def.description}</p>
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
      )}
    </li>
  );
}
