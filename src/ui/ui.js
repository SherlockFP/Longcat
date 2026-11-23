// DOM overlay screens. Pure view: main.js owns the state and passes info in.
import { t, LANGS, lang } from '../i18n.js';
import { assetUrl } from '../game/breeds.js';
import { save } from '../kit/save.js';
import { PRODUCTS } from '../kit/iap.js';
import { AREAS, TEASER, RESIDENTS, loc, isBuilt, pending, canAfford, nextResident, perkKind, perkValue, loveOf, treatCost, LOVE_COSTS, guestsFor, clutterLevel } from '../game/cafe.js';
import './r7.css';
import { railHtml as liveRail, goalsHtml } from './live.js';
import { OUTFITS } from '../game/live.js';

const root = document.getElementById('ui');
let actions = {};
let cur = { screen: 'none', info: null };

const img = (name, cls = '') => `<img class="${cls}" src="${assetUrl(name)}" alt="" draggable="false">`;

const colorHead = (color, cls = '') => img(`v2/head_${color}.webp`, cls);
// round 7 art (public/assets/r7, see art-src/r7/assets.md)
const r7 = (name, cls = '') => img(`r7/${name}.webp`, cls);
const r7c = (name, cls = '') => `<img class="${cls} cfb" src="${assetUrl('r7/' + name + '.webp')}" alt="" draggable="false">`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
// local view state (not game state): hub view, shop tab, residents page, an open "More help" on the fail sheet
let cafeView = 'room';
let shopTab = 'coins';
let resPage = 0;
// floor placement in the r7 rooms (stage = the 1024px square room art): [x, y (bottom), width] as fractions
const D7 = {
  counter: { counter_counter: [0.36, 0.69, 0.38], counter_pastry: [0.68, 0.68, 0.28], counter_lamps: [0.72, 0.31, 0.26], counter_chalkboard: [0.2, 0.9, 0.15], counter_tables: [0.69, 0.96, 0.3], counter_plant: [0.15, 0.72, 0.16] },
  window: { window_seat: [0.64, 0.6, 0.44], window_plants: [0.36, 0.36, 0.16], window_bookshelf: [0.24, 0.66, 0.2], window_cattree: [0.84, 0.84, 0.2], window_rug: [0.52, 0.92, 0.42], window_lights: [0.64, 0.2, 0.42] },
  cushion: { cushion_rug: [0.48, 0.92, 0.42], cushion_lamp: [0.85, 0.76, 0.12], cushion_shelf: [0.22, 0.64, 0.2], cushion_hammock: [0.63, 0.72, 0.26], cushion_bench: [0.3, 0.86, 0.3], cushion_pile: [0.74, 0.96, 0.26] },
  patio: { patio_planters: [0.32, 0.6, 0.26], patio_pergola: [0.54, 0.62, 0.36], patio_fountain: [0.5, 0.84, 0.26], patio_lights: [0.8, 0.62, 0.2], patio_lounger: [0.24, 0.94, 0.3], patio_tables: [0.74, 0.97, 0.32] },
  rooftop: { roof_canopy: [0.5, 0.62, 0.44], roof_telescope: [0.8, 0.66, 0.18], roof_lemon: [0.2, 0.74, 0.16], roof_tower: [0.85, 0.92, 0.2], roof_beanbags: [0.4, 0.95, 0.3], roof_grill: [0.64, 0.84, 0.22] },
};
const FLAT = /_rug$/; // rugs lie on the floor under everything
// resident floor spots per room (same order as the area's data spots)
const RS7 = { counter: [[0.47, 0.99, 0.25], [0.84, 0.8, 0.18]], window: [[0.42, 0.82, 0.21], [0.74, 0.99, 0.2]], cushion: [[0.52, 0.8, 0.2], [0.5, 0.99, 0.21]], patio: [[0.36, 0.76, 0.19], [0.62, 0.99, 0.21]], rooftop: [[0.56, 0.74, 0.19], [0.66, 0.99, 0.21]] };
const floorName = (i) => (i === 0 ? t('groundFloor') : t('floorN', { n: i }));
const paw = () => '<svg class="pawi" viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="5.5" ry="4.5"/><ellipse cx="5" cy="11" rx="2.2" ry="2.8"/><ellipse cx="9.5" cy="6.5" rx="2.2" ry="2.8"/><ellipse cx="14.5" cy="6.5" rx="2.2" ry="2.8"/><ellipse cx="19" cy="11" rx="2.2" ry="2.8"/></svg>';
const boost = (k, icon, tone) => `<button class="bst ${tone}" id="b-${k}" data-act="${k}"><img class="bi" src="${assetUrl('v2/' + icon)}" alt="" draggable="false"><b>${t(k)}</b><i class="badge"></i></button>`;

function mount(html) {
  root.innerHTML = html;
  sheetName = '';
}

// café art: a missing file falls back to a soft placeholder blob so the hub still renders
const cimg = (file, cls = '', alt = '') => `<img class="${cls} cfb" src="${assetUrl('v2/' + file)}" alt="${alt}" draggable="false">`;
root.addEventListener('error', (e) => {
  const el = e.target;
  if (!el || !el.classList || !el.classList.contains('cfb')) return;
  const ph = document.createElement('div');
  ph.className = el.className.replace('cfb', '') + ' ph';
  ph.style.cssText = el.style.cssText;
  el.replaceWith(ph);
}, true);

// one resident's share of its perk kind (perks stack: see cafe.perkLevel)
function perkText(r) {
  const k = perkKind(r.perk);
  const v = perkValue(r);
  if (k === 'coins') return t('perk_coins', { n: 5 * v });
  if (k === 'hint') return t(v > 1 ? 'perk_hint2' : 'perk_hint', { n: v });
  return t(v > 1 ? 'perk_' + k + '2' : 'perk_' + k);
}
const gearSvg = '<svg viewBox="0 0 24 24" class="gear"><g stroke-linejoin="round"><circle cx="12" cy="12" r="6.2"/><g id="t2"><rect x="10.2" y="1.6" width="3.6" height="4.4" rx="1"/></g><use href="#t2" transform="rotate(45 12 12)"/><use href="#t2" transform="rotate(90 12 12)"/><use href="#t2" transform="rotate(135 12 12)"/><use href="#t2" transform="rotate(180 12 12)"/><use href="#t2" transform="rotate(225 12 12)"/><use href="#t2" transform="rotate(270 12 12)"/><use href="#t2" transform="rotate(315 12 12)"/><circle cx="12" cy="12" r="2.4" fill="#fff6e5" stroke="none"/></g></svg>';
const lockSvg = '<svg class="lock" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke-width="2.4"/></svg>';

// ---- v2 economy helpers ----
const RES_IMG = { coins: 'v2/ui_coin.webp', hint: 'v2/ui_hint.webp', scoop: 'v2/ui_scoop.webp', undo: 'v2/ui_undo.webp' };
const decorSvg = '<svg class="dec" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9.5 21v-6h5v6" fill="#fff6e5" stroke="none"/></svg>';
const ribbonSvg = '<svg class="rib" viewBox="0 0 24 24"><path d="M8 13 5 22.5l4.2-2 3 2.8 1.2-9z"/><path d="M16 13l3 9.5-4.2-2-3 2.8-1.2-9z"/><circle cx="12" cy="9" r="7"/><circle cx="12" cy="9" r="3.2" fill="#fff6e5" stroke="none"/></svg>';
const checkSvg = '<svg class="chk" viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const xSvg = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke-width="3.6" stroke-linecap="round"/></svg>';
const adSvg = '<svg class="adi" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="3.5" fill="#ff5b6e" stroke="#1d2b53" stroke-width="2"/><path d="M10 9.2v5.6l4.8-2.8z" fill="#fff"/></svg>';
// No Ads: the video-ad icon (a play button on a screen) struck through, no words, so it reads in every language
const noAdSvg = '<svg class="noad" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="#fff6e5" stroke="#e5484d" stroke-width="5"/><rect x="13" y="16" width="22" height="16" rx="4" fill="#1d2b53"/><path d="M21.5 20.2v7.6l6.4-3.8z" fill="#fff6e5"/><path d="M10.5 37.5 37.5 10.5" stroke="#e5484d" stroke-width="5" stroke-linecap="round"/></svg>';
const fmtMs = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// a reward as small chips: coins, boosters, the exclusive decor
const chips = (r, cls = '') => `<span class="chips ${cls}">${['coins', 'hint', 'scoop', 'undo'].filter((k) => r[k]).map((k) => `<span class="chip">${img(RES_IMG[k])}<b>${k === 'coins' ? r[k] : 'x' + r[k]}</b></span>`).join('')}${r.decor ? `<span class="chip dc">${decorSvg}</span>` : ''}${r.outfit ? `<span class="chip">${r7('hud_yarn')}</span>` : ''}</span>`;
const rbRound = (inner) => `<i class="round">${inner}</i>`;
const checkSvg0 = '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7" fill="none" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const pawSvg = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="5.5" ry="4.5"/><ellipse cx="5" cy="11" rx="2.2" ry="2.8"/><ellipse cx="9.5" cy="6.5" rx="2.2" ry="2.8"/><ellipse cx="14.5" cy="6.5" rx="2.2" ry="2.8"/><ellipse cx="19" cy="11" rx="2.2" ry="2.8"/></svg>';
const dot = (on) => `<i class="dot" ${on ? '' : 'hidden'}></i>`;
const livesPill = (l) => `<div class="pill sm lives">${img('v2/ui_heart.webp')}<b id="lives-n">${l.n}</b><small id="lives-t">${l.n >= 5 ? '' : fmtMs(l.ms)}</small></div>`;


// The Counter and Window shells have cracked plaster painted in. Once a few tasks are built the crack is papered
// over with a copy of the same wallpaper from a clean spot (shift = whole stripe / dot periods), in 1024px shell units.
const PATCH = {
  counter: { dx: 190, dy: 0, poly: [[66, 290], [204, 223], [212, 246], [210, 282], [226, 288], [225, 312], [212, 344], [196, 370], [172, 386], [164, 412], [128, 438], [100, 462], [66, 486]] },
  window: { dx: -140, dy: -48, poly: [[808, 262], [830, 246], [856, 250], [872, 256], [886, 262], [894, 300], [894, 322], [892, 338], [888, 362], [870, 382], [852, 378], [840, 360], [820, 350], [812, 320], [800, 290]] },
};
const PATCH_AT = 3; // tasks built
function patchHtml(area, builtN, fresh) {
  const p = PATCH[area.id];
  if (!p || area.flip || builtN < PATCH_AT) return '';
  const pc = (v) => ((v / 1024) * 100).toFixed(2) + '%';
  const clip = p.poly.map(([x, y]) => `${pc(x)} ${pc(y)}`).join(',');
  return `<div class="patch ${fresh ? 'fresh' : ''}" style="clip-path:polygon(${clip})">${cimg(area.shell, 'shell', '').replace('<img ', `<img style="transform:translate(${pc(-p.dx)},${pc(-p.dy)})" `)}</div>`;
}


// a sheet sits over the current screen (shop, tasks, Cat Show, out of lives) and never replaces the win/fail card under it
let sheetName = '';
export const openSheet = (...a) => sheet(...a); // retention sheets (ui/live.js)
function sheet(name, cls, title, body) {
  const old = document.getElementById('sheet');
  const keep = old && sheetName === name ? old.querySelector('.pbody').scrollTop : 0; // re-render in place keeps the scroll
  if (old) old.remove();
  sheetName = name;
  root.insertAdjacentHTML('beforeend', `
<div class="backdrop sheet" id="sheet"><div class="panel ${cls}">
  <div class="phead"><h2 class="title yellow sm">${title}</h2><button class="round x" data-act="closesheet" aria-label="${t('close')}">${xSvg}</button></div>
  <div class="pbody">${body}</div>
</div></div>`);
  if (keep) document.querySelector('#sheet .pbody').scrollTop = keep;
}

// win card: a few coins fly from the reward pill into the HUD coin counter, which then ticks up
function flyCoins(from, to) {
  const hc = document.getElementById('coins');
  const src = document.querySelector('#modal .reward.cn img');
  if (!hc || !src) return;
  const pill = hc.closest('.pill');
  if (pill) pill.classList.add('lift');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { hc.textContent = to; return; }
  hc.textContent = from;
  setTimeout(() => {
    const a = src.getBoundingClientRect();
    const b = hc.getBoundingClientRect();
    const dx = b.left - a.left - 8;
    const dy = b.top - a.top - 6;
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('img');
      c.src = src.src;
      c.className = 'flycoin';
      c.style.left = a.left + 'px';
      c.style.top = a.top + 'px';
      document.body.appendChild(c);
      const k = c.animate([
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${dx * 0.4 + (i - 2.5) * 14}px,${dy * 0.25 - 30}px) scale(1.1)`, offset: 0.35 },
        { transform: `translate(${dx}px,${dy}px) scale(.55)` },
      ], { duration: 620, delay: i * 70, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'both' });
      k.onfinish = () => {
        c.remove();
        if (document.getElementById('coins') === hc) hc.textContent = Math.round(from + ((to - from) * (i + 1)) / 6);
        if (pill) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
      };
    }
  }, 500);
}

// win card: one star flies from the stars into the next-build meter, which then fills
function flyStar(cn, n) {
  const bar = document.querySelector('#modal .cafebar .bar i');
  const src = document.querySelector('#modal .stars .star:last-child') || document.querySelector('#modal .reward.st img');
  if (!bar) return;
  const to = Math.min(100, Math.round((cn.stars / cn.cost) * 100));
  const from = Math.min(100, Math.round((Math.max(0, cn.stars - n) / cn.cost) * 100));
  if (reduced() || !src) return;
  bar.style.width = from + '%';
  setTimeout(() => {
    const a = src.getBoundingClientRect();
    const b = bar.parentElement.getBoundingClientRect();
    const s = document.createElement('img');
    s.src = assetUrl('r7/hud_star.webp');
    s.className = 'flycoin flystar';
    s.style.left = a.left + a.width / 2 - 18 + 'px';
    s.style.top = a.top + a.height / 2 - 18 + 'px';
    document.body.appendChild(s);
    const dx = b.left + (b.width * to) / 100 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const k = s.animate([
      { transform: 'translate(0,0) scale(1.3) rotate(0)' },
      { transform: `translate(${dx * 0.5}px,${dy * 0.3 - 50}px) scale(1.1) rotate(180deg)`, offset: 0.45 },
      { transform: `translate(${dx}px,${dy}px) scale(.5) rotate(360deg)` },
    ], { duration: 700, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
    k.onfinish = () => { s.remove(); bar.style.width = to + '%'; bar.parentElement.classList.add('bump'); };
  }, 1100);
}

// zoomed-out townhouse: floors stacked from the street up, the floor under construction with its crane and star cost,
// the next one as a blueprint ghost, the roof on top
function houseHtml(curFloor, ai) {
  const n = AREAS.length;
  const roofI = n - 1; // the last area is the rooftop terrace
  const done = (i) => AREAS[i].tasks.every((x) => isBuilt(x.id));
  const starsLeft = (i) => pending(i).reduce((a, x) => a + (x.cost || 1), 0);
  const fl = [];
  for (let i = 0; i < roofI; i++) {
    const st = done(i) ? 'done' : i === curFloor ? 'cur' : curFloor >= 0 && i === curFloor + 1 ? 'ghost' : '';
    if (!st) break;
    const art = st === 'done' ? (i === 0 ? 'floor_ground' : 'floor_lit') : st === 'cur' ? (i === 0 && AREAS[0].tasks.some((x) => isBuilt(x.id)) ? 'floor_ground' : 'floor_scaffold') : 'floor_ghost';
    const tag = st === 'cur' ? `<i class="hcost">${r7('hud_star')}<b>${starsLeft(i)}</b></i>${r7('crane', 'crane')}` : '';
    fl.push(`<button class="hf ${st} ${i === ai ? 'sel' : ''}" data-act="cafearea" data-d="${i - ai}" data-view="room" ${st === 'ghost' ? 'disabled' : ''} aria-label="${loc(AREAS[i].name)}">${r7(art)}${tag}<span>${floorName(i)}</span></button>`);
  }
  // the top: the rooftop terrace once it is reached, else the gable roof over the highest floor
  const rs = done(roofI) ? 'done' : roofI === curFloor ? 'cur' : '';
  const roof = rs
    ? `<button class="hf roof ${rs} ${roofI === ai ? 'sel' : ''}" data-act="cafearea" data-d="${roofI - ai}" data-view="room" aria-label="${loc(AREAS[roofI].name)}">${r7('roof_terrace')}${rs === 'cur' ? `<i class="hcost">${r7('hud_star')}<b>${starsLeft(roofI)}</b></i>${r7('crane', 'crane')}` : ''}</button>`
    : `<div class="hf roof gable">${r7('roof_gable')}</div>`;
  const all = curFloor < 0;
  const units = fl.length * 0.5 + (rs ? 0.52 : 0.56) + (all ? 0.5 : 0);
  return `${r7('building_base', 'hbg')}<div class="tower" style="--u:${units.toFixed(2)}">${all ? `<div class="hf ghost next">${r7('floor_ghost')}<span>${t('nextFloorSoon')}</span></div>` : ''}${roof}${fl.reverse().join('')}</div>`;
}

// "new floor" ceremony after a floor's last piece: zoom out to the house, the scaffold rises, the crane drops the
// new floor in with dust and confetti, then a card. Tap skips. Reduced motion: a short cross-fade and the card.
let floorQ = null;
let floorWait = null;
function waitFloor() {
  clearTimeout(floorWait);
  const t0 = Date.now();
  const tick = () => {
    if (!floorQ) return;
    const busy = document.getElementById('modal') || document.getElementById('sheet');
    if (cur.screen === 'cafe' && !busy && Date.now() - t0 > 1500) { const q = floorQ; floorQ = null; playFloor(q); return; }
    if (cur.screen !== 'cafe' && Date.now() - t0 > 30000) { floorQ = null; return; }
    floorWait = setTimeout(tick, 300);
  };
  floorWait = setTimeout(tick, 300);
}

function playFloor(q) {
  const next = AREAS[q.to];
  const res = next ? next.tasks.find((x) => x.resident) : null;
  const calm = reduced();
  const el = document.createElement('div');
  el.className = 'backdrop floorfx' + (calm ? ' calm' : '');
  el.id = 'modal';
  const name = next ? loc(next.name) : t('comingSoon');
  el.innerHTML = `<div class="fx">
  ${r7('building_base', 'hbg')}
  <div class="tower fxt"><div class="hf newf">${r7('floor_scaffold')}<i class="dust d1"></i><i class="dust d2"></i><i class="dust d3"></i></div><div class="hf">${r7(q.from === 0 ? 'floor_ground' : 'floor_lit')}</div></div>
  ${r7('crane', 'fxcrane')}
  ${Array.from({ length: 14 }, (_, i) => `<i class="cf" style="--i:${i}"></i>`).join('')}
</div>
<div class="card cream nfcard">
  ${res ? `<div class="peek respeek">${r7c('res7_' + res.resident.id + '_idle')}</div>` : ''}
  <h2 class="title yellow sm">${next ? t('newFloor', { name }) : t('floorDone')}</h2>
  ${res ? `<p class="nfsub">${t('nextResidentIs', { name: res.resident.name })}</p>` : ''}
  <button class="btn" data-act="${next ? 'cafearea' : 'floordone'}" data-d="1" data-view="room">${t('letsGo')}</button>
</div>`;
  root.appendChild(el);
  const skip = (e) => { if (e.target.closest('.nfcard .btn')) return; el.classList.add('skip'); };
  el.addEventListener('click', skip);
  el.addEventListener('click', (e) => { const b = e.target.closest('.nfcard .btn'); if (b) { el.remove(); if (!next) ui.cafe(cur.info); } });
}

export const ui = {
  init(a) {
    actions = a;
    const setVar = (k, f) => document.documentElement.style.setProperty(k, `url("${assetUrl('r7/' + f)}")`);
    setVar('--r7-play', 'btn_play.webp');
    setVar('--r7-green', 'btn_green.webp');
    setVar('--r7-plaque', 'plaque_wood.webp');
    setVar('--r7-pill', 'pill_cream.webp');
    setVar('--r7-round', 'btn_round.webp');
    setVar('--r7-panel', 'panel_cream.webp');
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      if (actions.click) actions.click();
      // view-only taps (hub view, tabs, pages, the fail sheet's "More help") never reach the game
      const a = el.dataset.act;
      if (el.dataset.view) cafeView = el.dataset.view;
      if (a === 'cafeview') { if (cur.screen === 'cafe') ui.cafe(cur.info); return; }
      if (a === 'cafearea' && +el.dataset.d === 0) { if (cur.screen === 'cafe') ui.cafe(cur.info); return; }
      if (a === 'morehelp') { const c = el.closest('.card'); if (c) c.classList.toggle('more'); return; }
      if (a === 'shoptab') { shopTab = el.dataset.tab; const sh = document.querySelector('#sheet .shop'); if (sh) { sh.dataset.tab = shopTab; sh.querySelectorAll('.stab').forEach((b) => b.classList.toggle('on', b.dataset.tab === shopTab)); } return; }
      if (a === 'rpage') { resPage = +el.dataset.p; ui.residents(); return; }
      const fn = actions[el.dataset.act];
      if (fn) fn(el.dataset);
    });
  },

  refresh() {
    const { screen, info } = cur;
    if (ui[screen]) ui[screen](info);
  },

  // back to the play HUD after a modal (e.g. rewarded continue) was dismissed
  resume() {
    if (cur.screen !== 'play') cur = { screen: 'play', info: cur.hud || cur.info };
  },

  none() {
    cur = { screen: 'none', info: null };
    mount('');
  },

  // ---- home ----
  home(info) {
    cur = { screen: 'home', info };
    const dailyDone = info.dailyDone;
    mount(`
<div id="menu" class="screen on">
  <div class="topbar"><button class="pill" data-act="shop">${img('ui_coin.webp')}<b id="coins">${info.coins}</b></button></div>
  <h1 class="logo">${t('title')}</h1>
  <div class="home-bottom">
    <button class="btn play" data-act="play"><b>${t('play')}</b><small>${t('level', { n: info.level })}</small></button>
    <div class="tiles">
      <button class="tile" data-act="daily">${img('ui_hint.webp')}<span>${t('daily')}</span><i>${dailyDone ? t('dailyDone') : t('streak', { n: info.streak })}</i></button>
      <div class="tile cafelock" role="note" aria-label="${t('cafeTeaser')}"><span class="sil">${cimg('res_mochi.webp')}${lockSvg}</span><span>${t('cafe')}</span><i>${t('cafeTeaser')}</i></div>
      <button class="tile" data-act="settings"><svg viewBox="0 0 24 24" class="gear"><g stroke-linejoin="round"><circle cx="12" cy="12" r="6.2"/><g id="t"><rect x="10.2" y="1.6" width="3.6" height="4.4" rx="1"/></g><use href="#t" transform="rotate(45 12 12)"/><use href="#t" transform="rotate(90 12 12)"/><use href="#t" transform="rotate(135 12 12)"/><use href="#t" transform="rotate(180 12 12)"/><use href="#t" transform="rotate(225 12 12)"/><use href="#t" transform="rotate(270 12 12)"/><use href="#t" transform="rotate(315 12 12)"/><circle cx="12" cy="12" r="2.4" fill="#1d2b53" stroke="none"/></g></svg><span>${t('settings')}</span></button>
    </div>
  </div>
</div>`);
  },

  // ---- gameplay HUD ----
  play(info) {
    cur = { screen: 'play', info };
    cur.hud = info;
    const bst = (k) => `<button class="bst r7b" id="b-${k}" data-act="${k}" aria-label="${t(k)}">${r7('btn_' + k, 'bi')}<b>${t(k)}</b><i class="badge"></i></button>`;
    mount(`
<div id="hud" class="screen on">
  <div class="hud-top2">
    <button class="round" data-act="home" aria-label="${t('home')}"><svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg></button>
    <div class="logo-wrap"><div class="lvl-pill">${paw()}<span>${info.show ? (typeof info.show === 'string' ? info.show : t('showBoard')) : info.daily ? t('dailyLevel') : t('level', { n: info.level })}</span>${paw()}</div></div>
    <div class="hud-r"><div class="hud-lives" id="hud-lives" ${info.lives != null ? '' : 'hidden'}>${r7('hud_heart')}<b>${info.lives ?? 0}</b></div><button class="pill coin" data-act="shop">${r7('hud_coin')}<b id="coins">${info.coins}</b></button></div>
  </div>
  <div class="tut" id="tut" ${info.tut ? '' : 'hidden'}>${info.tut || ''}</div>
  ${info.show ? (info.rush ? `<div class="rushclock" id="rushclock" aria-live="off">0.0s</div>` : '') : `<div class="boosters">${bst('hint')}${bst('scoop')}${bst('undo')}</div>`}
</div>`);
    ui.setHud(info);
  },

  setHud(info) {
    if (cur.screen !== 'play') return;
    Object.assign(cur.info, info);
    const i = cur.info;
    const c = document.getElementById('coins');
    if (c) c.textContent = i.coins;
    const hl = document.getElementById('hud-lives');
    if (hl) { hl.hidden = i.lives == null; const hb = hl.querySelector('b'); if (hb) hb.textContent = i.lives; }
    for (const k of ['hint', 'scoop', 'undo']) {
      const b = document.getElementById('b-' + k);
      if (!b) continue;
      const n = i.boost ? i.boost[k] : 0;
      const badge = b.querySelector('.badge');
      const free = k === 'hint' && i.hintFree;
      const html = free ? t('free') : n > 0 ? String(n) : `${img('ui_coin.webp')}${i.costs ? i.costs[k] : ''}`;
      if (badge.dataset.h !== html) {
        badge.dataset.h = html;
        badge.innerHTML = html;
        badge.classList.toggle('cost', n <= 0 && !free);
        badge.classList.toggle('free', !!free);
      }
      b.classList.toggle('dim', k === 'undo' && !i.canUndo);
      b.classList.toggle('on', k === 'scoop' && !!i.scoopOn);
    }
  },

  setCoins(n) {
    const c = document.getElementById('coins');
    if (c) c.textContent = n;
  },

  // ---- cards ----
  win(info) {
    cur = { screen: 'win', info };
    // only the stars that were earned (1 normal, 2 hard, 3 super hard): a clean clear never shows grey slots
    const stars = Array.from({ length: info.stars }, (_, i) => img('ui_star.webp', 'star on').replace('<img ', `<img style="--i:${i}" `)).join('');
    // a moved-in resident peeks over the card and cheers (by how clean the clear was); before that, a cat of the level
    const peek = info.res
      ? `<div class="peek respeek">${r7c('res7_' + info.res + '_idle')}<i class="cheer">${t(info.cheer)}</i></div>`
      : r7c('cat_head_' + info.peek + '_happy', 'peek');
    const cn = info.cafeNext;
    const nr = cn && cn.res;
    const cnTask = cn && AREAS.flatMap((a) => a.tasks).find((x) => x.sprite === cn.sprite);
    const resChip = nr ? `<span class="nres">${r7c('res7_' + nr.id + '_idle')}<b>${nr.left > 0 ? t('resIn', { name: nr.name, n: nr.left }) : t('resReady', { name: nr.name })}</b></span>` : '';
    // the level's best bench chain loops here as the share preview (main.js starts it), with what the player pulled off
    const rrow = `<div class="rrow">${info.coins ? `<div class="reward cn">${img('ui_coin.webp')}<b>+${info.coins}</b></div>` : ''}${info.cafeStars ? `<div class="reward st">${img('ui_star.webp')}<b>+${info.cafeStars}</b></div>` : ''}${info.ribbons ? `<div class="reward st rb">${ribbonSvg}<b>+${info.ribbons}</b></div>` : ''}</div>`;
    const ach = (info.ach || []).map((a) => `<li class="a-${a.k}">${a.text}</li>`).join('');
    // where the coins came from (base, tidy bench, hard level, café perks): a low payout explains itself
    const pay = info.pay ? `<div class="paybd">${info.pay}</div>` : '';
    const hilite = info.chain
      ? `<div class="hilite"><div class="chainclip"><canvas width="240" height="300" aria-hidden="true"></canvas></div><div class="hcol">${rrow}${pay}${ach ? `<ul class="ach">${ach}</ul>` : ''}</div></div>`
      : `${pay}${ach ? `<ul class="ach inline">${ach}</ul>` : ''}`;
    const cafeBar = cn ? `<div class="cafebar"><span class="ticon">${cnTask ? r7c('decor_' + cnTask.id) : cimg(cn.sprite)}</span><div class="cbtxt"><small>${t('cafeNext', { name: cn.name })}</small><div class="bar"><i style="width:${Math.min(100, Math.round((cn.stars / cn.cost) * 100))}%"></i><em>${img('ui_star.webp')}${Math.min(cn.stars, cn.cost)}/${cn.cost}</em></div>${resChip}</div></div>` : '';
    root.insertAdjacentHTML('beforeend', `
<div class="backdrop" id="modal"><div class="card teal win ${info.chain ? 'withclip' : (info.ach || []).length || info.pay ? 'tight' : ''}">
  ${peek}
  <h2 class="title yellow">${t(info.title)}</h2>
  ${info.show ? `<div class="purr showtag">${ribbonSvg}${info.showTag || t('showBoard')}</div>` : `<div class="stars n${info.stars}">${stars}</div>`}
  ${info.chain ? '' : rrow}
  ${hilite}
  ${cafeBar}
  ${info.purr ? `<div class="purr">${info.purr}</div>` : ''}
  ${info.again ? `<button class="btn" data-act="retry">${t('runAgain')}</button>` : info.canBuild ? `<button class="btn" data-act="cafe">${t('build')}</button>` : `<button class="btn" data-act="next">${info.show ? t('show') : t('next')}</button>`}
  <div class="row r7row"><button class="btn teal sm" data-act="home">${t('home')}</button><button class="round share" data-act="share" aria-label="${t('share')}"><svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke-width="3" stroke-linecap="round"/></svg></button></div>
</div></div>`);
    if (info.coins) flyCoins(info.coinsBefore, info.coinsBefore + info.coins);
    if (cn && info.cafeStars) flyStar(cn, info.cafeStars);
  },

  // continue offer: first the why (the stuck cat stays visible above the bench with a "No seat left!" tag and the
  // card explains seats vs the missing carrier), then the ways out. Options the player cannot pay lead to the shop.
  fail(info) {
    cur = { screen: 'fail', info, hud: cur.hud };
    const scoopOk = info.scoop > 0 || info.coins >= info.scoopCost;
    const opt = (act, tone, icon, b, sm, cls = '') => `<button class="opt ${tone} ${cls}" data-act="${act}">${icon}<b>${b}</b><small>${sm}</small></button>`;
    // the first lost bench on a level: one free Take Back (the losing tap undone) leads the options
    const back = info.freeBack ? opt('takeback', 'mint', img('v2/ui_undo.webp', 'oi'), t('takeBack'), t('free'), 'freeback') : '';
    const scoop = scoopOk ? opt('offerscoop', 'mint', img('v2/ui_scoop.webp', 'oi'), t('scoop'), info.scoop > 0 ? t('scoopUse', { n: info.scoop }) : `${img('ui_coin.webp', 'mini')}${info.scoopCost}`) : '';
    // only what can be paid looks like a button: a seat the purse cannot cover is a quiet "Get coins" link instead
    const seat = info.canSeat ? opt('coinseat', 'gold', img('v2/ui_coin.webp', 'oi'), t('extraSeat'), `${img('ui_coin.webp', 'mini')}${info.seatCost}`) : '';
    const short = !info.canSeat && info.store ? `<button class="link getc" data-act="shop">${t('seatShort', { n: info.seatCost, h: info.coins })} · <b>${t('getCoins')}</b></button>` : '';
    const ad = info.ad ? opt('adheart', 'green', adSvg, t('adSeatShort'), t('watchAd')) : '';
    const tag = info.stuckAt ? `<div class="stucktag" style="left:${info.stuckAt.x}px;top:${info.stuckAt.y}px">${t('stuckWhy')}</div>` : '';
    const more = info.practice ? [] : [scoop, seat, ad].filter(Boolean);
    const offer = info.offer ? `<button class="offercard slimoffer" data-act="starter"><i class="ribbon">${t('bestValue')}</i><span class="oc-t"><b>${t('starterBundle')}</b><small>${t('starterLine', { c: info.offer.coins.toLocaleString(lang()), s: info.offer.scoop })}</small></span><span class="oc-p">${info.offer.price}</span></button>` : '';
    const takeBack = back && !info.practice ? `<button class="btn green sm tb" data-act="takeback">${img('v2/ui_undo.webp', 'mini')}<b>${t('takeBack')}</b><small>${t('free')}</small></button>` : '';
    root.insertAdjacentHTML('beforeend', `
<div class="backdrop offerb" id="modal">${tag}<div class="card cream offer slim r7fail">
  <h2 class="title navy">${t('offerTitle')}</h2>
  <div class="why">${info.why || t('offerSub')}</div>
  ${info.lifeLost ? `<div class="lifeline">&#9829; ${t('lifeLost')}</div>` : ''}
  ${info.tip ? `<div class="tip">${info.tip}</div>` : ''}
  <div class="row frow">${takeBack}<button class="btn ${takeBack ? 'teal' : ''} sm" data-act="retry">${t('retry')}</button><button class="round" data-act="home" aria-label="${t('home')}"><svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg></button></div>
  ${more.length ? `<button class="morechip" data-act="morehelp"><b>${t('moreHelp')}</b><i>&#9662;</i></button><div class="opts morebox n${more.length}">${more.join('')}</div>` : ''}
  ${info.practice ? '' : short}
  ${offer}
</div></div>`);
  },

  // combo pill in the gap between the bench and the rug (--combo-y, set from the board layout): never over a cat,
  // the LEVEL pill, the belt, the boosters or the hint card; it takes no taps
  combo(text) {
    const hud = document.getElementById('hud');
    if (!hud) return;
    hud.querySelectorAll('.combo').forEach((x) => x.remove());
    const el = document.createElement('div');
    el.className = 'combo';
    el.textContent = text;
    hud.appendChild(el);
    setTimeout(() => el.remove(), 850);
  },

  settings(info) {
    cur = { screen: 'settings', info, prev: cur.screen === 'settings' ? cur.prev : cur }; // closing it gives the screen under it back
    const s = info.settings;
    const tog = (k, label) => `<div class="setrow"><span>${label}</span><button class="toggle ${s[k] ? 'on' : ''}" data-act="toggle" data-k="${k}"><i></i><b>${s[k] ? t('on') : t('off')}</b></button></div>`;
    const langs = LANGS.map((l) => `<button class="seg ${lang() === l ? 'on' : ''}" data-act="lang" data-l="${l}">${l.toUpperCase()}</button>`).join('');
    const m = document.getElementById('modal');
    if (m) m.remove();
    root.insertAdjacentHTML('beforeend', `
<div class="backdrop" id="modal"><div class="card cream settings">
  <h2 class="title navy">${t('settings')}</h2>
  <div class="setgrid">${tog('sound', t('sound'))}${tog('music', t('music'))}${tog('haptics', t('haptics'))}${info.notifyOk ? tog('notify', t('notifications')) : ''}</div>
  <div class="setrow"><span>${t('language')}</span><div class="segs">${langs}</div></div>
  ${info.canInstall ? `<div class="setrow"><span>${t('installApp')}</span><button class="seg wide" data-act="install">${t('install')}</button></div>` : ''}
  <div class="setrow"><span>${t('removeAds')}</span>${info.removeAds ? `<b class="owned">${t('owned')}</b>` : `<button class="seg wide" data-act="shop">${t('shop')}</button>`}</div>
  <div class="setrow"><button class="link" data-act="restore">${t('restore')}</button></div>
  <p class="credits" style="margin:6px 0 10px;font-size:12px;line-height:1.35;opacity:.7;text-align:center">${t('credits')}: IgnasD, Kerzoven, AntumDeluge, Traceletz, EZduzziteh, rubberduck, PWL, Spring Spring, Fupi, MintoDog (CC0, OpenGameArt.org)</p>
  <button class="btn teal" data-act="close">${t('close')}</button>
</div></div>`);
  },

  // ---- Cat Café hub: the growing house (r7 mock-hub-room / mock-hub-building) ----
  // info: { stars, level, area (index; AREAS.length = teaser), justBuilt }
  cafe(info) {
    cur = { screen: 'cafe', info };
    const ai = Math.max(0, Math.min(AREAS.length, info.area));
    const area = AREAS[ai];
    const tasks = area ? area.tasks : [];
    const builtN = tasks.filter((x) => isBuilt(x.id)).length;
    const done = (i) => AREAS[i].tasks.every((x) => isBuilt(x.id));
    const curFloor = AREAS.findIndex((_, i) => !done(i)); // -1: the whole house is built
    const open = (i) => i < AREAS.length && (done(i) || i === curFloor);
    const house = cafeView === 'house' || !area;
    const left = pending(ai);
    const justTask = tasks.find((x) => x.id === info.justBuilt);
    // a floor's last piece just went in: the "new floor" ceremony plays once the room settles
    if (justTask && !left.length && ai + 1 <= AREAS.length) floorQ = { from: ai, to: ai + 1 };

    // ---- room view ----
    const L = info.live; // retention: outfits, pets due, visitor, rail badges, goals (main.js liveHub)
    let scene = '';
    if (!house) {
      const pos = D7[area.id] || {};
      const nextId = left[0] && left[0].id;
      const decor = tasks.map((x) => {
        const p = pos[x.id] || [x.x, x.y + x.w * 0.5, x.w];
        const st = `left:${p[0] * 100}%;top:${p[1] * 100}%;width:${p[2] * 100}%;z-index:${FLAT.test(x.id) ? 1 : Math.round(p[1] * 100)}`;
        if (!isBuilt(x.id)) {
          if (x.id !== nextId) return '';
          // the next build: a glowing ghost of the piece on its real spot, with its star cost
          return `<button class="d7 tbd ${canAfford(x) ? 'ok' : ''}" data-act="build" data-id="${x.id}" style="${st};z-index:60" aria-label="${loc(x.name)}">${r7c('decor_' + x.id)}<i class="tbd-tag">${r7('hud_star')}<b>${x.cost || 1}</b></i></button>`;
        }
        const fresh = info.justBuilt === x.id;
        return `<div class="d7 ${fresh ? 'fresh' : ''}" style="${st}">${r7c('decor_' + x.id)}${fresh ? '<i class="puff p1"></i><i class="puff p2"></i><i class="puff p3"></i><i class="spk s1"></i><i class="spk s2"></i><i class="spk s3"></i>' : ''}</div>`;
      }).join('');
      const freshRes = tasks.find((x) => x.id === info.justBuilt && x.resident);
      const spots = RS7[area.id] || [];
      const guests = guestsFor(ai, info.day || 0).map((g, i) => {
        const lines = g.idle && g.idle.length ? g.idle : [g.line];
        const line = lines[((info.day || 0) + ai * 2 + i) % lines.length];
        const k = Math.max(0, (area.spots || []).indexOf(g.spot));
        const s = spots[k] || [g.spot.x, g.spot.y + g.spot.w * 0.5, g.spot.w];
        const fresh = freshRes && freshRes.resident.id === g.id;
        return `<button class="guest g7 ${fresh ? 'fresh' : ''}" data-act="pet" data-id="${g.id}" aria-label="${g.name}" style="left:${s[0] * 100}%;top:${s[1] * 100}%;width:${s[2] * 100}%;z-index:${Math.round(s[1] * 100) + 1};--d:${(-i * 3.7).toFixed(1)}s">${L && L.wear[g.id] ? r7c(`res7_${g.id}_${L.wear[g.id]}`, 'gimg') : `${r7c(`res7_${g.id}_idle`, 'gimg')}${r7c(`res7_${g.id}_job`, 'gimg job')}`}${L && L.pet[g.id] ? '<i class="pheart">&#9829;</i>' : ''}<i class="gbub ${s[0] > 0.62 ? 'l' : s[0] < 0.3 ? 'r' : ''}">${loc(line)}</i></button>`;
      }).join('');
      const ros = (info.rosettes || []).length ? `<div class="rosettes">${info.rosettes.map((r) => ribbonSvg.replace('class="rib"', `class="rib" style="--rc:${r.color}" aria-label="${r.name}"`)).join('')}</div>` : '';
      // today's visiting cat (seasons) sits by the door; one tap a day gives its gift
      const v = L && L.visitor;
      const vis = v ? `<button class="guest g7 visitor" data-act="visitor" data-id="${v.id}" aria-label="${v.name}" style="left:28%;top:99%;width:17%;z-index:99">${r7c('vis7_' + v.id, 'gimg')}${v.gift ? '<i class="pheart gift">+</i>' : ''}<i class="gbub r">${loc(v.line)}</i></button>` : '';
      scene = `<div class="stage">${r7c(`room_${area.id}_bare`, 'rbg')}${decor}${guests}${vis}${ros}${L && L.cups ? L.cups : ''}</div>`;
    } else {
      scene = houseHtml(curFloor, ai);
    }

    // floor rail (left): the house view toggle on top, then the floors from the roof down
    const rail = AREAS.map((a, i) => {
      const st = done(i) ? 'done' : i === curFloor ? 'cur' : 'locked';
      const on = !house && i === ai ? 'on' : '';
      return `<button class="fl ${st} ${on}" data-act="cafearea" data-d="${i - ai}" data-view="room" ${open(i) ? '' : 'disabled'} aria-label="${loc(a.name)}">${st === 'locked' ? r7('icon_lock') : `<b>${i === 0 ? 'G' : i}</b>`}${st === 'done' ? `<i class="ck">${checkSvg0}</i>` : ''}</button>`;
    }).reverse().join('');
    const railHtml = `<div class="frail"><button class="fl hs ${house ? 'on' : ''}" data-act="cafeview" data-view="${house ? 'room' : 'house'}" aria-label="${t(house ? 'roomView' : 'houseView')}">${r7('icon_home')}</button>${rail}</div>`;
    const rrail = `<div class="rrail"><button class="rr" data-act="quests" aria-label="${t('tasks')}">${r7('icon_calendar')}${dot(info.dots && info.dots.quests)}<span>${t('tasks')}</span></button>${L ? liveRail(L) : `<button class="rr" data-act="daily" aria-label="${t('daily')}">${r7('hud_medal')}<span>${t('daily')}</span></button>`}</div>`;

    // one next-build card: the piece, the floor's progress in segments, the star cost
    const segs = area ? `<i class="segs">${tasks.map((x) => `<i class="${isBuilt(x.id) ? 'on' : ''}"></i>`).join('')}</i>` : '';
    const pt = info.party;
    let card;
    if (pt && !left.length) {
      card = `<button class="trow ${pt.ok ? 'ok' : 'dim'}" data-act="party">
  <span class="ticon">${r7c('decor_roof_grill')}</span>
  <span class="tname"><b>${t('partyTask', { n: pt.n + 1 })}</b><small>${img('ui_coin.webp', 'mini-res')}${t('partySub', { c: pt.coins })}</small></span>
  <span class="cost">${r7('hud_star')}<b>${pt.cost}</b></span>
</button>`;
    } else if (area && left.length) {
      const x = left[0];
      const sub = x.resident ? `<small>${r7c('res7_' + x.resident.id + '_idle', 'mini-res')}${t('movesIn', { name: x.resident.name })}</small>` : `<small>${floorName(ai)} · ${loc(area.name)}</small>`;
      card = `<button class="trow ${canAfford(x) ? 'ok' : 'dim'}" data-act="build" data-id="${x.id}">
  <span class="ticon">${r7c('decor_' + x.id)}</span>
  <span class="tname"><b>${loc(x.name)}</b>${sub}${segs}</span>
  <span class="cost">${r7('hud_star')}<b>${x.cost || 1}</b></span>
</button>`;
    } else {
      card = `<div class="trow empty"><span class="tname"><b>${area ? t('floorDone') : t('comingSoon')}</b>${area ? segs : `<small>${t('teaserSub')}</small>`}</span></div>`;
    }
    const tab = (act, icon, label, extra = '', on = false, view = '') => `<button class="tab ${on ? 'on' : ''}" data-act="${act}" ${view ? `data-view="${view}"` : ''} aria-label="${label}">${r7(icon)}<span>${label}</span>${extra}</button>`;
    mount(`
<div id="cafe" class="screen on r7hub ${house ? 'vhouse' : 'vroom'}">
  <div class="room ${house ? 'house' : ''} ${L && L.goals.length ? 'goaled' : ''}" style="--fh:${area && area.hue ? area.hue : 0}deg">${scene}
    <div class="cafe-top">
      <button class="round" data-act="settings" aria-label="${t('settings')}">${gearSvg}</button>
      <div class="tr">${livesPill(info.lives)}<button class="pill sm" data-act="shop">${r7('hud_coin')}<b id="coins">${info.coins}</b></button><div class="pill sm cstar">${r7('hud_star')}<b id="cstars">${info.stars}</b></div></div>
    </div>
    ${railHtml}${rrail}
    <div class="fname ${L && L.goals.length ? 'up' : ''}">${house ? t('houseTitle') : `${floorName(ai)} · ${loc(area.name)}`}</div>
    ${L ? goalsHtml(L.goals) : ''}
  </div>
  <div class="nbcard">${card}</div>
  <button class="btn play cafe-play" data-act="play"><b>${t('play')}</b><small>${t('level', { n: info.level })}</small></button>
  <nav class="tabbar">${tab('cafeview', 'icon_home', t('home'), '', true, 'room')}${tab('residents', 'icon_paw', t('residents'))}${tab('shop', 'icon_shop', t('shop'), info.offer ? `<i class="otag">${t('offerBadge')}</i>` : '')}${tab('show', 'icon_trophy', t('events'), dot(info.dots && info.dots.show))}</nav>
</div>`);
    if (floorQ) waitFloor();
  },

  // a petted resident hops, shows a heart and says its line
  pet(id) {
    const g = document.querySelector(`.guest[data-id="${id}"]`);
    if (!g) return false;
    document.querySelectorAll('.guest.petted').forEach((x) => x !== g && x.classList.remove('petted'));
    g.classList.remove('petted');
    void g.offsetWidth; // restart the animation
    g.classList.add('petted');
    clearTimeout(g._pt);
    g._pt = setTimeout(() => g.classList.remove('petted'), 2600);
    return true;
  },

  // resident arrival card (cafe-b): sparkles, portrait + "{name} moved in!", perk
  arrive(info) {
    const r = info.resident;
    cur = { screen: 'arrive', info };
    root.insertAdjacentHTML('beforeend', `
<div class="backdrop arrive" id="modal">
  <div class="arrive-wrap">
    <div class="glow">${info.sprite ? cimg(info.sprite, 'gd') : ''}<i class="spk s1"></i><i class="spk s2"></i><i class="spk s3"></i><i class="spk s4"></i></div>
    <div class="rescard">
      <div class="port">${cimg('res_' + r.id + '.webp')}</div>
      <div class="rtxt"><h2>${t('movedIn', { name: r.name })}</h2><p>${loc(r.line)}</p></div>
    </div>
    <div class="perk"><em>${t('perkLabel')}</em><b>${perkText(r)}</b></div>
    <button class="btn" data-act="arriveplay"><b>${t('play')}</b><small>${t('level', { n: info.level })}</small></button>
    <button class="link" data-act="arriveclose">${t('toCafe')}</button>
  </div>
</div>`);
  },

  // resident collection: unlocked portrait + perk, locked silhouette + lock + how to unlock
  residents() {
    cur = { screen: 'residents', info: null };
    const loveRow = (r) => {
      const lv = loveOf(r.id);
      const hearts = LOVE_COSTS.map((_, i) => `<i class="hrt ${i < lv ? 'on' : ''}">&#9829;</i>`).join('');
      const btn = lv >= LOVE_COSTS.length ? `<small class="maxlove">${t('loveMax')}</small>` : `<button class="treat" data-act="treat" data-id="${r.id}" ${save.data.coins >= treatCost(r.id) ? '' : 'data-low="1"'}>${t('treat')} ${treatCost(r.id)}<img src="${assetUrl('ui_coin.webp')}" alt="" style="width:18px;height:18px;vertical-align:-3px;margin-left:4px"></button>`;
      // wardrobe: outfits unlock with affection hearts (pets, requests, treats; live.js)
      const hv = save.data.cafe.hearts[r.id] || 0;
      const worn = save.data.cafe.wear[r.id] || '';
      const ward = OUTFITS.map((o) => (hv >= o.need
        ? `<button class="wo ${worn === o.id ? 'on' : ''}" data-act="wear" data-id="${r.id}" data-o="${worn === o.id ? '' : o.id}" aria-label="${loc(o.name)}">${r7c(`res7_${r.id}_${o.id}`)}</button>`
        : `<span class="wo wlk" title="${loc(o.name)}">${r7('icon_lock')}<b>${hv}/${o.need}</b></span>`)).join('');
      return `<div class="love">${hearts}<span class="ward">${ward}</span></div>${btn}`;
    };
    const owned = RESIDENTS.filter((r) => isBuilt(r.task.id)).length;
    const card = (r) => {
      const has = isBuilt(r.task.id);
      const area = AREAS[r.task.area];
      const wr = has && save.data.cafe.wear[r.id];
      return `<div class="rcard ${has ? '' : 'locked'}">
  <div class="rp">${r7c('res7_' + r.id + '_' + (wr || 'idle'))}${has ? '' : lockSvg}</div>
  <b class="rn">${has ? r.name : '???'}</b>
  <span class="rperk">${has ? perkText(r) : t('resUnlock', { task: loc(r.task.name) })}</span>
  ${has ? loveRow(r) : ''}
  ${!has && area ? `<small>${floorName(r.task.area)} · ${loc(area.name)}</small>` : ''}
</div>`;
    };
    const pages = Math.max(1, Math.ceil(RESIDENTS.length / 4));
    resPage = Math.max(0, Math.min(pages - 1, resPage));
    const arrow = (d) => `<button class="arr ${resPage + d < 0 || resPage + d >= pages ? 'dis' : ''}" data-act="rpage" data-p="${resPage + d}" aria-label="${d < 0 ? t('back') : t('next')}"><svg viewBox="0 0 24 24"><path d="${d < 0 ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
    const pdots = Array.from({ length: pages }, (_, i) => `<i class="${i === resPage ? 'on' : ''}"></i>`).join('');
    mount(`
<div id="resi" class="screen on">
  <div class="cafe-bg"></div>
  <div class="hud-top"><button class="round" data-act="cafeback" aria-label="${t('back')}"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><h2 class="title yellow sm">${t('residents')}</h2></div>
  <div class="resi-sub">${t('resSub', { a: owned, b: RESIDENTS.length })}</div>
  <div class="rgrid">${RESIDENTS.slice(resPage * 4, resPage * 4 + 4).map(card).join('')}</div>
  <div class="rpager">${arrow(-1)}<span class="pdots">${pdots}</span>${arrow(1)}</div>
</div>`);
  },

  // ---- shop (shop-a layout in the teal palette) ----
  shop(info) {
    if (info.store === false) { sheet('shop', 'shop', t('shop'), `<div class="storeoff">${img('v2/ui_coin.webp')}<b>${t('storeOff')}</b></div>`); return; }
    const P = PRODUCTS;
    const own = info.owned;
    const buy = (id, cls = '') => `<button class="btn green price ${cls}" data-act="buy" data-id="${id}">${P[id].price}</button>`;
    const pile = (n) => `<div class="pile">${Array.from({ length: n }, () => img('v2/ui_coin.webp')).join('')}</div>`;
    const coinPack = (id, n, k) => `<div class="pack">${pile(k)}<b>${n.toLocaleString(lang())}</b>${buy(id)}</div>`;
    const scoopPack = (id, n) => `<div class="pack wide">${img('v2/ui_scoop.webp', 'sp')}<b>${t('nScoops', { n })}</b>${buy(id)}</div>`;
    const hero = own.starter || own.noads ? '' : ui.heroHtml(true);
    const noadsCard = `<div class="pack">${noAdSvg}<b class="na">${t('noAds')}</b>${info.noAds ? `<span class="own">${checkSvg}${t('owned')}</span>` : buy('noads')}</div>`;
    const tab = (k, label) => `<button class="stab ${shopTab === k ? 'on' : ''}" data-act="shoptab" data-tab="${k}">${label}</button>`;
    sheet('shop', 'shop', t('shop'), `<div class="stabs">${tab('coins', t('tabCoins'))}${tab('boosters', t('tabBoosters'))}</div>
<div class="spage sp-coins">${hero}<div class="packs g2">${coinPack('coins500', 500, 2)}${coinPack('coins1500', 1500, 3)}${coinPack('coins4000', 4000, 4)}${noadsCard}</div></div>
<div class="spage sp-boosters"><div class="packs g2">${scoopPack('scoop3', 3)}${scoopPack('scoop10', 10)}</div></div>
<button class="link" data-act="restore">${t('restore')}</button>`);
    const sh = document.querySelector('#sheet .shop');
    if (sh) sh.dataset.tab = shopTab;
  },

  heroHtml(title) {
    const P = PRODUCTS.starter;
    return `
<div class="hero">
  <i class="ribbon">${t('bestValue')}</i>
  <div class="hcat">${colorHead('orange')}</div>
  <div class="hbody">
    ${title ? `<h3>${t('starterBundle')}</h3>` : ''}
    <div class="hrow">${img('v2/ui_coin.webp')}<b>${t('nCoins', { n: P.coins.toLocaleString(lang()) })}</b></div>
    <div class="hrow">${img('v2/ui_scoop.webp')}<b>${t('nScoopBoosters', { n: P.scoop })}</b></div>
    <div class="hrow">${noAdSvg}<b>${t('noAds')}</b></div>
  </div>
  <button class="btn green price big" data-act="buy" data-id="starter">${P.price}</button>
</div>`;
  },

  // starter bundle offer, shown once after level 10
  starter() {
    sheet('starter', 'shop starter', t('starterBundle'), `${ui.heroHtml(false)}<button class="link" data-act="closesheet">${t('later')}</button>`);
  },

  // daily tasks + chest + 7-day login calendar
  quests(info) {
    const L = info.login;
    const days = info.rewards.map((r, i) => {
      const done = i < L.idx;
      const today = L.avail && i === L.idx;
      return `<div class="day ${done ? 'done' : ''} ${today ? 'today' : ''} ${i === 6 ? 'last' : ''}"><small>${i + 1}</small>${done ? `<span class="tick">${checkSvg}</span>` : chips(r, 'col')}</div>`;
    }).join('');
    const tasks = info.tasks.map((x) => {
      const pct = Math.min(100, Math.round((x.p / x.need) * 100));
      const act = x.c ? `<span class="own">${checkSvg}</span>` : x.done ? `<button class="btn green xs" data-act="qclaim" data-id="${x.id}">${t('claim')} +${x.coins}</button>` : `<span class="rwd">${img('v2/ui_coin.webp')}<b>${x.coins}</b></span>`;
      return `<div class="qrow ${x.c ? 'done' : ''}"><div class="qt"><b>${t('task_' + x.id, { n: x.need })}</b><div class="bar"><i style="width:${pct}%"></i><em>${x.p}/${x.need}</em></div></div>${act}</div>`;
    }).join('');
    const chest = info.chest;
    sheet('quests', 'quests', t('tasksTitle'), `
<div class="qsec">${t('loginTitle')}</div>
<div class="days">${days}</div>
${L.avail ? `<button class="btn green sm" data-act="loginclaim">${t('claim')}</button>` : ''}
<div class="qsec">${t('tasksTitle')}</div>
${tasks}
<div class="qrow chest ${chest.opened ? 'done' : ''}">${img('v2/ui_chest.webp', 'cimg')}<div class="qt"><b>${t('chest')}</b><span>${t('chestSub')}</span>${chips(info.chestReward)}</div>${chest.opened ? `<span class="own">${checkSvg}</span>` : `<button class="btn ${chest.ready ? 'green' : 'teal dim'} xs" data-act="chest">${t('openChest')}</button>`}</div>`);
  },

  // no lives left: wait, watch an ad, or refill with coins
  noLives(info) {
    sheet('nolives', 'nolives', t('noLivesTitle'), `
<div class="bigheart">${img('v2/ui_heart.webp', 'off')}</div>
<div class="lt">${t('nextLife', { t: `<b id="life-t">${fmtMs(info.ms)}</b>` })}</div>
${info.ad === false ? '' : `<button class="btn green sm" data-act="adlife">${adSvg}<b>${t('adLife')}</b></button>`}
<button class="btn gold sm ${info.coins >= info.cost ? '' : 'dim'}" data-act="liferefill">${img('ui_coin.webp', 'mini')}<b>${t('refillLives', { n: info.cost })}</b></button>
<button class="link" data-act="closesheet">${t('close')}</button>`);
  },

  // live timers: lives pill and the out-of-lives countdown
  setLives(l) {
    const n = document.getElementById('lives-n');
    if (n) n.textContent = l.n;
    const tm = document.getElementById('lives-t');
    if (tm) tm.textContent = l.n >= 5 ? '' : fmtMs(l.ms);
    const lt = document.getElementById('life-t');
    if (lt && sheetName === 'nolives') lt.textContent = fmtMs(l.ms);
  },

  setDots(d) {
    const q = document.querySelector('[data-act=quests] .dot');
    if (q) q.hidden = !d.quests;
    const w = document.querySelector('[data-act=show] .dot');
    if (w) w.hidden = !d.show;
    for (const [k, sel] of [['jar', '[data-act=cafesheet] .dot'], ['season', '[data-act=events][data-tab=season] .dot'], ['daily', '[data-act=dailysheet] .dot']]) {
      const el = document.querySelector(sel);
      if (el && k in d) el.hidden = !d[k];
    }
  },

  hideSheet() {
    const m = document.getElementById('sheet');
    if (m) m.remove();
    sheetName = '';
  },

  get sheet() {
    return sheetName;
  },

  hideModal() {
    const m = document.getElementById('modal');
    if (m) m.remove();
    if (cur.screen === 'settings') cur = cur.prev || { screen: 'none', info: null }; // a closed Settings card is not the screen any more
  },

  toast(text) {
    const el = document.createElement('div');
    el.className = cur.screen === 'play' ? 'toast inplay' : 'toast';
    el.textContent = text;
    // one lane for the hint card and status lines: the hint card steps aside while a toast speaks
    const tut = cur.screen === 'play' ? document.getElementById('tut') : null;
    if (tut && !tut.hidden) tut.style.visibility = 'hidden';
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); if (tut && !document.querySelector('.toast.inplay')) tut.style.visibility = ''; }, 1400);
  },

  setTut(text) {
    const el = document.getElementById('tut');
    if (el) {
      el.textContent = text || '';
      el.hidden = !text;
    }
  },

  get screen() {
    return cur.screen;
  },
};
