import { useRef } from 'react';
import { round } from '../../lib/format';
import type { Trial } from '../../store';
import { emptyMessage, lastTime, playbackProgress, sampleAt, themeColors, useCanvasLoop, usePlayback, type StageProps } from '../stageKit';

const HEIGHT = 340;

export function PredatorPreyStage({ trial, ghosts, watch, replayNonce }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const durationMs = trial ? 5000 : 0;
  const anim = usePlayback(trial, watch, replayNonce, durationMs);

  useCanvasLoop(canvasRef, HEIGHT, [trial, ghosts, watch, replayNonce], (ctx, w, h) => {
    const c = themeColors();
    if (!trial) {
      emptyMessage(ctx, w, h, 'Run a trial to start the seasons, or ask your agent to.');
      return false;
    }
    const progress = playbackProgress(anim);
    const total = lastTime(trial.series);
    const tNow = progress * total;
    const all = [trial, ...ghosts];
    let maxPrey = 1;
    let maxPred = 1;
    let maxT = total;
    for (const t of all) {
      for (const p of t.series) {
        if (p.prey > maxPrey) maxPrey = p.prey;
        if (p.predators > maxPred) maxPred = p.predators;
        if (p.t > maxT) maxT = p.t;
      }
    }
    maxPrey *= 1.08;
    maxPred *= 1.08;
    const yMax = Math.max(maxPrey, maxPred);

    const top = 26;
    const pad = 14;
    const leftW = w * 0.58;
    const left = { x: pad + 30, y: top + 8, w: leftW - pad - 40, h: h - top - 8 - 40 };
    const right = { x: leftW + 44, y: top + 8, w: w - leftW - 44 - pad, h: h - top - 8 - 40 };
    const preyColor = c.ok;
    const predColor = c.warn;

    // Left: populations over time.
    const tx = (t: number) => left.x + (t / maxT) * left.w;
    const ty = (v: number) => left.y + left.h - (v / yMax) * left.h;
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(left.x, left.y + left.h);
    ctx.lineTo(left.x + left.w, left.y + left.h);
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.font = `12px ${c.font}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${round(yMax, 3)}`, left.x - 6, left.y);
    ctx.fillText('0', left.x - 6, left.y + left.h);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('populations over seasons', left.x, left.y + left.h + 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${round(maxT, 3)} seasons`, left.x + left.w, left.y + left.h + 6);

    const drawSeries = (t: Trial, key: string, color: string, alpha: number, upTo: number, width: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      for (const p of t.series) {
        if (p.t > upTo) break;
        const x = tx(p.t);
        const y = ty(p[key]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };
    for (const g of ghosts) {
      drawSeries(g, 'prey', preyColor, 0.18, Infinity, 1);
      drawSeries(g, 'predators', predColor, 0.18, Infinity, 1);
    }
    drawSeries(trial, 'prey', preyColor, 0.25, Infinity, 1);
    drawSeries(trial, 'predators', predColor, 0.25, Infinity, 1);
    drawSeries(trial, 'prey', preyColor, 1, tNow, 2.2);
    drawSeries(trial, 'predators', predColor, 1, tNow, 2.2);

    // Right: phase plane, prey against predators, with the equilibrium marked.
    const px = (v: number) => right.x + (v / maxPrey) * right.w;
    const py = (v: number) => right.y + right.h - (v / maxPred) * right.h;
    ctx.strokeStyle = c.border;
    ctx.beginPath();
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + right.h);
    ctx.lineTo(right.x + right.w, right.y + right.h);
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('prey', right.x + right.w - 28, right.y + right.h + 6);
    ctx.save();
    ctx.translate(right.x - 6, right.y + 40);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'right';
    ctx.fillText('predators', 0, -10);
    ctx.restore();

    const drawOrbit = (t: Trial, alpha: number, upTo: number, width: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = t.actor === 'agent' ? c.agent : c.accent;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      for (const p of t.series) {
        if (p.t > upTo) break;
        const x = px(p.prey);
        const y = py(p.predators);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };
    for (const g of ghosts) drawOrbit(g, 0.2, Infinity, 1);
    drawOrbit(trial, 0.3, Infinity, 1);
    drawOrbit(trial, 1, tNow, 2);

    const eqPrey = Number(trial.params.predator_death) / Number(trial.params.predator_efficiency);
    const eqPred = Number(trial.params.prey_growth) / Number(trial.params.predation);
    if (Number.isFinite(eqPrey) && Number.isFinite(eqPred) && eqPrey <= maxPrey && eqPred <= maxPred) {
      ctx.strokeStyle = c.muted;
      ctx.beginPath();
      ctx.moveTo(px(eqPrey) - 5, py(eqPred));
      ctx.lineTo(px(eqPrey) + 5, py(eqPred));
      ctx.moveTo(px(eqPrey), py(eqPred) - 5);
      ctx.lineTo(px(eqPrey), py(eqPred) + 5);
      ctx.stroke();
    }
    ctx.fillStyle = trial.actor === 'agent' ? c.agent : c.accent;
    ctx.beginPath();
    ctx.arc(px(sampleAt(trial.series, 'prey', tNow)), py(sampleAt(trial.series, 'predators', tNow)), 5, 0, Math.PI * 2);
    ctx.fill();

    const m = trial.measurements;
    ctx.fillStyle = c.text;
    ctx.font = `13px ${c.font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `prey ${round(m.min_prey, 3)} to ${round(m.peak_prey, 3)} · predators ${round(m.min_predators, 3)} to ${round(m.peak_predators, 3)} · cycle ${Number.isFinite(m.oscillation_period) ? round(m.oscillation_period, 3) : 'n/a'} seasons`,
      pad,
      4,
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = c.muted;
    ctx.fillText(`season ${round(tNow, 3)}`, w - pad, 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = preyColor;
    ctx.fillText('prey', left.x + 6, left.y + 2);
    ctx.fillStyle = predColor;
    ctx.fillText('predators', left.x + 44, left.y + 2);
    return progress < 1;
  });

  return <canvas ref={canvasRef} className="stage-canvas" role="img" aria-label="Predator and prey populations over time and in the phase plane" />;
}
