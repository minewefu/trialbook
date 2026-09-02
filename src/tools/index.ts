import { swapGroup } from '../lib/webmcp';
import { EXPERIMENTS } from '../sims';
import { bootLab, useLab } from '../store';
import { experimentTools } from './experiment';
import { registerGlobalTools } from './global';

let queue: Promise<void> = Promise.resolve();
let registeredFor: string | null | undefined;

/** Keeps the "experiment" tool group in step with the open experiment. Swaps run one at a time. */
function syncExperimentTools(): Promise<void> {
  const id = useLab.getState().experiment;
  if (id === registeredFor) return queue;
  registeredFor = id;
  const def = id ? EXPERIMENTS[id] : undefined;
  queue = queue
    .then(() => swapGroup('experiment', def ? experimentTools(def) : []))
    .catch((err) => console.warn('[tools] experiment tool swap failed', err));
  return queue;
}

/** Registers every tool once. Safe to call from module scope before React mounts. */
export async function initTools(): Promise<void> {
  bootLab();
  await registerGlobalTools();
  useLab.subscribe(() => {
    void syncExperimentTools();
  });
  await syncExperimentTools();
}
