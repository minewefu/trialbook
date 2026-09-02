import { useState } from 'react';

const PROMPTS = [
  'Find the launch angle that gives the longest range with heavy drag. Sweep the angle from 20 to 70 degrees in 5-degree steps, plot range against angle, and write your conclusion in the notebook.',
  'Run one trial with the current settings, then predict what changes on the Moon and test it.',
  'What did I change on the sliders? Predict the effect, then run a trial to check.',
  'Does launch height change the best angle? Write a hypothesis first, design a small experiment, run it, and record what you found.',
];

export function PromptIdeas() {
  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (index: number) => {
    try {
      await navigator.clipboard.writeText(PROMPTS[index]);
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
        {PROMPTS.map((prompt, index) => (
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
