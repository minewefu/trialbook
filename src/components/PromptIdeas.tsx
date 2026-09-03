import { useState } from 'react';
import type { ExperimentId } from '../sims/types';
import { useLab } from '../store';

const PROMPTS: Record<ExperimentId, string[]> = {
  projectile: [
    'Find the launch angle that gives the longest range with heavy drag, to within 0.1 degree. Plot every point you tried and record your conclusion in the notebook.',
    'Sweep the launch speed from 10 to 100 m/s without drag, fit a power law to the range, and write the law and its exponent in the notebook.',
    'With measurement error on, repeat the current trial 10 times and record the range as mean ± standard error in the notebook.',
    'What did I change on the sliders? Predict the effect, run a trial to check, and note the result.',
  ],
  pendulum: [
    'Sweep the length from 0.25 to 4 m in 8 steps, fit a power law to the period, and record the exponent and what it means in the notebook.',
    'Does the period depend on the release angle? Sweep the angle from 5 to 170 degrees, plot the period, and write your conclusion against the small-angle formula in the notebook.',
    'With measurement error on, sweep the length with 3 repeats per value, plot the period with error bars, fit the law to the means, and record it.',
    'What did I change on the sliders? Predict the effect on the period, run a trial to check, and note the result.',
  ],
  predator_prey: [
    'Sweep the predator death rate from 0.3 to 1.2, fit a line to the mean prey population, and record what the slope says about the equilibrium.',
    'Write a hypothesis about what happens to the prey minimum when predation doubles, test it with a sweep, plot it, and record your conclusion.',
    'Find the predator death rate that maximises the cycle length within the allowed range, then record the trend in the notebook.',
  ],
  rc_circuit: [
    'Sweep the resistance from 1 to 50 kΩ in 6 steps, fit a line to the time constant, and record what the slope says about the capacitance.',
    'Switch to discharge, run one trial, fit an exponential to that trial\'s voltage curve, and record the time constant you read from the fit.',
    'Does the supply voltage change the time constant? Write a hypothesis first, sweep it from 3 to 24 V, and record your conclusion.',
    'What did I change on the sliders? Predict the effect on the charging curve, run a trial to check, and note the result.',
  ],
};

export function PromptIdeas() {
  const experiment = useLab((s) => s.experiment);
  const assignmentMode = useLab((s) => s.assignmentMode);
  const prompts = experiment ? PROMPTS[experiment] : PROMPTS.projectile;
  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (index: number) => {
    try {
      await navigator.clipboard.writeText(prompts[index]);
      setCopied(index);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };
  return (
    <section className="card">
      <header className="card-head">
        <h2>Try asking your agent</h2>
      </header>
      <p className="muted small">
        Ask for the conclusion to be recorded in the notebook; that is what turns a chat answer into a lab entry
        {assignmentMode ? ', and in assignment mode into a proposal for you to accept or reject' : ''}.
      </p>
      {assignmentMode && (
        <p className="muted small">Assignment mode is on: write your hypothesis in the notebook first, then ask.</p>
      )}
      <ul className="prompts">
        {prompts.map((prompt, index) => (
          <li key={index}>
            <span className="small">{prompt}</span>
            <button className="linkish small" onClick={() => copy(index)}>
              {copied === index ? 'Copied' : 'Copy'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
