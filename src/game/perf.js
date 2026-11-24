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
// - R11 juice (Sol fix 3), split frames: while cats sprint or a bench chain plays, the still board (rug objects, still
//   cats, kitten leashes) moves to its own crisp layer (#pf-board) that is redrawn only when it changes, and the moving
//   cats + transient fx (hops, sparks, confetti, the edge glow, the sweep) draw on a low-resolution layer (#pf-fx,
//   FX_SCALE of the board DPR) over #game. #game keeps the belt, bench, carriers, teaching marks and the chain counter
//   crisp. Software raster pays per drawn pixel on the main thread, so a frame now re-rasters only what moves
// Renderer: '?r=pixi' or the Settings toggle (save.data.perf.gpu) draws the underlay and the still cats with PixiJS
// (WebGPU first, WebGL fallback, src/game/pixi-layer.js); Canvas2D stays the default and the fallback.
import { IMG } from './assets.js';
import { save } from '../kit/save.js';
import { drawBody, sample, bodyShape } from './render.js';
import { buildFar, buildNear, carrierShadow } from './render-depth.js';
import { DIRS } from '../core/board.js';
import { DOG_NEAR } from '../core/rules.js';

// '?perf=0': the old renderer, untouched (A/B timing, a way out if a phone ever draws the underlay wrong)
const OFF = (() => { try { return new URLSearchParams(location.search).get('perf') === '0'; } catch { return false; } })();
export const DPR_CAP = OFF ? 3 : 2;
// R11 juice: '?split=0' draws every frame on #game as in R10 (A/B timing)
// window.__perf.noSplit = true does the same live (QA draws one frozen frame both ways)
const SPLIT = (() => { try { return new URLSearchParams(location.search).get('split') !== '0'; } catch { return true; } })();
export const FX_SCALE = 0.65; // the moving layer's resolution, of the board DPR (2 on a phone: 1.3 device px per CSS px)

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
const stats = { renderer: 'canvas', drawn: 0, skipped: 0, covered: false, layers: 0, sprites: 0, split: 0, boardDraws: 0 };
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
    // R11 juice: the split-frame layers, the still board under #game and the low-res moving layer over it
    this.beltCv = mkCanvas('pf-belt'); // R11: the belt, baked; its stop-click kick is a CSS translate
    host.parentNode.insertBefore(this.beltCv, host);
    this.beltKey = '';
    this.kick = 0;
    this.boardCv = mkCanvas('pf-board');
    this.fxCv = mkCanvas('pf-fx');
    host.parentNode.insertBefore(this.boardCv, host);
    host.parentNode.insertBefore(this.fxCv, host.nextSibling);
    this.bctx = this.boardCv.getContext('2d');
    this.fctx = this.fxCv.getContext('2d');
    this.splitOn = false;
    this.bsig = '';
    this.bAt = 0;
    this.L = { board: null, top: null, fx: this.fctx, cam: (ctx) => this.fxCam(ctx), flat: () => this.fxFlat() };
    // R11 juice: full-screen flashes as DOM layers whose opacity/transform the compositor animates (no raster per frame)
    const div = (css, id) => { const d = document.createElement('div'); d.id = id; d.setAttribute('aria-hidden', 'true'); d.style.cssText = 'position:fixed;pointer-events:none;opacity:0;will-change:opacity,transform;' + css; host.parentNode.insertBefore(d, this.fxCv.nextSibling); return d; };
    this.fxDom = {
      edgeL: div('left:0;top:0;bottom:0;width:26px;background:linear-gradient(90deg,rgba(255,212,59,.55),rgba(255,212,59,0))', 'pf-edge-l'),
      edgeR: div('right:0;top:0;bottom:0;width:26px;background:linear-gradient(270deg,rgba(255,212,59,.55),rgba(255,212,59,0))', 'pf-edge-r'),
      flash: div('inset:0', 'pf-flash'),
      ring: div('left:0;top:0;border-radius:50%;border:4px solid #ffd43b;box-sizing:border-box', 'pf-ring'),
    };
    this.domOp = { edgeL: 0, edgeR: 0, flash: 0, ring: 0 };
    // the chain counter on a split frame: a crisp strip over the moving layer (its gold burst stays under the words)
    this.topCv = mkCanvas('pf-top');
    this.topCv.style.height = '180px';
    this.topCv.style.inset = 'auto';
    this.topCv.style.left = '0';
    host.parentNode.insertBefore(this.topCv, this.fxDom.edgeL.nextSibling);
    this.tctx = this.topCv.getContext('2d');
    this.topY = null;
    this.domSet = {};
    this.pulseAt = null;
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
    // R11 fix round 1 (juice): what a frame that rastered the whole still board costs here, from the rAF interval that
    // follows it (a quiet phone shows 16.7 ms, a phone that rasters on the main thread much more). Latched: only a
    // whole-board raster updates it, so an idle hold (below) does not talk itself back out of holding
    const dt = now - (this.prevNow || now);
    this.prevNow = now;
    if (this.boardDrawn && dt > 0 && dt < 300) this.heavy = (this.heavy ?? 16.7) * 0.7 + dt * 0.3;
    this.boardDrawn = false;
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
    const sig = `${g.W}x${g.H}@${g.dpr}|${g.board ? g.board.w + 'x' + g.board.h : '-'}|${g.ox},${g.oy},${g.cell}|${n}|${g.benchY}|${g.beltY}|${!!IMG['r7/bg_play_room']}${!!IMG['r7/table_top']}|${g.demo}|${g.roomArt ? g.roomArt().key : ''}`;
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
    this.far.style.transform = this.near.style.transform = this.boardCv.style.transform = '';
    this.beltKey = ''; this.beltTf();
    this.bsig = ''; // the split board layer redraws at the new size
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
    this.near.style.transform = this.boardCv.style.transform = id ? '' : `matrix(${a},${b},${c},${dd},${e},${f})`; // R11: the split board layer moves with the rug
    this.beltTf();
    this.far.style.transform = id ? '' : `matrix(${1 + (a - 1) * p},${b * p},${c * p},${1 + (dd - 1) * p},${e * p},${f * p})`;
  }

  // underlay owns these: the board canvas skips them
  owns(ctx) { return ctx === this.g.ctx; }

  end() {
    if (this.pixi) this.pixi.end(this.frame);
    for (const k in this.domOp) if (!this.domSet[k] && this.domOp[k]) this.domStyle(k, 0); // R11: a DOM flash not drawn this frame goes out
    this.domSet = {};
    if (this.beltAt !== this.frame && this.beltKey) { // R11: no belt this frame (no board): the belt layer empties too
      this.beltKey = '';
      this.beltCv.getContext('2d').clearRect(0, 0, this.beltCv.width, this.beltCv.height);
    }
  }

  // ---- R11 juice: a carrier at rest (no squash, dip, door swing, pops, lean, hint glow) from a sprite that
  // drawCarrier7 itself baked; a state is baked only once it held for two frames (a rolling carrier never bakes) ----
  carrier(ctx, vc, x, sc, front, rot, dy) {
    const g = this.g;
    if (ctx !== g.ctx || this.baking || rot || dy || vc.closed) return false;
    const t = g.clock;
    if (t - (vc.sqT ?? -9) < 0.5 || t - (vc.popT ?? -9) < 0.75) return false;
    const hc = g.hintId != null && g.board && g.board.cats[g.hintId];
    if (front && hc && hc.color === vc.color && !g.demo) return false;
    const d = g.dpr;
    const sh = save.data.shop;
    const key = `${vc.color}|${vc.fill}|${vc.cap}|${front ? 1 : 0}|${Math.round(sc * 1000)}|${Math.round(x * d)}|${g.cs}|${d}|${g.beltY}|${(sh && sh.eq && sh.eq.car) || ''}`;
    this.cars = this.cars || new WeakMap();
    let e = this.cars.get(vc);
    if (!e || e.key !== key) {
      if (!e || e.want !== key) { this.cars.set(vc, { want: key }); return false; }
      const cw = g.cs * 1.3 * sc, art = IMG['r7/carrier_orange'];
      const ch = cw * (art ? art.height / art.width : 1); // tight: the art (+ its contact shadow), every badge sits inside it
      const ox = Math.floor((x - cw * 0.56) * d) / d, oy = Math.floor((g.beltY - ch - 6) * d) / d;
      const w = cw * 1.12 + 2, h = ch * 1.12 + 14;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(w * d);
      cv.height = Math.ceil(h * d);
      const k = cv.getContext('2d');
      k.setTransform(d, 0, 0, d, -ox * d, -oy * d);
      this.baking = true;
      try { g.drawCarrier7(k, vc, x, sc, front, 0, 0); } finally { this.baking = false; }
      e = { key, cv, x: ox, y: oy };
      this.cars.set(vc, e);
      stats.carSprites = (stats.carSprites || 0) + 1;
    }
    ctx.drawImage(e.cv, e.x, e.y, e.cv.width / d, e.cv.height / d);
    return true;
  }

  // ---- R11 juice: the belt on its own baked layer (it only ever moves by the stop-click kick) ----
  belt(ctx, img, x, y, w, h, sh, kick) {
    const g = this.g;
    if (ctx !== g.ctx || this.pixi) return false;
    this.beltAt = this.frame;
    const key = `${x}|${y}|${w}|${h}|${g.W}x${g.H}@${g.dpr}`;
    if (key !== this.beltKey) {
      this.beltKey = key;
      const c = this.beltCv;
      c.width = Math.round(g.W * g.dpr);
      c.height = Math.round(g.H * g.dpr);
      const k = c.getContext('2d');
      k.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      this.shadowImage(g.ctx, img, x, y, w, h, sh, k);
    }
    if (kick !== this.kick) { this.kick = kick; this.beltTf(); }
    return true;
  }

  beltTf() {
    const [a, b, c, d, e, f] = this.cam;
    const id = Math.abs(a - 1) + Math.abs(b) + Math.abs(c) + Math.abs(d - 1) + Math.abs(e) + Math.abs(f) < 0.002;
    const m = id ? '' : `matrix(${a},${b},${c},${d},${e},${f}) `;
    const tf = (m + (this.kick ? `translateX(${this.kick.toFixed(2)}px)` : '')).trim();
    if (this.beltCv.style.transform !== tf) this.beltCv.style.transform = tf;
  }

  // ---- R11 juice: compositor-only flashes ----
  domStyle(k, op, tf) {
    const el = this.fxDom[k];
    this.domSet[k] = true;
    const o = Math.round(op * 1000) / 1000;
    if (o !== this.domOp[k]) { el.style.opacity = String(o); this.domOp[k] = o; }
    if (tf != null && el.style.transform !== tf) el.style.transform = tf;
  }

  // the chain's 2nd+ hop lights both screen edges (alpha a of the old canvas gradient, 0.55 = full)
  edgeGlow(a) {
    if (this.g.demo) return false;
    this.domStyle('edgeL', a / 0.55);
    this.domStyle('edgeR', a / 0.55);
    return true;
  }

  // the last landing's screen pulse: a warm flash from the counter (op 0..1) and a gold ring of radius r
  pulse(x, y, op, r, ringOp) {
    const g = this.g;
    const R = Math.max(g.W, g.H) * 0.75, r1 = 18 + g.W * 0.42;
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(R)}`;
    if (this.pulseAt !== key) { // placed once per chain, then only opacity and scale change
      this.pulseAt = key;
      this.fxDom.flash.style.background = `radial-gradient(circle ${Math.round(R)}px at ${Math.round(x)}px ${Math.round(y)}px, rgba(255,236,170,.32), rgba(255,200,90,.144) 45%, rgba(255,190,80,0))`;
      const rg = this.fxDom.ring.style;
      rg.width = rg.height = Math.round(r1 * 2) + 'px';
      rg.left = Math.round(x - r1) + 'px';
      rg.top = Math.round(y - r1) + 'px';
    }
    this.domStyle('flash', op);
    this.domStyle('ring', ringOp, `scale(${(r / r1).toFixed(3)})`);
    return true;
  }

  // ---- a still cat: soft shadow + live tail + baked body (canvas), or a Pixi sprite ----
  body(ctx, cat, path, a, b, st, o) {
    const g = this.g;
    if ((ctx !== g.ctx && ctx !== this.bctx) || o.glow) return false; // R11: the split board layer has the board's DPR too
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
    bodyShape(slk, path, a, b, c, st.pal);
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
    bodyShape(rk, path, a, b, c, st.pal);
    rk.globalCompositeOperation = 'destination-out';
    rk.translate(-Math.max(1.2, w * 0.07), Math.max(1.2, w * 0.07));
    bodyShape(rk, path, a, b, c, st.pal);
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
  shadowImage(ctx, img, x, y, w, h, sh, into = ctx) {
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
    into.drawImage(e.cv, x - e.pad, y - e.pad, e.cv.width / d, e.cv.height / d);
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

  // ---- R11 juice: split frames ----
  // split when something moves over a board that itself holds still: a sprint, a hop, particles, the chain, the sweep.
  // Never while a finger is down (the lane preview draws under the cats), or while a board cat itself shakes, pops in,
  // gets bonked or a yarn ball rolls under the cats: those frames draw whole on #game as before
  wantSplit() { return this.splitState() === 'move'; }

  // R11 fix round 1: 'move' (split), 'still' (nothing moves and the board may sit on its layer: an idle hold candidate)
  // or false (the frame must draw whole on #game)
  splitState() {
    const g = this.g;
    if (!SPLIT || stats.noSplit || this.pixi || !g.board || !g.state || g.demo || g.press) return false;
    const t = g.clock;
    let move = g.parts.length > 0;
    for (const a of g.anims) {
      if (a.type === 'bonk' || a.type === 'roll') return false;
      move = true;
    }
    for (const k in g.wiggle) if (t - g.wiggle[k].t < 0.35 && t >= g.wiggle[k].t) return false;
    for (const k in g.wiggleObj) if (t - g.wiggleObj[k].t < 0.35 && t >= g.wiggleObj[k].t) return false;
    for (const k in g.popIn) if (t - g.popIn[k] < 0.35) return false;
    if (g.chainFx && t - (g.chainFx.t1 || g.chainFx.t0 || 0) < 1.8) move = true;
    if (g.sweep && t - g.sweep.t0 < 1.3) move = true;
    return move ? 'move' : 'still';
  }

  // what the still board shows; the layer redraws only when this changes (idle life holds still for the moment).
  // R11 fix round 1 (juice): kept in parts, so a change can name the cats it touched (a cat left, an arrow came or went,
  // the scheduled blink moved on) and redraw only their corner of the layer
  boardState() {
    const g = this.g, st = g.state, t = g.clock;
    const parts = [this.sig, g.hintId, g.cueOn && g.cueOn('cat') ? g.cue.cat : '', JSON.stringify(g.mv), g.idleHeld ? 1 : 0];
    const head = parts.join('|');
    let alive = '';
    for (const id of g.order) alive += st.alive[id] ? '1' : '0';
    const freed = [];
    for (const id in g.freedT) { const fr = t - g.freedT[id]; if (fr >= 0 && fr < 1.4) freed.push(+id); } // a freed cat's arrow
    return { parts, mv: g.mv, head, alive, freed: freed.join(','), freedIds: freed, blink: g.idleHeld ? g.heldBlink : -1 };
  }

  // R11 fix round 1 (juice): a slow phone (its whole-board frames come late) or reduced motion draws the still board the
  // same way every time: no breathing, no look-around, no arrow bob, and one cat at a time blinks on a schedule. The
  // same board then always rasters to the same pixels, so a change can redraw a corner without a seam
  slowBoard() {
    const g = this.g;
    // a little hysteresis: a board already drawn the slow way stays so until frames come clearly fast (no flip-flop,
    // each flip is a whole-board redraw)
    const on = g.idleHeld, hv = this.heavy ?? 16.7, dt = this.dtAvg ?? 16.7;
    return g.calm || !!stats.forceSlow || (on ? hv > 21 || dt >= 20 : hv > 26 || dt >= 24); // forceSlow: QA
  }

  // idle hold: a quiet board on a slow phone (or with reduced motion) keeps its still cats on the board layer too, which
  // redraws only when something on it changes (a blink is one cat), instead of re-rastering every cat 30 times a second.
  // Also between the moving parts of a busy moment (a tap's events waiting to play), so a send never falls back to a
  // whole-board frame. Not while a hint or a Take back cue glows (those pulse), nor at the end of a level
  wantHold() {
    const g = this.g;
    if (g.over || g.hintId != null || (g.cueOn && g.cueOn('cat'))) return false;
    return this.slowBoard();
  }

  // the CSS-px rectangle a still cat can paint: its cells, a little air, and its head side (chevron, "?" bubble, arrow)
  catRect(id, arrow) {
    const g = this.g, c = g.cell, cat = g.board.cats[id];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of cat.cells) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const ext = arrow ? 1.6 : 0.8; // past the head: the chevron (and the "?" bubble), or a freed cat's exit arrow
    const p = [0.35, 0.35, 0.35, 0.35]; // left, top, right, bottom, in cells
    const dir = DIRS[cat.dir];
    if (cat.mech || !dir) p.fill(ext); // a swivel or mystery cat may face anywhere
    else {
      if (dir[0] < 0) p[0] = ext; if (dir[0] > 0) p[2] = ext;
      if (dir[1] < 0) p[1] = ext; if (dir[1] > 0) p[3] = ext;
    }
    return [g.ox + (x0 - p[0]) * c, g.oy + (y0 - p[1]) * c, g.ox + (x1 + 1 + p[2]) * c, g.oy + (y1 + 1 + p[3]) * c];
  }

  // the dirty rectangle between two board states, or null when the whole layer has to redraw. A mechanics change names
  // its own corner too: a mystery / frozen cat that changed, a dog whose z count dropped (its head), a dog that left
  // (its hearing zone). stats.why counts the reasons for a whole redraw (QA / perf.mjs PERF_DEBUG)
  dirtyRect(a, b) {
    const g = this.g;
    const full = (k) => { stats.why = stats.why || {}; stats.why[k] = (stats.why[k] || 0) + 1; return null; };
    if (!a) return full('new');
    const pa = a.parts, pb = b.parts;
    if (pa[0] !== pb[0] || pa[1] !== pb[1] || pa[2] !== pb[2] || pa[4] !== pb[4]) return full('head');
    if (a.alive.length !== b.alive.length) return full('cats');
    const ids = new Set();
    const rects = [];
    const c = g.cell;
    if (pa[3] !== pb[3]) {
      const ma = a.mv, mb = b.mv;
      if (!ma || !mb) return full('mv');
      for (const key of ['hidden', 'frozen', 'chip']) {
        const A = ma[key] || {}, B = mb[key] || {};
        for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) if (A[k] !== B[k]) ids.add(+k);
      }
      const objs = (g.state && g.state.objs) || [];
      for (let k = 0; k < Math.max(ma.obj.length, mb.obj.length); k++) {
        const gone = ma.obj[k] !== mb.obj[k];
        if (!gone && ma.zzz[k] === mb.zzz[k]) continue;
        const o = objs[k];
        if (!o || !o.cells) return full('obj');
        const xs = o.cells.map(([x]) => x), ys = o.cells.map(([, y]) => y);
        const p = gone ? DOG_NEAR + 0.3 : 1.2; // the whole hearing zone, or the dog and its floating z's
        rects.push([g.ox + (Math.min(...xs) - p) * c, g.oy + (Math.min(...ys) - p) * c, g.ox + (Math.max(...xs) + 1 + p) * c, g.oy + (Math.max(...ys) + 1 + p) * c]);
      }
    }
    for (let i = 0; i < b.alive.length; i++) if (a.alive[i] !== b.alive[i]) ids.add(g.order[i]);
    const fa = new Set(a.freedIds), fb = new Set(b.freedIds);
    for (const id of fa) if (!fb.has(id)) ids.add(id);
    for (const id of fb) if (!fa.has(id)) ids.add(id);
    if (a.blink >= 0) ids.add(a.blink);
    if (b.blink >= 0) ids.add(b.blink);
    if ((!ids.size && !rects.length) || ids.size > 6) return full('ids');
    for (const id of [...ids]) { // a kitten's leash runs to its parent: both ends
      const cat = g.board.cats[id];
      if (cat.kittenOf != null) ids.add(cat.kittenOf);
      for (const k of g.board.cats) if (k.kittenOf === id) ids.add(k.id);
    }
    for (const id of ids) rects.push(this.catRect(id, fa.has(id) || fb.has(id)));
    let r = rects[0];
    for (const q of rects) r = [Math.min(r[0], q[0]), Math.min(r[1], q[1]), Math.max(r[2], q[2]), Math.max(r[3], q[3])];
    const d = g.dpr; // whole device pixels: no half-covered edge pixel to seam against
    r = [Math.floor(r[0] * d) / d, Math.floor(r[1] * d) / d, Math.ceil(r[2] * d) / d, Math.ceil(r[3] * d) / d];
    const bwid = g.board.w * c, bhei = g.board.h * c;
    if ((r[2] - r[0]) * (r[3] - r[1]) > 0.6 * bwid * bhei) return full('area'); // most of the board: one clean full redraw
    return r;
  }

  // the board block of Game.draw asks this on a partial redraw: does cat `id` reach into the dirty rectangle?
  inClip(id) {
    const r = this.L.clipR;
    if (!r) return true;
    const q = this.catRect(id, true);
    return q[0] < r[2] && q[2] > r[0] && q[1] < r[3] && q[3] > r[1];
  }

  // R11 fix round 2 (sol-r12-2 juice): what the moving layer draws this frame, in CSS px: every running cat (tail to
  // head along its path, with room for the paws, the bigger airborne head, its ground shadow and the speed streaks), a
  // bench cat's hop arc, a dog's trot and every particle. null = not known (the sweep, a camera push-in or shake, an
  // animation this does not know): the whole layer is cleared as before
  fxBounds() {
    const g = this.g, c = g.cell, t = g.clock;
    if (g.sweep && t - g.sweep.t0 < 1.3) return null;
    if (g.chainFx && t - (g.chainFx.t1 || g.chainFx.t0 || 0) < 1.8) return null;
    if (g.shake && t - g.shake.t0 < 0.3) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, m) => { if (x - m < x0) x0 = x - m; if (y - m < y0) y0 = y - m; if (x + m > x1) x1 = x + m; if (y + m > y1) y1 = y + m; };
    for (const a of g.anims) {
      if (a.type === 'run') {
        const d = g.runDist(a, t - a.t0);
        for (const m of a.members) {
          const arrived = t >= m.arrAt;
          const hi = arrived ? m.len : Math.max(0, Math.min(m.len, m.headBase + d * (1 + a.sig)));
          const lo = Math.max(0, Math.min(m.len, d));
          for (let s = Math.min(lo, hi); ; s += c * 0.5) { const p = sample(m.path, Math.min(s, hi)); add(p.x, p.y, c * 2.2); if (s >= hi) break; }
        }
      } else if (a.type === 'hop') {
        const to = a.to(), r = (a.from.bw || g.bw) + 14;
        add(a.from.x, a.from.y, r);
        add(to.x, to.y, r);
        add((a.from.x + to.x) / 2, Math.min(a.from.y, to.y) - g.cs * 0.7, r);
      } else if (a.type === 'trot') {
        const p = g.trotPose(a);
        add(p.a0[0] + p.dx, p.a0[1], c * 1.9);
        add(p.b0[0] + p.dx, p.b0[1], c * 1.9);
      } else return null;
    }
    for (const p of g.parts) add(p.x, p.y, (p.s || 8) * 2 + 6);
    return x0 === Infinity ? [0, 0, 0, 0] : [x0, y0, x1, y1];
  }

  // called at the top of Game.draw: null = draw the whole frame on #game; else { board: ctx or null (still clean), fx }
  split() {
    const g = this.g;
    if (this.fxClip) { this.fctx.restore(); this.fxClip = false; } // last frame's moving-layer clip
    const ss = this.splitState();
    const move = ss === 'move';
    const hold = ss === 'still' && this.wantHold();
    this.L.clip = false;
    this.L.clipR = null;
    if (!move && !hold) {
      g.idleHeld = false;
      g.heldBlink = -1;
      this.boardDrawn = true; // a whole frame on #game: every still cat rastered
      if (this.splitOn) {
        this.splitOn = false;
        this.bsig = null;
        this.bctx.setTransform(1, 0, 0, 1, 0, 0);
        this.bctx.clearRect(0, 0, this.boardCv.width, this.boardCv.height);
        this.fctx.setTransform(1, 0, 0, 1, 0, 0);
        this.fctx.clearRect(0, 0, this.fxCv.width, this.fxCv.height);
        this.fxPrev = [0, 0, 0, 0]; // R11 fix round 2: the moving layer is empty
        this.tctx.setTransform(1, 0, 0, 1, 0, 0);
        this.tctx.clearRect(0, 0, this.topCv.width, this.topCv.height);
        this.fxClean = true;
      }
      return null;
    }
    const d = g.dpr, k = d * FX_SCALE;
    const bw = Math.round(g.W * d), bh = Math.round(g.H * d), fw = Math.round(g.W * k), fh = Math.round(g.H * k);
    if (this.boardCv.width !== bw || this.boardCv.height !== bh) { this.boardCv.width = bw; this.boardCv.height = bh; this.bsig = null; }
    if (this.fxCv.width !== fw || this.fxCv.height !== fh) { this.fxCv.width = fw; this.fxCv.height = fh; this.fxClean = false; }
    this.splitOn = true;
    this.L.top = this.tctx;
    if (move) stats.split++; else stats.hold = (stats.hold || 0) + 1;
    const f = this.fctx;
    const y0 = Math.round(g.chainPos().y - 90), tw = Math.round(g.W * d), th = Math.round(180 * d);
    if (this.topCv.width !== tw || this.topCv.height !== th) { this.topCv.width = tw; this.topCv.height = th; this.fxClean = false; }
    if (y0 !== this.topY) { this.topY = y0; this.topCv.style.top = y0 + 'px'; }
    const tc = this.tctx;
    // R11 fix round 1: nothing moves in an idle hold, so the moving layer and the counter strip are cleared once and then
    // left alone (an untouched canvas costs no raster)
    if (move || !this.fxClean) {
      // R11 fix round 2: a moving frame clears only where the layer drew last frame and draws this frame, and it draws
      // clipped to this frame's bounds, so nothing ever lands outside what the next frame clears. Unknown bounds, or most
      // of the screen, clear it whole as before
      const cur = move ? this.fxBounds() : null, prev = this.fxPrev;
      f.setTransform(1, 0, 0, 1, 0, 0);
      const px = (r) => [Math.max(0, Math.floor(r[0] * k) - 2), Math.max(0, Math.floor(r[1] * k) - 2), Math.min(fw, Math.ceil(r[2] * k) + 2), Math.min(fh, Math.ceil(r[3] * k) + 2)];
      const u = cur && prev ? px([Math.min(cur[0], prev[0]), Math.min(cur[1], prev[1]), Math.max(cur[2], prev[2]), Math.max(cur[3], prev[3])]) : null;
      if (u && (u[2] - u[0]) * (u[3] - u[1]) < 0.7 * fw * fh) {
        if (u[2] > u[0] && u[3] > u[1]) f.clearRect(u[0], u[1], u[2] - u[0], u[3] - u[1]);
        stats.fxParts = (stats.fxParts || 0) + 1;
      } else f.clearRect(0, 0, fw, fh);
      if (cur) {
        const q = px(cur);
        f.save();
        f.beginPath();
        f.rect(q[0], q[1], Math.max(0, q[2] - q[0]), Math.max(0, q[3] - q[1]));
        f.clip();
        this.fxClip = true;
      }
      this.fxPrev = move ? cur : [0, 0, 0, 0];
      stats.fxRect = cur && cur.map((v) => v * k); // QA: the moving layer's device-px bounds this frame
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.clearRect(0, 0, tw, th);
      this.fxClean = !move;
    }
    f.setTransform(k, 0, 0, k, 0, 0);
    tc.setTransform(d, 0, 0, d, 0, -y0 * d);
    // a tap's look-around (1.3 s) and a freed cat's pulsing exit arrow (1.4 s) keep the board alive at up to 20 fps,
    // but only while frames come fast (each board redraw is a full still-board raster): a phone that is already
    // dropping frames holds the board still and spends them on the sprinting cat. A bench chain always holds it still
    // (all eyes are on the hops; the looks pick up again once it is over)
    const now = performance.now();
    if (move) {
      const dt = now - (this.splitAt || 0);
      this.splitAt = now;
      if (dt < 250) this.dtAvg = (this.dtAvg ?? 16.7) * 0.75 + dt * 0.25;
    } else this.splitAt = 0;
    const fast = (this.dtAvg ?? 16.7) < 24;
    // R11 fix round 1: a slow board is drawn the same way every time (Game reads idleHeld), with a scheduled blink
    g.idleHeld = this.slowBoard();
    g.heldBlink = -1;
    if (g.idleHeld && !g.calm) {
      const P = 1.7, n = Math.floor(g.clock / P);
      if (g.clock - n * P < 0.16) {
        const ids = g.order.filter((id) => g.state.alive[id]);
        if (ids.length) g.heldBlink = ids[(n * 7) % ids.length];
      }
    }
    const chain = g.chainFx && g.clock - (g.chainFx.t1 || g.chainFx.t0 || 0) < 1.8;
    let live = !g.idleHeld && fast && !chain && g.look && g.clock - g.look.t < 1.3;
    if (!g.idleHeld && fast && !chain) for (const id in g.freedT) { const fr = g.clock - g.freedT[id]; if (fr >= 0 && fr < 1.4) live = true; }
    const cur = this.boardState();
    const prev = this.bsig;
    this.L.board = null;
    const same = prev && prev.head === cur.head && prev.alive === cur.alive && prev.freed === cur.freed && prev.blink === cur.blink;
    if (!same || (live && now - this.bAt > 48)) {
      this.bsig = cur;
      this.bAt = now;
      const b = this.bctx;
      // only when the board is drawn the same way every time: else neighbours could seam at the rectangle's edge
      const r = !same && g.idleHeld && g.hintId == null && !(g.cueOn && g.cueOn('cat')) ? this.dirtyRect(prev, cur) : null;
      if (r) {
        stats.boardParts = (stats.boardParts || 0) + 1;
        b.setTransform(d, 0, 0, d, 0, 0);
        b.save();
        b.beginPath();
        b.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
        b.clip();
        b.clearRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
        this.L.clip = true;
        this.L.clipR = r;
      } else {
        stats.boardDraws++;
        this.boardDrawn = true;
        b.setTransform(1, 0, 0, 1, 0, 0);
        b.clearRect(0, 0, bw, bh);
        b.setTransform(d, 0, 0, d, 0, 0);
      }
      this.L.board = b;
    }
    return this.L;
  }

  // the moving layer follows the in-canvas camera (shake, chain push-in) of #game, at its own scale
  fxCam(ctx) {
    const m = ctx.getTransform(), s = FX_SCALE;
    this.fctx.setTransform(m.a * s, m.b * s, m.c * s, m.d * s, m.e * s, m.f * s);
  }

  fxFlat() {
    const k = this.g.dpr * FX_SCALE;
    this.fctx.setTransform(k, 0, 0, k, 0, 0);
  }
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
