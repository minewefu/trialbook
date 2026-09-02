import type { ExperimentDef } from '../types';
import { runPendulum } from './engine';

export const pendulum: ExperimentDef = {
  id: 'pendulum',
  title: 'Pendulum',
  summary: 'Release a pendulum and time its swing. Vary length, amplitude, gravity and damping, and compare with the small-angle formula.',
  seriesKeys: ['t', 'angle', 'omega'],
  params: [
    {
      kind: 'number',
      key: 'length',
      label: 'Length',
      unit: 'm',
      min: 0.1,
      max: 10,
      step: 0.05,
      default: 1,
      description: 'Length of the pendulum in metres, 0.1 to 10.',
    },
    {
      kind: 'number',
      key: 'amplitude',
      label: 'Release angle',
      unit: 'deg',
      min: 1,
      max: 170,
      step: 1,
      default: 20,
      description: 'Angle from vertical at which the pendulum is released from rest, 1 to 170 degrees.',
    },
    {
      kind: 'number',
      key: 'gravity',
      label: 'Gravity',
      unit: 'm/s²',
      min: 0.1,
      max: 50,
      step: 0.01,
      default: 9.81,
      description: 'Gravitational acceleration in m/s². Earth 9.81, Moon 1.62, Mars 3.71, Jupiter 24.8.',
      presets: [
        { label: 'Earth', value: 9.81 },
        { label: 'Moon', value: 1.62 },
        { label: 'Mars', value: 3.71 },
        { label: 'Jupiter', value: 24.8 },
      ],
    },
    {
      kind: 'enum',
      key: 'damping',
      label: 'Damping',
      options: ['none', 'light', 'heavy'],
      default: 'none',
      description: 'Friction and air resistance: none, light (swings for a long time), heavy (dies out in a few swings).',
    },
  ],
  measurements: [
    { key: 'period_s', label: 'Period', unit: 's', description: 'Time for one full swing, measured from successive zero crossings.' },
    { key: 'small_angle_period_s', label: 'Small-angle period', unit: 's', description: 'The textbook value 2π√(L/g).' },
    { key: 'period_deviation_pct', label: 'Deviation', unit: '%', description: 'How much the measured period exceeds the small-angle formula.' },
    { key: 'max_speed_mps', label: 'Peak speed', unit: 'm/s', description: 'Fastest speed of the bob, at the bottom of the swing.' },
    { key: 'decay_time_s', label: 'Decay time', unit: 's', description: 'Time for the swing to shrink to 1/e of its starting amplitude. Empty without damping.' },
  ],
  run: runPendulum,
  noise: {
    period_s: { resolution: 0.01, relative: 0.005 },
    max_speed_mps: { resolution: 0.02, relative: 0.01 },
    decay_time_s: { resolution: 0.1, relative: 0.02 },
  },
  derive: (m) => ({
    ...m,
    period_deviation_pct: Number.isFinite(m.period_s)
      ? ((m.period_s - m.small_angle_period_s) / m.small_angle_period_s) * 100
      : Number.NaN,
  }),
  agentGuidance:
    'For small angles the period is 2π√(L/g): it depends on length and gravity but not on amplitude. At large angles the period grows, about 18% longer at 90 degrees. Damping shrinks the swing but barely changes the period.',
};
