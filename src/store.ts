import { create } from 'zustand';

export type Actor = 'you' | 'agent';
export type ExperimentId = 'projectile' | 'pendulum' | 'predator_prey';

export type Change = { ts: number; actor: Actor; text: string };

type LabStore = {
  version: string;
  experiment: ExperimentId | null;
  /** Human-readable changes since the agent last called get_lab_state. */
  changes: Change[];
  notebookCount: number;
  trialCount: number;
  recordChange: (actor: Actor, text: string) => void;
  /** Returns the pending changes and clears them. */
  takeChanges: () => Change[];
};

export const useLab = create<LabStore>()((set, get) => ({
  version: '0.1.0',
  experiment: null,
  changes: [],
  notebookCount: 0,
  trialCount: 0,
  recordChange: (actor, text) =>
    set((state) => ({ changes: [...state.changes, { ts: Date.now(), actor, text }].slice(-20) })),
  takeChanges: () => {
    const pending = get().changes;
    set({ changes: [] });
    return pending;
  },
}));
