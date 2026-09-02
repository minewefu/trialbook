/** Round to a number of significant figures (default 4). Leaves non-finite values untouched. */
export function round(n: number, sig = 4): number {
  if (!Number.isFinite(n) || n === 0) return n;
  const digits = Math.ceil(Math.log10(Math.abs(n)));
  const decimals = Math.min(12, Math.max(0, sig - digits));
  return Number(n.toFixed(decimals));
}

/** Rounds every value; non-finite values (a measurement that does not apply) become null for the agent. */
export function roundAll(obj: Record<string, number>, sig = 4): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(obj)) out[key] = Number.isFinite(value) ? round(value, sig) : null;
  return out;
}

/** Shrinks a row-based result until its JSON fits the output budget. Returns the value and the row count used. */
export function fitToBudget<T>(build: (rows: number) => T, maxRows: number, budget = 1350, minRows = 1): { value: T; rows: number } {
  let rows = Math.max(minRows, maxRows);
  let value = build(rows);
  while (rows > minRows && JSON.stringify(value).length > budget) {
    rows -= 1;
    value = build(rows);
  }
  return { value, rows };
}

export function fmt(n: number, unit = '', sig = 3): string {
  const r = round(n, sig);
  return unit ? `${r} ${unit}` : String(r);
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

export function isoTime(ts: number): string {
  return new Date(ts).toISOString();
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Evenly spaced values from `from` to `to`, both ends included. */
export function linspace(from: number, to: number, steps: number): number[] {
  if (steps <= 1) return [from];
  const out: number[] = [];
  for (let i = 0; i < steps; i++) out.push(round(from + ((to - from) * i) / (steps - 1), 6));
  return out;
}

/** A "nice" tick step (1, 2 or 5 times a power of ten) close to the requested raw step. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const m = raw / power;
  const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return nice * power;
}
