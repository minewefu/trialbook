import { useRegistryVersion } from '../hooks/useRegistry';
import { getActivity } from '../lib/webmcp';

export function ActivityLog() {
  useRegistryVersion();
  const all = getActivity();
  const items = all.slice(0, 12);
  const last = all[0];
  return (
    <details className="card collapsible">
      <summary>
        <h2>Activity</h2>
        <span className="muted small">
          {all.length === 0 ? 'no calls yet' : all.length === 1 ? '1 call' : `${all.length} calls`}
          {last ? ` · last ${last.tool} by ${last.source === 'agent' ? 'agent' : 'panel'}` : ''}
        </span>
      </summary>
      {items.length === 0 ? (
        <p className="muted small">Tool calls from your agent and from the Tools panel appear here, newest first.</p>
      ) : (
        <ul className="activity">
          {items.map((item) => (
            <li key={item.id} className={item.ok ? '' : 'err'}>
              <span className="mono small">{new Date(item.ts).toLocaleTimeString()}</span>
              <span className={`badge ${item.source === 'agent' ? 'badge-agent' : 'badge-you'}`}>
                {item.source === 'agent' ? 'agent' : 'panel'}
              </span>
              <code>{item.tool}</code>
              <span className="muted small">{item.ms} ms</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
