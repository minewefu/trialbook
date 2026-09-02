import { projectile } from './projectile';
import type { ExperimentDef, ExperimentId } from './types';

/** Every experiment the lab will offer, in display order. Unavailable ones show as "coming soon". */
export const EXPERIMENT_ORDER: { id: ExperimentId; title: string; summary: string }[] = [
  { id: projectile.id, title: projectile.title, summary: projectile.summary },
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
];

export const EXPERIMENTS: Partial<Record<ExperimentId, ExperimentDef>> = { projectile };

export function mustDef(id: ExperimentId): ExperimentDef {
  const def = EXPERIMENTS[id];
  if (!def) {
    throw new Error(
      `The ${id} experiment is not available yet. Available experiments: ${Object.keys(EXPERIMENTS).join(', ')}.`,
    );
  }
  return def;
}
