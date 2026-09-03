import type { ComponentType } from 'react';
import { PendulumStage } from './pendulum/Stage';
import { PredatorPreyStage } from './predator_prey/Stage';
import { ProjectileStage } from './projectile/Stage';
import { RcStage } from './rc_circuit/Stage';
import type { StageProps } from './stageKit';
import type { ExperimentId } from './types';

/** The animated view for each experiment. Kept apart from the experiment definitions so engines stay testable in Node. */
export const STAGES: Partial<Record<ExperimentId, ComponentType<StageProps>>> = {
  projectile: ProjectileStage,
  pendulum: PendulumStage,
  predator_prey: PredatorPreyStage,
  rc_circuit: RcStage,
};
