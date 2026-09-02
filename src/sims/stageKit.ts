import { useEffect, useRef, type DependencyList, type MutableRefObject, type RefObject } from 'react';
import type { Trial } from '../store';
import type { SeriesPoint } from './types';

export type StageProps = { trial: Trial | null; ghosts: Trial[]; watch: boolean; replayNonce: number };
export type Playback = MutableRefObject<{ start: number; duration: number } | null>;

export function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function themeColors() {
  return {
    text: cssVar('--text', '#222'),
    muted: cssVar('--muted', '#777'),
    border: cssVar('--border', '#ccc'),
    accent: cssVar('--accent', '#1f6feb'),
    agent: cssVar('--agent', '#6639ba'),
    warn: cssVar('--warn', '#9a6700'),
    ok: cssVar('--ok', '#1a7f37'),
    font: cssVar('--font', 'sans-serif'),
  };
}

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
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      frame();
    });
    observer.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
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
