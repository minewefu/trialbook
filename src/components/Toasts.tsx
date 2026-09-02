import { useLab } from '../store';

/** What the agent just did, shown to the person as it happens. */
export function Toasts() {
  const toasts = useLab((s) => s.toasts);
  const dismiss = useLab((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.actor}`}>
          <span>{toast.text}</span>
          <button onClick={() => dismiss(toast.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
