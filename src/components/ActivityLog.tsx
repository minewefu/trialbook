import { useRegistryVersion } from '../hooks/useRegistry';
import { getActivity } from '../lib/webmcp';

export function ActivityLog() {
  useRegistryVersion();
  const all = getActivity();
  const items = all.slice(0, 12);
  return (
    <section className="card">
      <header className="card-head">
        <h2>Activity</h2>
        <span className="muted small">{all.length ? `${all.length} calls` : 'no calls yet'}</span>
      </header>
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
    </section>
  );
}
