// Content lane mechanics (pure, no DOM): spring cats and swivel beds, plus the themed packs past L60.
//
// SPRING cat: hops over ONE thing in its way. It can leave when at most one blocker (one cat unit = a mother and her
//   kitten count once, or one dog / yarn ball) is on its exit ray; a second, different blocker stops it.
// SWIVEL bed: the cat's bed swivels a quarter turn each time an edge-neighbour cat leaves (a mother + kitten pair counts
//   two) and opens one more way out, clockwise from its starting facing and never back into its own neck: the cat may
//   leave by any of the first min(3, left + 1) sides of seq whose ray from its head is clear (its own cells never block).
//   (Turning AWAY from an open side was tried first: it lets a swivel and the cat in its new lane block each other for
//   good, a softlock with room on the bench. Opening sides keeps every mechanic monotone: a cat leaving only ever frees.)
// Both states are pure functions of WHICH cats have left, so the search model's memo (search.js) stays exact, undo needs
// no extra snapshot and greedy clearing stays complete.
import { DIRS, DIR_KEYS, dirKey } from './board.js';
import { makeRng, hashSeed } from './rng.js';
import { edgeNeighbours } from './rules.js';
import { PACKS, PACK_FROM, PACK_LEN } from '../../data/content.js';

export const NEW_MECHS = ['spring', 'swivel'];
export const SWIVEL_MAX = 3; // longest cat that sleeps on a swivel bed (a short cat reads clearly as "on the bed")

const rootOf = (board, id) => {
  let c = board.cats[id];
  while (c.kittenOf != null) c = board.cats[c.kittenOf];
  return c.twin != null && c.twin < c.id ? c.twin : c.id; // twins (mech3.js) are one unit: a spring hops them once
};

// the three sides of a swivel cat, clockwise from its starting facing, skipping the side its neck is on
export function swivelSeq(cat) {
  if (cat._seq) return cat._seq;
  const n = cat.cells.length;
  const h = cat.cells[n - 1];
  const nk = cat.cells[n - 2];
  const back = dirKey(nk[0] - h[0], nk[1] - h[1]);
  const i0 = DIR_KEYS.indexOf(cat.dir);
  const out = [];
  for (let k = 0; k < 4; k++) {
    const d = DIR_KEYS[(i0 + k) % 4];
    if (d !== back) out.push(d);
  }
  Object.defineProperty(cat, '_seq', { value: out, enumerable: false }); // cached, never serialised
  return out;
}

// how many of a swivel cat's neighbours have left (rules state)
export function spinOf(state, id) {
  const nb = state.nb ? state.nb[id] : null;
  if (!nb) return 0;
  let k = 0;
  for (const o of nb) if (!state.alive[o]) k++;
  return k;
}

// the sides a swivel cat may leave by right now (1 to 3), oldest first
export const swivelOpen = (state, id) => swivelSeq(state.board.cats[id]).slice(0, Math.min(3, spinOf(state, id) + 1));
// the side its bed turned to last (the one the bed points at)
export const swivelNewest = (state, id) => swivelSeq(state.board.cats[id])[Math.min(2, spinOf(state, id))];

// cells from just past the head to the board edge, facing `dir`
export function rayCells(cat, dir, w, h) {
  const head = cat.cells[cat.cells.length - 1];
  const [dx, dy] = DIRS[dir];
  const out = [];
  for (let x = head[0] + dx, y = head[1] + dy; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) out.push([x, y]);
  return out;
}

function rayBlocker(state, cat, dir, spring) {
  const { w, h, grid } = state;
  let first = null;
  for (const [x, y] of rayCells(cat, dir, w, h)) {
    const o = grid[y * w + x];
    if (o === -1 || o === cat.id) continue;
    const key = o >= 0 ? rootOf(state.board, o) : o;
    if (spring && (first === null || key === first)) {
      first = key;
      continue;
    }
    return { cell: [x, y], id: o >= 0 ? o : -1, obj: o >= 0 ? -1 : -2 - o };
  }
  return null;
}

// the way a cat leaves right now: a swivel cat takes its first open side with a clear lane (else its newest side, where
// a tap bonks); everyone else keeps cat.dir
export function exitDirNow(state, id) {
  const cat = state.board.cats[id];
  if (cat.mech !== 'swivel') return cat.dir;
  for (const d of swivelOpen(state, id)) if (!rayBlocker(state, cat, d, false)) return d;
  return swivelNewest(state, id);
}

// rules.js findBlocker for a spring or swivel cat: the blocker that stops it (a swivel: on its newest side), or null
export function mechBlocker(state, id) {
  const cat = state.board.cats[id];
  if (cat.mech === 'spring') return rayBlocker(state, cat, cat.dir, true);
  let b = null;
  for (const d of swivelOpen(state, id)) {
    b = rayBlocker(state, cat, d, false);
    if (!b) return null;
  }
  return b;
}

// the one thing a spring cat hops over right now (first occupied ray cell), or null
export function springHop(state, id) {
  const cat = state.board.cats[id];
  if (cat.mech !== 'spring') return null;
  const { w, h, grid } = state;
  for (const [x, y] of rayCells(cat, cat.dir, w, h)) {
    const o = grid[y * w + x];
    if (o !== -1 && o !== id) return [x, y];
  }
  return null;
}

// ---- search model (search.js) ----
// Per unit: mk 1 = spring, 2 = swivel; a swivel gets a spin counter and its three rays (units / objects on each).
export function compileMech(board, st, unitOf, units) {
  const { w, h, cats } = board;
  const N = units.length;
  const mk = new Int8Array(N);
  const spinOf = new Int16Array(N).fill(-1);
  const sRayU = [];
  const sRayO = [];
  const hitsS = cats.map(() => []);
  let nSpin = 0;
  units.forEach((p, u) => {
    const m = cats[p].mech;
    if (m === 'spring') mk[u] = 1;
    if (m !== 'swivel') return;
    mk[u] = 2;
    spinOf[u] = nSpin;
    for (const id of edgeNeighbours(board, cats[p])) hitsS[id].push(nSpin);
    sRayU[u] = [];
    sRayO[u] = [];
    for (const d of swivelSeq(cats[p])) {
      const su = new Set();
      const so = new Set();
      for (const [x, y] of rayCells(cats[p], d, w, h)) {
        const o = st.grid[y * w + x];
        if (o >= 0 && unitOf[o] !== u) su.add(unitOf[o]);
        else if (o <= -2) so.add(-2 - o);
      }
      sRayU[u].push(Int16Array.from(su));
      sRayO[u].push(Int16Array.from(so));
    }
    nSpin++;
  });
  return { mk, spinOf, sRayU, sRayO, hitsS: hitsS.map((a) => Int16Array.from(a)), nSpin };
}

// Sim.canExit for a spring / swivel unit (alive, not frozen)
export function mechCanExit(sim, u) {
  const C = sim.C;
  if (C.mk[u] === 1) {
    let n = 0;
    const ru = C.rayU[u];
    for (let i = 0; i < ru.length; i++) if (sim.alive[ru[i]] && ++n > 1) return false;
    const ro = C.rayO[u];
    for (let i = 0; i < ro.length; i++) if (sim.cnt[ro[i]] < C.need[ro[i]] && ++n > 1) return false;
    return true;
  }
  const k = Math.min(3, sim.spin[C.spinOf[u]] + 1);
  for (let d = 0; d < k; d++) {
    const ru = C.sRayU[u][d];
    let open = true;
    for (let i = 0; i < ru.length && open; i++) if (sim.alive[ru[i]]) open = false;
    const ro = C.sRayO[u][d];
    for (let i = 0; i < ro.length && open; i++) if (sim.cnt[ro[i]] < C.need[ro[i]]) open = false;
    if (open) return true;
  }
  return false;
}

// Sim.fromState: spin counters from a live rules state
export function spinFromState(sim, st) {
  const C = sim.C;
  C.units.forEach((p, u) => {
    if (C.spinOf[u] >= 0) sim.spin[C.spinOf[u]] = spinOf(st, p);
  });
}

// is unit u's piece in use right now (generator line checks): a spring with something to hop, a swivel whose starting
// side is still blocked (it can only be leaving by a side its bed opened)
export function mechUsed(sim, u) {
  const C = sim.C;
  let ru = C.rayU[u];
  let ro = C.rayO[u];
  if (C.mk[u] === 2) {
    ru = C.sRayU[u][0];
    ro = C.sRayO[u][0];
  } else if (C.mk[u] !== 1) return false;
  for (const v of ru) if (sim.alive[v]) return true;
  for (const k of ro) if (sim.cnt[k] < C.need[k]) return true;
  return false;
}

// ---- generator support ----
// drawOrder's pick on a board with springs / swivels: a spring that is hopping or a swivel leaving by an opened side is
// tapped first most of the time, so the line uses the piece (an unused piece is stripped afterwards)
export function pickMech(sim, C, pickable, rng) {
  const showy = pickable.filter((u) => C.mk[u] && mechUsed(sim, u));
  return showy.length && rng.chance(0.75) ? rng.pick(showy) : rng.pick(pickable);
}

// spring / swivel candidates on the bare layout (temp board, before colours): springs whose lane holds exactly one
// cat unit (the hop matters at once), swivels that are short, boxed in on their starting side and have 2+ neighbours
export function mechCandidates(temp, kind, plain, rng) {
  const { w, h, cats } = temp;
  const g = new Int16Array(w * h).fill(-1);
  for (const c of cats) for (const [x, y] of c.cells) g[y * w + x] = c.id;
  for (const o of temp.objs) for (const [x, y] of o.cells) g[y * w + x] = -2;
  const out = [];
  for (const c of cats) {
    if (!plain(c)) continue;
    const units = new Set();
    let obj = false;
    for (const [x, y] of rayCells(c, c.dir, w, h)) {
      const o = g[y * w + x];
      if (o >= 0) units.add(rootOf(temp, o));
      else if (o === -2) obj = true;
    }
    if (kind === 'spring') {
      if (units.size === 1 && !obj) out.push(c.id);
    } else if (c.cells.length <= SWIVEL_MAX && units.size >= 1 && edgeNeighbours(temp, c).length >= 2) out.push(c.id);
  }
  return rng.shuffle(out);
}

// ---- packs ----
// pack of level n (null before PACK_FROM): which theme, which lap of the four, slot i inside it
export function packOf(n) {
  n = Math.floor(+n);
  if (!(n >= PACK_FROM)) return null;
  const idx = Math.floor((n - PACK_FROM) / PACK_LEN);
  const pack = PACKS[idx % PACKS.length];
  const from = PACK_FROM + idx * PACK_LEN;
  return { pack, idx, lap: Math.floor(idx / PACKS.length), i: n - from, from, to: from + PACK_LEN - 1 };
}

// the first lap's hand-tuned ramp: a new piece alone for a few levels, then beside one older piece, then the usual mix.
// null = the generator's usual plan. Only consulted for non-teaching levels.
export function packPlan(n) {
  const p = packOf(n);
  if (!p || p.lap > 0) return null;
  const rng = makeRng(hashSeed('packplan', n));
  const old = () => rng.pick(['dog', 'mystery', 'frozen']);
  const { id } = p.pack;
  if (id === 'rainy') {
    if (p.i <= 4) return { spring: 1 + (p.i >= 3 ? 1 : 0) };
    const plan = { spring: rng.int(1, 2), [old()]: 1 };
    if (p.i >= 10 && rng.chance(0.5)) plan[rng.pick(['dog', 'yarn', 'mystery', 'frozen'])] = 1; // the back half mixes two older pieces in
    return plan;
  }
  if (id === 'bakery') {
    if (p.i <= 4) return { swivel: 1 };
    if (p.i <= 9) return { swivel: 1, spring: 1 };
    const plan = { swivel: rng.int(1, 2), spring: rng.int(0, 1) };
    if (rng.chance(0.6)) plan[old()] = 1;
    return plan;
  }
  if (id === 'garden') {
    const plan = { spring: rng.int(1, 2), swivel: 1 };
    if (rng.chance(0.5)) plan[old()] = 1;
    return plan;
  }
  return null;
}

// params() tweak for a level whose plan asks for springs / swivels: both free cats (more taps that still win), so the
// colouring parks more cats and lets them wait longer, which brings back the losing taps the band asks for
export function springTune(P, plan) {
  if (!plan.spring && !plan.swivel) return;
  P.pAbsorb -= 0.12;
  P.detourP += 0.06;
  P.minDetours += 1;
}

// the usual mix past the first lap: a spring or swivel at most on about half the boards that ask for one, and at most
// one or two of them, so the older pieces keep their share (its own rng: the older pieces' plan stays as it was)
export function thinPlan(plan, n) {
  if (!plan.spring && !plan.swivel) return plan;
  const rng = makeRng(hashSeed('thin', n));
  for (const k of NEW_MECHS) {
    if (!plan[k]) continue;
    if (rng.chance(0.5)) delete plan[k];
    else plan[k] = Math.min(plan[k], 2);
  }
  return plan;
}
