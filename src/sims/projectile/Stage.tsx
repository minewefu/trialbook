import { useRef } from 'react';
import { niceStep, round } from '../../lib/format';
import type { Trial } from '../../store';
import { emptyMessage, playbackProgress, sampleAt, themeColors, useCanvasLoop, usePlayback, type StageProps } from '../stageKit';

const HEIGHT = 340;

export function ProjectileStage({ trial, ghosts, watch, replayNonce }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const durationMs = trial ? Math.min(3500, Math.max(1200, trial.measurements.flight_time_s * 450)) : 0;
  const anim = usePlayback(trial, watch, replayNonce, durationMs);

  useCanvasLoop(canvasRef, HEIGHT, [trial, ghosts, watch, replayNonce], (ctx, w, h) => {
    const c = themeColors();
    if (!trial) {
      emptyMessage(ctx, w, h, 'Run a trial to launch the ball, or ask your agent to.');
      return false;
    }

    let maxX = 10;
    let maxY = 5;
    for (const t of [trial, ...ghosts]) {
      for (const p of t.series) {
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    const launchHeight = Number(trial.params.height) || 0;
    if (launchHeight > maxY) maxY = launchHeight;
    maxX *= 1.06;
    maxY *= 1.18;
    const pad = { l: 52, r: 20, t: 24, b: 36 };
    const scale = Math.min((w - pad.l - pad.r) / maxX, (h - pad.t - pad.b) / maxY);
    const px = (x: number) => pad.l + x * scale;
    const py = (y: number) => h - pad.b - y * scale;

    ctx.font = `12px ${c.font}`;
    ctx.lineWidth = 1;
    ctx.strokeStyle = c.border;
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xStep = niceStep(maxX / 6);
    for (let x = 0; x <= maxX + 1e-9; x += xStep) {
      const X = px(x);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(X, pad.t);
      ctx.lineTo(X, py(0));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(`${round(x, 3)} m`, X, py(0) + 6);
    }
    const yStep = niceStep(maxY / 4);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = yStep; y <= maxY + 1e-9; y += yStep) {
      const Y = py(y);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y);
      ctx.lineTo(w - pad.r, Y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(`${round(y, 3)}`, pad.l - 6, Y);
    }
    ctx.strokeStyle = c.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad.l, py(0));
    ctx.lineTo(w - pad.r, py(0));
    ctx.stroke();

    const drawPath = (t: Trial, color: string, alpha: number, upTo: number, width: number, dashed = false) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dashed) ctx.setLineDash([4, 6]);
      ctx.beginPath();
      let started = false;
      for (const p of t.series) {
        if (p.t > upTo) break;
        if (!started) {
          ctx.moveTo(px(p.x), py(p.y));
          started = true;
        } else {
          ctx.lineTo(px(p.x), py(p.y));
        }
      }
      ctx.stroke();
      ctx.restore();
    };
    for (const g of ghosts) drawPath(g, g.actor === 'agent' ? c.agent : c.accent, 0.22, Infinity, 1.5);

    const progress = playbackProgress(anim);
    const tNow = progress * trial.measurements.flight_time_s;
    const color = trial.actor === 'agent' ? c.agent : c.accent;
    drawPath(trial, color, 0.35, Infinity, 1.5, true);
    drawPath(trial, color, 1, tNow, 2.5);

    ctx.fillStyle = c.muted;
    ctx.beginPath();
    ctx.arc(px(0), py(launchHeight), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px(sampleAt(trial.series, 'x', tNow)), py(sampleAt(trial.series, 'y', tNow)), 6, 0, Math.PI * 2);
    ctx.fill();

    const m = trial.measurements;
    ctx.font = `13px ${c.font}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = c.text;
    ctx.fillText(
      `range ${round(m.range_m, 4)} m · max height ${round(m.max_height_m, 4)} m · flight ${round(m.flight_time_s, 4)} s`,
      pad.l,
      4,
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = c.muted;
    ctx.fillText(`t = ${round(tNow, 3)} s`, w - pad.r, 4);
    return progress < 1;
  });

  return <canvas ref={canvasRef} className="stage-canvas" role="img" aria-label="Projectile trajectory" />;
}
