// R10 shop cosmetics on the board: the cats' outfit (drawn on every head), the carrier skin (dressed over the carrier
// art) and the play-room theme (a painted background). game.js calls these three hooks; the shop previews reuse them.
import { save } from '../kit/save.js';
import { assetUrl } from './breeds.js';
import { item } from './shop.js';

const INK = '#26334A';
const eq = (kind) => { const s = save.data.shop; return (s && s.eq && s.eq[kind]) || ''; };

// ---- play-room theme: null keeps the sunny room ----
const rooms = {};
export function roomImage(id = eq('room')) {
  const it = item(id);
  if (!it || !it.cost || !it.art) return null;
  let im = rooms[id];
  if (!im) { im = rooms[id] = new Image(); im.src = assetUrl('r7/' + it.art + '.webp'); }
  return im.complete && im.naturalWidth ? im : null;
}

function line(ctx, w) { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }
function star5(ctx, x, y, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const q = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  ctx.closePath();
}
function bow(ctx, x, y, s, c1, c2) { // a ribbon bow centred at x, y, s = its width
  const lw = Math.max(1.2, s * 0.05);
  for (const k of [-1, 1]) { // tails, then loops
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + k * s * 0.22, y + s * 0.42);
    ctx.lineTo(x + k * s * 0.06, y + s * 0.34);
    ctx.closePath();
    ctx.fillStyle = c2; ctx.fill(); line(ctx, lw); ctx.stroke();
  }
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + k * s * 0.2, y - s * 0.38, x + k * s * 0.56, y - s * 0.2, x + k * s * 0.5, y + s * 0.02);
    ctx.bezierCurveTo(x + k * s * 0.46, y + s * 0.2, x + k * s * 0.2, y + s * 0.12, x, y);
    const g = ctx.createLinearGradient(x, y - s * 0.3, x, y + s * 0.2);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fill(); line(ctx, lw); ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = c1; ctx.fill(); line(ctx, lw); ctx.stroke();
}
function flower(ctx, x, y, r, petal, mid) {
  const lw = Math.max(1, r * 0.12);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { const a = (i * 2 * Math.PI) / 5 - Math.PI / 2; ctx.moveTo(x + Math.cos(a) * r * 0.55 + r * 0.42, y + Math.sin(a) * r * 0.55); ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, 0, Math.PI * 2); }
  ctx.fillStyle = petal; ctx.fill(); line(ctx, lw); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fillStyle = mid; ctx.fill(); ctx.stroke();
}
function leaf(ctx, x, y, r, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.5, -r * 0.45, r, 0); ctx.quadraticCurveTo(r * 0.5, r * 0.45, 0, 0);
  ctx.fillStyle = '#6fbf5a'; ctx.fill(); line(ctx, Math.max(1, r * 0.08)); ctx.stroke();
  ctx.restore();
}

// ---- cat outfit: drawn in the head's frame (x, y = head centre, size = drawHead size), between the ears ----
export function drawHat(ctx, x, y, ang, size, alpha = 1, id = eq('hat')) {
  if (!id || id === 'hat_none' || size < 8) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(ang);
  const s = size;
  const lw = Math.max(1.2, s * 0.04);
  if (id === 'hat_bow') bow(ctx, s * 0.2, -s * 0.4, s * 0.42, '#ff8fb8', '#e0457b');
  else if (id === 'hat_party') {
    ctx.save(); ctx.translate(s * 0.04, -s * 0.36); ctx.rotate(0.18);
    ctx.beginPath(); ctx.moveTo(-s * 0.17, 0); ctx.lineTo(0, -s * 0.44); ctx.lineTo(s * 0.17, 0); ctx.quadraticCurveTo(0, s * 0.06, -s * 0.17, 0);
    const g = ctx.createLinearGradient(-s * 0.17, 0, s * 0.17, 0); g.addColorStop(0, '#5ec8ff'); g.addColorStop(1, '#2f86d8');
    ctx.fillStyle = g; ctx.fill(); line(ctx, lw); ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#ffd43b';
    for (const [dx, dy] of [[-0.06, -0.08], [0.06, -0.18], [-0.02, -0.3], [0.08, -0.05]]) { ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, -s * 0.46, s * 0.07, 0, Math.PI * 2); ctx.fillStyle = '#ff6b8a'; ctx.fill(); line(ctx, lw); ctx.stroke();
    ctx.restore();
  } else if (id === 'hat_beret') {
    ctx.save(); ctx.translate(-s * 0.02, -s * 0.38); ctx.rotate(-0.2);
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.27, s * 0.12, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-s * 0.06, -s * 0.06, s * 0.02, 0, 0, s * 0.3); g.addColorStop(0, '#ff7a6a'); g.addColorStop(1, '#bd2f3a');
    ctx.fillStyle = g; ctx.fill(); line(ctx, lw); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -s * 0.11); ctx.lineTo(s * 0.02, -s * 0.18); ctx.lineWidth = lw * 1.6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  } else if (id === 'hat_crown') {
    ctx.save(); ctx.translate(0, -s * 0.38);
    const w = s * 0.34, h = s * 0.2;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -h); ctx.lineTo(-w / 4, -h * 0.5); ctx.lineTo(0, -h * 1.15); ctx.lineTo(w / 4, -h * 0.5); ctx.lineTo(w / 2, -h); ctx.lineTo(w / 2, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, -h, 0, 0); g.addColorStop(0, '#ffe680'); g.addColorStop(1, '#e8a020');
    ctx.fillStyle = g; ctx.fill(); line(ctx, lw); ctx.stroke();
    ctx.fillStyle = '#ff5d8f';
    ctx.beginPath(); ctx.arc(0, -h * 0.35, s * 0.035, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ---- carrier skin: in drawCarrier7's frame (the art spans -cw/2..cw/2 by -ch..0) ----
export function drawCarrierSkin(ctx, cw, ch, id = eq('car')) {
  if (!id || id === 'car_none') return;
  const X = (f) => -cw / 2 + cw * f;
  const Y = (f) => -ch + ch * f;
  if (id === 'car_bow') bow(ctx, X(0.3), Y(0.3), cw * 0.26, '#ff6b6b', '#c7303b');
  else if (id === 'car_flowers') {
    leaf(ctx, X(0.2), Y(0.36), cw * 0.1, -2.6);
    leaf(ctx, X(0.36), Y(0.24), cw * 0.09, -0.5);
    flower(ctx, X(0.24), Y(0.3), cw * 0.07, '#ffb3cf', '#ffd43b');
    flower(ctx, X(0.34), Y(0.33), cw * 0.055, '#fff6e5', '#f2b544');
    flower(ctx, X(0.84), Y(0.34), cw * 0.05, '#ffb3cf', '#ffd43b');
  } else if (id === 'car_stars') {
    ctx.lineWidth = Math.max(1, cw * 0.012);
    for (const [fx, fy, r, a] of [[0.2, 0.36, 0.06, 0.2], [0.82, 0.3, 0.05, -0.3], [0.74, 0.62, 0.04, 0.5], [0.3, 0.9, 0.04, -0.2]]) {
      star5(ctx, X(fx), Y(fy), cw * r, a);
      ctx.fillStyle = '#ffd43b'; ctx.fill(); line(ctx, Math.max(1, cw * 0.012)); ctx.stroke();
    }
  }
}
