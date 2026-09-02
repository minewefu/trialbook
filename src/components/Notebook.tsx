import { useState, type FormEvent } from 'react';
import { buildReport, downloadText } from '../lib/report';
import { EXPERIMENTS } from '../sims';
import { summarizeParams } from '../sims/types';
import { NOTE_KINDS, useLab, type NoteKind, type NotebookEntry } from '../store';

export function Notebook() {
  const notebook = useLab((s) => s.notebook);
  const trialCount = useLab((s) => s.trials.length);
  const addNote = useLab((s) => s.addNote);
  const updateNote = useLab((s) => s.updateNote);
  const deleteNote = useLab((s) => s.deleteNote);
  const [kind, setKind] = useState<NoteKind>('observation');
  const [text, setText] = useState('');
  const entries = [...notebook].reverse();

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
          </span>
          <button className="btn ghost small" onClick={exportReport} disabled={notebook.length === 0 && trialCount === 0}>
            Export report
          </button>
        </div>
      </header>
      <form className="note-form" onSubmit={submit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Write a hypothesis, an observation, or a question for your agent"
          aria-label="New notebook entry"
        />
        <div className="row between">
          <select value={kind} onChange={(e) => setKind(e.target.value as NoteKind)} aria-label="Entry kind">
            {NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button className="btn small" type="submit" disabled={!text.trim()}>
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
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function NoteItem({ entry, onSave, onDelete }: { entry: NotebookEntry; onSave: (text: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const def = entry.experiment ? EXPERIMENTS[entry.experiment] : undefined;
  const refs = [entry.trialId, entry.sweepId, entry.chartId].filter(Boolean).join(' · ');
  return (
    <li className={`note ${entry.author}`}>
      <div className="note-head">
        <span className={`badge ${entry.author === 'agent' ? 'badge-agent' : 'badge-you'}`}>
          {entry.author === 'agent' ? 'Agent' : 'You'}
        </span>
        <span className={`badge badge-kind kind-${entry.kind}`}>{entry.kind}</span>
        <span className="muted small">
          {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {entry.edited ? ' · edited' : ''}
        </span>
        <span className="spacer" />
        <button
          className="linkish small"
          onClick={() => {
            setDraft(entry.text);
            setEditing((e) => !e);
          }}
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
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
                onSave(draft);
                setEditing(false);
              }}
              disabled={!draft.trim()}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="note-text">{entry.text}</p>
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
