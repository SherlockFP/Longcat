// House / street share card: a 4:5 picture of what the player just opened (a new floor of the Cat House, a shop on Cat
// Street) with the game's link burned in, so the picture still leads to the game when a chat app drops its caption.
// Drawn from the game's own art on a canvas; no network beyond the art files already served with the game.
import { FONT } from '../game/render.js';
import { assetUrl } from '../game/breeds.js';
import { IMG } from '../game/assets.js';

const W = 720;
const H = 900;
const NAVY = '#1d2b53';

function load(name) {
  const have = IMG['r7/' + name];
  if (have && have.complete && have.naturalWidth) return Promise.resolve(have);
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = assetUrl('r7/' + name + '.webp');
  });
}

function fit(ctx, s, px, max, weight = 700) {
  let size = px;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (size > 12 && ctx.measureText(s).width > max) { size -= 1; ctx.font = `${weight} ${size}px ${FONT}`; }
  return size;
}

// info: { title, sub, art: [{ name, x, y, h }] (centre x, foot y, height, in card px), tower?: floors built (the Cat
// House over its street: ground floor + lit floors, as on the hub), brand, url (shown), cta }
export async function houseCard(info) {
  const imgs = await Promise.all(info.art.map((a) => load(a.name)));
  const tw = info.tower ? await Promise.all(['building_base', 'floor_ground', 'floor_lit'].map(load)) : null;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  // a sunny sky over the street, a warm floor band
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#8fe3f0');
  sky.addColorStop(0.62, '#fff1d6');
  sky.addColorStop(1, '#ffd9a8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const [x, y, r] of [[120, 120, 46], [180, 105, 38], [560, 150, 52], [620, 138, 36]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#f4c58a';
  ctx.fillRect(0, 610, W, 40);
  // the house: the street behind it, then its floors stacked from the ground up
  if (tw && tw[0]) {
    const bg = tw[0];
    const bw = W;
    const bh = (bg.naturalHeight / bg.naturalWidth) * bw;
    ctx.drawImage(bg, 0, 650 - bh, bw, bh);
    const n = Math.max(1, info.tower);
    const fh = Math.min(170, 500 / n);
    const fw = fh * 2;
    const cx = info.towerX || W / 2;
    for (let i = 0; i < n; i++) {
      const im = i === 0 ? tw[1] : tw[2];
      if (!im) continue;
      ctx.save();
      ctx.shadowColor = 'rgba(40,20,5,0.3)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 5;
      ctx.drawImage(im, cx - fw / 2, 632 - fh * (i + 1) + i * fh * 0.03, fw, fh);
      ctx.restore();
    }
  }
  // the art, feet on the ground line
  info.art.forEach((a, i) => {
    const im = imgs[i];
    if (!im) return;
    const h = a.h;
    const w = (im.naturalWidth / im.naturalHeight) * h;
    ctx.drawImage(im, a.x - w / 2, a.y - h, w, h);
  });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // brand on top
  let sz = fit(ctx, info.brand, 52, W - 80);
  ctx.lineWidth = sz * 0.18;
  ctx.strokeStyle = NAVY;
  ctx.strokeText(info.brand, W / 2, 62);
  ctx.fillStyle = '#ffd43b';
  ctx.fillText(info.brand, W / 2, 62);
  // the news + the link, on a navy panel at the foot
  ctx.fillStyle = 'rgba(29,43,83,0.94)';
  ctx.beginPath();
  ctx.roundRect(24, 652, W - 48, H - 676, 30);
  ctx.fill();
  sz = fit(ctx, info.title, 40, W - 100);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(info.title, W / 2, 698);
  if (info.sub) { fit(ctx, info.sub, 26, W - 110, 600); ctx.fillStyle = '#fff6e5'; ctx.fillText(info.sub, W / 2, 744); }
  fit(ctx, info.cta, 24, W - 110, 600);
  ctx.fillStyle = '#9fe8e1';
  ctx.fillText(info.cta, W / 2, 790);
  sz = fit(ctx, info.url, 30, W - 140);
  const w = Math.min(W - 80, ctx.measureText(info.url).width + 44);
  ctx.beginPath();
  ctx.roundRect(W / 2 - w / 2, 812, w, sz + 26, (sz + 26) / 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ff5d8f';
  ctx.stroke();
  ctx.fillStyle = NAVY;
  ctx.fillText(info.url, W / 2, 812 + (sz + 26) / 2 + 1);
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  return blob ? { blob, ext: 'png', url: cv.toDataURL('image/jpeg', 0.85) } : null;
}
