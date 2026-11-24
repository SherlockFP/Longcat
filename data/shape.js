// Shaped boards (shape lane): the play area as a heart, a paw print, a fish... Each shape is an inside-test over the
// board's box in [-1, 1] x [-1, 1] (y down), sampled at the cell centres, so one shape fits every size tier.
// Void cells are open air: no cat or dog sits there, a cat's way out slides straight over them (src/core/shape.js).
const sq = (v) => v * v;
const inEll = (X, Y, cx, cy, rx, ry) => sq((X - cx) / rx) + sq((Y - cy) / ry) <= 1;

export const SHAPES = {
  heart: (X, Y) => {
    const x = X * 1.12, y = -Y * 1.18 + 0.12;
    return Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y <= 0;
  },
  cathead: (X, Y) => {
    if (inEll(X, Y, 0, 0.16, 1.04, 0.9)) return true;
    const t = (Y + 1.08) / 0.62; // ears: two triangles over the head, wide at the bottom
    return t >= 0 && t <= 1 && Math.abs(Math.abs(X) - 0.6) <= 0.5 * t;
  },
  diamond: (X, Y) => Math.abs(X) + Math.abs(Y) <= 1.28,
  plus: (X, Y) => Math.abs(X) <= 0.56 || Math.abs(Y) <= 0.48,
  donut: (X, Y) => X * X + Y * Y <= 1.5 && !(Math.abs(X) < 0.3 && Math.abs(Y) < 0.26),
  hourglass: (X, Y) => Math.abs(X) <= 0.42 + 0.75 * Math.abs(Y),
  stairs: (X, Y) => (X + 1) / 2 + (1 - (Y + 1) / 2) * 0.9 <= 1.42 || Y > 0.3, // an L of steps climbing to the right
  fish: (X, Y) => {
    if (inEll(X, Y, 0, -0.25, 0.95, 0.74)) return true;
    return Y > 0.38 && Math.abs(X) <= (Y - 0.3) * 1.35; // the tail fans out at the bottom
  },
  paw: (X, Y) => {
    if (inEll(X, Y, 0, 0.36, 0.82, 0.66)) return true;
    for (const [cx, cy] of [[-0.66, -0.2], [-0.25, -0.64], [0.25, -0.64], [0.66, -0.2]]) if (inEll(X, Y, cx, cy, 0.38, 0.36)) return true;
    return false;
  },
  star: (X, Y) => {
    const a = Math.atan2(X, -(Y - 0.08)); // one point straight up
    const r = Math.hypot(X, Y - 0.08);
    const k = (((a / (2 * Math.PI)) * 5) % 1 + 1) % 1; // 0 at a point, 0.5 between two
    const tri = Math.abs(k - 0.5) * 2; // 1 at a point, 0 in the notch
    return r <= 0.74 + 0.56 * tri;
  },
  // R13 (schedule 3): three more rooms
  house: (X, Y) => (Y >= -0.15 && Math.abs(X) <= 0.86) || (Y < -0.15 && Math.abs(X) <= (Y + 1.12) * 0.95), // a roof over a box
  cloud: (X, Y) => inEll(X, Y, -0.48, 0.22, 0.56, 0.62) || inEll(X, Y, 0.48, 0.22, 0.56, 0.62) || inEll(X, Y, 0, -0.24, 0.62, 0.74) || (Math.abs(X) <= 0.8 && Y >= 0.1 && Y <= 0.78),
  mushroom: (X, Y) => (Y <= 0.12 && inEll(X, Y, 0, 0.12, 1.05, 1.1)) || (Y > 0.12 && Math.abs(X) <= 0.5),
};

// gentle shapes keep most of the box (first meetings), the bold ones carve more out, boss boards get the showpieces
export const GENTLE = ['heart', 'cathead', 'diamond', 'donut'];
export const BOLD = ['heart', 'cathead', 'paw', 'fish', 'plus', 'hourglass', 'stairs', 'donut', 'diamond', 'star'];
export const BOSS = ['star', 'cathead', 'paw', 'heart', 'fish'];
export const BOLD3 = [...BOLD, 'house', 'cloud', 'mushroom']; // schedule 3 (src/core/shape.js shapeFor3)

export const SHAPE_FROM = 16; // the first shaped board (a heart)
export const FOLD_FROM = 22; // the first board with a folded flap
