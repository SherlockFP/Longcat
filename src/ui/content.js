// Content lane UI: the themed packs past L60 (HUD chip, pack intro, pack-complete ceremony, the packs sheet), the one-time
// cards for the spring cat and the swivel bed, and the pack hosts moving into the café (as visiting cats).
// main.js calls init() at boot, levelStart() after ui.play() and onWin() after ui.win(). State: save.data.content.
import { t, lang } from '../i18n.js';
import { save } from '../kit/save.js';
import { assetUrl } from '../game/breeds.js';
import { grant } from '../game/econ.js';
import { VISITORS } from '../game/live.js';
import { packOf } from '../core/content-mech.js';
import { PACKS, HOSTS, PACK_FROM, PACK_LEN, PACK_REWARD, PACK_REWARD_LAP } from '../../data/content.js';
import { preload } from '../game/content.js';
import './content.css';

// teaching levels' one-line hint (main.js TUT_KEY)
export const TUT = { 61: 'tutSpring', 81: 'tutSwivel' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const loc = (o) => (o && typeof o === 'object' ? o[lang()] || o.en || '' : o || '');
const portrait = (host, cls = '') => `<img class="${cls}" src="${assetUrl('r7/vis7_' + host + '.webp')}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`;
const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const packName = (p) => (p.lap ? t('packLap', { name: loc(p.pack.name), lap: ROMAN[p.lap] || p.lap + 1 }) : loc(p.pack.name));

// ---- state (save.data.content; save.js keeps only its own default keys, so this one is read back from storage) ----
function D() {
  const d = save.data;
  if (d.content && typeof d.content === 'object') return d.content;
  let c = null;
  try {
    const raw = JSON.parse(localStorage.getItem('lco_save') || 'null');
    if (raw && raw.content && typeof raw.content === 'object') c = raw.content;
  } catch { /* blocked storage: fresh */ }
  c = c || {};
  for (const k of ['intro', 'seen', 'done', 'hosts']) if (!c[k] || typeof c[k] !== 'object') c[k] = {};
  d.content = c;
  return c;
}

// the pack hosts that already moved in live in the café like the season's visiting cats (nooks, daily visit, gift)
function registerHosts() {
  const d = save.data;
  for (const id of Object.keys(D().hosts)) {
    if (!HOSTS[id]) continue;
    VISITORS[id] = { name: HOSTS[id].name, line: HOSTS[id].line };
    if (d.vis && !d.vis[id]) d.vis[id] = D().hosts[id];
  }
}

let game = null;
const queue = [];

export function init(o) {
  game = o.game;
  preload();
  registerHosts();
  // sounds for the new pieces: a pop for the spring's hop, a tick when a bed turns
  const prev = game.on.mech;
  game.on.mech = (e) => {
    if (prev) prev(e);
    if (game.demo || !o.audio) return;
    if (e.type === 'spring') o.audio.pop();
    else if (e.type === 'spin') o.audio.tick();
  };
  if (import.meta.env && import.meta.env.DEV) {
    window.__qaContent = {
      state: () => JSON.parse(JSON.stringify(D())),
      reset: () => { save.data.content = { intro: {}, seen: {}, done: {}, hosts: {} }; save.commit(); },
      pack: (n) => packOf(n),
      cards: () => [...document.querySelectorAll('#cmodal .card')].map((c) => c.dataset.k),
      mechs: () => (game && game.board ? game.board.cats.filter((c) => c.mech === 'spring' || c.mech === 'swivel').map((c) => ({ id: c.id, mech: c.mech })) : []),
      sheet: () => packsSheet(),
      finish: (n) => onWin(n, true),
    };
  }
}

// ---- level start: the pack room, the HUD chip, and any card owed (pack done, pack intro, a new piece) ----
export function levelStart(n, special, board) {
  const p = special ? null : packOf(n);
  if (game) game.theme = p ? p.pack.theme : null;
  document.getElementById('cmodal')?.remove();
  queue.length = 0;
  if (p) chip(p);
  const c = D();
  if (c.pend) { // a pack finished on the last win: its ceremony comes first
    queue.push({ k: 'done', p: c.pend });
    delete c.pend;
  }
  if (p && !c.intro[p.idx]) {
    c.intro[p.idx] = 1;
    queue.push({ k: 'intro', p });
  }
  for (const m of ['spring', 'swivel']) {
    if (!c.seen[m] && board.cats.some((x) => x.mech === m)) {
      c.seen[m] = 1;
      queue.push({ k: 'mech', m });
    }
  }
  save.commit();
  next();
}

function chip(p) {
  const wrap = document.querySelector('#hud .logo-wrap');
  if (!wrap) return;
  const el = document.createElement('button');
  el.className = 'cpchip';
  el.type = 'button';
  el.style.setProperty('--pc', p.pack.color);
  // the chip counts the board being played (3/20 = the third board of the pack)
  el.innerHTML = `<i></i><span>${esc(t('packChip', { name: packName(p), a: p.i + 1, b: PACK_LEN }))}</span>`;
  el.addEventListener('click', () => packsSheet());
  wrap.appendChild(el);
}

// ---- cards ----
function next() {
  const c = queue.shift();
  if (!c) return;
  if (c.k === 'mech') mechCard(c.m);
  else if (c.k === 'intro') introCard(c.p);
  else doneCard(c.p);
}

function modal(k, html, cls = '') {
  document.getElementById('cmodal')?.remove();
  const root = document.getElementById('ui') || document.body;
  const el = document.createElement('div');
  el.id = 'cmodal';
  el.className = 'backdrop cpkb';
  el.innerHTML = `<div class="card cpk ${cls}" data-k="${k}">${html}</div>`;
  el.querySelector('[data-cgo]')?.addEventListener('click', () => { el.remove(); next(); });
  root.appendChild(el);
  return el;
}

const SPRING_SVG = `<svg viewBox="0 0 220 96" class="cpill" aria-hidden="true">
  <g class="cg"><rect x="4" y="44" width="212" height="48" rx="10" fill="#fff0d3" stroke="#e8d5b0" stroke-width="2"/>
  <rect x="14" y="52" width="70" height="32" rx="16" fill="#ff8a3d" stroke="#1d2b53" stroke-width="3"/><circle cx="74" cy="68" r="15" fill="#ff8a3d" stroke="#1d2b53" stroke-width="3"/>
  <circle cx="69" cy="64" r="2.6" fill="#1d2b53"/><circle cx="80" cy="64" r="2.6" fill="#1d2b53"/>
  <g class="coil"><circle cx="40" cy="40" r="13" fill="#ffd43b" stroke="#fff" stroke-width="3"/><path d="M34 47 46 44 34 40 46 36 34 33" fill="none" stroke="#1d2b53" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>
  <rect x="104" y="52" width="56" height="32" rx="16" fill="#5aa9e6" stroke="#1d2b53" stroke-width="3"/>
  <path class="arc" d="M92 52 Q132 2 190 52" fill="none" stroke="#e8590c" stroke-width="4" stroke-dasharray="7 7" stroke-linecap="round"/><path d="M182 42 192 54 177 55" fill="none" stroke="#e8590c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>
</svg>`;
const SWIVEL_SVG = `<svg viewBox="0 0 220 96" class="cpill" aria-hidden="true">
  <rect x="4" y="4" width="212" height="88" rx="10" fill="#fff0d3" stroke="#e8d5b0" stroke-width="2"/>
  <g class="spinbed"><circle cx="110" cy="48" r="34" fill="#BD582F"/><circle cx="110" cy="48" r="23" fill="#fff6e5"/><path d="M100 13 110 4 120 13z" fill="#ffd43b" stroke="#1d2b53" stroke-width="2.5" stroke-linejoin="round"/></g>
  <circle cx="110" cy="48" r="15" fill="#9b7bea" stroke="#1d2b53" stroke-width="3"/><circle cx="105" cy="45" r="2.4" fill="#1d2b53"/><circle cx="115" cy="45" r="2.4" fill="#1d2b53"/>
  <path d="M150 22a46 46 0 0 1 0 52" fill="none" stroke="#2f9e44" stroke-width="4" stroke-linecap="round"/><path d="M143 70 150 76 156 68" fill="none" stroke="#2f9e44" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="22" y="34" width="44" height="28" rx="14" fill="#6bd36b" stroke="#1d2b53" stroke-width="3" class="leave"/><path d="M28 80 H60" stroke="#1d2b53" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7" opacity=".5"/>
</svg>`;

function mechCard(m) {
  modal('mech', `<div class="cpbadge">${esc(t('mechNew'))}</div>
<h2 class="cpt">${esc(t(m + 'Title'))}</h2>
${m === 'spring' ? SPRING_SVG : SWIVEL_SVG}
<p class="cpb">${esc(t(m + 'Body'))}</p>
<p class="cptip">${esc(t(m + 'Tip'))}</p>
<button class="btn green sm" type="button" data-cgo>${esc(t('gotIt'))}</button>`, 'mech');
}

const mechName = (m) => t(m + 'Title');

function introCard(p) {
  const host = HOSTS[p.pack.host];
  const sub = p.lap ? t('packIntroLap', { c: PACK_REWARD_LAP.coins }) : t('packIntroSub', { host: host.name });
  const teach = !p.lap && p.pack.teach ? `<div class="cpnew">${esc(t('packNewMech', { mech: mechName(p.pack.teach) }))}</div>` : '';
  modal('intro', `<div class="cpband" style="--pc:${p.pack.color}"><small>${esc(t('packN', { n: p.idx + 1 }))}</small><b>${esc(packName(p))}</b></div>
<div class="cphost">${portrait(p.pack.host, 'cpimg')}<div><p class="cpb">${esc(loc(p.pack.blurb))}</p><p class="cpsub">${esc(sub)}</p></div></div>
${teach}
<button class="btn green sm" type="button" data-cgo>${esc(t('packGo'))}</button>`, 'intro');
}

function doneCard(p) {
  const host = HOSTS[p.pack.host];
  const pk = PACKS.find((x) => x.id === p.pack.id) || p.pack;
  modal('done', `<div class="cpband" style="--pc:${pk.color}"><b>${esc(t('packDone', { name: p.name }))}</b></div>
<div class="cphost big">${portrait(pk.host, 'cpimg')}<div>${p.lap ? '' : `<p class="cpt2">${esc(t('packMoved', { host: host.name }))}</p><p class="cpb">${esc(loc(host.bio))}</p>`}</div></div>
<div class="cprew">${esc(p.lap ? t('packRewardLap', { c: PACK_REWARD_LAP.coins }) : t('packReward', { c: PACK_REWARD.coins }))}</div>
<button class="btn green sm" type="button" data-cgo>${esc(t('packGo'))}</button>`, 'done');
}

// the packs sheet (from the HUD chip): the four themes of the first lap, progress and their hosts
export function packsSheet() {
  const lv = save.data.level;
  const rows = PACKS.map((pk, i) => {
    const from = PACK_FROM + i * PACK_LEN;
    const a = D().done[i] ? PACK_LEN : Math.min(PACK_LEN, Math.max(0, lv - from));
    const host = HOSTS[pk.host];
    const home = !!D().hosts[pk.host];
    const open = lv >= from;
    const what = home ? `<small class="cpbio">${esc(loc(host.bio))}</small>` : `<small>${esc(open ? t('packHostLocked') : t('packLocked', { n: from }))}</small>`;
    return `<div class="cprow ${open ? '' : 'lock'} ${home ? 'home' : ''}" style="--pc:${pk.color}">${portrait(pk.host, 'cprimg' + (home ? '' : ' sil'))}<div class="cprt"><b>${esc(loc(pk.name))}${home ? ` · ${esc(host.name)}` : ''}</b>${what}<span class="cpbar"><i style="width:${(a / PACK_LEN) * 100}%"></i><em>${esc(t('packProgress', { a, b: PACK_LEN }))}</em></span></div></div>`;
  }).join('');
  const el = modal('sheet', `<h2 class="cpt">${esc(t('packsTitle'))}</h2><div class="cprows">${rows}</div><button class="btn green sm" type="button" data-cgo>${esc(t('gotIt'))}</button>`, 'sheet');
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
}

// ---- a win: the last level of a pack, first clear, pays the pack reward and moves its host in ----
export function onWin(n, first) {
  const p = packOf(n);
  if (!first || !p || n !== p.to) return;
  const c = D();
  if (c.done[p.idx]) return;
  c.done[p.idx] = 1;
  const d = save.data;
  const host = HOSTS[p.pack.host];
  if (!p.lap && host) {
    const day = Math.max(1, Math.floor(Date.now() / 86400000));
    c.hosts[p.pack.host] = day;
    registerHosts();
    grant(d, PACK_REWARD);
  } else grant(d, PACK_REWARD_LAP);
  c.pend = { idx: p.idx, lap: p.lap, i: p.i, from: p.from, to: p.to, name: packName(p), pack: { id: p.pack.id, host: p.pack.host, color: p.pack.color } };
  save.commit();
  const tst = document.createElement('div');
  tst.className = 'toast cptoast';
  tst.textContent = p.lap ? t('packDone', { name: packName(p) }) : t('packToast', { name: packName(p), host: host.name });
  document.body.appendChild(tst);
  setTimeout(() => tst.remove(), 2600);
}
