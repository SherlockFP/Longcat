// DOM overlay screens. Pure view: main.js owns the state and passes info in.
import { t, LANGS, lang } from '../i18n.js';
import { assetUrl } from '../game/breeds.js';
import { save } from '../kit/save.js';
import { PRODUCTS } from '../kit/iap.js';
import { AREAS, TEASER, RESIDENTS, loc, isBuilt, pending, canAfford, nextResident, perkKind, perkValue, loveOf, treatCost, LOVE_COSTS, guestsFor, clutterLevel } from '../game/cafe.js';

const root = document.getElementById('ui');
let actions = {};
let cur = { screen: 'none', info: null };

const img = (name, cls = '') => `<img class="${cls}" src="${assetUrl(name)}" alt="" draggable="false">`;

const colorHead = (color, cls = '') => img(`v2/head_${color}.webp`, cls);
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
const fmtLong = (ms) => { const m = Math.floor(ms / 60000); const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); return d > 0 ? t('daysHours', { d, h }) : t('hoursMins', { h, m: m % 60 }); };

// a reward as small chips: coins, boosters, the exclusive decor
const chips = (r, cls = '') => `<span class="chips ${cls}">${['coins', 'hint', 'scoop', 'undo'].filter((k) => r[k]).map((k) => `<span class="chip">${img(RES_IMG[k])}<b>${k === 'coins' ? r[k] : 'x' + r[k]}</b></span>`).join('')}${r.decor ? `<span class="chip dc">${decorSvg}</span>` : ''}</span>`;
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

export const ui = {
  init(a) {
    actions = a;
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      if (actions.click) actions.click();
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
    mount(`
<div id="hud" class="screen on">
  <div class="hud-top2">
    <button class="round" data-act="home" aria-label="${t('home')}"><svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg></button>
    <div class="logo-wrap"><div class="lvl-pill">${paw()}<span>${info.show ? t('showBoard') : info.daily ? t('dailyLevel') : t('level', { n: info.level })}</span>${paw()}</div></div>
    <div class="hud-r"><div class="hud-lives" id="hud-lives" ${info.lives != null ? '' : 'hidden'}>${img('v2/ui_heart.webp')}<b>${info.lives ?? 0}</b></div><button class="pill coin" data-act="shop">${img('ui_coin.webp')}<b id="coins">${info.coins}</b></button></div>
  </div>
  <div class="tut" id="tut" ${info.tut ? '' : 'hidden'}>${info.tut || ''}</div>
  <div class="boosters">
    ${boost('hint', 'ui_hint.webp', 'yellow')}
    ${boost('scoop', 'ui_scoop.webp', 'mint')}
    ${boost('undo', 'ui_undo.webp', 'cream')}
  </div>
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
      ? `<div class="peek respeek">${cimg('res_' + info.res + '.webp')}<i class="cheer">${t(info.cheer)}</i></div>`
      : colorHead(info.peek, 'peek');
    const cn = info.cafeNext;
    const nr = cn && cn.res;
    const resChip = nr ? `<span class="nres">${cimg('res_' + nr.id + '.webp')}<b>${nr.left > 0 ? t('resIn', { name: nr.name, n: nr.left }) : t('resReady', { name: nr.name })}</b></span>` : '';
    // the level's best bench chain loops here as the share preview (main.js starts it), with what the player pulled off
    const rrow = `<div class="rrow">${info.coins ? `<div class="reward cn">${img('ui_coin.webp')}<b>+${info.coins}</b></div>` : ''}${info.cafeStars ? `<div class="reward st">${img('ui_star.webp')}<b>+${info.cafeStars}</b></div>` : ''}${info.ribbons ? `<div class="reward st rb">${ribbonSvg}<b>+${info.ribbons}</b></div>` : ''}</div>`;
    const ach = (info.ach || []).map((a) => `<li class="a-${a.k}">${a.text}</li>`).join('');
    // where the coins came from (base, tidy bench, hard level, café perks): a low payout explains itself
    const pay = info.pay ? `<div class="paybd">${info.pay}</div>` : '';
    const hilite = info.chain
      ? `<div class="hilite"><div class="chainclip"><canvas width="240" height="300" aria-hidden="true"></canvas></div><div class="hcol">${rrow}${pay}${ach ? `<ul class="ach">${ach}</ul>` : ''}</div></div>`
      : `${pay}${ach ? `<ul class="ach inline">${ach}</ul>` : ''}`;
    const cafeBar = cn ? `<div class="cafebar"><span class="ticon">${cimg(cn.sprite)}</span><div class="cbtxt"><small>${t('cafeNext', { name: cn.name })}</small><div class="bar"><i style="width:${Math.min(100, Math.round((cn.stars / cn.cost) * 100))}%"></i><em>${img('ui_star.webp')}${Math.min(cn.stars, cn.cost)}/${cn.cost}</em></div>${resChip}</div></div>` : '';
    root.insertAdjacentHTML('beforeend', `
<div class="backdrop" id="modal"><div class="card teal win ${info.chain ? 'withclip' : (info.ach || []).length || info.pay ? 'tight' : ''}">
  ${peek}
  <h2 class="title yellow">${t(info.title)}</h2>
  ${info.show ? `<div class="purr showtag">${ribbonSvg}${t('showBoard')}</div>` : `<div class="stars n${info.stars}">${stars}</div>`}
  ${info.chain ? '' : rrow}
  ${hilite}
  ${cafeBar}
  ${info.purr ? `<div class="purr">${info.purr}</div>` : ''}
  ${info.canBuild ? `<button class="btn" data-act="cafe">${t('build')}</button>` : `<button class="btn" data-act="next">${info.show ? t('show') : t('next')}</button>`}
  <div class="row"><button class="btn teal sm" data-act="home">${t('home')}</button><button class="btn teal sm" data-act="share">${t('share')}</button></div>
</div></div>`);
    if (info.coins) flyCoins(info.coinsBefore, info.coinsBefore + info.coins);
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
    const opts = info.practice ? [] : [back, scoop, seat, ad].filter(Boolean);
    const offer = info.offer ? `<button class="offercard slimoffer" data-act="starter"><i class="ribbon">${t('bestValue')}</i><span class="oc-t"><b>${t('starterBundle')}</b><small>${t('starterLine', { c: info.offer.coins.toLocaleString(lang()), s: info.offer.scoop })}</small></span><span class="oc-p">${info.offer.price}</span></button>` : '';
    root.insertAdjacentHTML('beforeend', `
<div class="backdrop offerb" id="modal">${tag}<div class="card cream offer slim">
  <h2 class="title navy">${t('offerTitle')}</h2>
  <div class="why">${info.why || t('offerSub')}</div>
  ${info.tip ? `<div class="tip">${info.tip}</div>` : ''}
  ${opts.length ? `<div class="opts n${opts.length}">${opts.join('')}</div>` : ''}
  ${info.practice ? '' : short}
  <div class="row"><button class="btn sm" data-act="retry">${t('retry')}</button><button class="btn teal sm" data-act="home">${t('home')}</button></div>
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
  ${tog('sound', t('sound'))}
  ${tog('haptics', t('haptics'))}
  <div class="setrow"><span>${t('language')}</span><div class="segs">${langs}</div></div>
  ${info.canInstall ? `<div class="setrow"><span>${t('installApp')}</span><button class="seg wide" data-act="install">${t('install')}</button></div>` : ''}
  <div class="setrow"><span>${t('removeAds')}</span>${info.removeAds ? `<b class="owned">${t('owned')}</b>` : `<button class="seg wide" data-act="shop">${t('shop')}</button>`}</div>
  <div class="setrow"><button class="link" data-act="restore">${t('restore')}</button></div>
  <button class="btn teal" data-act="close">${t('close')}</button>
</div></div>`);
  },

  // ---- Cat Café hub (cafe-a layout, B-token buttons) ----
  // info: { stars, level, area (index; AREAS.length = teaser), justBuilt }
  cafe(info) {
    cur = { screen: 'cafe', info };
    const ai = Math.max(0, Math.min(AREAS.length, info.area));
    const area = AREAS[ai];
    const tasks = area ? area.tasks : [];
    const builtN = tasks.filter((x) => isBuilt(x.id)).length;
    let scene;
    if (area) {
      const px = (x) => (area.flip ? 1 - x.x : x.x);
      const nextIds = pending(ai).slice(0, 1).map((x) => x.id); // one dust sheet only, on the next piece
      const decor = tasks.map((x) => {
        const fresh = info.justBuilt === x.id;
        const pos = `left:${px(x) * 100}%;top:${x.y * 100}%;width:${x.w * 100}%;--dh:${x.hue || 0}deg`;
        // the next piece: a faint outline of what goes here and its price (the shell art already has the dust sheet + paint corner)
        if (!isBuilt(x.id)) return nextIds.includes(x.id) ? `<div class="decor tbd" style="${pos}">${cimg(x.sprite)}<i class="tbd-tag">${img('ui_star.webp')}<b>${x.cost || 1}</b></i></div>` : '';
        return `<div class="decor ${fresh ? 'fresh' : ''} ${area.flip ? 'flip' : ''}" style="${pos}">${cimg(x.sprite)}${fresh ? '<i class="puff p1"></i><i class="puff p2"></i><i class="puff p3"></i><i class="spk s1"></i><i class="spk s2"></i><i class="spk s3"></i>' : ''}</div>`;
      }).join('');
      // residents lounge on the room's floor spots (full-body sit/loaf art); a tap pets them
      const freshRes = tasks.find((x) => x.id === info.justBuilt && x.resident);
      const guests = guestsFor(ai, info.day || 0).map((g, i) => {
        const lines = g.idle && g.idle.length ? g.idle : [g.line];
        const line = lines[((info.day || 0) + ai * 2 + i) % lines.length];
        const s = g.spot;
        const fresh = freshRes && freshRes.resident.id === g.id;
        return `<button class="guest ${s.pose} ${fresh ? 'fresh' : ''}" data-act="pet" data-id="${g.id}" aria-label="${g.name}" style="left:${s.x * 100}%;top:${s.y * 100}%;width:${s.w * 100}%;--d:${(-i * 3.7).toFixed(1)}s">${cimg(`res_${g.id}_${s.pose}.webp`, 'gimg')}<i class="gbub ${s.x > 0.62 ? 'l' : s.x < 0.3 ? 'r' : ''}">${loc(line)}</i></button>`;
      }).join('');
      // renovation clutter (paint, tools) fades out task by task and is gone once the area is done
      const cl = area.clutter && clutterLevel(ai);
      const clutter = cl ? `<div class="decor clutter" style="left:${area.clutter.x * 100}%;top:${area.clutter.y * 100}%;width:${area.clutter.w * 100}%;opacity:${(0.25 + 0.75 * cl).toFixed(2)}">${cimg(area.clutter.sprite)}</div>` : '';
      const justTask = tasks.find((x) => x.id === info.justBuilt);
      // Cat Show rosettes won so far hang on the wall of every room (one per theme, in its colour)
      const ros = (info.rosettes || []).length ? `<div class="rosettes">${info.rosettes.map((r) => ribbonSvg.replace('class="rib"', `class="rib" style="--rc:${r.color}" aria-label="${r.name}"`)).join('')}</div>` : '';
      scene = `${cimg(area.shell, 'shell' + (area.flip ? ' flip' : ''))}${patchHtml(area, builtN, !!justTask && builtN === PATCH_AT)}${clutter}${decor}${ros}${guests}`;
    } else {
      scene = `${TEASER ? cimg(TEASER.image, 'shell teaser') : '<div class="shell ph"></div>'}<div class="soon"><b>${t('comingSoon')}</b><span>${t('teaserSub')}</span></div>`;
    }
    const nr = nextResident();
    const bubble = nr ? `<div class="nextres"><div class="bub">${t('nextResident')}</div><div class="face">${cimg('res_' + nr.id + '.webp')}</div></div>` : '';

    const left = pending(ai);
    const rows = area
      ? left.slice(0, 3).map((x) => {
          const ok = canAfford(x);
          const sub = x.resident ? `<small>${cimg('res_' + x.resident.id + '.webp', 'mini-res')}${t('movesIn', { name: x.resident.name })}</small>` : '';
          return `<button class="trow ${ok ? 'ok' : 'dim'}" data-act="build" data-id="${x.id}">
  <span class="ticon">${cimg(x.sprite)}</span>
  <span class="tname"><b>${loc(x.name)}</b>${sub}</span>
  <span class="cost">${img('ui_star.webp')}<b>${x.cost || 1}</b></span>
</button>`;
        }).join('')
      : '';
    // every area done: Captain's rooftop parties, a project that never runs out (stars in, coins + a Scoop out)
    const pt = info.party;
    const partyRow = pt ? `<button class="trow ${pt.ok ? 'ok' : 'dim'}" data-act="party">
  <span class="ticon">${cimg('cafe_rooftop_grill.webp')}</span>
  <span class="tname"><b>${t('partyTask', { n: pt.n + 1 })}</b><small>${img('ui_coin.webp', 'mini-res')}${t('partySub', { c: pt.coins })}</small></span>
  <span class="cost">${img('ui_star.webp')}<b>${pt.cost}</b></span>
</button>` : '';
    const body = pt && !left.length ? partyRow : !area ? `<div class="trow empty"><b>${t('comingSoon')}</b></div>` : left.length ? rows : `<div class="trow empty"><b>${t('areaDone')}</b></div>`;
    const prog = pt && !left.length ? t('partyProg', { n: pt.n }) : area ? t('areaProg', { a: loc(area.name), done: builtN, all: tasks.length }) : t('comingSoon');
    const arrow = (d, dis) => `<button class="arr ${dis ? 'dis' : ''}" data-act="cafearea" data-d="${d}" aria-label="${d < 0 ? t('back') : t('next')}"><svg viewBox="0 0 24 24"><path d="${d < 0 ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
    mount(`
<div id="cafe" class="screen on">
  <div class="cafe-bg"></div>
  <div class="cafe-top">
    <button class="round" data-act="settings" aria-label="${t('settings')}">${gearSvg}</button>
    <div class="tr">${livesPill(info.lives)}<button class="pill sm" data-act="shop">${img('ui_coin.webp')}<b id="coins">${info.coins}</b></button><div class="pill sm cstar">${img('ui_star.webp')}<b id="cstars">${info.stars}</b></div></div>
  </div>
  <div class="rail">
    <button class="rbtn" data-act="daily">${rbRound(img('ui_hint.webp'))}<span>${t('daily')}</span></button>
    <button class="rbtn" data-act="quests">${rbRound(checkSvg0 + dot(info.dots && info.dots.quests))}<span>${t('tasks')}</span></button>
    <button class="rbtn" data-act="residents">${rbRound(pawSvg)}<span>${t('residents')}</span></button>
    <button class="rbtn" data-act="show">${rbRound(ribbonSvg + dot(info.dots && info.dots.show))}<span>${t('show')}</span></button>
    <button class="rbtn" data-act="shop">${rbRound(img('ui_coin.webp'))}<span>${t('shop')}</span>${info.offer ? `<i class="otag">${t('offerBadge')}</i>` : ''}</button>
  </div>
  <div class="scene" style="--sh:${area && area.hue ? area.hue : 0}deg"><div class="sign">${t('cafe')}</div>${scene}${bubble}</div>
  <div class="areanav">${arrow(-1, ai <= 0)}<span>${prog}</span>${arrow(1, ai >= AREAS.length)}</div>
  <div class="tasks">${body}</div>
  <button class="btn play cafe-play" data-act="play"><b>${t('play')}</b><small>${t('level', { n: info.level })}</small></button>
</div>`);
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
      return `<div class="love">${hearts}</div>${btn}`;
    };
    const owned = RESIDENTS.filter((r) => isBuilt(r.task.id)).length;
    const card = (r) => {
      const has = isBuilt(r.task.id);
      const area = AREAS[r.task.area];
      return `<div class="rcard ${has ? '' : 'locked'}">
  <div class="rp">${cimg('res_' + r.id + '.webp')}${has ? '' : lockSvg}</div>
  <b class="rn">${has ? r.name : '???'}</b>
  <span class="rperk">${has ? perkText(r) : t('resUnlock', { task: loc(r.task.name) })}</span>
  ${has ? loveRow(r) : ''}
  ${!has && area ? `<small>${loc(area.name)}</small>` : ''}
</div>`;
    };
    mount(`
<div id="resi" class="screen on">
  <div class="cafe-bg"></div>
  <div class="hud-top"><button class="round" data-act="cafeback" aria-label="${t('back')}"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><h2 class="title yellow sm">${t('residents')}</h2></div>
  <div class="resi-sub">${t('resSub', { a: owned, b: RESIDENTS.length })}</div>
  <div class="rgrid">${RESIDENTS.map(card).join('')}</div>
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
    const noads = `<div class="noadrow">${noAdSvg}<b>${t('noAds')}</b>${info.noAds ? `<span class="own">${checkSvg}${t('owned')}</span>` : buy('noads')}</div>`;
    sheet('shop', 'shop', t('shop'), `${hero}${noads}
<h4 class="sec">${t('coinPacks')}</h4>
<div class="packs g3">${coinPack('coins500', 500, 2)}${coinPack('coins1500', 1500, 3)}${coinPack('coins4000', 4000, 4)}</div>
<h4 class="sec">${t('boosterPacks')}</h4>
<div class="packs g2">${scoopPack('scoop3', 3)}${scoopPack('scoop10', 10)}</div>
<button class="link" data-act="restore">${t('restore')}</button>`);
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
      return `<div class="day ${done ? 'done' : ''} ${today ? 'today' : ''} ${i === 6 ? 'last' : ''}"><small>${t('dayN', { n: i + 1 })}</small>${done ? `<span class="tick">${checkSvg}</span>` : chips(r, 'col')}</div>`;
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

  // weekly Cat Show: 10-step ribbon track, theme from data
  show(info) {
    const cells = info.steps.map((x, i) => `<div class="step ${x.state}"><small>${i + 1}</small>${chips(x.reward, 'col')}<span class="need">${ribbonSvg}${x.need}</span>${x.state === 'claimed' ? `<span class="tick">${checkSvg}</span>` : ''}</div>`).join('');
    const pct = Math.min(100, Math.round((info.ribbons / info.max) * 100));
    // the week's Show board: the same board for everyone, free unlimited practice, scored by the most seats used
    const sb = info.board;
    const sbLine = sb ? (sb.gold ? `<small class="gold">${t('showGold')}</small>` : `<small>${t('showGoal', { m: sb.mark, a: sb.clearRibbons, b: sb.markRibbons })}</small>`) : '';
    const board = sb ? `<div class="showboard"><div class="sbt"><b>${t('showBoard')}</b>${sbLine}<small>${sb.best >= 0 ? t('showYourBest', { n: sb.best }) : t('showFreePlay')}</small></div><button class="btn green sm" data-act="showplay">${t('play')}</button></div>` : '';
    sheet('show', 'show', t('show'), `
<div class="theme" style="--th:${info.color}"><b>${info.name}</b><span>${t('showEnds', { t: fmtLong(info.endsMs) })}</span></div>
<div class="showsub">${t('showSub')}</div>
<div class="bar big"><i style="width:${pct}%"></i><em>${ribbonSvg}${t('showRibbons', { a: info.ribbons, b: info.max })}</em></div>
${info.ready ? `<button class="btn green sm" data-act="showclaim">${t('claimAll')}</button>` : ''}
${board}
<div class="steps">${cells}</div>
<div class="decnote">${ribbonSvg.replace('class="rib"', `class="rib" style="fill:${info.color}"`)}<span>${t('exclusiveDecor', { name: info.name })}</span></div>`);
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
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
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
