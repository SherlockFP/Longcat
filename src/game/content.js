// Content lane, board side: spring cats and swivel beds on the canvas, and the themed pack rooms (game.js hooks).
// Visual state trails the rules state like game.mv does: game.mvc.spin[id] = { dir, from, t, open } (the bed turns to its
// newest side and that side opens when the neighbour's sprint clears the edge).
import { exitDirNow, springHop, rayCells, swivelSeq, swivelOpen, swivelNewest } from '../core/content-mech.js';
import { THEMES } from '../../data/content.js';
import { IMG } from './assets.js';
import { assetUrl } from './breeds.js';
import { drawChevron } from './render.js';

const FACE = { U: -Math.PI / 2, R: 0, D: Math.PI / 2, L: Math.PI };
const NAVY = '#1d2b53';
const ART = ['swivel_bed', 'bg_rainy', 'bg_bakery', 'bg_garden', 'bg_starry'];

// the lane's art, loaded on first use (a missing file keeps the procedural fallback)
let loading = false;
export function preload() {
  if (loading || typeof Image === 'undefined') return;
  loading = true;
  for (const n of ART) {
    const im = new Image();
    im.onload = () => { IMG['r7/' + n] = im; };
    im.src = assetUrl(`r7/${n}.webp`);
  }
}

// which way a cat faces right now (rules state): game.js lane preview, bonk, hint arrow
export const dirOf = (game, id) => (game.state ? exitDirNow(game.state, id) : game.board.cats[id].dir);

// the leaving cat's way out and how many cells to the edge (startRun)
export function exitOf(game, lead) {
  const dir = lead.mech === 'swivel' && game.state ? exitDirNow(game.state, lead.id) : lead.dir;
  if (dir === lead.dir) return { dir, ray: lead.ray };
  return { dir, ray: rayCells(lead, dir, game.board.w, game.board.h).length };
}

export function sync(game) {
  const spin = {};
  const st = game.state;
  if (st) for (const c of st.board.cats) if (c.mech === 'swivel') spin[c.id] = { dir: swivelNewest(st, c.id), from: null, t: -9, open: swivelOpen(st, c.id) };
  game.mvc = { spin };
}

// a neighbour's sprint cleared the edge: the bed turns and opens its next side (a short swing, none with reduced motion)
export function spin(game, e) {
  const v = game.mvc && game.mvc.spin[e.id];
  if (!v || v.dir === e.dir) return;
  const seq = swivelSeq(game.board.cats[e.id]);
  game.mvc.spin[e.id] = { dir: e.dir, from: v.dir, t: game.clock, open: seq.slice(0, seq.indexOf(e.dir) + 1) };
  const p = game.cellPos(e.id);
  game.sparks(p.x, p.y, '#ffd43b', 5);
  if (game.on.mech) game.on.mech({ type: 'spin', id: e.id });
}

// the facing as drawn (radians), easing from the old facing to the new one
function shownAngle(game, id) {
  const v = game.mvc && game.mvc.spin[id];
  const dir = v ? v.dir : game.board.cats[id].dir;
  let a = FACE[dir];
  if (v && v.from && !game.calm) {
    const u = Math.min(1, (game.clock - v.t) / 0.35);
    if (u < 1) {
      let d = a - FACE[v.from];
      while (d <= -Math.PI) d += 2 * Math.PI;
      while (d > Math.PI) d -= 2 * Math.PI;
      if (d < 0) d += 2 * Math.PI; // the bed always turns clockwise
      const k = 1 - (1 - u) * (1 - u) * (1 + 1.7 * u); // ease out with a little overshoot
      a = FACE[v.from] + d * k;
    }
  }
  return a;
}

// under the cat: a swivel bed (a round plush bed under the head that turns with the facing)
export function under(game, ctx, cat) {
  if (cat.mech !== 'swivel') return;
  const c = game.cell;
  const [hx, hy] = cat.cells[cat.cells.length - 1];
  const [x, y] = game.center(hx, hy);
  const ang = shownAngle(game, cat.id);
  const r = c * 0.62; // wider than the head, so the rim shows around it
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang + Math.PI / 2);
  const im = IMG['r7/swivel_bed'];
  if (im) ctx.drawImage(im, -r * 1.06, -r * 1.06, r * 2.12, r * 2.12);
  else {
    ctx.fillStyle = 'rgba(60,30,10,0.22)';
    ctx.beginPath();
    ctx.arc(-r * 0.06, r * 0.08, r * 0.98, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#BD582F';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6e5';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
    ctx.fill();
  }
  // a notch on the rim marks the facing (the bed's "front")
  ctx.fillStyle = '#ffd43b';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(1.5, c * 0.035);
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.82);
  ctx.lineTo(0, -r * 1.08);
  ctx.lineTo(r * 0.2, -r * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// a coiled spring in a yellow disc (drawn procedurally: reads at 16 px)
function coil(ctx, x, y, r, squash = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffd43b';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(1.6, r * 0.2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const hh = r * 0.62 * squash;
  const hw = r * 0.45;
  ctx.beginPath();
  ctx.moveTo(-hw, hh);
  for (let i = 1; i <= 5; i++) ctx.lineTo(i % 2 ? hw : -hw, hh - (2 * hh * i) / 5);
  ctx.stroke();
  ctx.restore();
}

// a little swivel bed on the head (it turns with the bed): reads like the other pieces' badges
function bedBadge(ctx, x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(rot);
  const im = IMG['r7/swivel_bed'];
  if (im) ctx.drawImage(im, -r, -r, 2 * r, 2 * r);
  else {
    ctx.fillStyle = '#BD582F';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6e5';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// over the cat: the spring badge on a spring cat; on a swivel cat, a chevron on every side its bed has opened (the newest
// one rides the turning bed)
export function over(game, ctx, cat, path, hb) {
  const c = game.cell;
  if (cat.mech === 'spring') {
    const [hx, hy] = cat.cells[cat.cells.length - 1];
    const [x, y] = game.center(hx, hy);
    const q = game.calm ? 1 : 0.85 + 0.15 * Math.abs(Math.sin(game.clock * 3 + cat.id));
    coil(ctx, x - c * 0.3, y - c * 0.36, c * 0.23, q);
  } else if (cat.mech === 'swivel') {
    const [hx, hy] = cat.cells[cat.cells.length - 1];
    const [x, y] = game.center(hx, hy);
    bedBadge(ctx, x - c * 0.3, y - c * 0.36, c * 0.24, shownAngle(game, cat.id) + Math.PI / 2);
    const v = game.mvc && game.mvc.spin[cat.id];
    const open = v ? v.open : [cat.dir];
    const bob = game.calm ? 0 : Math.sin(game.clock * 4) * c * 0.03;
    const d = c * 0.42 + bob;
    for (const side of open) {
      if (v && side === v.dir) continue;
      drawChevron(ctx, x + Math.cos(FACE[side]) * d, y + Math.sin(FACE[side]) * d, FACE[side], c * 0.17, 0.8);
    }
    const ang = shownAngle(game, cat.id);
    drawChevron(ctx, x + Math.cos(ang) * d, y + Math.sin(ang) * d, ang, c * 0.2, 0.95);
  }
}

// a tap on a spring cat that hops: a boing over the cat it clears
export function run(game, lead, t0) {
  if (lead.mech !== 'spring' || !game.state) return;
  const cell = springHop(game.state, lead.id);
  if (!cell) return;
  const [x, y] = game.center(cell[0], cell[1]);
  game.pending.push({ at: t0 + 0.16, fn: () => {
    game.sparks(x, y - game.cell * 0.3, '#ffd43b', 7);
    if (game.on.mech) game.on.mech({ type: 'spring', id: lead.id });
  } });
}

// ---- pack rooms ----
// game.theme (set per level by src/ui/content.js): the pack's painted room, a colour wash and a light ambient effect
// (rain on the glass, flour motes, petals, twinkling stars). Static with reduced motion.
// the pack room as data, for the perf lane's baked underlay: { img, wash, key }, or null for the default room
export function room(game) {
  const th = !game.demo && game.theme && THEMES[game.theme];
  if (!th) return null;
  const img = IMG['r7/bg_' + game.theme] || IMG['r7/bg_play_room'];
  if (!img) return null;
  const wash = IMG['r7/bg_' + game.theme] ? th.wash : th.bare; // no pack art yet: tint the sunny room harder
  return { img, wash, key: game.theme };
}

// the live ambient effect only (drawn every frame over a baked room)
export function ambient(game, ctx) {
  const th = !game.demo && game.theme && THEMES[game.theme];
  if (th) fx(game, ctx, th.fx, game.W, game.H);
}

// deterministic pseudo-random per index (no per-frame allocation)
const rnd = (i, k) => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function fx(game, ctx, kind, W, H) {
  const t = game.calm ? 0 : game.clock;
  const top = Math.min(H * 0.2, (game.beltY || H * 0.2) - 10); // the wall strip above the belt (never over the board)
  ctx.save();
  if (kind === 'rain') {
    ctx.strokeStyle = 'rgba(210,230,255,0.5)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const x = rnd(i, 1) * W;
      const sp = 0.5 + rnd(i, 2) * 0.5;
      const y = ((rnd(i, 3) + t * sp) % 1) * top;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + 9 + 6 * sp);
    }
    ctx.stroke();
  } else if (kind === 'flour') {
    ctx.fillStyle = 'rgba(255,250,235,0.55)';
    for (let i = 0; i < 18; i++) {
      const x = (rnd(i, 1) * W + Math.sin(t * 0.6 + i) * 10 + W) % W;
      const y = ((rnd(i, 2) + t * 0.03 * (0.5 + rnd(i, 4))) % 1) * H;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + rnd(i, 3) * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'petals') {
    for (let i = 0; i < 9; i++) {
      const x = (rnd(i, 1) * W + t * 14 * (0.5 + rnd(i, 2)) + W) % W;
      const y = ((rnd(i, 3) + t * 0.04) % 1) * top * 1.1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 1.5 + i);
      ctx.fillStyle = i % 2 ? 'rgba(255,170,200,0.8)' : 'rgba(255,240,245,0.85)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (kind === 'stars') {
    for (let i = 0; i < 14; i++) {
      const x = rnd(i, 1) * W;
      const y = rnd(i, 2) * top;
      const a = game.calm ? 0.7 : 0.35 + 0.45 * Math.abs(Math.sin(t * (0.8 + rnd(i, 3)) + i));
      ctx.fillStyle = `rgba(255,244,200,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 1 + rnd(i, 4) * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

