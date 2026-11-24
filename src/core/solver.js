// Solver, validator metrics and hints. Pure, no DOM.
import { createState, exitRay, findBlocker, canExit, tap, undo, isWon } from './rules.js';
import { fillRatio } from './board.js';
import { compile, Sim, searchWin } from './search.js';

// The plain cat layout: arrow metrics ignore dogs and yarn (they are placed so a known order still wins).
const bare = (board) => ((board.objs && board.objs.length) || board.folds ? { ...board, objs: [], folds: null } : board); // shape lane: flaps too

export function unitRoot(board, id) {
  let c = board.cats[id];
  while (c.kittenOf != null) c = board.cats[c.kittenOf];
  return c.id;
}

// Arrow-only solvability (ignores carriers and bench). Removing a cat never blocks another,
// so greedy removal is complete.
export function arrowSolve(board) {
  const st = createState(bare(board));
  const order = [];
  let progress = true;
  while (progress && st.aliveCount > 0) {
    progress = false;
    for (const cat of board.cats) {
      if (st.alive[cat.id] && !findBlocker(st, cat.id)) {
        const freed = [];
        for (const [x, y] of cat.cells) st.grid[y * st.w + x] = -1;
        st.alive[cat.id] = 0;
        st.aliveCount--;
        freed.push(cat.id);
        for (const k of st.kittens[cat.id]) if (st.alive[k]) {
          for (const [x, y] of board.cats[k].cells) st.grid[y * st.w + x] = -1;
          st.alive[k] = 0;
          st.aliveCount--;
        }
        order.push(cat.id);
        progress = true;
      }
    }
  }
  return { solvable: st.aliveCount === 0, order, left: st.aliveCount };
}

// Replay a tap order under the real rules.
export function replay(board, order) {
  const st = createState(board);
  for (const id of order) {
    const r = tap(st, id);
    if (!r.ok) return { won: false, failed: st.failed, peak: st.benchPeak, state: st, bad: id };
  }
  return { won: isWon(st), failed: st.failed, peak: st.benchPeak, state: st };
}

// Longest chain of "must leave first" dependencies. Parent+kitten count as one unit.
// depth 0 = every cat is free. Returns -1 on a dependency cycle.
export function dependencyDepth(board) {
  const st = createState(bare(board));
  const blockers = new Map();
  for (const cat of board.cats) {
    if (cat.kittenOf != null) continue;
    const set = new Set();
    for (const [x, y] of exitRay(cat, st.w, st.h)) {
      const o = st.grid[y * st.w + x];
      if (o >= 0) set.add(unitRoot(board, o));
    }
    blockers.set(cat.id, set);
  }
  const memo = new Map();
  const visiting = new Set();
  let cyclic = false;
  const depthOf = (u) => {
    if (memo.has(u)) return memo.get(u);
    if (visiting.has(u)) {
      cyclic = true;
      return 0;
    }
    visiting.add(u);
    let d = 0;
    for (const b of blockers.get(u)) d = Math.max(d, 1 + depthOf(b));
    visiting.delete(u);
    memo.set(u, d);
    return d;
  };
  let max = 0;
  for (const u of blockers.keys()) max = Math.max(max, depthOf(u));
  return cyclic ? -1 : max;
}

// Count kitten pairs, and how many "matter": some other cat's exit ray crosses the
// kitten but not the parent unit, so the kitten alone is what holds that cat.
export function kittenStats(board) {
  const st = createState(bare(board));
  let pairs = 0;
  let matter = 0;
  for (const k of board.cats) {
    if (k.kittenOf == null) continue;
    pairs++;
    const p = k.kittenOf;
    let matters = false;
    for (const x of board.cats) {
      if (x.kittenOf != null || x.id === p) continue;
      let hasK = false;
      let hasP = false;
      for (const [cx, cy] of exitRay(x, st.w, st.h)) {
        const o = st.grid[cy * st.w + cx];
        if (o < 0) continue;
        if (o === k.id) hasK = true;
        else if (unitRoot(board, o) === p) hasP = true;
      }
      if (hasK && !hasP) {
        matters = true;
        break;
      }
    }
    if (matters) matter++;
  }
  return { pairs, matter };
}

export function freeCats(state) {
  const out = [];
  for (const cat of state.board.cats) {
    if (canExit(state, cat.id)) out.push(cat.id);
  }
  return out;
}

// Move ordering score for the hint fallback: lower is better. Prefers cats that board straight away.
function moveCost(st, id) {
  const cat = st.board.cats[id];
  const f = st.carriers[0];
  let cost = 0;
  const kids = st.kittens[id].filter((k) => st.alive[k]);
  const group = [cat, ...kids.map((k) => st.board.cats[k])];
  let need = f ? f.cap - f.fill : 0;
  for (const c of group) {
    if (f && c.color === f.color && need > 0) {
      need--;
      cost -= 3;
    } else {
      cost += 4;
    }
  }
  return cost;
}

// Compiled search model per board (its memo is shared by every hint on that board).
const compiledCache = new WeakMap();
function compiled(board) {
  let C = compiledCache.get(board);
  if (!C) {
    C = compile(board);
    compiledCache.set(board, C);
  }
  return C;
}

// A Scoop can lift a kitten alone while its mother stays. The search model treats mother + kitten as one unit, so
// such a state is searched on a variant board where every lifted kitten is its own (gone) unit: the mother then
// leaves alone and the empty kitten cells block nothing. Cached per board and per set of lifted kittens.
const splitCache = new WeakMap();
function compiledFor(state) {
  const board = state.board;
  const lifted = board.cats.filter((c) => c.kittenOf != null && !state.alive[c.id] && state.alive[c.kittenOf]).map((c) => c.id);
  if (!lifted.length) return compiled(board);
  let m = splitCache.get(board);
  if (!m) splitCache.set(board, (m = new Map()));
  const key = lifted.join(',');
  let C = m.get(key);
  if (!C) {
    const cut = new Set(lifted);
    C = compile({ ...board, cats: board.cats.map((c) => { if (!cut.has(c.id)) return c; const k = { ...c }; delete k.kittenOf; return k; }) });
    m.set(key, C);
  }
  return C;
}

// Win search on the real rules from a live state. Returns { order: cat ids, nodes } or { order: null, nodes }.
export function solveFrom(state, budget = 4000) {
  const C = compiledFor(state);
  const sim = Sim.fromState(C, state);
  const r = searchWin(sim, budget);
  return { order: r === 1 ? sim.line.map((u) => C.units[u]) : null, nodes: sim.nodes || 0 };
}

// Solve a fresh board with the real rules.
export function solve(board, budget = 20000) {
  const r = solveFrom(createState(board), budget);
  return { solvable: !!r.order, order: r.order, nodes: r.nodes };
}

// Hint: best next tap. A move that keeps a winning line (search), else the cheapest free cat
// that does not overflow the bench.
export function hint(state, budget = 3000) {
  if (state.failed || isWon(state)) return null;
  const free = freeCats(state);
  if (!free.length) return null;
  const sol = solveFrom(state, budget);
  if (sol.order && sol.order.length) return sol.order[0];
  free.sort((a, b) => moveCost(state, a) - moveCost(state, b));
  for (const id of free) {
    const r = tap(state, id);
    if (r.ok) {
      const bad = state.failed;
      undo(state, true);
      if (!bad) return id;
    }
  }
  return free[0];
}

export function analyze(board) {
  const s = arrowSolve(board);
  return {
    cats: board.cats.length,
    units: board.cats.filter((c) => c.kittenOf == null).length,
    fill: fillRatio(board),
    depth: dependencyDepth(board),
    solvable: s.solvable,
    ...kittenStats(board),
  };
}
