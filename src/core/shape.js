// Shape lane: boards that change shape and boards that grow mid-level. Pure, no DOM.
//
// SHAPED BOARDS. board.shape = { name, mask } (mask: 0/1 per cell, row-major). A void cell (0) is open air: no cat, dog
// or yarn sits there, and a cat's way out slides straight over it (the room floor under the rug). So the rules, the
// solver and the generator need no new blocking rule: a void cell is simply never occupied. Only the generator's
// placement (generate.js runAttempt / placeObstacles) and the fill ratio know about the mask.
//
// FOLDED SECTIONS (the board grows). board.folds = [{ cells, need, cats }]: a quilted flap covers `cells` until `need`
// cats have left the board (any cats, kittens count, scoops too). While a flap is closed it is a solid wall: the cats
// under it cannot be tapped or scooped, and every cell of it (cat or not) stops a cat whose way out crosses it. Once
// enough cats left it opens for good and the board is one cell grid again. The rule is the same in rules.js (state
// gone / foldOpen) and in the search model (search.js Sim.gone), so the solver and the generator see what the player sees.
import { hashSeed, makeRng } from './rng.js';
import { SHAPES, GENTLE, BOLD, BOLD3, BOSS, SHAPE_FROM, FOLD_FROM } from '../../data/shape.js';
import { createState, tap, exitRay } from './rules.js'; // used at run time only (rules.js imports this module too)

const DIRV = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
const MAX_W = 9; // 9 wide fits 37 px a cell on 375 px; the height decides
const MAX_H = 10; // a shaped board stays 10 rows: the 11-row tier is 29 px a cell on 375 x 667 with the HUD, 10 rows keep >= 30

// ---- schedule ----
// the first shaped board is L16 (a heart), then one in 4 boards to L49, one in 3 to L119, every other one after;
// boss boards (kind 'boss', fed by the boss lane) always get a showpiece. Teaching levels stay plain.
export function shapeFor(n, kind = 'normal', teach = false) {
  if (kind === 'boss') return BOSS[hashSeed('shapeboss', n) % BOSS.length];
  if (n < SHAPE_FROM || teach) return null;
  if (n === SHAPE_FROM) return 'heart';
  const every = n < 50 ? 4 : 2;
  if ((n - SHAPE_FROM) % every) return null;
  const list = n < 50 ? GENTLE : BOLD;
  return list[(Math.floor((n - SHAPE_FROM) / every) * 3) % list.length]; // steps of 3 walk the whole list before a repeat
}

// schedule 3 (R13, the owner: "the board must not stay the same rectangle"): one board in 3 shaped from L16, two in 3
// from L40, three in 4 from L80 (the boards between get a box of another aspect: altBox). Bosses as before.
export function shapeFor3(n, kind = 'normal', teach = false) {
  if (kind === 'boss' || n <= SHAPE_FROM) return shapeFor(n, kind, teach);
  if (teach || (n < 60 && foldFor(n, kind, teach, false))) return null; // a quilt board stays a quilt (one new idea at a time)
  const k = n - SHAPE_FROM;
  if (!(n < 40 ? k % 3 === 0 : n < 80 ? k % 3 !== 2 : k % 4 !== 3)) return null;
  const list = n < 40 ? GENTLE : BOLD3;
  return list[(n * 5) % list.length]; // neighbouring shaped boards never repeat a shape
}

// schedule 3: a plain board of another aspect, about the same floor (90-108% of the tier's box), 5-9 wide, 6-10 tall
// (cells stay >= 30 px on 375 x 667), never the box itself; which one walks with n so neighbours differ
export function altBox(P) {
  const a = P.w * P.h;
  const alt = [];
  for (let w = 5; w <= MAX_W; w++) for (let h = 6; h <= MAX_H; h++) {
    if ((w === P.w && h === P.h) || w * h < 0.9 * a || w * h > 1.08 * a || h / w > 1.7 || w / h > 1.3) continue;
    alt.push([w, h]);
  }
  if (!alt.length) return;
  [P.w, P.h] = alt[(P.n * 7 + (P.n >> 2) + (altRetry.get(P.sv * 1e4 + P.n) || 0)) % alt.length];
  P.alt = true;
  const key = P.sv * 1e4 + P.n;
  P.evalBonus = P.after || shapeOff.has(key) || altRetry.has(key) ? 0 : -26; // a short first look, a miss takes a second box (generate.js); a breather or a missed shape: one full look
}

function applyShape(P, name) {
  const c = cropMask(buildMask(name, Math.min(MAX_W, P.w + 1), Math.min(MAX_H, P.h + 1)), Math.min(MAX_W, P.w + 1), Math.min(MAX_H, P.h + 1));
  P.w = c.w;
  P.h = c.h;
  const mask = c.mask;
  const floor = [];
  mask.forEach((v, i) => { if (v) floor.push(i); });
  P.shape = { name, mask };
  P.mask = Uint8Array.from(mask);
  P.floor = floor;
  P.area = floor.length;
  P.evalBonus = -16; // a shaped board that misses its band ships plain (generate.js): its own search stays short
}

// folded flaps: L22 first, then every fifth board (normal boards only: hard ones keep their measured band), two flaps
// on some boards from L70. Not on a shaped board before L60 (one new idea at a time).
export function foldFor(n, kind = 'normal', teach = false, shaped = false) {
  if (n < FOLD_FROM || teach || kind !== 'normal') return 0;
  if ((n - FOLD_FROM) % 5) return 0;
  if (shaped && n < 60) return 0;
  return n >= 70 && (n - FOLD_FROM) % 10 === 0 ? 2 : 1;
}

// ---- masks ----
export function buildMask(name, w, h) {
  const f = SHAPES[name];
  const m = new Array(w * h).fill(1);
  if (!f) return m;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = f(((x + 0.5) / w) * 2 - 1, ((y + 0.5) / h) * 2 - 1) ? 1 : 0;
  // tidy: thin tips (one floor neighbour or none) go, then islands under 4 cells (no cat fits there with any choice)
  const nb = (i) => {
    const x = i % w, y = (i / w) | 0;
    return (x > 0 && m[i - 1]) + (x < w - 1 && m[i + 1]) + (y > 0 && m[i - w]) + (y < h - 1 && m[i + w]);
  };
  const tips = [];
  for (let i = 0; i < w * h; i++) if (m[i] && nb(i) <= 1) tips.push(i);
  for (const i of tips) m[i] = 0;
  const seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || seen[i]) continue;
    const comp = [i];
    seen[i] = 1;
    for (let k = 0; k < comp.length; k++) {
      const j = comp[k], x = j % w, y = (j / w) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const q = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && m[q] && !seen[q]) { seen[q] = 1; comp.push(q); }
      }
    }
    if (comp.length < 4) for (const j of comp) m[j] = 0;
  }
  return m;
}

// the mask cropped to its floor's bounding box (a tidied tip can leave an empty edge row): { w, h, mask }
function cropMask(m, w, h) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let i = 0; i < w * h; i++) if (m[i]) { const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return { w, h, mask: m };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = new Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out[y * cw + x] = m[(y + y0) * w + x + x0];
  return { w: cw, h: ch, mask: out };
}

// generate.js params(): the box, the mask and the floor area of level n. Past L50 the plain boards alternate a tall
// 8 x 11 and a wide 9 x 10 (same cell size budget), and a shaped board takes a box one size up (capped at 9 x 11) so
// the void it carves out does not shrink the puzzle.
// levels whose shaped board missed the floor every level keeps: they ship as a plain board (generate.js)
export const shapeOff = new Set();
// schedule 3: levels whose first other-aspect box missed the band take the next one (generate.js, one retry)
export const altRetry = new Map();

export function shapeParams(P) {
  // a breather and a 'medium' board keep the plain box: their decision band is the one open-air gaps loosen most
  const calm = (P.after || P.medium) && P.kind !== 'boss' && P.n !== SHAPE_FROM;
  const s3 = P.sv >= 3;
  const slot = (s3 ? shapeFor3 : shapeFor)(P.n, P.kind, P.teach);
  const name = shapeOff.has(P.sv * 1e4 + P.n) || calm ? null : slot;
  if (!name && !s3 && P.kind === 'normal' && P.n >= 50 && P.w === 8 && P.h === 11 && P.n % 2) { P.w = 9; P.h = 10; }
  // schedule 3: a calm board, a shape that missed its band, every other plain board from L40 and all of them from L80
  // take another aspect
  if (s3 && P.teach && P.n > 100 && P.h > 9) P.h = 9; // an R13 lesson: its hint line takes a row's height, cells stay >= 30 px
  if (!name && s3 && P.n > SHAPE_FROM && !P.teach && P.kind !== 'boss' && (slot || P.n >= 80 || (P.n >= 40 && P.n % 2 === 0))) altBox(P);
  if (name) applyShape(P, name);
  else P.area = P.w * P.h;
  P.folds = foldFor(P.n, P.kind, P.teach, !!name);
  return P;
}

// the floor every board keeps (scripts/check-core.mjs): a safe start, a trap, a bench chain, the hard / super band,
// a kitten that matters, depth 2, fill 55% of the floor
export function shapeKeeps(board, d, P, kit, depth) {
  if (!d || d.startSafe < 2 || d.chains < 1 || (P.after ? d.traps > 2 : d.traps < 1)) return false;
  if (P.kind === 'hard' && !(d.traps >= 3 && d.chain3 >= 1)) return false;
  if (P.kind === 'super' && !(d.traps >= 4 && d.chain3 >= 1)) return false;
  // R11x: a boss showpiece shape ships only when it keeps the boss floor (scripts/check-core.mjs: 4 traps, a whole carrier
  // from the bench, the bench run to its last spare seat) and most of the giant order (22+ of the ~24 cats); else the
  // plain big boss board. Its box is at most 9 x 10, so its cells are never smaller than the plain 9 x 11 boss board's
  if (P.kind === 'boss' && !(d.traps >= 4 && d.chain3 >= 1 && d.peak >= P.benchSize - 1 && board.cats.length >= 22)) return false;
  let filled = 0;
  for (const c of board.cats) filled += c.cells.length;
  if (!(depth >= 2 && filled / P.area >= 0.55 && (P.n < 6 || (kit.pairs >= 1 && kit.matter >= 1)))) return false;
  return swivelHeld(board);
}

// a swivel ships only when the line taps it while its starting lane is still taken (open air over a void cell is not)
function swivelHeld(board) {
  if (!board.cats.some((c) => c.mech === 'swivel')) return true;
  const st = createState(board);
  for (const id of board.meta.order) {
    const c = board.cats[id];
    if (c.mech === 'swivel' && !exitRay(c, board.w, board.h).some(([x, y]) => st.grid[y * board.w + x] !== -1)) return false;
    if (!tap(st, id).ok) return false;
  }
  return true;
}

export const floorCount = (board) => (board.shape ? board.shape.mask.reduce((t, v) => t + v, 0) : board.w * board.h);
export const isVoid = (board, x, y) => !!board.shape && !board.shape.mask[y * board.w + x];

// ---- rules state (rules.js createState) ----
export function foldState(board) {
  const F = board.folds;
  if (!F || !F.length) return { foldOf: null, foldCell: null, foldNeed: [], foldOpen: new Uint8Array(0), gone: 0 };
  const foldOf = new Int8Array(board.cats.length).fill(-1);
  const foldCell = new Int8Array(board.w * board.h);
  F.forEach((f, k) => {
    for (const [x, y] of f.cells) foldCell[y * board.w + x] = k + 1;
    for (const id of f.cats) foldOf[id] = k;
  });
  return { foldOf, foldCell, foldNeed: F.map((f) => f.need), foldOpen: new Uint8Array(F.length), gone: 0 };
}

export const isFolded = (state, id) => !!state.foldOf && state.foldOf[id] >= 0 && !state.foldOpen[state.foldOf[id]];
// cats still to leave before flap k opens (0 once open)
export const foldLeft = (state, k) => (state.foldOpen[k] ? 0 : Math.max(0, state.foldNeed[k] - state.gone));

// n cats just left the board: count them, open every flap whose count is reached
export function foldTick(state, n, events) {
  state.gone += n;
  for (let k = 0; k < state.foldOpen.length; k++) {
    if (state.foldOpen[k] || state.gone < state.foldNeed[k]) continue;
    state.foldOpen[k] = 1;
    events.push({ type: 'unfold', fold: k });
  }
}

// ---- search model (search.js compile / Sim.canExit) ----
function rayOf(cat, w, h) {
  const head = cat.cells[cat.cells.length - 1];
  const [dx, dy] = DIRV[cat.dir];
  const out = [];
  for (let x = head[0] + dx, y = head[1] + dy; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) out.push([x, y]);
  return out;
}

export function compileFold(board, unitOf, units) {
  const F = board.folds || [];
  if (!F.length) return { nFold: 0 };
  const { w, h, cats } = board;
  const cellF = new Int8Array(w * h);
  const foldU = new Int8Array(units.length).fill(-1);
  F.forEach((f, k) => {
    for (const [x, y] of f.cells) cellF[y * w + x] = k + 1;
    for (const id of f.cats) foldU[unitOf[id]] = k;
  });
  const rayF = units.map((p) => {
    const s = new Set();
    for (const [x, y] of rayOf(cats[p], w, h)) if (cellF[y * w + x]) s.add(cellF[y * w + x] - 1);
    return Int8Array.from(s);
  });
  return { nFold: F.length, foldU, rayF, foldNeed: Int16Array.from(F.map((f) => f.need)) };
}

// rules.js findBlocker for a spring cat: a closed flap on its lane is a wall it cannot hop (swivels never meet a flap)
export function foldWall(state, cat) {
  const { w, h } = state;
  for (const [x, y] of rayOf(cat, w, h)) {
    const f = state.foldCell[y * w + x];
    if (f && !state.foldOpen[f - 1]) return { cell: [x, y], id: -1, obj: -1, fold: f - 1 };
  }
  return null;
}

// a closed flap holds unit u: it sits under the flap, or its way out crosses one
export function foldBlocked(sim, u) {
  const C = sim.C;
  const g = sim.gone;
  const f = C.foldU[u];
  if (f >= 0 && g < C.foldNeed[f]) return true;
  const r = C.rayF[u];
  for (let i = 0; i < r.length; i++) if (g < C.foldNeed[r[i]]) return true;
  return false;
}

// ---- generator: fold a band of the finished board away ----
// A band along one edge (2-4 rows or 2-3 columns) or a corner block becomes a flap: every cat with a cell in it is
// folded (mother and kitten together), and the flap opens after `need` cats have left. When the winning line already
// sends `need` cats off before it first taps a folded cat OR a cat whose way out crosses the flap, the line stays a legal
// win as it is. Otherwise (a board with no dog / yarn / ice / mystery to keep on the line) the solver looks for a new
// winning line on the folded board. Either way the decisions are measured again and the flap ships only if the level
// keeps its floor (a safe start, a trap, a bench chain) and the line never needs the last cushion.
const NEED_MAX = 6;
const SEARCH = 1500; // solver nodes per flap that needs a new line

function floorOk(d, P) {
  if (!d || d.startSafe < 2 || d.chains < 1 || d.peak > P.benchSize - 1) return false;
  return P.after ? d.traps <= 2 : d.traps >= 1;
}

function bands(w, h) {
  const out = [];
  const cw = Math.ceil(w / 2);
  for (const k of [3, 2, 4]) if (h - k >= 5) { out.push({ side: 'bottom', test: (x, y) => y >= h - k }); out.push({ side: 'top', test: (x, y) => y < k }); }
  for (const k of [2, 3]) if (w - k >= 4) { out.push({ side: 'left', test: (x) => x < k }); out.push({ side: 'right', test: (x) => x >= w - k }); }
  out.push({ side: 'bl', test: (x, y) => x < cw && y >= h - 4 }, { side: 'br', test: (x, y) => x >= w - cw && y >= h - 4 });
  out.push({ side: 'tl', test: (x, y) => x < cw && y < 4 }, { side: 'tr', test: (x, y) => x >= w - cw && y < 4 });
  return out;
}

function foldCandidate(board, band, taken, line, rng, canSearch) {
  const { w, h, cats } = board;
  const mask = board.shape ? board.shape.mask : null;
  const root = (id) => (cats[id].kittenOf != null ? cats[id].kittenOf : id);
  const inUnit = new Set();
  for (const c of cats) if (c.cells.some(([x, y]) => band.test(x, y))) inUnit.add(root(c.id));
  if (!inUnit.size) return null;
  const ids = cats.filter((c) => inUnit.has(root(c.id))).map((c) => c.id);
  if (ids.some((id) => taken.ids.has(id))) return null;
  const cell = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (band.test(x, y) && (!mask || mask[y * w + x])) cell[y * w + x] = 1;
  for (const id of ids) for (const [x, y] of cats[id].cells) cell[y * w + x] = 1;
  for (const o of board.objs || []) if (o.cells.some(([x, y]) => cell[y * w + x])) return null; // no dog or yarn under a flap
  // a swivel bed turns its lane: it never sits under a flap and none of its four lanes crosses one
  for (const c of cats) {
    if (c.mech !== 'swivel' && c.mech !== 'twin') continue; // R13 twins: two lanes, the flap model follows one
    if (c.cells.some(([x, y]) => cell[y * w + x])) return null;
    for (const dk of ['U', 'R', 'D', 'L']) if (rayOf({ cells: c.cells, dir: dk }, w, h).some(([x, y]) => cell[y * w + x])) return null;
  }
  let size = 0;
  let inBand = 0;
  for (let i = 0; i < w * h; i++) if (cell[i]) { if (taken.cells[i]) return null; size++; if (band.test(i % w, (i / w) | 0)) inBand++; }
  if (size - inBand > 0.4 * inBand) return null; // cats poking far out of the band would make a ragged flap
  if (size > 0.45 * line.floor || ids.length < 3 || ids.length > 0.5 * cats.length) return null;
  // first tap on the line that the flap holds: a folded unit, or a unit whose way out crosses the flap
  let first = line.order.length;
  line.order.forEach((p, i) => {
    if (i >= first) return;
    if (inUnit.has(p) || rayOf(cats[p], w, h).some(([x, y]) => cell[y * w + x])) first = i;
  });
  let need = Math.min(NEED_MAX, line.before[first]);
  let search = false;
  if (need < 2 || (need < 3 && canSearch)) {
    if (!canSearch) return null;
    need = 3 + rng.int(0, 2);
    search = true;
  }
  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cell[y * w + x]) cells.push([x, y]);
  return { side: band.side, cells, need, cats: ids.sort((a, b) => a - b), cell, ragged: size - inBand, search };
}

function lineOf(board, order) {
  const before = [0];
  for (const p of order) before.push(before[before.length - 1] + 1 + board.cats.filter((c) => c.kittenOf === p).length);
  return { order, before, floor: floorCount(board) };
}

// tools: { decide(board, order) = search.js decisions, solveLine(board, budget) = a winning line (root cat ids) or null }
// (passed in by generate.js: no import cycle). Returns { d, order } measured on the shipped board, else null.
export function applyFolds(board, P, tools) {
  const want = P.folds || 0;
  if (!want || !board.meta.order) return null;
  const canSearch = !board.objs.length && !board.cats.some((c) => c.mech); // a new line must not lose a mechanic's moment
  const rng = makeRng(hashSeed('fold', P.n));
  const taken = { ids: new Set(), cells: new Uint8Array(board.w * board.h) };
  const folds = [];
  let order = board.meta.order;
  let d = null;
  const pack = (list) => list.map((x) => ({ side: x.side, cells: x.cells, need: x.need, cats: x.cats }));
  for (let f = 0; f < want; f++) {
    const line = lineOf(board, order);
    const total = line.before[line.before.length - 1];
    const cand = [];
    for (const b of bands(board.w, board.h)) {
      if (folds.some((x) => x.side === b.side)) continue;
      const c = foldCandidate(board, b, taken, line, rng, canSearch);
      if (!c) continue;
      if (folds.length && c.need <= folds[folds.length - 1].need) { // a second flap opens later than the first
        if (!canSearch) continue;
        c.need = folds[folds.length - 1].need + 2;
        c.search = true;
      }
      if (c.need > total - c.cats.length) continue;
      c.score = 2 * c.cats.length + (c.side === 'bottom' ? 2 : 0) - 0.5 * c.ragged - (c.search ? 3 : 0) + rng.next() * 2;
      cand.push(c);
    }
    cand.sort((a, b) => b.score - a.score);
    let ok = null;
    let searched = 0;
    for (const c of cand.slice(0, 4)) {
      if (c.search && searched >= 2) continue;
      board.folds = pack(folds.concat([c]));
      let o = order;
      if (c.search) {
        searched++;
        o = tools.solveLine(board, SEARCH);
        if (!o) continue;
      }
      const dd = tools.decide(board, o);
      if (floorOk(dd, P)) { ok = c; d = dd; order = o; break; }
    }
    if (!ok) break;
    folds.push(ok);
    for (const id of ok.cats) taken.ids.add(id);
    for (let i = 0; i < ok.cell.length; i++) if (ok.cell[i]) taken.cells[i] = 1;
  }
  if (!folds.length) { delete board.folds; return null; }
  board.folds = pack(folds);
  return { d, order };
}

// generate.js: the shape and the flaps go on the finished board, its meta follows the flaps' decisions
export function shapeFinish(board, P, tools) {
  if (P.shape) board.shape = { name: P.shape.name, mask: P.shape.mask.slice() };
  const r = applyFolds(board, P, tools);
  if (r) {
    const d = r.d;
    board.meta.order = r.order;
    Object.assign(board.meta, { benchPeak: d.peak, chains: d.chains, chain3: d.chain3, traps: d.traps, late: d.late, deadRatio: d.deadRatio, freeAvg: d.freeAvg, startSafe: d.startSafe, forced: d.forced });
    board.meta.work = (board.meta.work || 0) + d.nodes;
  }
  board.meta.shape = P.shape ? P.shape.name : null;
  if (P.alt) board.meta.alt = true; // schedule 3: a box of another aspect
  board.meta.folds = board.folds ? board.folds.length : 0;
  return board;
}
