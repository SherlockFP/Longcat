// Hand-made campaign boards in the early run (sol-r11-2 fun finding): three boards in levels 5-15, each built around one
// bench decision the generated boards only reach by luck. L6 and L11 are 6x7, so their one-line idea card never sits on
// a row of cats on a 667px phone. generate(n) is untouched: a dare link of the older token
// (v1, or the leading 2) still opens the generated board it was made on (boardOf(n, rev)), new links carry rev 3.
// Measured with scripts/curate-probe.mjs (exhaustive: random-play odds, odds per first move, fewest seats, best chain).
import { makeCat, makeBoard } from './board.js';
import { generate } from './generate.js';

export const BOARD_REV = 5; // the newest board revision (kit/dare.js token digit): 5 = the R11x schedule (generate.js SCHED 2:
// bosses, shaped boards, folded quilts); 2, 3 and 4 (made before it) keep the schedule-1 board
// R11 fix round 1: the revision each curated board arrived in. A link names the oldest revision that plays the board it
// was made on (linkRev), so every link made before L7 was curated keeps opening the board it names. Below L15 both
// schedules deal the same boards (scripts/check-dare.mjs), so only a link from L15 on needs the schedule-2 digit
const SINCE = { 6: 3, 9: 3, 11: 3, 7: 4 };
export const SCHED_FROM = 15;
export const linkRev = (n) => (n >= SCHED_FROM ? BOARD_REV : Math.max(3, CURATED[n] ? SINCE[n] : 3));

const mk = (list) => list.map((c, i) => makeCat(i, c[1], c[0]));
const O = 'tabby', B = 'tuxedo', P = 'calico', G = 'gray';

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
  // L9 "the big pair": blue goes first and the last blue sits at the foot of a staircase (orange, orange, pink, orange,
  // each freeing the next): four cushions. The big green mother + kitten by the thumb is free all along, and parked
  // it squats on TWO cushions until green comes last: 4 + 2 > 5, a proven loss from the moment it parks.
  9: () => {
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
    return makeBoard(6, 8, cats, { n: 9, kind: 'normal', benchSize: 5, cur: 'pair', colors: 4, order: [5, 6, 0, 1, 2, 3, 4, 7, 8, 9, 11] }, carriers);
  },
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

// the board a level plays: a curated one from the revision it arrived in on, else the generated one on the link's schedule
export function boardOf(n, rev = BOARD_REV) {
  const f = CURATED[n] && rev >= SINCE[n] && CURATED[n];
  return f ? f() : generate(n, rev >= 5 ? 2 : 1);
}
