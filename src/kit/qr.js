// A small QR Code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1-10 (up to 213 bytes, far
// more than a dare link needs). No dependency: the clip's end card and its PNG fallback draw the dare URL as a code a
// second phone can scan. qrMatrix(text) -> { size, get(x, y) } (true = dark); drawQr() paints it with its quiet zone.
// scripts/check-dare.mjs compares the output with a reference encoder's matrix.

// level M, index = version
const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]; // EC codewords per block
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]; // EC blocks
const ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const MAXV = 10;

// GF(256), polynomial 0x11D
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsDivisor(deg) {
  const r = new Array(deg).fill(0);
  r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) { r[j] = mul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
    root = mul(root, 2);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = new Array(div.length).fill(0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    for (let i = 0; i < div.length; i++) r[i] ^= mul(div[i], f);
  }
  return r;
}

const rawModules = (v) => { let n = (16 * v + 128) * v + 64; if (v >= 2) { const a = Math.floor(v / 7) + 2; n -= (25 * a - 10) * a - 55; if (v >= 7) n -= 36; } return n; };
const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC[v] * BLOCKS[v];

function codewords(bytes) {
  let v = 1;
  for (; v <= MAXV; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(v) * 8) break;
  if (v > MAXV) return null;
  const cap = dataCodewords(v) * 8;
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // split into blocks, add each block's EC, interleave
  const nb = BLOCKS[v], ecl = ECC[v], raw = Math.floor(rawModules(v) / 8);
  const short = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = rsDivisor(ecl);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const d = data.slice(k, (k += shortLen - ecl + (i < short ? 0 : 1)));
    const ec = rsRemainder(d, div);
    if (i < short) d.push(0); // a placeholder so every block has the same length while interleaving
    blocks.push(d.concat(ec));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= short) out.push(b[i]); });
  return { v, out };
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(v, words, mask) {
  const n = v * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[v], last = al.length - 1;
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = () => { // level M = 0b00
    const d = mask;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, true);
  };
  format();
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) {
      const dark = ((b >>> i) & 1) === 1;
      const a = n - 11 + (i % 3), c = Math.floor(i / 3);
      set(a, c, dark); set(c, a, dark);
    }
  }
  // the data, in the two-column zigzag from the bottom right
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? n - 1 - vert : vert;
        if (fn[y][x] || i >= words.length * 8) continue;
        m[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
  const mk = MASKS[mask];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && mk(x, y)) m[y][x] = !m[y][x];
  return m;
}

// the standard penalty (runs, 2x2 blocks, finder look-alikes, dark balance): the lowest one is the easiest to scan
function penalty(m) {
  const n = m.length;
  let p = 0;
  const line = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        if (b < n && get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      for (let b = 0; b + 7 <= n; b++) { // 1:1:3:1:1 with 4 light modules on one side
        const pat = [1, 0, 1, 1, 1, 0, 1].every((v, k) => get(a, b + k) === !!v);
        if (!pat) continue;
        const lightBefore = [1, 2, 3, 4].every((k) => b - k < 0 || !get(a, b - k));
        const lightAfter = [7, 8, 9, 10].every((k) => b + k >= n || !get(a, b + k));
        if (lightBefore || lightAfter) p += 40;
      }
    }
  };
  line((a, b) => m[a][b]);
  line((a, b) => m[b][a]);
  for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

// text -> { size, get(x, y), version, mask } or null when it does not fit; mask: force one (tests), else the best
export function qrMatrix(text, mask = -1) {
  const bytes = new TextEncoder().encode(String(text));
  const cw = codewords(bytes);
  if (!cw) return null;
  let best = null, bestP = Infinity, bestK = 0;
  for (let k = 0; k < 8; k++) {
    if (mask >= 0 && k !== mask) continue;
    const m = build(cw.v, cw.out, k);
    const p = mask >= 0 ? 0 : penalty(m);
    if (p < bestP) { best = m; bestP = p; bestK = k; }
  }
  return { size: best.length, version: cw.v, mask: bestK, get: (x, y) => best[y][x] };
}

// paint the code at (x, y) with side `s` CSS px (quiet zone of 4 modules included, white card under it)
export function drawQr(ctx, text, x, y, s, { dark = '#1d2b53', light = '#ffffff' } = {}) {
  const q = qrMatrix(text);
  if (!q) return false;
  const n = q.size + 8;
  const u = s / n;
  ctx.save();
  ctx.fillStyle = light;
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = dark;
  for (let my = 0; my < q.size; my++) {
    for (let mx = 0; mx < q.size; mx++) {
      if (!q.get(mx, my)) continue;
      // whole-pixel edges, so neighbouring modules never leave a hairline seam
      const x0 = Math.round((x + (mx + 4) * u) * 4) / 4, y0 = Math.round((y + (my + 4) * u) * 4) / 4;
      const x1 = Math.round((x + (mx + 5) * u) * 4) / 4, y1 = Math.round((y + (my + 5) * u) * 4) / 4;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  ctx.restore();
  return true;
}
