// R11 fun lane (sol-r11-3 fix 4): Take back rewinds to the latest position the solver proves winnable, not just one
// move. Pure, no DOM: the board controller (src/game/r11-fun.js) and the session sim (scripts/r11-fun-session.mjs) share it.
import { solveFrom } from './solver.js';

// The position k moves back, as a read-only probe built from the undo stack (the live state is not touched).
export function peekBack(state, k) {
  const s = state.undo[state.undo.length - k];
  if (!s) return null;
  const bench = s.bench.slice();
  while (bench.length < state.benchSize) bench.push(-1); // seats bought on a continue stay, as on a real undo
  return { ...state, ...s, bench, undo: [] };
}

// How many moves to take back to reach the latest position the solver proves winnable: 1..undo.length, or 0 when no
// position on the stack is proven within the budget (the caller then falls back to one move, with no promise).
export function winnableBack(state, budget = 6000, maxK = 40) {
  const top = Math.min(state.undo.length, maxK);
  for (let k = 1; k <= top; k++) {
    const p = peekBack(state, k);
    if (!p || p.failed) continue;
    if (solveFrom(p, budget).order) return k;
  }
  return 0;
}

// The moves still on the undo stack, oldest first, rebuilt from a move log ({ op: 'tap' | 'scoop' | 'undo' | 'seat', id }):
// a tap or scoop pushes, an undo pops, a bought seat changes nothing. moves[moves.length - k] is the move a k-step
// rewind takes back first in time (the tap that cost the win).
export function movesOnStack(log) {
  const out = [];
  for (const o of log) {
    if (o.op === 'tap' || o.op === 'scoop') out.push(o);
    else if (o.op === 'undo') out.pop();
  }
  return out;
}
