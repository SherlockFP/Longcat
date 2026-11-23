// Board data model. Pure, no DOM.
// board = { w, h, cats: [cat], meta }
// cat   = { id, cells: [[x,y]...] (tail first, HEAD LAST), dir: 'U'|'R'|'D'|'L', breed, kittenOf? }
// color = index into COLORS (== index into BREEDS: color i is shown as breed BREEDS[i]).
// board.carriers = [{color, cap}] queue order (front first); cap is 3 except hand-made tutorials.
// board.objs = [{kind:'dog'|'yarn', cells}] non-cat blockers (dog = 2 cells, yarn = 1). They sit on the grid as -2-index.
// cat.mech = 'mystery' | 'frozen' | 'spring' | 'swivel' (optional, never on a kitten or its mother).
// id === index in board.cats.
// A kitten (kittenOf = parent id) has its head directly behind the parent's tail,
// continuing the parent's line: kittenHead = parentTail - (parent.cells[1] - parent.cells[0]).

import { floorCount, isVoid } from './shape.js'; // shape lane: board.shape (void cells), board.folds

export const DIRS = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
export const DIR_KEYS = ['U', 'R', 'D', 'L'];
export const BREEDS = ['tabby', 'tuxedo', 'calico', 'gray', 'siamese', 'cream', 'ginger', 'black'];

export const COLORS = ['orange', 'blue', 'pink', 'green', 'purple', 'mint', 'yellow', 'red'];

export function dirKey(dx, dy) {
  for (const k of DIR_KEYS) {
    if (DIRS[k][0] === dx && DIRS[k][1] === dy) return k;
  }
  return null;
}

// Facing = direction of the last body step.
export function dirOfCells(cells) {
  const n = cells.length;
  const a = cells[n - 2];
  const b = cells[n - 1];
  return dirKey(b[0] - a[0], b[1] - a[1]);
}

export function makeCat(id, cells, breed, kittenOf) {
  const cat = { id, cells, dir: dirOfCells(cells), breed, color: BREEDS.indexOf(breed) };
  if (kittenOf !== undefined && kittenOf !== null) cat.kittenOf = kittenOf;
  return cat;
}

export const MECH_CATS = ['mystery', 'frozen', 'spring', 'swivel']; // spring / swivel: src/core/content-mech.js
export const OBJ_KINDS = ['dog', 'yarn'];

export function makeBoard(w, h, cats, meta = {}, carriers = []) {
  return { w, h, cats, meta, carriers, objs: [] };
}

export const headOf = (cat) => cat.cells[cat.cells.length - 1];
export const tailOf = (cat) => cat.cells[0];

export function filledCells(board) {
  let s = 0;
  for (const c of board.cats) s += c.cells.length;
  return s;
}

export function fillRatio(board) {
  return filledCells(board) / floorCount(board); // a shaped board counts its floor only
}

// Returns a list of error strings (empty = valid).
export function validateBoard(board) {
  const errs = [];
  const { w, h, cats } = board;
  const seen = new Map();
  cats.forEach((cat, i) => {
    if (cat.id !== i) errs.push(`cat index ${i} has id ${cat.id}`);
    if (!BREEDS.includes(cat.breed)) errs.push(`cat ${i} bad breed ${cat.breed}`);
    if (cat.cells.length < 2) errs.push(`cat ${i} shorter than 2`);
    cat.cells.forEach(([x, y], k) => {
      if (x < 0 || y < 0 || x >= w || y >= h) errs.push(`cat ${i} cell ${x},${y} outside board`);
      const key = x + ',' + y;
      if (seen.has(key)) errs.push(`cell ${key} used by cats ${seen.get(key)} and ${i}`);
      seen.set(key, i);
      if (k > 0) {
        const p = cat.cells[k - 1];
        if (Math.abs(p[0] - x) + Math.abs(p[1] - y) !== 1) errs.push(`cat ${i} cells not contiguous at ${k}`);
      }
    });
    if (cat.cells.length >= 2 && cat.dir !== dirOfCells(cat.cells)) errs.push(`cat ${i} dir mismatch`);
  });
  cats.forEach((c) => {
    if (c.mech == null) return;
    if (!MECH_CATS.includes(c.mech)) errs.push(`cat ${c.id} bad mech ${c.mech}`);
    if (c.kittenOf != null || cats.some((k) => k.kittenOf === c.id)) errs.push(`cat ${c.id} is in a kitten pair and has a mechanic`);
  });
  (board.objs || []).forEach((o, i) => {
    if (!OBJ_KINDS.includes(o.kind)) errs.push(`obj ${i} bad kind ${o.kind}`);
    if (o.cells.length !== (o.kind === 'dog' ? 2 : 1)) errs.push(`obj ${i} (${o.kind}) has ${o.cells.length} cells`);
    o.cells.forEach(([x, y], k) => {
      if (x < 0 || y < 0 || x >= w || y >= h) errs.push(`obj ${i} cell ${x},${y} outside board`);
      const key = x + ',' + y;
      if (seen.has(key)) errs.push(`cell ${key} used by ${seen.get(key)} and obj ${i}`);
      seen.set(key, 'obj' + i);
      if (k > 0 && Math.abs(o.cells[0][0] - x) + Math.abs(o.cells[0][1] - y) !== 1) errs.push(`obj ${i} cells not adjacent`);
    });
  });
  const kidCount = new Map();
  for (const cat of cats) {
    if (cat.kittenOf == null) continue;
    const p = cats[cat.kittenOf];
    if (!p) {
      errs.push(`kitten ${cat.id} parent missing`);
      continue;
    }
    if (p.kittenOf != null) errs.push(`kitten ${cat.id} parent is itself a kitten`);
    if (p.breed !== cat.breed) errs.push(`kitten ${cat.id} breed differs from parent`);
    kidCount.set(p.id, (kidCount.get(p.id) || 0) + 1);
    if (p.cells.length >= 2) {
      const dx = p.cells[1][0] - p.cells[0][0];
      const dy = p.cells[1][1] - p.cells[0][1];
      const kh = headOf(cat);
      if (kh[0] !== p.cells[0][0] - dx || kh[1] !== p.cells[0][1] - dy) errs.push(`kitten ${cat.id} head not behind parent tail`);
      if (cat.dir !== dirKey(dx, dy)) errs.push(`kitten ${cat.id} not facing parent tail`);
    }
  }
  for (const [id, n] of kidCount) if (n > 1) errs.push(`cat ${id} has ${n} kittens`);
  cats.forEach((c) => {
    if (c.color !== BREEDS.indexOf(c.breed)) errs.push(`cat ${c.id} color/breed mismatch`);
    if (c.kittenOf != null && cats[c.kittenOf] && cats[c.kittenOf].color !== c.color) errs.push(`kitten ${c.id} color differs from parent`);
  });
  const need = new Map();
  for (const c of cats) need.set(c.color, (need.get(c.color) || 0) + 1);
  const cap = new Map();
  for (const c of board.carriers || []) cap.set(c.color, (cap.get(c.color) || 0) + (c.cap || 3));
  // shape lane: nothing sits on a void cell; a flap holds whole mother + kitten pairs and opens after >= 1 cat
  for (const c of cats) if (c.cells.some(([x, y]) => isVoid(board, x, y))) errs.push(`cat ${c.id} on a void cell`);
  for (const o of board.objs || []) if (o.cells.some(([x, y]) => isVoid(board, x, y))) errs.push(`${o.kind} on a void cell`);
  if (board.shape && board.shape.mask.length !== w * h) errs.push('shape mask size');
  (board.folds || []).forEach((f, k) => {
    if (!(f.need >= 1)) errs.push(`fold ${k} need ${f.need}`);
    const set = new Set(f.cells.map(([x, y]) => x + ',' + y));
    for (const id of f.cats) {
      const c = cats[id];
      if (!c) { errs.push(`fold ${k} cat ${id} missing`); continue; }
      if (!c.cells.every(([x, y]) => set.has(x + ',' + y))) errs.push(`fold ${k} cat ${id} not fully under the flap`);
      const mate = c.kittenOf != null ? c.kittenOf : cats.findIndex((o) => o.kittenOf === id);
      if (mate >= 0 && !f.cats.includes(mate)) errs.push(`fold ${k} splits the pair of cat ${id}`);
    }
    for (const c of cats) if (!f.cats.includes(c.id) && c.cells.some(([x, y]) => set.has(x + ',' + y))) errs.push(`fold ${k} covers cat ${c.id} it does not hold`);
  });
  for (const col of new Set([...need.keys(), ...cap.keys()])) {
    if ((need.get(col) || 0) !== (cap.get(col) || 0)) errs.push(`color ${col}: ${need.get(col) || 0} cats vs carrier capacity ${cap.get(col) || 0}`);
  }
  return errs;
}
