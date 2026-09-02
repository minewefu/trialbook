import { round } from './format';

export type FitModel = 'linear' | 'quadratic' | 'power' | 'exponential';
export const FIT_MODELS: readonly FitModel[] = ['linear', 'quadratic', 'power', 'exponential'];

export type Point = { x: number; y: number };

export type Fit = {
  model: FitModel;
  params: Record<string, number>;
  r2: number;
  adjustedR2: number;
  rmse: number;
  n: number;
  maxResidual: { x: number; residual: number };
};

const PARAM_COUNT: Record<FitModel, number> = { linear: 2, quadratic: 3, power: 2, exponential: 2 };

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function linearLeastSquares(xs: number[], ys: number[]): { intercept: number; slope: number } {
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxx += (xs[i] - mx) * (xs[i] - mx);
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) throw new Error('All x values are the same, so there is nothing to fit against.');
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/** Gaussian elimination with partial pivoting for a 3×3 system. */
function solve3(m: number[][], v: number[]): number[] {
  const a = m.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-300) throw new Error('The points do not determine a quadratic.');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c < 4; c++) a[r][c] -= f * a[col][c];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

export function evaluate(model: FitModel, params: Record<string, number>, x: number): number {
  switch (model) {
    case 'linear':
      return params.a + params.b * x;
    case 'quadratic':
      return params.a + params.b * x + params.c * x * x;
    case 'power':
      return params.A * Math.pow(x, params.p);
    case 'exponential':
      return params.A * Math.exp(params.k * x);
  }
}

/** Least-squares fit of one model. Power and exponential fits go through logs; scores use the original units. */
export function fitModel(points: Point[], model: FitModel): Fit {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const k = PARAM_COUNT[model];
  if (pts.length < k + 1) {
    throw new Error(`A ${model} fit needs at least ${k + 1} points with finite values; got ${pts.length}.`);
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  let params: Record<string, number>;
  if (model === 'linear') {
    const { intercept, slope } = linearLeastSquares(xs, ys);
    params = { a: intercept, b: slope };
  } else if (model === 'quadratic') {
    // Centre x first so large values (speeds up to 200) do not make the normal equations ill-conditioned.
    const m = mean(xs);
    const u = xs.map((x) => x - m);
    const S = (p: number) => u.reduce((s, ui) => s + ui ** p, 0);
    const T = (p: number) => u.reduce((s, ui, i) => s + ui ** p * ys[i], 0);
    const [a0, b0, c0] = solve3(
      [
        [u.length, S(1), S(2)],
        [S(1), S(2), S(3)],
        [S(2), S(3), S(4)],
      ],
      [T(0), T(1), T(2)],
    );
    params = { a: a0 - b0 * m + c0 * m * m, b: b0 - 2 * c0 * m, c: c0 };
  } else if (model === 'power') {
    if (pts.some((p) => p.x <= 0 || p.y <= 0)) {
      throw new Error('A power-law fit needs x and y above zero at every point. Try linear or quadratic, or leave out the zero points.');
    }
    const { intercept, slope } = linearLeastSquares(xs.map(Math.log), ys.map(Math.log));
    params = { A: Math.exp(intercept), p: slope };
  } else {
    if (pts.some((p) => p.y <= 0)) throw new Error('An exponential fit needs y above zero at every point.');
    const { intercept, slope } = linearLeastSquares(xs, ys.map(Math.log));
    params = { A: Math.exp(intercept), k: slope };
  }

  const my = mean(ys);
  let ssRes = 0;
  let ssTot = 0;
  let worst = { x: pts[0].x, residual: 0 };
  for (const p of pts) {
    const r = p.y - evaluate(model, params, p.x);
    ssRes += r * r;
    ssTot += (p.y - my) * (p.y - my);
    if (Math.abs(r) > Math.abs(worst.residual)) worst = { x: p.x, residual: r };
  }
  const n = pts.length;
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  const adjustedR2 = n - k - 1 > 0 ? 1 - ((1 - r2) * (n - 1)) / (n - k - 1) : r2;
  return { model, params, r2, adjustedR2, rmse: Math.sqrt(ssRes / n), n, maxResidual: worst };
}

/** Tries every applicable model and keeps the best adjusted R², preferring fewer parameters on ties. */
export function fitAuto(points: Point[]): { best: Fit; candidates: Partial<Record<FitModel, number>> } {
  const fits: Fit[] = [];
  const errors: string[] = [];
  for (const model of FIT_MODELS) {
    try {
      fits.push(fitModel(points, model));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (!fits.length) throw new Error(errors.join(' '));
  fits.sort((a, b) => b.adjustedR2 - a.adjustedR2 || PARAM_COUNT[a.model] - PARAM_COUNT[b.model]);
  const candidates: Partial<Record<FitModel, number>> = {};
  for (const f of fits) candidates[f.model] = round(f.r2, 4);
  return { best: fits[0], candidates };
}

const sig = (v: number) => String(round(v, 4));
const signed = (v: number) => (v < 0 ? `− ${sig(Math.abs(v))}` : `+ ${sig(v)}`);

/** Human-readable equation using the real variable names, e.g. `period_s = 2.006·length^0.5`. */
export function equationFor(fit: Fit, xName: string, yName: string): string {
  const p = fit.params;
  switch (fit.model) {
    case 'linear':
      return `${yName} = ${sig(p.a)} ${signed(p.b)}·${xName}`;
    case 'quadratic':
      return `${yName} = ${sig(p.a)} ${signed(p.b)}·${xName} ${signed(p.c)}·${xName}²`;
    case 'power':
      return `${yName} = ${sig(p.A)}·${xName}^${sig(p.p)}`;
    case 'exponential':
      return `${yName} = ${sig(p.A)}·e^(${sig(p.k)}·${xName})`;
  }
}

/** One or two sentences that say what the fitted parameters mean physically. */
export function readingFor(fit: Fit, xName: string, yName: string): string {
  const p = fit.params;
  const quality =
    fit.r2 > 0.999 ? 'The fit is essentially exact' : fit.r2 > 0.98 ? 'The fit is good' : fit.r2 > 0.9 ? 'The fit is rough' : 'The fit is poor';
  switch (fit.model) {
    case 'power': {
      const e = p.p;
      const law =
        Math.abs(e - 0.5) < 0.03
          ? `grows with the square root of ${xName}`
          : Math.abs(e - 1) < 0.03
            ? `is proportional to ${xName}`
            : Math.abs(e - 2) < 0.05
              ? `grows with the square of ${xName}`
              : Math.abs(e + 1) < 0.03
                ? `is inversely proportional to ${xName}`
                : Math.abs(e + 2) < 0.05
                  ? `falls with the square of ${xName}`
                  : `scales as ${xName} to the power ${sig(e)}`;
      return `${quality} (R² ${round(fit.r2, 4)}). The exponent ${sig(e)} means ${yName} ${law}.`;
    }
    case 'exponential': {
      const k = p.k;
      const kind = k < 0 ? 'decays' : 'grows';
      return `${quality} (R² ${round(fit.r2, 4)}). ${yName} ${kind} exponentially with ${xName}; the e-folding scale is ${sig(1 / Math.abs(k))} and the halving or doubling scale is ${sig(Math.LN2 / Math.abs(k))}.`;
    }
    case 'quadratic': {
      const vertex = p.c !== 0 ? -p.b / (2 * p.c) : Number.NaN;
      const shape = p.c < 0 ? 'a maximum' : 'a minimum';
      return `${quality} (R² ${round(fit.r2, 4)}). The parabola has ${shape} near ${xName} = ${sig(vertex)}.`;
    }
    case 'linear':
      return `${quality} (R² ${round(fit.r2, 4)}). Each unit of ${xName} changes ${yName} by ${sig(p.b)}.`;
  }
}
