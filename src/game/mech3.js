// R13 pieces on the canvas (game.js hooks): the padlock and the key badge, the colour gate, the twins' paw-holding
// ribbon. Plain vector fills and strokes only (no shadows, filters or gradients: they are drawn into the baked still
// board, perf.js). Visual state trails the rules state like the other pieces: game.mv.locked[id], game.mv.obj[k].
import { COLOR_PAL, NAVY } from './breeds.js';

const GOLD = '#ffc93c';
const BOW = '#ffe14d';

// the padlock (closed) or the key, as a badge on the head's upper corner
export function over(game, ctx, cat) {
  const locked = cat.mech === 'lock' && game.mv.locked && game.mv.locked[cat.id];
  if (!locked && cat.mech !== 'key') return;
  const c = game.cell;
  const [hx, hy] = cat.cells[cat.cells.length - 1];
  const [x0, y0] = game.center(hx, hy);
  const r = Math.max(11, c * 0.3); // R14: readable on a 30 px cell
  const x = x0 + r * 1.1;
  const y = y0 - r * 1.25;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = locked ? '#fff' : NAVY; // R14: the gold key on a navy disc (gold on white was faint)
  ctx.strokeStyle = locked ? NAVY : '#fff';
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (!locked) { // a navy rim outside the white one, so the badge stands off a dark cat too
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.beginPath();
    ctx.arc(x, y, r + Math.max(2, r * 0.16) * 0.5 + ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = NAVY;
  if (locked) {
    // shackle, body, keyhole
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.beginPath();
    ctx.arc(x, y - r * 0.12, r * 0.36, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.beginPath();
    ctx.rect(x - r * 0.52, y - r * 0.12, r * 1.04, r * 0.74);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.18, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // a gold key: round bow, shaft, two teeth
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.02, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.max(2.5, r * 0.22);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.02, y - r * 0.02);
    ctx.lineTo(x + r * 0.62, y - r * 0.02);
    ctx.moveTo(x + r * 0.42, y - r * 0.02);
    ctx.lineTo(x + r * 0.42, y + r * 0.26);
    ctx.moveTo(x + r * 0.62, y - r * 0.02);
    ctx.lineTo(x + r * 0.62, y + r * 0.22);
    ctx.stroke();
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.02, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// a little garden gate in its carrier's colour: two posts, a picket, a cross bar
export function drawGate(game, ctx, o) {
  const c = game.cell;
  const [cx, cy] = game.center(o.cells[0][0], o.cells[0][1]);
  const pal = COLOR_PAL[o.color] || COLOR_PAL[0];
  const s = c * 0.42;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(1.5, c * 0.045);
  ctx.fillStyle = '#fff'; // R14: an opaque tile with a navy rim, three wide pickets: the colour reads on a 30 px cell
  game.rr(ctx, cx - s * 1.12, cy - s * 1.12, s * 2.24, s * 2.24, c * 0.16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pal.base;
  for (const k of [-1, 0, 1]) { // posts at the ends, a picket between (pointed tops)
    const px = cx + k * s * 0.72;
    const w = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(px - w / 2, cy + s * 0.9);
    ctx.lineTo(px - w / 2, cy - s * 0.62);
    ctx.lineTo(px, cy - s * 0.95);
    ctx.lineTo(px + w / 2, cy - s * 0.62);
    ctx.lineTo(px + w / 2, cy + s * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.rect(cx - s * 0.95, cy - s * 0.18, s * 1.9, s * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// twins hold paws: a short ribbon (sunny yellow: a kitten's leash is pink with a heart) across the edge they share nearest their heads, with a bow on it
export function ribbons(game, ctx, animIds) {
  const s = game.state;
  const c = game.cell;
  for (const a of game.board.cats) {
    if (a.mech !== 'twin' || a.twin < a.id) continue;
    const b = game.board.cats[a.twin];
    if (!s.alive[a.id] || !s.alive[b.id] || animIds.has(a.id) || animIds.has(b.id)) continue;
    let best = null;
    a.cells.forEach(([x, y], i) => b.cells.forEach(([p, q], j) => {
      if (Math.abs(x - p) + Math.abs(y - q) !== 1) return;
      const score = a.cells.length - i + b.cells.length - j; // closest to both heads
      if (!best || score < best.score) best = { score, x, y, p, q };
    }));
    if (!best) continue;
    const [x0, y0] = game.center(best.x, best.y);
    const [x1, y1] = game.center(best.p, best.q);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const ux = (x1 - x0) / c, uy = (y1 - y0) / c; // across the shared edge
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = Math.max(5, c * 0.14);
    ctx.beginPath(); ctx.moveTo(mx - ux * c * 0.3, my - uy * c * 0.3); ctx.lineTo(mx + ux * c * 0.3, my + uy * c * 0.3); ctx.stroke();
    ctx.strokeStyle = BOW;
    ctx.lineWidth = Math.max(3, c * 0.09);
    ctx.stroke();
    // bow: two loops along the edge and a knot
    const vx = -uy, vy = ux;
    const r = c * 0.19;
    ctx.fillStyle = BOW;
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = Math.max(1.5, c * 0.035);
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + sg * vx * r * 1.6 + ux * r * 0.8, my + sg * vy * r * 1.6 + uy * r * 0.8);
      ctx.lineTo(mx + sg * vx * r * 1.6 - ux * r * 0.8, my + sg * vy * r * 1.6 - uy * r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath();
    ctx.arc(mx, my, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// rules events -> what the player sees, timed like the other pieces (game.js scheduleMech): the padlock opens
export function schedule(game, e, at0) {
  if (e.type === 'unlock') {
    game.pending.push({ at: at0, vis: true, fn: () => {
      for (const id of e.ids) {
        game.mv.locked[id] = false;
        game.popIn[id] = game.clock;
        const p = game.cellPos(id);
        game.sparks(p.x, p.y, GOLD, 8);
      }
      if (game.on.mech) game.on.mech(e);
    } });
  }
}

// a gate opens as its carrier drives off (game.js scheduleEvents times it with the departure)
export function openGate(game, e) {
  game.mv.obj[e.obj] = false;
  const [x, y] = game.center(e.cell[0], e.cell[1]);
  game.sparks(x, y, (COLOR_PAL[e.color] || COLOR_PAL[0]).base, 9);
  if (game.on.mech) game.on.mech(e);
}
