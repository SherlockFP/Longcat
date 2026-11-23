// DOM overlay screens. Pure view: main.js owns the state and passes info in.
import { t, LANGS, lang } from '../i18n.js';
import { assetUrl } from '../game/breeds.js';
import { save } from '../kit/save.js';
import { PRODUCTS } from '../kit/iap.js';
import { AREAS, TEASER, RESIDENTS, loc, isBuilt, pending, canAfford, nextResident, perkKind, perkValue, loveOf, treatCost, LOVE_COSTS, guestsFor, clutterLevel } from '../game/cafe.js';
import './r7.css';
import './dare.css';
import { railHtml as liveRail, featGoalHtml, threadLine } from './live.js';
import { OUTFITS } from '../game/live.js';
import { drecHas, cardsOwned, WEEKS } from '../game/r10.js';
import { house as streetHouse, SHOPS } from '../game/street.js';
import { gpuRow } from './perf.js';
import { hubAfter } from './hub.js'; // hub lane: level map, resident layout, wide-screen panels, keys

const root = document.getElementById('ui');
let actions = {};
let cur = { screen: 'none', info: null };

const img = (name, cls = '') => `<img class="${cls}" src="${assetUrl(name)}" alt="" draggable="false">`;

const colorHead = (color, cls = '') => img(`v2/head_${color}.webp`, cls);
// round 7 art (public/assets/r7, see art-src/r7/assets.md)
const r7 = (name, cls = '') => img(`r7/${name}.webp`, cls);
const SHARE_SVG = '<svg class="shi" viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke-width="3" stroke-linecap="round"/></svg>';
// Share clip: sits on the clip preview (main.js reveals it with the peak still); the first tap records the clip, the
// next one sends it (R11: nothing records until the player asks)
// R11 fix 2: the clip button names what the first tap does (makes the video, a few seconds), not "Share"; Dare a friend
// stays the one-tap link
const CLIP_BTN = (rec) => `<button class="clipshare" data-act="shareclip" hidden aria-label="${t(rec ? 'clipMake' : 'shareClipBtn')}">${SHARE_SVG}<span>${t(rec ? 'clipMake' : 'shareClipBtn')}</span></button>`;
const SHARE_ROUND = () => `<button class="round share" data-act="share" aria-label="${t('share')}">${SHARE_SVG.replace(' class="shi"', '')}</button>`;
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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
// R10: where a framed album print hangs in each room: [x centre, y centre, width] as fractions of the stage
const WALL7 = { counter: [0.36, 0.3, 0.15], window: [0.42, 0.3, 0.12], cushion: [0.26, 0.5, 0.13], patio: [0.84, 0.3, 0.14], rooftop: [0.46, 0.37, 0.12] };
const FLAT = /_rug$/; // rugs lie on the floor under everything
// resident floor spots per room (same order as the area's data spots)
const RS7 = { counter: [[0.47, 0.99, 0.25], [0.84, 0.8, 0.18]], window: [[0.42, 0.82, 0.21], [0.74, 0.99, 0.2]], cushion: [[0.52, 0.8, 0.2], [0.5, 0.99, 0.21]], patio: [[0.36, 0.76, 0.19], [0.62, 0.99, 0.21]], rooftop: [[0.56, 0.74, 0.19], [0.66, 0.99, 0.21]] };
const NOOK7 = { counter: [[0.29, 0.995, 0.19], [0.7, 0.84, 0.16]], window: [[0.3, 0.995, 0.19], [0.7, 0.8, 0.16]], cushion: [[0.3, 0.995, 0.19], [0.72, 0.84, 0.16]], patio: [[0.28, 0.995, 0.19], [0.75, 0.84, 0.16]], rooftop: [[0.3, 0.995, 0.19], [0.74, 0.8, 0.16]] };
const fmtShort = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}${t('hShort')}` : `${m}${t('mShort')}`; };
const floorName = (i) => (i === 0 ? t('groundFloor') : t('floorN', { n: i }));
const paw = () => '<svg class="pawi" viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="5.5" ry="4.5"/><ellipse cx="5" cy="11" rx="2.2" ry="2.8"/><ellipse cx="9.5" cy="6.5" rx="2.2" ry="2.8"/><ellipse cx="14.5" cy="6.5" rx="2.2" ry="2.8"/><ellipse cx="19" cy="11" rx="2.2" ry="2.8"/></svg>';
const boost = (k, icon, tone) => `<button class="bst ${tone}" id="b-${k}" data-act="${k}"><img class="bi" src="${assetUrl('v2/' + icon)}" alt="" draggable="false"><b>${t(k)}</b><i class="badge"></i></button>`;

// the Daily record row on a Daily win: the total against the next milestone (its art as a silhouette), or what it unlocked
const drecRow = (r) => (!r ? '' : r.got
  ? `<div class="drecrow got">${r7c(r.got.art, 'drart')}<span><b>${t('drecGot', { name: r.got.name })}</b><small>${t('drecTotal', { n: r.n })}</small></span></div>`
  : r.next ? `<div class="drecrow">${r7c(r.next.art, 'drart sil')}<span><b>${t('drecProg', { n: r.n, at: r.next.at })}</b><small>${t('drecNext', { name: r.next.name })}</small></span></div>` : `<div class="drecrow"><span><b>${t('drecTotal', { n: r.n })}</b></span></div>`);

// the goals strip: a resident request that already shows as a bubble over its cat in this room is not repeated
const roomGoals = (L, here) => L.goals.filter((g) => !(g.k === 'req' && here.includes(g.who) && (L.bubbleWho || []).includes(g.who))); // R11: the hub features one of these (live.js featGoal)
// today's resident jobs in the Tasks sheet: two tiles (a named cat, one goal, the reward); the first one done pays, then
// the claimed slot shows tomorrow's cat and the reset time
function jobsHtml(J) {
  if (!J) return '';
  const tile = (j) => {
    if (J.paid) {
      if (J.paid - 1 !== j.s) return '';
      return `<div class="jobt next">${r7c('res7_' + J.tomorrow.who + '_idle', 'jp')}<span><b>${t('jobTomorrow', { name: J.tomorrow.name })}</b><small>${t('jobReset', { t: fmtShort(J.ms) })}</small></span></div>`;
    }
    const act = j.done ? `<button class="btn green xs" data-act="jobclaim" data-s="${j.s}">${t('claim')}</button>` : `<i class="jrw">${r7('hud_coin')}${J.reward.coins} ${r7('hud_heart')}+${J.reward.hearts}</i>`;
    return `<div class="jobt ${j.done ? 'ready' : ''}">${r7c('res7_' + j.who + '_job', 'jp')}<span><b>${t('jobFor', { name: j.name })}</b><small>${t('jk_' + j.k, { n: j.need })}</small><i class="jbar"><i style="width:${Math.round((j.p / j.need) * 100)}%"></i><em>${j.p}/${j.need}</em></i></span>${act}</div>`;
  };
  return `<div class="qsec">${t('jobsTitle')}<small>${J.paid ? '' : t('jobsRule')}</small></div><div class="jobs">${J.list.map(tile).join('')}</div>`;
}
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
  const have = cn.thread ? cn.thread.have : cn.stars, need = Math.max(1, cn.thread ? cn.thread.need : cn.cost); // R11: the thread's bar
  const to = Math.min(100, Math.round((have / need) * 100));
  const from = Math.min(100, Math.round((Math.max(0, have - n) / need) * 100));
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
function houseHtml(curFloor, ai, St = {}) {
  const n = AREAS.length;
  const roofI = n - 1; // the last area is the rooftop terrace
  const done = (i) => AREAS[i].tasks.every((x) => isBuilt(x.id));
  const starsLeft = (i) => pending(i).reduce((a, x) => a + (x.cost || 1), 0);
  const fl = [];
  for (let i = 0; i < roofI; i++) {
    const st = done(i) ? 'done' : i === curFloor ? 'cur' : curFloor >= 0 && i === curFloor + 1 ? 'ghost' : '';
    if (!st) break;
    const art = st === 'done' ? (i === 0 ? 'floor_ground' : 'floor_lit') : st === 'cur' ? (i === 0 && AREAS[0].tasks.some((x) => isBuilt(x.id)) ? 'floor_ground' : 'floor_scaffold') : 'floor_ghost';
    const tag = st === 'cur' ? `<i class="hcost">${r7('hud_star')}<b>${starsLeft(i)}</b></i>${r7('crane', 'crane')}` : st === 'ghost' ? nextTag(i) : '';
    fl.push(`<button class="hf ${st} ${i === ai ? 'sel' : ''}" data-act="cafearea" data-d="${i - ai}" data-view="room" ${st === 'ghost' ? 'disabled' : ''} aria-label="${loc(AREAS[i].name)}">${r7(art)}${tag}<span>${floorName(i)}</span></button>`);
  }
  // the top: the rooftop terrace once it is reached, else the gable roof over the highest floor
  const rs = done(roofI) ? 'done' : roofI === curFloor ? 'cur' : '';
  const roof = rs
    ? `<button class="hf roof ${rs} ${roofI === ai ? 'sel' : ''}" data-act="cafearea" data-d="${roofI - ai}" data-view="room" aria-label="${loc(AREAS[roofI].name)}">${r7('roof_terrace')}${rs === 'cur' ? `<i class="hcost">${r7('hud_star')}<b>${starsLeft(roofI)}</b></i>${r7('crane', 'crane')}` : ''}</button>`
    : `<div class="hf roof gable">${r7('roof_gable')}${curFloor === roofI - 1 ? nextTag(roofI) : ''}</div>`;
  const units = fl.length * 0.5 + (rs ? 0.52 : 0.56) + (curFloor >= 0 && curFloor < roofI ? 0.25 : 0); // room for the next-floor tag
  const sign = `<button class="streetbtn ${St.open ? 'open' : ''}" data-act="cafeview" data-view="street">${r7('street_bakery', 'sbimg')}<b>${t('streetTitle')}</b><small>${St.open ? t('streetShops', { n: St.shops ?? St.done }) : t('streetLocked')}</small></button>`;
  return `${r7('building_base', 'hbg')}<div class="tower" style="--u:${units.toFixed(2)}">${roof}${fl.reverse().join('')}</div>${sign}`;
}
// the next floor's preview tag: its name and the resident who moves in there
function nextTag(i) {
  const a = AREAS[i];
  const r = a && a.tasks.find((x) => x.resident);
  return `<i class="hnext">${r ? r7c('res7_' + r.resident.id + '_idle', 'hnres') : ''}<span><b>${t('nextUp', { room: loc(a.name) })}</b>${r ? `<small>${t('unlocksX', { name: r.resident.name })}</small>` : ''}</span></i>`;
}

// Cat Street: the shop houses past the rooftop. The finished unit before (or the cat house) on the left with its
// shopkeeper, the unit under construction in the middle, the next one as a silhouette on the right. A new house is
// built from the ground up as pieces go in (crane, stars left on it); an upgrade unit (lap 3) shows the shop with its
// upgrades so far and the next one as a glowing ghost; a remix unit (later laps) repaints the shop, dresses it for a
// festival and brings a guest, piece by piece. Every shop shows its current look (street.shopLook) wherever it stands.
const UPDECO = { bunting: 'up_bunting', planter: 'up_planter', lights: 'up_lights' };
function facade(id, look, o = {}) {
  const th = look && look.theme;
  const f = th && o.paint !== false ? `style="filter:hue-rotate(${th.hue}deg) saturate(${th.sat}) drop-shadow(-4px 5px 4px rgba(40,20,5,.35))"` : '';
  const ov = [];
  const ups = (look && look.ups) || [];
  const ghost = o.ghost || '';
  for (const u of ['bunting', 'planter']) if (ups.includes(u) || ghost === u) ov.push(r7c(UPDECO[u], `ovl ov-${u} ${ghost === u ? 'gh' : ''}`));
  if (ups.includes('sign') || ghost === 'sign') ov.push(r7c('up_' + id, `ovl ov-sign ${ghost === 'sign' ? 'gh' : ''}`));
  const deco = th && o.deco !== false ? th.deco : '';
  if (deco) ov.push(r7c(UPDECO[deco] || deco, `ovl ov-deco ov-${UPDECO[deco] ? deco : 'garland'} ${o.ghostDeco ? 'gh' : ''}`));
  const guest = look && look.guest && o.guest !== false ? r7c(look.guest.art, `sguest ${o.ghostGuest ? 'sil' : ''}`) : '';
  return `<div class="fac"><img class="shimg ${o.cls || ''}" src="${assetUrl('r7/street_' + id + '.webp')}" alt="" draggable="false" ${f}>${ov.join('')}</div>${guest}`;
}
function streetHtml(St, fresh) {
  const k = St.open ? St.done : 0;
  const cur = streetHouse(k);
  const looks = St.looks || {};
  const prev = k > 0 ? streetHouse(k - 1) : null;
  const left = prev
    ? `<div class="sh sl">${facade(prev.id, looks[prev.id])}${r7c('keeper_' + prev.id, 'keeper')}${prev.apprentice ? r7c('appr_' + prev.id, 'appr') : ''}<span>${loc(prev.name)}</span></div>`
    : `<div class="sh sl home">${r7('floor_ground', 'shimg')}<span>${t('houseTitle')}</span></div>`;
  const tag = St.open ? `<i class="hcost">${r7('hud_star')}<b>${St.left}</b></i>` : `<i class="hcost lk">${r7('icon_lock')}</i>`;
  const puffs = fresh ? '<i class="puff p1"></i><i class="puff p2"></i><i class="puff p3"></i>' : '';
  let mid;
  if (cur.kind === 'up' && St.open) {
    // the shop as it is, its upgrades so far, the next one glowing where it goes
    const lk = looks[cur.id] || { ups: [] };
    const nx = cur.tasks[St.at];
    mid = `<div class="sh sc up ${fresh ? 'fresh' : ''}">${facade(cur.id, lk, { ghost: nx ? (nx.up === cur.id ? 'sign' : nx.up) : '' })}${r7c('keeper_' + cur.id, 'keeper')}${tag}<span>${t('streetUpName', { house: loc(cur.name) })}</span>${puffs}</div>`;
  } else if (cur.kind === 'mix' && St.open) {
    // a remix: paint (1), festival decoration (2), the guest (3), the street party (4)
    const lk = { ...(looks[cur.id] || { ups: [] }), theme: cur.theme, guest: cur.guest };
    mid = `<div class="sh sc mix ${fresh ? 'fresh' : ''}">${facade(cur.id, lk, { paint: St.at >= 1, ghostDeco: St.at < 2, ghostGuest: St.at < 3 })}${r7c('keeper_' + cur.id, 'keeper')}${tag}<span>${t('streetMixName', { house: loc(cur.name), theme: loc(cur.theme.name) })}</span>${puffs}</div>`;
  } else {
    const pct = St.open ? St.at / cur.tasks.length : 0;
    mid = `<div class="sh sc ${fresh ? 'fresh' : ''} ${St.open ? '' : 'locked'}" style="--p:${(1 - pct) * 100}%">${r7('street_' + cur.id, 'shimg ghost')}${r7('street_' + cur.id, 'shimg built')}${St.open ? r7('crane', 'crane') : ''}${tag}<span>${loc(cur.name)}</span>${cur.apprentice && St.open ? `<i class="apnext">${r7c('appr_' + cur.id, 'appr sil')}<b>${t('apprNext')}</b></i>` : ''}${puffs}</div>`;
  }
  const nx = streetHouse(k + 1);
  const nxName = loc(nx.name);
  const right = `<div class="sh sr">${r7('street_' + nx.id, 'shimg sil')}<span>${t('streetNext', { house: nxName })}</span></div>`;
  return `${r7c('street_bg', 'hbg')}<div class="street">${left}${mid}${right}</div>`;
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
  <div class="tower fxt"><div class="hf newf ${next ? '' : 'roof'}">${r7(next ? 'floor_scaffold' : 'roof_terrace')}<i class="dust d1"></i><i class="dust d2"></i><i class="dust d3"></i></div><div class="hf">${r7(q.from === 0 ? 'floor_ground' : 'floor_lit')}</div></div>
  ${next ? r7('crane', 'fxcrane') : ''}
  ${Array.from({ length: 14 }, (_, i) => `<i class="cf" style="--i:${i}"></i>`).join('')}
</div>
<div class="card cream nfcard">
  ${res ? `<div class="peek respeek">${r7c('res7_' + res.resident.id + '_idle')}</div>` : ''}
  <h2 class="title yellow sm">${next ? t('newFloor', { name }) : t('houseDoneTitle')}</h2>
  ${res ? `<p class="nfsub">${t('nextResidentIs', { name: res.resident.name })}</p>` : ''}
  ${next ? '' : `<p class="nfsub">${t('streetOpensSub')}</p>`}
  <button class="btn" data-act="${next ? 'cafearea' : 'floordone'}" data-d="1" data-view="${next ? 'room' : 'street'}">${next ? t('letsGo') : t('toStreet')}</button>
  <button class="btn pink sm hshare" data-act="sharehouse" data-k="floor" data-to="${q.to}">${SHARE_SVG}<span>${t('shareHouse')}</span></button>
</div>`;
  root.appendChild(el);
  const skip = (e) => { if (e.target.closest('.nfcard .btn')) return; el.classList.add('skip'); };
  el.addEventListener('click', skip);
  el.addEventListener('click', (e) => { const b = e.target.closest('.nfcard .btn:not(.hshare)'); if (b) { el.remove(); if (!next) { cafeView = 'street'; ui.cafe(cur.info); } } }); // this listener runs before root's, so set the view here
}

export const ui = {
  init(a) {
    actions = a;
    // absolute URL: a relative url() inside a custom property resolves against the built stylesheet in /assets/ (broke the Play button art)
    const setVar = (k, f) => document.documentElement.style.setProperty(k, `url("${new URL(assetUrl('r7/' + f), document.baseURI).href}")`);
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
    hubAfter('home', info);
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
  ${info.show ? (info.rush ? `<div class="rushclock" id="rushclock" aria-live="off">0.0s</div>` : `<div class="goalpill" id="goalpill" hidden>${r7('hud_medal')}<b></b></div>`) : `<div class="boosters">${bst('hint')}${bst('scoop')}${bst('undo')}</div>`}
</div>`);
    ui.setHud(info);
    hubAfter('play', info);
  },

  setHud(info) {
    if (cur.screen !== 'play') return;
    Object.assign(cur.info, info);
    const i = cur.info;
    const c = document.getElementById('coins');
    if (c) c.textContent = i.coins;
    const hl = document.getElementById('hud-lives');
    if (hl) { hl.hidden = i.lives == null; const hb = hl.querySelector('b'); if (hb) hb.textContent = i.lives; }
    const gp = document.getElementById('goalpill');
    if (gp) {
      gp.hidden = !i.goal;
      if (i.goal) { const gb = gp.querySelector('b'); if (gb.textContent !== i.goal.text) gb.textContent = i.goal.text; gp.dataset.st = i.goal.state; }
    }
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
    // Share: a round icon; at a real high (chain x3+, a clean sweep, a friend challenge) a labelled "Share clip" pill
    // (the compact card then drops its Home circle: the HUD Home stays), and on the very first chain x3 a "Show a
    // friend!" bubble on it
    const shareBtn = info.dare ? `<button class="btn pink sm sharebtn" data-act="share">${SHARE_SVG}<span>${t('shareDareBtn')}</span>${info.nudge ? `<i class="nudge">${t('shareNudge')}</i>` : ''}</button>` : SHARE_ROUND();
    // only the stars that were earned (1 normal, 2 hard, 3 super hard): a clean clear never shows grey slots
    const stars = Array.from({ length: info.stars }, (_, i) => img('ui_star.webp', 'star on').replace('<img ', `<img style="--i:${i}" `)).join('');
    // a moved-in resident peeks over the card and cheers (by how clean the clear was); before that, a cat of the level
    const peek = info.res
      ? `<div class="peek respeek">${r7c('res7_' + info.res + '_idle')}<i class="cheer">${t(info.cheer)}</i></div>`
      : r7c('cat_head_' + info.peek + '_happy', 'peek');
    const cn = info.cafeNext;
    const nr = cn && cn.res;
    const th = cn && cn.thread; // R11 fix 2: the early resident thread (main.js threadInfo)
    const cnTask = cn && AREAS.flatMap((a) => a.tasks).find((x) => x.sprite === cn.sprite);
    const resChip = nr ? `<span class="nres">${r7c('res7_' + nr.id + '_idle')}<b>${nr.left > 0 ? t('resIn', { name: nr.name, n: nr.left }) : t('resReady', { name: nr.name })}</b></span>` : '';
    // the café bar: with a thread it is that resident (portrait, the exact remaining action, the stars toward them),
    // else the next build; a build the stars already cover makes it a button (Build! on it), and Next never moves
    const cafeBar = (slim) => {
      if (!cn) return '';
      const go = !!info.canBuild;
      const tag = go ? 'button data-act="cafe"' : 'div';
      const icon = th ? r7c('res7_' + th.who + '_idle') : cnTask ? r7c('decor_' + cnTask.id) : cimg(cn.sprite);
      const have = th ? th.have : Math.min(cn.stars, cn.cost);
      const need = th ? th.need : cn.cost;
      return `<${tag} class="cafebar${slim ? ' slim' : ''}${go ? ' go' : ''}${th ? ' thr' : ''}"><span class="ticon">${icon}</span><div class="cbtxt"><small>${th ? threadLine(th) : t('cafeNext', { name: cn.name })}</small><div class="bar"><i style="width:${Math.min(100, Math.round((have / Math.max(1, need)) * 100))}%"></i><em>${img('ui_star.webp')}${have}/${need}</em></div>${!slim && !th ? resChip : ''}</div>${go ? `<i class="cbgo">${t('build')}</i>` : ''}</${go ? 'button' : 'div'}>`;
    };
    // R11 fix 2: ONE main reward row under the header: the cat adopted on this clear, else a build that is ready
    const barMain = !info.adopt && !!info.canBuild && !!cn;
    const rrow = `<div class="rrow${info.adopt || barMain ? ' mini' : ''}"${info.pay ? ` title="${escHtml(info.pay)}"` : ''}>${info.coins ? `<div class="reward cn">${img('ui_coin.webp')}<b>+${info.coins}</b></div>` : ''}${info.cafeStars ? `<div class="reward st">${img('ui_star.webp')}<b>+${info.cafeStars}</b></div>` : ''}${info.ribbons ? `<div class="reward st rb">${ribbonSvg}<b>+${info.ribbons}</b></div>` : ''}</div>`;
    const ach = (info.ach || []).map((a) => `<li class="a-${a.k}">${a.text}</li>`).join('');
    // where the coins came from (base, tidy bench, hard level, café perks): a low payout explains itself
    const pay = info.pay ? `<div class="paybd">${info.pay}</div>` : '';
    // a friend challenge: how it went, both scores side by side and the round of the back-and-forth
    const dres = info.friend ? `<div class="dres ${info.friend.res}">${info.friend.line}${info.friend.vs ? `<small class="dvs">${info.friend.round > 1 ? `<i class="drd">${t('dareRound', { n: info.friend.round })}</i>` : ''}<span class="${info.friend.res === 'miss' ? 'win' : ''}">${escHtml(info.friend.vs[0])}</span><span class="me ${info.friend.res !== 'miss' ? 'win' : ''}">${escHtml(info.friend.vs[1])}</span></small>` : ''}</div>` : '';
    // a share moment (first chain x3, a new best, a clean sweep, today's Daily, Show gold, Rush top 3): its own headline
    const moment = info.moment ? `<div class="moment">${escHtml(info.moment)}</div>` : '';
    // the replay card keeps its story ON the thumbnail (the moment's headline, else what the player pulled off) and the
    // café bar in the column beside it, so the card is header, main reward row, replay row, buttons
    const clipDet = info.moment ? `<div class="clipdet"><i class="mom">${escHtml(info.moment)}</i></div>` : ach ? `<div class="clipdet">${(info.ach || []).map((a) => `<i class="a-${a.k}">${a.text}</i>`).join('')}</div>` : '';
    const hilite = info.chain
      ? `<div class="hilite"><div class="chainclip"><canvas width="180" height="320" aria-hidden="true"></canvas>${clipDet}${CLIP_BTN(info.rec)}</div><div class="hcol">${dres}${rrow}${info.payHi ? `<div class="ordpay">${info.payHi}</div>` : ''}${barMain ? '' : cafeBar(true)}</div></div>`
      : `${pay}${ach ? `<ul class="ach inline">${ach}</ul>` : ''}`;
    const homeRound = `<button class="round" data-act="home" aria-label="${t('home')}"><svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg></button>`;
    // an ordinary clear gets a compact result low on the screen: one thumb action (Next); the big card is kept for hard
    // levels, a chain replay, a resident ready to move in, the daily and the Show / Rush boards
    const compact = !info.show && !info.again && info.stars < 2 && !(nr && nr.left <= 0); // a chain loops as a thumbnail in it
    if (compact) {
      const main = info.adopt || (barMain ? cafeBar(true) : '');
      const head = info.chain ? `<div class="chainclip mini"><canvas width="180" height="320" aria-hidden="true"></canvas>${CLIP_BTN(info.rec)}</div>` : info.res ? r7c('res7_' + info.res + '_idle', 'cpeek') : r7c('cat_head_' + info.peek + '_happy', 'cpeek');
      root.insertAdjacentHTML('beforeend', `
<div class="backdrop winb" id="modal"><div class="card teal win compact ${info.chain ? 'haschain' : ''}">
  <div class="cwtop">${head}<div class="cwt"><h2 class="title yellow">${t(info.title)}</h2>${moment}${info.pay && !main ? `<div class="paybd">${info.pay}</div>` : ''}</div><div class="stars n${info.stars}">${stars}</div></div>
  ${main ? `<div class="mainrew">${main}</div>` : ''}
  ${rrow}
  ${ach ? `<ul class="ach inline">${ach}</ul>` : ''}
  ${barMain ? '' : cafeBar(true)}
  ${drecRow(info.drec)}
  ${info.purr ? `<div class="purr">${info.purr}</div>` : ''}
  <div class="row r7row nextrow"><button class="btn" data-act="next">${t('next')}</button>${info.dare ? '' : homeRound}${shareBtn}</div>
</div></div>`);
      if (info.coins) flyCoins(info.coinsBefore, info.coinsBefore + info.coins);
      if (cn && info.cafeStars) flyStar(cn, info.cafeStars);
      return;
    }
    // the big card: Next (or the friend's reply) is the last row, at the same height as on the compact card; Home and
    // Share sit above it
    const main = info.adopt || (barMain ? cafeBar(false) : '');
    const primary = info.friend ? (info.friend.res === 'miss' ? `<button class="btn" data-act="retry">${t('retry')}</button>` : `<button class="btn pink dback" data-act="share">${SHARE_SVG}<span>${t(info.friend.res === 'tie' ? 'dareTieBtn' : 'dareBack')}</span></button>`) : info.again ? `<button class="btn" data-act="retry">${t('runAgain')}</button>` : `<button class="btn" data-act="next">${info.show ? t('show') : t('next')}</button>`;
    root.insertAdjacentHTML('beforeend', `
<div class="backdrop winb wbig" id="modal"><div class="card teal win ${info.chain ? 'withclip' : (info.ach || []).length || info.pay ? 'tight' : ''}">
  ${peek}
  <h2 class="title yellow">${t(info.title)}</h2>
  ${info.chain ? '' : moment}
  ${info.show ? `<div class="purr showtag">${ribbonSvg}${info.showTag || t('showBoard')}</div>` : `<div class="stars n${info.stars}">${stars}</div>`}
  ${main ? `<div class="mainrew">${main}</div>` : ''}
  ${info.chain ? '' : rrow}
  ${hilite}
  ${barMain || info.chain ? '' : cafeBar(false)}
  ${drecRow(info.drec)}
  ${info.purr && !(info.chain && main) ? `<div class="purr">${info.purr}</div>` : ''}
  ${info.chain ? '' : dres}
  <div class="row r7row">${info.friend ? `<button class="btn teal sm" data-act="next">${t('dareContinue')}</button>${info.friend.res === 'miss' ? `<button class="btn pink sm sharebtn dsend" data-act="share">${SHARE_SVG}<span>${t('dareSendResult')}</span></button>` : ''}` : `<button class="btn teal sm" data-act="home">${t('home')}</button>${shareBtn}`}</div>
  ${primary}
</div></div>`);
    if (info.coins) flyCoins(info.coinsBefore, info.coinsBefore + info.coins);
    if (cn && info.cafeStars) flyStar(cn, info.cafeStars);
  },

  // continue offer: first the why (the stuck cat stays visible above the bench with a "No seat left!" tag and the
  // card explains seats vs the missing carrier), then the ways out. Options the player cannot pay lead to the shop.
  // a friend's challenge link: who dares, the goal, the board, and (a new player) the one rule; Play goes straight in
  dare(info) {
    document.getElementById('modal')?.remove();
    root.insertAdjacentHTML('beforeend', `
<div class="backdrop" id="modal"><div class="card teal dare">
  ${r7c('cat_head_' + info.peek + '_happy', 'peek')}
  <div class="purr showtag">${t('dareTitle')}</div>
  <h2 class="title yellow">${escHtml(t('dareFrom', { name: info.who }))}</h2>
  <div class="dgoal">${r7('hud_medal')}<b>${info.goal}</b></div>
  <div class="dboard">${escHtml(t('dareBoard', { board: info.board, n: info.seats }))}</div>
  ${info.thread && info.thread.length ? `<div class="dthread">${info.round > 1 ? `<i class="drd">${t('dareRound', { n: info.round })}</i>` : ''}${info.thread.map((e) => `<span>${escHtml(e)}</span>`).join('<em>&rarr;</em>')}<em>&rarr;</em><b>${t('dareYourTurn')}</b></div>` : ''}
  ${info.reply ? `<p class="dreply" data-act="events" data-tab="friends">${escHtml(info.reply)}</p>` : ''}
  ${info.fresh ? `<p class="dhow">${t('dareHow')}</p>` : ''}
  <label class="dname"><span>${t('dareName')}</span><input id="darename" maxlength="12" autocomplete="nickname" enterkeyhint="done" placeholder="${t('dareNameHint')}" value="${escHtml(info.nick || '')}"></label>
  <button class="btn" data-act="dareplay">${t('darePlay')}</button>
  <button class="link" data-act="dareskip">${t('dareSkip')}</button>
</div></div>`);
  },

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
    const takeBack = back && !info.practice ? `<button class="btn green sm tb" data-act="takeback">${img('v2/ui_undo.webp', 'mini')}<b>${info.backLabel || t('takeBack')}</b><small>${t('free')}</small></button>` : '';
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
  <div class="setrow"><span>${t('language')}</span><div class="segs">${langs}</div></div>${gpuRow()}
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
    const St = info.street || { open: false, done: 0, at: 0 };
    const view = !area ? (St.open ? 'street' : 'house') : cafeView === 'street' ? 'street' : cafeView === 'house' ? 'house' : 'room';
    const house = view !== 'room';
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
          // (a piece hung high, like the pendant lamps, keeps its tag just under it, clear of the top HUD and Claim)
          return `<button class="d7 tbd ${p[1] < 0.4 ? 'hi' : ''} ${canAfford(x) ? 'ok' : ''} ${L && L.spot && L.spot.k === 'build' ? 'spot' : ''}" data-act="build" data-id="${x.id}" style="${st};z-index:60" aria-label="${loc(x.name)}">${r7c('decor_' + x.id)}<i class="tbd-tag">${r7('hud_star')}<b>${x.cost || 1}</b></i></button>`;
        }
        const fresh = info.justBuilt === x.id;
        return `<div class="d7 ${fresh ? 'fresh' : ''}" style="${st}">${r7c('decor_' + x.id)}${fresh ? '<i class="puff p1"></i><i class="puff p2"></i><i class="puff p3"></i><i class="spk s1"></i><i class="spk s2"></i><i class="spk s3"></i>' : ''}</div>`;
      }).join('');
      const freshRes = tasks.find((x) => x.id === info.justBuilt && x.resident);
      const spots = RS7[area.id] || [];
      const sp = (L && L.spot) || {};
      const readyReq = L ? L.reqs.find((x) => x.ready) : null;
      const bubbles = [];
      const guests = guestsFor(ai, info.day || 0, readyReq ? readyReq.who : '').map((g, i) => {
        const lines = g.idle && g.idle.length ? g.idle : [g.line];
        const line = lines[((info.day || 0) + ai * 2 + i) % lines.length];
        const k = Math.max(0, (area.spots || []).indexOf(g.spot));
        const s = spots[k] || [g.spot.x, g.spot.y + g.spot.w * 0.5, g.spot.w];
        const fresh = freshRes && freshRes.resident.id === g.id;
        // a finished request: a speech bubble over its resident, claimed with one tap ("Help Mochi earn a beanie!")
        const rq = L && L.reqs.find((x) => x.who === g.id && x.ready);
        const bst = `left:${Math.min(66, Math.max(34, s[0] * 100))}%;top:${(s[1] - s[2] * 1.02) * 100}%`;
        const rw = (r) => `<i class="rqrw">${r7('hud_coin')}+${r.coins} ${r7('hud_heart')}+${r.hearts}</i>`; // the reward, in sight before the tap
        const ask = !rq && L && L.reqs.find((x) => x.who === g.id && x.fresh && !x.ready);
        if (rq) bubbles.push(`<button data-who="${g.id}" class="rqbub ${sp.k === 'req' && sp.i === rq.i ? 'spot' : ''}" data-act="reqtap" data-i="${rq.i}" style="${bst}">${r7('res7_' + g.id + '_' + (rq.outfit || 'idle'), 'rqo')}<span class="rqt"><b>${rq.outfit ? t('helpEarn', { name: g.name, o: t('o_' + rq.outfit) }) : t('reqTreat', { name: g.name })}</b>${rw(rq)}</span><em>${t('claim')}</em></button>`);
        // a newcomer's first ask, over the cat itself: what, how far, and what it pays (a tap opens the request list)
        else if (ask) bubbles.push(`<button data-who="${g.id}" class="rqbub ask" data-act="reqtap" data-i="${ask.i}" style="${bst}"><span class="rqt"><b>${escHtml(t('reqFirst', { name: g.name, what: ask.task }))}</b><i class="rqp"><i style="width:${Math.round((ask.p / ask.need) * 100)}%"></i></i><small>${ask.p}/${ask.need}</small>${rw(ask)}</span></button>`);
        // just thanked: the resident names the next reason to come back
        else if (L && L.after && L.after.who === g.id) bubbles.push(`<div data-who="${g.id}" class="rqbub next" style="${bst}"><span class="rqt"><b>${escHtml(L.after.text)}</b></span></div>`);
        return `<button class="guest g7 ${fresh ? 'fresh' : ''}" data-act="pet" data-id="${g.id}" aria-label="${g.name}" style="left:${s[0] * 100}%;top:${s[1] * 100}%;width:${s[2] * 100}%;z-index:${Math.round(s[1] * 100) + 1};--d:${(-i * 3.7).toFixed(1)}s">${L && L.wear[g.id] ? r7c(`res7_${g.id}_${L.wear[g.id]}`, 'gimg') : `${r7c(`res7_${g.id}_idle`, 'gimg')}${r7c(`res7_${g.id}_job`, 'gimg job')}`}${L && L.pet[g.id] ? '<i class="pheart">&#9829;</i>' : ''}<i class="gbub ${s[0] > 0.62 ? 'l' : s[0] < 0.3 ? 'r' : ''}">${loc(line)}</i></button>`;
      }).join('');
      const ros = (info.rosettes || []).length ? `<div class="rosettes">${info.rosettes.map((r) => ribbonSvg.replace('class="rib"', `class="rib" style="--rc:${r.color}" aria-label="${r.name}"`)).join('')}</div>` : '';
      // visiting cats live here: each has a furnished nook (its season's bed) in a room and idles on it; today's visitor
      // carries the daily gift (one tap). A visitor whose nook is in another room drops by at the door.
      const v = L && L.visitor;
      const here = L ? L.nooks.filter((x) => x.area === ai) : [];
      const NK = NOOK7[area.id] || NOOK7.counter;
      const nooks = here.slice(0, NK.length).map((x, j) => {
        const p = NK[j];
        const gift = v && v.id === x.id && v.gift;
        return `<div class="nook7" style="left:${p[0] * 100}%;top:${p[1] * 100}%;width:${p[2] * 100}%;z-index:${Math.round(p[1] * 100)}">${r7c('nook_' + x.set, 'nkbed')}</div><button class="guest g7 visitor idle7 ${j ? 'b' : ''}" data-act="visitor" data-id="${x.id}" aria-label="${x.name}" style="left:${p[0] * 100}%;top:${(p[1] - p[2] * 0.18) * 100}%;width:${p[2] * 0.8 * 100}%;z-index:${Math.round(p[1] * 100) + 1}">${r7c('vis7_' + x.id, 'gimg')}${gift ? '<i class="pheart gift">+</i>' : ''}<i class="gbub ${p[0] > 0.6 ? 'l' : 'r'}">${loc(x.line)}</i></button>`;
      }).join('');
      const vis = v && !here.some((x) => x.id === v.id) ? `<button class="guest g7 visitor" data-act="visitor" data-id="${v.id}" aria-label="${v.name}" style="left:28%;top:99%;width:17%;z-index:99">${r7c('vis7_' + v.id, 'gimg')}${v.gift ? '<i class="pheart gift">+</i>' : ''}<i class="gbub r">${loc(v.line)}</i></button>` : '';
      // the tip jar is a real jar on the café counter: tap to collect
      const J = L && L.jar;
      const jar = J && J.on && area.id === 'counter' && isBuilt('counter_counter') ? `<button class="jar7 ${J.pct >= 1 ? 'full' : ''} ${sp.k === 'jar' ? 'spot' : ''}" data-act="jartap" aria-label="${t('tipJar')}" style="left:47%;top:50.5%;width:10%;z-index:70">${r7c('tipjar_' + J.stage)}<i class="jtag">${J.pct >= 1 ? t('tipsReady') : J.coins > 0 ? '+' + J.coins : fmtShort(J.fullMs)}</i></button>` : '';
      // a renovation set (garland + rug) restyles a finished room
      const st7 = info.reno && info.reno.style;
      const reno = st7 ? `<img class="reno-r cfb ${info.justBuilt === 'reno' ? 'fresh' : ''}" src="${assetUrl('r7/reno_' + st7 + '_rug.webp')}" alt="" draggable="false"><img class="reno-g cfb ${info.justBuilt === 'reno' ? 'fresh' : ''}" src="${assetUrl('r7/reno_' + st7 + '_garland.webp')}" alt="" draggable="false">` : '';
      // R10 keepsakes on the walls: a framed album print (one per room), the Daily record's pennant and clock
      const W = info.wall || {};
      const wp = WALL7[area.id] || WALL7.counter;
      const keep = (W.hung && W.hung[ai] != null ? `<img class="wall7 print7 ${info.justBuilt === 'print' ? 'fresh' : ''}" src="${assetUrl('r7/print_' + W.hung[ai] + '.webp')}" alt="" draggable="false" style="left:${wp[0] * 100}%;top:${wp[1] * 100}%;width:${wp[2] * 100}%">` : '')
        + (ai === 0 && W.pennant ? `<img class="wall7 pen7" src="${assetUrl('r7/drec_pennant.webp')}" alt="" draggable="false">` : '')
        + (ai === 0 && W.clock ? `<img class="wall7 clk7" src="${assetUrl('r7/drec_clock.webp')}" alt="" draggable="false">` : '');
      scene = `<div class="stage">${r7c(`room_${area.id}_bare`, 'rbg')}${reno}${keep}${decor}${guests}${nooks}${vis}${jar}${bubbles.join('')}${ros}${L && L.cups ? L.cups : ''}</div>`;
    } else if (view === 'street') {
      scene = streetHtml(St, info.justBuilt === 'street');
    } else {
      scene = houseHtml(curFloor, ai, St);
    }

    // floor rail (left): the house view toggle on top, then the floors from the roof down
    const rail = AREAS.map((a, i) => {
      const st = done(i) ? 'done' : i === curFloor ? 'cur' : 'locked';
      const on = !house && i === ai ? 'on' : '';
      return `<button class="fl ${st} ${on}" data-act="cafearea" data-d="${i - ai}" data-view="room" ${open(i) ? '' : 'disabled'} aria-label="${loc(a.name)}">${st === 'locked' ? r7('icon_lock') : `<b>${i === 0 ? 'G' : i}</b>`}${st === 'done' ? `<i class="ck">${checkSvg0}</i>` : ''}</button>`;
    }).reverse().join('');
    const railHtml = `<div class="frail"><button class="fl hs ${house ? 'on' : ''}" data-act="${area ? 'cafeview' : 'cafearea'}" data-d="${area ? 0 : -1}" data-view="${house ? 'room' : 'house'}" aria-label="${t(house ? 'roomView' : 'houseView')}">${r7('icon_home')}</button>${rail}</div>`;
    const spk = L && L.spot && L.spot.k === 'claim' ? L.spot.what : '';
    const sptag = (k) => (spk === k ? `<em class="sptag">${t('spotClaim')}</em>` : '');
    const jarOnCounter = !house && area && area.id === 'counter' && isBuilt('counter_counter');
    const rrail = `<div class="rrail"><button class="rr ${spk === 'quests' ? 'spot' : ''}" data-act="quests" aria-label="${t('tasks')}">${r7('icon_calendar')}${dot(info.dots && info.dots.quests)}<span>${t('tasks')}</span>${sptag('quests')}</button>${L ? liveRail({ ...L, jar: jarOnCounter || !(L.jar.coins > 0 || L.spot && L.spot.k === 'jar') ? null : L.jar, jarSpot: L.spot && L.spot.k === 'jar', spot: spk, sptag }) : `<button class="rr" data-act="daily" aria-label="${t('daily')}">${r7('hud_medal')}<span>${t('daily')}</span></button>`}</div>`;

    // one next-build card: the piece, the floor's progress in segments, the star cost
    const segs = area ? `<i class="segs">${tasks.map((x) => `<i class="${isBuilt(x.id) ? 'on' : ''}"></i>`).join('')}</i>` : '';
    const pt = info.party;
    let card;
    const R = info.reno;
    if (view === 'street' && St.open) {
      const h = St.next.house;
      card = `<button class="trow ${St.ok ? 'ok' : 'dim'} ${L && L.spot && L.spot.k === 'build' ? 'spot' : ''}" data-act="streetbuild">
  <span class="ticon">${r7c('street_' + h.id)}</span>
  <span class="tname"><b>${loc(St.next.name)}</b><small>${t('streetPiece', { house: h.kind === 'up' ? t('streetUpName', { house: loc(h.name) }) : h.kind === 'mix' ? loc(h.theme.name) + ' · ' + loc(h.name) : loc(h.name), n: St.at + 1, m: h.tasks.length })}</small><i class="segs">${h.tasks.map((_, i) => `<i class="${i < St.at ? 'on' : ''}"></i>`).join('')}</i></span>
  <span class="cost">${r7('hud_star')}<b>${St.next.cost}</b></span>
</button>`;
    } else if (view === 'street') {
      card = `<div class="trow empty"><span class="tname"><b>${t('streetTitle')}</b><small>${t('streetLocked')}</small></span></div>`;
    } else if (R && !house && area && ai < AREAS.length - 1) {
      card = R.set
        ? `<button class="trow ${R.set.ok ? 'ok' : 'dim'}" data-act="reno">
  <span class="ticon">${r7c('reno_' + R.set.id + '_rug')}</span>
  <span class="tname"><b>${t('renoTitle', { set: R.set.name })}</b><small>${R.set.featured ? t('renoFeatured') : t('renoSub', { room: loc(area.name) })}</small></span>
  <span class="cost">${r7('hud_star')}<b>${R.set.cost}</b></span>
</button>`
        : `<button class="trow ok" data-act="reno"><span class="ticon">${r7c('reno_' + (R.style || R.owned[0]) + '_rug')}</span><span class="tname"><b>${t('renoSwitch')}</b><small>${t('renoSwitchSub', { n: R.owned.length })}</small></span></button>`;
    } else if (pt && !left.length) {
      card = `<button class="trow ${pt.ok ? 'ok' : 'dim'}" data-act="party">
  <span class="ticon">${r7c('decor_roof_grill')}</span>
  <span class="tname"><b>${t('partyTask', { n: pt.n + 1 })}</b><small>${img('ui_coin.webp', 'mini-res')}${t('partySub', { c: pt.coins })}</small></span>
  <span class="cost">${r7('hud_star')}<b>${pt.cost}</b></span>
</button>`;
    } else if (area && left.length) {
      const x = left[0];
      // the hub's thread: this piece brings a resident, or the card names the next one and the stars still to go
      const nx = L && L.nextRes;
      const sub = x.resident ? `<small class="thread">${r7c('res7_' + x.resident.id + '_idle', 'mini-res')}${t('movesIn', { name: x.resident.name })}</small>`
        : nx ? `<small class="thread">${r7c('res7_' + nx.id + '_idle', 'mini-res')}${L.thread && L.thread.who === nx.id ? threadLine(L.thread) : t('resThread', { name: nx.name, n: nx.left })}</small>` : `<small>${floorName(ai)} · ${loc(area.name)}</small>`;
      card = `<button class="trow ${canAfford(x) ? 'ok' : 'dim'} ${L && L.spot && L.spot.k === 'build' ? 'spot' : ''}" data-act="build" data-id="${x.id}">
  <span class="ticon">${r7c('decor_' + x.id)}</span>
  <span class="tname"><b>${loc(x.name)}</b>${sub}${segs}</span>
  <span class="cost">${r7('hud_star')}<b>${x.cost || 1}</b></span>
</button>`;
    } else {
      // a finished floor is never a dead end: the card is the next build on the floor under construction (its room, the
      // stars it still needs) and one tap goes there; with the whole house built it leads to Cat Street
      const nf = curFloor >= 0 ? pending(curFloor)[0] : null;
      if (area && nf) {
        const have = info.stars || 0;
        const need = nf.cost || 1;
        card = `<button class="trow nextfloor ok" data-act="cafearea" data-d="${curFloor - ai}" data-view="room">
  <span class="ticon">${r7c('decor_' + nf.id)}</span>
  <span class="tname"><small class="nfdone">${checkSvg0}${t('floorDoneShort', { floor: floorName(ai) })}</small><b>${loc(nf.name)}</b><small>${t('nextIn', { room: `${floorName(curFloor)} · ${loc(AREAS[curFloor].name)}` })}</small><small class="nfneed ${have >= need ? 'ok' : ''}">${have >= need ? t('readyBuild') : t('starsMissing', { n: need - have })}</small></span>
  <span class="cost go">${r7('hud_star')}<b>${Math.min(have, need)}/${need}</b><em>${t('goThere')}</em></span>
</button>`;
      } else if (area && St.open) {
        card = `<button class="trow nextfloor ok" data-act="cafeview" data-view="street"><span class="ticon">${r7c('street_' + St.next.house.id)}</span><span class="tname"><b>${loc(St.next.name)}</b><small>${t('streetTitle')} · ${loc(St.next.house.name)}</small></span><span class="cost go">${r7('hud_star')}<b>${St.next.cost}</b><em>${t('goThere')}</em></span></button>`;
      } else card = `<div class="trow empty"><span class="tname"><b>${area ? t('floorDone') : t('comingSoon')}</b>${area ? segs : `<small>${t('teaserSub')}</small>`}</span></div>`;
    }
    const tab = (act, icon, label, extra = '', on = false, view = '') => `<button class="tab ${on ? 'on' : ''}" data-act="${act}" ${view ? `data-view="${view}"` : ''} aria-label="${label}">${r7(icon)}<span>${label}</span>${extra}</button>`;
    mount(`
<div id="cafe" class="screen on r7hub ${house ? 'vhouse' : 'vroom'} ${view === 'street' ? 'vstreet' : ''}">
  <div class="room ${house ? 'house' : ''} ${L && L.goals.length ? 'goaled' : ''}" style="--fh:${area && area.hue ? area.hue : 0}deg">${scene}
    <div class="cafe-top">
      <button class="round" data-act="settings" aria-label="${t('settings')}">${gearSvg}</button>
      <div class="tr">${livesPill(info.lives)}<button class="pill sm" data-act="shop">${r7('hud_coin')}<b id="coins">${info.coins}</b></button><div class="pill sm cstar">${r7('hud_star')}<b id="cstars">${info.stars}</b></div></div>
    </div>
    ${railHtml}${rrail}
    <div class="fname ${L && L.goals.length ? 'up' : ''}">${view === 'street' ? `${t('streetTitle')} · ${t('streetShops', { n: St.shops ?? St.done })}` : house ? t('houseTitle') : `${floorName(ai)} · ${loc(area.name)}`}</div>
    ${L ? featGoalHtml(roomGoals(L, house || view === 'street' ? [] : guestsFor(ai, info.day || 0, (L.reqs.find((x) => x.ready) || {}).who || '').map((g) => g.id))) : ''}
  </div>
  <div class="nbcard">${card}</div>
  <button class="btn play cafe-play" data-act="play"><b>${t('play')}</b><small>${t('level', { n: info.level })}</small></button>
  <nav class="tabbar">${tab('cafeview', 'icon_home', t('home'), '', true, 'room')}${tab('residents', 'icon_paw', t('residents'))}${tab('shop', 'icon_shop', t('shop'), info.offer ? `<i class="otag">${t('offerBadge')}</i>` : '')}${tab('show', 'icon_trophy', t('events'), dot(info.dots && info.dots.show) + (spk === 'rush' ? `<em class="sptag">${t('spotClaim')}</em>` : ''))}</nav>
</div>`);
    if (floorQ) waitFloor();
    hubAfter('cafe', info);
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
    ${info.ask ? `<p class="firstreq">${info.ask}</p>` : ''}
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
    const framed = drecHas(save.data, 'frame'); // the Daily record's 30-clear frame on every resident portrait
    const card = (r) => {
      const has = isBuilt(r.task.id);
      const area = AREAS[r.task.area];
      const wr = has && save.data.cafe.wear[r.id];
      return `<div class="rcard ${has ? '' : 'locked'}">
  <div class="rp ${has && framed ? 'framed' : ''}">${has && framed ? r7c('drec_frame', 'rframe') : ''}${r7c('res7_' + r.id + '_' + (wr || 'idle'))}${has ? '' : lockSvg}</div>
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
  <div class="hud-top"><button class="round" data-act="cafeback" aria-label="${t('back')}"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><h2 class="title yellow sm">${t('residents')}</h2><button class="albbtn" data-act="album">${r7c('album_book')}<b>${t('album')}</b><small>${cardsOwned(save.data)}/${WEEKS.length}</small></button></div>
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
${jobsHtml(info.jobs)}
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

  // the share sheet where the platform has no share sheet of its own (desktop browsers): the link was copied in the
  // same tap (status says so) or the copy was refused, then one tap copies it (a fresh user gesture) and "Link copied"
  // shows only after the write succeeded; else the link stays selected in the field to copy by hand. A preview shows what
  // the friend gets (the clip's end card with the link burned in, or the house card); Save hands over the file too.
  // info: { title, goal?, img?, url, text, copied, file? }; onSave(): download the file (and copy the link)
  shareSheet(info, onSave) {
    document.getElementById('linkbar')?.remove();
    const el = document.createElement('div');
    el.id = 'linkbar';
    el.className = 'sharesheet';
    el.innerHTML = `<div class="sscard">
  <button class="lbx" type="button" aria-label="${t('close')}">&times;</button>
  <b class="sst">${escHtml(info.title)}</b>
  <div class="ssrow">${info.img ? `<img class="ssimg${info.wide ? ' wide' : ''}" src="${info.img}" alt="">` : ''}<div class="sscol">${info.goal ? `<span class="ssgoal">${escHtml(info.goal)}</span>` : ''}<span class="ssst ${info.copied ? 'ok' : ''}">${t(info.copied ? 'ssCopied' : 'ssCopy')}</span></div></div>
  <input readonly aria-label="${t('copyLinkBtn')}">
  <div class="ssbtns">${info.copied ? '' : `<button class="btn pink sm" type="button" data-copy>${t('copyLinkBtn')}</button>`}${info.file ? `<button class="btn ${info.copied ? 'pink' : 'teal'} sm" type="button" data-save>${t(info.file === 'clip' ? 'ssSaveClip' : 'ssSaveCard')}</button>` : ''}${info.copied && !info.file ? `<button class="btn teal sm" type="button" data-done>${t('ssDone')}</button>` : ''}</div>
</div>`;
    const inp = el.querySelector('input');
    inp.value = info.url;
    const close = () => el.remove();
    el.querySelector('.lbx').addEventListener('click', close);
    el.querySelector('[data-done]')?.addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    el.querySelector('[data-save]')?.addEventListener('click', () => { close(); onSave && onSave(); });
    el.querySelector('[data-copy]')?.addEventListener('click', async () => {
      let ok = false;
      try { if (navigator.clipboard) { await navigator.clipboard.writeText(info.text + ' ' + info.url); ok = true; } } catch { /* no permission */ }
      if (!ok) { inp.focus(); inp.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } }
      if (ok) { close(); this.toast(t('linkCopied')); } else this.toast(t('copyHold'));
    });
    root.appendChild(el);
    if (!info.copied) { inp.focus(); inp.select(); }
    return el;
  },

  // after a clip went out: chat apps often keep the video and drop the text beside it, so the playable link follows as
  // its own message, with a preview of what the friend will get (the goal, the board, the seats)
  dareLink(info, onSend) {
    document.getElementById('linkbar')?.remove();
    const el = document.createElement('div');
    el.id = 'linkbar';
    el.className = 'linkbar dlink';
    el.innerHTML = `${r7c('cat_head_' + info.peek + '_happy', 'dlpeek')}<span class="dltx"><b>${t('dareLinkTitle')}</b><small>${escHtml(info.goal)} · ${escHtml(t('dareBoard', { board: info.board, n: info.seats }))}</small></span><button class="btn pink sm" type="button" data-send>${t('dareLinkBtn')}</button><button class="lbx" type="button" aria-label="${t('close')}">&times;</button>`;
    el.querySelector('.lbx').addEventListener('click', () => el.remove());
    el.querySelector('[data-send]').addEventListener('click', () => { el.remove(); onSend(); });
    root.appendChild(el);
    return el;
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
