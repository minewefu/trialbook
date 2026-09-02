import { useState } from 'react';
import { useRegistryVersion } from '../hooks/useRegistry';
import { listTools, runTool, type ToolEntry } from '../lib/webmcp';

export function ToolsPanel() {
  useRegistryVersion();
  const tools = listTools();
  return (
    <section className="card">
      <header className="card-head">
        <h2>Tools your agent can call</h2>
        <span className="muted small">{tools.length} live</span>
      </header>
      <p className="muted small">
        Registered through <code>document.modelContext.registerTool</code>. You can run any of them here
        without an agent; the call goes through the same code path.
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
    <li className="tool">
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
      <p className="muted small">{def.description}</p>
      {open && (
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
            <button className="btn" onClick={run} disabled={busy}>
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
