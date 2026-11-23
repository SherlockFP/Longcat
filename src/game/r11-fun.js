// R11 fun lane (sol-r11-3 fix 4): see a delayed consequence before it lands.
// - A tap that parks cats shows ghost cushions where they will sit and a dashed line from each cushion to the carrier
//   it waits for, with how many carriers stand before it. While the finger is still down the same line joins the
//   press rings (the move is not committed yet); after release the ghosts hold until the cats have landed.
// - Take back rewinds to the latest position the solver proves winnable (core/r11-fun.js), not just one move.
// - On a teaching level the free rewind goes back to the tap that cost the win and points at it: its lane, a "!" tag
//   and the cushions it would take, until the next tap.
import { undo as rulesUndo } from '../core/rules.js';
import { winnableBack, movesOnStack } from '../core/r11-fun.js';
import { COLOR_PAL, NAVY } from './breeds.js';
import { drawBadge, FONT } from './render.js';

const GHOST = 1.15; // seconds the post-tap ghosts stay
const CULPRIT = 9; // seconds the teaching mark stays (or until the next tap)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- rewind ----
// Take back to the latest winnable spot. Returns { k, proven, id } (k moves undone, proven = the solver found a win
// from there, id = the cat of the first move taken back: the tap that cost the win, -1 for a scoop) or null.
export function rewindWinnable(game) {
  const st = game.state;
  if (!st || game.demo || game.busy() || !st.undo.length) return null;
  const k0 = winnableBack(st);
  const k = Math.max(1, k0);
  const mv = movesOnStack(game.log);
  const first = mv[mv.length - k];
  for (let i = 1; i < k; i++) { rulesUndo(st); game.log.push({ op: 'undo', t: game.clock }); } // the share clip replays every step
  if (!game.undoMove()) return null;
  return { k, proven: k0 > 0, id: first && first.op === 'tap' ? first.id : -1 };
}

// the teaching mark on the tap that cost the win (drawn until the next tap)
export function markCulprit(game, id) {
  game.funCulprit = id >= 0 ? { id, t0: game.clock, board: game.board, dest: null } : null;
}

// ---- hooks from the board controller ----
export function onTap(game, r) {
  if (!r || !r.ok) return; // a bonk changes nothing: the marks stay
  game.funCulprit = null;
  if (!game.funGhost || game.demo || game.fixed) return;
  const boarded = new Set(r.events.filter((e) => e.type === 'board').map((e) => e.id));
  const seats = r.events.filter((e) => e.type === 'bench' && !boarded.has(e.id)).map((e) => ({ seat: e.seat, id: e.id, color: e.color }));
  game.funPark = seats.length ? { t0: game.clock, seats, board: game.board } : null;
}

// where the carrier of a colour waits on screen: { x, y, k } (k = carriers before it), or null (front or not queued)
function carrierAt(game, color) {
  const cs = game.vis.carriers;
  const k = cs.findIndex((c) => !c.closed && c.color === color);
  if (k < 1) return null;
  if (k <= 2) {
    const vc = cs[k];
    const sc = 0.9 + 0.26 * clamp(1 - (vc.x - game.slotX(0)) / game.sw, 0, 1);
    return { x: vc.x, y: game.beltY - game.cs * 0.12 * sc, k };
  }
  // its dot in the queue capsule after the two previews (same geometry as drawQueueRest)
  const r = clamp(game.cs * 0.1, 6, 9);
  const show = Math.min(3, cs.length - 3);
  const h = show * r * 2.25 + (cs.length - 3 > show ? r * 1.9 : 0) + r * 0.6;
  const x = Math.min(game.W - r * 1.35 - 6, game.slotX(2) + game.cs * 0.62);
  const y = k - 3 < 3 ? game.beltY - 6 - h + r * 1.4 + (k - 3) * r * 2.25 : game.beltY - 6 - r * 1.05;
  return { x, y: y + r, k };
}

// one cushion -> carrier link: a dashed arc in the cat's colour over a white under-stroke, a dot on the cushion and the
// wait count where it meets the carrier
function link(game, ctx, seat, color, alpha, tone) {
  const to = carrierAt(game, color);
  if (!to) return;
  const b = game.benchPos(seat);
  const x0 = b.x, y0 = b.y - b.bw * 0.34;
  const mx = (x0 + to.x) / 2 + (to.x >= x0 ? -1 : 1) * Math.min(40, Math.abs(to.x - x0) * 0.25);
  const my = Math.min(y0, to.y) - Math.max(8, Math.abs(y0 - to.y) * 0.25);
  const base = COLOR_PAL[color].base;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.setLineDash([7, 6]);
  ctx.lineDashOffset = game.calm ? 0 : -game.clock * 26;
  for (const [w, s] of [[6, '#fffaf0'], [3, tone || base]]) {
    ctx.lineWidth = w;
    ctx.strokeStyle = s;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, to.x, to.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = base;
  ctx.strokeStyle = '#fffaf0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x0, y0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = alpha;
  drawBadge(ctx, to.x + game.cs * 0.2, to.y - 2, Math.max(9, game.cs * 0.13), to.k, tone || NAVY);
  ctx.restore();
}

// a ghost cushion: a dashed outline in the cat's colour over a soft fill
function ghost(game, ctx, seat, color, alpha, tone) {
  const b = game.benchPos(seat);
  const u = game.calm ? 0.6 : 0.5 + 0.5 * Math.sin(game.clock * 8);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(255,250,240,0.32)';
  ctx.strokeStyle = tone || COLOR_PAL[color].base;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, b.bw * (0.5 + 0.03 * u), b.bw * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// drawn with the belt and bench (under the board)
export function drawUnder(game, ctx) {
  if (game.demo || !game.board || !game.state) return;
  // the press preview: the rings are drawn by the board; add the line to the carrier each parked cat waits for
  const p = game.press;
  if (p && p.dest && game.funGhost) for (const d of p.dest) if (d.kind === 'seat') link(game, ctx, d.seat, d.color, 0.95);
  const g = game.funPark;
  if (g) {
    const t = game.clock - g.t0;
    if (t > GHOST || g.board !== game.board) game.funPark = null;
    else {
      const a = clamp(Math.min(t / 0.08, (GHOST - t) / 0.35), 0, 1);
      for (const s of g.seats) {
        if (game.state.bench[s.seat] !== s.id) continue; // taken back, or already hopped in
        if (game.vis.bench[s.seat] !== s.id) ghost(game, ctx, s.seat, s.color, a); // still on its way: the cushion it will take
        link(game, ctx, s.seat, s.color, a);
      }
    }
  }
  const c = game.funCulprit;
  if (c) {
    if (c.board !== game.board || game.clock - c.t0 > CULPRIT || !game.state.alive[c.id]) { game.funCulprit = null; return; }
    if (!c.dest && !game.busy()) c.dest = game.destOf(c.id);
    const a = clamp((CULPRIT - (game.clock - c.t0)) / 0.6, 0, 1);
    for (const d of c.dest || []) if (d.kind === 'seat') { ghost(game, ctx, d.seat, d.color, a, '#e8590c'); link(game, ctx, d.seat, d.color, a, '#e8590c'); }
  }
}

// R11 fix round 1 (sol-r12-1 fun): L9's pair shows what parking it costs before any tap, so a quick tap never commits
// blind. Over the free mother + kitten a tag reads "2 seats" with two cushions and the number of carriers before green
// (L4's wait number); the green carrier in the queue wears a ring with the same number. Drawn still (no pulse, so an
// idle board stays idle) until the pair leaves the board; the press preview takes over while a finger is down
function drawPairCost(game, ctx) {
  const text = game.pairCost;
  if (!text || game.demo || game.press || !game.board || !game.state) return;
  const st = game.state;
  const kit = game.board.cats.find((k) => k.kittenOf != null && st.alive[k.id] && st.alive[k.kittenOf]);
  if (!kit) return;
  const mom = game.board.cats[kit.kittenOf];
  const pal = COLOR_PAL[mom.color] || COLOR_PAL[0];
  const c = game.cell;
  const to = carrierAt(game, mom.color);
  // the tag sits in the row over the kitten (L9: the free cells beside the staircase)
  let x0 = 1e9, x1 = -1e9, y0 = 1e9;
  for (const [x, y] of kit.cells) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); }
  const fs = Math.max(11, Math.round(c * 0.27));
  ctx.save();
  ctx.font = `800 ${fs}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const cw = fs * 0.95, gap = fs * 0.3, br = fs * 0.62; // cushion width, gaps, wait badge radius
  const tw = ctx.measureText(text).width;
  const w = 10 + cw * 2 + gap + gap + tw + (to ? gap + br * 2 : 0) + 10, h = fs * 1.75;
  const bx0 = game.ox + 4, bx1 = game.ox + game.board.w * c - 4;
  const cx = clamp(game.ox + ((x0 + x1 + 1) / 2) * c, bx0 + w / 2, bx1 - w / 2);
  const cy = game.oy + y0 * c - c * 0.42;
  const L = cx - w / 2;
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = pal.base;
  ctx.lineWidth = 2.5;
  game.rr(ctx, L, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  // the tail points down at the pair
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy + h / 2 - 1);
  ctx.lineTo(cx, cy + h / 2 + 6);
  ctx.lineTo(cx + 6, cy + h / 2 - 1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(cx - 5, cy + h / 2 - 3, 10, 3);
  // two cushions in the pair's colour
  for (let i = 0; i < 2; i++) {
    const ex = L + 10 + cw / 2 + i * (cw + gap * 0.6);
    ctx.fillStyle = '#f3e2c4';
    ctx.strokeStyle = pal.base;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(ex, cy + 1, cw / 2, cw * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const tx = L + 10 + cw * 2 + gap * 0.6 + gap;
  ctx.fillStyle = NAVY;
  ctx.fillText(text, tx, cy + 1);
  ctx.restore();
  if (!to) return;
  drawBadge(ctx, tx + tw + gap + br, cy, br, to.k, to.k >= 2 ? '#e8590c' : '#2f9e44');
  // where green waits: a ring around its carrier (or its dot in the queue) with the same number
  const rr = to.k <= 2 ? game.cs * 0.42 : clamp(game.cs * 0.1, 6, 9) * 1.9;
  ctx.save();
  ctx.strokeStyle = pal.base;
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(to.x, to.y, rr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  drawBadge(ctx, to.x - rr * 0.8, to.y - rr * 0.8, Math.max(8, br * 0.85), to.k, to.k >= 2 ? '#e8590c' : '#2f9e44');
}

// drawn over the cats: the teaching mark's lane and "!" tag on the tap that cost the win
export function drawTop(game, ctx) {
  drawPairCost(game, ctx);
  const c = game.funCulprit;
  if (!c || game.demo || game.press || c.board !== game.board || !game.state.alive[c.id]) return;
  const a = clamp((CULPRIT - (game.clock - c.t0)) / 0.6, 0, 1);
  const u = game.calm ? 0.7 : 0.5 + 0.5 * Math.sin((game.clock - c.t0) * 5);
  ctx.save();
  ctx.globalAlpha = a * 0.8;
  game.drawLane(ctx, c.id, u);
  ctx.restore();
  const hp = game.cellPos(c.id);
  const bob = game.calm ? 0 : Math.sin(game.clock * 4) * 2;
  ctx.save();
  ctx.globalAlpha = a;
  drawBadge(ctx, hp.x + game.cell * 0.3, hp.y - game.cell * 0.42 + bob, Math.max(10, game.cell * 0.24), '!', '#e8590c');
  ctx.restore();
}

// the opening (L1-12: the tutorials, the first mechanics and the curated lessons) costs no life on a lost bench
export const OPENING = 12;
export const freeLoss = (n) => n >= 1 && n <= OPENING;
