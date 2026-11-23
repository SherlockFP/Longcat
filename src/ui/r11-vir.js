// R11 vir (Sol fix 6): the dare link is the primary share. Dare a friend sends text + the production https link in one
// tap (main.js doShare); next to it the captioned QR card (kit/r11-vir-card.js) is a picture ready at once; the video is
// the optional third share and starts recording in the background when the win card opens (at 360x640 on a slow
// device), so it is usually ready by the time it is tapped.
// State: save.data.vir = { slow: 1 } once a recording could not keep real time (the next ones record at 360x640).
import { t } from '../i18n.js';
import { save } from '../kit/save.js';
import { track } from '../kit/analytics.js';
import { shareFile, canRecord } from '../kit/clip.js';
import { dareCard } from '../kit/r11-vir-card.js';
import { qrMatrix } from '../kit/qr.js';
import { IMG } from '../game/assets.js';
import * as r10 from '../game/r10.js';

const QR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 3.5h6v6h-6zM14.5 3.5h6v6h-6zM3.5 14.5h6v6h-6z" fill="none" stroke-width="2.4"/><path d="M5.6 5.6h1.8v1.8H5.6zM16.6 5.6h1.8v1.8h-1.8zM5.6 16.6h1.8v1.8H5.6zM14 14h3v3h-3zM17.5 17.5h3v3h-3zM18 14h2.5v2.5H18zM14 18h2.5v2.5H14z" stroke="none"/></svg>';
// the QR card button: a round button beside Dare a friend on every win card that offers a dare
// R11 fix round 1 (sol-r12-1 virality): its name is printed on it ("Share card"), so the link, the picture and the video
// read as three different things
export const cardBtn = () => `<button class="round vircard" data-act="sharecard" aria-label="${t('virCardBtn')}" title="${t('virCardBtn')}">${QR_SVG}<i class="vcap" aria-hidden="true">${t('virCardBtn')}</i></button>`;

const vir = () => save.data.vir || (save.data.vir = {});
// the background recording's resolution: 360x640 on a device that looks slow or was slow last time, else 720x1280
export function clipDpr() {
  const n = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  return vir().slow || n <= 4 || mem <= 3 ? 1 : 2;
}

let ctx = null; // main.js: { S, clip, winDare, dareText, dareUrl, shortUrl, qrUrl, goalLine, peek, makeClip, ui }
let card = { token: -1, png: null, info: null };

function cardInfo() {
  const { S, clip } = ctx;
  const d = ctx.winDare();
  const still = clip.has() ? clip.peakCanvas(1) : null;
  const art = still ? null : IMG['r7/cat_head_' + ctx.peek() + '_happy'];
  return { d, title: t('title'), head: ctx.dareText(d), goal: ctx.goalLine(d), url: ctx.shortUrl(d), qr: ctx.qrUrl(d), scan: t('clipScan'), still, art: art && art.complete && art.naturalWidth ? art : null, token: S.winToken };
}
// the card for this win, drawn once (the win card prepares it in the background, a tap only waits if it did not)
async function cardPng() {
  if (card.token === ctx.S.winToken && card.png) return card.png;
  const info = cardInfo();
  const { canvas } = dareCard(info);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (info.token !== ctx.S.winToken) return null;
  card = { token: info.token, png: blob ? { blob, ext: 'png' } : null, info };
  return card.png;
}

// the win card opened (main.js clipPreview, one frame after it mounted): the QR card, then the video in the background
export function onWinCard() {
  if (!ctx) return;
  const token = ctx.S.winToken;
  const live = () => token === ctx.S.winToken && ctx.ui.screen === 'win';
  setTimeout(() => { if (live()) cardPng().catch(() => {}); }, 150);
  const { clip } = ctx;
  if (!clip.has() || !canRecord()) return;
  // after the card's pop-in and the coin flight: the replay is a second game running at 30 fps
  setTimeout(() => {
    if (!live() || clip.ready() || clip.encoding() || clip.failed()) return;
    track('clip_bg', { dpr: clip.src && clip.src.dpr });
    Promise.resolve(ctx.makeClip(true)).then((r) => {
      if (r && r.lag > 1.25 && r.dpr > 1 && !vir().slow) { vir().slow = 1; save.commit(); track('clip_slow', { lag: Math.round(r.lag * 100) }); }
    });
  }, 700);
}

export function init(c) {
  ctx = c;
  return {
    // the QR card: one tap, the picture with the dare text and link (copied + saved where the browser has no share sheet)
    async sharecard() {
      const { S, ui } = ctx;
      if (S.sharing) return;
      S.sharing = true;
      try {
        const d = ctx.winDare();
        r10.noteSent(save.data, d.i);
        save.commit();
        const text = ctx.dareText(d);
        const url = ctx.dareUrl(d);
        S.lastShare = { text, url, clip: false, card: true, moment: S.moment || '' };
        track('share_tap_card');
        const f = await cardPng();
        if (!f) return;
        const how = await shareFile(f, `long-cat-out-${d.k === 'l' ? 'level-' + d.n : 'challenge'}`, text, url);
        track('share_done_' + how);
        track('dare_handoff', { i: d.i, via: 'card', how });
        if (how === 'saved') ui.toast(t('cardSaved'));
        else if (how === 'saved-nolink') ui.shareSheet({ title: t('shareDareBtn'), goal: ctx.goalLine(d), url, text, copied: false });
      } finally { S.sharing = false; }
    },
  };
}

// QA: can a phone read the QR when the picture is shown `width` px wide (smoothing + a JPEG pass, like a chat app)?
// Samples every module centre: { mod: px per module, err: share of wrong modules, v: QR version }
async function probe(canvas, cssW, rect, text, width, q = 0.7) {
  const k = width / cssW;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((canvas.height * width) / canvas.width);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, c.width, c.height);
  const im = new Image();
  await new Promise((res) => { im.onload = res; im.src = c.toDataURL('image/jpeg', q); });
  g.drawImage(im, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const m = qrMatrix(text);
  const u = rect.s / (m.size + 8);
  let bad = 0;
  for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) {
    const sx = Math.floor((rect.x + (x + 4.5) * u) * k), sy = Math.floor((rect.y + (y + 4.5) * u) * k);
    const i = (sy * c.width + sx) * 4;
    const dark = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11 < 128;
    if (dark !== m.get(x, y)) bad++;
  }
  return { mod: +(u * k).toFixed(2), err: +(bad / (m.size * m.size)).toFixed(4), v: m.version };
}
export const qaHooks = () => ({
  virCard: async () => { const f = await cardPng(); return f && { size: f.blob.size, type: f.blob.type, url: card.info.qr, head: card.info.head, still: !!card.info.still, img: URL.createObjectURL(f.blob) }; },
  virCardShot: async () => { const info = cardInfo(); return dareCard(info).canvas.toDataURL('image/jpeg', 0.9); },
  // the QR card at 360 px wide, the clip's end card recorded at 360x640 (a slow device) and at 720x1280 forwarded at 360
  async virQrProbe() {
    const info = cardInfo();
    const cd = dareCard(info);
    const out = { card: await probe(cd.canvas, 360, cd.qr, info.qr, 360) };
    for (const dpr of [1, 2]) {
      const e = ctx.clip.endFrame(dpr);
      if (e) out['end' + dpr] = await probe(e.canvas, 360, e.qr, e.url, 360, 0.6);
    }
    return out;
  },
  virDpr: () => clipDpr(),
});
