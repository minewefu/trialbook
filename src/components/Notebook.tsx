import { useState, type FormEvent } from 'react';
import { buildReport, downloadText } from '../lib/report';
import { EXPERIMENTS } from '../sims';
import { summarizeParams } from '../sims/types';
import { NOTE_KINDS, personHypotheses, useLab, type NoteKind, type NotebookEntry } from '../store';

export function Notebook() {
  const notebook = useLab((s) => s.notebook);
  const trialCount = useLab((s) => s.trials.length);
  const experiment = useLab((s) => s.experiment);
  const assignmentMode = useLab((s) => s.assignmentMode);
  const setAssignmentMode = useLab((s) => s.setAssignmentMode);
  const addNote = useLab((s) => s.addNote);
  const updateNote = useLab((s) => s.updateNote);
  const deleteNote = useLab((s) => s.deleteNote);
  const resolveProposal = useLab((s) => s.resolveProposal);
  const [kind, setKind] = useState<NoteKind>('observation');
  const [text, setText] = useState('');
  const entries = [...notebook].reverse();
  const pending = notebook.filter((n) => n.status === 'pending').length;
  const needsHypothesis = assignmentMode && personHypotheses(notebook, experiment).length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    addNote({ author: 'you', kind, text });
    setText('');
  };

  const exportReport = () => {
    downloadText('trialbook-report.md', buildReport(useLab.getState()));
    useLab.getState().recordChange('you', 'exported the lab report');
  };

  return (
    <section className="card notebook">
      <header className="card-head">
        <h2>Lab notebook</h2>
        <div className="row">
          <span className="muted small">
            {notebook.length} {notebook.length === 1 ? 'entry' : 'entries'}
            {pending > 0 ? ` · ${pending} to review` : ''}
          </span>
          <button className="btn ghost small" onClick={exportReport} disabled={notebook.length === 0 && trialCount === 0}>
            Export report
          </button>
        </div>
      </header>
      <label className="toggle small mode-toggle" title="Your agent proposes conclusions for you to accept, edit or reject, and needs your hypothesis before it runs a sweep.">
        <input type="checkbox" checked={assignmentMode} onChange={(e) => setAssignmentMode(e.target.checked)} /> Assignment mode: your
        agent proposes, you decide
      </label>
      {needsHypothesis && (
        <p className="small gate-hint">
          Write a hypothesis for this experiment first. Until you do, your agent can run single trials but not sweeps.
        </p>
      )}
      <form className="note-form" onSubmit={submit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={needsHypothesis ? 'Your hypothesis: what do you expect, and why?' : 'Write a hypothesis, an observation, or a question for your agent'}
          aria-label="New notebook entry"
        />
        <div className="row between">
          <select value={needsHypothesis && kind === 'observation' ? 'hypothesis' : kind} onChange={(e) => setKind(e.target.value as NoteKind)} aria-label="Entry kind">
            {NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button className="btn small" type="submit" disabled={!text.trim()} onClick={() => needsHypothesis && kind === 'observation' && setKind('hypothesis')}>
            Add entry
          </button>
        </div>
      </form>
      {entries.length === 0 ? (
        <p className="muted small">
          Nothing here yet. Entries from you and your agent appear together, newest first, each with the parameters in
          force at the time.
        </p>
      ) : (
        <ul className="notes">
          {entries.map((entry) => (
            <NoteItem
              key={entry.id}
              entry={entry}
              onSave={(t) => updateNote(entry.id, t)}
              onDelete={() => deleteNote(entry.id, 'you')}
              onResolve={(decision, edited) => resolveProposal(entry.id, decision, edited)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Time for today's entries; date and time for older ones, so yesterday's 07:00 cannot look newer than today's 06:50. */
function whenLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function statusBadge(entry: NotebookEntry) {
  if (!entry.status) return null;
  const label = entry.status === 'pending' ? 'proposed' : entry.status === 'accepted' ? (entry.edited ? 'accepted, edited' : 'accepted') : 'rejected';
  return <span className={`badge badge-${entry.status}`}>{label}</span>;
}

function NoteItem({
  entry,
  onSave,
  onDelete,
  onResolve,
}: {
  entry: NotebookEntry;
  onSave: (text: string) => void;
  onDelete: () => void;
  onResolve: (decision: 'accepted' | 'rejected', editedText?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const def = entry.experiment ? EXPERIMENTS[entry.experiment] : undefined;
  const refs = [entry.trialId, entry.sweepId, entry.chartId].filter(Boolean).join(' · ');
  const pending = entry.status === 'pending';
  return (
    <li className={`note ${entry.author} ${entry.status ?? ''}`}>
      <div className="note-head">
        <span className={`badge ${entry.author === 'agent' ? 'badge-agent' : 'badge-you'}`}>
          {entry.author === 'agent' ? 'Agent' : 'You'}
        </span>
        <span className={`badge badge-kind kind-${entry.kind}`}>{entry.kind}</span>
        {statusBadge(entry)}
        <span className="muted small">
          {whenLabel(entry.ts)}
          {entry.edited && !entry.status ? ' · edited' : ''}
        </span>
        <span className="spacer" />
        {!pending && (
          <button
            className="linkish small"
            onClick={() => {
              setDraft(entry.text);
              setEditing((e) => !e);
            }}
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
        <button className="linkish small" onClick={onDelete}>
          Delete
        </button>
      </div>
      {editing ? (
        <div className="runner">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} aria-label="Edit entry" />
          <div className="row">
            <button
              className="btn small"
              onClick={() => {
                if (pending) onResolve('accepted', draft);
                else onSave(draft);
                setEditing(false);
              }}
              disabled={!draft.trim()}
            >
              {pending ? 'Accept edited version' : 'Save'}
            </button>
            {pending && (
              <button className="btn ghost small" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="note-text">{entry.text}</p>
      )}
      {pending && !editing && (
        <div className="proposal-actions row">
          <span className="small muted">Your agent proposes this conclusion.</span>
          <button className="btn small" onClick={() => onResolve('accepted')}>
            Accept
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              setDraft(entry.text);
              setEditing(true);
            }}
          >
            Edit and accept
          </button>
          <button className="btn ghost small" onClick={() => onResolve('rejected')}>
            Reject
          </button>
        </div>
      )}
      {def && entry.params && (
        <p className="muted small note-context">
          {def.title}: {summarizeParams(def, entry.params)}
          {refs ? ` · ${refs}` : ''}
        </p>
      )}
    </li>
  );
}
