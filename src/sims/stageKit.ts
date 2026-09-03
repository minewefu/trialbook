import { useEffect, useRef, useState, type DependencyList, type MutableRefObject, type RefObject } from 'react';
import type { Trial } from '../store';
import type { SeriesPoint } from './types';

export type StageProps = { trial: Trial | null; ghosts: Trial[]; watch: boolean; replayNonce: number };
export type Playback = MutableRefObject<{ start: number; duration: number } | null>;
export type Pointer = { x: number; y: number } | null;
export type Rect = { x: number; y: number; w: number; h: number };

export function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function themeColors() {
  return {
    text: cssVar('--text', '#222'),
    muted: cssVar('--muted', '#777'),
    border: cssVar('--border', '#ccc'),
    surface: cssVar('--surface', '#fff'),
    accent: cssVar('--accent', '#1f6feb'),
    agent: cssVar('--agent', '#6639ba'),
    warn: cssVar('--warn', '#9a6700'),
    ok: cssVar('--ok', '#1a7f37'),
    font: cssVar('--font', 'sans-serif'),
  };
}

export type Colors = ReturnType<typeof themeColors>;

/** Linear interpolation of one series key at time t. */
export function sampleAt(series: SeriesPoint[], key: string, t: number): number {
  if (series.length === 0) return 0;
  if (t <= series[0].t) return series[0][key];
  const last = series[series.length - 1];
  if (t >= last.t) return last[key];
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = series[lo];
  const b = series[hi];
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return a[key] + (b[key] - a[key]) * f;
}

export function lastTime(series: SeriesPoint[]): number {
  return series.length ? series[series.length - 1].t : 0;
}

/** Progress of the current playback in [0, 1]; clears the playback once it finishes. */
export function playbackProgress(anim: Playback): number {
  if (!anim.current) return 1;
  const progress = Math.min(1, (performance.now() - anim.current.start) / anim.current.duration);
  if (progress >= 1) anim.current = null;
  return progress;
}

/** Starts playback for a new trial while "watch" is on, or on an explicit replay. */
export function usePlayback(trial: Trial | null, watch: boolean, replayNonce: number, durationMs: number): Playback {
  const anim = useRef<{ start: number; duration: number } | null>(null);
  const seen = useRef<{ trialId: string | null; nonce: number }>({ trialId: null, nonce: replayNonce });
  useEffect(() => {
    const isNewTrial = (trial?.id ?? null) !== seen.current.trialId;
    const isReplay = replayNonce !== seen.current.nonce;
    seen.current = { trialId: trial?.id ?? null, nonce: replayNonce };
    if (trial && ((isNewTrial && watch) || isReplay)) anim.current = { start: performance.now(), duration: durationMs };
    else if (!trial) anim.current = null;
  }, [trial, watch, replayNonce, durationMs]);
  return anim;
}

/** Pointer position over the canvas in CSS pixels, or null when the pointer is elsewhere. Works for mouse and touch. */
export function usePointer(canvasRef: RefObject<HTMLCanvasElement | null>): Pointer {
  const [pointer, setPointer] = useState<Pointer>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const leave = () => setPointer(null);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointercancel', leave);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointercancel', leave);
    };
  }, [canvasRef]);
  return pointer;
}

export function inRect(x: number, y: number, r: Rect, slack = 0): boolean {
  return x >= r.x - slack && x <= r.x + r.w + slack && y >= r.y - slack && y <= r.y + r.h + slack;
}

/** Index of the series point nearest to a screen position, or -1 when nothing is within `maxDistance` px. */
export function nearestPoint(
  series: SeriesPoint[],
  toScreen: (p: SeriesPoint) => [number, number],
  x: number,
  y: number,
  maxDistance = 36,
): number {
  let best = -1;
  let bestDistance = maxDistance * maxDistance;
  for (let i = 0; i < series.length; i++) {
    const [sx, sy] = toScreen(series[i]);
    const d = (sx - x) ** 2 + (sy - y) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/** A small tooltip box next to the pointer, kept inside the canvas. */
export function drawReadout(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, lines: string[], c: Colors): void {
  ctx.save();
  ctx.font = `12px ${c.font}`;
  const pad = 7;
  const lineHeight = 15;
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + pad * 2;
  const height = lines.length * lineHeight + pad * 2 - 3;
  let bx = x + 14;
  let by = y + 14;
  if (bx + width > w - 4) bx = x - 14 - width;
  if (by + height > h - 4) by = y - 14 - height;
  bx = Math.max(4, bx);
  by = Math.max(4, by);
  ctx.fillStyle = c.surface;
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, width, height, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, bx + pad, by + pad + i * lineHeight));
  ctx.restore();
}

/**
 * Runs `draw` in a requestAnimationFrame loop for as long as it returns true, redraws on resize,
 * and keeps the canvas crisp on high-density screens.
 */
export function useCanvasLoop(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  height: number,
  deps: DependencyList,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => boolean,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !host || !ctx) return;
    let raf = 0;
    const frame = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(240, host.clientWidth);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${height}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, height);
      if (draw(ctx, w, height)) raf = requestAnimationFrame(frame);
    };
    frame();
    const redraw = () => {
      cancelAnimationFrame(raf);
      frame();
    };
    const observer = new ResizeObserver(redraw);
    observer.observe(host);
    window.addEventListener('resize', redraw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', redraw);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function emptyMessage(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
  const c = themeColors();
  ctx.fillStyle = c.muted;
  ctx.font = `15px ${c.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
}
