// One-off design probe for the curated boards (src/core/curated.js): exhaustive random-play win odds, per first move,
// the fewest seats that win, the biggest bench chain. Usage: node scripts/curate-probe.mjs [n]
import { validateBoard, COLORS } from '../src/core/board.js';
import { compile, Sim, maxChain, searchWin } from '../src/core/search.js';
import { replay } from '../src/core/solver.js';
import { CURATED } from '../src/core/curated.js';

for (const n of process.argv[2] ? [+process.argv[2]] : Object.keys(CURATED).map(Number)) {
  const board = CURATED[n]();
  const errs = validateBoard(board);
  const B = board.meta.benchSize || 5;
  const C = compile(board);
  const memo = new Map();
  const sim = new Sim(C, B);
  const P = () => {
    if (sim.left === 0) return 1;
    const k = sim.key();
    if (memo.has(k)) return memo.get(k);
    const f = sim.free();
    let s = 0;
    for (const u of f) { s += sim.apply(u) ? P() : 0; sim.undo(); }
    const v = f.length ? s / f.length : 0;
    memo.set(k, v);
    return v;
  };
  const name = (u) => { const id = C.units[u]; const c = board.cats[id]; return `${id}:${COLORS[c.color]}${c.cells.length}`; };
  const first = sim.free().map((u) => { const ok = sim.apply(u); const p = ok ? P() : 0; sim.undo(); return `${name(u)}=${(p * 100).toFixed(0)}%`; });
  let seats = 0;
  for (let k = 0; k <= B; k++) if (searchWin(new Sim(compile(board), k), 200000, false) === 1) { seats = k; break; }
  const mc = maxChain(new Sim(compile(board), B), 400000);
  const rp = board.meta.order ? replay(board, board.meta.order) : null;
  console.log(`L${n} ${board.w}x${board.h} cats ${board.cats.length} errs ${errs.length ? errs.join(';') : 0} | random win ${(P() * 100).toFixed(1)}% states ${memo.size} | min seats ${seats} | max chain ${mc.best}${mc.complete ? '' : '?'} | line ${rp ? (rp.won ? 'won peak ' + rp.peak : 'LOST') : '-'}`);
  console.log('  first: ' + first.join('  '));
  // random playouts: how often the first lost bench is recoverable by Take back (undo the losing tap, a win remains)
  let fails = 0, back = 0, runs = 0, seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (; runs < 4000; runs++) {
    const s = new Sim(compile(board), B);
    let lost = false;
    while (s.left > 0) {
      const f = s.free();
      const u = f[Math.floor(rnd() * f.length)];
      if (!s.apply(u)) { lost = true; s.undo(); break; }
    }
    if (!lost) continue;
    fails++;
    if (searchWin(s, 20000, false) === 1) back++;
  }
  console.log(`  random playouts ${runs}: lost ${fails}, recoverable by Take back ${back} (${fails ? Math.round((back / fails) * 100) : 0}%)`);
}
