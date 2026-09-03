import { useEffect, useRef, useState } from 'react';
import { niceStep, round } from '../../lib/format';
import type { Trial } from '../../store';
import {
  drawReadout,
  emptyMessage,
  fixed,
  nearestPoint,
  playbackProgress,
  sampleAt,
  themeColors,
  useCanvasLoop,
  usePlayback,
  usePointer,
  type StageProps,
} from '../stageKit';

const HEIGHT = 340;
const ZOOM_MIN = 1;
const ZOOM_MAX = 25;
const READOUT_WIDTH = 300;

type View = { zoom: number; offX: number; offY: number };
type FitMode = 'auto' | 'trial' | 'all';
const HOME: View = { zoom: 1, offX: 0, offY: 0 };

export function ProjectileStage({ trial, ghosts, watch, replayNonce }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointer = usePointer(canvasRef);
  const durationMs = trial ? Math.min(3500, Math.max(1200, trial.measurements.flight_time_s * 450)) : 0;
  const anim = usePlayback(trial, watch, replayNonce, durationMs);
  const [fitMode, setFitMode] = useState<FitMode>('auto');
  const [view, setView] = useState<View>(HOME);
  const viewRef = useRef(view);
  viewRef.current = view;
  const layoutRef = useRef<{ scale: number; baseOriginX: number; baseOriginY: number } | null>(null);

  // A sweep is best seen as a whole; anything else is scaled to the trial being shown.
  const sweepSiblings = Boolean(trial?.sweepId && ghosts.some((g) => g.sweepId === trial.sweepId));
  const mode: 'trial' | 'all' = fitMode === 'auto' ? (sweepSiblings ? 'all' : 'trial') : fitMode;
  const zoomed = view.zoom !== 1 || view.offX !== 0 || view.offY !== 0;

  useEffect(() => {
    setView(HOME);
  }, [trial?.id]);

  // Scroll to zoom around the cursor, drag to pan.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let drag: { x: number; y: number; offX: number; offY: number } | null = null;
    const onWheel = (e: WheelEvent) => {
      const layout = layoutRef.current;
      if (!layout) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const v = viewRef.current;
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * Math.exp(-e.deltaY * 0.0015)));
      if (zoom === v.zoom) return;
      const s = layout.scale * v.zoom;
      const s2 = layout.scale * zoom;
      const originX = layout.baseOriginX + v.offX;
      const originY = layout.baseOriginY + v.offY;
      const wx = (mx - originX) / s;
      const wy = (originY - my) / s;
      const next: View = { zoom, offX: mx - wx * s2 - layout.baseOriginX, offY: my + wy * s2 - layout.baseOriginY };
      setView(zoom === 1 ? HOME : next);
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, offX: viewRef.current.offX, offY: viewRef.current.offY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 2) return;
      const start = drag;
      setView((v) => ({ ...v, offX: start.offX + dx, offY: start.offY + dy }));
    };
    const up = () => {
      drag = null;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, []);

  useCanvasLoop(canvasRef, HEIGHT, [trial, ghosts, watch, replayNonce, pointer, view, mode], (ctx, w, h) => {
    const c = themeColors();
    if (!trial) {
      emptyMessage(ctx, w, h, 'Run a trial to launch the ball, or ask your agent to.');
      return false;
    }

    const sources = mode === 'all' ? [trial, ...ghosts] : [trial];
    let maxX = 10;
    let maxY = 5;
    for (const t of sources) {
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
    const plot = { x: pad.l, y: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b };
    const scale = Math.min(plot.w / maxX, plot.h / maxY);
    layoutRef.current = { scale, baseOriginX: pad.l, baseOriginY: h - pad.b };
    const s = scale * view.zoom;
    const originX = pad.l + view.offX;
    const originY = h - pad.b + view.offY;
    const px = (x: number) => originX + x * s;
    const py = (y: number) => originY - y * s;
    const visible = {
      x0: (plot.x - originX) / s,
      x1: (plot.x + plot.w - originX) / s,
      y0: (originY - plot.y - plot.h) / s,
      y1: (originY - plot.y) / s,
    };

    // Grid, clipped to the plot so zoomed content never runs over the labels.
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    ctx.lineWidth = 1;
    ctx.strokeStyle = c.border;
    ctx.globalAlpha = 0.5;
    const xStep = niceStep((visible.x1 - visible.x0) / 6);
    const yStep = niceStep((visible.y1 - visible.y0) / 4);
    const xTicks: number[] = [];
    const yTicks: number[] = [];
    for (let x = Math.ceil(visible.x0 / xStep) * xStep; x <= visible.x1 + 1e-9; x += xStep) xTicks.push(Number(x.toFixed(10)));
    for (let y = Math.ceil(visible.y0 / yStep) * yStep; y <= visible.y1 + 1e-9; y += yStep) yTicks.push(Number(y.toFixed(10)));
    for (const x of xTicks) {
      ctx.beginPath();
      ctx.moveTo(px(x), plot.y);
      ctx.lineTo(px(x), plot.y + plot.h);
      ctx.stroke();
    }
    for (const y of yTicks) {
      if (y === 0) continue;
      ctx.beginPath();
      ctx.moveTo(plot.x, py(y));
      ctx.lineTo(plot.x + plot.w, py(y));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.x, py(0));
    ctx.lineTo(plot.x + plot.w, py(0));
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

    // Hovering the trajectory scrubs to that instant; otherwise playback decides the time shown.
    const progress = playbackProgress(anim);
    let tShow = progress * trial.measurements.flight_time_s;
    const hovered = pointer ? nearestPoint(trial.series, (p) => [px(p.x), py(p.y)], pointer.x, pointer.y) : -1;
    if (hovered >= 0) tShow = trial.series[hovered].t;

    const color = trial.actor === 'agent' ? c.agent : c.accent;
    drawPath(trial, color, 0.35, Infinity, 1.5, true);
    drawPath(trial, color, 1, tShow, 2.5);

    ctx.fillStyle = c.muted;
    ctx.beginPath();
    ctx.arc(px(0), py(launchHeight), 3.5, 0, Math.PI * 2);
    ctx.fill();
    const bx = px(sampleAt(trial.series, 'x', tShow));
    const by = py(sampleAt(trial.series, 'y', tShow));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fill();
    if (hovered >= 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Axis labels outside the clip.
    ctx.font = `12px ${c.font}`;
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const x of xTicks) ctx.fillText(`${round(x, 4)} m`, px(x), plot.y + plot.h + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const y of yTicks) if (y !== 0) ctx.fillText(`${round(y, 4)}`, plot.x - 6, py(y));

    const m = trial.measurements;
    ctx.font = `13px ${c.font}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = c.text;
    ctx.fillText(
      `range ${round(m.range_m, 4)} m · max height ${round(m.max_height_m, 4)} m · flight ${round(m.flight_time_s, 4)} s · t = ${fixed(tShow, 2)} s${hovered >= 0 ? ' (hover)' : ''}`,
      pad.l,
      4,
    );
    if (zoomed) {
      ctx.textAlign = 'left';
      ctx.fillStyle = c.muted;
      ctx.font = `11px ${c.font}`;
      ctx.fillText(`zoom ${round(view.zoom, 3)}× · scroll to zoom, drag to pan`, plot.x + 6, plot.y + plot.h - 16);
    }

    if (hovered >= 0 && pointer) {
      const sr = trial.series;
      const a = sr[Math.max(0, hovered - 1)];
      const b = sr[Math.min(sr.length - 1, hovered + 1)];
      const dt = b.t - a.t || 1e-9;
      const vx = (b.x - a.x) / dt;
      const vy = (b.y - a.y) / dt;
      drawReadout(
        ctx,
        w,
        h,
        pointer.x,
        pointer.y,
        [
          `t      ${fixed(sr[hovered].t, 2)} s`,
          `x, y   ${fixed(sr[hovered].x, 2)} m, ${fixed(sr[hovered].y, 2)} m`,
          `speed  ${fixed(Math.hypot(vx, vy), 2)} m/s`,
          `vx, vy ${fixed(vx, 2)}, ${fixed(vy, 2)} m/s`,
        ],
        c,
        READOUT_WIDTH,
      );
    }
    return progress < 1;
  });

  return (
    <>
      <canvas ref={canvasRef} className="stage-canvas" role="img" aria-label="Projectile trajectory" />
      {trial && (
        <div className="stage-controls">
          <button className={`chip ${mode === 'trial' ? 'active' : ''}`} onClick={() => setFitMode('trial')} title="Scale the axes to the trial being shown">
            Fit trial
          </button>
          <button className={`chip ${mode === 'all' ? 'active' : ''}`} onClick={() => setFitMode('all')} title="Scale the axes to every trial shown">
            Fit all
          </button>
          {zoomed && (
            <button className="chip" onClick={() => setView(HOME)} title="Back to the fitted view">
              Reset zoom
            </button>
          )}
        </div>
      )}
    </>
  );
}
