import { useState } from 'react';
import type { ExperimentId } from '../sims/types';
import { useLab } from '../store';

const PROMPTS: Record<ExperimentId, string[]> = {
  projectile: [
    'Find the launch angle that gives the longest range with heavy drag. Sweep the angle from 20 to 70 degrees in 5-degree steps, plot range against angle, and write your conclusion in the notebook.',
    'Run one trial with the current settings, then predict what changes on the Moon and test it.',
    'What did I change on the sliders? Predict the effect, then run a trial to check.',
    'Does launch height change the best angle? Write a hypothesis first, design a small experiment, run it, and record what you found.',
  ],
  pendulum: [
    'Does the period depend on the release angle? Sweep the angle from 5 to 170 degrees, plot the period, and compare it with the small-angle formula in the notebook.',
    'Check that the period scales with the square root of the length: sweep the length from 0.25 m to 4 m and plot the period.',
    'Add light damping and run a trial. Does the period change? Record what you measured.',
    'What did I change on the sliders? Predict the effect on the period, then run a trial to check.',
  ],
  predator_prey: [
    'Run a trial with the defaults, then plot how the oscillation period changes as the predator death rate rises.',
    'Write a hypothesis about what happens to the prey minimum when predation doubles, then test it with a sweep.',
  ],
};

export function PromptIdeas() {
  const experiment = useLab((s) => s.experiment);
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
