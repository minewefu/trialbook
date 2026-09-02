/**
 * Deterministic, synthetic instrument noise for measurements.
 * This is a teaching approximation (a reading resolution plus a small relative error), not a
 * calibrated model of any real instrument. It is labelled as synthetic wherever it appears.
 */

export type NoiseSpec = { resolution?: number; relative?: number; integer?: boolean };

/** FNV-1a hash of a string, used to seed the generator from a trial id. */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample by Box–Muller. */
export function gaussian(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Applies relative error, then quantises to the reading resolution, then rounds to whole units if asked. */
export function perturb(value: number, spec: NoiseSpec, rng: () => number): number {
  if (!Number.isFinite(value)) return value;
  let out = value;
  if (spec.relative) out += gaussian(rng) * spec.relative * Math.abs(value);
  if (spec.resolution) {
    out += (rng() - 0.5) * spec.resolution;
    out = Math.round(out / spec.resolution) * spec.resolution;
  }
  if (spec.integer) out = Math.round(out);
  if (value >= 0 && out < 0) out = 0;
  return out;
}
