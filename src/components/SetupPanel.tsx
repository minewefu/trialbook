import { hasWebMCP } from '../lib/webmcp';

export function SetupPanel() {
  return (
    <details className="card collapsible" id="connect" open={!hasWebMCP()}>
      <summary>
        <h2>Connect your agent</h2>
        <span className="muted small">{hasWebMCP() ? 'connected' : 'how to'}</span>
      </summary>
      <details open>
        <summary className="sub">ChatGPT desktop app (works out of the box)</summary>
        <ol className="small">
          <li>Open the built-in browser from the ChatGPT toolbar and load this page.</li>
          <li>A gray arrow appears in the address bar when the page offers site tools. Click it to see them.</li>
          <li>
            Ask ChatGPT, for example: <em>Read the lab state and tell me what you can do here.</em>
          </li>
        </ol>
        <p className="muted small">
          Needs the latest desktop app with GPT-5.6 Sol or Terra and "Enable site tools" switched on under
          Browser settings, Permissions. Not available on Enterprise or Edu workspaces.
        </p>
      </details>
      <details>
        <summary className="sub">Google Chrome 149 or newer (behind a flag)</summary>
        <ol className="small">
          <li>
            Enable <code>chrome://flags/#enable-webmcp-testing</code> and{' '}
            <code>chrome://flags/#devtools-webmcp-support</code>, then relaunch Chrome.
          </li>
          <li>Open DevTools, then Application, then WebMCP to see the registered tools and run them by hand.</li>
        </ol>
      </details>
      <details>
        <summary className="sub">Any other browser</summary>
        <p className="small">
          The Tools panel above lets you run every tool yourself. The status pill in the header tells you whether
          this browser exposes WebMCP.
        </p>
      </details>
    </details>
  );
}
