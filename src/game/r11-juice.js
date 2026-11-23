// R11 juice lane (Sol fix 3): beats that cost no frame time. Game.draw / drawStamp / drawCarrier call these small
// pure helpers; nothing here allocates per frame or reads the DOM.
// - the chain's final landing: a camera punch (extra scale on the push-in), a warm screen pulse with a ring out of the
//   counter, and a bigger overshoot pop on the counter itself
// - a full carrier's lid slams: squash then stretch, instead of the old small wobble
// - perf: the chain counter's ribbon is baked once per tick (its stroked text at the pop scale was 4-14 ms of software
//   raster per frame at 6x CPU throttle); drawn as one sprite
// Reduced motion: no punch, no pulse, no overshoot; the close keeps the old gentle wobble.
import { NAVY } from './breeds.js';
import { FONT } from './render.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// seconds since the chain's last cat landed, or -1 (no chain on screen, or not landed yet)
function sinceLast(g) {
  const f = g.chainFx;
  if (!f || !f.land || f.land !== f.n || g.demo || g.noStamp) return -1;
  return g.clock - f.landT;
}

// extra camera scale for the final landing: a quick punch-in that springs back (0.32 s)
export function landKick(g) {
  if (g.calm) return 0;
  const t = sinceLast(g);
  if (t < 0 || t > 0.32) return 0;
  const u = t / 0.32;
  return 0.03 * Math.sin(u * Math.PI) * (1 - u * 0.4);
}

// the chain counter's scale: each tick pops a little bigger than the last; the final one lands huge and settles
export function stampScale(g, f, t, last) {
  const big = last ? 1.45 : 1 + Math.min(0.18, 0.06 * (f.land - 1));
  if (g.calm) return big;
  const dur = last ? 0.42 : 0.28;
  if (t >= dur) return big;
  const u = t / dur;
  // a damped spring: starts large, undershoots a hair, settles on big
  const over = last ? 0.6 : 0.32;
  return big * (1 + over * Math.exp(-u * 4.5) * Math.cos(u * Math.PI * 2.2));
}

// the screen pulse: a warm flash from the counter and a gold ring running out of it (drawn without the camera)
export function drawLandPulse(g, ctx) {
  if (g.calm) return;
  const t = sinceLast(g);
  if (t < 0 || t > 0.5) return;
  const p = g.chainPos();
  const W = g.W, H = g.H;
  const u = clamp(t / 0.5, 0, 1);
  if (g.pf && g.pf.pulse(p.x, p.y, t < 0.3 ? 1 - t / 0.3 : 0, 18 + u * W * 0.42, 0.85 * (1 - u))) return; // DOM layers: no raster
  ctx.save();
  if (t < 0.3) {
    const a = 0.32 * (1 - t / 0.3);
    const r = Math.max(W, H) * 0.75;
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gr.addColorStop(0, `rgba(255,236,170,${a})`);
    gr.addColorStop(0.45, `rgba(255,200,90,${a * 0.45})`);
    gr.addColorStop(1, 'rgba(255,190,80,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 0.85 * (1 - u);
  ctx.strokeStyle = '#ffd43b';
  ctx.lineWidth = 6 * (1 - u) + 1.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 18 + u * W * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// a full carrier's lid slams shut: squash down and wide, then stretch, settled in 0.42 s. k > 0 squashes
// (sy *= 1 - k, sx *= 1 + 0.8 k); reduced motion keeps the old small wobble
export function closeSquash(q, calm) {
  if (q < 0) return 0;
  if (calm) return q < 0.25 ? Math.exp(-q * 14) * Math.cos(q * 34) * 0.12 : 0;
  if (q >= 0.42) return 0;
  return Math.exp(-q * 9) * Math.cos(q * 26) * 0.22;
}

// the chain counter's ribbon + text as a sprite, baked at the settle scale (crisp at rest, the brief overshoot
// resamples it). Drawn by drawStamp in its own frame (centre, rotated, scaled by the pop)
let stampCache = null;
export function stampSprite(g, text, size, tw, last) {
  if (typeof document === 'undefined') return null;
  const big = last ? 1.45 : 1.18;
  const fonts = typeof document.fonts !== 'undefined' ? document.fonts.status : '';
  const key = `${text}|${size}|${last}|${g.dpr}|${fonts}`;
  if (stampCache && stampCache.key === key) return stampCache;
  const k = g.dpr * big;
  const pad = 6;
  const w = tw + 24 + pad * 2, h = size * 1.2 + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * k);
  cv.height = Math.ceil(h * k);
  const ctx = cv.getContext('2d');
  ctx.setTransform(k, 0, 0, k, (w / 2) * k, (h / 2) * k);
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.fillStyle = last ? '#ffb703' : '#ff6b9a';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 3;
  g.rr(ctx, -tw / 2 - 12, -size * 0.6, tw + 24, size * 1.2, size * 0.45);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = Math.max(4, size * 0.2);
  ctx.strokeText(text, 0, 1);
  ctx.fillStyle = last ? '#fff6d0' : '#ffffff';
  ctx.fillText(text, 0, 1);
  stampCache = { key, cv, x: -w / 2, y: -h / 2, w, h };
  return stampCache;
}
