// Drawing primitives: arc-length paths, patterned cat bodies, head sprites.
import { IMG, TONE, FACES } from './assets.js';
import { NAVY, COLOR_PAL, MYSTERY_PAL } from './breeds.js';

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---- arc-length path ----
// sharp right-angle corners become round bends (radius ~ half a cell) so bodies read as soft curvy cats
function roundCorners(pts) {
  const out = [pts[0]];
  const idx = [0];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (!l1 || !l2 || Math.abs(Math.atan2(cr, dot)) < 0.5) { idx.push(out.length); out.push(b); continue; }
    const r = Math.min(l1, l2) * 0.5;
    const p0 = [b[0] + (a[0] - b[0]) * (r / l1), b[1] + (a[1] - b[1]) * (r / l1)];
    const p1 = [b[0] + (c[0] - b[0]) * (r / l2), b[1] + (c[1] - b[1]) * (r / l2)];
    idx.push(out.length + 3);
    for (let k = 0; k <= 6; k++) {
      const u = k / 6, v = 1 - u;
      out.push([v * v * p0[0] + 2 * u * v * b[0] + u * u * p1[0], v * v * p0[1] + 2 * u * v * b[1] + u * u * p1[1]]);
    }
  }
  idx.push(out.length);
  out.push(pts[pts.length - 1]);
  return { out, idx };
}

export function makePath(pts) {
  let idx = null;
  if (pts.length > 2) ({ out: pts, idx } = roundCorners(pts));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  // marks[k] = arc length of the k-th input vertex (cell centre), kept true after corner rounding
  return { pts, cum, len: cum[cum.length - 1], marks: idx ? idx.map((i) => cum[i]) : cum };
}

// point + unit tangent at arc length s (clamped)
export function sample(path, s) {
  const { pts, cum } = path;
  s = Math.max(0, Math.min(path.len, s));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i];
  const segLen = cum[i] - cum[i - 1] || 1;
  const u = (s - cum[i - 1]) / segLen;
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, tx: (b[0] - a[0]) / segLen, ty: (b[1] - a[1]) / segLen };
}

function strokeSlice(ctx, path, a, b) {
  const { pts, cum } = path;
  const p0 = sample(path, a);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 0; i < pts.length; i++) if (cum[i] > a + 0.01 && cum[i] < b - 0.01) ctx.lineTo(pts[i][0], pts[i][1]);
  const p1 = sample(path, b);
  ctx.lineTo(p1.x + 0.001, p1.y);
  ctx.stroke();
}

// stroke a body window with the current width, narrowing to 80% over the last cell at the rump (path start)
let feltPat = null;
function strokeTaper(ctx, path, a, b, c) {
  const lw = ctx.lineWidth;
  const t = Math.min(b - a, c * 0.7);
  if (t < c * 0.2) { strokeSlice(ctx, path, a, b); return; }
  strokeSlice(ctx, path, a + t, b);
  const N = 4;
  for (let k = 0; k < N; k++) {
    ctx.lineWidth = lw * (0.8 + 0.2 * ((k + 1) / N));
    strokeSlice(ctx, path, a + (t * k) / N, a + (t * (k + 1)) / N + 0.5);
  }
  ctx.lineWidth = lw;
}

// ---- shapes ----
function heart(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.5, y - r * 0.1, x, y + r * 0.9);
  ctx.fill();
}
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
function cloud(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x - r * 0.6, y + r * 0.2, r * 0.55, 0, Math.PI * 2);
  ctx.arc(x + r * 0.6, y + r * 0.2, r * 0.55, 0, Math.PI * 2);
  ctx.arc(x, y - r * 0.15, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
}
export function disc(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// [start offset (cells), spacing (cells)] per pattern
function patGap(kind) {
  switch (kind) {
    case 'stripes': return [0.2, 0.42];
    case 'zigzag': return [0.2, 0.4];
    case 'dots': return [0.15, 0.32];
    case 'hearts': return [0.2, 0.5];
    case 'stars': return [0.2, 0.5];
    case 'clouds': return [0.22, 0.55];
    case 'spots': return [0.15, 0.42];
    case 'qmark': return [0.2, 0.55];
    default: return [1, 99];
  }
}

// ---- body ----
// Tail behind the rump: a tapering curve that bends to one side, white tip at the far end. Drawn before the
// body so its root hides under the round rump (never a knot over the fur).
function drawTail(ctx, path, a, o, rim = NAVY) {
  const { pal, w, c } = o;
  const p = sample(path, a);
  const bx = -p.tx, by = -p.ty; // backward along the body
  const nx = -by, ny = bx;
  const side = (o.seed || 0) % 2 ? 1 : -1;
  const bend = side * (0.75 + (o.wag || 0) * 0.55);
  const L = c * 0.62;
  const x0 = p.x, y0 = p.y;
  const cx = p.x + bx * L * 0.95, cy = p.y + by * L * 0.95;
  const ex = p.x + bx * L * 0.85 + nx * L * bend * 0.6, ey = p.y + by * L * 0.85 + ny * L * bend * 0.6;
  const N = 10;
  const pt = (u) => {
    const v = 1 - u;
    return [v * v * x0 + 2 * u * v * cx + u * u * ex, v * v * y0 + 2 * u * v * cy + u * u * ey];
  };
  const wid = (u) => w * (0.42 - 0.14 * u);
  ctx.lineCap = 'round';
  for (const pass of [0, 1, 2]) {
    for (let k = 0; k < N; k++) {
      const u0 = k / N, u1 = (k + 1) / N;
      if (pass === 2 && u0 < 0.7) continue;
      const [ax, ay] = pt(u0), [qx, qy] = pt(u1);
      ctx.strokeStyle = pass === 0 ? rim : pass === 1 ? pal.base : '#ffffff';
      ctx.lineWidth = wid(u1) + (pass === 0 ? (rim === NAVY ? 6 : 3) : 0);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(qx, qy);
      ctx.stroke();
    }
  }
}

// o: { pal (COLOR_PAL entry), c (cell px), w (body width px), alpha, glow, collar, seed, run (leg phase or null), wag (tail angle) }
// A chunky navy-outlined body: darker belly side, light back, bold per-colour pattern, legs while sprinting, a tail with a white tip.
export function drawBody(ctx, path, a, b, o) {
  const { pal, w, c } = o;
  const al = o.alpha ?? 1;
  const len = b - a;
  ctx.save();
  ctx.globalAlpha = al;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (o.glow) {
    ctx.strokeStyle = `rgba(255,214,59,${0.35 + 0.35 * o.glow})`;
    ctx.lineWidth = w + c * (0.35 + 0.2 * o.glow);
    strokeSlice(ctx, path, a, b);
  }
  // soft contact shadow down-left (one warm light from the upper right)
  const felt = !!IMG['r7/tex_felt'];
  const rim = felt ? shade(pal.base, -0.32) : NAVY;
  ctx.save();
  ctx.translate(-c * 0.05, c * 0.07);
  ctx.strokeStyle = felt ? 'rgba(60,30,10,0.25)' : 'rgba(20,40,70,0.22)';
  ctx.lineWidth = w + 6;
  strokeTaper(ctx, path, a, b, c);
  ctx.restore();

  if (len > c * 0.3) drawTail(ctx, path, a, o, rim);

  // little legs (behind the body) while sprinting: they stick out past the fur and swing
  if (o.run != null && len > c * 0.6) {
    const step = c * 0.7;
    let k = 0;
    for (let s = a + c * 0.3; s < b - c * 0.35; s += step, k++) {
      const p = sample(path, s);
      const nx = -p.ty, ny = p.tx;
      for (const sg of [-1, 1]) {
        const ph = Math.sin(o.run + k * 1.7 + (sg > 0 ? Math.PI : 0));
        const fx = p.x + nx * sg * w * 0.78 + p.tx * ph * c * 0.22;
        const fy = p.y + ny * sg * w * 0.78 + p.ty * ph * c * 0.22;
        for (const [col, lw] of [[rim, w * 0.3 + 4], [pal.base, w * 0.3]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(fx, fy);
          ctx.stroke();
        }
        ctx.fillStyle = '#fff6e5';
        disc(ctx, fx, fy, w * 0.13);
      }
    }
  }

  // rim, belly shade, fur lit from above; the rump tapers to 80% so the body reads as a cat, not a tube
  ctx.strokeStyle = rim;
  ctx.lineWidth = w + (felt ? 3 : 6);
  strokeTaper(ctx, path, a, b, c);
  ctx.strokeStyle = shade(pal.base, -0.16);
  ctx.lineWidth = w;
  strokeTaper(ctx, path, a, b, c);
  ctx.save();
  ctx.translate(-w * 0.04, -w * 0.08);
  ctx.strokeStyle = pal.base;
  ctx.lineWidth = w * 0.8;
  strokeTaper(ctx, path, a, b, c);
  ctx.restore();
  // felt: a soft fabric grain over the fur
  if (felt && len > c * 0.2) {
    if (!feltPat) feltPat = ctx.createPattern(IMG['r7/tex_felt'], 'repeat');
    if (feltPat) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = al * 0.5;
      ctx.strokeStyle = feltPat;
      ctx.lineWidth = w;
      strokeTaper(ctx, path, a, b, c);
      ctx.restore();
    }
  }
  // top highlight for a chunky look, plus a warm rim light on the upper-right edge
  ctx.save();
  ctx.translate(-w * 0.12, -w * 0.2);
  ctx.strokeStyle = pal.light;
  ctx.globalAlpha = al * 0.6;
  ctx.lineWidth = w * 0.2;
  strokeSlice(ctx, path, a + c * 0.1, Math.max(a + c * 0.15, b - c * 0.5));
  ctx.restore();
  if (felt) {
    ctx.save();
    ctx.translate(w * 0.3, -w * 0.3);
    ctx.strokeStyle = 'rgba(255,240,200,0.6)';
    ctx.globalAlpha = al;
    ctx.lineWidth = Math.max(1.2, w * 0.08);
    strokeSlice(ctx, path, a + c * 0.25, Math.max(a + c * 0.3, b - c * 0.3));
    ctx.restore();
  }

  // pattern, anchored to the body (offset from the tail), not to the path; bold so it reads at a glance
  ctx.fillStyle = pal.mark;
  ctx.strokeStyle = pal.mark;
  ctx.globalAlpha = al;
  const end = b - c * 0.36; // the head covers the rest
  const seed = o.seed || 0;
  const gap = patGap(pal.pat);
  let i = 0;
  for (let s = a + gap[0] * c; s < end; s += c * gap[1], i++) {
    const p = sample(path, s);
    const nx = -p.ty, ny = p.tx;
    const side = i % 2 ? 1 : -1;
    switch (pal.pat) {
      case 'stripes': {
        ctx.lineWidth = w * 0.2;
        const hw = w * 0.36;
        ctx.beginPath();
        ctx.moveTo(p.x - nx * hw, p.y - ny * hw);
        ctx.lineTo(p.x + nx * hw, p.y + ny * hw);
        ctx.stroke();
        break;
      }
      case 'dots':
        disc(ctx, p.x + nx * side * w * 0.18, p.y + ny * side * w * 0.18, w * (i % 3 === 0 ? 0.2 : 0.15));
        break;
      case 'hearts':
        heart(ctx, p.x + nx * side * w * 0.1, p.y + ny * side * w * 0.1, w * 0.27);
        break;
      case 'stars':
        star(ctx, p.x + nx * side * w * 0.1, p.y + ny * side * w * 0.1, w * 0.3);
        break;
      case 'clouds':
        cloud(ctx, p.x + nx * side * w * 0.1, p.y + ny * side * w * 0.1, w * 0.26);
        break;
      case 'spots': {
        const off = (i * 7 + seed) % 3 ? 0.17 : 0.04;
        disc(ctx, p.x + nx * side * w * off, p.y + ny * side * w * off, w * (0.13 + 0.05 * ((i + seed) % 3)));
        break;
      }
      case 'qmark':
        ctx.font = `700 ${w * 0.7}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', p.x, p.y + w * 0.03);
        break;
      default:
    }
  }
  if (pal.pat === 'zigzag' && len > c * 0.5) {
    // a bold zigzag running down the back (lengthwise, so it never reads as a direction arrow)
    ctx.lineWidth = w * 0.17;
    ctx.beginPath();
    let j = 0;
    for (let s = a - c * 0.05; s < end + c * 0.05; s += c * 0.2, j++) {
      const p = sample(path, s);
      const off = (j % 2 ? 1 : -1) * w * 0.24;
      ctx.lineTo(p.x - p.ty * off, p.y + p.tx * off);
    }
    ctx.stroke();
  }
  if (pal.pat === 'plain' && len > c * 0.8) {
    ctx.globalAlpha = al * 0.55;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = w * 0.26;
    strokeSlice(ctx, path, a + c * 0.5, Math.max(a + c * 0.55, b - c * 0.6));
  }
  ctx.globalAlpha = al;
  // kitten pairs: a thin collar with a gold bell right behind the head (pairs share the collar colour)
  if (o.collar && len > c * 0.6) {
    const s0 = Math.max(a, b - c * 0.56);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = w + 4;
    strokeSlice(ctx, path, s0 - c * 0.075, s0 + c * 0.075);
    ctx.strokeStyle = o.collar;
    ctx.lineWidth = w + 2;
    strokeSlice(ctx, path, s0 - c * 0.05, s0 + c * 0.05);
    ctx.lineCap = 'round';
    const p = sample(path, s0);
    ctx.fillStyle = NAVY;
    disc(ctx, p.x, p.y + w * 0.2, w * 0.19);
    ctx.fillStyle = '#ffd43b';
    disc(ctx, p.x, p.y + w * 0.2, w * 0.13);
  }
  ctx.restore();
}

// Two white front paws peeking out under the chin, on the side the cat faces. (ux, uy) = facing.
export function drawPaws(ctx, x, y, ux, uy, hs, alpha = 1) {
  const pos = Math.abs(ux) >= Math.abs(uy)
    ? [[Math.sign(ux) * 0.1, 0.4], [Math.sign(ux) * 0.36, 0.36]]
    : uy > 0 ? [[-0.17, 0.44], [0.17, 0.44]] : [[-0.3, 0.36], [0.3, 0.36]];
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [px, py] of pos) {
    const cx = x + px * hs, cy = y + py * hs;
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.ellipse(cx, cy, hs * 0.13, hs * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff8ec';
    ctx.beginPath();
    ctx.ellipse(cx, cy, hs * 0.1, hs * 0.073, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = Math.max(1, hs * 0.018);
    ctx.lineCap = 'round';
    for (const t of [-0.033, 0.033]) {
      ctx.beginPath();
      ctx.moveTo(cx + t * hs, cy - hs * 0.01);
      ctx.lineTo(cx + t * hs, cy + hs * 0.05);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Expression overlays on the head art (all heads share one face layout: eyes at (+-0.17, 0.05), mouth under the nose).
// mood: 0 excited (the art as is), 1 content (^ ^ and a small w mouth), 2 smug (half lids, smirk), 3 sleepy (heavy lids, tiny mouth)
const EYE_X = 0.17, EYE_Y = 0.05;
function eyePatch(ctx, size, ex, fur, top) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(ex * size, EYE_Y * size, size * 0.125, size * 0.135, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = fur;
  ctx.fillRect(ex * size - size * 0.2, EYE_Y * size - size * 0.2, size * 0.4, (top + 0.2 - EYE_Y) * size);
  ctx.restore();
}
function mouthPatch(ctx, size, muzzle) {
  ctx.fillStyle = muzzle;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.265, size * 0.13, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
}
function drawMood(ctx, size, mood, tone, wink) {
  const fur = tone.fur, muzzle = tone.muzzle;
  ctx.strokeStyle = NAVY;
  ctx.fillStyle = NAVY;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const lw = Math.max(1.5, size * 0.035);
  ctx.lineWidth = lw;
  const eyes = [-EYE_X, EYE_X];
  if (mood === 1 || wink) {
    for (const ex of eyes) {
      if (wink && mood !== 1 && ex < 0) continue;
      eyePatch(ctx, size, ex, fur, 0.2);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(ex * size, (EYE_Y + 0.06) * size, size * 0.075, 1.15 * Math.PI, 1.85 * Math.PI); // happy ^
      ctx.stroke();
    }
  } else if (mood === 2 || mood === 3) {
    const lid = mood === 2 ? 0.045 : 0.085;
    for (const ex of eyes) {
      eyePatch(ctx, size, ex, fur, lid);
      ctx.lineWidth = lw * 1.1;
      ctx.beginPath();
      if (mood === 2) {
        ctx.moveTo(ex * size - size * 0.115, lid * size);
        ctx.quadraticCurveTo(ex * size, (lid + 0.035) * size, ex * size + size * 0.115, lid * size);
      } else ctx.arc(ex * size, (lid - 0.05) * size, size * 0.11, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
  }
  if (mood === 1) {
    mouthPatch(ctx, size, muzzle);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(-size * 0.04, size * 0.2, size * 0.04, 0.1 * Math.PI, 0.95 * Math.PI);
    ctx.moveTo(size * 0.08, size * 0.2);
    ctx.arc(size * 0.04, size * 0.2, size * 0.04, 0.05 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  } else if (mood === 2) {
    mouthPatch(ctx, size, muzzle);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(-size * 0.07, size * 0.215);
    ctx.quadraticCurveTo(size * 0.02, size * 0.25, size * 0.09, size * 0.19);
    ctx.stroke();
  } else if (mood === 4) {
    // worried (fail card): droopy lids sloping down to the outside, a wobbly frown and a sweat drop
    for (const ex of eyes) {
      eyePatch(ctx, size, ex, fur, -0.02);
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      const s = Math.sign(ex);
      ctx.moveTo(ex * size - s * size * 0.1, -0.05 * size);
      ctx.lineTo(ex * size + s * size * 0.12, 0.0 * size);
      ctx.stroke();
      ctx.beginPath(); // brow, inner end raised
      ctx.moveTo(ex * size - s * size * 0.1, -0.13 * size);
      ctx.lineTo(ex * size + s * size * 0.1, -0.08 * size);
      ctx.stroke();
    }
    mouthPatch(ctx, size, muzzle);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(-size * 0.08, size * 0.27);
    ctx.quadraticCurveTo(-size * 0.04, size * 0.22, 0, size * 0.25);
    ctx.quadraticCurveTo(size * 0.04, size * 0.22, size * 0.08, size * 0.27);
    ctx.stroke();
    ctx.fillStyle = '#7fd3ff';
    ctx.lineWidth = Math.max(1.2, lw * 0.7);
    ctx.beginPath();
    const dx = size * 0.33, dy = -size * 0.2, r = size * 0.055;
    ctx.moveTo(dx, dy - r * 2.2);
    ctx.quadraticCurveTo(dx + r * 1.2, dy - r * 0.2, dx, dy + r);
    ctx.quadraticCurveTo(dx - r * 1.2, dy - r * 0.2, dx, dy - r * 2.2);
    ctx.fill();
    ctx.stroke();
  } else if (mood === 3) {
    mouthPatch(ctx, size, muzzle);
    ctx.fillStyle = '#e0607a';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.225, size * 0.03, size * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
  }
}

// Head sprite of a carrier color, upright (small lean only). o: { blink 0..1, twitch radians, mood 0..3, wink }
// r7 felt heads (happy / sleepy / cheeky, paws baked in): the variant comes from the cat id, a blink shows the sleepy face
export function head7(colorIdx, v = 0, blink = 0) {
  if (colorIdx < 0) return IMG.head7_mystery || null;
  const pal = COLOR_PAL[colorIdx];
  if (!pal) return null;
  const f = blink > 0.5 ? 'sleepy' : FACES[((v % 3) + 3) % 3];
  return IMG[`r7/cat_head_${pal.name}_${f}`] || null;
}

export function drawHead(ctx, colorIdx, x, y, ang, size, alpha = 1, o = null) {
  const pal = colorIdx < 0 ? MYSTERY_PAL : COLOR_PAL[colorIdx];
  const h7 = head7(colorIdx, o && o.v != null ? o.v : 0, o && o.blink);
  if (h7) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(ang + (o && o.twitch ? o.twitch : 0));
    const d = size * 1.16; // the felt heads carry their paws: a hair bigger than the v2 heads
    ctx.fillStyle = 'rgba(60,30,10,0.22)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.06, size * 0.18, size * 0.46, size * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(h7, -d / 2, -d / 2, d, d);
    ctx.restore();
    return;
  }
  const im = colorIdx < 0 ? IMG.head_mystery : IMG['v2/head_' + pal.name];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(ang + (o && o.twitch ? o.twitch : 0));
  ctx.fillStyle = 'rgba(20,40,70,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, size * 0.1, size * 0.4, size * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  if (im) ctx.drawImage(im, -size / 2, -size / 2, size, size);
  else {
    ctx.fillStyle = pal.base;
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const tone = TONE[colorIdx];
  if (im && tone && tone.fur && o && (o.mood || o.wink) && !(o.blink > 0.5)) drawMood(ctx, size, o.mood || 0, tone, o.wink);
  if (o && o.blink > 0) {
    // eyelids: a fur-colored patch over each eye with a closed-eye curve
    const fur = (tone && tone.fur) || pal.base;
    for (const ex of [-EYE_X, EYE_X]) {
      ctx.save();
      ctx.globalAlpha = alpha * Math.min(1, o.blink * 1.6);
      eyePatch(ctx, size, ex, fur, 0.2);
      ctx.restore();
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = Math.max(1.5, size * 0.035);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex * size, 0.02 * size, size * 0.085, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// A round badge with a color's fur pattern (carrier corner): colour-blind players match by pattern too.
export function drawPatBadge(ctx, pal, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = pal.base;
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pal.mark;
  ctx.strokeStyle = pal.mark;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.2;
  const m = r * 0.5;
  switch (pal.pat) {
    case 'stripes':
      for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(k * r, -m); ctx.lineTo(k * r, m); ctx.stroke(); }
      break;
    case 'zigzag':
      ctx.beginPath(); ctx.moveTo(-m, m * 0.6); ctx.lineTo(-m * 0.4, -m * 0.6); ctx.lineTo(m * 0.4, m * 0.6); ctx.lineTo(m, -m * 0.6); ctx.stroke();
      break;
    case 'dots': disc(ctx, -m * 0.5, -m * 0.3, r * 0.2); disc(ctx, m * 0.5, m * 0.1, r * 0.2); disc(ctx, -m * 0.1, m * 0.55, r * 0.17); break;
    case 'hearts': heart(ctx, 0, 0, r * 0.45); break;
    case 'stars': star(ctx, 0, 0, r * 0.62); break;
    case 'clouds': cloud(ctx, 0, 0, r * 0.5); break;
    case 'spots': disc(ctx, -m * 0.4, -m * 0.35, r * 0.26); disc(ctx, m * 0.5, m * 0.3, r * 0.2); break;
    case 'qmark': ctx.font = `700 ${r * 1.3}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, r * 0.06); break;
    default: ctx.beginPath(); ctx.moveTo(-m, 0); ctx.lineTo(m, 0); ctx.stroke(); // plain: one solid bar
  }
  ctx.restore();
}

// small chevron that shows which way a cat exits. ang: direction in radians (0 = right).
export function drawChevron(ctx, x, y, ang, size, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-size * 0.4, -size * 0.6);
  ctx.lineTo(size * 0.4, 0);
  ctx.lineTo(-size * 0.4, size * 0.6);
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = size * 0.62;
  ctx.stroke();
  ctx.strokeStyle = '#ffd43b';
  ctx.lineWidth = size * 0.32;
  ctx.stroke();
  ctx.restore();
}

export function drawArrow(ctx, x, y, ang, size, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffd43b';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.55);
  ctx.lineTo(size * 0.5, 0);
  ctx.lineTo(size * 0.18, 0);
  ctx.lineTo(size * 0.18, size * 0.5);
  ctx.lineTo(-size * 0.18, size * 0.5);
  ctx.lineTo(-size * 0.18, 0);
  ctx.lineTo(-size * 0.5, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

export function drawPaw(ctx, x, y, s, alpha, color = 'rgba(120,70,30,0.55)') {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.15, s * 0.28, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy] of [[-0.3, -0.18], [-0.1, -0.35], [0.1, -0.35], [0.3, -0.18]]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * s, y + dy * s, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- mechanics art (all procedural) ----
const ptsRound = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
};

const ptsRoundAdd = (ctx, x, y, w, h, r) => (ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h));

// "?" bubble over a hidden mystery cat
export function drawQuestion(ctx, x, y, size, pop = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  ctx.fillStyle = '#fff6e5';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = NAVY;
  ctx.font = `700 ${size * 0.72}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, size * 0.04);
  ctx.restore();
}

// small round count badge (dog zzz counter, thaw counter)
export function drawBadge(ctx, x, y, r, text, fill = '#7c5cff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${r * 1.15}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), 0, r * 0.06);
  ctx.restore();
}

// Frost over a frozen cat: a thin see-through ice coat (about 30% white) with a crisp rim, so the cat's own colour
// and pattern stay fully readable and the player can plan carriers around it. A few glints, a bigger cap on the head.
// crack 0..1: a chipped coat keeps a crack (1), a bonk flashes one that fades.
export function drawIce(ctx, path, a, b, w, c, head, hs, crack = 0, alpha = 1, tint = null) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const pts = [];
  for (const m of path.marks || []) if (m >= a - 0.5 && m <= b + 0.5) pts.push(sample(path, m));
  if (!pts.length) pts.push(sample(path, b));
  const half = c * 0.47;
  const H = Math.max(hs * 0.56, half);
  const cube = (x, y, r) => ptsRoundAdd(ctx, x - r, y - r, r * 2, r * 2, r * 0.38);
  const shape = () => {
    ctx.beginPath();
    for (const p of pts) cube(p.x, p.y, half);
    cube(head.x, head.y, H);
  };
  // one union fill so overlaps never double the frost
  shape();
  ctx.fillStyle = 'rgba(232,247,255,0.3)';
  ctx.fill();
  if (tint) { // the ice takes on the cat's colour, so a cat under 4 cubes still reads at a glance
    ctx.save();
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = tint;
    ctx.fill();
    ctx.restore();
  }
  // soft inner frost along the rim only (the middle stays clear)
  ctx.save();
  ctx.clip();
  shape();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = c * 0.16;
  ctx.stroke();
  ctx.restore();
  shape();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(70,150,210,0.95)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // glints: one on the head cap, one on every other cell
  const all = [[head.x, head.y, H]].concat(pts.filter((_, k) => k % 2 === 0).map((p) => [p.x, p.y, half]));
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineCap = 'round';
  all.forEach(([x, y, r]) => {
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.66, y - r * 0.2);
    ctx.lineTo(x - r * 0.66, y - r * 0.62);
    ctx.lineTo(x - r * 0.2, y - r * 0.62);
    ctx.stroke();
  });
  if (crack > 0) {
    ctx.globalAlpha = alpha * Math.min(1, crack);
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(head.x + H * 0.2, head.y - H * 0.95);
    ctx.lineTo(head.x - H * 0.06, head.y - H * 0.45);
    ctx.lineTo(head.x + H * 0.26, head.y - H * 0.1);
    ctx.lineTo(head.x - H * 0.04, head.y + H * 0.4);
    ctx.moveTo(head.x - H * 0.06, head.y - H * 0.45);
    ctx.lineTo(head.x - H * 0.5, head.y - H * 0.3);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; // white halo, then the dark crack: reads on any fur colour
    ctx.lineWidth = Math.max(4, hs * 0.11);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20,70,120,0.95)';
    ctx.lineWidth = Math.max(2, hs * 0.055);
    ctx.stroke();
  }
  ctx.restore();
}

// Yarn ball: pink wound ball with a loose thread. rot in radians.
export function drawYarn(ctx, x, y, r, rot = 0, alpha = 1) {
  const art = IMG['v2/obst_yarn'];
  if (art) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(20,40,70,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.45, r * 0.95, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(rot);
    const d = r * 2.75;
    try { ctx.filter = 'grayscale(1) brightness(1.3) contrast(1.1)'; } catch (e) { /* older engines keep the art colour */ } // no cat is white-grey: the ball never reads as a pink cat
    ctx.drawImage(art, -d / 2, -d / 2 - r * 0.05, d, d);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(20,40,70,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.28, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(rot);
  // thread
  ctx.lineCap = 'round';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = r * 0.34;
  ctx.beginPath();
  ctx.moveTo(r * 0.7, r * 0.55);
  ctx.bezierCurveTo(r * 1.35, r * 0.7, r * 1.1, r * 1.2, r * 1.5, r * 1.05);
  ctx.stroke();
  ctx.strokeStyle = '#ff5c93';
  ctx.lineWidth = r * 0.18;
  ctx.stroke();
  // ball
  ctx.fillStyle = '#ff6b9a';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(2.5, r * 0.17);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.5, 0, Math.PI * 2);
  ctx.clip();
  ctx.lineWidth = r * 0.13;
  for (const [k, col] of [[-0.55, '#ff9fc0'], [0.0, '#e0407a'], [0.55, '#ff9fc0']]) {
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * (0.5 + k * 0.5 + 0.35), k * 1.3 + 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.17, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// Sleeping (or awake) dog over two cells. a,b = centres of its two cells, c = cell size.
// o: { asleep, breathe 0..1, bob px, alpha, flip }
export function drawDog(ctx, ax, ay, bx, by, c, o = {}) {
  const asleep = o.asleep !== false;
  const al = o.alpha ?? 1;
  const mx = (ax + bx) / 2, my = (ay + by) / 2 + (o.bob || 0);
  const ang = Math.atan2(by - ay, bx - ax);
  const br = 1 + 0.035 * (o.breathe || 0);
  const art = IMG['v2/obst_puppy'];
  if (art) {
    // sprite is a sleeping puppy lying left-to-right: keep it upright on rows, lay it down on columns
    ctx.save();
    ctx.globalAlpha = al;
    ctx.translate(mx, my);
    ctx.fillStyle = 'rgba(20,40,70,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, c * 0.32, c * 0.95, c * 0.38, ang, 0, Math.PI * 2);
    ctx.fill();
    const vert = Math.abs(by - ay) > Math.abs(bx - ax);
    ctx.rotate(vert ? (by > ay ? -Math.PI / 2 : Math.PI / 2) : 0);
    if (!vert && ax > bx) ctx.scale(-1, 1);
    if (!asleep) ctx.translate(0, -c * 0.06);
    const d = c * 2.15;
    ctx.drawImage(art, -d / 2, -d / 2, d * (1 / br), d * br);
    // awake: the sprite sleeps, so open eyes (and a yawn) are drawn over its closed ones, in sprite space
    if (o.eyes) {
      for (const [ex, ey] of [[-0.129, -0.033], [0.066, -0.04]]) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = NAVY;
        ctx.lineWidth = Math.max(1.5, d * 0.014);
        ctx.beginPath();
        ctx.ellipse(ex * d, ey * d, d * 0.042, d * 0.05 * o.eyes, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = NAVY;
        ctx.beginPath();
        ctx.ellipse(ex * d + d * 0.006, ey * d + d * 0.006, d * 0.024, d * 0.03 * o.eyes, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        disc(ctx, ex * d + d * 0.014, ey * d - d * 0.008, d * 0.008);
      }
    }
    if (o.yawn > 0) {
      ctx.fillStyle = NAVY;
      ctx.beginPath();
      ctx.ellipse(-0.012 * d, 0.085 * d, d * 0.03, d * 0.045 * o.yawn, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8fa3';
      ctx.beginPath();
      ctx.ellipse(-0.012 * d, 0.1 * d, d * 0.018, d * 0.022 * o.yawn, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalAlpha = al;
  ctx.translate(mx, my);
  ctx.fillStyle = 'rgba(20,40,70,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, c * 0.3, c * 1.0, c * 0.4, ang, 0, Math.PI * 2);
  ctx.fill();
  // body: a fat pill along the two cells
  ctx.save();
  ctx.rotate(ang);
  ctx.scale(1, br);
  ctx.fillStyle = '#d9a066';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(3, c * 0.075);
  ptsRound(ctx, -c * 0.9, -c * 0.36, c * 1.8, c * 0.72, c * 0.36);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#b97a3c';
  ptsRound(ctx, -c * 0.3, -c * 0.34, c * 0.52, c * 0.3, c * 0.15);
  ctx.fill();
  ctx.fillStyle = '#fff6e5';
  ptsRound(ctx, c * 0.12, c * 0.08, c * 0.6, c * 0.2, c * 0.1);
  ctx.fill();
  // tail nub
  ctx.fillStyle = '#d9a066';
  ctx.beginPath();
  ctx.arc(c * 0.93, -c * 0.06, c * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // head at the first cell end, upright face
  const hx = (ax - mx) * 1.25;
  const hy = (ay - (ay + by) / 2) * 1.25 - c * 0.1;
  ctx.translate(hx, hy);
  ctx.fillStyle = '#e8b27a';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(3, c * 0.075);
  for (const sg of [-1, 1]) {
    ctx.fillStyle = '#9a5f2a';
    ctx.beginPath();
    ctx.ellipse(sg * c * 0.31, -c * 0.08 + (asleep ? c * 0.08 : 0), c * 0.14, c * 0.24, sg * (asleep ? 0.2 : 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#e8b27a';
  ctx.beginPath();
  ctx.arc(0, 0, c * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff6e5';
  ctx.beginPath();
  ctx.ellipse(0, c * 0.1, c * 0.17, c * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.ellipse(0, c * 0.05, c * 0.06, c * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(2, c * 0.05);
  ctx.lineCap = 'round';
  for (const sg of [-1, 1]) {
    if (asleep) {
      ctx.beginPath();
      ctx.arc(sg * c * 0.12, -c * 0.07, c * 0.07, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else {
      ctx.fillStyle = NAVY;
      ctx.beginPath();
      ctx.arc(sg * c * 0.12, -c * 0.07, c * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export const FONT = '"Fredoka","Baloo 2",ui-rounded,"Segoe UI",system-ui,sans-serif';
