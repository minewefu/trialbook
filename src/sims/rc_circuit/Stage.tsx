import { useRef } from 'react';
import { round } from '../../lib/format';
import type { Trial } from '../../store';
import {
  drawReadout,
  emptyMessage,
  fixed,
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

export function RcStage({ trial, ghosts, watch, replayNonce }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointer = usePointer(canvasRef);
  const durationMs = trial ? 4000 : 0;
  const anim = usePlayback(trial, watch, replayNonce, durationMs);

  useCanvasLoop(canvasRef, HEIGHT, [trial, ghosts, watch, replayNonce, pointer], (ctx, w, h) => {
    const c = themeColors();
    if (!trial) {
      emptyMessage(ctx, w, h, 'Run a trial to close the switch, or ask your agent to.');
      return false;
    }
    const progress = playbackProgress(anim);
    const total = lastTime(trial.series);
    const supply = Number(trial.params.supply_voltage) || 1;
    const capacitance = Number(trial.params.capacitance) || 1;
    const mode = String(trial.params.mode);
    const tau = trial.measurements.rc_product_s;
    const color = trial.actor === 'agent' ? c.agent : c.accent;

    // Left: the circuit. Right: capacitor voltage against time.
    const top = 26;
    const pad = 14;
    const leftW = Math.min(w * 0.44, 330);
    const left = { x: pad, y: top + 6, w: leftW - pad, h: h - top - 6 - pad };
    const right = { x: leftW + 48, y: top + 8, w: w - leftW - 48 - pad, h: h - top - 8 - 40 };

    const vMax = Math.max(supply, ...[trial, ...ghosts].map((t) => Number(t.params.supply_voltage) || 0)) * 1.08;
    const tMax = Math.max(total, ...ghosts.map((g) => lastTime(g.series)));
    const sx = (t: number) => right.x + (t / tMax) * right.w;
    const sy = (v: number) => right.y + right.h - (v / vMax) * right.h;

    // Hovering the voltage chart scrubs the circuit to that instant.
    const hoverT =
      pointer && inRect(pointer.x, pointer.y, right, 8) ? Math.min(total, Math.max(0, ((pointer.x - right.x) / right.w) * tMax)) : null;
    const tShow = hoverT ?? progress * total;
    const vNow = sampleAt(trial.series, 'voltage', tShow);
    const iNow = sampleAt(trial.series, 'current', tShow);
    const i0 = Math.max(1e-9, Math.abs(trial.series[0]?.current ?? 1));

    // Wires: a rectangle loop.
    const x0 = left.x + 18;
    const x1 = left.x + left.w - 18;
    const y0 = left.y + 26;
    const y1 = left.y + left.h - 26;
    const midY = (y0 + y1) / 2;
    ctx.strokeStyle = c.text;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const rx0 = x0 + (x1 - x0) * 0.42;
    const rx1 = x0 + (x1 - x0) * 0.78;
    ctx.moveTo(x0, y0);
    ctx.lineTo(rx0, y0);
    ctx.moveTo(rx1, y0);
    ctx.lineTo(x1, y0);
    ctx.moveTo(x1, y0);
    ctx.lineTo(x1, midY - 9);
    ctx.moveTo(x1, midY + 9);
    ctx.lineTo(x1, y1);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x0, y1);
    ctx.moveTo(x0, y1);
    ctx.lineTo(x0, midY + 14);
    ctx.moveTo(x0, midY - 14);
    ctx.lineTo(x0, y0);
    ctx.stroke();

    // Resistor zigzag.
    ctx.beginPath();
    ctx.moveTo(rx0, y0);
    const zig = 7;
    const segments = 7;
    for (let i = 1; i <= segments; i++) {
      const x = rx0 + ((rx1 - rx0) * i) / segments;
      ctx.lineTo(x - (rx1 - rx0) / segments / 2, y0 + (i % 2 ? -zig : zig));
      ctx.lineTo(x, y0);
    }
    ctx.stroke();

    // Battery (charging) or a plain wire where the battery would be (discharging through the resistor).
    if (mode === 'charge') {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0 - 12, midY - 6);
      ctx.lineTo(x0 + 12, midY - 6);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0 - 6, midY + 6);
      ctx.lineTo(x0 + 6, midY + 6);
      ctx.stroke();
    } else {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, midY + 14);
      ctx.lineTo(x0, midY - 14);
      ctx.stroke();
    }

    // Capacitor plates with a charge glow proportional to the voltage.
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1 - 14, midY - 5);
    ctx.lineTo(x1 + 14, midY - 5);
    ctx.moveTo(x1 - 14, midY + 5);
    ctx.lineTo(x1 + 14, midY + 5);
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, vNow / supply)) * 0.85;
    ctx.fillStyle = color;
    ctx.fillRect(x1 - 14, midY - 4, 28, 8);
    ctx.restore();

    // Current arrows along the bottom wire, fading with the current.
    const arrowAlpha = Math.max(0, Math.min(1, Math.abs(iNow) / i0));
    ctx.save();
    ctx.globalAlpha = 0.15 + 0.85 * arrowAlpha;
    ctx.fillStyle = c.warn;
    const dir = mode === 'charge' ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const ax = x0 + ((x1 - x0) * (k + 1)) / 5;
      ctx.beginPath();
      ctx.moveTo(ax + 6 * dir, y1);
      ctx.lineTo(ax - 4 * dir, y1 - 5);
      ctx.lineTo(ax - 4 * dir, y1 + 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Labels on the schematic.
    ctx.fillStyle = c.muted;
    ctx.font = `12px ${c.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`R = ${trial.params.resistance} kΩ`, (rx0 + rx1) / 2, y0 - 12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`C = ${trial.params.capacitance} µF`, x1 + 20, midY);
    ctx.textAlign = 'right';
    ctx.fillText(mode === 'charge' ? `${supply} V` : 'open', x0 - 16, midY);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = c.text;
    ctx.fillText(`V_C = ${round(vNow, 3)} V · I = ${round(iNow, 3)} mA`, (x0 + x1) / 2, y1 + 10);

    // Right: voltage against time.
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + right.h);
    ctx.lineTo(right.x + right.w, right.y + right.h);
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.font = `12px ${c.font}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${round(vMax, 3)} V`, right.x - 6, right.y);
    ctx.fillText('0', right.x - 6, right.y + right.h);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('capacitor voltage over time · hover to inspect', right.x, right.y + right.h + 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${round(tMax, 3)} s`, right.x + right.w, right.y + right.h + 6);

    // Time-constant markers.
    if (Number.isFinite(tau) && tau <= tMax) {
      const target = mode === 'charge' ? supply * (1 - Math.exp(-1)) : supply * Math.exp(-1);
      ctx.save();
      ctx.strokeStyle = c.muted;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(right.x, sy(target));
      ctx.lineTo(sx(tau), sy(target));
      ctx.lineTo(sx(tau), right.y + right.h);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = c.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`τ = ${round(tau, 3)} s (${mode === 'charge' ? '63%' : '37%'})`, sx(tau) + 4, sy(target) - 2);
    }

    const drawCurve = (t: Trial, alpha: number, upTo: number, width: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = t.actor === 'agent' ? c.agent : c.accent;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      for (const p of t.series) {
        if (p.t > upTo) break;
        const x = sx(p.t);
        const y = sy(p.voltage);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };
    for (const g of ghosts.slice(-8)) drawCurve(g, 0.2, Infinity, 1);
    drawCurve(trial, 0.3, Infinity, 1);
    drawCurve(trial, 1, tShow, 2.2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx(tShow), sy(vNow), 5, 0, Math.PI * 2);
    ctx.fill();

    const m = trial.measurements;
    ctx.fillStyle = c.text;
    ctx.font = `13px ${c.font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `time constant ${Number.isFinite(m.time_constant_s) ? round(m.time_constant_s, 4) : 'n/a'} s · R·C ${round(m.rc_product_s, 4)} s · final ${round(m.final_voltage_v, 4)} V · energy ${round(m.energy_stored_mj, 4)} mJ`,
      pad,
      4,
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = c.muted;
    ctx.fillText(hoverT !== null ? `t = ${round(tShow, 3)} s · hover` : `t = ${round(tShow, 3)} s`, w - pad, 4);

    if (hoverT !== null && pointer) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(tShow), sy(vNow), 9, 0, Math.PI * 2);
      ctx.stroke();
      // Charging curves start low on the left, discharging ones start high, so park the panel in the empty corner.
      const width = 210;
      const panelX = mode === 'charge' ? right.x + 6 : right.x + right.w - width - 6;
      drawReadout(
        ctx,
        panelX,
        right.y + 6,
        [
          `t       ${fixed(tShow, 2)} s`,
          `voltage ${fixed(vNow, 3)} V`,
          `current ${fixed(iNow, 4)} mA`,
          `charge  ${fixed(capacitance * vNow, 1)} µC`,
          `energy  ${fixed(0.5 * capacitance * 1e-6 * vNow * vNow * 1e3, 4)} mJ`,
        ],
        c,
        width,
      );
    }
    return progress < 1;
  });

  return <canvas ref={canvasRef} className="stage-canvas" role="img" aria-label="RC circuit and capacitor voltage over time" />;
}
