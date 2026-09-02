import { niceStep, round } from '../lib/format';
import type { ChartPoint } from '../store';

type Props = { points: ChartPoint[]; xLabel: string; yLabel: string };

const W = 640;
const H = 300;
const M = { l: 58, r: 18, t: 14, b: 46 };

function ticks(min: number, max: number, count: number): number[] {
  const step = niceStep((max - min) / count);
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** A small dependency-free SVG line chart that scales with its container. */
export function LineChart({ points, xLabel, yLabel }: Props) {
  if (points.length === 0) return <p className="muted small">No points to plot.</p>;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (xMax === xMin) {
    xMin -= 1;
    xMax += 1;
  }
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
      {points.length > 1 && <path d={path} className="series" />}
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} className="dot">
          <title>{`${p.label ?? round(p.x, 4)}: ${round(p.y, 4)}${p.trialId ? ` (${p.trialId})` : ''}`}</title>
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
