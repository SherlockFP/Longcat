// Game rules v2 on a mutable state. Pure, no DOM.
// Tap a free cat: it leaves the board (kittens trail), then each leaving cat boards the front
// carrier when its color matches, else takes a bench seat. A full front carrier departs, the next
// carrier rolls in and matching bench cats hop in (chains). No seat for a cat = fail.
import { DIRS } from './board.js';
import { mechBlocker, swivelNewest } from './content-mech.js';
import { foldState, foldTick, isFolded, foldWall } from './shape.js'; // shape lane: folded flaps (the board grows)

export const BENCH_DEFAULT = 5;
export const CARRIER_CAP = 3;
export const DOG_WAKE = 3; // cats that must leave near a sleeping dog (cells within 2) before it trots away
export const THAW_NEED = 2; // neighbours that must leave before a frozen cat thaws
export const DOG_NEAR = 2;
const UNDO_MAX = 60;

// Cats with a cell within Chebyshev distance r of any of `cells` (r = 1 includes diagonals).
export function catsNear(board, cells, r) {
  const out = [];
  for (const cat of board.cats) {
    if (cat.cells.some(([x, y]) => cells.some(([cx, cy]) => Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= r))) out.push(cat.id);
  }
  return out;
}

// Cats that share an edge with this cat (static, from the starting layout).
export function edgeNeighbours(board, cat) {
  const out = [];
  for (const o of board.cats) {
    if (o.id === cat.id) continue;
    if (cat.cells.some(([x, y]) => o.cells.some(([ox, oy]) => Math.abs(x - ox) + Math.abs(y - oy) === 1))) out.push(o.id);
  }
  return out;
}

export function createState(board) {
  const { w, h, cats } = board;
  const objs = board.objs || [];
  const grid = new Int16Array(w * h).fill(-1);
  const kittens = cats.map(() => []);
  for (const cat of cats) {
    for (const [x, y] of cat.cells) grid[y * w + x] = cat.id;
    if (cat.kittenOf != null) kittens[cat.kittenOf].push(cat.id);
  }
  objs.forEach((o, k) => {
    for (const [x, y] of o.cells) grid[y * w + x] = -2 - k;
  });
  const near = objs.map((o) => (o.kind === 'dog' ? new Set(catsNear(board, o.cells, DOG_NEAR)) : null));
  const wake = near.map((n) => (n ? Math.min(DOG_WAKE, n.size) : 0));
  const frozen = new Uint8Array(cats.length);
  const neighbours = cats.map((c) => (c.mech ? edgeNeighbours(board, c) : []));
  const nbrOf = cats.map(() => []);
  cats.forEach((c) => {
    if (!c.mech) return;
    for (const o of neighbours[c.id]) nbrOf[o].push(c.id);
    if (c.mech === 'frozen') frozen[c.id] = 1;
  });
  const benchSize = (board.meta && board.meta.benchSize) || BENCH_DEFAULT;
  return {
    board,
    w,
    h,
    grid,
    alive: new Uint8Array(cats.length).fill(1),
    aliveCount: cats.length,
    kittens,
    objs,
    objAlive: new Uint8Array(objs.length).fill(1),
    near, // per obj: Set of cat ids near a dog (else null)
    wake, // per obj: exits needed to wake a dog
    dogCount: new Uint8Array(objs.length),
    frozen,
    thaw: new Uint8Array(cats.length),
    revealed: new Uint8Array(cats.length),
    nbrOf, // cat id -> mechanic cats (frozen / mystery) that count it as a neighbour
    nb: neighbours, // mechanic cat id -> its edge neighbours (a swivel bed turns as they leave)
    carriers: (board.carriers || []).map((c, i) => ({ uid: i, color: c.color, cap: c.cap || CARRIER_CAP, fill: 0 })),
    departed: 0,
    benchSize,
    bench: new Array(benchSize).fill(-1), // seat -> cat id or -1
    benchUsed: 0,
    benchPeak: 0,
    pending: [], // cats that left the board but found no seat (failed state)
    failed: false,
    bonks: 0,
    moves: 0,
    undos: 0,
    scoops: 0,
    undo: [],
    ...foldState(board), // shape lane: foldOf / foldCell / foldNeed / foldOpen / gone
  };
}

// Cells from just past the head straight to the board edge.
export function exitRay(cat, w, h) {
  const head = cat.cells[cat.cells.length - 1];
  const [dx, dy] = DIRS[cat.dir];
  const out = [];
  let x = head[0] + dx;
  let y = head[1] + dy;
  while (x >= 0 && y >= 0 && x < w && y < h) {
    out.push([x, y]);
    x += dx;
    y += dy;
  }
  return out;
}

// First occupied ray cell: { cell:[x,y], id (cat id or -1), obj (dog/yarn index or -1) } or null when the way out is clear.
export function findBlocker(state, id) {
  const cat = state.board.cats[id];
  if (cat.mech === 'spring' || cat.mech === 'swivel') return (state.foldCell && foldWall(state, cat)) || mechBlocker(state, id); // content-mech.js (a closed flap first: shape.js)
  const { w, h, grid } = state;
  const fc = state.foldCell; // a closed flap is a wall (shape.js)
  const head = cat.cells[cat.cells.length - 1];
  const [dx, dy] = DIRS[cat.dir];
  let x = head[0] + dx;
  let y = head[1] + dy;
  while (x >= 0 && y >= 0 && x < w && y < h) {
    if (fc && fc[y * w + x] && !state.foldOpen[fc[y * w + x] - 1]) return { cell: [x, y], id: -1, obj: -1, fold: fc[y * w + x] - 1 };
    const o = grid[y * w + x];
    if (o !== -1) return { cell: [x, y], id: o >= 0 ? o : -1, obj: o >= 0 ? -1 : -2 - o };
    x += dx;
    y += dy;
  }
  return null;
}

export const isFrozen = (state, id) => state.frozen[id] === 1;
// a mystery cat shows "?" until a neighbour leaves
export const isHidden = (state, id) => state.board.cats[id].mech === 'mystery' && !state.revealed[id] && !!state.alive[id];
export const canExit = (state, id) => !state.failed && !!state.alive[id] && !state.frozen[id] && !isFolded(state, id) && findBlocker(state, id) === null;
export { isFolded };
// zzz counter of a sleeping dog (exits still needed), 0 once awake
export const dogLeft = (state, k) => (state.objAlive[k] && state.near[k] ? Math.max(0, state.wake[k] - state.dogCount[k]) : 0);
export const isFailed = (state) => state.failed;
export const isWon = (state) =>
  !state.failed && state.aliveCount === 0 && state.benchUsed === 0 && state.carriers.length === 0 && state.pending.length === 0;
export const front = (state) => state.carriers[0] || null;
export const previews = (state, n = 2) => state.carriers.slice(1, 1 + n);
export const benchFree = (state) => state.benchSize - state.benchUsed;

// Stars per level type: normal 1, hard 2, boss 3 (a schedule-1 'super' board from an old dare link: 3). Zero until won.
export function stars(state) {
  if (!isWon(state)) return 0;
  const k = state.board.meta && state.board.meta.kind;
  return k === 'boss' || k === 'super' ? 3 : k === 'hard' ? 2 : 1;
}

// Take a cat off the grid; trailing kittens follow. Pushes ids (parent first) to `freed`.
export function liftCat(state, id, freed, trail = true) {
  const cat = state.board.cats[id];
  for (const [x, y] of cat.cells) state.grid[y * state.w + x] = -1;
  state.alive[id] = 0;
  state.aliveCount--;
  freed.push(id);
  if (trail) for (const k of state.kittens[id]) if (state.alive[k]) liftCat(state, k, freed, true);
}

// ---- mechanics: reactions to cats leaving ----
// For every cat that left: yarn beside its lane rolls off (tap only), mystery cats beside it are revealed,
// frozen ones count a thaw step, and sleeping dogs near it count a wake step.
function exitEffects(state, freed, events, knock) {
  const { w, h } = state;
  const cats = state.board.cats;
  for (const id of freed) {
    if (knock && state.objs.length) {
      const lane = cats[id].cells.concat(exitRay(cats[id], w, h));
      state.objs.forEach((o, k) => {
        if (o.kind !== 'yarn' || !state.objAlive[k]) return;
        const [yx, yy] = o.cells[0];
        const l = lane.find(([x, y]) => Math.abs(x - yx) + Math.abs(y - yy) === 1);
        if (!l) return;
        state.objAlive[k] = 0;
        state.grid[yy * w + yx] = -1;
        events.push({ type: 'knock', obj: k, cell: [yx, yy], dir: [yx - l[0], yy - l[1]] });
      });
    }
    for (const n of state.nbrOf[id]) {
      if (!state.alive[n]) continue;
      const m = cats[n].mech;
      if (m === 'mystery' && !state.revealed[n]) {
        state.revealed[n] = 1;
        events.push({ type: 'reveal', id: n });
      } else if (m === 'frozen' && state.frozen[n]) {
        state.thaw[n]++;
        if (state.thaw[n] >= THAW_NEED) {
          state.frozen[n] = 0;
          events.push({ type: 'thaw', id: n });
        } else events.push({ type: 'chip', id: n, left: THAW_NEED - state.thaw[n] });
      } else if (m === 'swivel') events.push({ type: 'spin', id: n, dir: swivelNewest(state, n) }); // the bed opens a side
    }
    state.objs.forEach((o, k) => {
      if (!state.objAlive[k] || !state.near[k] || !state.near[k].has(id)) return;
      state.dogCount[k]++;
      if (state.dogCount[k] >= state.wake[k]) {
        state.objAlive[k] = 0;
        for (const [x, y] of o.cells) state.grid[y * w + x] = -1;
        events.push({ type: 'wake', obj: k, cells: o.cells });
      } else events.push({ type: 'zzz', obj: k, left: state.wake[k] - state.dogCount[k] });
    });
  }
  if (state.foldOf) foldTick(state, freed.length, events); // shape lane: enough cats left -> a flap opens
}

// ---- carriers and bench ----

// Front full: depart, roll the next carrier in, hop matching bench cats aboard. Repeats on chains.
function resolve(state, events) {
  while (state.carriers.length && state.carriers[0].fill >= state.carriers[0].cap) {
    const done = state.carriers.shift();
    state.departed++;
    events.push({ type: 'depart', color: done.color, cap: done.cap, n: state.departed, carrier: done.uid });
    const f = state.carriers[0];
    if (!f) break;
    events.push({ type: 'arrive', color: f.color, carrier: f.uid });
    for (let s = 0; s < state.bench.length && f.fill < f.cap; s++) {
      const id = state.bench[s];
      if (id >= 0 && state.board.cats[id].color === f.color) {
        state.bench[s] = -1;
        state.benchUsed--;
        f.fill++;
        events.push({ type: 'board', id, seat: s, color: f.color, carrier: f.uid });
      }
    }
  }
}

// A cat that just left the board finds a carrier or a seat. Returns false when it has no seat.
function place(state, id, events) {
  const color = state.board.cats[id].color;
  const f = state.carriers[0];
  if (f && f.color === color && f.fill < f.cap) {
    f.fill++;
    events.push({ type: 'load', id, color, carrier: f.uid });
  } else {
    const seat = state.bench.indexOf(-1);
    if (seat < 0) {
      state.failed = true;
      events.push({ type: 'fail', id });
      return false;
    }
    state.bench[seat] = id;
    state.benchUsed++;
    if (state.benchUsed > state.benchPeak) state.benchPeak = state.benchUsed;
    events.push({ type: 'bench', id, seat, color });
  }
  resolve(state, events);
  return true;
}

function placeAll(state, ids, events) {
  for (let i = 0; i < ids.length; i++) {
    if (!place(state, ids[i], events)) {
      state.pending = ids.slice(i); // includes the cat that found no seat
      return false;
    }
  }
  return true;
}

// ---- undo ----
function snapshot(state) {
  if (state.undo.length >= UNDO_MAX) state.undo.shift();
  state.undo.push({
    grid: state.grid.slice(),
    alive: state.alive.slice(),
    aliveCount: state.aliveCount,
    carriers: state.carriers.map((c) => ({ ...c })),
    departed: state.departed,
    bench: state.bench.slice(),
    benchUsed: state.benchUsed,
    pending: state.pending.slice(),
    failed: state.failed,
    moves: state.moves,
    benchPeak: state.benchPeak,
    objAlive: state.objAlive.slice(),
    dogCount: state.dogCount.slice(),
    frozen: state.frozen.slice(),
    thaw: state.thaw.slice(),
    revealed: state.revealed.slice(),
    gone: state.gone,
    foldOpen: state.foldOpen.slice(),
  });
}

export const canUndo = (state) => state.undo.length > 0;

// Undo the last tap or scoop. Extra bench seats stay.
export function undo(state, silent = false) {
  const s = state.undo.pop();
  if (!s) return { ok: false };
  state.grid = s.grid;
  state.alive = s.alive;
  state.aliveCount = s.aliveCount;
  state.carriers = s.carriers;
  state.departed = s.departed;
  state.bench = s.bench;
  while (state.bench.length < state.benchSize) state.bench.push(-1);
  state.benchUsed = s.benchUsed;
  state.pending = s.pending;
  state.failed = s.failed;
  state.moves = s.moves;
  state.benchPeak = s.benchPeak;
  state.objAlive = s.objAlive;
  state.dogCount = s.dogCount;
  state.frozen = s.frozen;
  state.thaw = s.thaw;
  state.revealed = s.revealed;
  state.gone = s.gone;
  state.foldOpen = s.foldOpen;
  if (!silent) state.undos++;
  return { ok: true };
}

// ---- actions ----
// Tap a cat.
//  clear   -> { ok:true, bonk:false, id, freed, events, won, failed }
//  blocked -> { ok:false, bonk:true, id, blockerCell, blockerId (cat or -1), blockerObj (dog/yarn or -1) }  (costs nothing)
//  frozen  -> { ok:false, bonk:true, frozen:true, id }
//  gone / game over -> { ok:false, gone|over:true }
export function tap(state, id) {
  const cat = state.board.cats[id];
  if (!cat || !state.alive[id]) return { ok: false, bonk: false, gone: true };
  if (state.failed || isWon(state)) return { ok: false, bonk: false, over: true };
  if (isFolded(state, id)) return { ok: false, bonk: false, folded: true, id }; // under a closed flap: not on the board yet
  if (state.frozen[id]) {
    state.bonks++;
    return { ok: false, bonk: true, frozen: true, id };
  }
  const b = findBlocker(state, id);
  if (b) {
    state.bonks++;
    return { ok: false, bonk: true, id, blockerCell: b.cell, blockerId: b.id, blockerObj: b.obj };
  }
  snapshot(state);
  const freed = [];
  liftCat(state, id, freed, true);
  const events = [];
  exitEffects(state, freed, events, true);
  placeAll(state, freed, events);
  state.moves++;
  return { ok: true, bonk: false, id, freed, events, won: isWon(state), failed: state.failed };
}

// Scoop: lift any cat (blocked or not, its kitten too) straight into a matching carrier or a bench seat.
export function scoop(state, id) {
  const cat = state.board.cats[id];
  if (!cat || !state.alive[id]) return { ok: false, gone: true };
  if (state.failed || isWon(state)) return { ok: false, over: true };
  if (isFolded(state, id)) return { ok: false, folded: true };
  const f = state.carriers[0];
  const matches = f && f.color === cat.color && f.fill < f.cap;
  if (!matches && state.benchUsed >= state.benchSize) return { ok: false, full: true };
  snapshot(state);
  const freed = [];
  // the kitten leaves with its mother and yarn beside the lane is knocked, exactly as on a tap: the generator's
  // solvability proof assumes both, so a scoop can never strand a kitten or a yarn ball (softlock)
  liftCat(state, id, freed, true);
  const events = [];
  exitEffects(state, freed, events, true);
  placeAll(state, freed, events);
  if (state.failed) { // a mother + kitten that would not both find a seat: refuse instead of losing
    undo(state, true);
    return { ok: false, full: true };
  }
  state.moves++;
  state.scoops++;
  return { ok: true, id, freed, events, won: isWon(state), failed: state.failed };
}

// Continue offer: +1 bench seat, then the cat that found no seat sits there.
export function addSeat(state) {
  state.benchSize++;
  state.bench.push(-1);
  const events = [];
  if (state.failed) {
    state.failed = false;
    const ids = state.pending;
    state.pending = [];
    placeAll(state, ids, events);
  }
  return { ok: true, events, won: isWon(state), failed: state.failed };
}
