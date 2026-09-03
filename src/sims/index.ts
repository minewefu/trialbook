import { pendulum } from './pendulum';
import { predatorPrey } from './predator_prey';
import { projectile } from './projectile';
import { rcCircuit } from './rc_circuit';
import type { ExperimentDef, ExperimentId } from './types';

/** Every experiment the lab offers, in display order. */
export const EXPERIMENT_ORDER: { id: ExperimentId; title: string; summary: string }[] = [
  { id: projectile.id, title: projectile.title, summary: projectile.summary },
  { id: pendulum.id, title: pendulum.title, summary: pendulum.summary },
  { id: predatorPrey.id, title: predatorPrey.title, summary: predatorPrey.summary },
  { id: rcCircuit.id, title: rcCircuit.title, summary: rcCircuit.summary },
];

export const EXPERIMENTS: Partial<Record<ExperimentId, ExperimentDef>> = {
  projectile,
  pendulum,
  predator_prey: predatorPrey,
  rc_circuit: rcCircuit,
};

export function mustDef(id: ExperimentId): ExperimentDef {
  const def = EXPERIMENTS[id];
  if (!def) {
    throw new Error(
      `The ${id} experiment is not available. Available experiments: ${Object.keys(EXPERIMENTS).join(', ')}.`,
    );
  }
  return def;
}
