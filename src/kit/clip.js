// Share clip: a rolling low-res copy of the board (~1.9 s ring) keeps the moment before the best bench chain of the
// level (the setup tap and the nearly full bench, so the chain reads as a rescue) and ~3 s after it. The win card
// loops those frames as the share preview right away (no encode needed); Share hands over a WebM made by a
// MediaRecorder on a canvas captureStream, or an animated-strip PNG without one.
const FPS = 10;
const BEFORE = 19; // frames kept before the moment
const AFTER = 30; // frames recorded after it (the chain plays in slow motion)
const OUT_W = 240; // ~300 KB a frame, ~49 frames kept
const POOL = 16;
const TOP = 30; // title strip
const BOT = 44; // caption strip: "Chain x3!" + level

export function makeClip(source) {
  let ring = [];
  let best = null; // { score, frames, after, keep: Set }
  let crop = null;
  let job = null; // the encode promise for the current best
  let done = null; // its result once finished (Share can then hand it over inside the tap)
  let pool = [];

  const recycle = (f) => { if (pool.length < POOL && (!best || !best.keep.has(f))) pool.push(f); };

  // copy the board region of the game canvas into a small frame (reusing a pooled canvas of the same size)
  function grab() {
    const c = source.canvas;
    const r = crop || { x: 0, y: 0, w: c.width, h: c.height };
    const w = OUT_W;
    const h = Math.round((OUT_W * r.h) / r.w);
    let f = pool.pop();
    if (!f || f.width !== w || f.height !== h) {
      f = document.createElement('canvas');
      f.width = w;
      f.height = h;
    }
    f.getContext('2d').drawImage(c, r.x, r.y, r.w, r.h, 0, 0, w, h);
    return f;
  }

  return {
    // a new level: forget everything; crop = the belt + bench + board, in canvas pixels
    reset(rect) {
      ring = [];
      best = null;
      job = null;
      done = null;
      crop = rect;
    },
    // leaving play: let the frames go
    drop() {
      ring = [];
      best = null;
      job = null;
      done = null;
      pool = [];
    },
    // the canvas was resized (rotation, URL bar): new crop; frames of the old size are dropped from the ring
    setCrop(rect) {
      if (!crop || (rect.w === crop.w && rect.h === crop.h && rect.y === crop.y)) { crop = crop && rect; return; }
      crop = rect;
      ring = [];
      pool = [];
    },
    // called ~10x a second while the level runs (and while the chain after the win is still recording)
    tick() {
      if (!crop || crop.w <= 0 || crop.h <= 0 || !source.canvas.width) return; // hidden tab / zero-size viewport
      const f = grab();
      if (best && best.after > 0) {
        best.frames.push(f);
        best.keep.add(f);
        best.after--;
      }
      ring.push(f);
      if (ring.length > BEFORE) recycle(ring.shift());
    },
    get recording() {
      return !!(best && best.after > 0);
    },
    // a chain happened: keep it when it beats the best one of the level
    mark(score) {
      if (best && score <= best.score) return;
      const old = best;
      const frames = ring.slice();
      best = { score, frames, after: AFTER, keep: new Set(frames), at: frames.length };
      if (old) for (const f of old.frames) if (!ring.includes(f)) recycle(f);
      job = null;
      done = null;
    },
    get score() {
      return best ? best.score : 0;
    },
    has() {
      return !!(best && best.frames.length >= 4);
    },
    // loop the moment on a canvas (the win card preview); reduced motion shows one still. Returns stop().
    play(cv, overlay, still = false) {
      if (!best || !best.frames.length || !cv) return () => {};
      const fr = best.frames;
      cv.width = fr[0].width;
      cv.height = fr[0].height + TOP + BOT;
      if (still) { paint(cv, fr[Math.min(fr.length - 1, best.at + 12)], overlay); return () => {}; }
      let i = 0;
      const hold = 8;
      const step = () => {
        if (!cv.isConnected) return stop();
        paint(cv, fr[Math.min(i, fr.length - 1)], overlay);
        i = (i + 1) % (fr.length + hold);
      };
      step();
      const id = setInterval(step, 1000 / FPS);
      function stop() { clearInterval(id); }
      return stop;
    },
    // encode the best moment; resolves to { blob, ext } or null
    encode(overlay) {
      if (!best || best.after > 0 || !best.frames.length) return Promise.resolve(null);
      if (!job) {
        const mine = (job = encode(best.frames, overlay).catch(() => null));
        mine.then((r) => { if (job === mine) done = r; });
      }
      return job;
    },
    // the finished encode, or null while it is still running
    ready() {
      return done;
    },
    // no MediaRecorder: an animated strip as one PNG, four moments of the chain side by side
    async png(overlay) {
      if (!best || !best.frames.length) return null;
      const fr = best.frames;
      const picks = [0, 1, 2, 3].map((k) => fr[Math.min(fr.length - 1, Math.max(0, best.at - 4) + k * Math.max(1, Math.floor((fr.length - best.at + 4) / 4)))]);
      const one = document.createElement('canvas');
      one.width = fr[0].width;
      one.height = fr[0].height + TOP + BOT;
      const cv = document.createElement('canvas');
      cv.width = one.width * 4 + 3 * 6;
      cv.height = one.height;
      const g = cv.getContext('2d');
      g.fillStyle = '#1d2b53';
      g.fillRect(0, 0, cv.width, cv.height);
      picks.forEach((f, k) => {
        paint(one, f, overlay);
        g.drawImage(one, k * (one.width + 6), 0);
      });
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      return blob ? { blob, ext: 'png' } : null;
    },
  };
}

// one output frame: title strip, the board, then the caption ("Chain x3!" and the level)
function paint(cv, frame, overlay) {
  const g = cv.getContext('2d');
  g.fillStyle = '#1fb3aa';
  g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(frame, 0, TOP);
  g.fillStyle = '#1d2b53';
  g.fillRect(0, 0, cv.width, TOP);
  g.fillRect(0, cv.height - BOT, cv.width, BOT);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd43b';
  g.font = '700 17px Fredoka, sans-serif';
  g.fillText(overlay.title, cv.width / 2, TOP / 2 + 1);
  g.font = '700 22px Fredoka, sans-serif';
  const bw = g.measureText(overlay.badge).width;
  g.font = '600 15px Fredoka, sans-serif';
  const lw = g.measureText(overlay.level).width;
  const x0 = cv.width / 2 - (bw + 12 + lw) / 2;
  const y = cv.height - BOT / 2 + 1;
  g.textAlign = 'left';
  g.font = '700 22px Fredoka, sans-serif';
  g.fillStyle = '#ff8fb3';
  g.fillText(overlay.badge, x0, y);
  g.font = '600 15px Fredoka, sans-serif';
  g.fillStyle = '#fff6e5';
  g.fillText(overlay.level, x0 + bw + 12, y + 1);
}

function pickType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* old browser */ }
  }
  return null;
}

async function encode(frames, overlay) {
  const type = pickType();
  const cv = document.createElement('canvas');
  cv.width = frames[0].width;
  cv.height = frames[0].height + TOP + BOT;
  if (!type || !cv.captureStream) return null;
  const stream = cv.captureStream(FPS);
  try {
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1_200_000 });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; });
    paint(cv, frames[0], overlay);
    rec.start();
    const hold = Math.round(FPS * 0.8); // the last frame stays up a moment so the chain reads
    for (let i = 0; i < frames.length + hold; i++) {
      paint(cv, frames[Math.min(i, frames.length - 1)], overlay);
      await new Promise((r) => setTimeout(r, 1000 / FPS));
    }
    rec.stop();
    await done;
    const blob = new Blob(parts, { type: type.split(';')[0] });
    return blob.size ? { blob, ext: type.includes('mp4') ? 'mp4' : 'webm' } : null;
  } finally {
    stream.getTracks().forEach((t) => t.stop()); // also on a failed encode
  }
}

// share a file when the platform can, else download it; returns 'shared' | 'saved' | 'cancel'
export async function shareFile({ blob, ext }, name, text) {
  const file = typeof File !== 'undefined' ? new File([blob], `${name}.${ext}`, { type: blob.type }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancel';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}
