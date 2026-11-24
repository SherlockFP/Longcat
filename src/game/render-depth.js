// Depth for the play board (r10 perf lane), all baked: built only when the layout changes, never per frame.
// far:  the sunny room, a hair soft (depth of field) and oversized so its parallax sway never shows an edge
// near: a wide ambient shadow under the rug, the belt's shadow on the wall, the rug + tiles, the bench plank, a vignette
// live: soft shadows under the carriers on the belt (one cached blob sprite each)
import { IMG } from './assets.js';
import { rugShadowPath } from './shape.js'; // shape lane: a shaped rug's shadow follows its outline

const OVER = 1.035; // the room is drawn this much larger than cover-fit: room for the parallax sway

export function buildFar(g, ctx) {
  const { W, H, dpr } = g;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const art = g.roomArt ? g.roomArt() : { img: IMG['r7/bg_play_room'] }; // a pack theme or a bought room, else sunny
  const room = art.img;
  if (!room) { g.drawBg(ctx); return; }
  const sc = Math.max(W / room.width, H / room.height) * OVER;
  const dw = room.width * sc, dh = room.height * sc;
  // soften: the room goes through a canvas at 0.8 px per CSS px, then up to the screen DPR (cheap depth of field)
  const soft = document.createElement('canvas');
  soft.width = Math.ceil(W * 0.8);
  soft.height = Math.ceil(H * 0.8);
  const s = soft.getContext('2d');
  s.imageSmoothingQuality = 'high';
  s.drawImage(room, (soft.width - dw * 0.8) / 2, (soft.height - dh * 0.8) / 2, dw * 0.8, dh * 0.8);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft, 0, 0, W, H);
  if (art.wash) { ctx.fillStyle = art.wash; ctx.fillRect(0, 0, W, H); } // the pack's colour wash
  // the window light, held at its mean (the old per-frame drift cost a full-screen gradient every frame)
  const gr = ctx.createLinearGradient(W, 0, W * 0.35, H * 0.55);
  gr.addColorStop(0, 'rgba(255,214,140,0.11)');
  gr.addColorStop(1, 'rgba(255,214,140,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);
  // a light shaft from the window, very faint, so the room has air between the wall and the table
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sh = ctx.createLinearGradient(W * 0.95, 0, W * 0.2, H * 0.75);
  sh.addColorStop(0, 'rgba(255,226,170,0.10)');
  sh.addColorStop(0.6, 'rgba(255,226,170,0.03)');
  sh.addColorStop(1, 'rgba(255,226,170,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.moveTo(W * 0.62, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H * 0.12); ctx.lineTo(W * 0.18, H * 0.86); ctx.lineTo(-W * 0.1, H * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// a shape's blurred shadow only (the shape itself lands far off-canvas)
function softShadow(ctx, dpr, color, blur, dx, dy, shape) {
  const OFF = 5000;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * dpr;
  ctx.shadowOffsetX = (OFF + dx) * dpr;
  ctx.shadowOffsetY = dy * dpr;
  ctx.translate(-OFF, 0);
  ctx.fillStyle = '#000';
  shape(ctx);
  ctx.restore();
}

export function buildNear(g, ctx) {
  const { W, H, dpr } = g;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!g.board) { vignette(ctx, W, H); return; }
  const r7 = !!IMG['r7/table_top'];
  const c = g.cell, gw = c * g.board.w, gh = c * g.board.h;
  const R = r7 ? g.rugR : 10;
  // the belt throws a soft shadow on the wall below it (the carriers stand in front of the room)
  const belt = IMG['r7/belt_wood'];
  if (belt) {
    const bw = W * 0.96, bh = bw * (belt.height / belt.width) * 0.72;
    softShadow(ctx, dpr, 'rgba(60,30,10,0.26)', 12, -4, 9, (k) => { g.rr(k, (W - bw) / 2 + 6, g.beltY - bh * 0.1, bw - 12, bh * 0.55, bh * 0.2); k.fill(); });
  }
  // a wide ambient shadow under the rug: the table sits in the room, not on it
  softShadow(ctx, dpr, 'rgba(50,25,8,0.30)', 26, -8, 16, (k) => { if (!rugShadowPath(g, k, R)) g.rr(k, g.ox - R, g.oy - R, gw + 2 * R, gh + 2 * R, R + 4); k.fill(); });
  g.drawBoard(ctx);
  if (IMG['r7/cushion'] && g.vis) g.drawPlank(ctx, g.vis.bench.length);
  vignette(ctx, W, H);
}

function vignette(ctx, W, H) {
  const r0 = Math.min(W, H) * 0.42, r1 = Math.hypot(W, H) * 0.6;
  const gr = ctx.createRadialGradient(W / 2, H * 0.52, r0, W / 2, H * 0.52, r1);
  gr.addColorStop(0, 'rgba(45,22,6,0)');
  gr.addColorStop(1, 'rgba(45,22,6,0.26)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);
}

// a soft dark blob (made once) stretched under each carrier, nudged down-left: the key light is upper right
let blob = null;
export function carrierShadow(g, ctx) {
  if (!IMG['r7/carrier_orange']) return;
  if (!blob) {
    blob = document.createElement('canvas');
    blob.width = blob.height = 64;
    const k = blob.getContext('2d');
    const gr = k.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(50,25,8,0.42)');
    gr.addColorStop(0.55, 'rgba(50,25,8,0.2)');
    gr.addColorStop(1, 'rgba(50,25,8,0)');
    k.fillStyle = gr;
    k.fillRect(0, 0, 64, 64);
  }
  const cs = g.cs;
  const list = g.vis.carriers;
  for (let i = 0; i < list.length && i < 3; i++) {
    const vc = list[i];
    if (vc.x > g.slotX(2) + g.sw * 0.5) continue;
    const near = Math.max(0, Math.min(1, 1 - (vc.x - g.slotX(0)) / g.sw));
    const cw = cs * 1.3 * (0.9 + 0.26 * near);
    ctx.drawImage(blob, vc.x - cw * 0.58, g.beltY - cw * 0.05, cw * 1.05, cw * 0.26);
  }
}
