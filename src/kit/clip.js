// Share clip: a deterministic re-render of the level's best moment. No frames are filmed while the player plays: the
// win keeps the board and the move list (Game.log), and an offscreen Game (fixed 360x640 CSS px at 2x = 720x1280,
// 9:16) replays it. Everything before the moment is fast-forwarded without drawing; then the setup taps (the nearly
// full bench), the chain tap and the cascade play at real speed with a tap ripple, a big chain counter and captions,
// and a short end card ("Can you beat it?") closes it. Reads with sound off. The dare's short link (text.url: the
// typeable core of the challenge code, kit/dare.js) is burned into the bottom band for the whole clip and big on the end
// card, so a file that loses its caption in a chat app still carries the exact board. MediaRecorder turns it into an MP4 /
// WebM; without one, Share hands over a PNG of the peak moment with the caption.
import { Game } from '../game/game.js';
import { FONT, drawPaw } from '../game/render.js';
import { drawQr } from './qr.js';

export const CLIP_W = 360;
export const CLIP_H = 640;
const DPR = 2;
const FPS = 30;
const TOP = 66; // caption band above the carriers (the counter, "4 of 5 seats taken!")
const BOT = 70; // brand band under the board ("Long Cat Out!" + the dare's short link, the whole clip)
const END = 2.2; // end card seconds
const NAVY = '#1d2b53';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isMove = (o) => o && (o.op === 'tap' || o.op === 'scoop');

// which moment to show: the biggest bench chain of the attempt (2+ parked cats hopping in on one tap), else the final
// clear. The window starts two moves earlier (the bench filling up), never across an undo or a bought seat.
export function planClip(log, won) {
  let p = -1;
  let best = 1;
  log.forEach((o, i) => { if (isMove(o) && o.b > best) { best = o.b; p = i; } });
  let kind = 'chain';
  if (p < 0) {
    if (!won) return null;
    kind = 'clear';
    for (let i = log.length - 1; i >= 0; i--) if (isMove(log[i])) { p = i; break; }
    if (p < 0) return null;
  }
  // up to four moves back; the player then fast-forwards the ones made while two or more seats were still free, so
  // the clip opens on "one seat left"
  let from = Math.max(0, p - 4);
  for (let i = p - 1; i >= from; i--) if (!isMove(log[i])) { from = i + 1; break; }
  return { from, peak: p, kind, n: kind === 'chain' ? best : 0 };
}

// src: { board, log, plan, text: { combo[], chainX(n), lastSeat, title, board, result, can, link, url, goal, bench(u, n), chain,
//   qr: the public https dare link the end card and the PNG carry as a scannable code (R11), scan: its caption } }
export function clipPlayer(src) {
  const { board, log, plan, text } = src;
  const cv = document.createElement('canvas');
  const g = new Game(cv, { size: { W: CLIP_W, H: CLIP_H, dpr: DPR, top: TOP, bottom: BOT } });
  g.texts = text.combo;
  g.chainText = text.chainX;
  g.lastSeatText = text.lastSeat;
  g.noStamp = true; // one chain caption only: the clip's top band counts the hops
  g.load(board);
  // the frame that is recorded: the game canvas copied with a punch-in, then the caption bands on top
  const out = document.createElement('canvas');
  out.width = CLIP_W * DPR;
  out.height = CLIP_H * DPR;
  const apply = (o) => {
    if (o.op === 'tap') { g.anims = g.anims.filter((a) => !(a.type === 'bonk' && a.id === o.id)); return g.tapCat(o.id); }
    if (o.op === 'scoop') return g.scoopCat(o.id);
    if (o.op === 'undo') return g.undoMove();
    if (o.op === 'seat') return g.heartsAdd();
    return null;
  };
  const tick = (dt) => {
    const rush = g.state.aliveCount === 0 ? 1.8 : 1; // as in play: nothing left to tap, the carriers wrap up faster
    const d = dt * rush * (g.chainSlow() ? 0.6 : 1);
    g.clock += d;
    g.update(d);
  };
  const settle = () => { for (let i = 0; i < 600 && (g.busy() || g.pending.length || g.anims.length); i++) tick(1 / 30); };
  const freeSeats = () => { const st = g.state; return st ? st.bench.filter((x) => x < 0).length : 9; };
  let from = plan.from;
  for (let i = 0; i < from; i++) { apply(log[i]); settle(); }
  // open on the tight bench: setup moves made with two or more free seats are skipped (the peak tap and the one
  // before it always play)
  while (from < plan.peak - 1 && freeSeats() > 1) { apply(log[from]); settle(); from++; }
  settle();
  g.parts = [];
  g.popups = [];
  // the window's moves at their own rhythm (gaps clamped so the setup never drags and the taps stay readable)
  const taps = [];
  let at = 0.8;
  let tightCap = null; // "Only ONE seat left!" once the bench is that tight
  let peakTap = null; // where the deciding tap lands: the camera punches in on it
  for (let i = from; i <= plan.peak; i++) {
    if (i > from) at += clamp(log[i].t - log[i - 1].t, 0.55, 1.1);
    taps.push({ at, o: log[i], peak: i === plan.peak });
  }
  const peakAt = at;
  let t = 0;
  let endAt = null;
  let peakSeen = null; // the clip time the full chain (or the clear) is on screen: the still / PNG frame
  const ripples = [];
  let counter = { k: 0, t: -9 };

  function step() {
    const dt = 1 / FPS;
    if (endAt == null) {
      // the tight-bench caption latches before each tap and holds through the deciding one (the logic state runs ahead
      // of the hops on screen), until the chain counter takes over
      const st = g.state;
      const used = st ? st.bench.filter((x) => x >= 0).length : 0;
      if (st && used >= st.benchSize - 1 && used > 0) tightCap = used === st.benchSize - 1 && text.oneSeat ? text.oneSeat : text.bench(used, st.benchSize);
      while (taps.length && t >= taps[0].at) {
        const x = taps.shift();
        const p = g.cellPos(x.o.id);
        apply(x.o);
        ripples.push({ x: p.x, y: p.y, t0: t });
        if (x.peak) peakTap = { x: p.x, y: p.y, t0: t };
      }
      tick(dt);
      const f = g.chainFx;
      if (f && f.k !== counter.k) counter = { k: f.k, t };
      if (peakSeen == null && t > peakAt && (plan.kind === 'chain' ? f && f.k >= plan.n && t - counter.t > 0.25 : t > peakAt + 0.7)) peakSeen = t;
      if (t > peakAt + 1 && ((!g.busy() && !g.pending.length && peakSeen != null && t - peakSeen > 0.9) || t > peakAt + 6)) endAt = t;
    }
    t += dt;
  }

  function fit(ctx, s, px, max, weight = 700) {
    let size = px;
    ctx.font = `${weight} ${size}px ${FONT}`;
    while (size > 10 && ctx.measureText(s).width > max) { size -= 1; ctx.font = `${weight} ${size}px ${FONT}`; }
    return size;
  }
  function label(ctx, s, x, y, px, fill, max = CLIP_W - 32, stroke = NAVY) {
    const size = fit(ctx, s, px, max);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.strokeStyle = stroke;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
    return size;
  }
  function pill(ctx, x, y, w, h, fill) {
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = NAVY;
    ctx.stroke();
  }

  // punch-in: the camera leans in on the deciding tap, slides down to the bench while its cushions empty, then eases
  // back out before the end card
  // the QR on a white card with a pink rim and its caption under it
  function drawQrCard(ctx, url, x, y, s, cap, room = CLIP_W - 60) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 6, s + 12, s + 12, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff5d8f';
    ctx.stroke();
    const ok = drawQr(ctx, url, x, y, s);
    ctx.restore();
    if (ok && cap) {
      const cx = x + s / 2;
      fit(ctx, cap, 14, room, 700);
      ctx.fillStyle = '#9fe8e1';
      ctx.fillText(cap, cx, y + s + 20);
    }
    return ok;
  }

  function zoom() {
    if (!peakTap) return { s: 1, x: 0, y: 0 };
    const u = t - peakTap.t0;
    const sm = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
    const lean = sm((u + 0.05) / 0.2);
    const m = sm((u - 0.5) / 0.4);
    const back = sm((t - (peakSeen != null ? peakSeen + 0.35 : peakTap.t0 + 3)) / 0.5);
    const s = 1 + (0.16 - 0.06 * m) * lean * (1 - back);
    return { s, x: peakTap.x + (CLIP_W / 2 - peakTap.x) * m, y: peakTap.y + (g.benchY - peakTap.y) * m };
  }

  function overlay() {
    let ctx = g.ctx;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // tap ripples: where the finger went (the trick has to be readable after one view)
    for (const r of ripples) {
      const u = (t - r.t0) / 0.6;
      if (u < 0 || u > 1) continue;
      ctx.save();
      ctx.globalAlpha = 1 - u;
      ctx.lineWidth = 5 * (1 - u) + 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(r.x, r.y, 10 + 30 * u, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (u < 0.5) drawPaw(ctx, r.x + 14, r.y + 16, 22, 1 - u * 2, '#ffffff');
    }
    // the world (board, ripples) onto the recorded frame through the punch-in
    const z = zoom();
    const o = out.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    if (z.s > 1.001) {
      const w = CLIP_W / z.s;
      const h = CLIP_H / z.s;
      const sx = z.x - z.x / z.s;
      const sy = z.y - z.y / z.s;
      o.drawImage(cv, sx * DPR, sy * DPR, w * DPR, h * DPR, 0, 0, out.width, out.height);
    } else o.drawImage(cv, 0, 0);
    ctx = o;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // top band: the bench before the move, then the chain counter counting up, hop by hop
    const st = g.state;
    const f = g.chainFx;
    const k = f ? f.k : 0;
    if (k >= 1 && plan.kind === 'chain') {
      const pop = t - counter.t < 0.25 ? 1 + 0.35 * (1 - (t - counter.t) / 0.25) : 1;
      ctx.save();
      ctx.translate(CLIP_W / 2, TOP / 2 + 6);
      ctx.scale(pop, pop);
      ctx.rotate(-0.04);
      pill(ctx, 0, 0, 230, 54, k >= plan.n ? '#ff5d8f' : '#ff8fb3');
      label(ctx, `${text.chain} x${k}`, 0, 2, 38, '#fff6e5', 210);
      ctx.restore();
    } else if (st) {
      const tight = !!tightCap;
      const s = tightCap || text.board;
      ctx.save();
      ctx.font = `700 22px ${FONT}`;
      const w = Math.min(CLIP_W - 24, ctx.measureText(s).width + 34);
      pill(ctx, CLIP_W / 2, TOP / 2 + 6, w, 40, tight ? '#ffd43b' : '#fffaf0');
      label(ctx, s, CLIP_W / 2, TOP / 2 + 7, 22, tight ? NAVY : NAVY, w - 22, 'rgba(0,0,0,0)');
      ctx.restore();
    }
    // bottom band: the brand and the dare's short link, always on (the link survives a chat app dropping the caption)
    ctx.save();
    ctx.fillStyle = 'rgba(29,43,83,0.9)';
    ctx.fillRect(0, CLIP_H - BOT + 6, CLIP_W, BOT - 6);
    label(ctx, text.title, CLIP_W / 2, CLIP_H - BOT + 24, 21, '#ffd43b');
    if (text.url) {
      const sz = fit(ctx, text.url, 15, CLIP_W - 44, 700);
      const w = Math.min(CLIP_W - 16, ctx.measureText(text.url).width + 22);
      ctx.beginPath();
      ctx.roundRect(CLIP_W / 2 - w / 2, CLIP_H - 32, w, sz + 11, (sz + 11) / 2);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      ctx.fillStyle = NAVY;
      ctx.fillText(text.url, CLIP_W / 2, CLIP_H - 32 + (sz + 11) / 2 + 1);
    } else {
      ctx.font = `600 15px ${FONT}`;
      ctx.fillStyle = '#fff6e5';
      ctx.fillText(text.board, CLIP_W / 2, CLIP_H - 18);
    }
    ctx.restore();
    // end card: the result, the dare (goal, board, seats), the link to that exact board, the name of the game
    if (endAt != null) {
      const u = clamp((t - endAt) / 0.35, 0, 1);
      ctx.save();
      ctx.globalAlpha = u;
      ctx.fillStyle = 'rgba(29,43,83,0.93)';
      ctx.fillRect(0, 0, CLIP_W, CLIP_H);
      ctx.translate(CLIP_W / 2, CLIP_H * (text.qr ? 0.19 : 0.25)); // R11: with the QR the block sits higher
      const s = 0.8 + 0.2 * u;
      ctx.scale(s, s);
      label(ctx, text.result, 0, 0, 54, '#ff8fb3', CLIP_W - 40, '#0e1630');
      label(ctx, text.can, 0, 64, 34, '#ffffff', CLIP_W - 40, '#0e1630');
      if (text.goal) { fit(ctx, text.goal, 19, CLIP_W - 48, 700); ctx.fillStyle = '#fff6e5'; ctx.fillText(text.goal, 0, 108); }
      fit(ctx, text.link, 17, CLIP_W - 48, 600);
      ctx.fillStyle = '#9fe8e1';
      ctx.fillText(text.link, 0, 156);
      if (text.url) {
        const sz = fit(ctx, text.url, 21, CLIP_W - 56, 700);
        const w = Math.min(CLIP_W - 20, ctx.measureText(text.url).width + 30);
        ctx.beginPath();
        ctx.roundRect(-w / 2, 176, w, sz + 22, 14);
        ctx.fillStyle = '#fffaf0';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ff5d8f';
        ctx.stroke();
        ctx.fillStyle = NAVY;
        ctx.fillText(text.url, 0, 176 + (sz + 22) / 2 + 1);
      }
      // R11: a phone that got the clip without its caption scans this to open the exact board (the typed code stays above)
      if (text.qr && drawQrCard(ctx, text.qr, -64, 232, 128, text.scan)) label(ctx, text.title, 0, 424, 30, '#ffd43b', CLIP_W - 40, '#0e1630');
      else label(ctx, text.title, 0, 262, 32, '#ffd43b', CLIP_W - 40, '#0e1630');
      ctx.restore();
    }
  }

  return {
    canvas: out,
    step,
    // the PNG fallback (the peak frame): the QR in the bottom-right corner above the brand band
    stampQr() {
      if (!text.qr) return;
      const o = out.getContext('2d');
      o.setTransform(DPR, 0, 0, DPR, 0, 0);
      o.textAlign = 'center';
      o.textBaseline = 'middle';
      const s = 104;
      drawQrCard(o, text.qr, CLIP_W - s - 14, CLIP_H - BOT - s - 30, s, text.scan, s + 20); // centred under the code, the caption stays 4 px inside the edge
    },
    draw() { g.draw(); overlay(); },
    get t() { return t; },
    // R11 fix 2: the clip's expected length (seconds), for the "Making video" progress: exact once the end is known
    get est() { return endAt != null ? endAt + END : peakAt + 2.4 + END; },
    get done() { return endAt != null && t >= endAt + END; },
    get peak() { return peakSeen; },
    get endAt() { return endAt; },
    // fast-forward (no drawing) to a clip time ('tap' = the punch-in on the deciding tap, 'peak' = the full chain on
    // screen, 'end' = the end card), then draw it
    seek(to) {
      for (let i = 0; i < 2000 && !this.done; i++) {
        if (to === 'tap' ? peakTap && t >= peakTap.t0 + 0.2 : to === 'peak' ? peakSeen != null : to === 'end' ? endAt != null && t >= endAt + 0.6 : t >= to) break;
        step();
      }
      this.draw();
      return t;
    },
  };
}

function pickType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const ty of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    try { if (MediaRecorder.isTypeSupported(ty)) return ty; } catch { /* old browser */ }
  }
  return null;
}
export const canRecord = () => !!pickType() && typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;

// the clip in real time through MediaRecorder; onFrame(canvas) sees every frame (the win card preview)
async function record(src, onFrame, alive) {
  const type = pickType();
  const p = clipPlayer(src);
  if (!type || !p.canvas.captureStream) return null;
  p.draw();
  const stream = p.canvas.captureStream(FPS);
  try {
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_500_000 });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const stopped = new Promise((res) => { rec.onstop = res; });
    rec.start();
    const t0 = performance.now();
    for (let i = 0; !p.done; i++) {
      if (!alive()) { rec.stop(); await stopped; return null; }
      p.step();
      p.draw();
      if (onFrame) onFrame(p.canvas, Math.min(0.99, p.t / p.est));
      const wait = t0 + ((i + 1) * 1000) / FPS - performance.now();
      await new Promise((r) => setTimeout(r, Math.max(0, wait)));
    }
    rec.stop();
    await stopped;
    const blob = new Blob(parts, { type: type.split(';')[0] });
    return blob.size ? { blob, ext: type.includes('mp4') ? 'mp4' : 'webm' } : null;
  } finally {
    stream.getTracks().forEach((x) => x.stop()); // also on a failed encode
  }
}

// one share clip per win: the preview on the card, the encode behind it, the PNG fallback
export function makeShareClip() {
  let src = null;
  let job = null;
  let done = null;
  let gen = 0;
  let png = null;
  let busy = false;
  let failed = false; // the encode gave nothing: Share clip falls back to the PNG
  return {
    set(s) { src = s; job = null; done = null; png = null; busy = false; failed = false; gen++; },
    clear() { src = null; job = null; done = null; png = null; busy = false; failed = false; gen++; },
    has: () => !!src,
    get src() { return src; },
    // preview canvas: the still of the peak (the moment the clip is about), drawn once
    start(cv) {
      if (!src || !cv) return;
      const p = clipPlayer(src);
      p.seek('peak');
      cv.width = 180;
      cv.height = 320;
      cv.getContext('2d').drawImage(p.canvas, 0, 0, 180, 320);
    },
    // the encode, only when the player asks for the clip (R11): real time through MediaRecorder, the frames play in the
    // preview canvas while it records (not under reduced motion), then the finished video loops in its place.
    // Resolves to the video ({ blob, ext }) or null.
    // onProg(0..1): how far the real-time encode is (the button counts up while the video is made)
    record(cv, still, onProg) {
      if (!src || !canRecord()) return Promise.resolve(null);
      if (job) return job;
      const mine = gen;
      const copy = (frame, f) => { if (!still && cv && cv.isConnected) cv.getContext('2d').drawImage(frame, 0, 0, cv.width, cv.height); if (onProg) onProg(f); };
      busy = true;
      job = record(src, copy, () => mine === gen).catch(() => null).then((r) => {
        if (mine !== gen) return null;
        busy = false;
        done = r;
        if (!r) failed = true;
        if (r && !still && cv && cv.isConnected && cv.parentNode) { // the finished clip loops in place of the frames
          const v = document.createElement('video');
          v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
          v.setAttribute('aria-hidden', 'true');
          v.className = 'clipvid';
          v.src = URL.createObjectURL(r.blob);
          v.addEventListener('loadeddata', () => { if (cv.isConnected) cv.replaceWith(v); }, { once: true });
          v.play().catch(() => {});
        }
        return r;
      });
      return job;
    },
    ready: () => done,
    encoding: () => busy,
    failed: () => failed,
    // the peak moment as a PNG with its caption (no MediaRecorder, or the video is not ready inside the tap)
    async png() {
      if (!src) return null;
      if (png) return png;
      const p = clipPlayer(src);
      p.seek('peak');
      p.stampQr();
      const blob = await new Promise((res) => p.canvas.toBlob(res, 'image/png'));
      png = blob ? { blob, ext: 'png' } : null;
      return png;
    },
    // QA: stills of the clip at given times (seconds, 'peak', 'end') as JPEG data URLs, in one fresh run
    frames(times) {
      if (!src) return null;
      const p = clipPlayer(src);
      return times.map((x) => {
        if (x !== 'png') return { at: +p.seek(x).toFixed(2), url: p.canvas.toDataURL('image/jpeg', 0.85) };
        const q = clipPlayer(src); // the PNG fallback: a fresh run to the peak, then its QR stamp
        const at = +q.seek('peak').toFixed(2);
        q.stampQr();
        return { at, url: q.canvas.toDataURL('image/jpeg', 0.85) };
      });
    },
  };
}

// share a file (with the text and the challenge link) when the platform can, else copy the link and download the file
// in the same tap (the copy first: the clipboard needs the tap's user activation, the download does not);
// returns 'shared' | 'saved' (link copied) | 'saved-nolink' (the clipboard write failed or is missing) | 'cancel'
export async function shareFile({ blob, ext }, name, text, url) {
  const file = typeof File !== 'undefined' ? new File([blob], `${name}.${ext}`, { type: blob.type }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], text: url ? `${text} ${url}` : text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancel';
    }
  }
  let copied = false;
  try {
    if (navigator.clipboard) { await navigator.clipboard.writeText(url ? `${text} ${url}` : text); copied = true; }
  } catch { /* no permission */ }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${name}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
  return copied ? 'saved' : 'saved-nolink';
}
