import { useEffect, useRef } from 'react';
import { niceStep, round } from '../../lib/format';
import type { Trial } from '../../store';

type Props = { trial: Trial | null; ghosts: Trial[]; watch: boolean; replayNonce: number };

const HEIGHT = 340;

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Position along a recorded trajectory at time t, interpolating between samples. */
function positionAt(series: Trial['series'], t: number): { x: number; y: number } {
  if (series.length === 0) return { x: 0, y: 0 };
  if (t <= series[0].t) return { x: series[0].x, y: series[0].y };
  const last = series[series.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };
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
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

export function ProjectileStage({ trial, ghosts, watch, replayNonce }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const anim = useRef<{ start: number; duration: number } | null>(null);
  const seen = useRef<{ trialId: string | null; nonce: number }>({ trialId: null, nonce: replayNonce });

  // Decide whether to animate: a new trial while "watch" is on, or an explicit replay.
  useEffect(() => {
    const isNewTrial = (trial?.id ?? null) !== seen.current.trialId;
    const isReplay = replayNonce !== seen.current.nonce;
    seen.current = { trialId: trial?.id ?? null, nonce: replayNonce };
    if (trial && ((isNewTrial && watch) || isReplay)) {
      const flight = trial.measurements.flight_time_s;
      anim.current = { start: performance.now(), duration: Math.min(3500, Math.max(1200, flight * 450)) };
    } else if (!trial) {
      anim.current = null;
    }
  }, [trial, watch, replayNonce]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !host || !ctx) return;
    let raf = 0;

    const draw = (): boolean => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(240, host.clientWidth);
      const h = HEIGHT;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const font = cssVar('--font', 'sans-serif');
      const colors = {
        text: cssVar('--text', '#222'),
        muted: cssVar('--muted', '#777'),
        border: cssVar('--border', '#ccc'),
        accent: cssVar('--accent', '#1f6feb'),
        agent: cssVar('--agent', '#6639ba'),
      };

      if (!trial) {
        ctx.fillStyle = colors.muted;
        ctx.font = `15px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Run a trial to launch the ball, or ask your agent to.', w / 2, h / 2);
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

      // Grid and axis labels (metres).
      ctx.font = `12px ${font}`;
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.border;
      ctx.fillStyle = colors.muted;
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
      ctx.strokeStyle = colors.text;
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

      for (const g of ghosts) drawPath(g, g.actor === 'agent' ? colors.agent : colors.accent, 0.22, Infinity, 1.5);

      let progress = 1;
      if (anim.current) {
        progress = Math.min(1, (performance.now() - anim.current.start) / anim.current.duration);
        if (progress >= 1) anim.current = null;
      }
      const flight = trial.measurements.flight_time_s;
      const tNow = progress * flight;
      const color = trial.actor === 'agent' ? colors.agent : colors.accent;
      drawPath(trial, color, 0.35, Infinity, 1.5, true);
      drawPath(trial, color, 1, tNow, 2.5);

      ctx.fillStyle = colors.muted;
      ctx.beginPath();
      ctx.arc(px(0), py(launchHeight), 3.5, 0, Math.PI * 2);
      ctx.fill();

      const pos = positionAt(trial.series, tNow);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px(pos.x), py(pos.y), 6, 0, Math.PI * 2);
      ctx.fill();

      const m = trial.measurements;
      ctx.font = `13px ${font}`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.text;
      ctx.fillText(
        `range ${round(m.range_m, 4)} m · max height ${round(m.max_height_m, 4)} m · flight ${round(m.flight_time_s, 4)} s`,
        pad.l,
        4,
      );
      ctx.textAlign = 'right';
      ctx.fillStyle = colors.muted;
      ctx.fillText(`t = ${round(tNow, 3)} s`, w - pad.r, 4);
      return progress < 1;
    };

    const loop = () => {
      if (draw()) raf = requestAnimationFrame(loop);
    };
    loop();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      loop();
    });
    observer.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [trial, ghosts, watch, replayNonce]);

  return <canvas ref={canvasRef} className="stage-canvas" role="img" aria-label="Projectile trajectory" />;
}
