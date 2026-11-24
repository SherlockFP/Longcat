// Boss lane UI (rules: src/game/boss.js, data: data/boss.js, strings: src/i18n-boss.js).
//  - a boss level (every 20th): a dramatic intro card (never blocks a tap; the first cat out or 3.4 s sends it away),
//    the boss nameplate with an HP bar over the LEVEL plaque (HP = cats still to deliver, it drops as each cat lands in
//    a carrier, with hurt reactions at 75 / 50 / 25%), a red-and-gold frame round the board and a synth sting;
//  - the board cleared: the defeat ceremony (the boss gives up, confetti, the gold chest drops), then the win card;
//  - chests (wooden milestone, gold boss, streak) wait in d.boss.q: a pulsing chest on the win card and on the map opens
//    them (drop, three wobbles that each tap speeds up, a lid burst with rays in the rarity colour, items one by one,
//    a coin shower into the coin counter, a full reveal card for a rare / epic look). Reduced motion: a plain fade.
//  - the map: castle nodes with the boss portrait, chest markers on every 5th level, the chest / flame pill.
// Hooks: main.js init(game, ctx) once after the orders lane, levelStart(n, special, board) per load, onFail(n) on a lost
// campaign bench; hub.js decorateMap(map, geometry, cur) after each map render.
import { t, lang } from '../i18n.js';
import { assetUrl, COLOR_PAL } from '../game/breeds.js';
import { save } from '../kit/save.js';
import { audio, synth } from '../kit/audio.js';
import { haptics } from '../kit/haptics.js';
import { track } from '../kit/analytics.js';
import * as B from '../game/boss.js';
import * as SH from '../game/shop.js';
import { drawHead } from '../game/render.js';
import { drawHat, drawCarrierSkin } from '../game/shop-look.js';
import { IMG } from '../game/assets.js';
import { bonusOf } from '../game/orders.js';
import './boss.css';

let G = null; // the Game
let ctx = null; // { cur: () => main's S, sync: () => HUD coins/boosters, toast }
let cur = null; // the boss on the board: { n, b, board, total, shown, hurt }
let bar = null;
let frame = null;
let intro = null;
let introT = 0;
let cer = null; // running defeat ceremony: { el, go, timer }
let chestOn = false; // a chest opening overlay is up
let flushing = false;
const seen = new Set(); // boss levels whose intro already showed this session

const url = (n) => assetUrl('r7/' + n + '.webp');
const img = (n, cls = '') => `<img class="${cls}" src="${url(n)}" alt="" draggable="false">`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const loc = (o) => (o && typeof o === 'object' ? o[lang()] || o.en || '' : o || '');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const calm = () => (G ? !!G.calm : false) || reduced();
const later = (fn, ms) => setTimeout(fn, calm() ? Math.min(ms, 60) : ms);

// the tinted bosses wear a small accessory over the shared portrait
const ACC = {
  bow: '<svg class="bsacc bow" viewBox="0 0 40 24"><path d="M20 12 4 3v18zM20 12l16-9v18z" fill="#e4508f" stroke="#7a1f48" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="12" r="4.5" fill="#ffd0e4" stroke="#7a1f48" stroke-width="2"/></svg>',
  star: '<svg class="bsacc star" viewBox="0 0 24 24"><path d="m12 2 3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z" fill="#ffd43b" stroke="#8e5530" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  moon: '<svg class="bsacc moon" viewBox="0 0 24 24"><path d="M15 2a10 10 0 1 0 7 15A8 8 0 0 1 15 2z" fill="#ffe27a" stroke="#6b5a1a" stroke-width="1.6"/></svg>',
  crown: '<svg class="bsacc crown" viewBox="0 0 40 26"><path d="M3 22 5 6l9 8 6-11 6 11 9-8 2 16z" fill="#ffcf3b" stroke="#8e5530" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="15" r="2.6" fill="#e5484d"/></svg>',
};
const FALLBACK = url('cat_head_orange_happy');
export const portrait = (b, cls = '') => `<span class="bsp ${cls}"><img src="${url('boss_' + b.art)}" style="filter:${b.tint || 'none'}" alt="" draggable="false" onerror="this.onerror=null;this.src='${FALLBACK}'">${ACC[b.acc] || ''}</span>`;
const bossName = (b) => loc(b.name);

// ---------------- sounds (synth only: the same tone() voice as the fallbacks in kit/audio.js) ----------------
const hz = (s) => 220 * Math.pow(2, s / 12);
const SFX = {
  intro: () => synth([
    { type: 'sawtooth', f0: hz(-7), dur: 0.2, vol: 0.2, lp: 900 },
    { type: 'sawtooth', f0: hz(-7), t: 0.24, dur: 0.2, vol: 0.2, lp: 900 },
    { type: 'sawtooth', f0: hz(-4), t: 0.48, dur: 0.2, vol: 0.22, lp: 1000 },
    { type: 'sawtooth', f0: hz(0), f1: hz(-1), t: 0.74, dur: 0.8, vol: 0.24, vib: 5, lp: 1300 },
    { type: 'triangle', f0: 70, f1: 50, t: 0.74, dur: 0.6, vol: 0.3 },
  ]),
  hit: () => synth([{ type: 'square', f0: 330, f1: 150, dur: 0.08, vol: 0.06, lp: 1500 }]),
  grunt: () => synth([{ type: 'sawtooth', f0: 230, f1: 130, dur: 0.28, vol: 0.14, vib: 13, lp: 800 }]),
  fanfare: () => synth([0, 4, 7, 12].map((s, i) => ({ type: 'triangle', f0: hz(s + 12), t: i * 0.11, dur: 0.22, vol: 0.26 }))
    .concat([7, 12, 16].map((s) => ({ type: 'triangle', f0: hz(s + 12), t: 0.5, dur: 0.9, vol: 0.18 })))),
  wobble: (k) => synth([{ type: 'triangle', f0: 380 + k * 140, f1: 300 + k * 140, dur: 0.07, vol: 0.2 }]),
  burst: () => synth([
    { type: 'sine', f0: 260, f1: 1900, dur: 0.38, vol: 0.22 },
    ...[0, 4, 7, 12, 16, 19].map((s, i) => ({ type: 'triangle', f0: hz(s + 24), t: 0.2 + i * 0.05, dur: 0.24, vol: 0.12 })),
  ]),
  reveal: () => synth([0, 7, 12, 16, 19, 24].map((s, i) => ({ type: 'sine', f0: hz(s + 24), t: i * 0.07, dur: 0.35, vol: 0.1 }))),
};

// ---------------- boot ----------------
export function init(game, c) {
  G = game;
  ctx = c;
  const on = game.on;
  const wrap = (k, fn) => { const prev = on[k]; on[k] = (...a) => { const r = prev ? prev(...a) : undefined; fn(...a); return r; }; };
  wrap('land', (e) => { if (e && e.kind === 'carrier') hit(); });
  wrap('free', () => dismissIntro());
  wrap('layout', () => place());
  const win0 = on.win;
  on.win = (stars) => cleared(stars, win0);
  const flush0 = game.flushWin.bind(game);
  game.flushWin = () => { flushing = true; try { flush0(); } finally { flushing = false; } finishCer(); };
  const load0 = game.load.bind(game);
  game.load = (...a) => { finishCer(); return load0(...a); };

  const ui = document.getElementById('ui');
  frame = document.createElement('div');
  frame.id = 'bossframe';
  frame.hidden = true;
  bar = document.createElement('div');
  bar.id = 'bossbar';
  bar.hidden = true;
  bar.setAttribute('role', 'status');
  document.body.insertBefore(frame, ui);
  document.body.insertBefore(bar, ui);
  setInterval(tick, 200);
  window.addEventListener('resize', () => setTimeout(place, 60));
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-bx]');
    if (!el) return;
    e.stopPropagation();
    if (el.dataset.bx === 'open') openQueue();
  }, true);
  if (import.meta.env.DEV) {
    window.__boss = {
      cur: () => cur && { n: cur.n, total: cur.total, shown: cur.shown, name: bossName(cur.b) },
      st: () => JSON.parse(JSON.stringify(B.state(save.data))),
      open: () => openQueue(),
      chestOn: () => chestOn,
      give: (t = 'wood', n = 5, i = 0) => { B.state(save.data).q.push({ t, n, i }); save.commit(); },
      cer: () => !!cer,
    };
  }
}

// ---------------- level start ----------------
export function levelStart(n, special, board) {
  dismissIntro(true);
  if (B.startAttempt(save.data)) { save.commit(); if (ctx.toast) setTimeout(() => ctx.toast(t('flameOut')), 300); }
  const b = !special && board && board.meta && board.meta.kind === 'boss' ? B.bossOf(n) : null;
  document.body.classList.toggle('bosslv', !!b);
  if (!b) { cur = null; bar.hidden = true; frame.hidden = true; return; }
  const total = (board.carriers || []).reduce((a, c) => a + (c.cap || 3), 0) || board.cats.length;
  cur = { n, b, board, total, shown: 0, hurt: 0 };
  frame.style.setProperty('--bh', b.hue);
  bar.style.setProperty('--bh', b.hue);
  bar.innerHTML = `${portrait(b, 'bsface')}<div class="bsinfo"><b class="bsname"><i>${t('bossTag')}</i>${esc(bossName(b))}</b><div class="bshp"><i class="bsfill"></i><i class="bsghost"></i><em></em></div></div><i class="bsquip" hidden></i>`;
  draw();
  place();
  if (!seen.has(n)) { seen.add(n); showIntro(); }
  track('boss_start', { n, boss: b.id });
}

export function onFail(n) {
  if (n === save.data.level) B.markFail(save.data, n); // a replayed old level never touches the flame
  if (cur && cur.n === n) { bar.classList.add('gloat'); setTimeout(() => bar.classList.remove('gloat'), 1600); }
}

function onPlay() {
  if (!cur || !G || G.demo || G.board !== cur.board) return false;
  const S = ctx.cur();
  return S.mode === 'play' && !!document.getElementById('hud');
}

// the nameplate sits over the LEVEL plaque (between the Home button and the counters); the frame hugs the rug
function place() {
  if (!G || !bar || !cur || !G.cell) return;
  const host = document.body.getBoundingClientRect();
  const pill = document.querySelector('#hud .lvl-pill');
  const home = document.querySelector('#hud .hud-top2 > .round');
  const right = document.querySelector('#hud .hud-r');
  if (pill) {
    const p = pill.getBoundingClientRect();
    const lo = home ? home.getBoundingClientRect().right - host.left + 6 : 8;
    const hi = right ? right.getBoundingClientRect().left - host.left - 6 : host.width - 8;
    const w = clamp(hi - lo, 150, 250);
    const cx = clamp(p.left - host.left + p.width / 2, lo + w / 2, hi - w / 2);
    bar.style.left = Math.round(cx - w / 2) + 'px';
    bar.style.width = Math.round(w) + 'px';
    bar.style.top = Math.round(p.top - host.top + p.height / 2) + 'px';
  }
  const pad = (G.rugR || 0) + 5;
  frame.style.left = Math.round(G.ox - pad) + 'px';
  frame.style.top = Math.round(G.oy - pad) + 'px';
  frame.style.width = Math.round(G.cell * G.board.w + pad * 2) + 'px';
  frame.style.height = Math.round(G.cell * G.board.h + pad * 2) + 'px';
}

function tick() {
  if (!bar) return;
  const vis = onPlay();
  if (bar.hidden === vis) { bar.hidden = !vis; frame.hidden = !vis; if (vis) place(); }
  if (!vis) { if (intro && !(cur && G && G.board === cur.board)) dismissIntro(true); return; }
  if (intro && performance.now() > introT) dismissIntro();
  // the rules state is the truth on a quiet board (an undo heals the boss)
  const st = G.state;
  if (st && !G.busy()) {
    let del = 0;
    for (let i = 0; i < st.departed && i < cur.board.carriers.length; i++) del += cur.board.carriers[i].cap || 3;
    for (const c of st.carriers) del += c.fill || 0;
    del = Math.min(cur.total, del);
    if (del !== cur.shown) { cur.shown = del; draw(); }
  }
}

function draw() {
  if (!cur) return;
  const left = Math.max(0, cur.total - cur.shown);
  const pct = (left / cur.total) * 100;
  const fill = bar.querySelector('.bsfill');
  if (fill) fill.style.width = pct + '%';
  const gh = bar.querySelector('.bsghost');
  if (gh) setTimeout(() => { gh.style.width = pct + '%'; }, calm() ? 0 : 380); // the white "damage" sliver catches up
  const em = bar.querySelector('.bshp em');
  if (em) em.textContent = t('bossHp', { a: left, b: cur.total });
  bar.classList.toggle('low', pct <= 25);
  bar.classList.toggle('down', left === 0);
  bar.setAttribute('aria-label', `${bossName(cur.b)}: ${t('bossHp', { a: left, b: cur.total })}`);
}

// a cat landed in a carrier: the boss takes a hit
function hit() {
  if (!onPlay()) return;
  cur.shown = Math.min(cur.total, cur.shown + 1);
  draw();
  SFX.hit();
  if (!calm()) {
    const f = bar.querySelector('.bsface');
    f.classList.remove('ouch');
    void f.offsetWidth;
    f.classList.add('ouch');
    const p = document.createElement('i');
    p.className = 'bsminus';
    p.textContent = '-1';
    bar.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }
  // 75 / 50 / 25% of the HP left: a hurt line
  const left = (cur.total - cur.shown) / cur.total;
  const k = left <= 0.25 ? 3 : left <= 0.5 ? 2 : left <= 0.75 ? 1 : 0;
  if (k > cur.hurt && cur.shown < cur.total) {
    cur.hurt = k;
    const q = bar.querySelector('.bsquip');
    q.textContent = loc(B.hurtLine(k - 1)) + (k === 3 ? ' ' + t('bossLeft', { n: cur.total - cur.shown }) : '');
    q.hidden = false;
    q.classList.remove('pop');
    void q.offsetWidth;
    q.classList.add('pop');
    clearTimeout(q._t);
    q._t = setTimeout(() => { q.hidden = true; }, 1700);
    SFX.grunt();
    haptics.light();
  }
}

// ---------------- intro card ----------------
function showIntro() {
  const b = cur.b;
  intro = document.createElement('div');
  intro.id = 'bossintro';
  intro.className = calm() ? 'calm' : '';
  intro.style.setProperty('--bh', b.hue);
  const vip = bonusOf(cur.n, 'boss');
  intro.innerHTML = `<div class="biglow"></div><i class="bitag">${t('bossTag')}</i>${portrait(b, 'biface')}
<b class="biname">${esc(bossName(b))}</b><span class="biwant">${esc(t('bossWants', { name: bossName(b), n: cur.total }))}</span>
<span class="bitaunt">${esc(loc(b.taunt))}</span>${vip ? `<i class="bivip">${img('ord_vip')}${esc(t('bossVip', { c: vip }))}</i>` : ''}<small class="bigo">${t('bossGo')}</small>`;
  document.body.appendChild(intro);
  introT = performance.now() + 3400;
  SFX.intro();
  haptics.heavy();
}
function dismissIntro(now = false) {
  if (!intro) return;
  const el = intro;
  intro = null;
  if (now || calm()) { el.remove(); return; }
  el.classList.add('out');
  setTimeout(() => el.remove(), 320);
}

// ---------------- the board is cleared ----------------
function cleared(stars, go) {
  const S = ctx.cur();
  const camp = !!G && !G.demo && S.mode === 'play' && !S.daily && !S.show;
  const first = camp && S.n === save.data.level; // checked before main's onWin moves the level on
  const got = first ? B.onClear(save.data, S.n) : [];
  if (got.length) { save.commit(); track('chest_earned', { n: S.n, t: got.map((e) => e.t).join('+') }); }
  const bossNow = !!cur && G.board === cur.board && camp;
  dismissIntro(true);
  if (bossNow) { cur.shown = cur.total; draw(); }
  const fin = () => { go(stars); afterWin(got); };
  if (flushing || !bossNow) return fin();
  defeat(got.some((e) => e.t === 'boss'), fin);
}

// the defeat ceremony: the boss gives up, confetti, the gold chest drops (auto-advances; a tap skips)
function defeat(chest, go) {
  const b = cur.b;
  const el = document.createElement('div');
  el.id = 'bossdefeat';
  el.className = calm() ? 'calm' : '';
  el.style.setProperty('--bh', b.hue);
  el.innerHTML = `<div class="bdrays"></div><i class="bdtag">${t('bossBeaten')}</i><div class="bdwrap">${portrait(b, 'bdface')}<i class="bdflag"><svg viewBox="0 0 40 48"><path d="M5 2v46" stroke="#8e5530" stroke-width="3.5" stroke-linecap="round"/><path d="M7 4c8-3 13 3 20 1s9-2 11 0v18c-3-2-6-2-11 0s-12-4-20-1z" fill="#fff" stroke="#c9b9a0" stroke-width="1.6"/></svg></i></div>
<b class="bdname">${esc(t('bossGiveUp', { name: bossName(b) }))}</b><span class="bdline">${esc(loc(b.defeat))}</span>${chest ? img('chest_gold', 'bdchest') : ''}`;
  document.body.appendChild(el);
  if (!calm()) confetti(el, 46);
  SFX.fanfare();
  haptics.success();
  const done = () => { if (!cer) return; const c = cer; cer = null; clearTimeout(c.timer); c.el.classList.add('out'); setTimeout(() => c.el.remove(), 260); c.go(); };
  cer = { el, go, timer: setTimeout(done, calm() ? 1600 : 3300) };
  el.addEventListener('pointerdown', () => { if (cer && performance.now() - t0 > 500) done(); });
  const t0 = performance.now();
  track('boss_defeat', { n: cur.n, boss: b.id });
}
function finishCer() {
  if (!cer) return;
  const c = cer;
  cer = null;
  clearTimeout(c.timer);
  c.el.remove();
  c.go();
}

function confetti(host, n) {
  const cols = ['#ffd43b', '#e5484d', '#4f86b8', '#5aa35a', '#c77dff', '#ff9a2e', '#fff6e5'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'bxconf';
    p.style.background = cols[i % cols.length];
    p.style.left = 50 + (Math.random() - 0.5) * 20 + '%';
    host.appendChild(p);
    const dx = (Math.random() - 0.5) * 380;
    const up = 160 + Math.random() * 220;
    p.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${dx * 0.6}px,${-up}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${dx}px,${520 - up}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 900, delay: Math.random() * 250, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'both' }).onfinish = () => p.remove();
  }
}

// ---------------- win card: the flame meter and a chest waiting to be opened ----------------
function afterWin(got) {
  let n = 0;
  const poll = setInterval(() => {
    const card = document.querySelector('#modal .card.win');
    if (!card && ++n < 60) return;
    clearInterval(poll);
    if (!card) return;
    const S = ctx.cur();
    card.classList.add('bxhas');
    const streak = got.some((e) => e.t === 'streak');
    if (!S.daily && !S.show) card.insertAdjacentHTML('beforeend', flameChip(streak));
    chestButton(card);
  }, 120);
}
const flameChip = (full) => {
  const k = full ? B.STREAK_LEN : B.flame(save.data);
  const pips = Array.from({ length: B.STREAK_LEN }, (_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('');
  return `<div class="bxflame${full ? ' full' : ''}" title="${esc(t('flameTip'))}" aria-label="${esc(t('flameLine', { a: k, b: B.STREAK_LEN }))}">${img('boss_flame', 'bxfi')}<span class="bxpips">${pips}</span>${full ? `<b>${t('flameFull')}</b>` : ''}</div>`;
};
function chestButton(card) {
  const q = B.state(save.data).q;
  const old = card.querySelector('.bxchest');
  if (old) old.remove();
  if (!q.length) return;
  const gold = q[0].t === 'boss';
  card.insertAdjacentHTML('beforeend', `<button class="bxchest ${gold ? 'gold' : ''}${calm() ? ' calm' : ''}" data-bx="open" aria-label="${t('chTapOpen')}">${img(gold ? 'chest_gold' : 'chest_wood', 'bxci')}${q.length > 1 ? `<i class="bxn">${q.length}</i>` : ''}<b>${t('chTapOpen')}</b></button>`);
}

// ---------------- chest opening ----------------
const KIND = { wood: 'chWood', boss: 'chBoss', streak: 'chStreak' };
const TIER = { common: 'tierCommon', rare: 'tierRare', epic: 'tierEpic' };
function openQueue() {
  if (chestOn) return;
  const coins0 = save.data.coins;
  const r = B.openNext(save.data);
  if (!r) return;
  save.commit();
  track('chest_open', { t: r.e.t, tier: r.loot.tier, coins: r.loot.coins, cos: r.loot.cos || '' });
  showChest(r, coins0, () => {
    if (ctx.sync) ctx.sync();
    const card = document.querySelector('#modal .card.win');
    if (card) chestButton(card);
    if (ctx.hubRedraw && document.querySelector('#cafe .hubmap')) ctx.hubRedraw();
    if (B.pending(save.data)) setTimeout(openQueue, 250);
  });
}

function showChest({ e, loot }, coins0, done) {
  chestOn = true;
  const gold = e.t === 'boss';
  const tier = loot.tier;
  const el = document.createElement('div');
  el.id = 'chestfx';
  el.className = `t-${tier} k-${e.t}${calm() ? ' calm' : ''}`;
  const items = [];
  if (loot.coins) items.push({ k: 'coins', n: loot.coins });
  for (const [k, n] of Object.entries(loot.items)) items.push({ k, n });
  if (loot.cos) items.push({ k: 'cos', id: loot.cos });
  const cosIt = loot.cos ? SH.item(loot.cos) : null;
  el.innerHTML = `<div class="cxrays"></div><div class="cxflash"></div>
<div class="cxhead"><b>${t(KIND[e.t])}</b>${gold ? `<i class="cxtier">${t(TIER[tier])}</i>` : ''}</div>
<div class="cxstage">${img(gold ? 'chest_gold' : 'chest_wood', 'cxshut')}${img(gold ? 'chest_gold_open' : 'chest_wood_open', 'cxopen')}</div>
<div class="cxloot">${items.map((it, i) => `<div class="cxit k-${it.k}" style="--i:${i}">${itemArt(it)}<b>${it.k === 'coins' ? '+0' : it.k === 'cos' ? esc(loc(cosIt.name)) : '+' + it.n}</b></div>`).join('')}</div>
<small class="cxhint">${t('chTapOpen')}</small>
<button class="btn cxgo" hidden>${t('chCollect')}</button>
<div class="cxpill">${img('hud_coin')}<b>${coins0}</b></div>`;
  document.body.appendChild(el);
  for (const cv of el.querySelectorAll('canvas[data-cos]')) paintCos(cv, cv.dataset.cos);
  // the coin counter sits where the HUD's is
  const hc = document.getElementById('coins');
  const pill = el.querySelector('.cxpill');
  const host = document.body.getBoundingClientRect();
  if (hc && hc.getClientRects().length) {
    const r = (hc.closest('.pill') || hc).getBoundingClientRect();
    pill.style.left = Math.round(r.left - host.left) + 'px';
    pill.style.top = Math.round(r.top - host.top) + 'px';
    pill.style.minWidth = Math.round(r.width) + 'px';
  } else { pill.style.right = '12px'; pill.style.top = '12px'; }
  const pb = pill.querySelector('b');
  const shut = el.querySelector('.cxshut');
  const hint = el.querySelector('.cxhint');
  const go = el.querySelector('.cxgo');
  let phase = 'drop';
  let speed = 1;
  let wob = 0;
  let timers = [];
  const at = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  const skippable = B.state(save.data).open > 1; // the very first chest always plays in full
  const close = () => {
    if (phase === 'closed') return;
    phase = 'closed';
    timers.forEach(clearTimeout);
    el.classList.add('out');
    setTimeout(() => { el.remove(); chestOn = false; done(); }, calm() ? 0 : 220);
  };
  const finalState = () => { // every item out, every counter at its end value
    timers.forEach(clearTimeout);
    timers = [];
    phase = 'end';
    el.classList.add('opened', 'shown');
    el.querySelectorAll('.cxit').forEach((x) => x.classList.add('in'));
    const c = el.querySelector('.cxit.k-coins b');
    if (c) c.textContent = '+' + loot.coins;
    pb.textContent = coins0 + loot.coins;
    hint.hidden = true;
    go.hidden = false;
    if (cosIt && !el.querySelector('#cxreveal')) reveal(el, cosIt, tier);
  };
  go.addEventListener('click', (ev) => { ev.stopPropagation(); close(); });
  if (calm()) { SFX.burst(); finalState(); return; }

  const burst = () => {
    phase = 'burst';
    el.classList.add('opened');
    hint.hidden = true;
    SFX.burst();
    haptics.success();
    sparkle(el.querySelector('.cxstage'), tier === 'common' ? 14 : 26);
    at(() => { el.classList.add('shown'); items.forEach((it, i) => at(() => pop(it, i), 260 + i * 420)); }, 380);
    at(() => {
      if (cosIt) at(() => { reveal(el, cosIt, tier); }, 300);
      phase = 'end';
      go.hidden = false;
    }, 380 + items.length * 420 + 700);
  };
  const pop = (it, i) => {
    const node = el.querySelectorAll('.cxit')[i];
    node.classList.add('in');
    audio.pop();
    if (it.k !== 'coins') return;
    const b = node.querySelector('b');
    const t0 = performance.now();
    const step = () => {
      const q = Math.min(1, (performance.now() - t0) / 650);
      b.textContent = '+' + Math.round(loot.coins * q);
      if (q < 1 && phase !== 'closed') requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    at(() => shower(node.querySelector('img'), pill, pb, coins0, loot.coins), 500);
  };
  const wobble = () => {
    if (phase !== 'wobble') return;
    wob++;
    const d = Math.round(560 / speed);
    shut.style.setProperty('--wd', d + 'ms');
    shut.classList.remove('wob');
    void shut.offsetWidth;
    shut.classList.add('wob');
    SFX.wobble(wob);
    haptics.light();
    if (wob >= 3) at(burst, d);
    else at(wobble, d + Math.round(120 / speed));
  };
  at(() => { phase = 'wobble'; wobble(); }, 620);
  el.addEventListener('pointerdown', () => {
    if (phase === 'wobble' || phase === 'drop') { speed = Math.min(4, speed * 1.7); hint.textContent = t('chTapFaster'); }
    if (skippable && (phase === 'burst' || (phase === 'wobble' && wob >= 1))) { SFX.burst(); finalState(); }
  });
}

function itemArt(it) {
  if (it.k === 'coins') return img('hud_coin');
  if (it.k === 'cos') {
    const x = SH.item(it.id);
    return x.kind === 'room' ? img(x.art, 'cxroom') : `<canvas class="cxcv" data-cos="${it.id}" width="96" height="96"></canvas>`;
  }
  return img('btn_' + it.k);
}
function paintCos(cv, id) {
  const x = SH.item(id);
  const c = cv.getContext('2d');
  const w = cv.width;
  const h = cv.height;
  c.clearRect(0, 0, w, h);
  if (x.kind === 'hat') { drawHead(c, 0, w / 2, h * 0.6, 0, w * 0.6, 1, { v: 0 }); drawHat(c, w / 2, h * 0.6, 0, w * 0.6, 1, id); return; }
  const art = IMG[`r7/carrier_${COLOR_PAL[1].name}`];
  if (!art) return;
  const cw = w * 0.8;
  const ch = cw * (art.height / art.width);
  c.save();
  c.translate(w / 2, h * 0.94);
  c.drawImage(art, -cw / 2, -ch, cw, ch);
  drawCarrierSkin(c, cw, ch, id);
  c.restore();
}

// the full-screen card for a rare / epic look: sparkles, the tag, the item, Wear it
function reveal(host, x, tier) {
  const r = document.createElement('div');
  r.id = 'cxreveal';
  r.className = `t-${tier}`;
  r.innerHTML = `<div class="cxrays"></div><i class="cxtier">${t(TIER[tier])}</i><small>${t(x.kind === 'room' ? 'chNewRoom' : 'chNewLook')}</small>
<div class="cxbig">${x.kind === 'room' ? img(x.art, 'cxroom') : `<canvas data-cos="${x.id}" width="200" height="200"></canvas>`}</div>
<b>${esc(loc(x.name))}</b><div class="cxrow"><button class="btn green sm cxwear">${t(x.kind === 'room' ? 'chUse' : 'chWear')}</button><button class="btn sm cxok">${t('chCollect')}</button></div>`;
  host.appendChild(r);
  const cv = r.querySelector('canvas[data-cos]');
  if (cv) paintCos(cv, x.id);
  if (!calm()) sparkle(r.querySelector('.cxbig'), 30);
  SFX.reveal();
  haptics.success();
  r.querySelector('.cxwear').addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (SH.equip(save.data, x.id)) { save.commit(); track('chest_wear', { id: x.id }); }
    ev.currentTarget.textContent = t('chWorn');
    ev.currentTarget.disabled = true;
  });
  r.querySelector('.cxok').addEventListener('click', (ev) => { ev.stopPropagation(); r.remove(); });
}

function sparkle(host, n) {
  if (!host || calm()) return;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.className = 'bxspark';
    host.appendChild(s);
    const a = Math.random() * Math.PI * 2;
    const d = 60 + Math.random() * 130;
    s.animate([
      { transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px),calc(-50% + ${Math.sin(a) * d}px)) scale(${0.6 + Math.random()})`, opacity: 0 },
    ], { duration: 700 + Math.random() * 600, delay: Math.random() * 200, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' }).onfinish = () => s.remove();
  }
}

// coins fly from the item to the counter, which ticks up as they land
function shower(src, pill, pb, from, add) {
  if (!src || !pill) { pb.textContent = from + add; return; }
  const a = src.getBoundingClientRect();
  const b = pill.getBoundingClientRect();
  const host = document.body.getBoundingClientRect();
  const n = clamp(Math.round(add / 12), 5, 14);
  for (let i = 0; i < n; i++) {
    const c = document.createElement('img');
    c.src = url('hud_coin');
    c.className = 'bxcoin';
    c.style.left = a.left - host.left + 'px';
    c.style.top = a.top - host.top + 'px';
    document.body.appendChild(c);
    const dx = b.left - a.left + 6;
    const dy = b.top - a.top + 4;
    c.animate([
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${dx * 0.3 + (i - n / 2) * 14}px,${dy * 0.2 - 50 - (i % 3) * 14}px) scale(1.15) rotate(${i % 2 ? 120 : -120}deg)`, offset: 0.4 },
      { transform: `translate(${dx}px,${dy}px) scale(.55) rotate(${i % 2 ? 300 : -300}deg)` },
    ], { duration: 640, delay: i * 55, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'both' }).onfinish = () => {
      c.remove();
      pb.textContent = Math.round(from + (add * (i + 1)) / n);
      pill.classList.remove('bump');
      void pill.offsetWidth;
      pill.classList.add('bump');
      if (i % 3 === 0) audio.tick();
    };
  }
}

// ---------------- the map (hub.js calls this after each render) ----------------
export function decorateMap(m, geo, curLv) {
  const path = m.querySelector('.hmpath');
  if (!path) return;
  const d = save.data;
  const bst = B.state(d);
  for (const node of path.querySelectorAll('.hmn.boss')) {
    const lv = +node.dataset.lv;
    const b = B.bossOf(lv);
    if (!b) continue;
    node.insertAdjacentHTML('afterbegin', img('map_castle', 'bmcastle'));
    node.insertAdjacentHTML('beforeend', portrait(b, 'bmface'));
    node.classList.toggle('beaten', lv < curLv);
    node.setAttribute('aria-label', `${t('mapLevel', { n: lv })} · ${t('bossTag')} ${bossName(b)}`);
  }
  const html = [];
  for (let lv = geo.first; lv <= geo.lastLv; lv++) {
    if (lv % 5 || lv === curLv - 1) continue; // the chest just earned sits under the pill: left out
    const p = geo.pos(lv + 0.5);
    const gold = B.isBossLevel(lv);
    const open = lv < curLv;
    html.push(`<i class="bmchest${gold ? ' gold' : ''}${open ? ' open' : ''}" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px">${img(gold ? (open ? 'chest_gold_open' : 'chest_gold') : open ? 'chest_wood_open' : 'chest_wood')}</i>`);
  }
  // the pill under the current node: the flame (3 wins in a row = a chest), then the next chest, or one to open
  const pc = geo.pos(curLv);
  const nx = B.nextChest(curLv);
  const k = B.flame(d);
  const pips = Array.from({ length: B.STREAK_LEN }, (_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('');
  const boss = nx.t === 'boss';
  const label = nx.left <= 1 ? t(boss ? 'chBossOne' : 'chNextOne') : t(boss ? 'chBossIn' : 'chNextIn', { n: nx.left });
  const wait = bst.q.length;
  const right = wait
    ? `<button class="bmopen" data-bx="open">${img(bst.q[0].t === 'boss' ? 'chest_gold' : 'chest_wood')}<b>${t('chTapOpen')}</b></button>`
    : `<span class="bmnext${boss ? ' boss' : ''}">${img(boss ? 'chest_gold' : 'chest_wood')}<b>${label}</b></span>`;
  const W = path.clientWidth || 360;
  html.push(`<div class="bmpill" style="left:${clamp(pc.x, 112, W - 112).toFixed(1)}px;top:${(pc.y + 50).toFixed(1)}px"><span class="bmflame" title="${esc(t('flameTip'))}" aria-label="${esc(t('flameLine', { a: k, b: B.STREAK_LEN }))}">${img('boss_flame')}<span class="bxpips">${pips}</span></span>${right}</div>`);
  path.insertAdjacentHTML('beforeend', html.join(''));
}

// map chapter names past the named stops (hub.js chapterName)
export const chapterName = (c, named) => loc(B.chapterName(c, named));
