// R11 appeal (Sol fix 2): a crowded 7x9 showcase board, every colour on a long run, an L bend, a zigzag and an S bend,
// so the shaped bodies and their wrapped markings can be judged at phone size (dev / QA only: window.__qa.appealBoard).
import { BREEDS, makeCat, makeBoard } from '../core/board.js';

const CATS = [
  [2, [[3, 3], [3, 2], [3, 1], [3, 0], [2, 0], [1, 0], [0, 0]]], // pink hearts, long L
  [1, [[6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [5, 0], [4, 0]]], // blue dots, long L
  [3, [[0, 6], [0, 5], [0, 4], [0, 3], [0, 2], [0, 1]]], // green zigzag, long straight
  [0, [[1, 1], [2, 1], [2, 2], [1, 2], [1, 3], [2, 3], [2, 4]]], // orange tabby, tight zigzag
  [4, [[4, 1], [5, 1], [5, 2], [4, 2], [4, 3], [5, 3]]], // purple stars, S bend
  [5, [[1, 8], [1, 7], [1, 6], [1, 5], [1, 4]]], // mint clouds, straight
  [6, [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [6, 6], [6, 7], [6, 8]]], // yellow spots, long L
  [7, [[3, 4], [4, 4], [5, 4]]], // red plain, short
  [3, [[2, 8], [2, 7], [2, 6], [3, 6], [4, 6], [5, 6]]], // green, L
  [2, [[3, 8], [3, 7], [4, 7], [5, 7]]], // pink, L
  [1, [[4, 8], [5, 8]]], // blue, two cells
  [4, [[0, 8], [0, 7]]], // purple, two cells
];

export function appealBoard() {
  const cats = CATS.map(([col, cells], i) => makeCat(i, cells, BREEDS[col]));
  return makeBoard(7, 9, cats, { n: 0, kind: 'normal', benchSize: 5 }, [{ color: 2, cap: 3 }, { color: 1, cap: 3 }, { color: 3, cap: 3 }]);
}
