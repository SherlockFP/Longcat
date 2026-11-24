// Hand-made campaign boards in the early run (sol-r11-2 fun finding): three boards in levels 5-15, each built around one
// bench decision the generated boards only reach by luck. L6 and L11 are 6x7, so their one-line idea card never sits on
// a row of cats on a 667px phone. generate(n) is untouched: a dare link of the older token
// (v1, or the leading 2) still opens the generated board it was made on (boardOf(n, rev)), new links carry rev 3.
// Measured with scripts/curate-probe.mjs (exhaustive: random-play odds, odds per first move, fewest seats, best chain).
import { makeCat, makeBoard, dirOfCells } from './board.js';
import { generate } from './generate.js';

export const BOARD_REV = 8; // the newest board revision (kit/dare.js token digit): 5 = the R11x schedule (generate.js SCHED 2:
// bosses, shaped boards, folded quilts); 2, 3 and 4 (made before it) keep the schedule-1 board; 6 = 5 + the R12 L9 / L10
// (the teaching pair on L9, the old L9 moved to L10); 7 = 6 + both R13 lanes, whose levels do not overlap: the R13 opening
// (R13 below: L1-3, L5-7, L10) and schedule 3 (padlocks, colour gates and twins past L100, a board that changes shape far
// more often from L16); 8 = 7 + the R14 retunes (R14 below: L9, L101). A 2-7 link keeps its old board
export const SHAPE3_FROM = 16; // schedule 3 deals new boards from here on (L15 is the same board on 2 and 3)
// R11 fix round 1: the revision each curated board arrived in. A link names the oldest revision that plays the board it
// was made on (linkRev), so every link made before L7 was curated keeps opening the board it names. Below L15 both
// schedules deal the same boards (scripts/check-dare.mjs), so only a link from L15 on needs the schedule-2 digit
const SINCE = { 6: 3, 9: 6, 11: 3, 7: 4, 10: 6 };
export const SCHED_FROM = 15;
export const linkRev = (n) => (R14[n] ? 8 : n >= SHAPE3_FROM ? 7 : n >= SCHED_FROM ? 5 : R13[n] ? 7 : Math.max(3, CURATED[n] ? SINCE[n] : 3)); // L15: schedule 2 since 5, L16+: schedule 3 since 7, R13 opening 7, R14 retunes 8

const mk = (list) => list.map((c, i) => makeCat(i, c[1], c[0]));
const O = 'tabby', B = 'tuxedo', P = 'calico', G = 'gray';

// L9 "the big pair": blue goes first and the last blue sits at the foot of a staircase (orange, orange, pink, orange,
// each freeing the next): four cushions. The big green mother + kitten by the thumb is free all along, and parked
// it squats on TWO cushions until green comes last: 4 + 2 > 5, a proven loss from the moment it parks.
function bigPair(n) {
  const cats = mk([
    [O, [[2, 0], [3, 0]]], // 0 orange, free: the first step
    [O, [[2, 2], [2, 1]]], // 1 orange, held by 0
    [P, [[4, 2], [3, 2]]], // 2 pink, held by 1
    [O, [[4, 4], [4, 3]]], // 3 orange, held by 2
    [B, [[2, 4], [3, 4]]], // 4 the last blue, held by 3
    [B, [[0, 4], [0, 3]]], // 5 blue, free
    [B, [[3, 5], [4, 5], [5, 5]]], // 6 blue, free
    [P, [[2, 6], [2, 5]]], // 7 pink, held by 4
    [P, [[0, 6], [1, 6]]], // 8 pink, held by 7
    [G, [[3, 7], [2, 7], [1, 7]]], // 9 the green mother, free (the obvious park)
    [G, [[5, 7], [4, 7]]], // 10 her kitten
    [G, [[5, 1], [5, 2], [5, 3]]], // 11 green, held by 6 and the pair
  ]);
  cats[10].kittenOf = 9;
  const carriers = [{ color: 1, cap: 3 }, { color: 0, cap: 3 }, { color: 2, cap: 3 }, { color: 3, cap: 3 }];
  return makeBoard(6, 8, cats, { n, kind: 'normal', benchSize: 5, cur: 'pair', colors: 4, order: [5, 6, 0, 1, 2, 3, 4, 7, 8, 9, 11] }, carriers);
}

export const CURATED = {
  // L6 "last cushion": the last orange sleeps under a ladder of five cats (three blues, two pinks). Digging it out takes
  // all five cushions; the orange that comes out then fills its carrier, the blues hop in, the pinks follow: x5.
  // The trap: a green that wakes halfway (its carrier comes last); parked, it takes the cushion the ladder needs.
  6: () => {
    const cats = mk([
      [O, [[0, 7], [0, 6], [0, 5]]], // 0 orange, free
      [O, [[5, 6], [5, 7]]], // 1 orange, free
      [O, [[2, 7], [2, 6]]], // 2 the last orange, under the ladder
      [B, [[1, 5], [2, 5], [3, 5]]], // 3 ladder
      [P, [[3, 4], [2, 4], [1, 4]]], // 4 ladder
      [B, [[1, 3], [2, 3], [3, 3]]], // 5 ladder
      [P, [[3, 2], [2, 2], [1, 2]]], // 6 ladder
      [B, [[1, 1], [2, 1], [3, 1]]], // 7 ladder
      [P, [[4, 6], [3, 6]]], // 8 pink, behind the last orange
      [G, [[4, 7], [3, 7]]], // 9 green, behind the last orange
      [G, [[1, 7], [1, 6]]], // 10 green, under the ladder
      [G, [[5, 2], [4, 2]]], // 11 green, wakes when pink 6 leaves: the trap
    ]);
    for (const c of cats) c.cells = c.cells.map(([x, y]) => [x, y - 1]); // drawn on 8 rows, played on 7 (row 0 was empty)
    const carriers = [{ color: 0, cap: 3 }, { color: 1, cap: 3 }, { color: 2, cap: 3 }, { color: 3, cap: 3 }];
    return makeBoard(6, 7, cats, { n: 6, kind: 'normal', benchSize: 5, cur: 'cushion', colors: 4, order: [0, 1, 3, 4, 5, 6, 7, 2, 10, 8, 9, 11] }, carriers);
  },
  // L7 "warm-up" (R11 fix round 1, sol-r12-1 fun): a short consolidation board between the L6 and L8 lessons, so the
  // player gets a clean win. Three colours, nine cats. A blue and a pink sit on the last orange and a pink sits on another
  // orange: park them, the oranges fill their carrier and the parked blues and pinks hop in by themselves. The line peaks
  // at three cushions of five; a careless order can still fill the bench, and the rewind covers it
  7: () => {
    const cats = mk([
      [O, [[0, 6], [0, 5], [0, 4]]], // 0 orange, free
      [O, [[5, 6], [5, 5]]], // 1 orange, held by pink 8
      [O, [[2, 6], [2, 5]]], // 2 the last orange, held by blue 3 and pink 4
      [B, [[1, 3], [2, 3], [3, 3]]], // 3 blue, free
      [P, [[3, 1], [2, 1], [1, 1]]], // 4 pink, free
      [B, [[4, 5], [4, 4]]], // 5 blue, free
      [B, [[3, 6], [4, 6]]], // 6 blue, held by orange 1
      [P, [[1, 5], [1, 4]]], // 7 pink, held by blue 3
      [P, [[5, 1], [5, 0]]], // 8 pink, free (it sits on orange 1)
    ]);
    const carriers = [{ color: 0, cap: 3 }, { color: 1, cap: 3 }, { color: 2, cap: 3 }];
    return makeBoard(6, 7, cats, { n: 7, kind: 'normal', benchSize: 5, cur: 'warm', colors: 3, order: [0, 8, 1, 3, 4, 2, 5, 6, 7] }, carriers);
  },
  // L9 "the pair" (R12, sol-r12-3 fun): the pair's cost is the lesson, not a delayed loss. Blue goes first and the last
  // blue sits under a three-step staircase (orange, pink, orange): three cushions. Park the green mother + kitten early
  // and 2 + 3 still fits five seats, with one way through: dig only the staircase (the little green parked too is 6).
  // Leave the pair on the rug and there is room to spare. Row 6 stays empty for the pair's "2 seats" tag
  9: () => {
    const cats = mk([
      [P, [[0, 4], [1, 4]]], // 0 pink, held by orange 7
      [O, [[1, 1], [1, 0]]], // 1 orange, free: the first step
      [P, [[3, 1], [2, 1]]], // 2 pink, held by 1
      [O, [[3, 3], [3, 2]]], // 3 orange, held by 2
      [B, [[1, 3], [2, 3]]], // 4 the last blue, held by 3
      [B, [[5, 2], [5, 1]]], // 5 blue, free
      [B, [[4, 2], [4, 1]]], // 6 blue, free
      [O, [[2, 5], [2, 4]]], // 7 orange, held by the last blue
      [P, [[0, 5], [1, 5]]], // 8 pink, held by 7
      [G, [[3, 7], [2, 7], [1, 7]]], // 9 the green mother, free (the obvious park)
      [G, [[5, 7], [4, 7]]], // 10 her kitten
      [G, [[0, 3], [0, 2]]], // 11 the little green, free: parked with the pair it is one seat too many
    ]);
    cats[10].kittenOf = 9;
    const carriers = [{ color: 1, cap: 3 }, { color: 0, cap: 3 }, { color: 2, cap: 3 }, { color: 3, cap: 3 }];
    return makeBoard(6, 8, cats, { n: 9, kind: 'normal', benchSize: 5, cur: 'pair', colors: 4, order: [5, 6, 1, 2, 3, 4, 7, 0, 8, 9, 11] }, carriers);
  },
  // L10 "the big pair" (L9 until R12; a pre-R12 L9 link still opens it as L9, boardOf): the same seat rule, now tight.
  10: () => bigPair(10),
  // L11 "boards now": four stacks of sleeping cats; only the top cat of a stack can leave. The pinks go first and each
  // one sits under a different colour, so digging parks a few cats; a stack top that matches the front carrier never
  // needs a cushion. A lost bench here is meant to be undone: Take back nearly always leaves a cat that boards now
  // (curate-probe: "recoverable").
  11: () => {
    const v = (x, y, len) => Array.from({ length: len }, (_, i) => [x, y + len - 1 - i]); // a column cat facing up, head at y
    const cats = mk([
      [G, v(0, 0, 2)], // 0 stack 1 top
      [B, v(0, 2, 2)], // 1
      [O, v(0, 4, 3)], // 2
      [P, v(2, 0, 2)], // 3 stack 2: all pink, the cats that board now
      [P, v(2, 2, 2)], // 4
      [P, v(2, 4, 3)], // 5
      [B, v(3, 0, 2)], // 6 stack 3 top
      [O, v(3, 2, 2)], // 7
      [G, v(3, 4, 3)], // 8
      [G, v(5, 0, 2)], // 9 stack 4 top
      [O, v(5, 2, 2)], // 10
      [B, v(5, 4, 3)], // 11
    ]);
    const carriers = [{ color: 2, cap: 3 }, { color: 0, cap: 3 }, { color: 1, cap: 3 }, { color: 3, cap: 3 }];
    return makeBoard(6, 7, cats, { n: 11, kind: 'normal', benchSize: 5, cur: 'now', colors: 4, order: [3, 4, 5, 6, 7, 0, 1, 2, 9, 10, 11, 8] }, carriers);
  },
};

// R13 "highlight reel" (rev 7): the first session hooks instead of teaching. L1-L10 each show one new thing in 20-60 s
// with one line at most, and the session ends on a mini boss. L4, L8 (the dog) and L9 (the pair) keep their boards.
// Measured with scripts/curate-probe.mjs (random-play odds: scripts/check-core.mjs keeps L1-L8 at 25% or more).
const maskOf = (rows) => rows.join('').split('').map((c) => (c === '#' ? 1 : 0)); // '#' floor, '.' open air
const pair = (cats, kit, mom) => { cats[kit].kittenOf = mom; return cats; };
const car = (...cols) => cols.map((color) => ({ color, cap: 3 }));
const up = (x, y, len) => Array.from({ length: len }, (_, i) => [x, y + len - 1 - i]); // a column cat facing up, head at y
export const R13 = {
  // L1 "burst": nine oranges, all free, three carriers: every tap lands, quick taps bring the Purrfect popup
  1: () => {
    const cats = pair(mk([
      [O, [[0, 2], [0, 1]]], [O, [[1, 2], [1, 1]]], [O, [[2, 3], [2, 2], [2, 1]]], [O, [[3, 2], [3, 1]]], [O, [[4, 2], [4, 1]]],
      [O, [[2, 4], [1, 4], [0, 4]]], [O, [[4, 4], [3, 4]]], // 5 mother, 6 her kitten: two cats in one tap
      [O, [[1, 5], [0, 5]]], [O, [[2, 5], [3, 5], [4, 5]]],
    ]), 6, 5);
    return makeBoard(5, 6, cats, { n: 1, kind: 'normal', benchSize: 5, colors: 1, order: [0, 1, 2, 3, 4, 5, 7, 8] }, car(0, 0, 0));
  },
  // L2 "first hop": two blues lie on the oranges, so they park before the first carrier can fill; the blue carrier rolls
  // in and both hop in together (a forced x2). The last blue sleeps under an orange
  2: () => {
    const cats = mk([
      [B, [[1, 1], [0, 1]]], // 0 free
      [B, [[3, 1], [4, 1]]], // 1 free
      [O, up(0, 3, 3)], // 2 held by 0
      [O, up(2, 3, 3)], // 3 free
      [O, up(4, 3, 3)], // 4 held by 1
      [O, up(1, 2, 2)], // 5 held by 0
      [B, up(1, 4, 2)], // 6 the last blue, held by 5
      [O, up(3, 2, 2)], // 7 held by 1
      [O, up(3, 4, 2)], // 8 held by 7
    ]);
    return makeBoard(5, 6, cats, { n: 2, kind: 'normal', benchSize: 5, colors: 2, order: [3, 0, 2, 5, 1, 6, 4, 7, 8] }, car(0, 1, 0));
  },
  // L3 "heart": a small heart; the top cats slide out over the open air between the lobes. Orange mother + kitten first
  3: () => {
    const cats = pair(mk([
      [P, [[2, 0], [1, 0]]], // 0 free (slides over the gap)
      [B, [[4, 0], [5, 0]]], // 1 free
      [O, up(3, 1, 3)], // 2 orange mother, free
      [O, up(3, 4, 2)], // 3 her kitten
      [O, up(6, 1, 2)], // 4 free
      [B, up(1, 1, 3)], // 5 held by 0
      [P, up(2, 1, 4)], // 6 held by 0
      [B, up(5, 1, 3)], // 7 held by 1
      [P, up(4, 1, 4)], // 8 held by 1
    ]), 3, 2);
    const b = makeBoard(7, 6, cats, { n: 3, kind: 'normal', benchSize: 5, colors: 3, order: [2, 4, 1, 7, 0, 5, 6, 8] }, car(0, 1, 2));
    b.shape = { name: 'heart', mask: maskOf(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']) };
    return b;
  },
  // L5 "x3": three stacks, a blue on top of each orange: the orange carrier fills only after every blue parked, then the
  // blue carrier rolls in and all three hop in at once (a forced x3, the slow-mo chain); pinks parked meanwhile follow
  5: () => {
    const cats = mk([
      [B, up(0, 0, 2)], [O, up(0, 2, 2)], [P, up(0, 4, 3)],
      [B, up(2, 0, 2)], [O, up(2, 2, 3)], [P, up(2, 5, 2)],
      [B, up(4, 0, 2)], [O, up(4, 2, 2)], [P, up(4, 4, 3)],
    ]);
    return makeBoard(5, 7, cats, { n: 5, kind: 'normal', benchSize: 5, colors: 3, order: [0, 1, 3, 4, 6, 7, 2, 5, 8] }, car(0, 1, 2));
  },
  // L6: the R11 warm-up board (L7 until R13): free the oranges, the bench empties by itself
  6: () => { const b = CURATED[7](); b.meta.n = 6; return b; },
  // L7 "quilt": the bottom three rows are a folded quilt that opens after three cats leave
  7: () => {
    const cats = mk([
      [O, up(0, 1, 3)], // 0 free
      [B, up(1, 0, 3)], // 1 free
      [O, [[3, 0], [4, 0]]], // 2 free
      [B, up(3, 1, 3)], // 3 held by 2
      [P, up(4, 1, 3)], // 4 held by 2
      [O, up(5, 1, 3)], // 5 free
      [P, [[0, 4], [0, 5], [0, 6]]], // 6..11 under the quilt
      [G, [[1, 4], [1, 5], [1, 6]]],
      [G, [[2, 4], [3, 4], [4, 4]]], // 8 held by 9
      [B, [[5, 4], [5, 5], [5, 6]]],
      [P, [[2, 5], [2, 6]]],
      [G, [[3, 5], [3, 6]]],
    ]);
    const b = makeBoard(6, 7, cats, { n: 7, kind: 'normal', benchSize: 5, colors: 4, order: [0, 2, 5, 1, 3, 9, 4, 6, 10, 7, 8, 11] }, car(0, 1, 2, 3));
    const cells = [];
    for (let y = 4; y < 7; y++) for (let x = 0; x < 6; x++) cells.push([x, y]);
    b.folds = [{ side: 'bottom', cells, need: 3, cats: [6, 7, 8, 9, 10, 11] }];
    return b;
  },
  // L10 "mini boss": a cat-head board, fifteen cats (HP 15); the face is free, the chin waits under it, the ears hold the
  // cheeks. The gold chest and the boss card: src/game/boss.js MINI
  10: () => {
    const cats = mk([
      [O, up(0, 0, 2)], // 0 left ear, free
      [B, up(6, 0, 2)], // 1 right ear, free
      [P, up(0, 2, 2)], // 2 held by 0
      [G, up(0, 4, 2)], // 3 held by 2
      [O, up(6, 2, 4)], // 4 held by 1
      [B, up(1, 1, 3)], // 5..9 the face: free
      [B, up(2, 2, 2)],
      [P, up(3, 2, 2)],
      [O, up(4, 2, 2)],
      [O, up(5, 1, 3)],
      [O, up(1, 4, 3)], // 10..14 the chin, each held by the cat above
      [P, up(2, 4, 3)],
      [G, up(3, 4, 3)],
      [G, up(4, 4, 3)],
      [O, up(5, 4, 3)],
    ]);
    const b = makeBoard(7, 7, cats, { n: 10, kind: 'boss', benchSize: 5, colors: 4, order: [0, 8, 9, 1, 5, 6, 2, 7, 11, 3, 12, 13, 4, 10, 14] }, car(0, 1, 2, 3, 0));
    b.shape = { name: 'cathead', mask: maskOf(['#.....#', '##...##', '#######', '#######', '#######', '#######', '.#####.']) };
    return b;
  },
};

// R14 retunes (rev 8), each from an R13 playtest note; a 2-7 link keeps the board it was made on
export const R14 = {
  // L9 "the pair", fair before the L10 mini boss (random play 9% -> 36%): the last blue now faces the little green (it
  // parks for the whole level to free it) and a pink faces out (a free cat to park by mistake). Parked early the pair
  // still wins; parked on top of three careless cushions it loses later. Same cats, carriers and card
  9: () => {
    const b = CURATED[9]();
    for (const id of [4, 8]) { const c = b.cats[id]; c.cells.reverse(); c.dir = dirOfCells(c.cells); }
    b.meta.order = [5, 6, 11, 4, 1, 2, 3, 7, 0, 8, 9];
    return b;
  },
  // L101 padlock lesson: the blue carrier now comes before the purple one, so the key's blocker (a blue) boards instead
  // of parking: the hint's line opens the lock with 3 seats taken, not 4 of 5. Same cats, same lock and key
  101: () => {
    const b = generate(101, 3);
    [b.carriers[2], b.carriers[3]] = [b.carriers[3], b.carriers[2]];
    b.meta.order = [9, 4, 8, 13, 10, 12, 2, 1, 14, 6, 11, 0];
    return b;
  },
};

// the board a level plays: a curated one from the revision it arrived in on, else the generated one on the link's schedule
export function boardOf(n, rev = BOARD_REV) {
  if (rev >= 8 && R14[n]) return R14[n]();
  if (rev >= 7 && R13[n]) return R13[n]();
  if (n === 9 && rev >= 3 && rev < SINCE[9]) return bigPair(9); // a rev 3-5 L9 link: the old L9 (L10's board since R12)
  const f = CURATED[n] && rev >= SINCE[n] && CURATED[n];
  return f ? f() : generate(n, rev >= 7 ? 3 : rev >= 5 ? 2 : 1);
}
