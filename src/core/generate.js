// Level generator v2.
// 1. reverse removal builds an arrow-solvable board (units = cat, or parent + kitten),
// 2. a random legal tap order is drawn,
// 3. colors and the carrier queue are assigned TOGETHER along that order (lazy carriers, deliberate
//    bench detours), so the order wins under the real rules with bench <= benchSize - 1,
// 4. the result is replayed on the real rules, mechanics are placed ON the winning line (each one must hold a cat
//    that the line needs), and
// 5. the solver measures the DECISIONS on that line (dead-end taps, traps, bench chains). Several candidates are
//    built and the one that best fits the level's difficulty band is kept.
import { makeRng, hashSeed, levelSeed } from './rng.js';
import { DIRS, DIR_KEYS, BREEDS, makeBoard, makeCat, dirKey } from './board.js';
import { exitRay, edgeNeighbours, catsNear, DOG_NEAR } from './rules.js';
import { dependencyDepth, replay, kittenStats } from './solver.js';
import { compile, Sim, decisions, mechChanges, searchWin } from './search.js';
import { packPlan, pickMech, mechCandidates, mechUsed, springTune, thinPlan } from './content-mech.js';
import { remix3, place3, placeGates, mark3 } from './mech3.js'; // R13 (schedule 3): padlocks L101, colour gates L121, twins L141
import { shapeParams, shapeFinish, shapeKeeps, shapeOff, altRetry } from './shape.js'; // shape lane: shaped boards, folded flaps, wide / tall boxes past L50

const SIZES = [[5, 6], [6, 7], [6, 8], [7, 9], [7, 10], [8, 10], [8, 11]];
const SIZE_FROM = [1, 4, 5, 12, 20, 34, 50]; // 6x8 from L5 so four colours of chunky cats fit
const BOSS_SIZES = [...SIZES, [9, 11]];
const MAX_ATTEMPTS = 60;

// ---- difficulty schedule: a BOSS level every 20 (L20, 40, 60...: the hardest band, src/game/boss.js), hard levels
// every 7-10 from L15 in between; a hard slot within 3 levels of a boss is dropped (the boss stands alone, its breather
// after it stays plain) ----
const sched = new Map();
let nextSlot = 15;
export const BOSS_EVERY = 20;
export const isBossLevel = (n) => n >= BOSS_EVERY && n % BOSS_EVERY === 0;
// Schedule versions: SCHED (2) is the boss schedule above; 1 is the one before it (hard every 7-10 from L15, 'super'
// hard about every 30, mystery taught on L40). A dare link made before the boss lane names no schedule and keeps
// opening the board it was made on: generate(n, 1) (curated.js boardOf, kit/dare.js token 2 / 3).
// Schedule 3 (R13, token 7) keeps schedule 2's kinds and adds the R13 pieces past L100 and a board that changes shape
// far more often from L16 (shape.js); a token 5 / 6 link keeps opening its schedule-2 board: generate(n, 2).
export const SCHED = 3;
export function levelKind(n, sv = SCHED) {
  if (sv === 1) return levelKindV1(n);
  if (isBossLevel(n)) return 'boss';
  if (n < 15) return 'normal';
  while (nextSlot <= n) {
    const m = nextSlot % BOSS_EVERY;
    if (m > 3 && m < BOSS_EVERY - 3) sched.set(nextSlot, 'hard');
    nextSlot += 7 + (hashSeed('hardgap', nextSlot) % 4);
  }
  return sched.get(n) || 'normal';
}
const schedV1 = new Map();
let nextSlotV1 = 15;
let lastSuperV1 = 0;
function levelKindV1(n) {
  if (n < 15) return 'normal';
  while (nextSlotV1 <= n) {
    let kind = 'hard';
    if (nextSlotV1 >= 30 && nextSlotV1 - lastSuperV1 >= 26) {
      kind = 'super';
      lastSuperV1 = nextSlotV1;
    }
    schedV1.set(nextSlotV1, kind);
    nextSlotV1 += 7 + (hashSeed('hardgap', nextSlotV1) % 4);
  }
  return schedV1.get(n) || 'normal';
}

// ---- mechanics ramp: one new thing per chapter, taught on a gentle level, then mixed ----
const TEACH_V2 = { 8: 'dog', 12: 'yarn', 41: 'mystery', 55: 'frozen', 61: 'spring', 81: 'swivel' }; // 61 / 81: content packs (content-mech.js); mystery moved off L40 (a boss) onto its breather
const MECH_FROM = { dog: 8, yarn: 12, mystery: 41, frozen: 55, spring: 61, swivel: 81 };
export const TEACH = { ...TEACH_V2, 101: 'lock', 121: 'gate', 141: 'twin' }; // R13 pieces on the breathers after the L100 / L120 / L140 bosses (mech3.js)
const TEACH_V1 = { 8: 'dog', 12: 'yarn', 40: 'mystery', 55: 'frozen', 61: 'spring', 81: 'swivel' }; // schedule 1
const MECH_FROM_V1 = { dog: 8, yarn: 12, mystery: 40, frozen: 55, spring: 61, swivel: 81 };
const teachAt = (n, sv = SCHED) => (sv === 1 ? TEACH_V1 : sv === 2 ? TEACH_V2 : TEACH)[n];
const TEACH_COUNT = { dog: 1, yarn: 2, mystery: 2, frozen: 1, spring: 2, swivel: 1, lock: 1, gate: 1, twin: 1 };

// ---- mid-game flavours (normal L5-30): neighbouring boards lean on different decisions so the run never repeats.
// chain = a bench chain is the showpiece (two 2-chains on the line), tight = more deliberate parks held longer,
// kitten = a parade of mother + kitten pairs, yarn = a yarn alley (two balls on the line, from L13)
export function flavourOf(n, sv = SCHED) {
  if (n < 5 || n > 30 || teachAt(n, sv) || levelKind(n, sv) !== 'normal') return null;
  if (n > 15 && levelKind(n - 1, sv) !== 'normal') return null; // the breather after a hard level stays plain
  const F = n > 12 ? ['chain', 'tight', 'kitten', 'yarn'] : ['chain', 'tight', 'kitten'];
  return F[(n + (n > 12 ? 0 : 1)) % F.length]; // offsets picked so every flavoured board keeps its trap floor
}

// How many of each mechanic level n asks for (placement may fall short on non-teaching levels).
export function mechPlan(n, sv = SCHED) {
  const tk = teachAt(n, sv);
  if (tk) return { [tk]: TEACH_COUNT[tk] };
  const pack = packPlan(n); // the first lap of the themed packs ramps the new pieces in by hand
  if (pack) return sv >= 3 ? remix3(pack, n) : pack;
  const rng = makeRng(hashSeed('mechplan', n));
  const from = sv === 1 ? MECH_FROM_V1 : MECH_FROM;
  const names = Object.keys(from).filter((k) => n > from[k]);
  const plan = {};
  if (flavourOf(n, sv) === 'yarn') return { yarn: 2 };
  names.forEach((k, i) => {
    const fresh = i === names.length - 1 && n < 70;
    if (!rng.chance(fresh ? 0.8 : n >= 70 ? 0.55 : 0.45)) return; // asked for often: a piece that never matters on the line is dropped
    plan[k] = k === 'dog' ? 1 + (n >= 70 && rng.chance(0.35) ? 1 : 0) : k === 'frozen' ? 1 + (n >= 80 && rng.chance(0.4) ? 1 : 0) : rng.int(1, n < 40 ? 2 : 3);
  });
  return sv >= 3 ? remix3(thinPlan(plan, n), n) : thinPlan(plan, n); // springs / swivels past the packs: every other board at most (content-mech.js); schedule 3 mixes the R13 pieces in
}

export function params(n, sv = SCHED) {
  const kind = levelKind(n, sv);
  const tk = teachAt(n, sv) || null;
  const teach = !!tk;
  const hard = kind !== 'normal';
  const boss = kind === 'boss';
  const big = boss || kind === 'super'; // the hardest band: a boss (schedule 2) or a super hard level (schedule 1)
  const bonus = teach ? 0 : big ? 2 : hard ? 1 : 0;
  const after = !hard && (sv === 1 || !teach) && n > 15 && levelKind(n - 1, sv) !== 'normal'; // one breather per hard level, never two; a teaching level after a boss (L41, L61, L81) keeps its own gentle shape
  // about 40% of the normal levels from L10 are 'medium': more dead ends and two or more delayed traps
  const medium = !hard && !after && !teach && n >= 10 && hashSeed('medium', n) % 100 < 40;
  let tier = 0;
  for (let i = 0; i < SIZE_FROM.length; i++) if (n >= SIZE_FROM[i]) tier = i;
  if (tier >= 3 && kind === 'normal' && makeRng(hashSeed('size', n)).chance(0.3)) tier -= 1;
  if (kind === 'super') tier = Math.min(SIZES.length - 1, tier + 1);
  // a boss is a giant order: two size tiers up (L20 8x11, from L40 the boss-only 9x11; cells stay >= 30px at 375x667)
  const [w, h] = boss ? BOSS_SIZES[Math.min(BOSS_SIZES.length - 1, tier + 2)] : SIZES[tier];
  const fillTarget = Math.min(0.84, (n < 10 ? 0.68 : 0.72 + 0.12 * Math.min(1, (n - 10) / 90)) + 0.03 * bonus);
  const benchSize = kind === 'super' || (boss && n > BOSS_EVERY) ? 4 : 5; // a 5-seat bench from L4 (breathers too: 6 seats made them free wins); the first boss (L20) keeps 5
  // 4 colours up to L14, 5 from L15, 6 from L30 (hard levels one more), never above 6 so each reads at a glance
  const colors = Math.min(6, (n < 15 ? 4 : n < 30 ? 5 : 6) + bonus);
  // decision band (measured by the solver on the winning line): traps = steps where a tempting tap loses,
  // late = steps with a lose-LATER tap (legal, room on the bench, but no winning line left: a real planning mistake),
  // chains = carrier arrivals that pull >= 2 bench cats, chain3 = a whole carrier filled from the bench,
  // dead = the most losing taps / legal taps we allow, deadMin = the fewest (below it the order hardly matters)
  // a boss's giant board leaves more taps open (more free cats): it asks for more traps and a lower floor of losing taps
  const band = boss ? { traps: 5, late: 2, chains: 2, chain3: 1, dead: 0.45, deadMin: 0.1 }
    : big ? { traps: 4, late: 3, chains: 2, chain3: 1, dead: 0.45, deadMin: 0.15 }
    : hard ? { traps: 3, late: 2, chains: 1, chain3: 1, dead: 0.4, deadMin: 0.12 }
    : after ? { traps: 0, maxTraps: 2, late: 1, chains: 1, chain3: 0, dead: 0.15, deadMin: 0.03 }
    : medium ? { traps: 2, late: n < 40 ? 2 : 3, chains: 1, chain3: 0, dead: 0.36, deadMin: 0.15 }
    : { traps: n < 40 ? 1 : 2, late: n < 10 ? 0 : n < 40 ? 1 : 2, chains: 1, chain3: 0, dead: n < 40 ? 0.25 : 0.32, deadMin: n < 10 ? 0 : n < 40 ? 0.07 : 0.1 };
  const flav = flavourOf(n, sv);
  const P = {
    n,
    sv,
    kind,
    medium,
    flavour: flav,
    w,
    h,
    fillTarget,
    fillMin: n < 10 ? 0.55 : Math.min(0.68, 0.6 + 0.02 * bonus),
    minLen: 2,
    maxCats: boss ? (n > BOSS_EVERY ? 27 : 24) : 18, // a boss: about 1.5x the cats of the levels around it; else about 18 heads at most until the cats have more expression variants (round 6: 22 grinning heads read as noise)
    maxLen: n < 15 || boss ? 6 : 8, // a boss packs more, shorter cats; long and short cats mixed: about half are 4-8 cells
    longP: n < 15 ? 0.35 : boss ? 0.3 : 0.5,
    band,
    after,
    kittenMax: n < 30 ? 2 : 3,
    bendP: 0.12 + 0.43 * Math.min(1, n / 60),
    depthTarget: (n < 4 ? 1 : n < 25 ? 3 : n < 50 ? 4 : n < 100 ? 5 : n < 250 ? 6 : 7) + bonus,
    depthMin: n >= 5 ? 2 : 1,
    pairs: n < 20 ? 2 : n < 50 ? 2 : n < 120 ? 3 : 4,
    breeds: Math.min(BREEDS.length, 3 + Math.floor(n / 10)),
    benchSize,
    colors,
    teach,
    tk,
    detourP: teach ? 0.2 : big ? 0.38 : hard ? 0.3 : after ? 0.15 : medium ? 0.24 : 0.12 + 0.12 * Math.min(1, n / 80),
    minDetours: teach ? 1 : big ? 4 : hard ? 3 : n >= 4 ? 2 : 1,
    minChains: n >= 5 ? 1 : 0, // from L5 every level has a carrier that fills from the bench the moment it arrives
    // L4-9: the bench fills to 3 of 5 at least once, a first small scare
    minPeak: after ? 3 : benchSize - 1, // the line itself runs the bench to its last spare seat: a squatter there costs the level
    hold: after ? 2 : big ? 3 : hard ? 3 : 2,
    holdUntil: 0.6,
    pAbsorb: teach ? 0.6 : big ? 0.35 : hard ? 0.5 : medium ? 0.55 : 0.72 - 0.15 * Math.min(1, n / 100), // lower = parked cats wait longer: a wrong park costs later
  };
  if (n > 60 && n <= 140 && !teach) springTune(P, mechPlan(n, sv)); // spring / swivel boards free more cats: a tighter bench keeps them in band
  if (flav === 'chain') {
    P.band = { ...band, chains: 2 };
    P.pAbsorb -= 0.12;
  } else if (flav === 'tight') {
    P.minDetours += 1;
    P.hold = 3;
    P.detourP += 0.06;
  } else if (flav === 'kitten') {
    P.kittenMax = 3;
    P.pairs = 3;
  }
  return sv === 1 ? P : shapeParams(P); // shape lane: may change w x h, adds mask / area / folds (schedule 1, the old dare links' boards: never)
}

// ---- hand-made tutorials (5x6) ----
// 1: three cats, one carrier. 2: a forced zigzag, two blues park and hop in together when their carrier comes.
// 3: mother + kitten, and a tempting big pink pair that squats on 2 of 4 seats if tapped early (hint arrow on orange).
// 4: the first real bench choice (see below).
function tutorial(n) {
  const mk = (list) => list.map((c, i) => makeCat(i, c.cells, c.breed, c.kittenOf));
  const meta = { n, tutorial: true, kind: 'normal', benchSize: 5 };
  let cats;
  let carriers;
  if (n === 1) {
    cats = mk([
      { cells: [[1, 4], [1, 3], [1, 2]], breed: 'tabby' }, // orange
      { cells: [[3, 5], [3, 4], [3, 3], [3, 2]], breed: 'tabby' }, // orange
      { cells: [[2, 5], [2, 4], [2, 3]], breed: 'tabby' }, // orange
    ]);
    carriers = [{ color: 0, cap: 3 }]; // three quick taps fill it: the first door-snap and drive-off
    meta.order = [0, 1, 2];
  } else if (n === 2) {
    // A forced zigzag that teaches the bench by hand: blue, orange, blue, orange, blue. Each cat frees only the next.
    // The two blues park; the second orange sends the orange carrier off, the blue one rolls in and BOTH parked cats
    // hop in by themselves (the first chain), then the last blue fills it.
    cats = mk([
      { cells: [[1, 1], [2, 1], [3, 1]], breed: 'tuxedo' }, // 0 blue, the only free cat: parks
      { cells: [[2, 3], [2, 2]], breed: 'tabby' }, // 1 orange, held by 0
      { cells: [[4, 3], [3, 3]], breed: 'tuxedo' }, // 2 blue, held by 1: parks
      { cells: [[3, 5], [3, 4]], breed: 'tabby' }, // 3 orange, held by 2: fills the orange carrier, the chain fires
      { cells: [[0, 5], [1, 5], [2, 5]], breed: 'tuxedo' }, // 4 blue, held by 3: fills the blue carrier
    ]);
    carriers = [{ color: 0, cap: 2 }, { color: 1, cap: 3 }];
    meta.order = [0, 1, 2, 3, 4];
  } else if (n === 4) {
    // A packed 5x6 board (no empty rows) built around one real choice: no pink cat is free, so something must park.
    // Free at the start: green 7 (green is the NEXT carrier: it hops in soon) and blue 2 (blue comes LAST: it squats
    // on a seat all level). Exhaustive search: random play wins 72% overall, 85% after parking green first, 59% after
    // blue first; the best line peaks at 4 of 5 seats. The hint card states the rule, never the tap.
    cats = mk([
      { cells: [[3, 5], [2, 5]], breed: 'calico' }, // 0 pink
      { cells: [[2, 2], [2, 3]], breed: 'tabby' }, // 1 orange
      { cells: [[0, 2], [0, 1], [0, 0]], breed: 'tuxedo' }, // 2 blue, free (comes last)
      { cells: [[1, 5], [0, 5], [0, 4]], breed: 'tabby' }, // 3 orange
      { cells: [[1, 1], [2, 1]], breed: 'tuxedo' }, // 4 blue
      { cells: [[1, 3], [1, 4], [2, 4]], breed: 'gray' }, // 5 green
      { cells: [[3, 0], [4, 0], [4, 1]], breed: 'calico' }, // 6 pink
      { cells: [[4, 4], [4, 5]], breed: 'gray' }, // 7 green, free (comes next)
      { cells: [[2, 0], [1, 0]], breed: 'gray' }, // 8 green
      { cells: [[4, 2], [4, 3]], breed: 'tuxedo' }, // 9 blue
      { cells: [[3, 3], [3, 4]], breed: 'calico' }, // 10 pink
      { cells: [[3, 1], [3, 2]], breed: 'tabby' }, // 11 orange
    ]);
    carriers = [{ color: 2, cap: 3 }, { color: 3, cap: 3 }, { color: 0, cap: 3 }, { color: 1, cap: 3 }]; // pink, green, orange, blue
    meta.order = [2, 3, 0, 7, 9, 6, 10, 5, 1, 8, 11, 4]; // a winning line that peaks at 4 of 5 seats
    meta.detours = 4;
    meta.colors = 4;
    return makeBoard(5, 6, cats, meta, carriers);
  } else {
    // Mother + kitten AND a first real choice on a cramped 4-seat bench. Free at the start: the orange mother (her
    // kitten trails, 2 of 3 orange seats in one tap) and a big pink mother + kitten whose carrier comes LAST. Orange
    // first sets up the chain (two blues park, the last orange fills, both blues hop in). Pink first is survivable but
    // the pair squats on 2 seats for the whole level and the two blues fill the bench to 4 of 4: the lesson card says
    // so the moment the pair parks, before any trap is fatal (the first irreversible trap waits for L4).
    cats = mk([
      { cells: [[2, 0], [3, 0], [4, 0]], breed: 'tabby' }, // 0 orange mother, free
      { cells: [[0, 0], [1, 0]], breed: 'tabby', kittenOf: 0 }, // 1 her kitten
      { cells: [[1, 2], [1, 1]], breed: 'tuxedo' }, // 2 blue, held by the kitten: parks
      { cells: [[3, 1], [2, 1]], breed: 'tuxedo' }, // 3 blue, held by 2: parks
      { cells: [[3, 3], [3, 2]], breed: 'tabby' }, // 4 orange, held by 3: fills orange, both blues hop in, blue departs too
      { cells: [[4, 3], [4, 4], [4, 5]], breed: 'calico' }, // 5 pink mother, free from the start (the tempting wrong tap)
      { cells: [[4, 1], [4, 2]], breed: 'calico', kittenOf: 5 }, // 6 her kitten
    ]);
    carriers = [{ color: 0, cap: 3 }, { color: 1, cap: 2 }, { color: 2, cap: 2 }];
    meta.benchSize = 4;
    meta.order = [0, 2, 3, 4, 5];
  }
  return makeBoard(5, 6, cats, meta, carriers);
}

// ---- one generation attempt ----
function runAttempt(P, rng) {
  const W = P.w;
  const H = P.h;
  const N = W * H;
  const occ = new Int16Array(N).fill(-1);
  const stamp = new Int32Array(N);
  let cur = 0;
  const rayOwn = Array.from({ length: N }, () => []);
  const units = [];
  const down = [];
  const bm = [];
  const pm = [];
  let evalStamp = 0;
  let filled = 0;
  const cap = P.depthTarget + 1;
  const M = P.mask; // shape lane: 0 = void cell (open air: never occupied, rays pass over it)
  const area = P.area || N;

  const pickLen = () => (rng.chance(P.longP) ? rng.int(4, P.maxLen) : rng.int(P.minLen, 3));

  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && occ[y * W + x] < 0 && stamp[y * W + x] !== cur && (!M || M[y * W + x] === 1);

  // Grow a body backwards from the head; d = facing. Returns cells tail-first/head-last.
  function grow(hx, hy, d, len) {
    const path = [[hx, hy]];
    stamp[hy * W + hx] = cur;
    let sx = -d[0];
    let sy = -d[1];
    let x = hx;
    let y = hy;
    for (let i = 1; i < len; i++) {
      let pick = null;
      if (i === 1) {
        if (!free(x + sx, y + sy)) return null;
        pick = [sx, sy];
      } else {
        const turns = rng.shuffle([[-sy, sx], [sy, -sx]]);
        const opts = rng.chance(P.bendP) ? [...turns, [sx, sy]] : [[sx, sy], ...turns];
        for (const o of opts) {
          if (free(x + o[0], y + o[1])) {
            pick = o;
            break;
          }
        }
        if (!pick) break;
      }
      x += pick[0];
      y += pick[1];
      stamp[y * W + x] = cur;
      path.push([x, y]);
      sx = pick[0];
      sy = pick[1];
    }
    if (path.length < 2) return null;
    return path.reverse();
  }

  function sampleHead() {
    const idx = M ? P.floor[rng.int(0, P.floor.length - 1)] : rng.int(0, N - 1);
    if (occ[idx] >= 0) return null;
    const x = idx % W;
    const y = (idx / W) | 0;
    const dk = DIR_KEYS[rng.int(0, 3)];
    const d = DIRS[dk];
    cur++;
    stamp[idx] = cur;
    const ray = [];
    let rx = x + d[0];
    let ry = y + d[1];
    while (rx >= 0 && ry >= 0 && rx < W && ry < H) {
      const ri = ry * W + rx;
      if (occ[ri] >= 0) return null;
      ray.push(ri);
      stamp[ri] = cur;
      rx += d[0];
      ry += d[1];
    }
    return { x, y, d, dk, ray };
  }

  function sampleSingle() {
    const hd = sampleHead();
    if (!hd) return null;
    const cells = grow(hd.x, hd.y, hd.d, pickLen());
    if (!cells) return null;
    return { parent: { cells, dir: hd.dk }, kitten: null, ray: hd.ray };
  }

  function samplePair() {
    const hd = sampleHead();
    if (!hd) return null;
    const cells = grow(hd.x, hd.y, hd.d, pickLen());
    if (!cells) return null;
    const dx = cells[1][0] - cells[0][0];
    const dy = cells[1][1] - cells[0][1];
    const kx = cells[0][0] - dx;
    const ky = cells[0][1] - dy;
    if (!free(kx, ky)) return null;
    const kc = grow(kx, ky, [dx, dy], rng.int(2, P.kittenMax));
    if (!kc) return null;
    return { parent: { cells, dir: hd.dk }, kitten: { cells: kc, dir: dirKey(dx, dy) }, ray: hd.ray };
  }

  function evaluate(c) {
    const all = c.kitten ? c.parent.cells.concat(c.kitten.cells) : c.parent.cells;
    evalStamp++;
    let inRay = 0;
    let compact = 0;
    let maxDown = -1;
    for (const [x, y] of all) {
      const ow = rayOwn[y * W + x];
      if (ow.length) {
        inRay++;
        for (const u of ow) {
          if (bm[u] !== evalStamp) {
            bm[u] = evalStamp;
            if (down[u] > maxDown) maxDown = down[u];
          }
        }
      }
      for (const k of DIR_KEYS) {
        const nx = x + DIRS[k][0];
        const ny = y + DIRS[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || occ[ny * W + nx] >= 0) compact++;
      }
    }
    c.maxDown = maxDown;
    c.matters = false;
    if (c.kitten) {
      for (const [x, y] of c.parent.cells) for (const u of rayOwn[y * W + x]) pm[u] = evalStamp;
      for (const [x, y] of c.kitten.cells) {
        for (const u of rayOwn[y * W + x]) if (pm[u] !== evalStamp) c.matters = true;
      }
    }
    c.score = 2 * inRay + 3 * Math.min(maxDown + 1, cap) + 0.5 * compact + rng.next() * 2;
  }

  function bestOf(sampler, K, needMatter) {
    let best = null;
    for (let i = 0; i < K; i++) {
      const c = sampler();
      if (!c) continue;
      evaluate(c);
      if (needMatter && !c.matters) continue;
      if (!best || c.score > best.score) best = c;
    }
    return best;
  }

  function place(c) {
    const idx = units.length;
    const all = c.kitten ? c.parent.cells.concat(c.kitten.cells) : c.parent.cells;
    for (const [x, y] of all) occ[y * W + x] = idx;
    filled += all.length;
    down[idx] = c.maxDown + 1;
    for (const ri of c.ray) rayOwn[ri].push(idx);
    units.push(c);
  }

  let fails = 0;
  let pairsPlaced = 0;
  let pairFails = 0;
  let nCats = 0;
  for (;;) {
    if (nCats >= (P.maxCats || 99)) break; // big boards stay readable: at most ~18 cats, longer bodies fill the room
    const fill = filled / area;
    const pairsLeft = P.pairs - pairsPlaced;
    const pairOpen = pairsLeft > 0 && pairFails < 60;
    let c = null;
    let isPair = false;
    if (pairOpen && fill >= (0.2 + 0.1 * pairsPlaced) * P.fillTarget) {
      c = bestOf(samplePair, 24, true);
      isPair = true;
      if (!c) pairFails++;
    }
    if (!c) {
      if (fill >= P.fillTarget) {
        if (pairOpen) continue;
        break;
      }
      c = bestOf(sampleSingle, 8, false);
      isPair = false;
      if (!c) {
        if (++fails >= 30) break;
        continue;
      }
    }
    fails = 0;
    place(c);
    nCats += c.kitten ? 2 : 1;
    if (isPair) pairsPlaced++;
  }

  let depth = 0;
  for (const d of down) depth = Math.max(depth, d);
  return { units, occ, filled, fill: filled / area, depth, pairsPlaced };
}

// ---- helpers over units ----
const totalCats = (units) => units.reduce((t, u) => t + (u.kitten ? 2 : 1), 0);

// Temp board with ids in unit order (parent, then kitten).
function tempBoard(P, units) {
  const cats = [];
  for (const u of units) {
    const pid = cats.length;
    cats.push(makeCat(pid, u.parent.cells, 'tabby', null));
    if (u.kitten) cats.push(makeCat(pid + 1, u.kitten.cells, 'tabby', pid));
  }
  return makeBoard(P.w, P.h, cats);
}

const depthOf = (P, units) => dependencyDepth(tempBoard(P, units));

// Cat count must be a multiple of 3: drop 1-2 single cats, keeping dependency depth when we can.
function trim(P, units, rng) {
  const rem = totalCats(units) % 3;
  if (!rem) return units;
  const base = depthOf(P, units);
  const singles = [];
  units.forEach((u, i) => {
    if (!u.kitten) singles.push(i);
  });
  if (singles.length < rem) return null;
  let best = null;
  for (let t = 0; t < 6; t++) {
    rng.shuffle(singles);
    const drop = new Set(singles.slice(0, rem));
    const kept = units.filter((_, i) => !drop.has(i));
    const d = depthOf(P, kept);
    if (!best || d > best.d) best = { kept, d };
    if (d >= base) break;
  }
  return best.kept;
}

// Obstacle-aware "can the board be cleared at all" (bench ignored): removal only ever frees, so greedy is complete.
function clearable(board) {
  const C = compile(board);
  const sim = new Sim(C, 9999);
  for (let progress = true; progress && sim.left > 0;) {
    progress = false;
    for (const u of sim.free()) {
      sim.apply(u);
      progress = true;
    }
  }
  return sim.left === 0;
}

// Put the level's dogs, yarn and frozen / mystery cats on the bare layout BEFORE the tap order is drawn, so the
// order has to work around them (wake the dog, knock the yarn, thaw the ice before the cat behind can go).
function placeObstacles(temp, n, rng, sv) {
  const { w, h } = temp;
  const plan = mechPlan(n, sv);
  const placed = { dog: 0, yarn: 0, mystery: 0, frozen: 0, spring: 0, swivel: 0 };
  const taken = () => {
    const g = new Uint8Array(w * h);
    for (const c of temp.cats) for (const [x, y] of c.cells) g[y * w + x] = 1;
    for (const o of temp.objs) for (const [x, y] of o.cells) g[y * w + x] = 1;
    if (temp.mask) for (let i = 0; i < w * h; i++) if (!temp.mask[i]) g[i] = 1; // shape lane: no dog / yarn on a void cell
    return g;
  };
  // empty cells on a cat's lane: a blocker there is what holds that cat. Lanes with no cat in the way come first:
  // there the dog or yarn is the ONLY thing keeping that cat home.
  const laneCells = () => {
    const g = taken();
    const out = [];
    for (const c of temp.cats) {
      if (c.kittenOf != null) continue;
      const ray = exitRay(c, w, h);
      const busy = ray.filter(([x, y]) => g[y * w + x]).length;
      for (const [x, y] of ray) if (!g[y * w + x]) out.push({ cell: [x, y], busy, r: rng.next() });
    }
    return out.sort((a, b) => a.busy - b.busy || a.r - b.r).map((o) => o.cell);
  };
  for (let i = 0; i < (plan.dog || 0); i++) {
    const cand = laneCells();
    for (let t = 0; t < Math.min(24, cand.length); t++) {
      const g = taken();
      const [x, y] = cand[t];
      const [dx, dy] = rng.pick([[1, 0], [0, 1], [-1, 0], [0, -1]]);
      const x2 = x + dx;
      const y2 = y + dy;
      if (g[y * w + x] || x2 < 0 || y2 < 0 || x2 >= w || y2 >= h || g[y2 * w + x2]) continue;
      const cells = [[x, y], [x2, y2]];
      if (catsNear(temp, cells, DOG_NEAR).length < 4) continue;
      temp.objs.push({ kind: 'dog', cells });
      if (clearable(temp)) {
        placed.dog++;
        break;
      }
      temp.objs.pop();
    }
  }
  for (let i = 0; i < (plan.yarn || 0); i++) {
    const cand = laneCells();
    for (let t = 0; t < Math.min(24, cand.length); t++) {
      const [x, y] = cand[t];
      if (taken()[y * w + x]) continue;
      temp.objs.push({ kind: 'yarn', cells: [[x, y]] });
      if (clearable(temp)) {
        placed.yarn++;
        break;
      }
      temp.objs.pop();
    }
  }
  const plain = (c) => !c.mech && c.kittenOf == null && !temp.cats.some((k) => k.kittenOf === c.id);
  for (const [kind, need] of [['frozen', 2], ['mystery', 1]]) {
    const ids = rng.shuffle(temp.cats.filter((c) => plain(c) && edgeNeighbours(temp, c).length >= need).map((c) => c.id));
    for (const id of ids.slice(0, 12)) {
      if (placed[kind] >= (plan[kind] || 0)) break;
      temp.cats[id].mech = kind;
      if (kind === 'mystery' || clearable(temp)) placed[kind]++;
      else delete temp.cats[id].mech;
    }
  }
  // spring cats and swivel beds (content-mech.js); a swivel never shares a board with yarn (a ball rolls off when a cat
  // passes its lane, and a swivel's lane depends on the side it leaves by)
  for (const kind of ['spring', 'swivel']) {
    if (!plan[kind] || (kind === 'swivel' && temp.objs.some((o) => o.kind === 'yarn'))) continue;
    const crng = makeRng(hashSeed('cplace', n, kind, JSON.stringify(temp.cats[0].cells))); // its own rng: the rest of the board draws as before
    for (const id of mechCandidates(temp, kind, plain, crng).slice(0, 12)) {
      if (placed[kind] >= plan[kind]) break;
      temp.cats[id].mech = kind;
      if (clearable(temp)) placed[kind]++;
      else delete temp.cats[id].mech;
    }
  }
  if (plan.lock || plan.twin) place3(temp, plan, placed, plain, n, clearable); // R13 padlock + key, twins (mech3.js)
  return placed;
}

// Shuffled cat ids, obstacles, and a random legal tap order (as groups of arriving cat ids) under the real
// obstacle rules. Hold-outs: a big mother + kitten free early waits until late in the line. Tapped early she and her
// kitten squat on TWO seats while the line needs every seat: the tempting wrong tap the solver measures as a trap.
function drawOrder(P, units, rng) {
  const entries = [];
  units.forEach((u, ui) => {
    entries.push({ unit: ui, role: 'p', cells: u.parent.cells });
    if (u.kitten) entries.push({ unit: ui, role: 'k', cells: u.kitten.cells });
  });
  rng.shuffle(entries);
  const pid = new Map();
  entries.forEach((e, i) => {
    e.id = i;
    if (e.role === 'p') pid.set(e.unit, i);
  });
  const temp = makeBoard(P.w, P.h, entries.map((e) => makeCat(e.id, e.cells, 'tabby', e.role === 'k' ? pid.get(e.unit) : null)));
  temp.mask = P.mask || null; // shape lane (placeObstacles)
  const mechs = P.n >= 8 ? placeObstacles(temp, P.n, rng, P.sv) : null;
  const C = compile(temp);
  const sim = new Sim(C, 9999);
  const size = (u) => C.len[u] + (C.ucats[u].length > 1 ? 3 : 0);
  const free0 = sim.free();
  const hold = new Set(free0.sort((a, b) => size(b) - size(a) || a - b).slice(0, Math.min(1, free0.length - 2)));
  const release = Math.floor(C.N * (P.holdUntil || 0.65));
  const newMech = C.mk.some((k) => k > 0); // spring / swivel on the board: the line has to use them
  let holdAt = -1;
  const groups = [];
  while (sim.left > 0) {
    const free = sim.free();
    if (!free.length) return null;
    if (groups.length < release / 2) {
      for (const u of free) if (hold.size < (P.hold || 0) && C.ucats[u].length > 1 && free.length - hold.size > 2) hold.add(u);
    }
    const pickable = groups.length >= release ? free : free.filter((u) => !hold.has(u));
    const u = newMech ? pickMech(sim, C, pickable.length ? pickable : free, rng) : rng.pick(pickable.length ? pickable : free);
    sim.apply(u);
    if (hold.has(u) && holdAt < 0) holdAt = groups.length;
    groups.push(C.ucats[u].slice());
  }
  return { entries, pid, groups, holdAt: holdAt < 0 ? groups.length : holdAt, temp, mechs };
}

// Colors + carrier queue along the arrival groups. Lazy carriers: a detour cat sits on the bench
// until a carrier of its color rolls in. Keeps bench <= benchSize - 1 after every group.
// holdAt: index of the first held-back group; the bench peak before it (peakPre) is the squeeze a held pair would break.
function assignColors(groups, P, rng, holdAt = groups.length) {
  const T = groups.reduce((t, g) => t + g.length, 0);
  const Q = T / 3;
  const B = P.benchSize;
  const nCol = Math.max(2, P.colors);
  const carriers = [];
  const bench = [];
  const groupColor = [];
  let created = 0;
  let lastColor = -1;
  const usedCols = new Set();
  let detours = 0;
  let chains = 0; // a carrier that leaves and the next one filled from the bench alone = a 2-step chain
  let peak = 0;
  let front = null;
  const benchCount = (c) => bench.filter((x) => x === c).length;
  const distinct = () => new Set(bench).size;
  const takeBench = (c) => {
    let k = 0;
    for (let i = bench.length - 1; i >= 0; i--) {
      if (bench[i] === c) {
        bench.splice(i, 1);
        k++;
      }
    }
    return k;
  };

  function nextFront(force) {
    for (;;) {
      front = null;
      const q = Q - created;
      if (q <= 0) return;
      const bcs = [...new Set(bench)];
      let color;
      if (force != null) color = force;
      else if (bcs.length && (bcs.length >= q || rng.chance(P.pAbsorb))) {
        let most = -1;
        let cand = [];
        for (const c of bcs) {
          const k = benchCount(c);
          if (k > most) {
            most = k;
            cand = [c];
          } else if (k === most) cand.push(c);
        }
        color = rng.pick(cand);
      } else {
        const cand = [];
        for (let c = 0; c < nCol; c++) if (!bcs.includes(c) && c !== lastColor) cand.push(c);
        if (!cand.length) for (let c = 0; c < nCol; c++) if (!bcs.includes(c)) cand.push(c);
        const fresh = cand.filter((c) => !usedCols.has(c)); // spread over every colour the level asks for
        const pool = fresh.length && rng.chance(0.85) ? fresh : cand;
        color = pool.length ? rng.pick(pool) : rng.pick(bcs);
      }
      force = null;
      usedCols.add(color);
      created++;
      carriers.push({ color, cap: 3 });
      front = { color, fill: takeBench(color) };
      if (front.fill < 3) return;
      lastColor = color; // the bench alone filled it: it departs at once, chain on
      chains++;
    }
  }

  nextFront();
  let peakPre = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    if (!front) return null;
    const s = g.length;
    const futureQ = Q - created;
    const need = 3 - front.fill;
    const squeeze = s === 2 && need === 1 && futureQ < 1 + distinct();
    let color = -1;
    if (bench.length + s <= B - 1 && (squeeze || rng.chance(gi < holdAt ? Math.min(0.6, 2 * P.detourP) : P.detourP / 2))) {
      const d = distinct();
      const cand = [];
      const stack = [];
      for (let c = 0; c < nCol; c++) {
        if (c === front.color) continue;
        const k = benchCount(c);
        if (k + s <= 3 && d + (k === 0 ? 1 : 0) <= futureQ) (k > 0 ? stack : cand).push(c);
      }
      const pool = stack.length && (!cand.length || rng.chance(0.45)) ? stack : cand;
      if (pool.length) color = rng.pick(pool);
    }
    if (color >= 0) {
      for (let i = 0; i < s; i++) bench.push(color);
      detours++;
    } else {
      if (squeeze) return null;
      color = front.color;
      if (need >= s) {
        front.fill += s;
        if (front.fill >= 3) {
          lastColor = color;
          nextFront();
        }
      } else {
        // the mother completes the carrier, the kitten rides in the next one of the same color
        lastColor = color;
        nextFront(color);
        if (!front) return null;
        front.fill += s - 1;
      }
    }
    groupColor.push(color);
    if (bench.length > peak) peak = bench.length;
    if (gi < holdAt && bench.length > peakPre) peakPre = bench.length;
  }
  if (front || bench.length || created !== Q) return null;
  return { groupColor, carriers, detours, peak, peakPre, chains };
}

// Walk the winning line on the fast model: does it still win (bench <= seats - 1), and does every mechanic piece
// MATTER on it? A dog or yarn matters when, while it is still there, it is the only thing in some cat's way; a frozen
// cat matters when its lane is clear but the ice still holds it; a mystery cat matters when it is free while still
// hidden and the line reveals it before tapping it (the player has to wait for its colour).
function lineCheck(board, order) {
  const C = compile(board);
  const sim = new Sim(C, board.meta.benchSize);
  const cats = board.cats;
  const objM = new Uint8Array(C.nObj);
  const mysU = [];
  C.units.forEach((p, u) => {
    if (cats[p].mech === 'mystery') mysU.push({ u, nb: edgeNeighbours(board, cats[p]).map((id) => C.unitOf[id]), free: false, ok: false });
  });
  const frzU = C.units.map((p, u) => u).filter((u) => C.frozenOf[u] >= 0);
  const frzM = new Map(frzU.map((u) => [u, false]));
  let peak = 0;
  const used = new Set(); // springs that hop and swivels that turned before their tap
  for (const id of order) {
    const lu = C.unitOf[id];
    if (C.mk[lu] && mechUsed(sim, lu)) used.add(C.units[lu]);
    mark3(sim, used); // R13: a padlock holding a free lane (and its key), twins with one lane clear
    for (let u = 0; u < C.N; u++) {
      if (!sim.alive[u] || C.mk[u]) continue;
      let catIn = false;
      for (const v of C.rayU[u]) if (sim.alive[v]) catIn = true;
      if (catIn) continue;
      const live = [];
      for (const k of C.rayO[u]) if (sim.objAlive(k)) live.push(k);
      if (sim.frozen(u)) {
        if (!live.length) frzM.set(u, true);
        continue;
      }
      if (C.nLock && C.lockKey[u] >= 0 && sim.alive[C.lockKey[u]]) continue; // padlocked: a gate or dog is not what holds it
      if (live.length === 1) objM[live[0]] = 1;
    }
    for (const m of mysU) {
      const hidden = !m.nb.some((v) => !sim.alive[v]);
      if (hidden && sim.canExit(m.u)) m.free = true;
      if (m.u === lu) m.ok = m.free && !hidden;
    }
    if (!sim.canExit(lu) || !sim.apply(lu)) return { won: false };
    if (sim.used > peak) peak = sim.used;
  }
  const keepCat = new Set();
  for (const [u, ok] of frzM) if (ok) keepCat.add(C.units[u]);
  for (const m of mysU) if (m.ok) keepCat.add(C.units[m.u]);
  for (const p of used) keepCat.add(p);
  return { won: sim.left === 0 && peak <= board.meta.benchSize - 1, peak, objM, keepCat };
}

// The obstacles were placed before the tap order was drawn; now that the line is fixed, keep only the pieces that
// MATTER on it (removing a piece only frees cats, so the line still wins). The teaching level must keep its lesson.
function finishMechanics(board, tk) {
  const r = lineCheck(board, board.meta.order);
  if (!r.won) return false;
  board.objs = board.objs.filter((o, k) => r.objM[k]);
  for (const c of board.cats) if (c.mech && !r.keepCat.has(c.id)) delete c.mech;
  for (const c of board.cats) if (c.twin != null && !c.mech) delete c.twin;
  if (!board.cats.some((c) => c.mech === 'lock')) for (const c of board.cats) if (c.mech === 'key') delete c.mech; // a key opens nothing
  const placed = { dog: 0, yarn: 0, mystery: 0, frozen: 0, spring: 0, swivel: 0 };
  const r13 = { lock: 0, gate: 0, twin: 0 }; // R13 kinds only when on the board (schedule-2 meta stays as it was)
  for (const o of board.objs) (o.kind === 'gate' ? r13 : placed)[o.kind]++;
  for (const c of board.cats) if (c.mech && c.mech !== 'key' && !(c.mech === 'twin' && c.twin < c.id)) (c.mech in r13 ? r13 : placed)[c.mech]++; // a twin pair counts once
  for (const k of Object.keys(r13)) if (r13[k]) placed[k] = r13[k];
  board.meta.mechs = placed;
  board.meta.teach = tk || null;
  if (tk && Object.keys(placed).some((k) => k !== tk && placed[k] > 0)) return false;
  return !tk || placed[tk] >= 1;
}

const hasMech = (board) => board.objs.length > 0 || board.cats.some((c) => c.mech);
// the same board with every dog, yarn ball, ice coat and mystery taken away
function stripMechs(board) {
  const cats = board.cats.map((c) => { const k = { ...c }; delete k.mech; delete k.twin; return k; });
  return { ...board, objs: [], cats, meta: { ...board.meta, mechs: { dog: 0, yarn: 0, mystery: 0, frozen: 0, spring: 0, swivel: 0 }, teach: null } };
}

// Does the level's mechanic change the solution? Compare the line on the board with every dog, yarn ball, ice coat
// and mystery taken away (removal only frees cats, so the line stays legal): it counts when some tap that is open on
// both boards wins on one and loses on the other. Otherwise the wake / knock / thaw timing never matters.
function mechGain(board) {
  if (!hasMech(board)) return false;
  if (board.cats.some((c) => c.mech === 'spring' || c.mech === 'swivel')) return true; // kept only when the line hops / waits for the turn: without it the line is not even legal
  if (board.cats.some((c) => c.mech === 'mystery')) return true; // lineCheck kept it only when it is free while hidden and the line waits for its colour
  if (board.objs.some((o) => o.kind === 'gate') || board.cats.some((c) => c.mech === 'lock' || c.mech === 'twin')) return true; // R13: lineCheck kept each only while it holds a cat the line needs
  return mechChanges(board, stripMechs(board), board.meta.order);
}

// Colour spread: at least 3 colours from L5, 4 from L8, and no colour above 40% of the cats, so boards read at a glance.
function spreadOk(groups, asg, n) {
  const cnt = new Map();
  let tot = 0;
  groups.forEach((g, gi) => {
    cnt.set(asg.groupColor[gi], (cnt.get(asg.groupColor[gi]) || 0) + g.length);
    tot += g.length;
  });
  const minK = 4;
  return cnt.size >= minK && Math.max(...cnt.values()) / tot <= 0.4;
}

// Build the board for one colouring of one tap order. Returns null when the line does not win with a spare seat.
function build(P, units, ord, asg, aIdx) {
  const color = new Array(ord.entries.length);
  ord.groups.forEach((g, gi) => g.forEach((id) => (color[id] = asg.groupColor[gi])));
  const cats = ord.entries.map((e) => {
    const c = makeCat(e.id, e.cells, BREEDS[color[e.id]], e.role === 'k' ? ord.pid.get(e.unit) : null);
    if (ord.temp.cats[e.id].mech) c.mech = ord.temp.cats[e.id].mech;
    if (ord.temp.cats[e.id].twin != null) c.twin = ord.temp.cats[e.id].twin; // R13 twins (same unit: same colour)
    return c;
  });
  const order = ord.groups.map((g) => g[0]);
  const board = makeBoard(
    P.w,
    P.h,
    cats,
    {
      n: P.n,
      tutorial: false,
      kind: P.kind,
      benchSize: P.benchSize,
      order,
      detours: asg.detours,
      colors: new Set(color).size,
      pairs: units.filter((u) => u.kitten).length,
      attempts: aIdx + 1,
    },
    asg.carriers,
  );
  board.objs = ord.temp.objs.map((o) => ({ kind: o.kind, cells: o.cells.map((c) => c.slice()) }));
  return board;
}

// How well the measured decisions fit the level's band. >= 1000 means every requirement holds.
function bandScore(d, P) {
  const b = P.band;
  let s = 0;
  const late = b.late || 0;
  let meets = d.startSafe >= 2 && d.traps >= b.traps && d.late >= late && d.deadRatio >= (b.deadMin || 0) && d.chains >= b.chains && d.chain3 >= b.chain3 && d.peak <= P.benchSize - 1;
  if (b.maxTraps != null && d.traps > b.maxTraps) meets = false;
  if (meets) s += 1000;
  else if (d.startSafe >= 2 && d.traps >= 1 && d.chains >= 1 && d.peak <= P.benchSize - 1 && !(b.maxTraps != null && d.traps > b.maxTraps)) s += 500; // the floor every level keeps
  s -= d.startSafe < 2 ? 400 : 0;
  s += 40 * Math.min(d.traps, b.traps + 1) + 25 * Math.min(d.chains, b.chains + 1) + 30 * Math.min(d.chain3, b.chain3 + 1);
  s += 70 * Math.min(d.late, late + 1); // delayed traps are what make a level a plan rather than arithmetic
  if (b.maxTraps != null) s -= 60 * Math.max(0, d.traps - b.maxTraps);
  s -= 120 * Math.max(0, d.deadRatio - b.dead); // too punishing: most taps lose
  s -= 300 * Math.max(0, (b.deadMin || 0) - d.deadRatio); // too loose: almost any order wins
  s += 10 * Math.min(d.deadRatio, b.dead);
  s -= 200 * Math.max(0, b.chain3 - d.chain3); // a hard level's whole-carrier chain is its showpiece
  if (P.kind !== 'normal') s -= 150 * Math.max(0, b.traps - d.traps);
  if (d.traps < 1) s -= 400; // the floor: every level has at least one tempting wrong tap
  if (b.maxTraps != null) s -= 240 * Math.max(0, d.traps - b.maxTraps); // a breather stays a breather
  s -= 2 * d.unknown;
  return s;
}

// shape lane: a winning line on a folded board that never needs the last cushion (root cat ids), or null
function foldLine(board, budget) {
  const sim = new Sim(compile(board), board.meta.benchSize);
  if (searchWin(sim, budget) !== 1) return null;
  const order = sim.line.map((u) => sim.C.units[u]);
  const rp = replay(board, order);
  return rp.won && rp.peak <= board.meta.benchSize - 1 ? order : null;
}

const WORK_CAP = 60000;
const BOSS_WORK = 3000;
const MAX_EVALS = 14; // decision measurements per level (each is a few hundred solver nodes)

export function generate(n, sv = SCHED) {
  n = Number.isFinite(+n) ? Math.max(1, Math.floor(+n)) : 1;
  if (n <= 4) return tutorial(n);
  const P = params(n, sv);
  const boss = P.kind === 'boss';
  const needCats = boss ? 24 : 3 * Math.min(P.colors, 5); // a boss board only ships a layout with its giant order (24+ cats)
  const workCap = boss ? BOSS_WORK : WORK_CAP;
  const gates = sv >= 3 && n >= 8 ? mechPlan(n, sv).gate || 0 : 0; // bigger boards cost more per measurement: a boss stops measuring sooner
  // keep measuring: under the cap, or (a boss) up to 3x the cap while the best board still lacks the boss floor
  const more = () => !best || work < workCap || (boss && work < 2 * workCap && !(best.d.traps >= 4 && best.d.chain3 >= 1));
  // a layout (fill, depth, kitten pairs, long cats); ok = good enough to colour and measure
  const layoutAt = (a) => {
    const r = runAttempt(P, makeRng(levelSeed(n, a)));
    const units = trim(P, r.units, makeRng(levelSeed(n, 'trim', a)));
    if (!units || totalCats(units) < 6) return null;
    let filled = 0;
    let pairs = 0;
    let long = 0;
    for (const u of units) {
      filled += u.parent.cells.length + (u.kitten ? u.kitten.cells.length : 0);
      if (u.kitten) pairs++;
      if (u.parent.cells.length >= 4) long++;
    }
    const fill = filled / (P.area || P.w * P.h);
    const depth = depthOf(P, units);
    const cats = totalCats(units);
    const ok = fill >= P.fillMin && depth >= P.depthMin && pairs >= P.pairs && long * 4 >= units.length && cats >= needCats && kittenStats(tempBoard(P, units)).matter >= 1;
    const q = (cats >= needCats ? 100 : 0) + (pairs >= P.pairs ? 50 : 0) + fill * 10 + Math.min(depth, P.depthTarget) * 5;
    return { L: { units, a, fill, depth }, ok, q };
  };
  // orders x colourings per layout, measured by the solver; keep the best fit for the band
  let best = null;
  let evals = 0;
  let work = 0; // solver nodes spent measuring: a deterministic cap on generation time
  let relax = false;
  const tryLayout = (L, maxEvals) => {
    let mechFails = 0;
    let lEvals = 0; // a boss gives up on a layout whose first three lines hold almost no trap (a giant open board)
    let lTraps = 0;
    for (let o = 0; o < 3 && evals < maxEvals && more(); o++) {
      const ord = drawOrder(P, L.units, makeRng(levelSeed(n, 'final', L.a, o)));
      if (!ord) continue;
      let built = 0;
      for (let v = 0; v < 30 && built < 3 && evals < maxEvals && more(); v++) {
        const asg = assignColors(ord.groups, P, makeRng(levelSeed(n, 'assign', L.a, o, v)), ord.holdAt);
        if (!asg || (!relax && (!spreadOk(ord.groups, asg, n) || asg.detours < P.minDetours || asg.peak < P.minPeak || (P.hold && asg.peakPre < P.benchSize - 1 && v < 20) || (boss && !asg.chains && v < 20)))) continue; // a boss line fills a whole carrier from the bench: checked here, before the costly measurement
        const board = build(P, L.units, ord, asg, L.a);
        if (gates) placeGates(board, gates, makeRng(levelSeed(n, 'gate', L.a, o, v)), { compile, Sim, mask: P.mask }); // R13: after colours (a gate's colour is a carrier's)
        const rp = replay(board, board.meta.order);
        if (!rp.won || rp.peak > P.benchSize - 1) continue;
        if (n >= 8 && !finishMechanics(board, P.tk)) {
          if (++mechFails >= 3) return false; // this layout cannot host the lesson's mechanic on its line
          continue;
        }
        built++;
        evals++;
        const d = decisions(board, board.meta.order);
        if (!d) continue;
        work += d.nodes;
        // a mechanic that never changes what is safe to tap is decoration: a normal level is measured (and ships)
        // without it, a teaching level is pushed hard toward a layout where it does matter
        let cand = board;
        let dd = d;
        if (hasMech(board)) {
          d.mechLate = mechGain(board);
          if (!d.mechLate && !P.teach) {
            const bare = stripMechs(board);
            const d2 = decisions(bare, bare.meta.order);
            if (d2) {
              cand = bare;
              dd = d2;
              work += d2.nodes;
            }
          }
        }
        const base = bandScore(dd, P);
        const s = base + (dd.mechLate ? 120 : P.teach ? -600 : 0);
        if (!best || s > best.s) best = { s, base, board: cand, d: dd, L };
        lTraps = Math.max(lTraps, dd.traps);
        if (boss && ++lEvals >= 3 && lTraps < 2) return false;
        if (s >= 1000 && (base >= 1000 || !cand.cats.some((c) => c.mech === 'spring' || c.mech === 'swivel'))) return true; // a spring / swivel board stops the search only inside its band
      }
    }
    return false;
  };
  const maxEvals = MAX_EVALS + (P.kind === 'boss' || P.kind === 'super' ? 50 : P.kind !== 'normal' ? 30 : P.teach ? 70 : P.after || n < 40 ? 40 : P.medium ? 30 : 22) + (P.evalBonus || 0); // shape lane: a shaped board measures a few more
  let fallback = null;
  let done = false;
  for (let a = 0; a < MAX_ATTEMPTS + 30 && !done && evals < maxEvals; a++) {
    const r = layoutAt(a);
    if (!r) continue;
    if (r.ok) done = tryLayout(r.L, maxEvals);
    else if (!fallback || r.q > fallback.q) fallback = r;
  }
  // nothing measured at all (rare): the best near-miss layout, then relaxed colour filters over more layouts
  if (!best && fallback) tryLayout(fallback.L, evals + 3);
  relax = true;
  for (let a = MAX_ATTEMPTS + 30; !best && a < MAX_ATTEMPTS + 90; a++) {
    const r = layoutAt(a);
    if (r) tryLayout(r.L, evals + 3);
  }
  if (!best) throw new Error('generate failed for level ' + n);
  const { board, d, L } = best;
  if (P.shape && ((best.base < 1000 && P.kind === 'normal' && n !== 16) || !shapeKeeps(board, d, P, kittenStats(board), dependencyDepth(board)))) { shapeOff.add(sv * 1e4 + n); return generate(n, sv); } // shape lane: this shape missed the level's band: it ships plain
  if (P.alt && best.base < 1000 && P.kind === 'normal' && !P.after && !shapeOff.has(sv * 1e4 + n) && !altRetry.has(sv * 1e4 + n)) { altRetry.set(sv * 1e4 + n, 1); return generate(n, sv); } // schedule 3: one more box of another aspect
  const inBand = best.base >= 1000;
  let filled = 0;
  for (const c of board.cats) filled += c.cells.length;
  Object.assign(board.meta, {
    depth: L.depth,
    fill: +(filled / (P.area || P.w * P.h)).toFixed(3),
    benchPeak: d.peak,
    chains: d.chains,
    chain3: d.chain3,
    traps: d.traps,
    late: d.late,
    mechLate: !!d.mechLate,
    deadRatio: d.deadRatio,
    freeAvg: d.freeAvg,
    work,
    startSafe: d.startSafe,
    forced: d.forced,
    band: inBand,
    flavour: P.flavour === 'yarn' && !board.objs.some((o) => o.kind === 'yarn') ? null : P.flavour, // a yarn alley whose balls never mattered shipped plain
  });
  if (sv === 1) return board; // schedule 1: exactly the board an old dare link was made on (no shape, no flaps, no shape meta)
  return shapeFinish(board, P, { decide: decisions, solveLine: foldLine }); // shape lane: board.shape, folded flaps (meta follows their decisions)
}
