import { useRef } from 'react';
import { round } from '../../lib/format';
import {
  drawReadout,
  emptyMessage,
  inRect,
  lastTime,
  playbackProgress,
  sampleAt,
  themeColors,
  useCanvasLoop,
  usePlayback,
  usePointer,
  type StageProps,
} from '../stageKit';

const HEIGHT = 340;
const TO_RAD = Math.PI / 180;

export function PendulumStage({ trial, ghosts, watch, replayNonce }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointer = usePointer(canvasRef);
  const windowSeconds = trial ? lastTime(trial.series) : 0;
  const durationMs = trial ? Math.min(6000, Math.max(2500, windowSeconds * 1000)) : 0;
  const anim = usePlayback(trial, watch, replayNonce, durationMs);

  useCanvasLoop(canvasRef, HEIGHT, [trial, ghosts, watch, replayNonce, pointer], (ctx, w, h) => {
    const c = themeColors();
    if (!trial) {
      emptyMessage(ctx, w, h, 'Run a trial to release the pendulum, or ask your agent to.');
      return false;
    }
    const progress = playbackProgress(anim);
    const tNow = progress * windowSeconds;
    const all = [trial, ...ghosts];
    const maxLength = Math.max(...all.map((t) => Number(t.params.length) || 1));
    const maxAmplitude = Math.max(...all.map((t) => Number(t.params.amplitude) || 1));

    // Left: the swinging pendulum. Right: angle against time.
    const top = 26;
    const pad = 14;
    const leftW = Math.min(w * 0.42, h - top);
    const left = { x: pad, y: top, w: leftW - pad, h: h - top - pad };
    const right = { x: leftW + 16, y: top + 8, w: w - leftW - 16 - pad, h: h - top - 8 - 40 };

    // Hovering the time chart scrubs the pendulum to that instant.
    const hoverT =
      pointer && inRect(pointer.x, pointer.y, right, 8)
        ? Math.min(windowSeconds, Math.max(0, ((pointer.x - right.x) / right.w) * windowSeconds))
        : null;
    const tShow = hoverT ?? tNow;

    // Past 90 degrees the bob swings above the pivot, so the pivot moves to the centre to fit a full circle.
    const wide = maxAmplitude > 90;
    const pivot = { x: left.x + left.w / 2, y: wide ? left.y + left.h / 2 : left.y + 14 };
    const rodMax = wide ? Math.min(left.h / 2 - 16, left.w / 2 - 8) : Math.min(left.h - 36, left.w / 2 - 8);
    const rodFor = (length: number) => rodMax * (length / maxLength);

    const drawPendulum = (t: typeof trial, alpha: number, width: number) => {
      const R = rodFor(Number(t.params.length) || 1);
      const amplitude = (Number(t.params.amplitude) || 0) * TO_RAD;
      const angle = sampleAt(t.series, 'angle', tShow) * TO_RAD;
      const color = t.actor === 'agent' ? c.agent : c.accent;
      ctx.save();
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(pivot.x, pivot.y, R, Math.PI / 2 - amplitude, Math.PI / 2 + amplitude);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.strokeStyle = c.muted;
      const bx = pivot.x + R * Math.sin(angle);
      const by = pivot.y + R * Math.cos(angle);
      ctx.beginPath();
      ctx.moveTo(pivot.x, pivot.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx, by, 5 + 3 * width, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pivot.x - 18, pivot.y);
    ctx.lineTo(pivot.x + 18, pivot.y);
    ctx.stroke();
    for (const g of ghosts) drawPendulum(g, 0.22, 1);
    drawPendulum(trial, 1, 2);
    ctx.fillStyle = c.text;
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Strip chart: angle (deg) against time (s).
    const yMax = Math.max(5, maxAmplitude * 1.1);
    const sx = (t: number) => right.x + (t / Math.max(windowSeconds, 1e-9)) * right.w;
    const sy = (deg: number) => right.y + right.h / 2 - (deg / yMax) * (right.h / 2);
    ctx.strokeStyle = c.border;
    ctx.beginPath();
    ctx.moveTo(right.x, sy(0));
    ctx.lineTo(right.x + right.w, sy(0));
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + right.h);
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.font = `12px ${c.font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`+${round(yMax, 3)}°`, right.x + 4, right.y);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`-${round(yMax, 3)}°`, right.x + 4, right.y + right.h);
    ctx.textAlign = 'right';
    ctx.fillText(`${round(windowSeconds, 3)} s`, right.x + right.w, right.y + right.h + 16);
    ctx.textAlign = 'left';
    ctx.fillText('angle over time · hover to inspect', right.x, right.y + right.h + 16);

    const drawSeries = (t: typeof trial, alpha: number, upTo: number, width: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = t.actor === 'agent' ? c.agent : c.accent;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      for (const p of t.series) {
        if (p.t > upTo) break;
        const x = sx(p.t);
        const y = sy(p.angle);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };
    for (const g of ghosts.slice(-8)) drawSeries(g, 0.14, Infinity, 1);
    drawSeries(trial, 0.3, Infinity, 1);
    drawSeries(trial, 1, tShow, 2);
    ctx.strokeStyle = c.muted;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(tShow), right.y);
    ctx.lineTo(sx(tShow), right.y + right.h);
    ctx.stroke();
    ctx.setLineDash([]);

    const m = trial.measurements;
    const deviation = Number.isFinite(m.period_deviation_pct) ? `${m.period_deviation_pct >= 0 ? '+' : ''}${round(m.period_deviation_pct, 3)}%` : 'n/a';
    ctx.fillStyle = c.text;
    ctx.font = `13px ${c.font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `period ${Number.isFinite(m.period_s) ? round(m.period_s, 4) : 'n/a'} s · small-angle ${round(m.small_angle_period_s, 4)} s (${deviation}) · peak speed ${round(m.max_speed_mps, 3)} m/s`,
      pad,
      4,
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = c.muted;
    ctx.fillText(hoverT !== null ? `t = ${round(tShow, 3)} s · hover` : `t = ${round(tShow, 3)} s`, w - pad, 4);

    if (hoverT !== null && pointer) {
      const angle = sampleAt(trial.series, 'angle', tShow);
      const omega = sampleAt(trial.series, 'omega', tShow);
      const L = Number(trial.params.length) || 1;
      const color = trial.actor === 'agent' ? c.agent : c.accent;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(tShow), sy(angle), 6, 0, Math.PI * 2);
      ctx.stroke();
      drawReadout(
        ctx,
        w,
        h,
        pointer.x,
        pointer.y,
        [
          `t = ${round(tShow, 3)} s`,
          `angle ${round(angle, 4)}°`,
          `angular speed ${round(omega, 4)} rad/s`,
          `bob speed ${round(Math.abs(omega) * L, 4)} m/s · height ${round(L * (1 - Math.cos(angle * TO_RAD)), 4)} m`,
        ],
        c,
      );
    }
    return progress < 1;
  });

  return <canvas ref={canvasRef} className="stage-canvas" role="img" aria-label="Pendulum swing and angle over time" />;
}
