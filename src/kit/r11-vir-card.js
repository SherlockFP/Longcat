// R11 vir: the captioned QR dare card. A still picture that is ready the moment the win card opens (no recording):
// the dare in words, the peak moment of the run (or a cat of the level), a big QR of the production dare link, the
// typed short link under it. A chat app that drops the caption still carries the exact board: the QR stays readable
// when the picture is shown 360 px wide (4+ px per module), and the typed link is there for the same phone.
import { FONT } from '../game/render.js';
import { drawQr } from './qr.js';

export const CARD_W = 360;
export const CARD_H = 430;
const NAVY = '#1d2b53';

function fit(ctx, s, px, max, weight = 700) {
  let size = px;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (size > 11 && ctx.measureText(s).width > max) { size -= 1; ctx.font = `${weight} ${size}px ${FONT}`; }
  return size;
}
function label(ctx, s, x, y, px, fill, max, stroke = '#0e1630') {
  const size = fit(ctx, s, px, max);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeStyle = stroke;
  ctx.strokeText(s, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
}
// a headline on one line, or two when one would shrink it under 18 px
function headline(ctx, s, x, y, max) {
  ctx.font = `700 18px ${FONT}`;
  const words = s.split(' ');
  if (ctx.measureText(s).width <= max || words.length < 2) { label(ctx, s, x, y, 23, '#ffffff', max); return; }
  let best = 1, bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const w = Math.max(ctx.measureText(words.slice(0, i).join(' ')).width, ctx.measureText(words.slice(i).join(' ')).width);
    if (w < bestW) { bestW = w; best = i; }
  }
  label(ctx, words.slice(0, best).join(' '), x, y - 12, 21, '#ffffff', max);
  label(ctx, words.slice(best).join(' '), x, y + 13, 21, '#ffffff', max);
}

// info: { title (brand), head (the dare in words), goal (goal · board · seats), url (typed, no scheme), qr (full link),
//   scan (caption under the QR), still?: canvas (the 9:16 peak frame), art?: image (a cat head, no still) }
// -> { canvas (720 x 860), qr: { x, y, s } in CSS px of the 360 x 430 card }
export function dareCard(info, dpr = 2) {
  const cv = document.createElement('canvas');
  cv.width = CARD_W * dpr;
  cv.height = CARD_H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#2a3f7a');
  bg.addColorStop(1, NAVY);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.beginPath();
  ctx.roundRect(5, 5, CARD_W - 10, CARD_H - 10, 18);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ff5d8f';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  label(ctx, info.title, CARD_W / 2, 32, 28, '#ffd43b', CARD_W - 40);
  headline(ctx, info.head, CARD_W / 2, 72, CARD_W - 36);
  // the picture and the QR side by side (the QR alone, bigger, when there is no picture)
  let q;
  if (info.still || info.art) {
    const w = 120, h = 213, x = 20, y = 106;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fillStyle = '#fff3cf';
    ctx.fill();
    ctx.clip();
    if (info.still) ctx.drawImage(info.still, x, y, w, h);
    else { const s = w - 16; ctx.drawImage(info.art, x + 8, y + (h - s) / 2, s, s); }
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fffaf0';
    ctx.stroke();
    q = { x: 162, y: 112, s: 176 };
  } else q = { x: (CARD_W - 196) / 2, y: 108, s: 196 };
  ctx.beginPath();
  ctx.roundRect(q.x - 6, q.y - 6, q.s + 12, q.s + 12, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ff5d8f';
  ctx.stroke();
  drawQr(ctx, info.qr, q.x, q.y, q.s);
  fit(ctx, info.scan, 15, q.s + 16, 700);
  ctx.fillStyle = '#9fe8e1';
  ctx.fillText(info.scan, q.x + q.s / 2, q.y + q.s + 22);
  // the goal, then the typed link on a cream pill (what a friend types when the camera is the same phone)
  fit(ctx, info.goal, 17, CARD_W - 40, 700);
  ctx.fillStyle = '#fff6e5';
  ctx.fillText(info.goal, CARD_W / 2, 350);
  const sz = fit(ctx, info.url, 17, CARD_W - 52, 700);
  const pw = Math.min(CARD_W - 24, ctx.measureText(info.url).width + 26);
  ctx.beginPath();
  ctx.roundRect(CARD_W / 2 - pw / 2, 370, pw, sz + 16, (sz + 16) / 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  ctx.fillStyle = NAVY;
  ctx.fillText(info.url, CARD_W / 2, 370 + (sz + 16) / 2 + 1);
  return { canvas: cv, qr: q };
}
