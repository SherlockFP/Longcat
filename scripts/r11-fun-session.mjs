// R11 fun lane (sol-r11-3 fix 7): a bot plays the first session, L1-L12 + the first resident build + the first dare
// offer, and reports where a fresh player is most likely to stall. Usage: node scripts/r11-fun-session.mjs [runs]
// The novice model: follows the L1-3 arrow most of the time, sends a cat of the front carrier's colour when it sees
// one (60%), else taps any free cat; never takes a tap the press preview marks red (no seat) while another exists.
// On a level's first lost bench it takes the free Take back (once per level, as the game does), then retries.
// Economy is the game's: 1 star + 20+ coins per first clear, the café opens at L4, lives only after the first resident.
import { boardOf } from '../src/core/curated.js';
import { createState, tap, undo, isWon, isHidden } from '../src/core/rules.js';
import { freeCats, hint, solveFrom } from '../src/core/solver.js';
import { winnableBack } from '../src/core/r11-fun.js';
import RAW from '../data/cafe.json' with { type: 'json' };

const RUNS = +process.argv[2] || 300;
// --fix models the R11 fun fixes with assumed player responses (not measured): A the teaching rewind's mark is heeded
// 75% of the time, B the opening costs no life, C from a curated level's 3rd try its wait tags steer 60% of picks
const FIX = process.argv.includes('--fix');
const LEVELS = 12;
const MAX_TRIES = 8; // a player who loses a level this many times in one sitting is counted as stalled there
const TUT = { 1: 'tut1', 2: 'tut2', 3: 'tut3', 4: 'tut4', 8: 'tutDog', 12: 'tutYarn' };

let seed = 1;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];

function wouldFail(st, id) {
  const r = tap(st, id);
  if (!r.ok) return true;
  const bad = st.failed;
  undo(st, true);
  return bad;
}

// a big costly park: two or more cats to the bench for a carrier at least two departures away
function bigPark(st, id) {
  const q = st.carriers.map((c) => c.color);
  const r = tap(st, id);
  if (!r.ok) return false;
  const parked = r.events.filter((e) => e.type === 'bench');
  undo(st, true);
  return parked.length >= 2 && parked.every((e) => q.indexOf(e.color) >= 2);
}
let tagLearn = false; // fix C: a curated level's wait tags are back from the 3rd try on
let avoid = -1;
let avoidAt = -1;
// the tap a k-step rewind took back first: replayed from the rewound state it is the move that made the loss certain
function culprit(st, board, k) { avoidAt = st.moves; return lastLine[st.moves] ?? -1; }
let lastLine = [];

function botMove(st, n) {
  let free = freeCats(st).filter((id) => st.board.cats[id].kittenOf == null);
  if (avoid >= 0 && st.moves === avoidAt && free.length > 1 && rnd() < 0.75) free = free.filter((id) => id !== avoid);
  if (!free.length) return -1;
  if (n <= 3 && rnd() < 0.8) { const h = hint(st, 2000); if (h != null) return h; } // the L1-3 arrow
  const safe = free.filter((id) => !wouldFail(st, id));
  let pool = safe.length ? safe : free;
  if (tagLearn && pool.length > 1 && rnd() < 0.6) { const calm = pool.filter((id) => !bigPark(st, id)); if (calm.length) pool = calm; }
  const f = st.carriers[0];
  const match = f ? pool.filter((id) => !isHidden(st, id) && st.board.cats[id].color === f.color) : [];
  if (match.length && rnd() < 0.6) return pick(match);
  return pick(pool);
}

// one attempt from a state; returns { won, peak, chain, moves }
function play(st, n) {
  let chain = 0;
  let guard = 0;
  while (!isWon(st) && !st.failed && guard++ < 200) {
    const id = botMove(st, n);
    if (id < 0) break;
    lastLine[st.moves] = id;
    const r = tap(st, id);
    if (r.ok) chain = Math.max(chain, r.events.filter((e) => e.type === 'board').length);
  }
  return { won: isWon(st), peak: st.benchPeak, chain };
}

const lv = Array.from({ length: LEVELS + 1 }, () => ({ reach: 0, clear: 0, tries: 0, firstWin: 0, losses: 0, oldBack: 0, newBack: 0, backWon: 0, rewound: 0, k: 0 }));
const firstDare = [];
const stallAt = [];
let livesOut = 0;

const tasks = RAW.areas.flatMap((a) => a.tasks);
const firstRes = tasks.findIndex((t) => t.resident);
const resStars = tasks.slice(0, firstRes + 1).reduce((s, t) => s + (t.cost || 1), 0);

for (let run = 0; run < RUNS; run++) {
  seed = 1000 + run * 7919;
  let stars = 0;
  let lives = 5;
  let resident = 0; // level at which the first resident moves in (built on the first café visit it is affordable)
  let dare = 0;
  let stalled = 0;
  for (let n = 1; n <= LEVELS && !stalled; n++) {
    if (!resident && n >= 4 && stars >= resStars) resident = n; // the café is home from L4: the build is the first thing there
    const board = boardOf(n);
    lv[n].reach++;
    let freeBack = true;
    let tries = 0;
    let won = false;
    while (!won && tries < MAX_TRIES) {
      tries++;
      lv[n].tries++;
      tagLearn = FIX && !!board.meta.cur && tries >= 3;
      const st = createState(board);
      let r = play(st, n);
      if (!r.won && freeBack) {
        freeBack = false;
        lv[n].losses++;
        // old Take back: the losing tap undone; new: the latest position the solver proves winnable
        const p1 = createState(board);
        Object.assign(p1, st, { undo: st.undo.slice() });
        undo(p1, true);
        if (solveFrom(p1, 6000).order) lv[n].oldBack++;
        const k = winnableBack(st);
        if (k) { lv[n].newBack++; lv[n].k += k; }
        for (let i = 0; i < Math.max(1, k); i++) undo(st, true);
        lv[n].rewound++;
        // fix A: the rewind points at the tap that cost the win (ghost cushions + the carrier it waits for); a player
        // who saw it avoids that tap from here 75% of the time
        avoid = FIX && k && (TUT[n] || board.meta.cur) ? culprit(st, board, k) : -1; // the mark is shown on teaching levels only
        const r2 = play(st, n);
        avoid = -1;
        if (r2.won) { lv[n].backWon++; r = { ...r2, chain: Math.max(r.chain, r2.chain) }; }
      }
      if (r.won) {
        won = true;
        if (tries === 1) lv[n].firstWin++;
        stars++;
        if (!dare && (r.chain >= 3 || (r.peak === 0 && board.cats.length >= 10))) dare = n;
      } else if (resident && !(FIX && n <= LEVELS)) { lives--; if (lives <= 0) { livesOut++; break; } } // fix B: the opening costs no life
    }
    if (won) lv[n].clear++;
    else stalled = n;
  }
  if (stalled) { stallAt.push(stalled); }
  firstDare.push(dare || 99);
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';
console.log(`${FIX ? 'WITH the R11 fun fixes' : 'current game'}: ${RUNS} novice runs, L1-L${LEVELS}; first resident costs ${resStars} stars (café from L4)`);
console.log('lvl  board   cats  first-try win  tries/clear  lost->back(old)  back(new)  avg k  won after back  note');
for (let n = 1; n <= LEVELS; n++) {
  const L = lv[n];
  const b = boardOf(n);
  const note = [TUT[n] && 'card ' + TUT[n], b.meta.cur && 'curated ' + b.meta.cur, (b.objs || []).length && 'objs ' + b.objs.map((o) => o.kind).join('+')].filter(Boolean).join(', ');
  console.log(`L${String(n).padEnd(3)} ${String(b.w + 'x' + b.h).padEnd(6)} ${String(b.cats.length).padEnd(5)} ${pct(L.firstWin, L.reach).padEnd(14)} ${(L.tries / Math.max(1, L.clear)).toFixed(2).padEnd(12)} ${pct(L.oldBack, L.losses).padEnd(16)} ${pct(L.newBack, L.losses).padEnd(10)} ${(L.newBack ? L.k / L.newBack : 0).toFixed(1).padEnd(6)} ${pct(L.backWon, L.rewound).padEnd(15)} ${note}`);
}
const hist = {};
for (const s of stallAt) hist[s] = (hist[s] || 0) + 1;
console.log(`stalled (>= ${MAX_TRIES} losses on one level, or out of lives): ${stallAt.length}/${RUNS} ${JSON.stringify(hist)}, out of lives ${livesOut}`);
const fd = firstDare.slice().sort((a, b) => a - b);
console.log(`first dare offer (chain x3 or a clean sweep): median L${fd[Math.floor(fd.length / 2)]}, by L12 ${pct(fd.filter((x) => x <= 12).length, RUNS)}`);
