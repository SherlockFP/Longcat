// Core checks: node scripts/check-core.mjs
import { generate, levelKind, TEACH, params } from '../src/core/generate.js';
import { compile, Sim, decisions } from '../src/core/search.js';
import { validateBoard, makeBoard, makeCat } from '../src/core/board.js';
import {
  createState, tap, scoop, undo, addSeat, canUndo, exitRay, findBlocker, canExit, isWon, isFailed, stars, front, previews,
  isFrozen, isHidden, dogLeft,
} from '../src/core/rules.js';
import { analyze, hint, replay, solve, solveFrom, freeCats } from '../src/core/solver.js';
import { edgeNeighbours } from '../src/core/rules.js';
import { springHop, swivelSeq, swivelOpen, packOf, packPlan } from '../src/core/content-mech.js';

// Independent check that every mechanic piece MATTERS on the winning line, on the real rules state: a dog or yarn is,
// at some step while it is there, the only thing in an unfrozen cat's lane; a frozen cat's lane is clear while the
// ice still holds it; a mystery cat is free while hidden and the line reveals it before tapping it.
function mechMatter(b) {
  const st = createState(b);
  const objOk = b.objs.map(() => false);
  const catOk = new Map(b.cats.filter((c) => c.mech).map((c) => [c.id, false]));
  const freeHidden = new Set();
  for (const id of b.meta.order) {
    for (const c of b.cats) {
      if (!st.alive[c.id] || c.kittenOf != null || c.mech === 'spring' || c.mech === 'swivel') continue;
      const hits = new Set();
      let cat = false;
      for (const [x, y] of exitRay(c, b.w, b.h)) {
        const o = st.grid[y * b.w + x];
        if (o >= 0) cat = true;
        else if (o <= -2) hits.add(-2 - o);
      }
      if (cat) continue;
      if (isFrozen(st, c.id)) { if (!hits.size) catOk.set(c.id, true); continue; }
      if (hits.size === 1) objOk[[...hits][0]] = true;
      if (isHidden(st, c.id) && !hits.size) freeHidden.add(c.id);
    }
    const c = b.cats[id];
    if (c.mech === 'mystery') catOk.set(id, freeHidden.has(id) && !isHidden(st, id));
    // a spring that ships hops something on the line; a swivel leaves while its starting side is still blocked
    if (c.mech === 'spring') catOk.set(id, canExit(st, id) && !!springHop(st, id));
    if (c.mech === 'swivel') catOk.set(id, canExit(st, id) && exitRay(c, b.w, b.h).some(([x, y]) => st.grid[y * b.w + x] !== -1));
    if (!tap(st, id).ok) return { ok: false, why: 'line breaks' };
  }
  const bad = [...objOk.map((v, k) => (v ? null : b.objs[k].kind)), ...[...catOk].map(([id, v]) => (v ? null : b.cats[id].mech))].filter(Boolean);
  return { ok: !bad.length, why: bad.join(',') };
}

let failures = 0;
const fail = (msg) => {
  failures++;
  if (failures <= 40) console.error('FAIL ' + msg);
};
const ok = (cond, msg) => {
  if (!cond) fail(msg);
};
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// ---------------- level checks 1..600 ----------------
const MAXN = 600;
const stats = new Map();
let totalMs = 0;
let maxMs = 0;
let maxMsN = 0;
let searchMiss = 0;
let searchNodes = 0;
const kinds = { normal: 0, hard: 0, super: 0 };
const hardAt = [];
const superAt = [];
// mechanics per level range: levels that carry each mechanic, and total pieces
const RANGES = [[1, 7], [8, 11], [12, 39], [40, 54], [55, 69], [70, 600]];
const MECH_FROM = { dog: 8, yarn: 12, mystery: 40, frozen: 55, spring: 61, swivel: 81 };
const mechStat = RANGES.map(() => ({ dog: 0, yarn: 0, mystery: 0, frozen: 0, spring: 0, swivel: 0, pieces: 0, mixed: 0 }));
// decision ramp per level range (normal levels and hard/super separately)
const DRANGES = [[5, 14], [15, 39], [40, 99], [100, 249], [250, 600]];
const dStat = DRANGES.map(() => ({ normal: [], hard: [] }));
let bandMiss = 0;
let lateN = 0; // normal levels from L10 (breathers aside), and how many hold a delayed trap (a legal tap that loses later)
let lateOk = 0;
for (let n = 1; n <= MAXN; n++) {
  const t0 = performance.now();
  const b = generate(n);
  const ms = performance.now() - t0;
  totalMs += ms;
  if (ms > maxMs) {
    maxMs = ms;
    maxMsN = n;
  }
  ok(JSON.stringify(generate(n)) === JSON.stringify(b), `level ${n} not deterministic`);
  const errs = validateBoard(b);
  ok(errs.length === 0, `level ${n} invalid: ${errs.slice(0, 3).join('; ')}`);
  const a = analyze(b);
  ok(a.solvable, `level ${n} not arrow-solvable`);
  ok(a.depth >= 0, `level ${n} has dependency cycle`);
  // real-rules solvability: the recorded winning order replays to a win, bench never above benchSize-1
  const bs = b.meta.benchSize;
  const rp = replay(b, b.meta.order);
  ok(rp.won, `level ${n} winning order does not win under real rules`);
  if (n > 3) ok(rp.peak <= bs - 1, `level ${n} bench peak ${rp.peak} > ${bs - 1}`);
  ok(rp.state.benchUsed === 0 && rp.state.carriers.length === 0, `level ${n} leftovers after win`);
  // colors: every color count is a multiple of 3 (tutorial carriers excepted), carriers are 3 wide
  if (n > 3) {
    const per = new Map();
    for (const c of b.cats) per.set(c.color, (per.get(c.color) || 0) + 1);
    ok([...per.values()].every((v) => v % 3 === 0), `level ${n} color counts not multiples of 3`);
    ok(b.carriers.every((c) => c.cap === 3), `level ${n} carrier cap != 3`);
    ok(b.carriers.length * 3 === b.cats.length, `level ${n} carriers*3 != cats`);
    ok(b.meta.detours >= 1, `level ${n} no bench detour`);
    if (n >= 5) ok(b.meta.chains >= 1, `level ${n} has no 2-step carrier chain`);
    if (n === 4) ok(rp.peak === bs - 1 && b.meta.tutorial, 'L4 is the hand-made bench scare (peak 4 of 5)');
    ok(b.cats.every((c) => c.cells.length <= 8), `level ${n} cat longer than 8`);
  }
  // kind schedule + stars
  const kind = levelKind(n);
  eq(b.meta.kind, kind, `level ${n} kind`);
  kinds[kind]++;
  if (kind === 'hard') hardAt.push(n);
  if (kind === 'super') superAt.push(n);
  if (kind !== 'normal') ok(n >= 15, `level ${n} hard before L15`);
  const rs = createState(b);
  for (const id of b.meta.order) tap(rs, id);
  eq(stars(rs), kind === 'super' ? 3 : kind === 'hard' ? 2 : 1, `level ${n} stars`);
  if (n >= 5) ok(a.fill >= 0.55, `level ${n} fill ${a.fill.toFixed(2)} < 0.55`);
  // decisions on the winning line, measured again here by the solver under the real rules
  if (n >= 5) {
    const d = decisions(b, b.meta.order);
    ok(!!d, `level ${n} decisions: line not legal`);
    if (d) {
      const P = params(n);
      ok(d.startSafe >= 2, `level ${n} only ${d.startSafe} safe tap(s) at the start`);
      ok(d.chains >= 1, `level ${n} no carrier arrival pulls 2+ cats off the bench`);
      if (P.after) ok(d.traps <= 2, `breather level ${n} has ${d.traps} traps`);
      else ok(d.traps >= 1, `level ${n} has no trap`);
      if (kind === 'hard') ok(d.traps >= 3 && d.chain3 >= 1, `hard level ${n}: traps ${d.traps}, 3-chains ${d.chain3}`);
      if (kind === 'super') ok(d.traps >= 4 && d.chain3 >= 1, `super level ${n}: traps ${d.traps}, 3-chains ${d.chain3}`);
      ok(d.traps === b.meta.traps && d.chains === b.meta.chains, `level ${n} meta traps/chains differ from the solver`);
      if (!b.meta.band) bandMiss++;
      // every dog, yarn ball, ice coat and mystery that ships changes what is safe to tap (else it was stripped)
      if (b.objs.length || b.cats.some((c) => c.mech)) ok(b.meta.mechLate, `level ${n} ships a mechanic that never changes the solution`);
      if (n >= 10 && !P.after && kind === 'normal') {
        lateN++;
        if (d.late >= 1) lateOk++;
      }
      const di = DRANGES.findIndex(([lo, hi]) => n >= lo && n <= hi);
      const long = b.cats.filter((c) => c.cells.length >= 4).length / b.cats.length;
      dStat[di][kind === 'normal' ? 'normal' : 'hard'].push({ ...d, fill: a.fill, long, colors: b.meta.colors, cats: b.cats.length });
    }
    // 4-6 colours, none above 40% of the cats
    const per = new Map();
    for (const c of b.cats) per.set(c.color, (per.get(c.color) || 0) + 1);
    ok(per.size >= 4 && per.size <= 6, `level ${n} has ${per.size} colours`);
    ok(Math.max(...per.values()) <= 0.4 * b.cats.length, `level ${n} one colour holds ${Math.max(...per.values())}/${b.cats.length} cats`);
    const mm = mechMatter(b);
    ok(mm.ok, `level ${n} mechanic does not matter on the line: ${mm.why}`);
  }
  if (n >= 5) ok(a.depth >= 2, `level ${n} depth ${a.depth} < 2`);
  if (n >= 6) {
    ok(a.pairs >= 1, `level ${n} has no kitten pair`);
    ok(a.matter >= 1, `level ${n} kitten does not matter`);
  }
  // mechanics: only after their chapter starts, teaching level has its mechanic, counts match the board
  {
    const m = b.meta.mechs || { dog: 0, yarn: 0, mystery: 0, frozen: 0, spring: 0, swivel: 0 };
    const real = {
      dog: b.objs.filter((o) => o.kind === 'dog').length,
      yarn: b.objs.filter((o) => o.kind === 'yarn').length,
      mystery: b.cats.filter((c) => c.mech === 'mystery').length,
      frozen: b.cats.filter((c) => c.mech === 'frozen').length,
      spring: b.cats.filter((c) => c.mech === 'spring').length,
      swivel: b.cats.filter((c) => c.mech === 'swivel').length,
    };
    eq(real, m, `level ${n} meta.mechs`);
    let kindsHere = 0;
    for (const k of Object.keys(MECH_FROM)) {
      if (real[k] > 0) {
        kindsHere++;
        ok(n >= MECH_FROM[k], `level ${n} has ${k} before L${MECH_FROM[k]}`);
      }
    }
    if (TEACH[n]) {
      ok(real[TEACH[n]] >= 1, `teaching level ${n} lacks its ${TEACH[n]}`);
      ok(kindsHere === 1, `teaching level ${n} mixes mechanics`);
      eq(b.meta.teach, TEACH[n], `level ${n} meta.teach`);
    }
    if (n < 8) ok(kindsHere === 0 && b.objs.length === 0, `level ${n} has mechanics too early`);
    const ri = RANGES.findIndex(([lo, hi]) => n >= lo && n <= hi);
    for (const k of Object.keys(real)) if (real[k] > 0) mechStat[ri][k]++;
    mechStat[ri].pieces += real.dog + real.yarn + real.mystery + real.frozen + real.spring + real.swivel;
    if (real.swivel) ok(!real.yarn && b.cats.every((c) => c.mech !== 'swivel' || c.cells.length <= 3), `level ${n} swivel with yarn or on a long cat`);
    if (kindsHere >= 2) mechStat[ri].mixed++;
    // every dog / yarn blocks at least one lane
    for (const o of b.objs) {
      const key = new Set(o.cells.map(([x, y]) => x + ',' + y));
      ok(b.cats.some((c) => exitRay(c, b.w, b.h).some(([x, y]) => key.has(x + ',' + y))), `level ${n} ${o.kind} blocks nothing`);
    }
  }
  if (kind === 'hard' && !TEACH[n]) ok(rp.peak >= bs - 2, `hard level ${n} bench peak ${rp.peak} too tame`);
  if (kind === 'super' && !TEACH[n]) ok(rp.peak === bs - 1, `super level ${n} bench peak ${rp.peak} too tame`);
  // independent search on the real rules (bounded); most levels must be found
  if (n <= 3 || n % 3 === 0) {
    const s = solve(b, 6000);
    searchNodes += s.nodes;
    if (!s.solvable) searchMiss++;
  }
  if ([1, 5, 10, 15, 30, 60, 100, 250, 500].includes(n)) {
    stats.set(n, { size: `${b.w}x${b.h}`, kind, cats: b.cats.length, carriers: b.carriers.length, colors: b.meta.colors ?? '-', bench: bs, peak: rp.peak, detours: b.meta.detours ?? 0, ms: ms.toFixed(1) });
  }
}
const avgMs = totalMs / MAXN;
ok(avgMs < 40, `avg gen time ${avgMs.toFixed(1)}ms >= 40ms`);
ok(maxMs < 60, `worst gen time ${maxMs.toFixed(1)}ms (level ${maxMsN}) >= 60ms`);
ok(bandMiss <= 0.2 * (MAXN - 4), `${bandMiss} levels miss their full difficulty band`);
ok(lateOk >= 0.88 * lateN, `only ${lateOk}/${lateN} normal levels from L10 hold a delayed trap`);
ok(searchMiss <= 3, `search missed ${searchMiss} levels within budget`);
// hard every 7-10 from L15, super about every 30
ok(hardAt[0] === 15, `first hard level ${hardAt[0]} != 15`);
const all = [...hardAt, ...superAt].sort((x, y) => x - y);
for (let i = 1; i < all.length; i++) ok(all[i] - all[i - 1] >= 7 && all[i] - all[i - 1] <= 10, `hard gap ${all[i - 1]}->${all[i]}`);
ok(superAt.length >= 15 && superAt.length <= 25, `super hard count ${superAt.length}`);
for (let i = 1; i < superAt.length; i++) ok(superAt[i] - superAt[i - 1] >= 26 && superAt[i] - superAt[i - 1] <= 45, `super gap ${superAt[i - 1]}->${superAt[i]}`);

// mechanic counts per range: each chapter's mechanic shows up, later ranges mix them
RANGES.forEach(([lo, hi], i) => {
  const m = mechStat[i];
  if (hi < 8) ok(m.pieces === 0, 'no mechanics before L8');
  if (lo === 8) ok(m.dog >= 1 && m.yarn === 0 && m.mystery === 0 && m.frozen === 0, `L8-11 should only have dogs: ${JSON.stringify(m)}`);
  if (lo === 12) ok(m.yarn >= 3 && m.dog >= 1 && m.mystery === 0 && m.frozen === 0, `L12-39: ${JSON.stringify(m)}`);
  if (lo === 40) ok(m.mystery >= 3 && m.yarn >= 1 && m.frozen === 0, `L40-54: ${JSON.stringify(m)}`);
  if (lo === 55) ok(m.frozen >= 3 && m.mystery >= 1 && m.dog >= 1, `L55-69: ${JSON.stringify(m)}`);
  if (lo === 70) ok(m.dog > 20 && m.yarn > 20 && m.mystery > 20 && m.frozen > 20 && m.mixed > 20, `L70+ should mix everything: ${JSON.stringify(m)}`);
});

// hint playthrough: following hint() from the start wins
for (const n of [1, 2, 3, 4, 7, 12, 15, 21, 25, 30, 40, 45, 55, 60, 90, 150]) {
  const b = generate(n);
  const st = createState(b);
  let guard = 0;
  while (!isWon(st) && !isFailed(st) && guard++ < 200) {
    const id = hint(st);
    if (id == null || !tap(st, id).ok) break;
  }
  ok(isWon(st), `hint playthrough failed on level ${n}`);
}

// ---------------- rules unit tests ----------------
const cat = (id, cells, breed = 'tabby', kittenOf) => makeCat(id, cells, breed, kittenOf);
const BR = ['tabby', 'tuxedo', 'calico', 'gray', 'siamese', 'cream', 'ginger', 'black']; // color index -> breed
// a row of free cats, one per column, color per cat
const row = (colors, carriers, meta = {}) =>
  makeBoard(colors.length, 4, colors.map((c, i) => cat(i, [[i, 2], [i, 1]], BR[c])), meta, carriers);
const car = (color, cap = 3) => ({ color, cap });

// exit ray + free cat
{
  const b = makeBoard(5, 6, [cat(0, [[2, 4], [2, 3], [2, 2], [2, 1]])], {}, [car(0, 1)]);
  eq(exitRay(b.cats[0], 5, 6), [[2, 0]], 'exitRay up');
  const st = createState(b);
  ok(canExit(st, 0), 'free cat can exit');
  const r = tap(st, 0);
  ok(r.ok && !r.bonk && r.won, 'free cat taps ok and wins');
  eq(r.freed, [0], 'freed single');
  eq(r.events.map((e) => e.type), ['load', 'depart'], 'level 1 events');
}
// head on the edge facing out: empty ray
{
  const b = makeBoard(5, 6, [cat(0, [[2, 1], [2, 0]])]);
  eq(exitRay(b.cats[0], 5, 6), [], 'edge ray empty');
  ok(canExit(createState(b), 0), 'edge cat exits');
}
// carriers: queue, fill, depart, next rolls in
{
  const b = row([0, 0, 0, 1, 1, 1], [car(0), car(1)]);
  const st = createState(b);
  eq([front(st).color, previews(st).length], [0, 1], 'front + preview');
  ok(tap(st, 0).events[0].type === 'load', 'matching cat loads');
  tap(st, 1);
  eq(front(st).fill, 2, 'carrier fill 2');
  const r = tap(st, 2);
  eq(r.events.map((e) => e.type), ['load', 'depart', 'arrive'], 'third cat fills and departs');
  eq([st.departed, front(st).color, front(st).fill, st.benchUsed], [1, 1, 0, 0], 'next carrier rolled in');
  tap(st, 3); tap(st, 4);
  const w = tap(st, 5);
  ok(w.won && isWon(st) && st.carriers.length === 0, 'win when board empty and carriers gone');
  eq(stars(st), 1, 'normal level pays 1 star');
}
// bench: mismatch waits, hops in when its carrier arrives
{
  const b = row([1, 0, 0, 0, 1, 1], [car(0), car(1)]);
  const st = createState(b);
  const r0 = tap(st, 0);
  eq(r0.events, [{ type: 'bench', id: 0, seat: 0, color: 1 }], 'mismatch sits on the bench');
  eq(st.benchUsed, 1, 'bench used 1');
  tap(st, 1); tap(st, 2);
  const r3 = tap(st, 3);
  eq(r3.events.map((e) => e.type), ['load', 'depart', 'arrive', 'board'], 'bench cat hops into the next carrier');
  eq([st.benchUsed, front(st).fill], [0, 1], 'bench emptied, carrier has 1');
  tap(st, 4);
  ok(tap(st, 5).won, 'win after bench boarding');
}
// chain: one tap fills a carrier, the bench fills the next two (clip moment)
{
  const b = row([1, 1, 1, 2, 2, 2, 0, 0, 0], [car(0), car(1), car(2)], { benchSize: 6 });
  const st = createState(b);
  for (let i = 0; i < 6; i++) tap(st, i);
  eq(st.benchUsed, 6, 'six cats waiting');
  tap(st, 6); tap(st, 7);
  const r = tap(st, 8);
  eq(r.events.filter((e) => e.type === 'depart').length, 3, 'three carriers depart in one tap');
  ok(r.won, 'chain wins');
  eq(r.events.filter((e) => e.type === 'board').length, 6, 'six bench cats boarded');
}
// lose on bench overflow, continue with +1 seat, undo reverts the loss
{
  const b = row([1, 2, 3, 1], [car(0), car(1, 1), car(2, 1), car(3, 1)], { benchSize: 2 });
  const st = createState(b);
  tap(st, 0); tap(st, 1);
  eq(st.benchUsed, 2, 'bench full');
  const r = tap(st, 2);
  ok(r.ok && r.failed && isFailed(st), 'no seat = lose');
  ok(tap(st, 3).over, 'no taps after fail');
  ok(undo(st).ok && !isFailed(st) && st.alive[2] === 1 && st.benchUsed === 2, 'undo reverts the losing tap');
  tap(st, 2);
  const c = addSeat(st);
  ok(c.ok && !isFailed(st) && st.benchSize === 3 && st.benchUsed === 3, 'continue gives a seat and seats the cat');
}
// bonk costs nothing
{
  const b = generate(2);
  const st = createState(b);
  const r = tap(st, 1);
  ok(r.bonk && !r.ok, 'blocked cat bonks');
  eq(r.blockerCell, [2, 1], 'bonk blocker cell');
  eq(r.blockerId, 0, 'bonk blocker id');
  eq([st.aliveCount, st.benchUsed, st.failed, st.bonks], [5, 0, false, 1], 'bonk is free');
  ok(tap(st, 99).gone, 'unknown cat');
}
// level 2: a forced zigzag. Two blues park, the second orange sends orange off, both parked blues hop in (a chain)
{
  const b = generate(2);
  const st = createState(b);
  eq(freeCats(st), [0], 'level 2: only the blue cat is free');
  eq(tap(st, 0).events.map((e) => e.type), ['bench'], 'level 2: blue cat waits on the bench');
  eq(tap(st, 1).events.map((e) => e.type), ['load'], 'level 2: first orange boards');
  eq(freeCats(st), [2], 'level 2: one tap at a time');
  eq(tap(st, 2).events.map((e) => e.type), ['bench'], 'level 2: second blue parks');
  eq(st.benchUsed, 2, 'level 2: two seats used');
  const r3 = tap(st, 3);
  eq(r3.events.map((e) => e.type), ['load', 'depart', 'arrive', 'board', 'board'], 'level 2: orange departs, both parked blues hop into the blue carrier');
  eq(st.benchUsed, 0, 'level 2: bench empty again');
  const r4 = tap(st, 4);
  eq(r4.events.map((e) => e.type), ['load', 'depart'], 'level 2: the last blue fills it');
  ok(r4.won, 'level 2 wins');
}
// level 3: mother + kitten, and a tempting wrong tap (the big pink pair) that fills the 3-seat bench later
{
  const b = generate(3);
  const st = createState(b);
  eq(b.cats[1].kittenOf, 0, 'kittenOf');
  eq(b.cats[1].color, b.cats[0].color, 'kitten same color');
  eq(st.benchSize, 4, 'level 3: four seats');
  eq(freeCats(st), [0, 5], 'level 3: orange mother and pink mother are free');
  const kb = tap(st, 1);
  ok(kb.bonk, 'kitten alone bonks');
  eq(kb.blockerCell, [2, 0], 'kitten blocked by mother tail');
  // the tempting tap: pink first squats on two seats and the bench runs to 4 of 4, but the level is still winnable
  // (the first irreversible trap waits for L4, after the lesson card has explained it)
  {
    const w = createState(b);
    tap(w, 5);
    eq(w.benchUsed, 2, 'level 3: pink pair takes two seats');
    let peak = 0;
    const dfs = (s) => {
      if (isWon(s)) return true;
      for (const id of freeCats(s)) {
        tap(s, id);
        peak = Math.max(peak, s.benchUsed);
        const won = !s.failed && dfs(s);
        undo(s, true);
        if (won) return true;
      }
      return false;
    };
    ok(dfs(w), 'level 3: pink first is survivable');
    eq(peak, 4, 'level 3: pink first runs the bench to 4 of 4');
  }
  eq(hint(createState(b)), 0, 'level 3: the hint points at the orange mother');
  // a Scoop that lifts the kitten alone: the search must not count it as still there (no phantom seat, no blocker)
  {
    const w = createState(b);
    ok(scoop(w, 1).ok && !w.alive[1] && w.alive[0], 'level 3: scoop lifts the kitten alone');
    const sol = solveFrom(w, 4000);
    ok(!!sol.order && !sol.order.includes(1), 'level 3: after a kitten scoop the search still finds a win without it');
    for (const id of sol.order || []) tap(w, id);
    ok(isWon(w), 'level 3: that line really wins');
  }
  const r = tap(st, 0);
  eq(r.freed, [0, 1], 'mother frees trailing kitten');
  eq(r.events.map((e) => e.type), ['load', 'load'], 'one tap, two cats aboard');
  ok(canExit(st, 2) && !canExit(st, 3), 'blue freed, the next blue still held');
  tap(st, 2);
  tap(st, 3);
  eq(st.benchUsed, 2, 'level 3: two blues parked');
  const r4 = tap(st, 4);
  eq(r4.events.map((e) => e.type), ['load', 'depart', 'arrive', 'board', 'board', 'depart', 'arrive'], 'level 3: orange fills, both blues hop in and blue departs too');
  ok(tap(st, 5).won, 'level 3 wins');
}
// undo: restores board, bench and carriers
{
  const b = row([1, 0, 0, 0], [car(0), car(1, 1)], { benchSize: 3 });
  const st = createState(b);
  ok(!canUndo(st) && !undo(st).ok, 'nothing to undo at start');
  tap(st, 0); tap(st, 1);
  const snap = JSON.stringify([st.alive, st.bench, st.carriers, st.benchUsed]);
  tap(st, 2);
  tap(st, 3);
  ok(undo(st).ok && undo(st).ok, 'two undos');
  eq(JSON.stringify([st.alive, st.bench, st.carriers, st.benchUsed]), snap, 'undo restores state');
  eq(st.undos, 2, 'undo counter');
}
// scoop: ignores blockers, goes to a matching carrier or the bench; refuses when nowhere to go
{
  const b = generate(2); // blue 0 blocks orange 1, orange 1 blocks blue 2; front carrier is orange
  const st = createState(b);
  ok(!canExit(st, 1), 'orange cat is blocked');
  const r = scoop(st, 2); // a blue cat, blocked, while the front carrier is orange
  ok(r.ok && st.alive[2] === 0 && st.benchUsed === 1, 'scoop to the bench when the carrier does not match');
  const r2 = scoop(st, 1);
  ok(r2.ok && st.alive[1] === 0 && st.benchUsed === 1 && front(st).fill === 1, 'scoop lifts a blocked cat into its matching carrier');
  ok(undo(st).ok && st.alive[1] === 1 && st.benchUsed === 1, 'undo reverts a scoop');
  const full = createState(row([1, 2, 3], [car(0), car(1, 1), car(2, 1), car(3, 1)], { benchSize: 2 }));
  tap(full, 0); tap(full, 1);
  ok(scoop(full, 2).full && !isFailed(full) && full.alive[2] === 1, 'scoop refused on a full bench, no loss');
}
// stars by level type
{
  const find = (k) => {
    for (let n = 15; n < 200; n++) if (levelKind(n) === k) return n;
    return 0;
  };
  for (const [k, s] of [['normal', 1], ['hard', 2], ['super', 3]]) {
    const n = k === 'normal' ? 5 : find(k);
    const b = generate(n);
    const st = createState(b);
    eq(stars(st), 0, 'stars before win');
    for (const id of b.meta.order) tap(st, id);
    eq(stars(st), s, `${k} level stars`);
  }
}
// hint is a legal tap
{
  const st = createState(generate(2));
  eq(hint(st), 0, 'hint level 2 = blue cat');
  const done = createState(generate(1));
  tap(done, 0);
  tap(done, 1);
  tap(done, 2);
  eq(hint(done), null, 'no hint when cleared');
}

// ---------------- mechanics unit tests ----------------
{
  // yarn: blocks a lane until a cat leaves past it
  const b = makeBoard(6, 5, [cat(0, [[1, 3], [1, 2]]), cat(1, [[0, 3], [0, 2]])], {}, [car(0, 2)]);
  b.objs = [{ kind: 'yarn', cells: [[1, 0]] }];
  eq(validateBoard(b), [], 'yarn board valid');
  const st = createState(b);
  const r0 = tap(st, 0);
  ok(r0.bonk && r0.blockerObj === 0 && r0.blockerId === -1, 'yarn blocks cat 0');
  eq(freeCats(st), [1], 'only the cat beside the yarn is free');
  const r1 = tap(st, 1);
  eq(r1.events.filter((e) => e.type === 'knock').map((e) => [e.obj, e.cell]), [[0, [1, 0]]], 'cat running past knocks the yarn');
  ok(canExit(st, 0) && st.objAlive[0] === 0, 'yarn gone, cat 0 free');
  ok(tap(st, 0).won, 'yarn level wins');
  ok(undo(st).ok && undo(st).ok && st.objAlive[0] === 1 && !canExit(st, 0), 'undo brings the yarn back');
  const st2 = createState(b);
  scoop(st2, 1);
  ok(st2.objAlive[0] === 0 && canExit(st2, 0), 'scoop knocks yarn beside the lane like a tap (no softlock)');
}
{
  // dog: wakes after 3 nearby exits, then the lane is free
  const b = makeBoard(6, 4, [
    cat(0, [[2, 3], [2, 2]]), // A blocked by the dog at (2,0)
    cat(1, [[0, 2], [0, 1]]),
    cat(2, [[4, 2], [4, 1]]),
    cat(3, [[5, 3], [5, 2]]),
  ], {}, [car(0, 4)]);
  b.objs = [{ kind: 'dog', cells: [[2, 0], [3, 0]] }];
  eq(validateBoard(b), [], 'dog board valid');
  const st = createState(b);
  eq(dogLeft(st, 0), 3, 'dog needs 3');
  ok(tap(st, 0).blockerObj === 0, 'dog blocks cat 0');
  eq(tap(st, 1).events.filter((e) => e.type === 'zzz').map((e) => e.left), [2], 'first exit: 2 left');
  tap(st, 2);
  eq(dogLeft(st, 0), 1, 'second exit: 1 left');
  const r = tap(st, 3);
  ok(r.events.some((e) => e.type === 'wake') && dogLeft(st, 0) === 0 && st.grid[2] === -1, 'third exit wakes the dog');
  ok(tap(st, 0).won, 'dog level wins');
  ok(undo(st).ok && undo(st).ok && undo(st).ok && undo(st).ok && st.objAlive[0] === 1 && dogLeft(st, 0) === 3 && st.grid[2] === -2, 'undo restores the dog');
}
{
  // frozen + mystery
  const f = cat(0, [[2, 3], [2, 2]]);
  f.mech = 'frozen';
  const m = cat(3, [[4, 3], [4, 2]]);
  m.mech = 'mystery';
  const b = makeBoard(6, 4, [f, cat(1, [[1, 3], [1, 2]]), cat(2, [[3, 3], [3, 2]]), m], {}, [car(0, 4)]);
  eq(validateBoard(b), [], 'mech board valid');
  const st = createState(b);
  ok(isFrozen(st, 0) && !canExit(st, 0), 'frozen cat cannot leave');
  const fb = tap(st, 0);
  ok(fb.bonk && fb.frozen && st.aliveCount === 4, 'tapping a frozen cat bonks for free');
  eq(freeCats(st), [1, 2, 3], 'frozen cat is not free');
  ok(isHidden(st, 3), 'mystery cat starts hidden');
  const r1 = tap(st, 1);
  ok(r1.events.some((e) => e.type === 'chip' && e.id === 0 && e.left === 1) && isFrozen(st, 0), 'first neighbour leaves: still frozen');
  ok(isHidden(st, 3), 'mystery stays hidden while its neighbour is home');
  const r2 = tap(st, 2);
  ok(r2.events.some((e) => e.type === 'thaw' && e.id === 0) && !isFrozen(st, 0), 'second neighbour leaves: thawed');
  ok(r2.events.some((e) => e.type === 'reveal' && e.id === 3) && !isHidden(st, 3), 'mystery revealed when a neighbour leaves');
  ok(undo(st).ok && isFrozen(st, 0) && isHidden(st, 3), 'undo re-freezes and re-hides');
  ok(scoop(createState(b), 0).ok, 'scoop lifts a frozen cat');
}

// the solver's fast model agrees with rules.js: random play on generated boards, same free cats, bench, carrier and loss
{
  let diff = 0;
  for (let n = 5; n <= 300; n += 7) {
    const b = generate(n);
    const C = compile(b);
    for (let k = 0; k < 3; k++) {
      let seed = n * 31 + k * 977;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const st = createState(b);
      const sim = new Sim(C, b.meta.benchSize);
      while (!st.failed && !isWon(st)) {
        const fr = freeCats(st);
        const sf = sim.free().map((u) => C.units[u]).sort((x, y) => x - y);
        if (JSON.stringify(fr) !== JSON.stringify(sf)) { diff++; break; }
        if (!fr.length) break;
        const id = fr[Math.floor(rnd() * fr.length)];
        tap(st, id);
        const okSim = sim.apply(C.unitOf[id]);
        const fc = st.carriers[0];
        if (okSim === st.failed || (!st.failed && (sim.used !== st.benchUsed || sim.ci !== (fc ? fc.uid : C.cc.length) || sim.fill !== (fc ? fc.fill : 0)))) { diff++; break; }
      }
      const s2 = Sim.fromState(C, st);
      if (!st.failed && (s2.used !== sim.used || s2.ci !== sim.ci || s2.fill !== sim.fill || s2.left !== sim.left)) diff++;
    }
  }
  ok(diff === 0, `fast solver model disagrees with rules.js in ${diff} random games`);
}

// scoop fuzz: one scoop of a random cat at a random moment never strands the board (kitten + yarn leave as on a tap)
{
  let stuck = 0;
  let runs = 0;
  for (let n = 5; n <= 200; n += 3) {
    const b = generate(n);
    for (let k = 0; k < 3; k++) {
      runs++;
      let seed = n * 7 + k * 131;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const st = createState(b);
      st.benchSize = st.bench.length = 99; // the bench is not under test here
      st.bench.fill(-1);
      const at = Math.floor(rnd() * b.cats.length * 0.6);
      let scooped = false;
      for (let g = 0; g < 400 && !isWon(st) && !st.failed; g++) {
        if (!scooped && g >= at) {
          const alive = b.cats.filter((c) => st.alive[c.id]).map((c) => c.id);
          if (alive.length) scoop(st, alive[Math.floor(rnd() * alive.length)]);
          scooped = true;
          continue;
        }
        const fr = freeCats(st);
        if (!fr.length) break;
        tap(st, fr[Math.floor(rnd() * fr.length)]);
      }
      if (!isWon(st) && !st.failed && st.aliveCount > 0 && !freeCats(st).length) {
        stuck++;
        if (stuck <= 3) fail(`scoop softlock on level ${n} (run ${k})`);
      }
    }
  }
  ok(stuck === 0, `scoop fuzz: ${stuck} softlocks in ${runs} runs`);
}
{
  // a scooped mother takes her kitten along
  const b = generate(3);
  const st = createState(b);
  const r = scoop(st, 0);
  ok(r.ok && st.alive[1] === 0 && r.freed.length === 2, 'scoop lifts the kitten with its mother');
}

// ---------------- content lane: spring cats, swivel beds, packs ----------------
{
  // spring: hops ONE blocker unit (a mother + kitten count once), a second one stops it
  const b = makeBoard(5, 6, [
    cat(0, [[2, 5], [2, 4]], 'tabby'), // spring, facing up
    cat(1, [[1, 2], [2, 2], [3, 2]], 'tuxedo'), // across its lane
    cat(2, [[0, 0], [1, 0], [2, 0]], 'calico'), // a second blocker higher up
  ], {}, [car(0, 1), car(1, 1), car(2, 1)]);
  b.cats[0].mech = 'spring';
  ok(validateBoard(b).length === 0, 'spring board valid: ' + validateBoard(b).join(';'));
  const st = createState(b);
  ok(!canExit(st, 0) && findBlocker(st, 0).id === 2, 'spring with two blockers is stuck on the second');
  st.grid[0 * 5 + 2] = -1; st.alive[2] = 0; // take the far blocker off by hand
  ok(canExit(st, 0), 'spring hops a single blocker');
  eq(springHop(st, 0), [2, 2], 'the hop is over the cat in its lane');
  const C = compile(b);
  const sim = new Sim(C, 5);
  ok(!sim.canExit(C.unitOf[0]), 'fast model: spring with two blockers stuck');
  sim.apply(C.unitOf[2]);
  ok(sim.canExit(C.unitOf[0]), 'fast model: spring hops one');
}
{
  // swivel: starts facing up into a blocker; each neighbour that leaves opens one more side (clockwise, never its neck)
  const b = makeBoard(5, 6, [
    cat(0, [[2, 4], [2, 3]], 'tabby'), // swivel, head (2,3) facing up; sides U, R, L
    cat(1, [[2, 0], [2, 1]], 'tuxedo'), // in its up lane (facing down: blocked by the swivel)
    cat(2, [[3, 4], [3, 3]], 'calico'), // right neighbour, facing up (free)
    cat(3, [[4, 3], [4, 2]], 'gray'), // in its right lane, facing up (free)
    cat(4, [[1, 3], [0, 3]], 'siamese'), // left neighbour + in its left lane, facing left (free)
  ], {}, [car(0, 1), car(1, 1), car(2, 1), car(3, 1), car(4, 1)]);
  b.cats[0].mech = 'swivel';
  ok(validateBoard(b).length === 0, 'swivel board valid: ' + validateBoard(b).join(';'));
  eq(swivelSeq(b.cats[0]), ['U', 'R', 'L'], 'swivel sides clockwise, neck skipped');
  const st = createState(b);
  ok(!canExit(st, 0), 'swivel starts blocked on its first side');
  const r = tap(st, 2);
  ok(r.ok && r.events.some((e) => e.type === 'spin' && e.id === 0 && e.dir === 'R'), 'a neighbour leaves: the bed opens its right side');
  eq(swivelOpen(st, 0), ['U', 'R'], 'two sides open');
  ok(!canExit(st, 0), 'right side still blocked by cat 3');
  tap(st, 3);
  ok(canExit(st, 0), 'right lane clear: the swivel can leave');
  ok(undo(st).ok && !canExit(st, 0) && undo(st).ok && swivelOpen(st, 0).length === 1, 'undo closes the opened sides again');
  // the fast model and rules agree along the same taps
  const C = compile(b);
  const sim = new Sim(C, 5);
  ok(!sim.canExit(C.unitOf[0]), 'fast model: swivel blocked at the start');
  sim.apply(C.unitOf[2]);
  ok(!sim.canExit(C.unitOf[0]), 'fast model: right side blocked');
  sim.apply(C.unitOf[3]);
  ok(sim.canExit(C.unitOf[0]), 'fast model: swivel free after the right lane clears');
  const st2 = createState(b);
  tap(st2, 2);
  ok(Sim.fromState(C, st2).spin[0] === 1, 'Sim.fromState reads the bed turns');
}
{
  // packs: 20 levels each from L61, the first lap teaches spring (L61) then swivel (L81); every new piece is used on its line
  eq([packOf(60), packOf(61).pack.id, packOf(80).i, packOf(81).pack.id, packOf(141).lap, packOf(141).pack.id], [null, 'rainy', 19, 'bakery', 1, 'rainy'], 'pack mapping');
  ok(TEACH[61] === 'spring' && TEACH[81] === 'swivel', 'teaching levels for the new pieces');
  let springLv = 0;
  let swivelLv = 0;
  let late = 0;
  let diff = 0;
  for (let n = 61; n <= 140; n++) {
    const b = generate(n);
    const sp = b.cats.filter((c) => c.mech === 'spring').length;
    const sw = b.cats.filter((c) => c.mech === 'swivel').length;
    if (n <= 80) springLv += sp ? 1 : 0;
    if (n >= 81 && n <= 100) swivelLv += sw ? 1 : 0;
    if (n >= 101 && sp + sw) late++;
    if (n <= 80) ok(!sw, `level ${n} has a swivel before its pack`);
    const plan = packPlan(n);
    if (plan && packOf(n).pack.teach && packOf(n).i <= 4) ok(Object.keys(plan).every((k) => k === packOf(n).pack.teach), `level ${n}: the first boards of a pack show only its new piece`);
    // random play: rules.js and the fast model agree on free cats (springs and swivels included)
    if (!(sp + sw)) continue;
    const C = compile(b);
    let seed = n * 17;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const st = createState(b);
    st.benchSize = st.bench.length = 99;
    st.bench.fill(-1);
    const sim = new Sim(C, 99);
    for (let g = 0; g < 200 && !isWon(st) && st.aliveCount; g++) {
      const fr = freeCats(st);
      const sf = sim.free().map((u) => C.units[u]).sort((x, y) => x - y);
      if (JSON.stringify(fr) !== JSON.stringify(sf)) { diff++; fail(`level ${n}: rules ${fr} vs fast model ${sf}`); break; }
      if (!fr.length) { diff++; fail(`level ${n}: random play stuck with ${st.aliveCount} cats home`); break; }
      const id = fr[Math.floor(rnd() * fr.length)];
      tap(st, id);
      sim.apply(C.unitOf[id]);
    }
  }
  ok(springLv >= 14, `Rainy Day: only ${springLv}/20 levels carry a spring cat`);
  ok(swivelLv >= 8, `Bakery Rush: only ${swivelLv}/20 levels carry a swivel bed`);
  ok(late >= 20, `L101-140: only ${late} levels mix the new pieces`);
  ok(diff === 0, `spring / swivel: ${diff} disagreements between rules and the fast model`);
  console.log(`content packs: spring on ${springLv}/20 Rainy Day boards, swivel on ${swivelLv}/20 Bakery Rush boards, ${late}/40 later boards mix them`);
}

// ---------------- report ----------------
console.log('\nlevel  size   kind    cats  carriers  colors  bench  peak  detours  gen_ms');
for (const [n, s] of stats) {
  console.log(`${String(n).padEnd(6)} ${s.size.padEnd(6)} ${s.kind.padEnd(7)} ${String(s.cats).padEnd(5)} ${String(s.carriers).padEnd(9)} ${String(s.colors).padEnd(7)} ${String(s.bench).padEnd(6)} ${String(s.peak).padEnd(5)} ${String(s.detours).padEnd(8)} ${s.ms}`);
}
console.log('\nmechanics per range (levels carrying each, total pieces)');
RANGES.forEach(([lo, hi], i) => {
  const m = mechStat[i];
  console.log(`  L${lo}-${hi}: dog ${m.dog}, yarn ${m.yarn}, mystery ${m.mystery}, frozen ${m.frozen}, spring ${m.spring}, swivel ${m.swivel}, mixed ${m.mixed}, pieces ${m.pieces}`);
});
console.log(`\nkinds ${JSON.stringify(kinds)}; hard at ${hardAt.slice(0, 8).join(',')}...; super at ${superAt.slice(0, 6).join(',')}...`);
console.log('\ndecisions per range (averages; dead = losing taps / legal taps, long = share of cats 4+ cells)');
const avg = (arr, k) => (arr.length ? arr.reduce((t, x) => t + x[k], 0) / arr.length : 0);
DRANGES.forEach(([lo, hi], i) => {
  for (const kk of ['normal', 'hard']) {
    const arr = dStat[i][kk];
    if (!arr.length) continue;
    console.log(`  L${lo}-${hi} ${kk.padEnd(6)} n=${String(arr.length).padEnd(4)} traps ${avg(arr, 'traps').toFixed(2)}  late ${avg(arr, 'late').toFixed(2)}  chains ${avg(arr, 'chains').toFixed(2)}  3-chains ${avg(arr, 'chain3').toFixed(2)}  dead ${avg(arr, 'deadRatio').toFixed(3)}  free ${avg(arr, 'freeAvg').toFixed(2)}  startSafe ${avg(arr, 'startSafe').toFixed(1)}  fill ${avg(arr, 'fill').toFixed(2)}  long ${avg(arr, 'long').toFixed(2)}  colours ${avg(arr, 'colors').toFixed(1)}  cats ${avg(arr, 'cats').toFixed(1)}`);
  }
});
console.log(`levels missing the full band (floor still held): ${bandMiss}; normal levels from L10 with a delayed trap: ${lateOk}/${lateN}`);
console.log(`search misses ${searchMiss} (avg ${(searchNodes / 200).toFixed(0)} nodes)`);
console.log(`gen avg ${avgMs.toFixed(2)}ms, worst ${maxMs.toFixed(1)}ms (level ${maxMsN}), total ${totalMs.toFixed(0)}ms for ${MAXN} levels`);
if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('all checks passed');
