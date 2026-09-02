import { useRegistryVersion } from '../hooks/useRegistry';
import { browserToolCount, hasWebMCP, listTools } from '../lib/webmcp';

export function StatusPill() {
  useRegistryVersion();
  const supported = hasWebMCP();
  const total = listTools().length;
  const inBrowser = browserToolCount();

  if (!supported) {
    return (
      <span className="pill pill-off" title="This browser does not expose WebMCP. See Connect your agent.">
        Agent tools: not detected in this browser
      </span>
    );
  }
  if (total === 0) return <span className="pill pill-warn">Agent tools: connecting</span>;
  if (inBrowser === total) {
    return (
      <span className="pill pill-on">
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
