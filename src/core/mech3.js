// R13 mechanics (pure, no DOM): padlocked cats, colour gates and twins. Schedule 3 teaches them on L101 / L121 / L141,
// then mixes them into every later pack.
//
// LOCK: a padlocked cat cannot leave while the board's gold-collar KEY cat is still home (one key opens every lock).
// GATE: a one-cell garden gate in a carrier colour. It is a wall until the first carrier of its colour drives off.
// TWIN: two cats side by side holding paws. A tap on either sends both, so BOTH ways out must be clear (each one's own
//   lane; the twin itself never blocks it). They share one colour and leave as one unit, like a mother and her kitten.
// Every state is a pure function of WHICH cats have left (a gate follows the carriers gone, and with any bench the
// carriers gone follow from the colours of the cats gone), so the search model's memo stays exact, undo needs no extra
// snapshot and a cat leaving still only ever frees: the board can never stall with no free cat and seats to spare.
import { DIRS } from './board.js';
import { makeRng, hashSeed } from './rng.js';

export const NEW3 = ['lock', 'gate', 'twin'];
export const FROM3 = { lock: 101, gate: 121, twin: 141 };

const rayOf = (cat, dir, w, h) => {
  const head = cat.cells[cat.cells.length - 1];
  const [dx, dy] = DIRS[dir];
  const out = [];
  for (let x = head[0] + dx, y = head[1] + dy; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) out.push([x, y]);
  return out;
};

// ---- rules state (rules.js createState) ----
export function state3(board) {
  const keyId = board.cats.findIndex((c) => c.mech === 'key');
  const objs = board.objs || [];
  if (!objs.some((o) => o.kind === 'gate')) return { keyId, gateAt: null };
  const cs = (board.carriers || []).map((c) => c.color);
  return { keyId, gateAt: objs.map((o) => (o.kind === 'gate' ? (cs.indexOf(o.color) + 1 || 1e4) - 1 : -1)) };
}

export const isLocked = (state, id) => state.keyId >= 0 && !!state.alive[state.keyId] && state.board.cats[id].mech === 'lock';

// rules.js findBlocker for a twin: the first thing on its own lane, else on its twin's (the pair never blocks itself;
// a closed flap is a wall, as for everyone)
export function twinBlocker(state, id) {
  const cats = state.board.cats;
  const { w, h, grid } = state;
  const fc = state.foldCell;
  const mate = cats[id].twin;
  for (const c of state.alive[mate] ? [cats[id], cats[mate]] : [cats[id]]) {
    for (const [x, y] of rayOf(c, c.dir, w, h)) {
      if (fc && fc[y * w + x] && !state.foldOpen[fc[y * w + x] - 1]) return { cell: [x, y], id: -1, obj: -1, fold: fc[y * w + x] - 1, who: c.id };
      const o = grid[y * w + x];
      if (o === -1 || o === id || o === mate) continue;
      return { cell: [x, y], id: o >= 0 ? o : -1, obj: o >= 0 ? -1 : -2 - o, who: c.id };
    }
  }
  return null;
}

// cats just left: the key frees every lock
export function unlockTick(state, freed, events) {
  if (!freed.includes(state.keyId)) return;
  const ids = state.board.cats.filter((c) => c.mech === 'lock' && state.alive[c.id]).map((c) => c.id);
  if (ids.length) events.push({ type: 'unlock', ids, key: state.keyId });
}

// a carrier just drove off: every gate of its colour opens (rules.js resolve)
export function gateTick(state, events) {
  state.gateAt.forEach((at, k) => {
    if (at < 0 || !state.objAlive[k] || state.departed <= at) return;
    state.objAlive[k] = 0;
    const [x, y] = state.objs[k].cells[0];
    state.grid[y * state.w + x] = -1;
    events.push({ type: 'gate', obj: k, cell: [x, y], color: state.objs[k].color });
  });
}

// ---- search model (search.js) ----
// lockKey[u] = the key's unit for a padlocked unit (else -1); gates = [{ k, at }] (open once sim.ci > at); twinRay[u] =
// each twin's own lane as [units, objs] (generator line checks: a twin matters while one lane is clear and the other not)
export function compile3(board, st, unitOf, units) {
  const { w, h, cats } = board;
  const N = units.length;
  const lockKey = new Int16Array(N).fill(-1);
  const key = cats.findIndex((c) => c.mech === 'key');
  let nLock = 0;
  const twinRay = [];
  units.forEach((p, u) => {
    if (cats[p].mech === 'lock' && key >= 0) { lockKey[u] = unitOf[key]; nLock++; }
    if (cats[p].mech !== 'twin') return;
    twinRay[u] = [p, cats[p].twin].map((id) => {
      const su = new Set();
      const so = new Set();
      for (const [x, y] of rayOf(cats[id], cats[id].dir, w, h)) {
        const o = st.grid[y * w + x];
        if (o >= 0 && unitOf[o] !== u) su.add(unitOf[o]);
        else if (o <= -2) so.add(-2 - o);
      }
      return [Int16Array.from(su), Int16Array.from(so)];
    });
  });
  const gates = [];
  const cs = (board.carriers || []).map((c) => c.color);
  (board.objs || []).forEach((o, k) => { if (o.kind === 'gate') gates.push({ k, at: (cs.indexOf(o.color) + 1 || 1e4) - 1 }); });
  return { lockKey, nLock, gates, twinRay };
}

// gate counters follow the carrier queue (Sim.apply / Sim.undo)
export function gateSync(sim) {
  for (const g of sim.C.gates) sim.cnt[g.k] = sim.ci > g.at ? 1 : 0;
}

const laneClear = (sim, [ru, ro]) => {
  for (const v of ru) if (sim.alive[v]) return false;
  for (const k of ro) if (sim.cnt[k] < sim.C.need[k]) return false;
  return true;
};

const catIn = (sim, [ru]) => ru.some((v) => sim.alive[v]);

// generator line check, once per step before the tap: root cat ids whose piece is in use right now (a padlocked cat
// with a clear lane while the key is home, twins with one lane clear and the other still taken)
export function mark3(sim, keep) {
  const C = sim.C;
  if (!C.nLock && !C.twinRay.length) return;
  for (let u = 0; u < C.N; u++) {
    if (!sim.alive[u]) continue;
    const p = C.units[u];
    if (C.lockKey[u] >= 0 && sim.alive[C.lockKey[u]] && !sim.frozen(u) && laneClear(sim, [C.rayU[u], C.rayO[u]])) {
      keep.add(p);
      keep.add(C.units[C.lockKey[u]]);
    }
    const tr = C.twinRay[u];
    // one lane wide open, the other held by a cat (an object there may be stripped later as not mattering)
    if (tr && ((laneClear(sim, tr[0]) && catIn(sim, tr[1])) || (laneClear(sim, tr[1]) && catIn(sim, tr[0])))) {
      keep.add(p);
      keep.add(C.board.cats[p].twin);
    }
  }
}

// ---- generator: plan and placement ----
// the remix past each lesson: a new piece on about half the boards of the next 19 levels, then on about a third, at
// most one of it (its own rng: the older pieces' plan stays as it was)
export function remix3(plan, n) {
  const rng = makeRng(hashSeed('remix3', n));
  for (const k of NEW3) if (rng.chance(n > FROM3[k] && n < FROM3[k] + 20 ? 0.55 : n > FROM3[k] ? 0.35 : 0)) plan[k] = 1;
  return plan;
}

// on the bare layout (temp board, before colours), after the other pieces: a lock on a cat whose lane is clear from the
// start (the padlock alone keeps it home) with the key on a cat that is still dug in; twins on two side-by-side cats
// that never face each other. Each piece stays only while the board can still be cleared.
export function place3(temp, plan, placed, plain, n, clearable) {
  const { w, h, cats } = temp;
  const rng = makeRng(hashSeed('place3', n, JSON.stringify(cats[0].cells)));
  const g = new Int16Array(w * h).fill(-1);
  for (const c of cats) for (const [x, y] of c.cells) g[y * w + x] = c.id;
  for (const o of temp.objs) for (const [x, y] of o.cells) g[y * w + x] = -2;
  const lane = (c) => rayOf(c, c.dir, w, h).map(([x, y]) => g[y * w + x]).filter((o) => o !== -1);
  if (plan.lock) {
    const locks = rng.shuffle(cats.filter((c) => plain(c) && !lane(c).length).map((c) => c.id));
    const keys = rng.shuffle(cats.filter((c) => plain(c) && lane(c).some((o) => o >= 0)).map((c) => c.id));
    let done = false;
    for (const k of keys.slice(0, 6)) {
      for (const l of locks.slice(0, 4)) {
        if (l === k || lane(cats[k]).includes(l)) continue;
        cats[k].mech = 'key';
        cats[l].mech = 'lock';
        if (clearable(temp)) { placed.lock = 1; done = true; break; }
        delete cats[k].mech;
        delete cats[l].mech;
      }
      if (done) break;
    }
  }
  if (plan.twin) {
    const ids = rng.shuffle(cats.filter(plain).map((c) => c.id));
    const adj = (a, b) => a.cells.some(([x, y]) => b.cells.some(([p, q]) => Math.abs(x - p) + Math.abs(y - q) === 1));
    let tries = 0;
    for (const a of ids) {
      if (placed.twin || tries >= 8) break;
      for (const b of ids) {
        if (b <= a || !plain(cats[a]) || !plain(cats[b]) || !adj(cats[a], cats[b])) continue;
        if (lane(cats[a]).includes(b) || lane(cats[b]).includes(a)) continue; // they never face each other
        if (!lane(cats[a]).length && !lane(cats[b]).length) continue; // one of them has to wait for the other
        tries++;
        cats[a].mech = cats[b].mech = 'twin';
        cats[a].twin = b;
        cats[b].twin = a;
        if (clearable(temp)) { placed.twin = 1; break; }
        delete cats[a].mech; delete cats[b].mech; delete cats[a].twin; delete cats[b].twin;
        if (tries >= 8) break;
      }
    }
  }
}

// after colours (the gate's colour is a carrier's): a gate on an empty floor cell on a lane, timed so the winning line
// never meets it closed (every unit whose lane crosses it is tapped after its carrier drove off) and so it is, at some
// step before it opens, the only thing in a lane. tools = { compile, Sim } (search.js: no import cycle)
export function placeGates(board, want, rng, tools) {
  const { w, h, cats } = board;
  if (cats.some((c) => c.mech === 'swivel')) return 0; // a swivel's lane turns: no gate on its board (like yarn)
  const order = board.meta.order;
  const C = tools.compile(board);
  const sim = new tools.Sim(C, 99);
  const occ = new Uint8Array(w * h);
  for (const c of cats) for (const [x, y] of c.cells) occ[y * w + x] = 1;
  for (const o of board.objs) for (const [x, y] of o.cells) occ[y * w + x] = 1;
  if (tools.mask) tools.mask.forEach((v, i) => { if (!v) occ[i] = 1; }); // no gate on a void cell (the shape goes on later)
  // step of each root cat on the line, and the step after which carrier j has gone
  const stepOf = new Map(order.map((id, s) => [id, s]));
  const goneAt = [];
  order.forEach((id, s) => {
    sim.apply(C.unitOf[id]);
    while (goneAt.length < sim.ci) goneAt.push(s);
  });
  const firstOf = new Map();
  board.carriers.forEach((c, j) => { if (!firstOf.has(c.color)) firstOf.set(c.color, j); });
  const cand = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (occ[y * w + x]) continue;
    const users = C.units.filter((p) => [p, cats[p].twin].some((id) => id != null && rayOf(cats[id], cats[id].dir, w, h).some(([a, b]) => a === x && b === y)));
    if (!users.length) continue;
    const first = Math.min(...users.map((p) => stepOf.get(p)));
    for (const [col, j] of firstOf) {
      const open = goneAt[j];
      if (open == null || open >= first || open < 1) continue; // open before its first user, and not on the first tap
      cand.push({ x, y, col, slack: first - open, users: users.length, r: rng.next() });
    }
  }
  cand.sort((a, b) => b.users - a.users || a.slack - b.slack || a.r - b.r); // a busy lane, opened just in time
  let n = 0;
  for (const c of cand) {
    if (n >= want) break;
    if (board.objs.some((o) => o.cells.some(([x, y]) => Math.abs(x - c.x) + Math.abs(y - c.y) <= 1))) continue;
    board.objs.push({ kind: 'gate', cells: [[c.x, c.y]], color: c.col });
    n++;
  }
  return n;
}
