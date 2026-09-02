import { evaluate } from '../lib/fit';
import { niceStep, round } from '../lib/format';
import type { ChartFit, ChartPoint } from '../store';

type Props = { points: ChartPoint[]; xLabel: string; yLabel: string; fit?: ChartFit };

const W = 640;
const H = 300;
const M = { l: 58, r: 18, t: 14, b: 46 };
const CURVE_SAMPLES = 80;

function ticks(min: number, max: number, count: number): number[] {
  const step = niceStep((max - min) / count);
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** A small dependency-free SVG chart: points, optional error bars, and an optional fitted curve. */
export function LineChart({ points, xLabel, yLabel, fit }: Props) {
  if (points.length === 0) return <p className="muted small">No points to plot.</p>;
  const xs = points.map((p) => p.x);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  if (xMax === xMin) {
    xMin -= 1;
    xMax += 1;
  }

  const curve: { x: number; y: number }[] = [];
  if (fit) {
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const x = xMin + ((xMax - xMin) * i) / CURVE_SAMPLES;
      const y = evaluate(fit.model, fit.params, x);
      if (Number.isFinite(y)) curve.push({ x, y });
    }
  }

  const ys = [...points.map((p) => p.y + (p.sd ?? 0)), ...points.map((p) => p.y - (p.sd ?? 0)), ...curve.map((c) => c.y)];
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMax === yMin) {
    yMin -= Math.abs(yMin) * 0.1 || 1;
    yMax += Math.abs(yMax) * 0.1 || 1;
  }
  const yPad = (yMax - yMin) * 0.08;
  yMin -= yPad;
  yMax += yPad;

  const sx = (x: number) => M.l + ((x - xMin) / (xMax - xMin)) * (W - M.l - M.r);
  const sy = (y: number) => H - M.b - ((y - yMin) / (yMax - yMin)) * (H - M.t - M.b);
  const categorical = points.length <= 14 && points.every((p) => p.label && Number.isInteger(p.x));
  const xTicks = categorical ? points.map((p) => p.x) : ticks(xMin, xMax, 6);
  const yTicks = ticks(yMin, yMax, 5);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const curvePath = curve.map((c, i) => `${i ? 'L' : 'M'}${sx(c.x).toFixed(1)} ${sy(c.y).toFixed(1)}`).join(' ');
  const labelFor = (x: number) => (categorical ? (points.find((p) => p.x === x)?.label ?? '') : String(round(x, 4)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${yLabel} against ${xLabel}`}>
      {yTicks.map((y) => (
        <g key={`y${y}`}>
          <line x1={M.l} x2={W - M.r} y1={sy(y)} y2={sy(y)} className="grid" />
          <text x={M.l - 8} y={sy(y)} className="tick" textAnchor="end" dominantBaseline="middle">
            {round(y, 4)}
          </text>
        </g>
      ))}
      {xTicks.map((x) => (
        <g key={`x${x}`}>
          <line x1={sx(x)} x2={sx(x)} y1={M.t} y2={H - M.b} className="grid" />
          <text x={sx(x)} y={H - M.b + 16} className="tick" textAnchor="middle">
            {labelFor(x)}
          </text>
        </g>
      ))}
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="axis" />
      <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="axis" />
      {curve.length > 1 && <path d={curvePath} className="fitline" />}
      {points.length > 1 && !fit && <path d={path} className="series" />}
      {points.map((p, i) =>
        p.sd !== undefined && p.sd > 0 ? (
          <g key={`e${i}`} className="errorbar">
            <line x1={sx(p.x)} x2={sx(p.x)} y1={sy(p.y - p.sd)} y2={sy(p.y + p.sd)} />
            <line x1={sx(p.x) - 4} x2={sx(p.x) + 4} y1={sy(p.y - p.sd)} y2={sy(p.y - p.sd)} />
            <line x1={sx(p.x) - 4} x2={sx(p.x) + 4} y1={sy(p.y + p.sd)} y2={sy(p.y + p.sd)} />
          </g>
        ) : null,
      )}
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} className="dot">
          <title>{`${p.label ?? round(p.x, 4)}: ${round(p.y, 4)}${p.sd !== undefined ? ` ± ${round(p.sd, 3)} (n=${p.n})` : ''}${p.trialId ? ` (${p.trialId})` : ''}`}</title>
        </circle>
      ))}
      <text x={(M.l + W - M.r) / 2} y={H - 8} className="axis-label" textAnchor="middle">
        {xLabel}
      </text>
      <text
        x={14}
        y={(M.t + H - M.b) / 2}
        className="axis-label"
        textAnchor="middle"
        transform={`rotate(-90 14 ${(M.t + H - M.b) / 2})`}
      >
        {yLabel}
      </text>
    </svg>
  );
}
