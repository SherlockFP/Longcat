// Board controller: layout, input, animation, juice. Rules live in core/.
// The rules state moves instantly on a tap. A separate "vis" model (carrier queue, bench seats) trails it:
// every rules event gets a time and is applied to vis when the sprinting cat lands (see scheduleEvents).
import { createState, tap, scoop as rulesScoop, undo as rulesUndo, canUndo, addSeat, isWon, stars as starsOf, isHidden, dogLeft, findBlocker, THAW_NEED, DOG_NEAR, canExit } from '../core/rules.js';
import { hint as solverHint } from '../core/solver.js';
import { DIRS } from '../core/board.js';
import { IMG } from './assets.js';
import * as content from './content.js'; // spring cats, swivel beds, pack themes (content lane)
import * as shp from './shape.js'; // shape lane: shaped rug, quilted flaps over folded sections
import * as fun from './r11-fun.js'; // R11 fun lane: park ghosts + carrier line, the winnable rewind's teaching mark
import { COLOR_PAL, COLLARS, NAVY, MYSTERY_PAL } from './breeds.js';
import { attach as perfAttach, DPR_CAP } from './perf.js';
import { landKick, stampScale, drawLandPulse, closeSquash, stampSprite } from './r11-juice.js'; // R11 juice: final-landing beat, lid slam
import { roomImage as shopRoom, drawHat as shopHat, drawCarrierSkin as shopSkin } from './shop-look.js';
import { makePath, sample, drawBody, drawHead, drawArrow, drawChevron, drawPaw, drawPatBadge, drawPaws, disc, FONT, drawDog, drawYarn, drawIce, drawQuestion, drawBadge, head7, shade } from './render.js';

const FACE = { U: -Math.PI / 2, R: 0, D: Math.PI / 2, L: Math.PI };
const MOODS = [0, 1, 2, 3, 1, 0, 3, 2]; // per-cat resting face: excited, content, smug, sleepy
const ANT = 0.1; // anticipation crouch, seconds (long enough to read at game speed: the body bunches back before the spring)
const SIG = 0.6; // noodle stretch: the head runs (1 + SIG) times as fast as the tail until it lands
const FOLD = 0.12; // after the paws land, the rest of the body accordions in
const FLICK = 0.2; // then the tail snaps in last with a white-tip flick
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CONFETTI = ['#ff7a1a', '#ffd43b', '#3fd0c4', '#ff6b9a', '#7c5cff', '#6bd36b'];
const RUN_EASE = 1.35; // sprint: fast launch, gentle brake into the carrier
const rampD = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), RUN_EASE);
const LANE = 34; // px kept free above the booster bar for toasts
const PLAQUE_B = 47; // R11 pres: CSS bottom of the LEVEL plaque under the safe area (r7.css .hud-top2: 6px + a 42px row, the 40px plaque centred)
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

export class Game {
  // opts.size: an offscreen renderer (the share clip) with a fixed CSS size { W, H, dpr, top, bottom } (top/bottom act
  // as safe-area insets, room for the clip's captions): no input, no frame loop, the caller steps update() and draw()
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.fixed = opts.size || null;
    this.log = []; // every rules move of the attempt, in order (the share clip replays it)
    this.ctx = canvas.getContext('2d');
    this.clock = 0;
    this.timeScale = 1;
    this.board = null;
    this.state = null;
    this.anims = [];
    this.parts = [];
    this.popups = [];
    this.pending = [];
    this.freedLog = [];
    this.wiggle = {};
    this.wiggleObj = {};
    this.mv = { obj: [], hidden: {}, frozen: {}, chip: {}, zzz: [], t: {} };
    this.shake = null;
    this.hintId = null;
    this.autoHint = false;
    this.demo = false;
    this.scoopMode = false;
    this.top = 104;
    this.bottom = 112;
    this.texts = ['Purrfect!', 'Cat-tastic!', 'Meow-velous!'];
    this.vis = { carriers: [], leaving: [], bench: [], stuck: [], benchT: [], benchOut: [] };
    this.cue = null; // R11 teaching marks: { t0, need: carrier color (lost bench), seat + cat (after Take back) }
    this.chain = 0;
    this.lastDepart = -9;
    this.chainFx = null; // the bench chain on screen: { n, k (hops so far), kT, t0, t1 }
    this.chainText = (n) => `Chain x${n}!`;
    this.on = {};
    this.last = performance.now();
    this.calm = false;
    if (this.fixed) { this.resize(); return; }
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.calm = mq.matches;
      mq.addEventListener('change', (e) => { this.calm = e.matches; });
    } catch { /* old webview */ }
    this.probe = document.createElement('div');
    this.probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(this.probe);
    canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
    canvas.addEventListener('pointerup', (e) => this.onRelease(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointercancel', (e) => this.onRelease(e, true));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.pf = perfAttach(this); // r10 perf: frame gate, baked underlay layers and sprites (src/game/perf.js)
    const loop = (now) => {
      const gate = this.pf ? this.pf.gate(now) : 0; // 1: skip this frame (dt carries over), 2: covered board, no draw
      if (gate === 1) { requestAnimationFrame(loop); return; }
      const rush = this.state && !this.demo && !this.calm && this.state.aliveCount === 0 && !this.over ? 1.8 : 1; // nothing left to tap: the carriers wrap up faster
      const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale * rush * (this.chainSlow() ? 0.6 : 1); // a bench chain plays in slow motion
      this.last = now;
      this.clock += dt;
      try {
        this.update(dt);
        if (gate !== 2) { this.draw(); if (this.pf) this.pf.end(); }
      } catch (err) {
        console.error(err);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---- setup ----
  resize() {
    if (this.fixed) {
      const f = this.fixed;
      this.dpr = f.dpr || 1;
      this.W = f.W;
      this.H = f.H;
      this.safeT = f.top || 0;
      this.safeB = f.bottom || 0;
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      this.layout();
      return;
    }
    this.dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP); // r10 perf: DPR 3 phones fill 2.25x the pixels for no visible gain
    this.W = document.body.clientWidth || window.innerWidth; // wide screens: the centred phone column (index.html)
    this.H = window.innerHeight;
    const cs = getComputedStyle(this.probe);
    this.safeT = parseFloat(cs.paddingTop) || 0;
    this.safeB = parseFloat(cs.paddingBottom) || 0;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.layout();
  }

  layout() {
    if (!this.board) return;
    const { w, h } = this.board;
    const { W, H } = this;
    const k = clamp(H / 812, 0.8, 1.1);
    let top = this.top;
    let bottom = this.bottom;
    const r7 = !!IMG['r7/table_top'];
    this.rugR = r7 ? Math.round(clamp(15 * k, 13, 18)) : 0; // stitched rug rim around the tiles (r7 table_top 9-slice)
    const padOut = r7 ? this.rugR + 5 : 10 + 6 + 3; // rug ring + fringe + a hair of air
    const availW = W - 2 * (padOut + 3);
    // tall boards: shrink the bench cushions and the air around them (down to 70%) until cells reach 40 CSS px; the
    // carriers keep their size (they carry the colour queue the whole level is planned around)
    for (let f = 1; ; f -= 0.05) {
      { // the home demo gets a compact belt + bench under the logo so it shows the real move (cat -> carrier)
        if (this.demo) f = 0.74;
        let hdr = this.demo ? this.top : this.safeT + (r7 ? 54 : 62) * k;
        const cf = this.demo ? f : Math.max(0.94, f); // carrier art: fixed in play (a hair smaller on the tallest boards)
        this.cs = Math.min(92, (W - 24) / 3.25) * Math.min(1, k + 0.08) * 0.9 * cf; // carrier art size
        if (r7 && !this.demo) hdr = Math.max(hdr, this.safeT + PLAQUE_B + 5 + this.cs * 0.093); // R11 pres: the front carrier's n/3 tag (its top sits 0.093 cs above hdr) stays 5px clear of the LEVEL plaque
        this.sw = Math.min((this.cs / cf) * 1.05, (W - 16) / 3); // slots keep their spacing when the art shrinks
        this.beltY = hdr + this.cs * 1.08; // room for the big front carrier
        this.bw = Math.min(64, (W - 20) / 5.2) * Math.max(0.7, f);
        this.benchY = this.beltY + (r7 ? 28 : 18) * f + this.bw * 0.46; // clear air between the belt and the cushions
        top = this.benchY + this.bw * (r7 ? 0.5 : 0.4) + (r7 ? 2 : 6);
        this.boardTop = top;
        this.laneB = (r7 ? 80 : 84) * k + this.safeB + (this.extraBottom || 0) * (r7 ? 0.55 : 1) + 2; // r7: the hint is a bubble that may overlap the rug's bottom edge // CSS bottom of the toast lane above the booster bar (and the hint card)
        bottom = this.demo ? this.bottom : this.laneB + (r7 ? 12 : LANE) + (this.tipExtra || 0); // r7: toasts may sit over the rug's bottom edge; a 2-line hint lifts the board by its extra lines
        // R11 fix round 1 (pres): the teaching card gets its own slot. Its box sits 8 px under the lane line (r7.css .tut) and
        // its tail pokes 10 px above it; the rug's rim may run under the card, the cells end above the tail
        if (r7 && !this.demo && this.tutH) bottom = Math.max(bottom, this.laneB - 8 + this.tutH + 12 - padOut);
      }
      const availH = H - top - bottom - 2 * padOut;
      this.cell = Math.max(16, Math.floor(Math.min(availW / w, availH / h, 74)));
      if (this.demo || this.cell >= 40 || f < 0.72 || availW / w < 40) break;
    }
    const c = this.cell;
    this.ox = Math.round((W - c * w) / 2);
    this.oy = Math.round(top + (H - top - bottom - c * h) / 2);
    this.comboY = Math.round((this.benchY + this.bw * 0.4 + this.oy - 10) / 2); // the combo pill: in the gap between the cushions and the rug, clear of every head
    this.paths = this.board.cats.map((cat) => {
      const pts = cat.cells.map(([x, y]) => this.center(x, y));
      const head = cat.cells[cat.cells.length - 1];
      const [dx, dy] = DIRS[cat.dir];
      let ray = 0;
      for (let x = head[0] + dx, y = head[1] + dy; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) ray++;
      cat.ray = ray;
      pts.push(this.center(head[0] + dx * (ray + 2), head[1] + dy * (ray + 2)));
      return makePath(pts);
    });
    if (!this.busy()) { // a resize mid-sprint keeps the animation going; only a quiet board is re-synced
      this.anims = this.anims.filter((a) => a.type !== 'run');
      this.syncVis();
    }
    if (this.on.layout) this.on.layout();
  }

  center(x, y) {
    return [this.ox + (x + 0.5) * this.cell, this.oy + (y + 0.5) * this.cell];
  }

  load(board, { demo = false, top = 104, bottom = 112, extraBottom = 0, tipExtra = 0, tutH = 0 } = {}) {
    this.board = board;
    this.extraBottom = extraBottom;
    this.tipExtra = tipExtra;
    this.tutH = tutH; // R11 fix round 1 (pres): the teaching card's measured height (0: no card)
    this.state = createState(board);
    this.demo = demo;
    this.top = top;
    this.bottom = bottom;
    this.anims = [];
    this.parts = [];
    this.popups = [];
    this.pending = [];
    this.freedLog = [];
    this.log = [];
    this.wiggle = {};
    this.wiggleObj = {};
    this.shake = null;
    this.hintId = null;
    this.cue = null;
    this.press = null;
    this.scoopMode = false;
    this.over = false;
    this.winFired = false;
    this.winPending = false;
    this.sweep = null;
    this.edgeT = -9;
    this.failFired = false;
    this.comboShown = false;
    this.chain = 0;
    this.chainFx = null;
    this.seatNew = null;
    this.popIn = {};
    this.freedT = {}; // cat id -> clock when a tap just opened its way out (its exit arrow pulses once)
    this.prevAlive = null;
    this.demoAt = this.clock + 1.4;
    this.inputAt = this.clock + 0.25; // swallow the second half of a double tap
    // kitten collar colours: one per pair
    let pair = 0;
    for (const cat of board.cats) {
      if (cat.kittenOf != null) {
        const name = COLLARS[pair++ % COLLARS.length];
        cat.collar = name;
        board.cats[cat.kittenOf].collar = name;
      }
    }
    this.layout();
    this.syncVis();
    this.order = board.cats.map((c) => c.id).sort((a, b) => board.cats[a].cells.at(-1)[1] - board.cats[b].cells.at(-1)[1]);
    if (this.autoHint) this.refreshHint();
  }

  // rebuild the carrier queue and bench from the rules state (start, undo, scoop reset)
  syncVis() {
    const s = this.state;
    if (!s) return;
    const prev = this.vis;
    this.vis = {
      carriers: s.carriers.map((c, i) => ({ uid: c.uid, color: c.color, cap: c.cap, fill: c.fill, x: this.slotX(i), sqT: -9, popT: -9, closed: false })),
      leaving: [],
      bench: s.bench.slice(),
      stuck: s.failed ? s.pending.slice() : [],
      benchT: [],
      benchOut: [],
    };
    // cats that came back (undo) pop in
    if (this.prevAlive) {
      for (let i = 0; i < s.alive.length; i++) if (s.alive[i] && !this.prevAlive[i]) this.popIn[i] = this.clock;
    }
    this.prevAlive = s.alive.slice();
    this.syncMech();
    content.sync(this);
    this.pending = this.pending.filter((p) => !p.vis);
    if (prev.leaving.length) this.parts = this.parts.filter((p) => p.kind !== 'conf');
  }

  // dogs, yarn, mystery and frozen cats as the player sees them (trails the rules state by the sprint time)
  syncMech() {
    const s = this.state;
    const mv = { obj: Array.from(s.objAlive, (a) => !!a), hidden: {}, frozen: {}, chip: {}, zzz: s.objs.map((_, k) => dogLeft(s, k)), t: {} };
    for (const cat of s.board.cats) {
      if (!cat.mech) continue;
      mv.hidden[cat.id] = isHidden(s, cat.id);
      mv.frozen[cat.id] = s.frozen[cat.id] === 1;
      mv.chip[cat.id] = s.thaw[cat.id];
    }
    shp.syncFolds(this, mv);
    this.mv = mv;
  }

  // reactions to cats leaving, timed to when the sprinting cat clears the edge
  scheduleMech(events, t0) {
    const at0 = t0 + 0.26;
    shp.scheduleFold(this, events, at0); // flap counts tick, a flap opens
    for (const e of events) {
      if (e.type === 'knock') {
        this.pending.push({ at: at0, vis: true, fn: () => {
          this.mv.obj[e.obj] = false;
          this.anims.push({ type: 'roll', t0: this.clock, dur: this.calm ? 0.5 : 0.95, cell: e.cell, dir: e.dir });
          const [px, py] = this.center(e.cell[0], e.cell[1]);
          this.sparks(px, py, '#ff6b9a', 6);
          if (this.on.mech) this.on.mech(e);
        } });
      } else if (e.type === 'zzz') {
        this.pending.push({ at: at0, vis: true, fn: () => {
          this.mv.zzz[e.obj] = e.left;
          this.mv.t['z' + e.obj] = this.clock;
          if (this.on.mech) this.on.mech(e);
        } });
      } else if (e.type === 'wake') {
        this.pending.push({ at: at0 + 0.1, vis: true, fn: () => {
          this.mv.obj[e.obj] = false;
          this.mv.zzz[e.obj] = 0;
          this.anims.push({ type: 'trot', t0: this.clock, dur: this.calm ? 0.8 : 1.75, cells: e.cells });
          const [px, py] = this.center(e.cells[0][0], e.cells[0][1]);
          this.puff(px, py - this.cell * 0.4);
          if (this.on.mech) this.on.mech(e);
        } });
      } else if (e.type === 'reveal') {
        this.pending.push({ at: at0, vis: true, fn: () => {
          this.mv.hidden[e.id] = false;
          this.popIn[e.id] = this.clock;
          const p = this.cellPos(e.id);
          this.sparks(p.x, p.y, '#ffe45c', 7);
          if (this.on.mech) this.on.mech(e);
        } });
      } else if (e.type === 'chip') {
        this.pending.push({ at: at0, vis: true, fn: () => {
          this.mv.chip[e.id] = THAW_NEED - e.left;
          this.mv.t['c' + e.id] = this.clock;
          const p = this.cellPos(e.id);
          this.sparks(p.x, p.y, '#bfeaff', 5);
          if (this.on.mech) this.on.mech(e);
        } });
      } else if (e.type === 'spin') {
        this.pending.push({ at: at0, vis: true, fn: () => content.spin(this, e) });
      } else if (e.type === 'thaw') {
        this.pending.push({ at: at0 + 0.05, vis: true, fn: () => {
          this.mv.frozen[e.id] = false;
          this.popIn[e.id] = this.clock;
          const p = this.cellPos(e.id);
          this.sparks(p.x, p.y, '#bfeaff', 10);
          if (this.on.mech) this.on.mech(e);
        } });
      }
    }
  }

  // front carrier on the left, two previews to its right (never more than three on screen)
  slotX(i) {
    const k = clamp(i, 0, 4);
    return this.W / 2 + (k - 1) * this.sw + (k > 0 ? this.cs * 0.16 : 0);
  }

  benchGeom(n = this.vis.bench.length) {
    const m = Math.max(5, n);
    const bw = Math.min(this.bw, (this.W - 28) / (m * 1.05)); // 5, 6 or 7 seats all fit with a margin
    return { bw, step: bw * 1.05, n };
  }

  benchPos(seat, n = this.vis.bench.length) {
    const g = this.benchGeom(n);
    return { x: this.W / 2 + (seat - (n - 1) / 2) * g.step, y: this.benchY, bw: g.bw };
  }

  carrierMouth() {
    const f = this.vis.carriers[0]; // the next carrier may still be rolling in: hops land where it really is
    return { x: f ? f.x : this.slotX(0), y: this.beltY - this.cs * 0.6 };
  }

  stuckPos(k) {
    const n = Math.max(5, this.vis.bench.length);
    const p = this.benchPos(n - 1, n);
    return { x: p.x + 4, y: p.y - p.bw * (0.85 + 0.55 * k) };
  }

  // continue: +1 bench seat, the cat that found no seat moves in
  heartsAdd() {
    if (!this.state || !this.state.failed) return; // only ever answers a real bench-full failure
    const r = addSeat(this.state);
    this.log.push({ op: 'seat', t: this.clock });
    this.vis.bench.push(-1);
    this.seatNew = { i: this.vis.bench.length - 1, t0: this.clock };
    this.failFired = false;
    this.over = false;
    const stuck = this.vis.stuck.slice();
    this.vis.stuck = [];
    const info = {};
    for (const id of stuck) info[id] = { from: this.stuckPos(stuck.indexOf(id)), arrive: this.clock + 0.35 };
    this.scheduleEvents(r.events, info, this.clock, stuck);
    this.checkFailed(r, info);
    if (this.state.failed) this.pending.push({ at: this.clock + 0.4, vis: true, fn: () => { this.vis.stuck = this.state.pending.slice(); } }); // a second cat may still lack a seat: keep it drawn above the bench
    if (r.won) this.winPending = true;
  }

  setHint() {
    this.hintId = solverHint(this.state);
    return this.hintId;
  }

  refreshHint() {
    if (this.state && !isWon(this.state)) this.hintId = solverHint(this.state);
  }

  busy() {
    return this.anims.some((a) => a.type === 'run' || a.type === 'hop') || this.vis.leaving.length > 0 || this.pending.some((p) => p.vis || p.blk);
  }

  // Undo the last tap or scoop. Only while the board is quiet.
  undoMove() {
    if (this.demo || !this.state || this.busy() || !canUndo(this.state)) return false;
    const r = rulesUndo(this.state);
    if (!r.ok) return false;
    this.log.push({ op: 'undo', t: this.clock });
    this.anims = [];
    this.over = false;
    this.failFired = false;
    this.winPending = false;
    this.hintId = null;
    this.cue = null;
    this.press = null;
    this.syncVis();
    if (this.autoHint) this.refreshHint();
    return true;
  }

  // R11 teaching marks (no text on the board): after a lost bench, the carrier the stuck cat needs, with how many
  // departures stand before it; after Take back, the cushion that came free and one cat that can board right now
  cueNeed(color) { this.cue = { t0: this.clock, need: color }; }
  cueBack(seat, cat) { this.cue = { t0: this.clock, seat, cat, dur: 3.4 }; }
  cueOn(k) { const c = this.cue; return !!c && c[k] != null && c[k] !== -1 && (!c.dur || this.clock - c.t0 < c.dur); }

  // ---- input ----
  // A free cat is committed on release: while the finger is down its destination lights up (the carrier slot or the
  // bench cushions it would take, numbered in arrival order, or a red warning when it would find no seat). Sliding off
  // the cat cancels. Blocked and frozen cats bonk at once; Scoop acts at once.
  onPointer(e) {
    this.press = null;
    if (this.demo || !this.state || this.clock < this.inputAt) return;
    if (document.querySelector('#modal, .fake-ad')) return;
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (shp.flapPointer(this, px, py)) return; // a closed flap: it wiggles, its cats are not on the board yet
    const id = this.hitCat(px, py);
    if (id < 0) {
      const gx = Math.floor((px - this.ox) / this.cell), gy = Math.floor((py - this.oy) / this.cell);
      const { w, h } = this.state;
      const o = gx >= 0 && gy >= 0 && gx < w && gy < h ? this.state.grid[gy * w + gx] : -1;
      if (o < -1) this.wiggleObj[-2 - o] = { t: this.clock, dx: 0, dy: -1 };
    }
    if (id >= 0) {
      e.preventDefault();
      if (this.scoopMode) this.scoopCat(id);
      else if (this.over || !canExit(this.state, id)) this.tapCat(id);
      else {
        this.press = { id, pid: e.pointerId, t: this.clock, dest: this.destOf(id) };
        try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
      }
    }
  }

  onRelease(e, cancel = false) {
    const p = this.press;
    if (!p || (e && e.pointerId !== p.pid)) return;
    this.press = null;
    if (cancel || !this.state || this.over) return;
    const r = this.canvas.getBoundingClientRect();
    if (this.hitCat(e.clientX - r.left, e.clientY - r.top) === p.id) this.tapCat(p.id);
  }

  onMove(e) {
    const p = this.press;
    if (!p || e.pointerId !== p.pid) return;
    const r = this.canvas.getBoundingClientRect();
    if (this.hitCat(e.clientX - r.left, e.clientY - r.top) !== p.id) this.press = null; // dragged off: cancelled
  }

  // where a tap on a free cat would send each leaving cat (a dry run on the rules state, undone at once):
  // [{ kind: 'carrier' | 'seat' | 'fail', seat?, color, k }] in arrival order. A hidden mystery cat shows nothing.
  destOf(id) {
    const st = this.state;
    if (isHidden(st, id) || this.busy()) return [];
    const queue = st.carriers.map((c) => c.color);
    const r = tap(st, id);
    if (!r.ok) return [];
    const freeAfter = st.benchSize - st.benchUsed;
    rulesUndo(st, true);
    const out = [];
    for (const e of r.events) {
      if (e.type === 'load') out.push({ kind: 'carrier', color: e.color, k: out.length + 1 });
      // wait = how many carriers roll in before this colour's (the clue a bench choice turns on)
      else if (e.type === 'bench') out.push({ kind: 'seat', seat: e.seat, color: e.color, k: out.length + 1, wait: Math.max(1, queue.indexOf(e.color)) });
      else if (e.type === 'fail') out.push({ kind: 'fail', color: this.board.cats[e.id].color, k: out.length + 1 });
    }
    // the tap takes the LAST free cushion (and nothing frees it on the way): flagged amber before the finger lifts
    const seats = out.filter((d) => d.kind === 'seat').length;
    if (seats && freeAfter === 0 && !out.some((d) => d.kind === 'fail')) out.last = true;
    return out;
  }

  // the press preview's lane: the cat's way out to the edge, cell by cell, with chevrons running outward
  drawLane(ctx, id, u) {
    const cat = this.board.cats[id];
    const c = this.cell;
    const { w, h } = this.state;
    const ld = content.dirOf(this, id); // a swivel cat faces where its bed turned
    const [dx, dy] = DIRS[ld];
    const [hx, hy] = cat.cells[cat.cells.length - 1];
    ctx.save();
    let i = 0;
    for (let x = hx + dx, y = hy + dy; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy, i++) {
      ctx.globalAlpha = 0.22 + 0.12 * u;
      ctx.fillStyle = '#fff6e5';
      this.rr(ctx, this.ox + x * c + 4, this.oy + y * c + 4, c - 8, c - 8, c * 0.22);
      ctx.fill();
      const ph = this.calm ? 0 : ((this.clock * 3 - i * 0.35) % 1 + 1) % 1;
      drawChevron(ctx, this.ox + (x + 0.5) * c, this.oy + (y + 0.5) * c, FACE[ld], c * 0.32, 0.45 + 0.45 * (1 - ph));
    }
    ctx.restore();
  }

  // a speech bubble over the pressed cat: where it is headed (its carrier's pattern, or a cushion and how many
  // carriers it would wait), amber with LAST SEAT when it takes the final free cushion, red when no seat is left
  drawPressBubble(ctx, p) {
    const d0 = p.dest[0];
    const hp = this.cellPos(p.id);
    const r = Math.max(13, this.cell * 0.36);
    const last = !!p.dest.last;
    const bad = p.dest.some((d) => d.kind === 'fail');
    const x = clamp(hp.x, r * 1.6, this.W - r * 1.6);
    const y = Math.max(r * 1.4, hp.y - this.cell * 0.95);
    ctx.save();
    ctx.fillStyle = bad ? '#e53935' : last ? '#ffb300' : '#fffaf0';
    ctx.strokeStyle = bad ? '#fff' : NAVY;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.3, y + r * 0.85);
    ctx.lineTo(x, y + r * 1.35);
    ctx.lineTo(x + r * 0.3, y + r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (bad) drawBadge(ctx, x, y, r * 0.8, '!', '#e53935');
    else if (d0.kind === 'carrier') drawPatBadge(ctx, COLOR_PAL[d0.color], x, y, r * 0.66);
    else {
      const cush = IMG['r7/cushion'] || IMG['v2/cushion'];
      const cw = r * 1.5;
      if (cush) ctx.drawImage(cush, x - cw / 2, y - cw * (cush.height / cush.width) * 0.6, cw, cw * (cush.height / cush.width));
      drawBadge(ctx, x + r * 0.72, y - r * 0.62, r * 0.42, d0.wait, COLOR_PAL[d0.color].base);
    }
    if (last && this.lastSeatText) {
      ctx.save();
      ctx.font = `800 ${Math.round(r * 0.72)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(this.lastSeatText).width + 14;
      const tx = clamp(x, tw / 2 + 4, this.W - tw / 2 - 4), ty = y - r * 1.55;
      ctx.fillStyle = '#ffb300';
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 2.5;
      this.rr(ctx, tx - tw / 2, ty - r * 0.5, tw, r, r * 0.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = NAVY;
      ctx.fillText(this.lastSeatText, tx, ty + 1);
      ctx.restore();
    }
  }

  // L4's clue before the first tap: each free cat that would have to park shows how many carriers it would wait
  drawWaitTags(ctx) {
    if (!this.waitTags || this.demo || this.press || this.busy()) return;
    const st = this.state;
    if (st.benchUsed || st.aliveCount !== this.board.cats.length) { this.waitTags = false; return; }
    const queue = st.carriers.map((c) => c.color);
    for (const cat of this.board.cats) {
      if (cat.kittenOf != null || !canExit(st, cat.id)) continue;
      const k = queue.indexOf(cat.color);
      if (k <= 0) continue;
      const hp = this.cellPos(cat.id);
      const r = Math.max(10, this.cell * 0.24);
      const bob = this.calm ? 0 : Math.sin(this.clock * 4 + cat.id) * 2;
      drawBadge(ctx, hp.x + this.cell * 0.34, hp.y - this.cell * 0.42 + bob, r, k, k >= 2 ? '#e8590c' : '#2f9e44');
    }
  }

  // a friend's challenge before the first tap: the front carrier ("boards here") and one cushion ("waits here") ringed
  drawRulesTeach(ctx) {
    if (!this.rulesTeach || this.demo || this.press || !this.board) return;
    const st = this.state;
    if (st.benchUsed || st.aliveCount !== this.board.cats.length) { this.rulesTeach = false; return; }
    const [tb, tw] = this.teachTexts || ['', ''];
    const u = this.calm ? 0.7 : 0.5 + 0.5 * Math.sin(this.clock * 5);
    const f = this.vis.carriers[0];
    const b = this.benchPos(0, this.vis.bench.length);
    const marks = [
      { x: f ? f.x : this.slotX(0), y: this.beltY - this.cs * 0.5, rx: this.cs * 0.62, ry: this.cs * 0.56, text: tb, up: true },
      { x: b.x, y: b.y, rx: b.bw * 0.56, ry: b.bw * 0.4, text: tw, up: false },
    ];
    for (const m of marks) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,190,30,${0.65 + 0.35 * u})`;
      ctx.lineWidth = 4;
      ctx.setLineDash([9, 6]);
      ctx.lineDashOffset = this.calm ? 0 : -this.clock * 20;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.rx * (1 + 0.04 * u), m.ry * (1 + 0.04 * u), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (m.text) {
        const fs = Math.max(11, Math.round(this.cell * 0.26));
        ctx.font = `800 ${fs}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(m.text).width + 16;
        const tx = clamp(m.x, w / 2 + 4, this.W - w / 2 - 4);
        const ty = m.y + m.ry + fs * (m.up ? 0.9 : 0.6); // both tags hang below their ring: the carrier's on the belt, the cushion's over the board edge
        ctx.fillStyle = '#ffd43b';
        ctx.strokeStyle = NAVY;
        ctx.lineWidth = 2.5;
        this.rr(ctx, tx - w / 2, ty - fs * 0.75, w, fs * 1.5, fs * 0.75);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = NAVY;
        ctx.fillText(m.text, tx, ty + 1);
      }
      ctx.restore();
    }
  }

  // the pressed cat's destination: pulsing rings with the arrival number
  drawPress(ctx) {
    const p = this.press;
    if (!p || !p.dest.length || this.demo) return;
    const u = this.calm ? 1 : 0.55 + 0.45 * Math.sin((this.clock - p.t) * 10);
    const last = !!p.dest.last;
    for (const d of p.dest) {
      let x, y, rr;
      if (d.kind === 'carrier') {
        const f = this.vis.carriers[0];
        x = f ? f.x : this.slotX(0);
        y = this.beltY - this.cs * 0.5;
        rr = this.cs * 0.5;
      } else if (d.kind === 'seat') {
        const b = this.benchPos(d.seat);
        x = b.x; y = b.y; rr = b.bw * 0.56;
      } else {
        const s = this.stuckPos(0);
        x = s.x; y = s.y; rr = this.benchGeom().bw * 0.5;
      }
      const bad = d.kind === 'fail';
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * u;
      ctx.lineWidth = 4;
      ctx.strokeStyle = bad ? '#e53935' : last && d.kind === 'seat' ? '#ffb300' : '#fff6e5';
      ctx.setLineDash(bad || (last && d.kind === 'seat') ? [6, 5] : []);
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * (d.kind === 'carrier' ? 0.9 : 0.8), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.strokeStyle = bad ? '#fff' : COLOR_PAL[d.color].base;
      ctx.beginPath();
      ctx.ellipse(x, y, rr - 4, (rr - 4) * (d.kind === 'carrier' ? 0.9 : 0.8), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (p.dest.length > 1 || bad) drawBadge(ctx, x + rr * 0.72, y - rr * 0.62, Math.max(9, rr * 0.3), bad ? '!' : d.k, bad ? '#e53935' : NAVY);
    }
  }

  // drawn over the board (after the cats): the lane out and the destination bubble of the pressed cat
  drawPressTop(ctx) {
    const p = this.press;
    if (!p || !p.dest.length || this.demo || !this.state.alive[p.id]) return;
    const u = this.calm ? 1 : 0.5 + 0.5 * Math.sin((this.clock - p.t) * 10);
    this.drawLane(ctx, p.id, u);
    this.drawPressBubble(ctx, p);
  }

  hitCat(px, py) {
    const c = this.cell;
    const { w, h } = this.state;
    const gx = Math.floor((px - this.ox) / c);
    const gy = Math.floor((py - this.oy) / c);
    if (gx >= 0 && gy >= 0 && gx < w && gy < h) {
      const o = this.state.grid[gy * w + gx];
      if (o >= 0) return o;
    }
    let best = -1;
    let bd = c * 0.5;
    for (let y = gy - 1; y <= gy + 1; y++) {
      for (let x = gx - 1; x <= gx + 1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const o = this.state.grid[y * w + x];
        if (o < 0) continue;
        const [cx, cy] = this.center(x, y);
        const d = Math.hypot(px - cx, py - cy);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
    }
    return best;
  }

  // CSS-pixel centre of a cat's head (k < 0) or of its k-th cell
  cellPos(id, k = -1) {
    const cat = this.board.cats[id];
    const cell = k < 0 ? cat.cells[cat.cells.length - 1] : cat.cells[k];
    const [x, y] = this.center(cell[0], cell[1]);
    return { x, y };
  }

  // returns the rules result, or null when ignored
  tapCat(id) {
    if (!this.state || this.over) return null;
    if (this.anims.some((a) => a.type === 'bonk' && a.id === id)) return null;
    if (this.state.alive[id] === 0) return null;
    const n = this.board.cats.length;
    const was = this.demo ? null : this.board.cats.map((c) => this.state.alive[c.id] && canExit(this.state, c.id));
    const r = tap(this.state, id);
    if (r.gone || r.over || r.folded) return r;
    if (!this.demo && r.ok) this.log.push({ op: 'tap', id, t: this.clock, b: (r.events || []).filter((e) => e.type === 'board').length }); // a bonk changes nothing on the board
    if (was && r.ok) { // one or two cats whose way out this tap just opened: point at them once the runner is gone
      const opened = [];
      for (let i = 0; i < n; i++) if (!was[i] && i !== id && this.state.alive[i] && canExit(this.state, i)) opened.push(i);
      if (opened.length && opened.length <= 2) for (const i of opened) this.freedT[i] = this.clock + 0.35;
    }
    if (!this.demo) {
      const hp = this.cellPos(id);
      this.look = { id, x: hp.x, y: hp.y, t: this.clock };
    }
    if (r.bonk) this.addBonk(r);
    else this.startRun(r, { ray: true });
    if (r.ok) { this.hintId = null; this.cue = null; } // any real move makes the old hint stale (the auto-hint of L1-3 refreshes itself)
    fun.onTap(this, r);
    return r;
  }

  // Scoop booster: lift any cat straight to its seat, blockers or not. null = not allowed.
  scoopCat(id) {
    if (!this.state || this.over || !this.state.alive[id]) return null;
    if (this.on.scoopCan && !this.on.scoopCan()) {
      this.scoopMode = false;
      return null;
    }
    const r = rulesScoop(this.state, id);
    if (!r.ok) {
      if (r.full && this.on.scoopFull) this.on.scoopFull();
      return r;
    }
    this.scoopMode = false;
    if (!this.demo) this.log.push({ op: 'scoop', id, t: this.clock, b: (r.events || []).filter((e) => e.type === 'board').length });
    this.startRun(r, { ray: false });
    this.hintId = null;
    if (this.on.scoop) this.on.scoop(r);
    return r;
  }

  addBonk(r) {
    const cat = this.board.cats[r.id];
    const c = this.cell;
    const head = cat.cells.at(-1);
    const bdir = content.dirOf(this, r.id);
    const [dx, dy] = DIRS[bdir];
    if (r.frozen) {
      // frozen: a stiff little shiver, ice chips, no lane
      this.anims.push({ type: 'bonk', id: r.id, t0: this.clock, emax: 0.22 * c, headCell: head, blockerCell: null });
      const p = this.cellPos(r.id);
      this.sparks(p.x, p.y, '#bfeaff', 9);
      this.mv.t['c' + r.id] = this.clock;
      this.mv.t['k' + r.id] = this.clock; // the ice flashes a crack
      if (!this.calm) this.shake = { t0: this.clock + 0.02, dx: dx * 0.6, dy: dy * 0.6 };
      if (this.on.bonk) this.on.bonk(r);
      return;
    }
    const k = Math.abs(r.blockerCell[0] - head[0]) + Math.abs(r.blockerCell[1] - head[1]);
    const emax = Math.min((k - 1) * c + 0.2 * c, 2.6 * c);
    this.anims.push({ type: 'bonk', id: r.id, t0: this.clock, emax, headCell: head, blockerCell: r.blockerCell, dir: bdir });
    if (r.blockerObj >= 0) this.wiggleObj[r.blockerObj] = { t: this.clock + 0.12, dx, dy };
    else this.wiggle[r.blockerId] = { t: this.clock + 0.12, dx, dy };
    if (!this.calm) this.shake = { t0: this.clock + 0.09, dx, dy };
    if (this.on.bonk) this.on.bonk(r);
  }

  // path for one cat: its cells (plus the cells it trails behind), out along the exit ray, then a curve to the target
  buildPath(cells, dirKey, ray, target) {
    const c = this.cell;
    const pts = cells.map(([x, y]) => this.center(x, y));
    const head = cells[cells.length - 1];
    const [dx, dy] = DIRS[dirKey];
    const E = ray >= 0 ? this.center(head[0] + dx * (ray + 0.9), head[1] + dy * (ray + 0.9)) : pts[pts.length - 1];
    if (ray >= 0) pts.push(E);
    if (!target) {
      pts.push([E[0] + dx * c * 8, E[1] + dy * c * 8]);
    } else {
      const dist = Math.hypot(target.x - E[0], target.y - E[1]);
      const k1 = Math.min(dist * 0.18, 0.8 * c); // turn toward the carrier right at the rug edge (no long swing off screen)
      const k2 = Math.min(dist * 0.35, 2.2 * c);
      const p1 = [clamp(E[0] + dx * k1, 10, this.W - 10), clamp(E[1] + dy * k1, 10, this.H - 10)]; // keep the leap on screen
      // a leap, not a slide: the arc bows out to the side and tops out just over the mouth, so the paws come down into it
      const side = Math.abs(dx) > 0 ? 0 : (target.x >= E[0] ? -1 : 1) * Math.min(dist * 0.22, 0.9 * c);
      p1[0] = clamp(p1[0] + side, 10, this.W - 10);
      const p2 = [target.x + side * 0.4, target.y - Math.min(k2 * 0.25, 0.45 * c)];
      for (let i = 1; i <= 18; i++) {
        const u = i / 18, v = 1 - u;
        const a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u;
        pts.push([a * E[0] + b * p1[0] + d * p2[0] + e * target.x, a * E[1] + b * p1[1] + d * p2[1] + e * target.y]);
      }
    }
    return makePath(pts);
  }

  // where a freed cat ends up, from the rules events
  targetOf(id, events) {
    const e = events.find((x) => (x.type === 'load' || x.type === 'bench') && x.id === id);
    if (!e) return { kind: 'stuck', pos: null };
    if (e.type === 'load') return { kind: 'carrier', pos: this.carrierMouth(), e };
    return { kind: 'bench', pos: this.benchPos(e.seat), e };
  }

  startRun(r, { ray }) {
    const c = this.cell;
    const cats = this.board.cats;
    const freed = r.freed;
    const lead = cats[freed[0]];
    const events = r.events || [];
    const ex = content.exitOf(this, lead); // a swivel cat leaves the way its bed faces
    const dirKey = ex.dir;
    const t0 = this.clock;
    const members = [];
    let stuckK = this.vis.stuck.length;
    for (const id of freed) {
      const cat = cats[id];
      const trailing = id !== freed[0];
      const cells = trailing ? [...cat.cells, ...lead.cells] : cat.cells;
      const tg = this.targetOf(id, events);
      if (tg.kind === 'stuck') tg.pos = this.stuckPos(stuckK++);
      const path = this.buildPath(cells, dirKey, ray ? ex.ray : -1, tg.pos);
      members.push({ id, path, headBase: path.marks[cat.cells.length - 1], len: path.len, tg, edgeS: ray ? path.marks[cells.length - 1] + (ex.ray + 0.5) * c : -1, puffed: false, arrived: false, arrAt: 0 });
    }
    const Dmax = Math.max(...members.map((m) => m.len));
    const speed = 1500 * (this.W / 375);
    const T = this.calm ? Math.max(0.3, Dmax / (speed * 1.4)) : clamp(Dmax / speed, 0.42, 0.8);
    const sig = this.calm ? 0 : SIG;
    const anim = { type: 'run', t0, T, Dmax, members, k: (this.calm ? 0.1 : 0.28) * c, scoop: !ray, sig }; // k: how far the head pulls back in the crouch
    // arrival time of each head at its target (the stretched head lands well before the tail would)
    for (const m of members) {
      const dArr = (m.len - m.headBase) / (1 + sig);
      let lo = 0, hi = 1;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (this.runDist(anim, ANT + mid * T) < dArr) lo = mid; else hi = mid;
      }
      m.arrAt = t0 + ANT + hi * T;
    }
    anim.end = Math.max(...members.map((m) => m.arrAt)) + FOLD + (this.calm ? 0 : FLICK);
    for (let i = this.anims.length - 1; i >= 0; i--) {
      if (this.anims[i].type === 'bonk' && freed.includes(this.anims[i].id)) this.anims.splice(i, 1);
    }
    this.anims.push(anim);
    if (ray) content.run(this, lead, t0); // a spring cat's boing over the cat it hops
    // paw prints on the cells the cats leave
    let i = 0;
    for (const m of freed) {
      for (const [x, y] of cats[m].cells) {
        const [px, py] = this.center(x, y);
        this.parts.push({ kind: 'paw', x: px, y: py, delay: this.clock + i * 0.035, max: 0.7, life: 0.7, s: c * 0.42 });
        i++;
      }
    }
    // combo bookkeeping (quick taps)
    const now = this.clock;
    for (let n = 0; n < freed.length; n++) this.freedLog.push(now);
    this.freedLog = this.freedLog.filter((t) => now - t <= 2);
    const count = this.freedLog.length;
    const purrfect = count >= 3 && !this.comboShown;
    if (purrfect) {
      this.comboShown = true;
      this.popup(1 + (this.comboN = (this.comboN || 0) + 1) % 2); // 'Purrfect!' is kept for a flawless win
    }
    if (this.on.free) this.on.free({ ids: freed, step: Math.max(0, count - 1), purrfect, count });
    if (this.autoHint) this.pending.push({ at: now + 0.35, fn: () => this.refreshHint() });
    for (const id of freed) {
      this.mv.hidden[id] = false;
      this.mv.frozen[id] = false;
    }
    this.scheduleMech(events, now);
    const info = {};
    for (const m of members) info[m.id] = { arrive: m.arrAt };
    this.scheduleEvents(events, info, now, []);
    if (!this.demo) this.checkFailed(r, info, members);
    if (r.won) this.winPending = true;
  }

  // a cat that found no seat parks above the bench; the offer card follows
  checkFailed(r, info, members) {
    if (!r.failed) return;
    let at = this.clock;
    for (const k of Object.keys(info)) at = Math.max(at, info[k].arrive);
    const ids = members ? members.filter((m) => m.tg.kind === 'stuck').map((m) => m.id) : [];
    for (const id of ids) this.pending.push({ at: info[id].arrive, vis: true, fn: () => this.vis.stuck.push(id) });
    this.pending.push({ at: at + 0.7, blk: true, fn: () => this.fireFail() });
  }

  // Turn rules events into timed visual changes. info[id] = { arrive, from? } per cat that moved.
  scheduleEvents(events, info, t0, fromStuck) {
    let cur = t0;
    let hops = 0;
    // two or more parked cats hopping in from one tap = a bench chain: slow motion, camera nudge, rising notes, stamp
    const nb = this.demo ? 0 : events.filter((e) => e.type === 'board').length;
    const fx = nb >= 2 ? { n: nb, k: 0, kT: -9, t0: 0, t1: 0 } : null;
    for (const e of events) {
      if (e.type === 'load' || e.type === 'bench') {
        const inf = info[e.id] || { arrive: cur };
        const at = inf.arrive;
        cur = Math.max(cur, at);
        if (fromStuck.includes(e.id)) this.addHop(inf.from, e, at - 0.32, at);
        this.pending.push({ at, vis: true, fn: () => (e.type === 'load' ? this.visLoad(e) : this.visBench(e)) });
      } else if (e.type === 'depart') {
        cur += 0.12;
        hops = 0;
        this.pending.push({ at: cur, vis: true, fn: () => this.visDepart(e) });
      } else if (e.type === 'board') {
        const at = cur + (hops ? 0.12 : this.calm ? 0.32 : 0.5); // staggered hops, one every 0.42 s; the first waits a wake beat (parked cats sit up)
        hops++;
        this.pending.push({ at, vis: true, seat: e.seat, cat: e.id, fn: () => this.visBoard(e, fx) });
        if (fx) { fx.t0 = fx.t0 || at; fx.t1 = at + 0.3; }
        cur = at + 0.3;
      }
    }
    if (fx) this.pending.push({ at: fx.t0 - 0.2, vis: true, fn: () => { this.chainFx = fx; if (this.on.chain) this.on.chain({ n: fx.n }); } });
  }

  // slow motion runs from just before the first hop until the last parked cat is in
  // the 2nd and later hops of a chain each get a brief 0.6x beat (~0.25 s); never with reduced motion
  chainSlow() {
    const f = this.chainFx;
    return !!f && !this.calm && f.k >= 2 && this.clock - f.kT >= 0 && this.clock - f.kT < 0.25;
  }

  visLoad(e) {
    const vc = this.vis.carriers.find((c) => c.uid === e.carrier);
    if (!vc) return;
    vc.fill = Math.min(vc.cap, vc.fill + 1);
    vc.sqT = this.clock;
    vc.popT = this.clock;
    this.sparks(this.slotX(0), this.beltY - this.cs * 0.5, COLOR_PAL[vc.color].base, 7);
    if (this.on.land) this.on.land({ kind: 'carrier', fill: vc.fill, cap: vc.cap });
  }

  visBench(e) {
    // the seat was freed in the rules by a hop that has not played yet: sit down right after that cat leaves
    const hop = this.pending.filter((p) => p.seat === e.seat && p.cat !== e.id && this.vis.bench[e.seat] === p.cat).sort((x, y) => x.at - y.at)[0];
    if (hop) { this.pending.push({ at: hop.at + 0.02, vis: true, fn: () => this.visBench(e) }); return; }
    this.vis.bench[e.seat] = e.id;
    this.vis.benchT[e.seat] = this.clock;
    const p = this.benchPos(e.seat);
    this.sparks(p.x, p.y, COLOR_PAL[e.color].base, 5);
    if (this.on.land) this.on.land({ kind: 'bench' });
  }

  visBoard(e, fx) {
    const from = this.benchPos(e.seat);
    if (this.vis.bench[e.seat] === e.id) this.vis.bench[e.seat] = -1; // a later cat may already sit there (vis trails rules)
    this.vis.benchOut[e.seat] = this.clock; // R11: the cushion springs back up as its cat launches
    this.addHop(from, e, this.clock, this.clock + 0.3, fx ? fx.k + 1 : 0);
    if (fx) {
      fx.k++;
      fx.kT = this.clock;
      if (fx.k >= 2) this.edgeSparkle();
      if (this.on.hop) this.on.hop({ k: fx.k, n: fx.n });
    }
    this.pending.push({ at: this.clock + 0.3, vis: true, fn: () => {
      this.visLoad(e);
      if (!fx) return;
      fx.land = (fx.land || 0) + 1; // the counter beside the bench ticks when each cat lands, not when it jumps
      fx.landT = this.clock;
      if (fx.land === fx.n) this.chainBurst(fx);
      if (this.on.chainLand) this.on.chainLand({ k: fx.land, n: fx.n, last: fx.land === fx.n });
    } });
  }

  // where the chain counter sits: in the strip of air between the cushions and the rug, under the bench's middle
  chainPos() {
    return { x: this.W / 2, y: this.comboY };
  }

  // the chain's last landing: gold sparkles burst out of the counter
  chainBurst() {
    if (this.demo) return;
    const p = this.chainPos();
    const n = this.calm ? 4 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = 90 + Math.random() * 80;
      this.parts.push({ kind: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * v * 1.4, vy: Math.sin(a) * v * 0.7, life: 0.55, max: 0.6, color: i % 2 ? '#fff3b0' : '#ffd43b', s: 5 + Math.random() * 4 });
    }
  }

  addHop(from, e, t0, t1, k = 0) {
    this.anims.push({ type: 'hop', t0, dur: t1 - t0, from, color: e.color, k, to: () => this.carrierMouth() });
  }

  // a chain's 2nd+ hop: sparkles rise along both screen edges and the edges glow gold for a moment
  edgeSparkle() {
    if (this.demo) return;
    this.edgeT = this.clock;
    const n = this.calm ? 3 : 9;
    const y0 = this.beltY - this.cs, y1 = this.oy + this.board.h * this.cell;
    for (const side of [0, 1]) {
      for (let i = 0; i < n; i++) {
        const x = side ? this.W - 6 - Math.random() * 16 : 6 + Math.random() * 16;
        this.parts.push({ kind: 'spark', x, y: y0 + Math.random() * (y1 - y0), vx: (side ? -1 : 1) * (20 + Math.random() * 40), vy: -60 - Math.random() * 90, life: 0.5 + Math.random() * 0.35, max: 0.85, color: i % 2 ? '#fff3b0' : '#ffd43b', s: 4 + Math.random() * 5 });
      }
    }
  }

  visDepart(e) {
    const i = this.vis.carriers.findIndex((c) => c.uid === e.carrier);
    if (i < 0) return;
    const vc = this.vis.carriers.splice(i, 1)[0];
    vc.fill = vc.cap;
    vc.closed = true;
    vc.leaveT = this.clock;
    vc.x0 = vc.x;
    this.vis.leaving.push(vc);
    const now = this.clock;
    this.chain = now - this.lastDepart < 3.2 ? this.chain + 1 : 1;
    this.lastDepart = now;
    this.confettiAt(vc.x, this.beltY - this.cs * 0.5, this.calm ? 6 : this.chain >= 2 ? 34 : 18); // a chain departure gets the bigger burst
    this.sparks(vc.x - this.cs * 0.42, this.beltY - this.cs * 0.45, '#ffffff', 5); // the door snaps shut
    this.dust(vc.x + this.cs * 0.3, this.beltY, 4);
    if (this.chain >= 2 && !(this.chainFx && this.clock < this.chainFx.t1 + 1.9)) { // the chain counter already speaks (it holds 1.5 s after the last landing)
      this.popup(this.chain >= 3 ? 2 : 1);
      if (!this.demo) this.inputAt = Math.max(this.inputAt, this.clock + 0.3); // a short beat so a stray tap cannot bury the chain
    }
    if (this.on.depart) this.on.depart({ n: e.n, chain: this.chain });
  }

  // combo text: the HUD shows it in the band above the conveyor, never over the bench or the board
  popup(i) {
    if (this.demo) return;
    const text = this.texts[Math.min(i, this.texts.length - 1)];
    if (this.on.combo) this.on.combo(text);
    else this.popups.push({ t0: this.clock, dur: 1.2, text });
  }

  // credit a cleared board right away when the player leaves before the win card shows
  flushWin() {
    if (this.demo || !this.state || !isWon(this.state)) return;
    const w = this.pending.find((p) => p.win);
    if (w) {
      this.pending = this.pending.filter((p) => p !== w);
      w.fn();
    } else if (!this.winFired && this.winPending) {
      this.winFired = true;
      this.winPending = false;
      if (this.on.win) this.on.win(starsOf(this.state));
    }
  }

  fireFail() {
    if (this.failFired) return;
    this.failFired = true;
    this.over = true;
    if (this.on.fail) this.on.fail();
  }

  // ---- update ----
  update(dt) {
    const now = this.clock;
    this.anims = this.anims.filter((a) => {
      if (a.type === 'run') return now < a.end; // + the body folding in and the tail flick
      if (a.type === 'hop' || a.type === 'roll' || a.type === 'trot') return now - a.t0 < a.dur;
      return now - a.t0 < 0.85;
    });
    for (const a of this.anims) { // paw prints behind the trotting dog
      if (a.type !== 'trot') continue;
      const p = this.trotPose(a);
      if (p.run <= 0 || p.run >= 0.95 || now < (a.pawAt || 0)) continue;
      a.pawAt = now + 0.09;
      a.pawK = (a.pawK || 0) + 1;
      const x = (p.a0[0] + p.b0[0]) / 2 + p.dx - p.dir * this.cell * 0.6, y = (p.a0[1] + p.b0[1]) / 2 + (a.pawK % 2 ? -1 : 1) * this.cell * 0.16;
      if (x > this.ox - this.cell * 0.3 && x < this.ox + this.board.w * this.cell + this.cell * 0.3) this.parts.push({ kind: 'paw', x, y, delay: now, max: 1.2, life: 1.2, s: this.cell * 0.36, dog: true });
    }
    for (const a of this.anims) {
      if (a.type !== 'run') continue;
      const d = this.runDist(a, now - a.t0);
      for (const m of a.members) {
        if (m.edgeS >= 0 && !m.puffed && m.headBase + d * (1 + a.sig) >= m.edgeS) {
          m.puffed = true;
          const p = sample(m.path, m.edgeS);
          this.puff(p.x, p.y);
        }
      }
    }
    {
      const cs = this.vis.carriers;
      // the next carrier holds its slot until the full one has driven off, so the two never overlap
      const hold = this.vis.leaving.some((vc) => this.clock - vc.leaveT < 0.4) ? 1 : 0;
      for (let i = 0; i < cs.length; i++) {
        const vc = cs[i], to = this.slotX(i + hold);
        vc.x += (to - vc.x) * (1 - Math.exp(-dt * 12));
        // a carrier rolling into the front slot lands with a bounce and a puff of dust
        if (i === 0 && Math.abs(vc.x - to) > this.sw * 0.3) vc.rolling = true;
        else if (i === 0 && vc.rolling && Math.abs(vc.x - to) < 2.5) { vc.rolling = false; vc.sqT = this.clock; vc.landT = this.clock; this.dust(vc.x + this.cs * 0.4, this.beltY, 3); }
      }
      for (const vc of this.vis.leaving) { // the full carrier kicks up dust as it drives off
        const t = this.clock - vc.leaveT;
        if (t > 0.2 && this.clock >= (vc.dustAt || 0)) { vc.dustAt = this.clock + 0.06; this.dust(this.leaveX(vc) + this.cs * 0.45, this.beltY, 1); }
      }
      this.vis.leaving = this.vis.leaving.filter((vc) => this.leaveX(vc) > -this.cs * 1.2);
    }
    if (this.freedLog.length && now - this.freedLog[this.freedLog.length - 1] > 2) {
      this.freedLog = [];
      this.comboShown = false;
    }
    for (const p of this.parts) {
      if (p.kind === 'conf') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 900 * dt;
        p.vx *= 0.99;
        p.rot += p.vr * dt;
        p.life -= dt;
      } else if (p.kind === 'dust') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.life -= dt;
      } else if (p.kind === 'spark') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= dt;
      } else if (now >= p.delay) p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    this.popups = this.popups.filter((p) => now - p.t0 < p.dur);
    const due = this.pending.filter((p) => now >= p.at);
    this.pending = this.pending.filter((p) => now < p.at);
    due.sort((a, b) => a.at - b.at);
    for (const p of due) p.fn();
    if (this.state && this.winPending && !this.busy() && isWon(this.state) && !this.winFired) {
      this.winFired = true;
      this.winPending = false;
      if (!this.demo) {
        if (!this.calm) this.sweep = { t0: now + 0.05 }; // the last cat is in: a sparkle sweep across the cleared rug, then the card
        this.confetti();
        this.pending.push({ at: now + 0.9, blk: true, win: true, fn: () => this.on.win && this.on.win(starsOf(this.state)) });
      }
    }
    if (this.demo) this.updateDemo();
  }

  updateDemo() {
    if (!this.state) return;
    if (this.state.failed || this.state.aliveCount === 0) {
      if (this.anims.length === 0 && !this.pending.length && !this.vis.leaving.length && this.clock > this.demoAt + 1.6 && this.on.demoReset) this.on.demoReset();
      return;
    }
    if (this.clock >= this.demoAt && !this.anims.length) {
      // the home hero shows the real move first: a free cat of the front carrier's colour runs into it
      const f = this.state.carriers[0];
      const match = f && this.board.cats.find((c) => this.state.alive[c.id] && c.color === f.color && !findBlocker(this.state, c.id));
      const id = match ? match.id : solverHint(this.state);
      if (id != null) this.tapCat(id);
      this.demoAt = this.clock + 0.9;
    }
  }

  // distance the tail has advanced along the path at time t (seconds since the run began)
  runDist(a, t) {
    const k = a.k;
    if (t < ANT) return -k * (t / ANT);
    const u = Math.min(1, (t - ANT) / a.T);
    return -k * (1 - u) + (a.Dmax + k) * rampD(u);
  }

  leaveX(vc) {
    const t = this.clock - vc.leaveT - 0.2;
    return t <= 0 ? vc.x0 : vc.x0 - t * 120 - t * t * (this.calm ? 900 : 1800);
  }

  // soft dust puffs (carrier wheels)
  dust(x, y, n) {
    if (this.calm) n = Math.min(n, 1);
    for (let i = 0; i < n; i++) {
      this.parts.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 10, y: y - Math.random() * 6, vx: 40 + Math.random() * 60, vy: -20 - Math.random() * 30, life: 0.45 + Math.random() * 0.2, max: 0.6, s: this.cs * (0.12 + Math.random() * 0.08) });
    }
  }

  // little burst where a head leaves the board
  puff(x, y) {
    const n = this.calm ? 4 : 12;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 90 + Math.random() * 200;
      this.parts.push({
        kind: 'conf', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 90,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, life: 0.5 + Math.random() * 0.3,
        color: i % 3 === 0 ? '#ff6b9a' : i % 3 === 1 ? '#ffd43b' : '#ffffff', s: 5 + Math.random() * 4,
      });
    }
  }

  sparks(x, y, color, n = 6) {
    if (this.calm) n = Math.min(n, 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 70 + Math.random() * 90;
      this.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.2, max: 0.6, color: i % 2 ? '#ffffff' : color, s: 5 + Math.random() * 4 });
    }
  }

  confettiAt(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 160 + Math.random() * 320;
      this.parts.push({
        kind: 'conf', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, life: 0.8 + Math.random() * 0.5,
        color: CONFETTI[i % CONFETTI.length], s: 5 + Math.random() * 5,
      });
    }
  }

  confetti() {
    const cx = this.W / 2;
    const cy = this.oy + (this.board.h * this.cell) / 2;
    const n = this.calm ? 30 : 130;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 220 + Math.random() * 520;
      this.parts.push({
        kind: 'conf', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 380,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, life: 1.8 + Math.random() * 0.8,
        color: CONFETTI[i % CONFETTI.length], s: 6 + Math.random() * 6,
      });
    }
  }

  // ---- draw ----
  draw() {
    const ctx = this.ctx;
    const { dpr } = this;
    const L = this.pf ? this.pf.split() : null; // R11 juice: split frame = still board on its own layer, moving cats + fx low-res (perf.js)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawBg(ctx);
    if (!this.board) return;
    ctx.save();
    if (this.shake) {
      const u = (this.clock - this.shake.t0) / 0.28;
      if (u >= 0 && u < 1) {
        const a = 5 * (1 - u) * Math.cos(u * 14);
        ctx.translate(this.shake.dx * a, this.shake.dy * a);
      }
    }
    const fx = this.chainFx;
    if (fx && !this.calm) {
      // camera nudge: a slow push-in on the bench while the chain hops in, eased back out after the last hop
      const e = smooth((this.clock - fx.t0 + 0.2) / 0.3) * (1 - smooth((this.clock - fx.t1 - 0.1) / 0.45));
      const kick = landKick(this); // R11 juice: the last landing punches the camera in
      if (e > 0 || kick > 0) {
        const s = 1 + 0.045 * e + kick;
        const fy = this.benchY - this.cs * 0.3;
        ctx.translate(this.W / 2, fy);
        ctx.scale(s, s);
        ctx.translate(-this.W / 2, -fy);
      }
    }
    shp.unfoldCam(this, ctx); // a flap opening: the camera leans in, then settles on the grown board
    if (this.pf) this.pf.camera(ctx); // the baked underlay follows the camera
    if (L) L.cam(ctx);
    {
      this.drawBelt(ctx);
      this.drawBench(ctx);
      if (this.pf) this.pf.carriers(ctx); // soft baked shadows under the carriers
      this.drawCarriers(ctx);
      this.drawPress(ctx);
      fun.drawUnder(this, ctx);
    }
    this.drawBoard(ctx);
    const now = this.clock;
    const animIds = new Set();
    for (const a of this.anims) if (a.type === 'bonk') animIds.add(a.id);
    if (!L || L.board) { const ctx = L ? L.board : this.ctx; // R11 juice: a split frame redraws the still board only when it changed
    this.drawObjs(ctx);
    for (const a of this.anims) if (a.type === 'roll') this.drawRoll(ctx, a); // a knocked yarn ball rolls under the cats, never over them
    for (const id of this.order) {
      if (!this.state.alive[id] || animIds.has(id) || shp.underFlap(this, id)) continue; // a cat under a closed flap is not drawn at all
      if (L && L.clip && !this.pf.inClip(id)) continue; // R11 fix round 1: a partial redraw paints only the cats it touches
      this.drawStatic(ctx, id);
    }
    for (const cat of this.board.cats) if (cat.kittenOf != null) this.drawTether(ctx, cat, animIds);
    shp.drawFlaps(this, ctx); // closed flaps over their folded cats (one baked sprite each)
    if (L && L.clip) { ctx.restore(); L.clip = false; } // the dirty-rectangle clip (perf.js split)
    }
    { const ctx = L ? L.fx : this.ctx; // R11 juice: moving cats and particles (the low-res layer on a split frame)
    for (const a of this.anims) {
      if (a.type === 'bonk') this.drawBonk(ctx, a);
      else if (a.type === 'trot') this.drawTrot(ctx, a);
      else if (a.type === 'unfold') shp.drawUnfold(this, ctx, a);
    }
    for (const p of this.parts) {
      if (p.kind === 'paw' && now >= p.delay) drawPaw(ctx, p.x, p.y, p.s, Math.min(1, p.life / p.max) * 0.8, p.dog ? '#b97a3c' : undefined);
    }
    for (const a of this.anims) {
      if (a.type === 'run') this.drawRun(ctx, a);
      else if (a.type === 'hop') this.drawHop(ctx, a);
    }
    for (const p of this.parts) {
      if (p.kind === 'conf') {
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66);
        ctx.restore();
      } else if (p.kind === 'dust') {
        const u = 1 - p.life / p.max;
        ctx.save();
        ctx.globalAlpha = 0.45 * (1 - u);
        ctx.fillStyle = '#f3e2c4';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * (0.6 + u), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'spark') {
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / p.max * 1.4);
        ctx.translate(p.x, p.y);
        ctx.fillStyle = p.color;
        const s = p.s * (0.5 + p.life / p.max);
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.3, -s * 0.3); ctx.lineTo(s, 0); ctx.lineTo(s * 0.3, s * 0.3);
        ctx.lineTo(0, s); ctx.lineTo(-s * 0.3, s * 0.3); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.3, -s * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    }
    this.drawPressTop(ctx);
    fun.drawTop(this, ctx);
    this.drawWaitTags(ctx);
    this.drawRulesTeach(ctx);
    this.drawSweep(L ? L.fx : ctx);
    ctx.restore();
    if (L) L.flat();
    this.drawEdgeGlow(L ? L.fx : ctx);
    drawLandPulse(this, L ? L.fx : ctx); // R11 juice: the screen pulse of the chain's last landing
    this.drawStamp(L ? L.top : ctx);
    for (const p of this.popups) this.drawPopup(ctx, p);
  }

  // board clear: a band of light sweeps across the rug, scattering sparkles, before the result card
  drawSweep(ctx) {
    const sw = this.sweep;
    if (!sw) return;
    const u = (this.clock - sw.t0) / 0.7;
    if (u < 0 || u > 1.2) return;
    const x0 = this.ox, y0 = this.oy, bw = this.board.w * this.cell, bh = this.board.h * this.cell;
    const span = bw + bh;
    const pos = -bh * 0.5 + span * Math.min(1, u);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, bw, bh);
    ctx.clip();
    ctx.translate(x0 + pos, y0 + bh / 2);
    ctx.rotate(0.5);
    const g = ctx.createLinearGradient(-this.cell, 0, this.cell, 0);
    g.addColorStop(0, 'rgba(255,240,180,0)');
    g.addColorStop(0.5, `rgba(255,250,215,${0.75 * (1 - Math.max(0, u - 0.85) / 0.35)})`);
    g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-this.cell, -span, this.cell * 2, span * 2);
    ctx.restore();
    if (u <= 1 && this.clock >= (sw.at || 0)) {
      sw.at = this.clock + 0.04;
      for (let i = 0; i < 2; i++) {
        const k = Math.random();
        const px = x0 + pos + (k - 0.5) * bh * 0.55, py = y0 + bh * k; // a point on the tilted band, inside the rug
        if (px > x0 && px < x0 + bw) this.parts.push({ kind: 'spark', x: px, y: py, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 60, life: 0.5, max: 0.6, color: i ? '#ffffff' : '#ffd43b', s: 5 + Math.random() * 4 });
      }
    }
  }

  // gold glow along both screen edges for a chain's 2nd+ hop
  drawEdgeGlow(ctx) {
    const t = this.clock - this.edgeT;
    if (t < 0 || t > 0.6 || this.demo) return;
    const a = 0.55 * (1 - t / 0.6);
    if (this.pf && this.pf.edgeGlow(a)) return; // R11 juice: two DOM strips, faded by the compositor
    const w = 26;
    ctx.save();
    for (const side of [0, 1]) {
      const g = ctx.createLinearGradient(side ? this.W : 0, 0, side ? this.W - w : w, 0);
      g.addColorStop(0, `rgba(255,212,59,${a})`);
      g.addColorStop(1, 'rgba(255,212,59,0)');
      ctx.fillStyle = g;
      ctx.fillRect(side ? this.W - w : 0, 0, w, this.H);
    }
    ctx.restore();
  }

  // the chain counter: a ribbon in the air under the bench (the boarding stays clear), it appears with the first landing
  // and ticks up with each cat that lands in the carrier; the last landing gets the big gold pop
  drawStamp(ctx) {
    const f = this.chainFx;
    if (!f || !f.land || this.demo || this.noStamp) return; // noStamp: the share clip draws its own single chain caption
    const last = f.land === f.n;
    const t = this.clock - f.landT;
    if (last && t > 1.5) return;
    const al = last && t > 1.1 ? 1 - (t - 1.1) / 0.4 : 1;
    const pop = stampScale(this, f, t, last); // R11 juice: each tick a bit bigger, the last one lands huge and springs
    const size = Math.round(clamp(this.W * 0.052, 17, 24));
    const p = this.chainPos();
    ctx.save();
    ctx.globalAlpha = clamp(al, 0, 1);
    ctx.font = `700 ${size}px ${FONT}`;
    const text = last ? this.chainText(f.n) : `×${f.land}`; // a plain tick per landing, the full words on the last one
    const tw = ctx.measureText(text).width;
    ctx.translate(p.x, p.y);
    ctx.rotate(last ? -0.06 : -0.03);
    ctx.scale(pop, pop);
    const sp = this.pf && stampSprite(this, text, size, tw, last); // R11 juice: the ribbon baked once per tick
    if (sp) { ctx.drawImage(sp.cv, sp.x, sp.y, sp.w, sp.h); ctx.restore(); return; }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.fillStyle = last ? '#ffb703' : '#ff6b9a';
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 3;
    this.rr(ctx, -tw / 2 - 12, -size * 0.6, tw + 24, size * 1.2, size * 0.45);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = Math.max(4, size * 0.2);
    ctx.strokeStyle = NAVY;
    ctx.strokeText(text, 0, 1);
    ctx.fillStyle = last ? '#fff6d0' : '#ffffff';
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  // mother and kitten: a little heart leash from her tail to its head (in her colour), not collar bars
  drawTether(ctx, kit, animIds) {
    const mom = this.board.cats[kit.kittenOf];
    const s = this.state;
    if (!mom || !s.alive[kit.id] || !s.alive[mom.id] || animIds.has(kit.id) || animIds.has(mom.id)) return;
    const c = this.cell;
    const [ax, ay] = this.center(kit.cells.at(-1)[0], kit.cells.at(-1)[1]);
    const [bx, by] = this.center(mom.cells[0][0], mom.cells[0][1]);
    const d = Math.hypot(bx - ax, by - ay);
    if (d < 1 || d > c * 1.6) return;
    const ux = (bx - ax) / d, uy = (by - ay) / d;
    const pal = this.mv.hidden[mom.id] ? MYSTERY_PAL : COLOR_PAL[mom.color];
    const sag = this.calm ? 0 : Math.sin(this.clock * 2.4 + kit.id) * c * 0.03;
    const x0 = ax + ux * c * 0.18, y0 = ay + uy * c * 0.18;
    const x1 = bx - ux * c * 0.12, y1 = by - uy * c * 0.12;
    const mx = (x0 + x1) / 2 - uy * c * 0.08, my = (y0 + y1) / 2 + c * 0.1 + sag;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = Math.max(4, c * 0.09);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
    ctx.strokeStyle = pal.base;
    ctx.lineWidth = Math.max(2, c * 0.05);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
    // heart charm on the leash
    const hx = (x0 + 2 * mx + x1) / 4, hy = (y0 + 2 * my + y1) / 4;
    const r = c * 0.13 * (this.calm ? 1 : 1 + 0.06 * Math.sin(this.clock * 4 + kit.id));
    ctx.translate(hx, hy);
    ctx.beginPath();
    ctx.moveTo(0, r * 0.95);
    ctx.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.7, -r * 1.25, 0, -r * 0.45);
    ctx.bezierCurveTo(r * 0.7, -r * 1.25, r * 1.5, -r * 0.1, 0, r * 0.95);
    ctx.closePath();
    ctx.fillStyle = '#ff5d8f';
    ctx.fill();
    ctx.lineWidth = Math.max(2, c * 0.04);
    ctx.strokeStyle = NAVY;
    ctx.stroke();
    ctx.restore();
  }

  // the room behind the board (the perf underlay bakes it): a bought room (shop lane) beats a pack theme (content lane),
  // else the sunny room
  roomArt() {
    const bought = shopRoom();
    if (bought) return { img: bought, key: 'shop:' + bought.src };
    return content.room(this) || { img: IMG['r7/bg_play_room'], key: 'play' };
  }

  drawBg(ctx) {
    if (this.pf && this.pf.bg(ctx)) { if (!shopRoom()) content.ambient(this, ctx); return; } // baked room: clear, then only the pack's live rain/petals
    const { W, H } = this;
    const bought = shopRoom();
    if (!bought && content.bg(this, ctx)) return; // a themed pack room (content lane); a bought room wins
    const room = bought || IMG['r7/bg_play_room']; // a shop room theme, else the sunny room
    if (room) {
      // the sunny boarding room: one painted layer, cover-fit, never tiled
      const sc = Math.max(W / room.width, H / room.height);
      const dw = room.width * sc, dh = room.height * sc;
      ctx.drawImage(room, (W - dw) / 2, (H - dh) / 2, dw, dh);
      if (!this.calm) { // the window light drifts by a few percent (cheap: one gradient)
        const a = 0.05 + 0.03 * Math.sin(this.clock * (Math.PI / 3));
        const g = ctx.createLinearGradient(W, 0, W * 0.35, H * 0.55);
        g.addColorStop(0, `rgba(255,214,140,${a * 2})`);
        g.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      return;
    }
    ctx.fillStyle = '#1fb5ad';
    ctx.fillRect(0, 0, W, H);
    const tile = IMG.bg_teal;
    if (tile) {
      if (!this.bgPat) {
        this.bgPat = ctx.createPattern(tile, 'repeat');
        if (this.bgPat && this.bgPat.setTransform) this.bgPat.setTransform(new DOMMatrix().scale(0.36));
      }
      if (this.bgPat) {
        ctx.fillStyle = this.bgPat;
        ctx.fillRect(0, 0, W, H);
      }
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(14,140,134,0.0)');
    g.addColorStop(0.7, 'rgba(14,140,134,0.0)');
    g.addColorStop(1, 'rgba(8,90,92,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 9-slice: src insets si (px), dest insets di
  nine(ctx, im, x, y, w, h, si, di) {
    const sw = im.width, sh = im.height;
    const xs = [0, si, sw - si, sw], ys = [0, si, sh - si, sh];
    const xd = [x, x + di, x + w - di, x + w], yd = [y, y + di, y + h - di, y + h];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const dw = xd[i + 1] - xd[i], dh = yd[j + 1] - yd[j];
      if (dw > 0 && dh > 0) ctx.drawImage(im, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j], xd[i], yd[j], dw + 0.5, dh + 0.5);
    }
  }

  // r7: stitched rust rug (table_top 9-slice) with a soft contact shadow, ivory tiles with hairline seams
  drawBoard7(ctx) {
    if (this.board.shape && shp.drawShapedRug(this, ctx)) return; // shape lane: the rug follows the board's outline
    const { w, h } = this.board;
    const c = this.cell;
    const gx = this.ox, gy = this.oy, gw = c * w, gh = c * h;
    const R = this.rugR;
    const x0 = gx - R - 3, y0 = gy - R - 3, rw = gw + 2 * (R + 3), rh = gh + 2 * (R + 3);
    ctx.save();
    ctx.shadowColor = 'rgba(60,30,10,0.28)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = -6;
    ctx.shadowOffsetY = 8;
    this.rr(ctx, x0 + 4, y0 + 4, rw - 8, rh - 8, R);
    ctx.fillStyle = '#BD582F';
    ctx.fill();
    ctx.restore();
    this.nine(ctx, IMG['r7/table_top'], x0, y0, rw, rh, 84, R * 1.55);
    ctx.fillStyle = '#E8D5B0';
    ctx.fillRect(gx - 1, gy - 1, gw + 2, gh + 2);
    const tile = IMG['r7/tile_ivory'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (tile) ctx.drawImage(tile, gx + x * c + 0.75, gy + y * c + 0.75, c - 1.5, c - 1.5);
      else { ctx.fillStyle = '#FFF0D3'; ctx.fillRect(gx + x * c + 0.75, gy + y * c + 0.75, c - 1.5, c - 1.5); }
    }
    // a whisper of the window light across the tiles (evenly lit: just enough to feel the sun)
    const g = ctx.createLinearGradient(gx + gw, gy, gx, gy + gh);
    g.addColorStop(0, 'rgba(255,236,190,0.18)');
    g.addColorStop(1, 'rgba(120,70,30,0.06)');
    ctx.fillStyle = g;
    ctx.fillRect(gx, gy, gw, gh);
  }

  // orange fringed rug with a cream grid
  drawBoard(ctx) {
    if (this.pf && this.pf.owns(ctx)) return; // baked on the underlay
    if (IMG['r7/table_top']) { this.drawBoard7(ctx); return; }
    const { w, h } = this.board;
    const c = this.cell;
    const gx = this.ox, gy = this.oy, gw = c * w, gh = c * h;
    const pad = 10, fr = 6;
    ctx.save();
    // fringe: dashed ticks around the rug edge
    ctx.setLineDash([2.4, 2.6]);
    ctx.lineWidth = fr + 3;
    ctx.strokeStyle = '#ffb02e';
    this.rr(ctx, gx - pad - fr * 0.4, gy - pad - fr * 0.4, gw + 2 * (pad + fr * 0.4), gh + 2 * (pad + fr * 0.4), 20);
    ctx.stroke();
    ctx.setLineDash([]);
    // rug body
    ctx.shadowColor = 'rgba(0,60,70,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    this.rr(ctx, gx - pad, gy - pad, gw + 2 * pad, gh + 2 * pad, 16);
    const g = ctx.createLinearGradient(0, gy - pad, 0, gy + gh + pad);
    g.addColorStop(0, '#ff9a2e');
    g.addColorStop(1, '#ff7a1a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#e8650f';
    ctx.lineWidth = 2;
    this.rr(ctx, gx - pad + 3, gy - pad + 3, gw + 2 * pad - 6, gh + 2 * pad - 6, 13);
    ctx.stroke();
    // cream board
    this.rr(ctx, gx - 4, gy - 4, gw + 8, gh + 8, 10);
    ctx.fillStyle = '#fff3d9';
    ctx.fill();
    ctx.strokeStyle = '#d98a3a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(205,160,100,0.42)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 1; x < w; x++) { ctx.moveTo(gx + x * c, gy); ctx.lineTo(gx + x * c, gy + gh); }
    for (let y = 1; y < h; y++) { ctx.moveTo(gx, gy + y * c); ctx.lineTo(gx + gw, gy + y * c); }
    ctx.stroke();
    // corner paw prints on the rug
    for (const [px, py] of [[gx - pad * 0.5, gy - pad * 0.5], [gx + gw + pad * 0.5, gy - pad * 0.5], [gx - pad * 0.5, gy + gh + pad * 0.5], [gx + gw + pad * 0.5, gy + gh + pad * 0.5]]) {
      drawPaw(ctx, px, py + 1, 9, 0.9, '#fff3d9');
    }
  }

  drawBelt(ctx) {
    const { W } = this;
    const y = this.beltY;
    const belt = IMG['r7/belt_wood'];
    if (belt) {
      // wooden toy belt with brass end rollers; the carriers stand on its top face
      const bw = W * 0.96, bh = bw * (belt.height / belt.width) * 0.72;
      const kick = this.calm ? 0 : this.beltKick();
      if (this.pf && this.pf.belt(ctx, belt, (W - bw) / 2, y - bh * 0.3, bw, bh, ['rgba(60,30,10,0.25)', 8, -3, 4], kick)) return; // R11 juice: a baked layer, the kick by CSS
      if (this.pf && this.pf.shadowImage(ctx, belt, (W - bw) / 2 + kick, y - bh * 0.3, bw, bh, ['rgba(60,30,10,0.25)', 8, -3, 4])) return; // shadow baked once
      ctx.save();
      ctx.shadowColor = 'rgba(60,30,10,0.25)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = -3;
      ctx.shadowOffsetY = 4;
      ctx.drawImage(belt, (W - bw) / 2 + kick, y - bh * 0.3, bw, bh);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,50,60,0.3)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    this.rr(ctx, W * 0.03, y - 3, W * 0.94, 17, 8);
    ctx.fillStyle = '#4b5b6e';
    ctx.fill();
    ctx.restore();
    this.rr(ctx, W * 0.03, y - 3, W * 0.94, 17, 8);
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#7c8ca1';
    const off = this.calm ? 0 : (this.clock * 26) % 26;
    ctx.save();
    this.rr(ctx, W * 0.03 + 2, y - 1, W * 0.94 - 4, 13, 6);
    ctx.clip();
    for (let x = W * 0.03 - 26 + off; x < W * 0.97; x += 26) {
      ctx.fillStyle = '#8c9cb0';
      disc(ctx, x, y + 5.5, 4.2);
      ctx.fillStyle = '#4b5b6e';
      disc(ctx, x, y + 5.5, 1.6);
    }
    ctx.restore();
  }

  // the belt "stop-click": a carrier just left, the belt overshoots one notch and settles
  beltKick() {
    const l = this.vis.leaving[this.vis.leaving.length - 1];
    if (!l || l.leaveT == null) return 0;
    const t = this.clock - l.leaveT - 0.2;
    return t > 0 && t < 0.5 ? -Math.sin(t * 26) * Math.exp(-t * 9) * 3 : 0;
  }

  // r7: one oak plank cut into seat cells (any seat count keeps a hollow under every cushion)
  drawPlank(ctx, n) {
    const im = IMG['r7/bench_plank'];
    if (!im || !n || (this.pf && this.pf.owns(ctx))) return; // baked on the underlay
    const { step } = this.benchGeom(n);
    const cellS = im.width * 0.1865, cap = im.width * 0.127 - cellS / 2;
    const sc = step / cellS;
    const sh = im.height * 0.8; // the plank without its legs: the bench sits on the table edge
    const h = sh * sc;
    const x0 = this.benchPos(0, n).x - step / 2;
    const y0 = this.benchY - im.height * 0.43 * sc;
    ctx.save();
    ctx.shadowColor = 'rgba(60,30,10,0.28)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = -3;
    ctx.shadowOffsetY = 5;
    ctx.drawImage(im, 0, 0, cap, sh, x0 - cap * sc, y0, cap * sc + 0.5, h);
    for (let i = 0; i < n; i++) ctx.drawImage(im, cap, 0, cellS, sh, x0 + i * step, y0, step + 0.6, h);
    ctx.drawImage(im, im.width - cap, 0, cap, sh, x0 + n * step, y0, cap * sc, h);
    ctx.restore();
  }

  drawBench(ctx) {
    const n = this.vis.bench.length;
    const r7 = !!IMG['r7/cushion'];
    const cush = r7 ? IMG['r7/cushion'] : IMG['v2/cushion'];
    if (r7) this.drawPlank(ctx, n);
    const free = this.vis.bench.filter((x) => x < 0).length;
    for (let i = 0; i < n; i++) {
      const { x, y, bw } = this.benchPos(i, n);
      const sn = this.seatNew && this.seatNew.i === i ? this.clock - this.seatNew.t0 : 99;
      if (sn < 2.4) {
        // the seat that was just paid for pops in with a golden rim
        const pu = sn < 0.4 ? easeBack(sn / 0.4) : 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(pu, pu);
        ctx.strokeStyle = '#ffd43b';
        ctx.globalAlpha = Math.min(1, (2.4 - sn) / 0.6);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(0, 0, bw * (0.56 + 0.05 * Math.sin(sn * 9)), bw * 0.44, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const yel = !r7 && this.vis.bench[i] >= 0 && COLOR_PAL[this.board.cats[this.vis.bench[i]].color].name === 'yellow';
      const art = yel && IMG.cushion_alt ? IMG.cushion_alt : cush; // a yellow cat never melts into a yellow cushion (v2: yellow cushion)
      if (r7 && art) {
        const cw = bw * 0.92, ch = cw * (art.height / art.width);
        // R11: a cat launching off it squashes the cushion, which springs back (0.4 s, inside the hop)
        const lo = this.calm ? 99 : this.clock - (this.vis.benchOut[i] ?? -9);
        if (lo >= 0 && lo < 0.4) {
          const k = Math.exp(-lo * 9) * Math.cos(lo * 26) * 0.16;
          ctx.save();
          ctx.translate(x, y + ch * 0.48);
          ctx.scale(1 + k * 0.6, 1 - k);
          ctx.drawImage(art, -cw / 2, -ch, cw, ch);
          ctx.restore();
        } else ctx.drawImage(art, x - cw / 2, y - ch * 0.52, cw, ch);
        if (this.cueOn('seat') && this.cue.seat === i && this.vis.bench[i] < 0) { // Take back: the cushion that came free
          const u = this.calm ? 0.7 : 0.5 + 0.5 * Math.sin((this.clock - this.cue.t0) * 7);
          ctx.save();
          ctx.globalAlpha = Math.min(1, (this.cue.dur - (this.clock - this.cue.t0)) / 0.5);
          ctx.strokeStyle = `rgba(67,176,71,${0.65 + 0.35 * u})`;
          ctx.fillStyle = `rgba(155,230,150,${0.18 + 0.12 * u})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(x, y, cw * (0.54 + 0.05 * u), ch * 0.52, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          drawBadge(ctx, x + cw * 0.36, y - ch * 0.42, Math.max(8, bw * 0.13), '✓', '#2f9e44');
        }
        if (free === 1 && this.vis.bench[i] < 0 && !this.demo) { // the last free seat pulses amber, with a "!" tag
          const u = this.calm ? 0.6 : 0.5 + 0.5 * Math.sin(this.clock * 6);
          ctx.save();
          ctx.fillStyle = `rgba(255,179,0,${0.16 + 0.14 * u})`;
          ctx.strokeStyle = `rgba(255,160,0,${0.6 + 0.4 * u})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(x, y, cw * (0.52 + 0.05 * u), ch * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          drawBadge(ctx, x + cw * 0.36, y - ch * 0.42, Math.max(8, bw * 0.13), '!', '#f08c00');
        }
      } else if (art) ctx.drawImage(art, x - bw * 0.5, y - bw * 0.5, bw, bw);
      else {
        ctx.fillStyle = '#ffd51f';
        ctx.beginPath();
        ctx.ellipse(x, y, bw * 0.46, bw * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const id = this.vis.bench[i];
      if (id >= 0) {
        const t = this.clock - (this.vis.benchT[i] ?? -9);
        const pop = t < 0.35 ? 1 + 0.18 * Math.sin((t / 0.35) * Math.PI) * (1 - t / 0.35 * 0.4) : 1;
        // its carrier is at the front: the parked cat wakes (sits up with a "!") just before it hops in
        const fc = this.vis.carriers[0];
        const woke = !this.demo && fc && !fc.closed && fc.fill < fc.cap && fc.color === this.board.cats[id].color;
        const lift = woke && !this.calm ? bw * (0.1 + 0.05 * Math.abs(Math.sin(this.clock * 12))) : 0;
        this.drawCurled(ctx, x, y - bw * 0.04 - lift, bw * pop, this.board.cats[id].color, id);
        if (woke) drawBadge(ctx, x + bw * 0.3, y - bw * 0.5 - lift, bw * 0.15, '!', COLOR_PAL[fc.color].base);
      }
    }
    // cats waiting for a seat (bench full)
    this.vis.stuck.forEach((id, k) => {
      const p = this.stuckPos(k);
      const bob = Math.sin(this.clock * 9 + k) * 3;
      this.drawCurled(ctx, p.x, p.y + bob, this.benchGeom(Math.max(5, n)).bw, this.board.cats[id].color, id);
      ctx.save();
      ctx.translate(p.x + 14, p.y - 22 + bob);
      ctx.fillStyle = '#e53935';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `700 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 1);
      ctx.restore();
    });
  }

  // a small curled-up cat (bench seat, hop-in flight)
  drawCurled(ctx, x, y, bw, color, id = 0) {
    const pal = COLOR_PAL[color];
    const curl = pal && IMG[`r7/cat_curl_${pal.name}`];
    if (curl) {
      const cw = bw * 0.98, ch = cw * (curl.height / curl.width);
      ctx.save();
      ctx.fillStyle = 'rgba(60,30,10,0.22)';
      ctx.beginPath();
      ctx.ellipse(x - cw * 0.04, y + ch * 0.3, cw * 0.4, ch * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      const br = this.calm ? 1 : 1 + 0.025 * Math.sin(this.clock * 2.2 + id); // sleepy breathing
      ctx.translate(x, y + ch * 0.36);
      ctx.scale(1, br);
      ctx.drawImage(curl, -cw / 2, -ch, cw, ch);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.ellipse(bw * 0.06, bw * 0.06, bw * 0.36, bw * 0.23, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.base;
    ctx.beginPath();
    ctx.ellipse(bw * 0.06, bw * 0.05, bw * 0.32, bw * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();
    drawPatBadge(ctx, pal, bw * 0.2, bw * 0.06, bw * 0.1);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bw * 0.37, bw * 0.0, bw * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    const blink = this.blinkOf(id);
    drawHead(ctx, color, x - bw * 0.1, y - bw * 0.15, 0, bw * 0.62, 1, { blink, mood: id % 2 ? 3 : 1 });
  }

  drawCarriers(ctx) {
    const { carriers, leaving } = this.vis;
    // a full carrier snaps shut, wiggles, then drives off to the left along the belt (below the HUD row);
    // the next one waits in its slot until the way is clear
    for (const vc of leaving) {
      const t = this.clock - vc.leaveT;
      const x = this.leaveX(vc);
      const wob = t < 0.2 ? Math.sin(t * 70) * 0.07 * (1 - t / 0.2) : -0.08 * Math.min(1, (t - 0.2) * 6);
      const hop = this.calm ? 0 : -Math.abs(Math.sin(clamp(t - 0.2, 0, 1) * 18)) * this.cs * 0.05;
      this.drawCarrier(ctx, vc, x, 1.16 * (1 - 0.2 * clamp(t / 0.6, 0, 1)), false, wob, hop);
    }
    for (let i = carriers.length - 1; i >= 0; i--) {
      const vc = carriers[i];
      if (vc.x > this.slotX(2) + this.sw * 0.5) continue; // front + two previews only (also while the queue waits for a departure)
      const near = clamp(1 - (vc.x - this.slotX(0)) / this.sw, 0, 1);
      const lean = i === 0 && vc.rolling && !this.calm ? -0.12 * clamp((vc.x - this.slotX(0)) / this.sw, 0, 1) : 0; // rolling in: leans into the move
      this.drawCarrier(ctx, vc, vc.x, 0.9 + 0.26 * near, i === 0, lean);
    }
    this.drawQueueRest(ctx);
    if (this.cueOn('need')) this.drawNeedCue(ctx);
  }

  // R11, a lost bench: the carrier the stuck cat needs glows (in its slot, or its dot in the queue capsule) with the
  // number of carriers that have to leave before it, so the loss reads on the board, not only on the card
  drawNeedCue(ctx) {
    const k = this.vis.carriers.findIndex((c) => !c.closed && c.color === this.cue.need);
    if (k < 1) return;
    const u = this.calm ? 0.7 : 0.5 + 0.5 * Math.sin((this.clock - this.cue.t0) * 6);
    let x, y, rx, ry;
    if (k <= 2) {
      const vc = this.vis.carriers[k];
      const sc = 0.9 + 0.26 * clamp(1 - (vc.x - this.slotX(0)) / this.sw, 0, 1);
      x = vc.x; y = this.beltY - this.cs * 0.5 * sc; rx = this.cs * 0.66 * sc; ry = this.cs * 0.58 * sc;
    } else { // its dot in the capsule after the two previews
      const r = clamp(this.cs * 0.1, 6, 9);
      const show = Math.min(3, this.vis.carriers.length - 3);
      const h = show * r * 2.25 + (this.vis.carriers.length - 3 > show ? r * 1.9 : 0) + r * 0.6;
      x = Math.min(this.W - r * 1.35 - 6, this.slotX(2) + this.cs * 0.62);
      y = k - 3 < 3 ? this.beltY - 6 - h + r * 1.4 + (k - 3) * r * 2.25 : this.beltY - 6 - r * 1.05;
      rx = ry = r * 1.7;
    }
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(255,93,143,${0.6 + 0.4 * u})`;
    ctx.setLineDash(this.calm ? [] : [10, 6]);
    ctx.lineDashOffset = this.calm ? 0 : -(this.clock - this.cue.t0) * 30;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * (1 + 0.04 * u), ry * (1 + 0.04 * u), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // the count of departures before it, on a pink tag hanging under the ring
    const br = Math.max(10, this.cs * 0.15);
    drawBadge(ctx, x - rx * 0.62, y + ry * 0.62, br, String(k), '#ff5d8f');
  }

  // the queue after the two previews: a capsule of pattern dots in order plus a +N count, so a player can
  // always see when a colour is coming
  drawQueueRest(ctx) {
    const rest = this.vis.carriers.slice(3);
    if (!rest.length || this.demo) return;
    const r = clamp(this.cs * 0.1, 6, 9);
    const show = rest.slice(0, 3);
    const more = rest.length - show.length;
    const x = Math.min(this.W - r * 1.35 - 6, this.slotX(2) + this.cs * 0.62);
    const h = show.length * r * 2.25 + (more ? r * 1.9 : 0) + r * 0.6;
    const y1 = this.beltY - 6;
    const y0 = y1 - h;
    ctx.save();
    this.rr(ctx, x - r * 1.35, y0, r * 2.7, h, r * 1.35);
    ctx.fillStyle = 'rgba(255,246,229,0.94)';
    ctx.fill();
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 2;
    ctx.stroke();
    show.forEach((vc, k) => drawPatBadge(ctx, COLOR_PAL[vc.color], x, y0 + r * 1.4 + k * r * 2.25, r));
    if (more) {
      ctx.fillStyle = NAVY;
      ctx.font = `700 ${Math.round(r * 1.25)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+' + more, x, y1 - r * 1.05);
    }
    ctx.restore();
  }

  drawCarrier(ctx, vc, x, sc, front, rot = 0, dy = 0) {
    if (IMG['r7/carrier_orange']) { this.drawCarrier7(ctx, vc, x, sc, front, rot, dy); return; }
    const cs = this.cs;
    const art = IMG[`carrier_${vc.closed ? 'closed' : 'open'}_${vc.color}`];
    const t = this.clock - vc.sqT;
    let sx = 1, sy = 1;
    if (t < 0.5) {
      const k = Math.exp(-t * 9) * Math.cos(t * 24) * 0.14;
      sy = 1 - k;
      sx = 1 + k * 0.7;
    }
    if (vc.closed && vc.leaveT != null) {
      const q = this.clock - vc.leaveT;
      const k = closeSquash(q, this.calm); // R11 juice: the lid slams, squash then stretch
      sy *= 1 - k; sx *= 1 + k * 0.8;
    }
    const dl = this.clock - (vc.popT ?? -9);
    const dip = !this.calm && !vc.closed && dl >= 0 && dl < 0.32 ? Math.sin((dl / 0.32) * Math.PI) * (1 - dl / 0.32 * 0.5) * cs * 0.06 : 0; // R11 landing dip
    ctx.save();
    ctx.translate(x, this.beltY - 2 + dy + dip);
    ctx.rotate(rot);
    ctx.scale(sc * sx, sc * sy);
    if (art) ctx.drawImage(art, -cs / 2, -cs, cs, cs);
    else {
      this.rr(ctx, -cs * 0.4, -cs * 0.8, cs * 0.8, cs * 0.7, 10);
      ctx.fillStyle = COLOR_PAL[vc.color].base;
      ctx.fill();
    }
    if (!vc.closed && vc.fill > 0) {
      const q = this.clock - vc.popT;
      const pop = q < 0.35 ? 0.45 + 0.55 * easeBack(q / 0.35) : 1;
      drawHead(ctx, vc.color, cs * 0.02, -cs * 0.5, 0, cs * 0.36 * pop, 1);
    }
    if (!vc.closed) drawPatBadge(ctx, COLOR_PAL[vc.color], cs * 0.36, -cs * 0.82, cs * 0.16); // the fur pattern, so colour is never the only cue (right side: clear of the lives pill)
    ctx.restore();
    if (front || vc.fill > 0) {
      if (!vc.closed) {
        ctx.save();
        ctx.translate(x, this.beltY - 7 * sc);
        ctx.scale(sc, sc);
        this.rr(ctx, -19, -11, 38, 22, 11);
        ctx.fillStyle = '#fff6e5';
        ctx.fill();
        ctx.strokeStyle = NAVY;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = NAVY;
        ctx.font = `700 14px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${vc.fill}/${vc.cap}`, 0, 1);
        ctx.restore();
      }
    }
  }

  // r7 molded carrier (door hinged left, dark mouth), its fill count on a honey tag on the roof
  drawCarrier7(ctx, vc, x, sc, front, rot = 0, dy = 0) {
    if (this.pf && this.pf.carrier(ctx, vc, x, sc, front, rot, dy)) return; // R11 juice: a carrier at rest is one baked sprite
    const cs = this.cs;
    const pal = COLOR_PAL[vc.color];
    const art = IMG[`r7/carrier_${pal.name}${vc.closed ? '_shut' : ''}`] || IMG['r7/carrier_orange'];
    const cw = cs * 1.3, ch = cw * (art.height / art.width);
    const t = this.clock - vc.sqT;
    let sx = 1, sy = 1;
    if (t < 0.5) {
      const k = Math.exp(-t * 9) * Math.cos(t * 24) * 0.14;
      sy = 1 - k;
      sx = 1 + k * 0.7;
    }
    if (vc.closed && vc.leaveT != null) {
      const q = this.clock - vc.leaveT;
      const k = closeSquash(q, this.calm); // R11 juice: the lid slams, squash then stretch
      sy *= 1 - k; sx *= 1 + k * 0.8;
    }
    // R11 contact beat: a cat lands and the carrier dips into the belt, then settles (inside the 0.35 s pop)
    const dl = this.clock - (vc.popT ?? -9);
    const dip = !this.calm && !vc.closed && dl >= 0 && dl < 0.32 ? Math.sin((dl / 0.32) * Math.PI) * (1 - dl / 0.32 * 0.5) * cs * 0.06 : 0;
    ctx.save();
    ctx.translate(x, this.beltY + 2 + dy + dip);
    ctx.rotate(rot);
    ctx.scale(sc * sx, sc * sy);
    ctx.fillStyle = 'rgba(60,30,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(-cw * 0.04, -ch * 0.03, cw * 0.4, ch * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    const hc = this.hintId != null && this.board && this.board.cats[this.hintId];
    if (front && !vc.closed && hc && hc.color === vc.color && !this.demo) { // the hinted cat's carrier glows in step with its arrow
      const u = this.calm ? 0.7 : 0.5 + 0.5 * Math.sin(this.clock * 8);
      if (!(this.pf && this.pf.glowImage(ctx, art, -cw / 2, -ch, cw, ch, 0.5 + 0.4 * u))) { // the glow baked once, pulsed by alpha
        ctx.save();
        ctx.shadowColor = `rgba(255,214,90,${0.5 + 0.4 * u})`;
        ctx.shadowBlur = 10 + 10 * u;
        ctx.drawImage(art, -cw / 2, -ch, cw, ch);
        ctx.restore();
      }
    }
    const dq = this.clock - (vc.popT ?? -9);
    const swing = !vc.closed && !this.calm && dq >= 0 && dq < 0.7 ? Math.exp(-dq * 6) * Math.sin(dq * 24) : 0;
    if (swing) { // a cat landed: the grate door (left third of the art, hinged at its right edge) swings and settles
      const hx = 0.335, iw = art.width * hx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-cw / 2 + cw * hx, -ch, cw * (1 - hx), ch);
      ctx.clip();
      ctx.drawImage(art, -cw / 2, -ch, cw, ch);
      ctx.restore();
      ctx.save();
      ctx.translate(-cw / 2 + cw * hx, 0);
      ctx.scale(1 - 0.55 * swing, 1);
      ctx.transform(1, 0.12 * swing, 0, 1, 0, 0);
      ctx.drawImage(art, 0, 0, iw, art.height, -cw * hx, -ch, cw * hx, ch);
      ctx.restore();
    } else ctx.drawImage(art, -cw / 2, -ch, cw, ch);
    shopSkin(ctx, cw, ch); // the shop carrier skin
    if (!vc.closed && vc.fill > 0) { // the last cat in peeks out of the mouth
      const q = this.clock - vc.popT;
      const pop = q < 0.35 ? 0.45 + 0.55 * easeBack(q / 0.35) : 1;
      drawHead(ctx, vc.color, cw * 0.06, -ch * 0.42, 0, cw * 0.36 * pop, 1, { v: vc.fill });
    }
    if (!vc.closed) drawPatBadge(ctx, pal, cw * 0.36, -ch * 0.2, cs * 0.11); // the fur pattern: colour is never the only cue
    if ((front || vc.fill > 0) && !vc.closed) {
      // count tag on the roof: honey pill with an oak rim, it pops on every cat in
      const r = cs * 0.2;
      const q = this.clock - (vc.popT ?? -9);
      const pp = this.calm ? 1 : q < 0.45 ? 1 + 0.45 * Math.exp(-q * 9) * Math.sin((q / 0.45) * Math.PI * 2.5 + 0.6) : 1; // 0/3 -> 1/3: a bouncy pop
      ctx.translate(cw * 0.08, -ch * 0.8);
      ctx.scale(pp, pp);
      this.rr(ctx, -r * 1.15, -r * 0.72, r * 2.3, r * 1.44, r * 0.72);
      ctx.fillStyle = '#F2B544';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#8E5530';
      ctx.stroke();
      ctx.fillStyle = '#3c2314';
      ctx.font = `700 ${Math.round(r * 0.95)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${vc.fill}/${vc.cap}`, 0, 1);
    }
    ctx.restore();
  }

  catStyle(cat) {
    const c = this.cell;
    const pal = this.mv.hidden[cat.id] ? MYSTERY_PAL : COLOR_PAL[cat.color];
    if (cat.kittenOf != null) {
      // a kitten is a smaller copy of its parent, same collar
      return { pal, w: c * 0.5, head: c * 0.76, collar: null }; // the pair reads by the heart leash (drawTether)
    }
    return { pal, w: c * (IMG['r7/tex_felt'] ? 0.7 : 0.66), head: c * 0.92, collar: null };
  }

  // idle life: blink every few seconds, ear twitch, tail wag
  // R11 fix round 1: on a slow phone the still board is drawn the same way every time (perf.js idleHeld): no breathing,
  // twitch, wag or look-around, and one cat at a time blinks on a schedule (heldBlink)
  blinkOf(id) {
    if (this.idleHeld) return id === this.heldBlink ? 1 : 0;
    if (this.calm) return 0;
    const per = 3.9 + (id % 5) * 0.8;
    const x = (this.clock + id * 1.37) % per;
    return x < 0.15 ? Math.sin((x / 0.15) * Math.PI) : 0;
  }

  twitchOf(id) {
    if (this.calm || this.idleHeld) return 0;
    const per = 6.7 + (id % 4) * 1.3;
    const x = (this.clock + id * 2.11) % per;
    return x < 0.35 ? Math.sin((x / 0.35) * Math.PI * 3) * 0.11 : 0;
  }

  wagOf(id) {
    return this.calm || this.idleHeld ? 0 : Math.sin(this.clock * 5.2 + id * 1.9) * 0.4;
  }

  // body + head over a path window
  paintCat(ctx, cat, path, a, b, o = {}) {
    const st = this.catStyle(cat);
    const c = this.cell;
    if (!(o.still && this.pf && this.pf.body(ctx, cat, path, a, b, st, o))) drawBody(ctx, path, a, b, {
      pal: st.pal, c, w: st.w * (o.wScale || 1), alpha: o.alpha, glow: o.glow, collar: st.collar, seed: cat.id * 3 + 1,
      run: o.run, wag: o.wag ?? this.wagOf(cat.id),
      lite: o.lite,
    });
    if (o.noHead) return;
    const p1 = sample(path, b);
    const p0 = sample(path, Math.max(a, b - c * 0.45));
    let ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 1) ang = Math.atan2(p1.ty, p1.tx);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const hs = st.head * (o.headScale || 1);
    let hx = p1.x + ux * c * 0.04, hy = p1.y + uy * c * 0.04, lean = ux * 0.3;
    let face = o.frozen ? { blink: 1, v: cat.id } : o.run != null ? { v: cat.id } : { mood: MOODS[cat.id % MOODS.length], v: cat.id };
    if (o.idle) {
      face.blink = this.blinkOf(cat.id);
      face.twitch = this.twitchOf(cat.id);
      // a tap nearby: eyes pop open and the head turns toward the tapped cat for a moment
      const lk = this.idleHeld ? null : this.look;
      if (lk && lk.id !== cat.id && this.clock - lk.t < 1.3) {
        const dx = lk.x - p1.x, dy = lk.y - p1.y, d = Math.hypot(dx, dy);
        if (d > c * 0.5 && d < c * 5) {
          const f = Math.sin(Math.PI * clamp((this.clock - lk.t) / 1.3, 0, 1));
          face.mood = 0;
          face.blink = 0;
          if (!this.calm) {
            hx += (dx / d) * hs * 0.08 * f;
            hy += (dy / d) * hs * 0.06 * f;
            lean += (dx / d) * 0.22 * f;
          }
        }
      }
    }
    // face stays upright (small lean only) and sits a bit forward so the exit side reads
    drawHead(ctx, this.mv.hidden[cat.id] ? -1 : cat.color, hx, hy, lean, hs, o.alpha ?? 1, face);
    if (!this.mv.hidden[cat.id]) shopHat(ctx, hx, hy, lean, hs, o.alpha ?? 1); // the shop cat outfit
    if (hs > c * 0.5 && !head7(cat.color)) drawPaws(ctx, hx, hy, ux, uy, hs, o.alpha ?? 1);
    if (o.chevron) drawChevron(ctx, p1.x + ux * (hs * 0.5 + c * 0.12), p1.y + uy * (hs * 0.5 + c * 0.12), ang, c * 0.17, 0.95);
  }

  drawStatic(ctx, id) {
    const cat = this.board.cats[id];
    const path = this.paths[id];
    const c = this.cell;
    ctx.save();
    const wg = this.wiggle[id];
    if (wg && this.clock >= wg.t && this.clock - wg.t < 0.3) {
      const u = (this.clock - wg.t) / 0.3;
      const k = Math.sin(u * 30) * 3.5 * (1 - u);
      ctx.translate(wg.dx * k, wg.dy * k);
    }
    const pi = this.popIn && this.popIn[id];
    if (pi != null && this.clock - pi < 0.3) {
      const s = 0.8 + 0.2 * easeBack((this.clock - pi) / 0.3);
      const [cx, cy] = this.center(cat.cells.at(-1)[0], cat.cells.at(-1)[1]);
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
    }
    const hinted = this.hintId === id || (this.cueOn('cat') && this.cue.cat === id); // R11: after Take back, a cat that boards now
    const glow = hinted ? 0.5 + 0.5 * Math.sin(this.clock * 6) : 0;
    const frozen = !!this.mv.frozen[id];
    const hb = path.marks[cat.cells.length - 1];
    const breath = this.calm || frozen || this.idleHeld ? 1 : 1 + 0.035 * Math.sin(this.clock * 2.4 + id * 1.3); // idle breathing
    if (cat.mech) content.under(this, ctx, cat); // the swivel bed under the head
    this.paintCat(ctx, cat, path, 0, hb, { glow, chevron: !frozen && cat.mech !== 'swivel', idle: !frozen, frozen, wScale: breath, still: true });
    this.mechOver(ctx, cat, path, hb);
    if (cat.mech) content.over(this, ctx, cat, path, hb); // spring coil badge, swivel facing arrow
    ctx.restore();
    const fr = this.freedT[id] != null ? this.clock - this.freedT[id] : -1;
    if (hinted || (fr >= 0 && fr < 1.4)) {
      const head = cat.cells.at(-1);
      const hd = content.dirOf(this, id);
      const [dx, dy] = DIRS[hd];
      const [hx, hy] = this.center(head[0], head[1]);
      const dist = c * 0.98 + (this.idleHeld ? 0 : Math.sin(this.clock * 8) * c * 0.1);
      drawArrow(ctx, hx + dx * dist, hy + dy * dist, FACE[hd] + Math.PI / 2, c * 0.42);
    }
  }

  // "?" bubble on a hidden mystery cat, ice coat and thaw counter on a frozen one
  mechOver(ctx, cat, path, b) {
    const c = this.cell;
    const hid = this.mv.hidden[cat.id];
    const fro = this.mv.frozen[cat.id];
    if (!hid && !fro) return;
    const st = this.catStyle(cat);
    const p1 = sample(path, b);
    const head = { x: p1.x, y: p1.y };
    const hs = st.head;
    if (hid) {
      const q = this.calm ? 0 : Math.sin(this.clock * 3 + cat.id) * c * 0.03;
      drawQuestion(ctx, head.x + hs * 0.32, head.y - hs * 0.46 + q, c * 0.46);
    }
    if (fro) {
      const since = this.clock - (this.mv.t['c' + cat.id] ?? -9);
      const bonked = this.clock - (this.mv.t['k' + cat.id] ?? -9);
      const crack = this.mv.chip[cat.id] > 0 ? 1 : bonked < 0.8 ? 1 - bonked / 0.8 : 0; // a bonk flashes a crack, a chip keeps one
      drawIce(ctx, path, 0, b, st.w, c, head, hs, crack, 1, st.pal.base);
      const left = THAW_NEED - (this.mv.chip[cat.id] || 0);
      const pulse = since < 0.3 ? 1 + 0.3 * Math.sin((since / 0.3) * Math.PI) : 1;
      const bx = head.x + hs * 0.38, by = head.y - hs * 0.42, br = c * 0.22 * pulse;
      drawPatBadge(ctx, st.pal, bx - br * 1.5, by + br * 0.2, br * 0.8); // its colour pattern beside the count, so carriers can be planned around it
      drawBadge(ctx, bx, by, br, left, '#2f9bd6');
    }
  }

  // sleeping dogs and yarn balls on the rug
  drawObjs(ctx) {
    const s = this.state;
    if (!s || !s.objs.length) return;
    const c = this.cell;
    s.objs.forEach((o, k) => {
      if (!this.mv.obj[k]) return;
      ctx.save();
      const wg = this.wiggleObj[k];
      if (wg && this.clock >= wg.t && this.clock - wg.t < 0.3) {
        const u = (this.clock - wg.t) / 0.3;
        const sh = Math.sin(u * 30) * 3.5 * (1 - u);
        ctx.translate(wg.dx * sh, wg.dy * sh);
      }
      if (o.kind === 'dog') {
        // its hearing range: only cats with a cell in this dashed zone wake it as they leave (DOG_NEAR cells around)
        const xs = o.cells.map(([x]) => x), ys = o.cells.map(([, y]) => y);
        const x0 = Math.max(0, Math.min(...xs) - DOG_NEAR), x1 = Math.min(this.board.w - 1, Math.max(...xs) + DOG_NEAR);
        const y0 = Math.max(0, Math.min(...ys) - DOG_NEAR), y1 = Math.min(this.board.h - 1, Math.max(...ys) + DOG_NEAR);
        ctx.save();
        this.rr(ctx, this.ox + x0 * c + 3, this.oy + y0 * c + 3, (x1 - x0 + 1) * c - 6, (y1 - y0 + 1) * c - 6, c * 0.3);
        ctx.fillStyle = 'rgba(124,92,255,0.09)';
        ctx.fill();
        ctx.setLineDash([c * 0.16, c * 0.12]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(124,92,255,0.55)';
        ctx.stroke();
        ctx.restore();
        const [a, b] = o.cells.map(([x, y]) => this.center(x, y));
        drawDog(ctx, a[0], a[1], b[0], b[1], c, { asleep: true, breathe: this.calm || this.idleHeld ? 0 : Math.sin(this.clock * 2 + k) });
        const hx = a[0] + (a[0] - b[0]) * 0.1, hy = a[1] + (a[1] - b[1]) * 0.1;
        // floating z z
        ctx.font = `700 ${c * 0.44}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = NAVY;
        ctx.fillStyle = '#fff6e5';
        for (let i = 0; i < 2; i++) {
          const ph = this.calm ? 0.5 : ((this.clock * 0.55 + i * 0.5 + k * 0.3) % 1);
          const zx = hx + c * (0.34 + 0.2 * i + ph * 0.14), zy = hy - c * (0.46 + 0.22 * i + ph * 0.26);
          ctx.save();
          ctx.globalAlpha = this.calm ? 1 : Math.sin(ph * Math.PI);
          ctx.strokeText('z', zx, zy);
          ctx.fillText('z', zx, zy);
          ctx.restore();
        }
        const since = this.clock - (this.mv.t['z' + k] ?? -9);
        const pulse = since < 0.3 ? 1 + 0.3 * Math.sin((since / 0.3) * Math.PI) : 1;
        drawBadge(ctx, b[0] + c * 0.18, b[1] - c * 0.42, c * 0.23 * pulse, this.mv.zzz[k], '#7c5cff');
      } else {
        const [x, y] = this.center(o.cells[0][0], o.cells[0][1]);
        const rot = this.calm ? 0 : Math.sin(this.clock * 1.6 + k * 2) * 0.12;
        drawYarn(ctx, x, y, c * 0.36, rot);
      }
      ctx.restore();
    });
  }

  // a knocked yarn ball pops up and bounces away inside its own cell, shrinking out of sight before it could reach a
  // neighbouring cat's head (drawn under the cats in any case)
  drawRoll(ctx, a) {
    const c = this.cell;
    const u = clamp((this.clock - a.t0) / a.dur, 0, 1);
    const [dx, dy] = a.dir;
    const [px, py] = this.center(a.cell[0], a.cell[1]);
    const dist = 0.38 * easeOut(u);
    const hop = Math.sin(Math.min(1, u * 1.4) * Math.PI) * c * 0.3;
    drawYarn(ctx, px + dx * dist * c, py + dy * dist * c - hop, c * 0.36 * (1 - 0.7 * u), dist * 6 * (dx || dy), clamp(1.4 - u * 1.8, 0, 1));
  }

  // the woken dog: a wake beat in place (big stretch, a "!" pop), then it trots off the side of the board
  trotPose(a) {
    const c = this.cell;
    const { w } = this.board;
    const t = this.clock - a.t0;
    const wake = this.calm ? 0.2 : 0.45;
    const [a0, b0] = a.cells.map(([x, y]) => this.center(x, y));
    const mx = (a0[0] + b0[0]) / 2;
    const dir = mx < this.ox + (w * c) / 2 ? -1 : 1;
    const run = clamp((t - wake) / (a.dur - wake), 0, 1);
    const far = dir < 0 ? mx - this.ox + 2 * c : this.ox + w * c - mx + 2 * c;
    const k = clamp(t / wake, 0, 1);
    const st = this.calm ? 0 : Math.sin(k * Math.PI);
    return {
      a0, b0, dir, run, t, wake,
      dx: dir * far * run * run,
      bob: t < wake ? -st * c * 0.14 : this.calm ? 0 : -Math.abs(Math.sin(run * 22)) * c * 0.1,
      sx: 1 + 0.18 * st, sy: 1 - 0.12 * st,
      alpha: clamp(1.6 - run * 1.3, 0, 1),
    };
  }

  drawTrot(ctx, a) {
    const c = this.cell;
    const p = this.trotPose(a);
    const mx = (p.a0[0] + p.b0[0]) / 2 + p.dx, my = (p.a0[1] + p.b0[1]) / 2;
    ctx.save();
    ctx.translate(mx, my);
    ctx.scale(p.sx, p.sy);
    ctx.translate(-mx, -my);
    // eyes snap open, a big yawn during the stretch, then wide awake for the trot
    const yawn = this.calm ? 0 : clamp(Math.sin(clamp(p.t / p.wake, 0, 1) * Math.PI) * 1.3, 0, 1);
    drawDog(ctx, p.a0[0] + p.dx, p.a0[1], p.b0[0] + p.dx, p.b0[1], c, { asleep: false, bob: p.bob, alpha: p.alpha, eyes: clamp(p.t / 0.08, 0.2, 1), yawn });
    ctx.restore();
    // a "!" bubble over its head the moment it wakes
    const bt = p.t;
    if (bt < p.wake + 0.55) {
      const q = this.calm ? 1 : easeBack(clamp(bt / 0.22, 0, 1));
      const fade = clamp((p.wake + 0.55 - bt) / 0.2, 0, 1);
      const hx = p.a0[0] + p.dx + c * 0.15, hy = p.a0[1] - c * 0.95 + p.bob;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(hx, hy);
      ctx.scale(q, q);
      ctx.fillStyle = '#fff6e5';
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, c * 0.3, 0, Math.PI * 2);
      ctx.moveTo(-c * 0.08, c * 0.26);
      ctx.lineTo(-c * 0.2, c * 0.44);
      ctx.lineTo(c * 0.06, c * 0.29);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e53935';
      ctx.font = `700 ${Math.round(c * 0.42)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, c * 0.02);
      ctx.restore();
    }
  }

  // The signature send: a crouch, the body stretches like a noodle (the head runs ahead of the tail), a leap arc over
  // the gap with a shadow under it, front paws reach out and land first, the body accordions in, the tail snaps in last.
  drawRun(ctx, a) {
    const t = this.clock - a.t0;
    const c = this.cell;
    const d = this.runDist(a, t);
    const cats = this.board.cats;
    // crouch: low and wide for a beat, then the spring releases it over the first 80 ms of the run
    const squash = this.calm ? 1 : t < ANT ? 1 + 0.32 * Math.sin((t / ANT) * Math.PI * 0.5) : 1 + 0.32 * (1 - smooth((t - ANT) / 0.08));
    for (const m of a.members) {
      const len = m.len;
      const arrived = this.clock >= m.arrAt;
      const fold = arrived ? easeOut(clamp((this.clock - m.arrAt) / FOLD, 0, 1)) : 0;
      const pal = COLOR_PAL[cats[m.id].color];
      if (fold >= 1) { // folded in: only the tail is left, and it snaps in with a white-tip flick
        if (!this.calm) this.drawFlick(ctx, m, pal, (this.clock - m.arrAt - FOLD) / FLICK);
        continue;
      }
      const a0 = clamp(d, 0, len);
      const bb = arrived ? len : clamp(m.headBase + d * (1 + a.sig), 0, len);
      const aa = a0 + (bb - a0) * fold;
      if (aa >= len - 1.5) continue;
      // volume kept: a stretched body thins out, an accordioned one bunches up
      const stretch = Math.max(1, (bb - aa) / Math.max(c * 0.5, m.headBase));
      const thin = clamp(1 / Math.sqrt(stretch), 0.6, 1);
      const bunch = 1 + 0.18 * Math.sin(Math.PI * fold);
      // the leap: from the rug edge (or the start, for a scoop) to the target, the head rises and falls
      const ls = m.edgeS >= 0 ? m.edgeS : m.headBase;
      const q = clamp((bb - ls) / Math.max(1, len - ls), 0, 1);
      const h = m.tg.kind === 'off' ? 0 : Math.sin(Math.PI * q) * (1 - fold);
      const head = sample(m.path, bb);
      if (h > 0.02) { // ground shadow under the airborne head
        ctx.save();
        ctx.globalAlpha = 0.22 * h;
        ctx.fillStyle = '#3c1e0a';
        ctx.beginPath();
        ctx.ellipse(head.x - c * 0.05, head.y + c * (0.35 + 0.55 * h), c * 0.36 * (1 - 0.3 * h), c * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const fade = m.tg.kind === 'off' ? clamp(1 - (bb / len - 0.55) / 0.4, 0, 1) : 1;
      const hs0 = this.catStyle(cats[m.id]).head;
      // front paws lead: they shoot out ahead of the head on the spring, gallop (alternating) along the board, reach
      // fully across the gap and plant on landing; the hind legs kick back on take-off and tuck in as the rear catches up
      const air = q > 0.02;
      const reach = arrived ? 1 - fold : t < ANT ? 0 : Math.max(smooth((t - ANT) / 0.06) * 0.75, smooth(q / 0.25));
      const gal = arrived || air || this.calm ? 0 : Math.sin(d / (c * 0.28) * 2);
      if (reach > 0.02 && m.tg.kind !== 'off') {
        const hs = hs0 * (1 + 0.3 * h);
        const ux = head.tx, uy = head.ty, nx = -uy, ny = ux;
        ctx.save();
        ctx.globalAlpha = fade * Math.min(1, reach * 2);
        for (const sg of [-1, 1]) {
          const ext = reach * (1 + 0.35 * gal * sg);
          const px = head.x + ux * (hs * 0.4 + c * 0.34 * ext) + nx * sg * hs * 0.46; // wide of the ears: paws, not ears
          const py = head.y + uy * (hs * 0.4 + c * 0.34 * ext) + ny * sg * hs * 0.46;
          ctx.strokeStyle = shade(pal.base, -0.32);
          ctx.lineWidth = hs * 0.2 + 3;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(head.x + nx * sg * hs * 0.3, head.y + ny * sg * hs * 0.3); ctx.lineTo(px, py); ctx.stroke();
          ctx.strokeStyle = pal.base;
          ctx.lineWidth = hs * 0.2;
          ctx.stroke();
          ctx.fillStyle = '#fff6e5';
          ctx.strokeStyle = shade(pal.base, -0.32);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(px, py, hs * 0.12, hs * 0.1, Math.atan2(uy, ux), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
      // hindquarters: two back legs push off behind the rear on the spring, then tuck forward as the rear catches up
      const kick = this.calm || m.tg.kind === 'off' ? 0 : t < ANT ? smooth(t / ANT) * 0.5 : arrived ? 0.6 * (1 - fold) : 1 - smooth((t - ANT) / 0.16);
      const tuck = arrived && !this.calm ? Math.sin(Math.PI * fold) : 0;
      if (kick > 0.03 || tuck > 0.03) {
        const r = sample(m.path, Math.min(bb - 1, aa + c * 0.3));
        const ux = r.tx, uy = r.ty, nx = -uy, ny = ux;
        const hl = hs0 * 0.42;
        const dir = kick >= tuck ? -kick : tuck * 0.7; // back along the path on push-off, forward under the body on the tuck
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.lineCap = 'round';
        for (const sg of [-1, 1]) {
          const bx = r.x + nx * sg * hs0 * 0.24, by = r.y + ny * sg * hs0 * 0.24;
          const px = bx + ux * hl * dir + nx * sg * hl * 0.25, py = by + uy * hl * dir + ny * sg * hl * 0.25;
          for (const [col, lw] of [[shade(pal.base, -0.32), hs0 * 0.2 + 3], [pal.base, hs0 * 0.2]]) {
            ctx.strokeStyle = col; ctx.lineWidth = lw;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(px, py); ctx.stroke();
          }
          ctx.fillStyle = '#fff6e5';
          ctx.strokeStyle = shade(pal.base, -0.32);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(px, py, hs0 * 0.12, hs0 * 0.1, Math.atan2(uy, ux), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
      this.paintCat(ctx, cats[m.id], m.path, aa, Math.max(aa + 0.5, bb), {
        wScale: squash * thin * bunch * (1 - 0.35 * fold),
        alpha: fade,
        headScale: (1 + 0.3 * h) * (1 - 0.55 * fold) * (t < ANT ? 0.94 : 1),
        run: t > ANT && !arrived ? d / (c * 0.28) : null,
        wag: 0.5,
        lite: t > ANT && !arrived, // R11 fix 2: mid-leap the fabric composites are invisible; skipping them keeps busy sends smooth
      });
    }
    // speed streaks behind the lead head
    const lead = a.members[0];
    const hdd = clamp(lead.headBase + d * (1 + a.sig), 0, lead.len);
    if (t > ANT && hdd < lead.len - 2 * c && !a.scoop) {
      const hd = sample(lead.path, hdd);
      const nx = -hd.ty, ny = hd.tx;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.55 * (1 - clamp(t / (a.T + ANT), 0, 1));
      for (const off of [-0.5, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(hd.x - hd.tx * c * 0.9 + nx * off * c, hd.y - hd.ty * c * 0.9 + ny * off * c);
        ctx.lineTo(hd.x - hd.tx * c * 1.7 + nx * off * c, hd.y - hd.ty * c * 1.7 + ny * off * c);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // the tail, last thing out of sight: it pokes out of the mouth, flicks its white tip once and snaps in
  drawFlick(ctx, m, pal, u) {
    if (u < 0 || u >= 1 || m.tg.kind === 'off') return;
    const c = this.cell;
    const e = sample(m.path, m.len);
    const bx = -e.tx, by = -e.ty; // back out along the way the cat came
    const nx = -by, ny = bx;
    const L = c * 0.62 * (1 - easeOut(u)); // retracts
    const sw = Math.sin(u * Math.PI * 2.2) * (1 - u); // the flick
    const x0 = e.x, y0 = e.y - c * 0.05;
    const cx = x0 + bx * L * 0.7 + nx * L * 0.5 * sw, cy = y0 + by * L * 0.7 + ny * L * 0.5 * sw;
    const ex = x0 + bx * L + nx * L * 0.9 * sw, ey = y0 + by * L + ny * L * 0.9 * sw;
    const w = c * 0.2;
    ctx.save();
    ctx.lineCap = 'round';
    for (const [col, lw] of [[shade(pal.base, -0.32), w + 3], [pal.base, w]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = shade(pal.base, -0.32);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ex, ey, w * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawHop(ctx, a) {
    const u = clamp((this.clock - a.t0) / a.dur, 0, 1);
    if (u <= 0) return;
    const to = a.to();
    const e = easeOut(u);
    const x = a.from.x + (to.x - a.from.x) * e;
    const y = a.from.y + (to.y - a.from.y) * e - Math.sin(Math.PI * u) * this.cs * 0.7;
    const s = (a.from.bw || this.bw) * (1 - 0.3 * u);
    if (a.k >= 1 && !this.calm) { // a chain hop leaves a glowing trail in its colour
      const col = COLOR_PAL[a.color].base;
      ctx.save();
      for (let j = 6; j >= 1; j--) {
        const v = u - j * 0.045;
        if (v <= 0) continue;
        const ev = easeOut(v);
        const tx = a.from.x + (to.x - a.from.x) * ev;
        const ty = a.from.y + (to.y - a.from.y) * ev - Math.sin(Math.PI * v) * this.cs * 0.7;
        ctx.globalAlpha = 0.5 * (1 - j / 7);
        ctx.fillStyle = j % 2 ? '#fff6c8' : col;
        if (this.pf) this.pf.halo(ctx, tx, ty, s * (0.3 - j * 0.03) + 10); // a baked halo in place of shadowBlur
        else { ctx.shadowColor = '#ffd43b'; ctx.shadowBlur = 10; }
        ctx.beginPath();
        ctx.arc(tx, ty, s * (0.3 - j * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    this.drawCurled(ctx, x, y, s, a.color, 0);
  }

  drawBonk(ctx, a) {
    const cat = this.board.cats[a.id];
    const path = this.paths[a.id];
    const c = this.cell;
    const t = this.clock - a.t0;
    const L = path.marks[cat.cells.length - 1];
    let e;
    let ws;
    if (t < 0.1) {
      e = a.emax * easeOut(t / 0.1);
      ws = 1 - 0.1 * (t / 0.1);
    } else {
      const u = t - 0.1;
      e = a.emax * 0.9 * Math.exp(-6 * u) * Math.cos(11 * u);
      ws = 1 + 0.3 * Math.exp(-7 * u) - 0.1 * Math.exp(-14 * u);
    }
    const b = Math.max(0.2 * c, L + e);
    if (t < 0.7 && a.blockerCell) {
      // show what blocked the cat: lane to the blocker, blocker flashed
      const fade = Math.min(1, (0.7 - t) / 0.3);
      const [hx, hy] = a.headCell;
      const [bx, by] = a.blockerCell;
      const [dx, dy] = DIRS[a.dir || cat.dir];
      ctx.save();
      ctx.fillStyle = `rgba(229,57,53,${0.28 * fade})`;
      for (let x = hx + dx, y = hy + dy; ; x += dx, y += dy) {
        this.rr(ctx, this.ox + x * c + 3, this.oy + y * c + 3, c - 6, c - 6, c * 0.2);
        ctx.fill();
        if (x === bx && y === by) break;
      }
      this.rr(ctx, this.ox + bx * c + 2, this.oy + by * c + 2, c - 4, c - 4, c * 0.2);
      ctx.strokeStyle = `rgba(229,57,53,${0.95 * fade})`;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
    this.paintCat(ctx, cat, path, 0, b, { wScale: ws });
    this.mechOver(ctx, cat, path, b);
    if (t > 0.1 && t < 0.8 && IMG.stars && a.blockerCell) {
      const hp = sample(path, Math.max(0.2 * c, L + Math.max(0, e)));
      const fade = t > 0.55 ? Math.max(0, 1 - (t - 0.55) / 0.25) : Math.min(1, (t - 0.1) / 0.1);
      const sz = c * 1.0;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(hp.x, hp.y - c * 0.8);
      ctx.rotate(t * 5);
      ctx.drawImage(IMG.stars, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
  }

  drawPopup(ctx, p) {
    const u = (this.clock - p.t0) / p.dur;
    const sc = u < 0.22 ? easeBack(u / 0.22) : 1;
    const al = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = al;
    // sits on the bench row's lower edge, just above the rug: never over the belt or the board
    const gapB = this.oy - 21;
    ctx.translate(this.W / 2, gapB - 15 - u * 6);
    ctx.scale(sc, sc);
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = NAVY;
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = '#ffd43b';
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}
