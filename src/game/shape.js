// Shape lane, the board as the player sees it: a shaped rug that follows the board's outline (stitched felt, baked once
// into the perf underlay with the rest of the rug), and the quilted flaps over folded sections with their unfold.
// Per frame a closed flap is ONE drawImage of a sprite baked when its count changes; the unfold is the same sprite
// drawn squashed toward the board edge (no filters, no shadowBlur, no gradients, no allocations in the frame loop).
import { IMG } from './assets.js';
import { FONT } from './render.js';
import { foldLeft } from '../core/shape.js';

const smooth = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const UNFOLD = 0.8; // s (game.js drops an anim of an unknown type after 0.85 s)
const UNFOLD_CALM = 0.3;

// ---- outlines ----
// Closed loops around the 1-cells of a mask (grid units), clockwise on screen, collinear points merged. Where two cells
// touch only at a corner the loop turns right, so they stay two separate loops.
export function traceLoops(mask, w, h) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !!mask[y * w + x];
  const out = new Map(); // "x,y" -> edges starting there
  const add = (x0, y0, x1, y1) => {
    const k = x0 + ',' + y0;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push({ x0, y0, x1, y1, used: false });
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    if (!on(x, y - 1)) add(x, y, x + 1, y);
    if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!on(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  for (const list of out.values()) for (const e0 of list) {
    if (e0.used) continue;
    const pts = [];
    let e = e0;
    while (e && !e.used) {
      e.used = true;
      pts.push([e.x0, e.y0]);
      const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
      const nx = (out.get(e.x1 + ',' + e.y1) || []).filter((q) => !q.used);
      e = nx.length > 1 ? nx.find((q) => q.x1 - q.x0 === -dy && q.y1 - q.y0 === dx) || nx[0] : nx[0];
    }
    const simple = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) simple.push(b);
    }
    if (simple.length >= 4) loops.push(simple);
  }
  return loops;
}

// add the loops to the current path, pushed out by d px (negative = in) with corners rounded to r px
export function loopPath(ctx, loops, ox, oy, c, d, r) {
  for (const L of loops) {
    const n = L.length;
    const P = [];
    for (let i = 0; i < n; i++) {
      const a = L[(i + n - 1) % n], b = L[i], q = L[(i + 1) % n];
      const ix = Math.sign(b[0] - a[0]), iy = Math.sign(b[1] - a[1]);
      const ox2 = Math.sign(q[0] - b[0]), oy2 = Math.sign(q[1] - b[1]);
      // outward normals of the edge in and the edge out (clockwise on screen: (dy, -dx))
      P.push([ox + b[0] * c + d * (iy + oy2), oy + b[1] * c + d * (-ix - ox2)]);
    }
    const m0 = [(P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2];
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const b = P[i], q = P[(i + 1) % n], a = P[(i + n - 1) % n];
      const rr = Math.max(0, Math.min(r, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, Math.hypot(q[0] - b[0], q[1] - b[1]) / 2));
      ctx.arcTo(b[0], b[1], q[0], q[1], rr);
    }
    ctx.closePath();
  }
}

function loopsOf(g) {
  const b = g.board;
  if (!b.shape) return null;
  if (b._loops) return b._loops;
  Object.defineProperty(b, '_loops', { value: traceLoops(b.shape.mask, b.w, b.h), enumerable: false, configurable: true }); // not part of the board's JSON
  return b._loops;
}

// render-depth.js buildNear: the wide ambient shadow under a shaped rug (else false: the plain rounded box)
export function rugShadowPath(g, k, R) {
  const loops = g.board && loopsOf(g);
  if (!loops) return false;
  k.beginPath();
  loopPath(k, loops, g.ox, g.oy, g.cell, R, R + 4);
  return true;
}

// game.js drawBoard7 on a shaped board: felt rug + stitches along the outline, ivory tiles on the floor cells only.
// Drawn into the baked underlay (perf.js rebuild), so the shadowBlur and the gradient here cost nothing per frame.
let feltPat = null;
export function drawShapedRug(g, ctx) {
  const loops = loopsOf(g);
  if (!loops) return false;
  const { w, h } = g.board;
  const mask = g.board.shape.mask;
  const c = g.cell, gx = g.ox, gy = g.oy;
  const R = g.rugR || 14;
  ctx.save();
  ctx.shadowColor = 'rgba(60,30,10,0.28)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = -6;
  ctx.shadowOffsetY = 8;
  ctx.beginPath();
  loopPath(ctx, loops, gx, gy, c, R + 3, R + 2);
  ctx.fillStyle = '#C24312'; // the r7 table_top felt (sampled on screen: ~#AA2F0A after the texture and the room light)
  ctx.fill('nonzero');
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  loopPath(ctx, loops, gx, gy, c, R + 3, R + 2);
  ctx.clip('nonzero');
  const felt = IMG['r7/tex_felt'];
  if (felt) {
    if (!feltPat) feltPat = ctx.createPattern(felt, 'repeat');
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = feltPat;
    ctx.fillRect(gx - R - 8, gy - R - 8, w * c + 2 * R + 16, h * c + 2 * R + 16);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  // a soft rim: the felt edge rolls over (a darker band just inside the outline)
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(120,40,10,0.35)';
  ctx.beginPath();
  loopPath(ctx, loops, gx, gy, c, R + 2, R + 1);
  ctx.stroke();
  ctx.restore();
  // stitches: cream dashes with a hair of shadow, halfway out on the rim
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([Math.max(5, R * 0.62), Math.max(4, R * 0.5)]);
  ctx.beginPath();
  loopPath(ctx, loops, gx, gy, c, R * 0.55, R * 0.7);
  ctx.translate(0.6, 1);
  ctx.lineWidth = Math.max(2.2, R * 0.24);
  ctx.strokeStyle = 'rgba(90,30,8,0.35)';
  ctx.stroke();
  ctx.translate(-0.6, -1);
  ctx.strokeStyle = '#FBE3BE';
  ctx.stroke();
  ctx.restore();
  // grout and tiles, floor cells only
  ctx.beginPath();
  loopPath(ctx, loops, gx, gy, c, 1, 3);
  ctx.fillStyle = '#E8D5B0';
  ctx.fill('nonzero');
  const tile = IMG['r7/tile_ivory'];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (tile) ctx.drawImage(tile, gx + x * c + 0.75, gy + y * c + 0.75, c - 1.5, c - 1.5);
    else { ctx.fillStyle = '#FFF0D3'; ctx.fillRect(gx + x * c + 0.75, gy + y * c + 0.75, c - 1.5, c - 1.5); }
  }
  ctx.save();
  ctx.beginPath();
  loopPath(ctx, loops, gx, gy, c, 0, 2);
  ctx.clip('nonzero');
  const gr = ctx.createLinearGradient(gx + w * c, gy, gx, gy + h * c);
  gr.addColorStop(0, 'rgba(255,236,190,0.18)');
  gr.addColorStop(1, 'rgba(120,70,30,0.06)');
  ctx.fillStyle = gr;
  ctx.fillRect(gx, gy, w * c, h * c);
  ctx.restore();
  return true;
}

// ---- flaps ----
// per board: { loops, box:[x0,y0,x1,y1] (cells), anchor side, label cell } for each fold
function foldGeo(g) {
  const b = g.board;
  if (!b.folds) return null;
  if (b._fgeo) return b._fgeo;
  const geo = b.folds.map((f) => {
    const m = new Uint8Array(b.w * b.h);
    let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1, sx = 0, sy = 0;
    for (const [x, y] of f.cells) { m[y * b.w + x] = 1; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); sx += x; sy += y; }
    // the badge sits on the flap cell nearest the middle of the flap
    const mx = sx / f.cells.length, my = sy / f.cells.length;
    let lab = f.cells[0], bd = 1e9;
    for (const [x, y] of f.cells) { const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; lab = [x, y]; } }
    const side = f.side || 'bottom';
    const edge = side === 'top' || side === 'tl' || side === 'tr' ? 'top' : side === 'left' ? 'left' : side === 'right' ? 'right' : 'bottom';
    return { loops: traceLoops(m, b.w, b.h), box: [x0, y0, x1 + 1, y1 + 1], edge, lab, wide: x1 - x0 + 1 };
  });
  Object.defineProperty(b, '_fgeo', { value: geo, enumerable: false, configurable: true });
  return geo;
}

const PAD = 6; // sprite margin (css px) for the flap's lip

// the flap sprite: quilted felt over the folded cells, a stitched hem, the "n more cats" tag. Baked per count.
function flapSprite(g, k, left) {
  const c = g.cell, d = g.dpr;
  g._flap = g._flap || [];
  const cur = g._flap[k];
  if (cur && cur.left === left && cur.c === c && cur.d === d && cur.ox === g.ox && cur.oy === g.oy && cur.board === g.board) return cur; // the frame path: no strings, no allocations
  const geo = foldGeo(g)[k];
  const [x0, y0, x1, y1] = geo.box;
  const W = (x1 - x0) * c + 2 * PAD, H = (y1 - y0) * c + 2 * PAD;
  const cv = cur && cur.cv ? cur.cv : document.createElement('canvas');
  cv.width = Math.ceil(W * d);
  cv.height = Math.ceil(H * d);
  const k2 = cv.getContext('2d');
  k2.setTransform(d, 0, 0, d, 0, 0);
  k2.clearRect(0, 0, W, H);
  const ox = PAD - x0 * c, oy = PAD - y0 * c;
  // drop shadow onto the tiles (baked here, never per frame)
  k2.save();
  k2.shadowColor = 'rgba(60,30,10,0.35)';
  k2.shadowBlur = 5 * d; // shadow sizes are device px (the transform does not scale them)
  k2.shadowOffsetY = 2 * d;
  k2.beginPath();
  loopPath(k2, geo.loops, ox, oy, c, 1, c * 0.22);
  k2.fillStyle = '#E3A33C';
  k2.fill('nonzero');
  k2.restore();
  k2.save();
  k2.beginPath();
  loopPath(k2, geo.loops, ox, oy, c, 1, c * 0.22);
  k2.clip('nonzero');
  // quilting: a puffed square per cell, darker diamond stitching across
  for (const [x, y] of g.board.folds[k].cells) {
    const px = ox + x * c, py = oy + y * c;
    k2.fillStyle = (x + y) % 2 ? '#F0B64A' : '#EDB043';
    k2.fillRect(px, py, c, c);
    k2.fillStyle = 'rgba(255,240,200,0.32)';
    g.rr(k2, px + c * 0.14, py + c * 0.12, c * 0.6, c * 0.42, c * 0.2);
    k2.fill();
  }
  k2.strokeStyle = 'rgba(150,80,20,0.45)';
  k2.lineWidth = 1.4;
  k2.setLineDash([3, 3]);
  k2.beginPath();
  for (let s = -H; s < W + H; s += c) { k2.moveTo(s, 0); k2.lineTo(s + H, H); k2.moveTo(s + H, 0); k2.lineTo(s, H); }
  k2.stroke();
  k2.setLineDash([]);
  if (IMG['r7/tex_felt']) {
    k2.globalCompositeOperation = 'multiply';
    k2.globalAlpha = 0.35;
    k2.fillStyle = k2.createPattern(IMG['r7/tex_felt'], 'repeat');
    k2.fillRect(0, 0, W, H);
    k2.globalCompositeOperation = 'source-over';
    k2.globalAlpha = 1;
  }
  k2.restore();
  // hem: cream stitches just inside the edge
  k2.save();
  k2.beginPath();
  loopPath(k2, geo.loops, ox, oy, c, -4, c * 0.16);
  k2.setLineDash([5, 4]);
  k2.lineCap = 'round';
  k2.lineWidth = 2;
  k2.strokeStyle = '#FFF1D6';
  k2.stroke();
  k2.restore();
  // the count tag
  const [lx, ly] = geo.lab;
  const cx = ox + (lx + 0.5) * c, cy = oy + (ly + 0.5) * c;
  const txt = g.foldText ? g.foldText(left, geo.wide) : String(left);
  const fs = Math.max(11, Math.round(c * 0.34));
  k2.font = `800 ${fs}px ${FONT}`;
  const tw = Math.min(W - 8, k2.measureText(txt).width + fs * 1.1);
  const th = fs * 1.55;
  const bx = Math.max(4, Math.min(W - 4 - tw, cx - tw / 2));
  k2.fillStyle = 'rgba(29,43,83,0.9)';
  g.rr(k2, bx, cy - th / 2, tw, th, th / 2);
  k2.fill();
  k2.fillStyle = '#FFF6E5';
  k2.textAlign = 'center';
  k2.textBaseline = 'middle';
  k2.fillText(txt, bx + tw / 2, cy + 1, tw - 6);
  const e = { left, c, d, ox: g.ox, oy: g.oy, cv, W, H, x: g.ox + x0 * c - PAD, y: g.oy + y0 * c - PAD, board: g.board };
  g._flap[k] = e;
  return e;
}

// a cat the player cannot see yet (its flap is still closed on screen): game.js skips drawing it
export function underFlap(g, id) {
  const f = g.state.foldOf;
  return !!f && f[id] >= 0 && !!g.mv.fold && !g.mv.fold[f[id]];
}

// closed flaps, over the still cats (game.js draw, board layer)
export function drawFlaps(g, ctx) {
  if (!g.board.folds || !g.mv.fold) return;
  for (let k = 0; k < g.board.folds.length; k++) {
    if (g.mv.fold[k]) continue;
    const s = flapSprite(g, k, g.mv.foldLeft[k]);
    const wig = g.flapWig && g.flapWig.k === k ? g.clock - g.flapWig.t : 9;
    const dy = wig >= 0 && wig < 0.3 && !g.calm ? -3 * Math.sin((wig / 0.3) * Math.PI * 2) * (1 - wig / 0.3) : 0;
    ctx.drawImage(s.cv, s.x, s.y + dy, s.W, s.H);
  }
}

// the opening flap: the sprite squashed toward the board edge it folds out over, fading as it turns (fx layer)
export function drawUnfold(g, ctx, a) {
  const s = g._flap && g._flap[a.fold];
  if (!s) return;
  const u = Math.min(1, (g.clock - a.t0) / a.dur);
  if (u >= 1) return;
  const k = 1 - smooth(u);
  const geo = foldGeo(g)[a.fold];
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * (0.35 + 0.65 * k);
  if (geo.edge === 'top' || geo.edge === 'bottom') {
    const ay = geo.edge === 'bottom' ? s.y + s.H : s.y;
    const hh = s.H * k;
    ctx.drawImage(s.cv, s.x, geo.edge === 'bottom' ? ay - hh : ay, s.W, hh);
  } else {
    const ax = geo.edge === 'right' ? s.x + s.W : s.x;
    const ww = s.W * k;
    ctx.drawImage(s.cv, geo.edge === 'right' ? ax - ww : ax, s.y, ww, s.H);
  }
  ctx.globalAlpha = a0;
}

// a small camera zoom-out while a flap opens: a quick lean in, then the grown board settles back (game.js draw camera)
export function unfoldCam(g, ctx) {
  if (g.calm || !g.board.folds) return;
  let z = 0;
  for (const a of g.anims) {
    if (a.type !== 'unfold') continue;
    const u = (g.clock - a.t0) / a.dur;
    if (u < 0 || u >= 1) continue;
    z = Math.max(z, u < 0.18 ? smooth(u / 0.18) : 1 - smooth((u - 0.18) / 0.82));
  }
  if (z <= 0) return;
  const s = 1 + 0.04 * z;
  const cx = g.ox + (g.board.w * g.cell) / 2, cy = g.oy + (g.board.h * g.cell) / 2;
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
}

// ---- state sync / events / input ----
// game.js syncMech: which flaps the player sees closed, and their counts
export function syncFolds(g, mv) {
  const s = g.state;
  mv.fold = Array.from(s.foldOpen);
  mv.foldLeft = mv.fold.map((_, k) => foldLeft(s, k));
}

// game.js scheduleMech: a count ticks down as each cat clears the edge; the flap opens with dust and sparkles
export function scheduleFold(g, events, at0) {
  if (!g.board.folds) return false;
  const s = g.state;
  const left = s.foldNeed.map((_, k) => foldLeft(s, k));
  g.pending.push({ at: at0, vis: true, fn: () => { if (g.mv.foldLeft) for (let k = 0; k < left.length; k++) if (!g.mv.fold[k] && left[k] > 0) g.mv.foldLeft[k] = left[k]; } }); // the opening flap keeps its last count
  for (const e of events) {
    if (e.type !== 'unfold') continue;
    g.pending.push({ at: at0 + 0.12, vis: true, fn: () => {
      if (!g.mv.fold) return;
      g.mv.fold[e.fold] = 1;
      g.anims.push({ type: 'unfold', fold: e.fold, t0: g.clock, dur: g.calm ? UNFOLD_CALM : UNFOLD });
      const geo = foldGeo(g)[e.fold];
      const c = g.cell;
      const [x0, y0, x1, y1] = geo.box;
      const hx = geo.edge === 'left' ? x1 : geo.edge === 'right' ? x0 : (x0 + x1) / 2;
      const hy = geo.edge === 'top' ? y1 : geo.edge === 'bottom' ? y0 : (y0 + y1) / 2;
      g.puff(g.ox + hx * c, g.oy + hy * c); // dust where the hem lifts
      g.sparks(g.ox + ((x0 + x1) / 2) * c, g.oy + ((y0 + y1) / 2) * c, '#ffe45c', 8);
      if (g.on.mech) g.on.mech(e);
    } });
  }
  return true;
}

// game.js onPointer: a finger on a closed flap wiggles it (the count is the clue); true = handled
export function flapPointer(g, px, py) {
  const b = g.board;
  if (!b || !b.folds || !g.state || !g.state.foldCell) return false;
  const gx = Math.floor((px - g.ox) / g.cell), gy = Math.floor((py - g.oy) / g.cell);
  if (gx < 0 || gy < 0 || gx >= b.w || gy >= b.h) return false;
  const f = g.state.foldCell[gy * b.w + gx];
  if (!f || (g.mv.fold && g.mv.fold[f - 1])) return false;
  g.flapWig = { k: f - 1, t: g.clock };
  if (g.on.flap) g.on.flap(f - 1);
  return true;
}
