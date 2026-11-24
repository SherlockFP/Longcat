// R10 shop: a store sheet with four tabs. Offers (deal of the day, the one-time Starter pack, rewarded-ad gifts),
// Coins (bundles; real money stays the kit/iap.js stub and shows "Coming soon" without a store backend), Boosters
// (Hint, Undo, Scoop, Extra Cushion packs for coins) and Cosmetics (cat outfits, carrier skins, room themes, with a live
// preview). Replaces ui.shop; its taps are the actions below (main.js merges them into its action table).
import { t, lang } from '../i18n.js';
import { LOOKS } from '../../data/shop.js';
import { assetUrl, COLOR_PAL } from '../game/breeds.js';
import { save } from '../kit/save.js';
import * as iap from '../kit/iap.js';
import { ads } from '../kit/ads.js';
import { now } from '../kit/clock.js';
import { track } from '../kit/analytics.js';
import { audio } from '../kit/audio.js';
import { haptics } from '../kit/haptics.js';
import { dayOf, dayStart } from '../game/econ.js';
import * as S from '../game/shop.js';
import { IMG } from '../game/assets.js';
import { drawHead } from '../game/render.js';
import { drawHat, drawCarrierSkin, drawSkinCat, lookOf, roomImage } from '../game/shop-look.js';
import { ui, openSheet } from './ui.js';
import './shop.css';

const img = (name, cls = '') => `<img class="${cls}" src="${assetUrl(name)}" alt="" draggable="false">`;
const r7 = (name, cls = '') => img(`r7/${name}.webp`, cls);
const coin = (cls = 'ci') => r7('hud_coin', cls);
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const day = () => dayOf(now());
const toMidnight = () => Math.max(0, dayStart(day() + 1) - now());
const fmt = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)); const h = Math.floor(m / 60); return h ? `${h}${t('hShort')} ${m % 60}${t('mShort')}` : `${m}${t('mShort')}`; };
const num = (n) => n.toLocaleString(lang());
const ICON = { hint: 'btn_hint', undo: 'btn_undo', scoop: 'btn_scoop', cushion: 'cushion' };
const NAME = { hint: 'hint', undo: 'undo', scoop: 'scoop', cushion: 'shCushion' };
const DESC = { hint: 'shHintD', undo: 'shUndoD', scoop: 'shScoopD', cushion: 'shCushD' };
const CAT = { hat: 'shCatHat', skin: 'shCatSkin', car: 'shCatCar', room: 'shCatRoom' };
const TABS = [['offers', 'shTabOffers'], ['coins', 'shTabCoins'], ['boosters', 'shTabBoost'], ['style', 'shTabStyle']];
const noAdSvg = '<svg class="s4noad" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="#fff6e5" stroke="#e5484d" stroke-width="5"/><rect x="13" y="16" width="22" height="16" rx="4" fill="#26334A"/><path d="M21.5 20.2v7.6l6.4-3.8z" fill="#fff6e5"/><path d="M10.5 37.5 37.5 10.5" stroke="#e5484d" stroke-width="5" stroke-linecap="round"/></svg>';

// local view state
const V = { tab: 'offers', cat: 'hat', sel: {} };
let timer = 0;

const chip = (k, n) => `<span class="s4chip">${k === 'coins' ? coin() : r7(ICON[k])}<b>${k === 'coins' ? num(n) : '×' + n}</b></span>`;
const coinBtn = (price, act, data = '', dim = false) => `<button class="btn green s4buy ${dim ? 'dim' : ''}" data-act="${act}" ${data}>${coin()}<b>${num(price)}</b></button>`;
// a real-money price: bought through kit/iap.js where a store backend exists, else "Coming soon"
const cashBtn = (id) => (iap.available()
  ? `<button class="btn green s4buy cash" data-act="buy" data-id="${id}"><b>${iap.PRODUCTS[id].price}</b></button>`
  : `<button class="s4soon" data-act="shopsoon" data-id="${id}">${t('shSoon')}</button>`);

// ---- Offers ----
function offersPage() {
  const d = save.data;
  const dy = day();
  const x = S.dealOf(dy);
  const got = S.dealBought(d, dy);
  const deal = `<div class="s4deal ${got ? 'got' : ''}">
  <i class="s4stk">${t('shOff', { n: x.off })}</i>
  <div class="s4art">${r7('shop_crate')}</div>
  <div class="s4dt"><small class="s4kick">${t('shDeal')}</small><div class="s4chips">${Object.entries(x.items).map(([k, n]) => chip(k, n)).join('')}</div>
  <small class="s4tmr" data-tmr="${got ? 'got' : 'deal'}">${got ? t('shDealGot', { t: fmt(toMidnight()) }) : t('shDealEnds', { t: fmt(toMidnight()) })}</small></div>
  <div class="s4dp">${got ? `<span class="s4done">✓</span>` : `<s>${num(x.was)}</s>${coinBtn(x.price, 'shopdeal', '', d.coins < x.price)}`}</div>
</div>`;
  const own = d.iap.owned;
  const P = iap.PRODUCTS.starter;
  const starter = iap.available() && !own.starter && !own.noads ? `<div class="s4starter">
  <i class="s4rib">${t('shStarterOnce')}</i>
  <div class="s4art">${r7('shop_gift')}</div>
  <div class="s4dt"><b class="s4h">${t('starterBundle')}</b><div class="s4chips">${chip('coins', P.coins)}${chip('scoop', P.scoop)}<span class="s4chip">${noAdSvg}<b>${t('noAds')}</b></span></div></div>
  <div class="s4dp">${cashBtn('starter')}</div>
</div>` : '';
  // R13: Fast paws (kit/iap.js fastpaws) wakes every sleepy basket on the map (src/game/basket.js)
  const paws = `<div class="s4noadrow s4paws">${r7('cat_curl_purple', 's4pi')}<div class="s4dt"><b class="s4h">${t('fpName')}</b><small>${t('fpSub')}</small></div>${cashBtn('fastpaws')}</div>`;
  let free = '';
  if (ads.available()) {
    const gift = (g) => {
      const left = S.adLeft(d, g.id, dy);
      const what = g.id === 'coins' ? t('shAdCoins', { n: g.give.coins }) : t('shAdHint');
      return `<div class="s4gift ${left ? '' : 'out'}"><i class="s4free">${t('shFreeBadge')}</i>${r7('shop_tv', 's4tv')}<div class="s4gw">${g.id === 'coins' ? coin() : r7('btn_hint')}<b>${what}</b></div>
<small ${left ? '' : 'data-tmr="ad"'}>${left ? t('shLeft', { n: left }) : t('shBack', { t: fmt(toMidnight()) })}</small>
${left ? `<button class="btn teal s4watch" data-act="shopad" data-id="${g.id}">▶ ${t('shWatch')}</button>` : ''}</div>`;
    };
    free = `<div class="s4sec">${t('shFree')}</div><div class="s4gifts">${S.AD_GIFTS.map(gift).join('')}</div>`;
  }
  return deal + starter + paws + free;
}

// ---- Coins ----
function coinsPage() {
  const P = iap.PRODUCTS;
  const rate = P.coins500.coins / parseFloat(P.coins500.price.slice(1));
  const bonus = (id) => Math.round((P[id].coins / parseFloat(P[id].price.slice(1)) / rate - 1) * 100);
  const card = (id, art, name, tag = '', cls = '') => {
    const b = bonus(id);
    return `<div class="s4bundle ${cls}">${tag ? `<i class="s4tag">${tag}</i>` : ''}<div class="s4art">${r7(art)}</div><small>${t(name)}</small><b class="s4amt">${coin()}${num(P[id].coins)}</b>${b > 0 ? `<small class="s4bonus">${t('shBonus', { n: b })}</small>` : '<small class="s4bonus none"></small>'}${cashBtn(id)}</div>`;
  };
  const noads = iap.noAds() ? '' : `<div class="s4noadrow">${noAdSvg}<div class="s4dt"><b class="s4h">${t('noAds')}</b><small>${t('shNoAdsSub')}</small></div>${cashBtn('noads')}</div>`;
  return `<div class="s4bundles">${card('coins500', 'shop_pouch', 'shPouch')}${card('coins1500', 'shop_sack', 'shSack', t('shPopular'))}${card('coins4000', 'shop_chest', 'shChest', t('shBest'), 'best')}</div>
${noads}${iap.available() ? `<button class="link" data-act="restore">${t('restore')}</button>` : ''}`;
}

// ---- Boosters ----
function boostersPage() {
  const d = save.data;
  const row = (k) => `<div class="s4boost">${r7(ICON[k], 's4bi')}<div class="s4dt"><b class="s4h">${t(NAME[k])}</b><small>${t(DESC[k])}</small><small class="s4have">${t('shHave', { n: S.have(d, k) })}</small></div>
<div class="s4packs">${S.PACKS.map((p, i) => { const c = S.packPrice(k, p); return `<button class="s4pk ${d.coins < c ? 'dim' : ''}" data-act="shoppack" data-k="${k}" data-i="${i}"><span class="s4n">×${p.n}</span><span class="s4c">${coin()}${num(c)}</span>${i ? `<i class="s4pct">${t('shOff', { n: p.off })}</i>` : ''}</button>`; }).join('')}</div></div>`;
  return S.BOOSTERS.map(row).join('');
}

// ---- Cosmetics ----
const roomLook = (id) => LOOKS[lookOf(null, id)];

function stylePage() {
  const d = save.data;
  S.ensure(d);
  const items = S.COSMETICS.filter((x) => x.kind === V.cat);
  const sel = S.item(V.sel[V.cat]) && S.item(V.sel[V.cat]).kind === V.cat ? V.sel[V.cat] : S.equipped(d, V.cat);
  V.sel[V.cat] = sel;
  const cats = S.KINDS.map((k) => {
    const all = S.COSMETICS.filter((x) => x.kind === k);
    return `<button class="s4cat ${V.cat === k ? 'on' : ''}" data-act="shopcat" data-k="${k}"><b>${t(CAT[k])}</b><small>${t('shOwnedN', { a: all.filter((x) => S.owns(d, x.id)).length, b: all.length })}</small></button>`;
  }).join('');
  const tile = (x) => {
    const own = S.owns(d, x.id);
    const on = S.equipped(d, x.kind) === x.id;
    const look = x.kind === 'room' && roomLook(x.id);
    const thumb = look
      ? `<div class="s4thumb" data-room="${look.room}">${r7(roomImage(look.room) ? look.room : LOOKS.garden.room, 's4room')}<i class="s4rug" style="background:${look.rug};border-color:${look.stitch}"></i></div>`
      : `<canvas class="s4cv" data-prev="${x.id}"></canvas>`;
    const foot = on ? `<span class="s4on">${t('shInUse')}</span>` : own ? `<span class="s4own">✓</span>` : `<span class="s4price">${x.iap ? t('shPremium') : coin() + num(x.cost)}</span>`;
    return `<button class="s4item ${sel === x.id ? 'sel' : ''} ${on ? 'eq' : ''}" data-act="shopsel" data-id="${x.id}" aria-label="${x.name[lang()] || x.name.en}">${thumb}<small class="s4nm">${x.name[lang()] || x.name.en}</small>${foot}</button>`;
  };
  const it = S.item(sel);
  const own = S.owns(d, sel);
  const on = S.equipped(d, it.kind) === sel;
  const act = on ? `<button class="btn teal s4act" disabled>${t('shInUse')}</button>`
    : own ? `<button class="btn green s4act" data-act="shopcos" data-id="${sel}">${t('shUse')}</button>`
      : it.iap ? cashBtn(it.iap)
      : `<button class="btn green s4act ${d.coins < it.cost ? 'dim' : ''}" data-act="shopcos" data-id="${sel}">${coin()}<b>${num(it.cost)}</b></button>`;
  return `<div class="s4stage"><canvas class="s4scene" data-scene="1"></canvas><i class="s4pv">${t('shPreview')}</i><b class="s4sname">${it.name[lang()] || it.name.en}</b></div>
<div class="s4cats">${cats}</div>
<div class="s4grid k-${V.cat}">${items.map(tile).join('')}</div>
${act}`;
}

// ---- previews (canvas): the real board drawing code, at the tile's size ----
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
function carrierAt(ctx, x, y, cw, skin, color = 1) {
  const art = IMG[`r7/carrier_${COLOR_PAL[color].name}`];
  if (!art) return;
  const ch = cw * (art.height / art.width);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(60,30,10,0.22)';
  ctx.beginPath(); ctx.ellipse(-cw * 0.04, -ch * 0.03, cw * 0.4, ch * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(art, -cw / 2, -ch, cw, ch);
  drawCarrierSkin(ctx, cw, ch, skin);
  ctx.restore();
}
const headAt = (ctx, x, y, size, hat, color = 0, v = 0) => { drawHead(ctx, color, x, y, 0, size, 1, { v }); drawHat(ctx, x, y, 0, size, 1, hat); };
function rugAt(ctx, x, y, size, look) {
  ctx.fillStyle = look.rug;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, size, size, size * 0.12);
  else ctx.rect(x, y, size, size);
  ctx.fill();
  ctx.strokeStyle = look.stitch;
  ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
  const tile = IMG['r7/tile_ivory'];
  const pad = size * 0.11, cell = (size - 2 * pad) / 2;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const tx = x + pad + i * cell, ty = y + pad + j * cell;
    if (tile) ctx.drawImage(tile, tx, ty, cell - 1, cell - 1);
    else { ctx.fillStyle = '#FFF0D3'; ctx.fillRect(tx, ty, cell - 1, cell - 1); }
  }
  if (look.tile) { ctx.fillStyle = look.tile; ctx.fillRect(x + pad, y + pad, 2 * cell - 1, 2 * cell - 1); }
}
function drawPreviews() {
  const root = document.querySelector('#sheet .shop4');
  if (!root) return;
  for (const thumb of root.querySelectorAll('[data-room]')) {
    const img = thumb.querySelector('img');
    const room = roomImage(thumb.dataset.room, function () { if (img.isConnected) img.src = this.src; });
    if (room && img.src !== room.src) img.src = room.src;
  }
  for (const cv of root.querySelectorAll('canvas[data-prev]')) {
    const it = S.item(cv.dataset.prev);
    const { ctx, w, h } = fitCanvas(cv);
    if (it.kind === 'hat') headAt(ctx, w / 2, h * 0.6, Math.min(w, h) * 0.62, it.id, 0, 0);
    else if (it.kind === 'skin') drawSkinCat(ctx, w * 0.76, h * 0.55, Math.min(w * 0.48, h * 0.7), it.id, 'hat_none');
    else carrierAt(ctx, w / 2, h * 0.92, Math.min(w, h * 1.2) * 0.9, it.id, 1);
  }
  const sc = root.querySelector('canvas[data-scene]');
  if (sc) drawScene(sc);
}
function drawScene(sc) {
  if (!sc.isConnected) return;
  const { ctx, w, h } = fitCanvas(sc);
  const pick = (k) => (V.cat === k ? V.sel[k] : S.equipped(save.data, k));
  const look = roomLook(pick('room'));
  const art = roomImage(look.room, () => drawScene(sc));
  const room = art || IMG['r7/bg_play_room'];
  if (room) { // cover-fit, the window corner and the top of the table in view
    const s = Math.max(w / room.width, (h * 1.9) / room.height);
    ctx.drawImage(room, w - room.width * s, 0, room.width * s, room.height * s);
  }
  if (!art && look.wash) { ctx.fillStyle = look.wash; ctx.fillRect(0, 0, w, h); }
  const rs = Math.min(h * 0.56, w * 0.24);
  rugAt(ctx, w * 0.25 - rs / 2, h * 0.45 - rs / 2, rs, look);
  const hs = Math.min(h * 0.46, w * 0.17);
  drawSkinCat(ctx, w * 0.56, h * 0.7, hs, pick('skin'), pick('hat'));
  carrierAt(ctx, w * 0.78, h * 0.88, Math.min(h * 0.78, w * 0.36), pick('car'), 0);
}

// ---- the sheet ----
function render() {
  const old = document.querySelector('#sheet .shop4 .s4pg');
  const keep = old && old.dataset.pg === V.tab ? old.scrollTop : 0;
  const pages = { offers: offersPage, coins: coinsPage, boosters: boostersPage, style: stylePage };
  const tabs = TABS.map(([k, label]) => `<button class="stab ${V.tab === k ? 'on' : ''}" data-act="stab4" data-tab="${k}">${t(label)}</button>`).join('');
  openSheet('shop', 'shop shop4', t('shop'), `<div class="stabs s4tabs">${tabs}</div><div class="s4pg scrollarea pg-${V.tab}" data-pg="${V.tab}">${pages[V.tab]()}</div>`);
  const panel = document.querySelector('#sheet .shop4');
  if (!panel) return;
  panel.dataset.tab = V.tab;
  panel.querySelector('.phead').insertAdjacentHTML('beforeend', `<div class="s4bal">${coin()}<b id="s4coins">${num(save.data.coins)}</b></div>`);
  const pg = panel.querySelector('.s4pg');
  if (keep) pg.scrollTop = keep;
  drawPreviews();
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}
let lastDay = -1;
function tick() {
  if (!document.querySelector('#sheet .shop4')) { clearInterval(timer); return; }
  const dy = day();
  if (lastDay !== -1 && dy !== lastDay) { lastDay = dy; render(); return; } // midnight: a new deal, the gifts refill
  lastDay = dy;
  for (const el of document.querySelectorAll('#sheet .shop4 [data-tmr]')) {
    const k = el.dataset.tmr;
    el.textContent = k === 'deal' ? t('shDealEnds', { t: fmt(toMidnight()) }) : k === 'got' ? t('shDealGot', { t: fmt(toMidnight()) }) : t('shBack', { t: fmt(toMidnight()) });
  }
}

ui.shop = () => { lastDay = day(); render(); };

// a short pop on the thing just bought (skipped with reduced motion)
function pop(sel) {
  if (reduced()) return;
  const el = document.querySelector(sel);
  if (el && el.animate) el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
}

// main.js: Object.assign(actions, shopActions(syncCoins)); sync refreshes the HUD coins and booster counts
export function shopActions(sync) {
  let busy = false;
  const paid = (msg, sel) => { save.commit(); audio.ui('coin'); haptics.success(); sync(); if (document.querySelector('#sheet .shop4')) render(); ui.toast(msg); if (sel) pop(sel); };
  return {
    stab4({ tab }) { if (!TABS.some(([k]) => k === tab)) return; V.tab = tab; render(); track('shop_tab', { tab }); },
    shopcat({ k }) { if (!S.KINDS.includes(k)) return; V.cat = k; render(); },
    shopsel({ id }) { const it = S.item(id); if (!it) return; V.cat = it.kind; V.sel[it.kind] = id; render(); },
    shopsoon({ id }) { ui.toast(t(iap.PRODUCTS[id]?.cos ? 'shPremiumSoon' : 'shSoonToast')); },
    shopdeal() {
      const x = S.dealBuy(save.data, day());
      if (!x) return ui.toast(t('noCoins'));
      track('shop_deal', { id: x.id, price: x.price });
      paid(t('shDealToast'), '.s4deal');
    },
    shoppack({ k, i }) {
      const c = S.buyPack(save.data, k, +i);
      if (!c) return ui.toast(t('noCoins'));
      const n = S.PACKS[+i].n;
      track('shop_pack', { k, n, coins: c });
      paid(t('shGot', { n, name: t(NAME[k]) }), `.s4pk[data-k="${k}"][data-i="${i}"]`);
    },
    shopcos({ id }) {
      const d = save.data;
      if (S.owns(d, id)) { if (S.equip(d, id)) { save.commit(); render(); } return; }
      const c = S.cosBuy(d, id);
      if (!c) return ui.toast(t('noCoins'));
      track('shop_cosmetic', { id, coins: c });
      paid(t('shYours'), '.s4stage');
    },
    async shopad({ id }) {
      if (busy || !ads.available() || S.adLeft(save.data, id, day()) <= 0) return;
      busy = true;
      try {
        if (!(await ads.rewarded('shop_' + id))) { ui.toast(t('adNone')); return; }
        const g = S.adClaim(save.data, id, day());
        if (!g) return;
        track('shop_ad_gift', { id });
        paid(id === 'coins' ? t('shAdCoins', { n: g.coins }) : t('shAdHint'));
      } finally { busy = false; }
    },
  };
}
