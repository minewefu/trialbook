import { useRegistryVersion } from '../hooks/useRegistry';
import { browserToolCount, hasWebMCP, listTools } from '../lib/webmcp';

export function StatusPill() {
  useRegistryVersion();
  const supported = hasWebMCP();
  const total = listTools().length;
  const inBrowser = browserToolCount();

  if (!supported) {
    return (
      <a className="pill pill-off" href="#connect" title="This browser does not expose WebMCP. See how to connect an agent.">
        Agent tools: not detected in this browser · how to connect
      </a>
    );
  }
  if (total === 0) return <span className="pill pill-warn">Agent tools: connecting</span>;
  if (inBrowser === total) {
    return (
      <span className="pill pill-on" title="Every tool below is registered with this browser's WebMCP.">
        Agent tools: connected · {total} registered
      </span>
    );
  }
  return (
    <span className="pill pill-warn">
      Agent tools: {inBrowser} of {total} registered
    </span>
  );
}
