import { useState } from 'react';
import type { ExperimentId } from '../sims/types';
import { useLab } from '../store';

const PROMPTS: Record<ExperimentId, string[]> = {
  projectile: [
    'Find the launch angle that gives the longest range with heavy drag, to within 0.1 degree. Then plot every point you tried and write your conclusion in the notebook.',
    'Sweep the launch speed from 10 to 100 m/s without drag, fit a power law to the range, and tell me the exponent and what it means.',
    'Turn on measurement error is my job; once I have, repeat the current trial 10 times and report the range as mean ± standard error.',
    'What did I change on the sliders? Predict the effect, then run a trial to check.',
  ],
  pendulum: [
    'Sweep the length from 0.25 to 4 m in 8 steps, fit a power law to the period, and tell me the exponent. Does it match 2π√(L/g)?',
    'Does the period depend on the release angle? Sweep the angle from 5 to 170 degrees, plot the period, and compare it with the small-angle formula in the notebook.',
    'With measurement error on, sweep the length with 3 repeats per value, plot the period with error bars, and fit the law to the means.',
    'What did I change on the sliders? Predict the effect on the period, then run a trial to check.',
  ],
  predator_prey: [
    'Sweep the predator death rate from 0.3 to 1.2 and fit a line to the mean prey population. What does the slope tell you about the equilibrium?',
    'Write a hypothesis about what happens to the prey minimum when predation doubles, then test it with a sweep and plot the result.',
    'Find the predator death rate that maximises the cycle length within the allowed range, then explain the trend.',
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
      {assignmentMode && (
        <p className="muted small">
          Assignment mode is on: write your hypothesis in the notebook first, then ask. Your agent's conclusions will
          arrive as proposals for you to accept or reject.
        </p>
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
