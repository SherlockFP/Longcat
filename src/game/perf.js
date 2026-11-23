// Phone performance for the play board (r10 perf lane). The Game keeps its own draw code; this module only takes work
// off the per-frame path:
// - a frame gate: no frames while an opaque DOM screen (the café hub) covers the board, an idle board draws at 30 fps
//   (reduced motion: 12), and a 120 Hz phone never draws more than 60 frames a second
// - two underlay canvases under #game, rebuilt only when the layout changes: the room (far) and the rug, tiles,
//   bench plank and baked shadows (near). The camera nudge/shake moves them by CSS transform (compositor only), the
//   room at 40% of the board's motion: a cheap parallax
// - baked sprites in place of per-frame shadowBlur: still cats (body with key light + rim, soft contact shadow), the
//   belt, glow halos
// - render DPR capped at 2 (a DPR 3 phone fills 2.25x the pixels for no visible gain on these soft shapes)
// Renderer: '?r=pixi' or the Settings toggle (save.data.perf.gpu) draws the underlay and the still cats with PixiJS
// (WebGPU first, WebGL fallback, src/game/pixi-layer.js); Canvas2D stays the default and the fallback.
import { IMG } from './assets.js';
import { save } from '../kit/save.js';
import { drawBody, sample, bodyShape } from './render.js';
import { buildFar, buildNear, carrierShadow } from './render-depth.js';

// '?perf=0': the old renderer, untouched (A/B timing, a way out if a phone ever draws the underlay wrong)
const OFF = (() => { try { return new URLSearchParams(location.search).get('perf') === '0'; } catch { return false; } })();
export const DPR_CAP = OFF ? 3 : 2;

const pdata = () => {
  const d = save.data;
  if (!d.perf || typeof d.perf !== 'object') d.perf = { gpu: false };
  return d.perf;
};

// '?r=pixi' / '?r=canvas' beat the saved setting (QA and side-by-side checks)
export function wantedRenderer() {
  let q = '';
  try { q = new URLSearchParams(location.search).get('r') || ''; } catch { /* no location */ }
  if (q === 'pixi' || q === 'canvas') return q;
  return pdata().gpu ? 'pixi' : 'canvas';
}

export function gpuSetting() { return !!pdata().gpu; }
export function setGpu(on) { pdata().gpu = !!on; save.commit(); if (cur) cur.setRenderer(wantedRenderer()); }

let cur = null;
const stats = { renderer: 'canvas', drawn: 0, skipped: 0, covered: false, layers: 0, sprites: 0 };
if (typeof window !== 'undefined') window.__perf = stats;

const mkCanvas = (id) => {
  const c = document.createElement('canvas');
  c.id = id;
  c.setAttribute('aria-hidden', 'true');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none;transform-origin:0 0';
  return c;
};

// an element of #ui that hides the whole board: fully opaque, covering the viewport
function opaqueCover() {
  const ui = document.getElementById('ui');
  if (!ui) return false;
  const W = innerWidth, H = innerHeight;
  const check = (el) => {
    const r = el.getBoundingClientRect();
    if (r.left > 1 || r.top > 1 || r.right < W - 1 || r.bottom < H - 1) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 1) return false;
    if (el.getAnimations && el.getAnimations().some((a) => a.playState === 'running')) return false;
    const bg = cs.backgroundColor;
    if (/^rgb\(/.test(bg)) return true;
    const im = cs.backgroundImage;
    return /linear-gradient/.test(im) && !/rgba|transparent|hsla/.test(im);
  };
  for (const el of ui.children) {
    if (check(el)) return true;
    for (const k of el.children) if (check(k)) return true;
  }
  return false;
}

class Perf {
  constructor(game) {
    this.g = game;
    this.frame = 0;
    this.lastRun = 0;
    this.coverDirty = true;
    this.covered = false;
    this.coverAt = 0;
    this.sig = '';
    this.cam = [1, 0, 0, 1, 0, 0];
    this.cats = new WeakMap(); // path -> { key, shadow, body, x, y, still }
    this.sprites = new WeakMap(); // image -> its baked drop-shadow sprite (the belt)
    this.renderer = 'canvas';
    this.pixi = null;
    const host = game.canvas;
    this.far = mkCanvas('pf-far');
    this.near = mkCanvas('pf-near');
    host.parentNode.insertBefore(this.far, host);
    host.parentNode.insertBefore(this.near, host);
    try {
      new MutationObserver(() => { this.coverDirty = true; }).observe(document.getElementById('ui'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    } catch { /* no #ui: never covered */ }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { game.last = performance.now(); this.coverDirty = true; } });
    this.drift();
    this.setRenderer(wantedRenderer());
  }

  // the room sways a few px over ten seconds (compositor animation, none with reduced motion)
  drift() {
    try {
      if (this.driftAnim) this.driftAnim.cancel();
      this.driftAnim = null;
      if (this.g.calm || !this.far.animate) return;
      this.driftAnim = this.far.animate([{ translate: '-3px 0px' }, { translate: '3px -2px' }], { duration: 10000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    } catch { /* old engine: a still room */ }
  }

  async setRenderer(r) {
    if (r === this.renderer && (r === 'canvas' || this.pixi)) return;
    if (this.pixi) { this.pixi.destroy(); this.pixi = null; }
    this.renderer = 'canvas';
    stats.renderer = 'canvas';
    this.far.style.display = this.near.style.display = '';
    this.sig = '';
    if (r !== 'pixi') return;
    this.renderer = 'pixi-loading';
    try {
      const { createPixiLayer } = await import('./pixi-layer.js');
      const layer = await createPixiLayer(this.g, this.near);
      if (this.renderer !== 'pixi-loading') { layer.destroy(); return; }
      this.pixi = layer;
      this.renderer = 'pixi';
      stats.renderer = 'pixi-' + layer.api;
      this.far.style.display = this.near.style.display = 'none';
      this.sig = '';
    } catch (e) {
      console.warn('pixi renderer unavailable, Canvas2D stays', e && e.message);
      this.renderer = 'canvas';
      stats.renderer = 'canvas (pixi failed)';
    }
  }

  // loop gate: 0 = update + draw, 1 = skip the frame (dt accumulates), 2 = update only
  gate(now) {
    const g = this.g;
    if (this.coverDirty || now - this.coverAt > 500) {
      this.coverDirty = false;
      this.coverAt = now;
      this.covered = opaqueCover();
      stats.covered = this.covered;
    }
    if (this.covered) { stats.skipped++; return g.demo || !g.board ? 1 : 2; }
    const busy = this.busy();
    const min = busy ? 1000 / 61 : g.calm ? 1000 / 12 : 1000 / 31;
    if (now - this.lastRun < min - 2.5) { stats.skipped++; return 1; }
    this.lastRun = now;
    stats.drawn++;
    return 0;
  }

  // anything moving faster than idle life (breathing, blinks): full frame rate
  busy() {
    const g = this.g;
    if (!g.board || g.anims.length || g.parts.length || g.popups.length || g.pending.length || g.press || g.vis.leaving.length) return true;
    const t = g.clock;
    if (g.shake && t - g.shake.t0 < 0.3) return true;
    if (g.chainFx && t - (g.chainFx.t1 || g.chainFx.t0 || 0) < 1.8) return true;
    if (g.sweep && t - g.sweep.t0 < 1.3) return true;
    if (g.seatNew && t - g.seatNew.t0 < 2.4) return true;
    if (g.look && t - g.look.t < 1.3) return true;
    if (t - (g.edgeT || -9) < 0.7) return true;
    if (performance.now() - (this.inputAt || 0) < 700) return true;
    const cs = g.vis.carriers;
    for (let i = 0; i < cs.length && i < 4; i++) if (cs[i].rolling || Math.abs(cs[i].x - g.slotX(i)) > 0.6 || t - (cs[i].popT ?? -9) < 0.8 || t - (cs[i].sqT ?? -9) < 0.6) return true;
    for (const k in g.wiggle) if (t - g.wiggle[k].t < 0.35) return true;
    for (const k in g.popIn) if (t - g.popIn[k] < 0.35) return true;
    return false;
  }

  // start of draw: clear the transparent board canvas; rebuild the underlay when the layout moved
  bg(ctx) {
    if (ctx !== this.g.ctx) return false;
    const g = this.g;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, g.canvas.width, g.canvas.height);
    ctx.restore();
    this.frame++;
    const n = g.vis ? g.vis.bench.length : 0;
    const sig = `${g.W}x${g.H}@${g.dpr}|${g.board ? g.board.w + 'x' + g.board.h : '-'}|${g.ox},${g.oy},${g.cell}|${n}|${g.benchY}|${g.beltY}|${!!IMG['r7/bg_play_room']}${!!IMG['r7/table_top']}|${g.demo}`;
    if (sig !== this.sig || this.boardRef !== g.board) {
      this.sig = sig;
      this.boardRef = g.board;
      this.rebuild();
    }
    return true;
  }

  rebuild() {
    const g = this.g;
    stats.layers++;
    for (const c of [this.far, this.near]) {
      c.width = Math.round(g.W * g.dpr);
      c.height = Math.round(g.H * g.dpr);
    }
    buildFar(g, this.far.getContext('2d'));
    buildNear(g, this.near.getContext('2d'));
    this.cam = [1, 0, 0, 1, 0, 0];
    if (this.pixi) { this.pixi.layers(this.far, this.near); this.pixi.camera(this.cam); }
    this.far.style.transform = this.near.style.transform = '';
  }

  // the camera (shake, chain push-in) as the board canvas has it: the underlay follows by CSS transform
  camera(ctx) {
    if (ctx !== this.g.ctx) return;
    const m = ctx.getTransform();
    const d = this.g.dpr;
    const a = m.a / d, b = m.b / d, c = m.c / d, dd = m.d / d, e = m.e / d, f = m.f / d;
    const o = this.cam;
    if (Math.abs(a - o[0]) + Math.abs(b - o[1]) + Math.abs(c - o[2]) + Math.abs(dd - o[3]) + Math.abs(e - o[4]) + Math.abs(f - o[5]) < 0.002) return;
    this.cam = [a, b, c, dd, e, f];
    const id = Math.abs(a - 1) + Math.abs(b) + Math.abs(c) + Math.abs(dd - 1) + Math.abs(e) + Math.abs(f) < 0.002;
    if (this.pixi) { this.pixi.camera(this.cam); return; }
    const p = 0.4; // the room moves less than the board: parallax
    this.near.style.transform = id ? '' : `matrix(${a},${b},${c},${dd},${e},${f})`;
    this.far.style.transform = id ? '' : `matrix(${1 + (a - 1) * p},${b * p},${c * p},${1 + (dd - 1) * p},${e * p},${f * p})`;
  }

  // underlay owns these: the board canvas skips them
  owns(ctx) { return ctx === this.g.ctx; }

  end() {
    if (this.pixi) this.pixi.end(this.frame);
  }

  // ---- a still cat: soft shadow + live tail + baked body (canvas), or a Pixi sprite ----
  body(ctx, cat, path, a, b, st, o) {
    const g = this.g;
    if (ctx !== g.ctx || o.glow) return false;
    const c = g.cell;
    const w = st.w;
    const pi = !!this.pixi;
    let e = this.cats.get(path);
    const key = `${st.pal.name}|${w}|${a}|${b}|${g.dpr}|${pi}`;
    if (!e || e.key !== key) {
      e = this.bakeCat(path, a, b, st, cat.id * 3 + 1, pi);
      if (!e) return false;
      e.key = key;
      this.cats.set(path, e);
    }
    if (pi && this.pixi.cat(e, cat.id, this.frame)) return true;
    const d = g.dpr;
    ctx.drawImage(e.shadow, e.x, e.y, e.shadow.width / d, e.shadow.height / d);
    drawBody(ctx, path, a, b, { pal: st.pal, c, w, collar: st.collar, seed: cat.id * 3 + 1, wag: o.wag ?? g.wagOf(cat.id), part: 'tail' });
    ctx.drawImage(e.body, e.x, e.y, e.body.width / d, e.body.height / d);
    return true;
  }

  bakeCat(path, a, b, st, seed, withTail) {
    const g = this.g;
    const c = g.cell, w = st.w, d = g.dpr;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let s = a; ; s += c * 0.2) {
      const p = sample(path, Math.min(s, b));
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      if (s >= b) break;
    }
    const m = w * 0.7 + c * (withTail ? 0.75 : 0.25) + 6;
    x0 = Math.floor(x0 - m); y0 = Math.floor(y0 - m); x1 = Math.ceil(x1 + m); y1 = Math.ceil(y1 + m);
    const cw = Math.max(1, Math.round((x1 - x0) * d)), ch = Math.max(1, Math.round((y1 - y0) * d));
    if (cw * ch > 4e6) return null;
    const mk = () => { const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const k = cv.getContext('2d'); k.setTransform(d, 0, 0, d, -x0 * d, -y0 * d); return [cv, k]; };
    const o = { pal: st.pal, c, w, collar: st.collar, seed, wag: 0 };
    // soft contact shadow: the old hard stroke, blurred once here. The silhouette goes to a scratch canvas first (one
    // opaque shape, no darker overlaps), then only its shadow lands (the image itself is drawn off-canvas)
    const [sil, slk] = mk();
    slk.strokeStyle = '#000';
    slk.lineCap = slk.lineJoin = 'round';
    slk.lineWidth = w + 4;
    bodyShape(slk, path, a, b, c);
    const [sh, sk] = mk();
    const OFF = 4000;
    sk.setTransform(1, 0, 0, 1, 0, 0);
    sk.shadowColor = 'rgba(60,30,10,0.34)';
    sk.shadowBlur = 5 * d;
    sk.shadowOffsetX = -OFF * d;
    sk.drawImage(sil, OFF * d - c * 0.06 * d, c * 0.09 * d);
    const [bd, bk] = mk();
    drawBody(bk, path, a, b, { ...o, part: withTail ? 'still' : 'body' });
    // warm key light from the upper right, a touch cooler toward the belly
    bk.save();
    bk.globalCompositeOperation = 'source-atop';
    const gr = bk.createLinearGradient(x1, y0, x0, y1);
    gr.addColorStop(0, 'rgba(255,214,150,0.24)');
    gr.addColorStop(0.55, 'rgba(255,214,150,0)');
    gr.addColorStop(1, 'rgba(70,35,15,0.10)');
    bk.fillStyle = gr;
    bk.fillRect(x0, y0, x1 - x0, y1 - y0);
    bk.restore();
    // rim highlight: the silhouette minus itself nudged down-left leaves a thin crescent on the lit edge
    const [rm, rk] = mk();
    rk.lineCap = rk.lineJoin = 'round';
    rk.strokeStyle = '#fff';
    rk.lineWidth = w + 3;
    bodyShape(rk, path, a, b, c);
    rk.globalCompositeOperation = 'destination-out';
    rk.translate(-Math.max(1.2, w * 0.07), Math.max(1.2, w * 0.07));
    bodyShape(rk, path, a, b, c);
    rk.setTransform(1, 0, 0, 1, 0, 0);
    rk.globalCompositeOperation = 'source-in';
    rk.fillStyle = 'rgba(255,246,222,0.55)';
    rk.fillRect(0, 0, cw, ch);
    bk.save();
    bk.setTransform(1, 0, 0, 1, 0, 0);
    bk.globalCompositeOperation = 'source-atop';
    bk.drawImage(rm, 0, 0);
    bk.restore();
    stats.sprites++;
    return { shadow: sh, body: bd, x: x0, y: y0 };
  }

  // an image with its drop shadow baked once (the belt): drawn as one plain drawImage per frame
  shadowImage(ctx, img, x, y, w, h, sh) {
    if (ctx !== this.g.ctx || !img) return false;
    const d = this.g.dpr;
    const key = `${w}|${h}|${d}|${sh.join()}`;
    let e = this.sprites.get(img);
    if (!e || e.key !== key) {
      const pad = sh[1] + Math.max(Math.abs(sh[2]), Math.abs(sh[3]));
      const cv = document.createElement('canvas');
      cv.width = Math.ceil((w + pad * 2) * d);
      cv.height = Math.ceil((h + pad * 2) * d);
      const k = cv.getContext('2d');
      k.setTransform(d, 0, 0, d, pad * d, pad * d);
      k.shadowColor = sh[0];
      k.shadowBlur = sh[1] * d;
      k.shadowOffsetX = sh[2] * d;
      k.shadowOffsetY = sh[3] * d;
      k.drawImage(img, 0, 0, w, h);
      e = { key, cv, pad };
      this.sprites.set(img, e);
    }
    ctx.drawImage(e.cv, x - e.pad, y - e.pad, e.cv.width / d, e.cv.height / d);
    return true;
  }

  // a soft gold halo sprite (made once) in place of shadowBlur on the chain-hop trail and the hinted carrier
  halo(ctx, x, y, r, alpha = 1) {
    if (!this.haloCv) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const k = cv.getContext('2d');
      const gr = k.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,212,59,0.95)');
      gr.addColorStop(0.45, 'rgba(255,212,59,0.55)');
      gr.addColorStop(1, 'rgba(255,212,59,0)');
      k.fillStyle = gr;
      k.fillRect(0, 0, 64, 64);
      this.haloCv = cv;
    }
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * alpha;
    ctx.drawImage(this.haloCv, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = a0;
  }

  // the hinted carrier's glow: the art's own outline, blurred once, drawn with a pulsing alpha
  glowImage(ctx, img, x, y, w, h, alpha) {
    if (ctx !== this.g.ctx) return false;
    const d = this.g.dpr;
    const key = `${w}|${h}|${d}`;
    this.glows = this.glows || new WeakMap();
    let e = this.glows.get(img);
    if (!e || e.key !== key) {
      const pad = 22;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil((w + pad * 2) * d);
      cv.height = Math.ceil((h + pad * 2) * d);
      const k = cv.getContext('2d');
      const OFF = 4000;
      k.setTransform(d, 0, 0, d, (pad - OFF) * d, pad * d);
      k.shadowColor = 'rgba(255,214,90,1)';
      k.shadowBlur = 16 * d;
      k.shadowOffsetX = OFF * d;
      k.drawImage(img, 0, 0, w, h);
      e = { key, cv, pad };
      this.glows.set(img, e);
    }
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * alpha;
    ctx.drawImage(e.cv, x - e.pad, y - e.pad, e.cv.width / d, e.cv.height / d);
    ctx.globalAlpha = a0;
    return true;
  }

  // soft baked shadows under the carriers on the belt (drawn before them)
  carriers(ctx) {
    if (ctx !== this.g.ctx) return;
    carrierShadow(this.g, ctx, this);
  }

  input() { this.inputAt = performance.now(); }
}

// one per live board (the share clip's fixed-size Game never gets one)
export function attach(game) {
  if (OFF || game.fixed || typeof document === 'undefined' || !game.canvas.parentNode) return null;
  try {
    cur = new Perf(game);
    game.canvas.addEventListener('pointerdown', () => cur && cur.input(), { passive: true });
    return cur;
  } catch (e) {
    console.warn('perf layers off', e && e.message);
    return null;
  }
}
