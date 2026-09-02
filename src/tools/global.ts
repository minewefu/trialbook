import { registerTool } from '../lib/webmcp';
import { useLab } from '../store';

export const PLANNED_EXPERIMENTS = [
  {
    id: 'projectile',
    title: 'Projectile motion',
    summary: 'Launch speed, angle, gravity and drag. Measures range, flight time, max height and impact speed.',
  },
  {
    id: 'pendulum',
    title: 'Pendulum',
    summary: 'Length, amplitude, gravity and damping. Measures the period and compares it with the small-angle formula.',
  },
  {
    id: 'predator_prey',
    title: 'Predator and prey',
    summary: 'Lotka–Volterra populations. Measures peaks, minimums and the oscillation period.',
  },
] as const;

/** Tools that are available on every page state. Registered once at startup. */
export async function registerGlobalTools(): Promise<void> {
  await registerTool(
    {
      name: 'get_lab_state',
      description:
        'Read the current state of the Trialbook lab: which experiment is open, its parameters and latest measurements, how many notebook entries and stored trials exist, and what the person changed since your last read. Call this before acting.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      example: {},
      execute: async () => {
        const lab = useLab.getState();
        const changes = lab.takeChanges();
        return {
          app: 'Trialbook',
          version: lab.version,
          experiment: lab.experiment,
          parameters: null,
          latest_measurements: null,
          notebook_entries: lab.notebookCount,
          stored_trials: lab.trialCount,
          changes_since_last_read: changes.map((c) => `${c.actor}: ${c.text}`),
          planned_experiments: PLANNED_EXPERIMENTS.map((e) => e.id),
          next_step: lab.experiment
            ? 'Use the experiment tools to set parameters and run trials.'
            : 'No experiment is open yet. Experiment tools arrive with the next milestone of this app.',
        };
      },
    },
    'global',
  );
}
