// Fast search model: the same rules as rules.js on a compact state, for the generator's decision metrics and hints.
// Every obstacle state is a pure function of WHICH cats have left (a dog counts nearby exits, a frozen cat counts its
// neighbours, a yarn ball goes once any cat passed beside it), and carrier progress follows from how many cats left
// minus how many sit on the bench. So a search state is just (cats gone, bench colour counts), and memo results are
// shared across every query on one board.
import { createState, exitRay, catsNear, edgeNeighbours, DOG_WAKE, DOG_NEAR, THAW_NEED } from './rules.js';
import { compileMech, mechCanExit, spinFromState } from './content-mech.js';
import { compileFold, foldBlocked } from './shape.js'; // shape lane: folded flaps

const rootOf = (board, id) => {
  let c = board.cats[id];
  while (c.kittenOf != null) c = board.cats[c.kittenOf];
  return c.id;
};

function liftOrder(st, id, out) {
  out.push(id);
  for (const k of st.kittens[id]) liftOrder(st, k, out);
}

export function compile(board) {
  const { w, h, cats } = board;
  const objs = board.objs || [];
  const st = createState(board);
  const unitOf = new Int16Array(cats.length).fill(-1);
  const units = [];
  for (const c of cats) if (c.kittenOf == null) { unitOf[c.id] = units.length; units.push(c.id); }
  for (const c of cats) if (c.kittenOf != null) unitOf[c.id] = unitOf[rootOf(board, c.id)];
  const N = units.length;
  const ucats = units.map((p) => { const out = []; liftOrder(st, p, out); return out; });
  const len = ucats.map((ids) => ids.reduce((t, id) => t + cats[id].cells.length, 0));
  const rayU = [];
  const rayO = [];
  units.forEach((p) => {
    const su = new Set();
    const so = new Set();
    for (const [x, y] of exitRay(cats[p], w, h)) {
      const o = st.grid[y * w + x];
      if (o >= 0) su.add(unitOf[o]);
      else if (o <= -2) so.add(-2 - o);
    }
    rayU.push(Int16Array.from(su));
    rayO.push(Int16Array.from(so));
  });
  // obstacles: obj k is gone once cnt[k] >= need[k]; frozen unit f thaws once thaw[f] >= THAW_NEED
  const need = new Int16Array(objs.length);
  const hitsO = cats.map(() => []);
  objs.forEach((o, k) => {
    if (o.kind === 'dog') {
      const near = catsNear(board, o.cells, DOG_NEAR);
      need[k] = near.length ? Math.min(DOG_WAKE, near.length) : 9999;
      for (const id of near) hitsO[id].push(k);
    } else {
      need[k] = 1;
      const [yx, yy] = o.cells[0];
      for (const c of cats) {
        const lane = c.cells.concat(exitRay(c, w, h));
        if (lane.some(([x, y]) => Math.abs(x - yx) + Math.abs(y - yy) === 1)) hitsO[c.id].push(k);
      }
    }
  });
  const frozenOf = new Int16Array(N).fill(-1);
  const hitsF = cats.map(() => []);
  let nf = 0;
  units.forEach((p, u) => {
    if (cats[p].mech !== 'frozen') return;
    frozenOf[u] = nf;
    for (const id of edgeNeighbours(board, cats[p])) hitsF[id].push(nf);
    nf++;
  });
  const carriers = board.carriers || [];
  return {
    board, N, units, unitOf, ucats, len, rayU, rayO, need, nObj: objs.length, frozenOf, nFrozen: nf,
    color: Int8Array.from(cats.map((c) => c.color)),
    hitsO: hitsO.map((a) => Int16Array.from(a)),
    hitsF: hitsF.map((a) => Int16Array.from(a)),
    cc: Int8Array.from(carriers.map((c) => c.color)),
    cap: Int8Array.from(carriers.map((c) => c.cap || 3)),
    memo: new Map(),
    ...compileMech(board, st, unitOf, units), // spring cats + swivel beds (content-mech.js)
    ...compileFold(board, unitOf, units), // folded flaps: nFold, foldU, rayF, foldNeed (shape.js)
  };
}

const KEYBUF = new Uint16Array(256);

// A mutable search state over a compiled board, with an undo stack.
export class Sim {
  constructor(C, B) {
    this.C = C;
    this.B = B;
    this.alive = new Uint8Array(C.N).fill(1);
    this.left = C.N;
    this.cnt = new Int16Array(C.nObj);
    this.thaw = new Int16Array(C.nFrozen);
    this.spin = new Int16Array(C.nSpin); // neighbours gone per swivel bed
    this.bench = new Int8Array(8);
    this.used = 0;
    this.ci = 0;
    this.fill = 0;
    this.dead = false;
    this.trail = [];
    this.gone = 0; // cats off the board (a flap opens at its count)
    this.boards = []; // bench cats boarded per carrier arrival during the last apply (chain metrics)
  }

  // From a live rules.js state (mid-game, after scoops or extra seats too).
  static fromState(C, st) {
    const s = new Sim(C, st.benchSize);
    C.units.forEach((p, u) => { if (!st.alive[p]) { s.alive[u] = 0; s.left--; } });
    for (let k = 0; k < C.nObj; k++) s.cnt[k] = !st.objAlive[k] ? C.need[k] : st.objs[k].kind === 'dog' ? st.dogCount[k] : 0;
    C.units.forEach((p, u) => { const f = C.frozenOf[u]; if (f >= 0) s.thaw[f] = st.frozen[p] ? st.thaw[p] : THAW_NEED; });
    for (const id of st.bench) if (id >= 0) { s.bench[C.color[id]]++; s.used++; }
    s.ci = st.carriers.length ? st.carriers[0].uid : C.cc.length;
    s.fill = st.carriers.length ? st.carriers[0].fill : 0;
    s.dead = !!st.failed;
    s.gone = st.gone || 0;
    if (C.nSpin) spinFromState(s, st);
    return s;
  }

  frozen(u) {
    const f = this.C.frozenOf[u];
    return f >= 0 && this.thaw[f] < THAW_NEED;
  }

  objAlive(k) {
    return this.cnt[k] < this.C.need[k];
  }

  canExit(u) {
    const C = this.C;
    if (!this.alive[u] || this.frozen(u)) return false;
    if (C.nFold && foldBlocked(this, u)) return false;
    if (C.mk[u]) return mechCanExit(this, u);
    const ru = C.rayU[u];
    for (let i = 0; i < ru.length; i++) if (this.alive[ru[i]]) return false;
    const ro = C.rayO[u];
    for (let i = 0; i < ro.length; i++) if (this.cnt[ro[i]] < C.need[ro[i]]) return false;
    return true;
  }

  free() {
    const out = [];
    for (let u = 0; u < this.C.N; u++) if (this.canExit(u)) out.push(u);
    return out;
  }

  // Unit u leaves (no blocking check). Returns false when a cat found no seat; undo() reverts either way.
  apply(u) {
    const C = this.C;
    const b = this.bench;
    this.trail.push(u, this.ci, this.fill, this.used, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]);
    this.alive[u] = 0;
    this.left--;
    const ids = C.ucats[u];
    this.gone += ids.length;
    for (const id of ids) {
      const ho = C.hitsO[id];
      for (let i = 0; i < ho.length; i++) this.cnt[ho[i]]++;
      const hf = C.hitsF[id];
      for (let i = 0; i < hf.length; i++) this.thaw[hf[i]]++;
      const hs = C.hitsS[id];
      for (let i = 0; i < hs.length; i++) this.spin[hs[i]]++;
    }
    this.boards.length = 0;
    const nc = C.cc.length;
    for (const id of ids) {
      const col = C.color[id];
      if (this.ci < nc && C.cc[this.ci] === col && this.fill < C.cap[this.ci]) this.fill++;
      else if (this.used < this.B) {
        b[col]++;
        this.used++;
      } else return false;
      while (this.ci < nc && this.fill >= C.cap[this.ci]) {
        this.ci++;
        this.fill = 0;
        if (this.ci < nc) {
          const c2 = C.cc[this.ci];
          const take = Math.min(b[c2], C.cap[this.ci]);
          b[c2] -= take;
          this.used -= take;
          this.fill = take;
          this.boards.push(take);
        }
      }
    }
    return true;
  }

  undo() {
    const C = this.C;
    const t = this.trail;
    const o = t.length - 12;
    const u = t[o];
    this.ci = t[o + 1];
    this.fill = t[o + 2];
    this.used = t[o + 3];
    for (let i = 0; i < 8; i++) this.bench[i] = t[o + 4 + i];
    t.length = o;
    this.alive[u] = 1;
    this.left++;
    this.gone -= C.ucats[u].length;
    for (const id of C.ucats[u]) {
      const ho = C.hitsO[id];
      for (let i = 0; i < ho.length; i++) this.cnt[ho[i]]--;
      const hf = C.hitsF[id];
      for (let i = 0; i < hf.length; i++) this.thaw[hf[i]]--;
      const hs = C.hitsS[id];
      for (let i = 0; i < hs.length; i++) this.spin[hs[i]]--;
    }
  }

  key() {
    const codes = KEYBUF;
    let n = 0;
    let v = 0;
    let c = 0;
    const N = this.C.N;
    for (let u = 0; u < N; u++) {
      v = (v << 1) | this.alive[u];
      if (++c === 15) { // 15 alive flags per char: v + 64 stays inside one UTF-16 unit
        codes[n++] = v + 64;
        v = 0;
        c = 0;
      }
    }
    codes[n++] = v + 64;
    const b = this.bench;
    codes[n++] = 64 + b[0] + 16 * b[1] + 256 * b[2]; // seat counts are < 16
    codes[n++] = 64 + b[3] + 16 * b[4] + 256 * b[5];
    codes[n++] = 64 + b[6] + 16 * b[7] + 256 * this.B;
    return String.fromCharCode.apply(null, codes.subarray(0, n));
  }

  // Move order: cats that board the front carrier first, then the ones whose carrier comes soonest.
  cost(u) {
    const C = this.C;
    const nc = C.cc.length;
    let cost = 0;
    let room = this.ci < nc ? C.cap[this.ci] - this.fill : 0;
    for (const id of C.ucats[u]) {
      const col = C.color[id];
      if (this.ci < nc && C.cc[this.ci] === col && room > 0) {
        room--;
        cost -= 10;
        continue;
      }
      let d = 1;
      while (this.ci + d < nc && C.cc[this.ci + d] !== col) d++;
      cost += 4 + d;
    }
    return cost;
  }
}

// Win search from the current Sim state: 1 win, 0 proven loss, -1 budget ran out. Results are memoised on C.memo.
// On a win, sim.line is the unit order found (only with wantLine: the decision metrics need the verdict alone).
export function searchWin(sim, budget = 2000, wantLine = true) {
  const memo = sim.C.memo;
  let nodes = 0;
  const rev = [];
  const dfs = () => {
    if (sim.left === 0) return 1;
    const key = sim.key();
    const m = memo.get(key);
    if (m !== undefined) {
      if (m === 1 && wantLine) cachedTail(sim, rev);
      return m;
    }
    if (++nodes > budget) return -1;
    let moves = sim.free();
    if (moves.length > 1) { // cheapest first; ties keep unit order (cost and unit packed in one number: no closures)
      const ks = new Float64Array(moves.length);
      for (let i = 0; i < moves.length; i++) ks[i] = (sim.cost(moves[i]) + 4096) * 1024 + moves[i];
      ks.sort();
      for (let i = 0; i < moves.length; i++) moves[i] = ks[i] % 1024;
    }
    let unknown = false;
    for (const u of moves) {
      const r = sim.apply(u) ? dfs() : 0;
      sim.undo();
      if (r === 1) {
        memo.set(key, 1);
        rev.push(u);
        return 1;
      }
      if (r === -1) unknown = true;
      if (nodes > budget) return -1;
    }
    if (unknown) return -1;
    memo.set(key, 0);
    return 0;
  };
  const r = sim.dead ? 0 : dfs();
  sim.nodes = nodes;
  sim.line = r === 1 ? rev.reverse() : null;
  return r;
}

// The biggest bench chain (bench cats boarded on one tap) reachable anywhere on the board with sim.B seats, over every
// line of taps that still clears the board. Returns { best, complete }: complete = false when the node budget ran out (best
// is then only a lower bound). A friend challenge uses it to ask "match" instead of "beat" when the goal is the best.
export function maxChain(sim, budget = 30000) {
  const memo = new Map();
  let nodes = 0;
  let complete = true;
  const dfs = () => {
    if (sim.left === 0) return 0;
    const key = sim.key();
    const m = memo.get(key);
    if (m !== undefined) return m;
    if (++nodes > budget) { complete = false; return -1; }
    let best = -1; // -1: no winning way on from here
    for (const u of sim.free()) {
      if (sim.apply(u)) {
        let here = 0;
        for (let i = 0; i < sim.boards.length; i++) here += sim.boards[i];
        const rest = dfs();
        if (rest >= 0) best = Math.max(best, here, rest);
      }
      sim.undo();
    }
    memo.set(key, best);
    return best;
  };
  const best = sim.dead ? 0 : Math.max(0, dfs());
  return { best, complete };
}

// A memoised win was reached: follow memoised winning children so the caller still gets a full line (pushed reversed).
function cachedTail(sim, rev) {
  const memo = sim.C.memo;
  const tail = [];
  for (let guard = 0; sim.left > 0 && guard < 200; guard++) {
    let next = -1;
    for (const u of sim.free()) {
      const ok = sim.apply(u);
      if (ok && (sim.left === 0 || memo.get(sim.key()) === 1)) {
        next = u;
        break;
      }
      sim.undo();
    }
    if (next < 0) break;
    tail.push(next);
  }
  for (let i = 0; i < tail.length; i++) sim.undo();
  for (let i = tail.length - 1; i >= 0; i--) rev.push(tail[i]);
}

// Does an obstacle change the solution? Walk the line on the real board and on the same board with every mechanic
// taken away (`bare`): the mechanic matters when, at some step, a cat that is free on both boards wins on one and
// loses on the other (the wake / knock / thaw timing decides what is safe to tap). Mere blocking does not count.
export function mechChanges(board, bare, order, budget = 120) {
  const A = compile(board);
  const Bc = compile(bare);
  const seats = (board.meta && board.meta.benchSize) || 5;
  const sa = new Sim(A, seats);
  const sb = new Sim(Bc, seats);
  for (const id of order) {
    const lu = A.unitOf[id];
    // critical path: the front (or the next) carrier's colour is only held behind the obstacle (no free cat of it), so
    // the player has to wake / knock / thaw on purpose to fill it
    const free = sa.free();
    for (let ahead = 0; ahead < 2 && sa.ci + ahead < A.cc.length; ahead++) {
      const want = A.cc[sa.ci + ahead];
      if (!free.some((u) => A.color[A.ucats[u][0]] === want)) {
        for (let u = 0; u < A.N; u++) {
          if (!sa.alive[u] || A.color[A.ucats[u][0]] !== want || sa.canExit(u)) continue;
          let catIn = false;
          for (const v of A.rayU[u]) if (sa.alive[v]) catIn = true;
          if (!catIn) return true; // only ice, a dog or yarn is in the way
        }
      }
    }
    const fb = new Set(sb.free());
    for (const u of sa.free()) {
      if (u === lu || !fb.has(u)) continue;
      const ra = sa.apply(u) ? searchWin(sa, budget, false) : 0;
      sa.undo();
      const rb = sb.apply(u) ? searchWin(sb, budget, false) : 0;
      sb.undo();
      if (ra >= 0 && rb >= 0 && ra !== rb) return true;
    }
    if (!sa.canExit(lu) || !sa.apply(lu) || !sb.apply(lu)) return false;
  }
  return false;
}

// Decision metrics along the intended line (cat ids, one per tap) under the real rules:
//  free     cats tappable per step,
//  dead     legal taps that lose (no winning line left), as a ratio of all legal taps,
//  traps    steps where a TEMPTING tap loses: one that boards the front carrier or one of the next two, or the
//           biggest free cat,
//  late     steps with a lose-LATER tap: legal, the bench still has room, yet no winning line is left (lateRatio:
//           those taps over all legal taps). A tap that overflows the bench at once is plain arithmetic, not a plan,
//  chains   carrier arrivals that pull >= 2 cats off the bench (chain3: a whole carrier filled from the bench),
//  startSafe taps at the start that keep a win (>= 2 = no guesswork),
//  forced   steps where only one tap keeps a win.
// Returns null when the line is not a legal win on this board.
export function decisions(board, order, budget = 120) {
  const C = compile(board);
  const sim = new Sim(C, (board.meta && board.meta.benchSize) || 5);
  const nc = C.cc.length;
  let legal = 0;
  let dead = 0;
  let traps = 0;
  let chains = 0;
  let chain3 = 0;
  let peak = 0;
  let startSafe = 0;
  let unknown = 0;
  let freeSum = 0;
  let forced = 0;
  let nodes = 0;
  let late = 0;
  let deadLate = 0;
  for (let s = 0; s < order.length; s++) {
    const lu = C.unitOf[order[s]];
    const free = sim.free();
    if (!free.includes(lu)) return null;
    freeSum += free.length;
    let big = 0;
    for (const u of free) big = Math.max(big, C.len[u]);
    let trap = false;
    let lateHere = false;
    let safe = 1;
    for (const u of free) {
      if (u === lu) continue;
      legal++;
      const fits = sim.apply(u);
      const r = fits ? searchWin(sim, budget, false) : 0;
      nodes += sim.nodes || 0;
      sim.nodes = 0;
      sim.undo();
      if (r === 1) {
        safe++;
        continue;
      }
      if (r === -1) {
        unknown++;
        continue;
      }
      dead++;
      // lose-now (the bench overflows on this very tap: plain arithmetic) vs lose-later (the tap is legal and the bench
      // still has room, but no winning line is left: the real planning mistake)
      if (fits) {
        deadLate++;
        lateHere = true;
      }
      let tempt = C.len[u] === big;
      for (const id of C.ucats[u]) for (let d = 0; d < 3 && sim.ci + d < nc; d++) if (C.cc[sim.ci + d] === C.color[id]) tempt = true;
      if (tempt) trap = true;
    }
    legal++;
    if (s === 0) startSafe = safe;
    if (trap) traps++;
    if (lateHere) late++;
    if (safe === 1 && free.length > 1) forced++;
    if (!sim.apply(lu)) return null;
    for (const k of sim.boards) {
      if (k >= 2) chains++;
      if (k >= 3) chain3++;
    }
    if (sim.used > peak) peak = sim.used;
  }
  if (sim.left !== 0) return null;
  return {
    freeAvg: +(freeSum / order.length).toFixed(2),
    deadRatio: legal ? +(dead / legal).toFixed(3) : 0,
    lateRatio: legal ? +(deadLate / legal).toFixed(3) : 0,
    deadN: dead,
    lateN: deadLate,
    traps,
    late,
    chains,
    chain3,
    peak,
    startSafe,
    forced,
    unknown,
    nodes,
  };
}
