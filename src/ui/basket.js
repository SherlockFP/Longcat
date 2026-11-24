// Timed baskets view (rules: src/game/basket.js, strings: src/i18n-basket.js): the 3 basket slots on the map's left
// rail (a tap starts a sleeping basket, opens the speed-up sheet of a waking one, opens an awake one with the boss lane's
// chest opening), the speed-up sheet (coins, a rewarded ad, Fast paws in the shop), the win card note (a basket dropped /
// slots full / the first basket) and the start + welcome gifts (the chest opening, its coin shower into the counter).
// Hooks (from src/ui/boss.js): init(ctx), onWin(n) on a first campaign clear, winCard(card, r), rail(m) per map render.
import { t } from '../i18n.js';
import '../i18n-basket.js';
import { assetUrl } from '../game/breeds.js';
import { save } from '../kit/save.js';
import { now } from '../kit/clock.js';
import { ads } from '../kit/ads.js';
import { audio } from '../kit/audio.js';
import { haptics } from '../kit/haptics.js';
import { track } from '../kit/analytics.js';
import * as K from '../game/basket.js';
import { showChest, chestBusy } from './boss.js';
import { ui, openSheet } from './ui.js';
import './basket.css';

let ctx = null;
let open = -1; // the slot the speed-up sheet is about
let adBusy = false;
const img = (n, cls = '') => `<img class="${cls}" src="${assetUrl('r7/' + n + '.webp')}" alt="" draggable="false">`;
const CAT = { common: 'cat_curl_orange', rare: 'cat_curl_blue', epic: 'cat_curl_purple' };
const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return s + t('secShort');
  const m = Math.ceil(s / 60);
  return m < 60 ? m + t('mShort') : `${Math.floor(m / 60)}${t('hShort')} ${m % 60}${t('mShort')}`;
};
const name = (r) => t('bkT_' + r);

export function init(c) {
  ctx = c;
  setInterval(tick, 1000);
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-bk]');
    if (!el) return;
    e.stopPropagation();
    const k = el.dataset.bk;
    if (k === 'coins') return buy();
    if (k === 'ad') return watch();
    tap(+k);
  }, true);
  if (import.meta.env.DEV) window.__bask = { st: () => JSON.parse(JSON.stringify(K.state(save.data))), give: (r = 'common', end = 0) => { K.state(save.data).s.push({ r, end }); save.commit(); } };
}

// ---- a win: the drop and the start gift (main's onWin has not moved the level on yet) ----
export function onWin(n) {
  const d = save.data;
  const drop = K.onClear(d, n);
  const gift = K.startGift(d, n);
  if (drop || gift) save.commit();
  if (drop) track('basket_drop', { n, r: drop });
  return { drop, gift };
}
// the win card: one line about the baskets, then the start gift opens over it (L5's chest: boss.js opens its queue)
export function winCard(card, r) {
  if (!r) return;
  const line = r.drop === 'full' ? t('bkFull') : r.drop ? t('bkDrop', { tier: name(r.drop) }) : r.gift && r.gift.basket ? t('bkFirst') : '';
  if (line) card.insertAdjacentHTML('beforeend', `<p class="bknote${r.drop === 'full' ? ' full' : ''}" role="status">${img(CAT[r.drop] || CAT.common)}<b>${line}</b></p>`);
  if (r.gift && r.gift.e) setTimeout(() => { if (!chestBusy()) { audio.ui('sparkle'); showChest(r.gift, save.data.coins - r.gift.loot.coins, sync); } }, 700); // main's onWin paid the level since
}
const sync = () => { if (ctx.sync) ctx.sync(); if (ctx.hubRedraw && document.querySelector('#cafe .hubmap')) ctx.hubRedraw(); };

// ---- the map rail ----
function slotHtml(x, i, tn) {
  const st = K.status(x, tn);
  const txt = st === 'ready' ? t('bkOpen') : st === 'wake' ? fmt(K.left(x, tn)) : K.waking(save.data, tn) >= 0 ? t('bkZzz') : t('bkTap');
  const lab = `${name(x.r)} · ${st === 'ready' ? t('bkReadyA') : st === 'wake' ? t('bkLeftA', { t: fmt(K.left(x, tn)) }) : t('bkSleepA', { t: fmt(K.durMs(x.r)) })}`;
  return `<button class="bkslot t-${x.r} s-${st}" data-bk="${i}" aria-label="${lab}">${x.r !== 'common' ? `<i class="bktag">${t('bkG_' + x.r)}</i>` : ''}${img(CAT[x.r])}<b>${txt}</b></button>`;
}
const sig = (tn) => K.state(save.data).s.map((x) => x.r + K.status(x, tn)).join() + (K.waking(save.data, tn) >= 0);
export function rail(m) {
  const d = save.data;
  if (d.level < K.DROP_FROM) return;
  const tn = now();
  const s = K.state(d).s;
  const empty = Array.from({ length: K.SLOTS - s.length }, () => `<i class="bkslot empty" aria-hidden="true"></i>`).join('');
  m.insertAdjacentHTML('beforeend', `<div class="bkrail" role="group" aria-label="${t('bkRail')}" data-sig="${sig(tn)}">${s.map((x, i) => slotHtml(x, i, tn)).join('')}${empty}</div>`);
  const w = K.welcome(d);
  if (w) { save.commit(); track('gift_welcome'); setTimeout(() => { if (!chestBusy()) { audio.ui('sparkle'); showChest(w, d.coins - w.loot.coins, sync); } }, 600); }
}

function tick() {
  const r = document.querySelector('#cafe .bkrail');
  const sh = open >= 0 && document.querySelector('#sheet .bask');
  if (!r && !sh) { open = -1; return; }
  const tn = now();
  if (r && r.dataset.sig !== sig(tn)) { r.outerHTML = ''; const m = document.querySelector('#cafe .hubmap'); if (m) rail(m); }
  else if (r) r.querySelectorAll('.bkslot.s-wake b').forEach((b) => { const x = K.state(save.data).s[+b.parentNode.dataset.bk]; if (x) b.textContent = fmt(K.left(x, tn)); });
  if (sh) {
    const x = K.state(save.data).s[open];
    if (!x || K.status(x, tn) === 'ready') { ui.hideSheet(); open = -1; return; }
    sh.querySelector('.bkleft').textContent = x.end ? t('bkWakesIn', { t: fmt(K.left(x, tn)) }) : t('bkSleeps', { t: fmt(K.durMs(x.r)) });
    sh.querySelector('.bkprice').textContent = K.price(K.left(x, tn));
  }
}

// ---- taps ----
function tap(i) {
  const d = save.data;
  const tn = now();
  const x = K.state(d).s[i];
  if (!x || chestBusy()) return;
  const st = K.status(x, tn);
  if (st === 'ready') return openBasket(i);
  if (st === 'sleep' && K.start(d, i, tn)) {
    save.commit();
    audio.ui('ok');
    haptics.light();
    track('basket_start', { r: x.r });
    return sync();
  }
  sheet(i);
}
function openBasket(i) {
  const d = save.data;
  const coins0 = d.coins;
  const r = K.take(d, i, now());
  if (!r) return;
  save.commit();
  track('basket_open', { r: r.e.r, coins: r.loot.coins, cos: r.loot.cos || '' });
  showChest(r, coins0, sync);
}
function sheet(i) {
  const d = save.data;
  const tn = now();
  const x = K.state(d).s[i];
  open = i;
  const other = !x.end && K.waking(d, tn) >= 0;
  const L = K.lootOf(d, x);
  const what = [t('bkCoins', { n: L.coins }), t('bkBoost', { n: Object.values(L.items).reduce((a, b) => a + b, 0) }), L.cos ? t('bkLook') : ''].filter(Boolean).join(' · ');
  openSheet('bask', 'bask', name(x.r), `<div class="bkbig t-${x.r}">${img(CAT[x.r])}</div>
<p class="bkleft" role="timer">${x.end ? t('bkWakesIn', { t: fmt(K.left(x, tn)) }) : t('bkSleeps', { t: fmt(K.durMs(x.r)) })}</p>
${other ? `<p class="bksub">${t('bkOther')}</p>` : ''}<p class="bksub">${t('bkHolds', { what })}</p>
<button class="btn green bkbuy" data-bk="coins">${img('hud_coin', 'ci')}<b class="bkprice">${K.price(K.left(x, tn))}</b><span>${t('bkWakeNow')}</span></button>
${x.end && ads.available() ? `<button class="btn teal bkad" data-bk="ad">▶ ${t('bkAdSkip')}</button>` : ''}
<button class="link bkpaws" data-act="shop">${t('bkPaws')}</button>`);
}
function buy() {
  const d = save.data;
  const i = open;
  const c = K.buyWake(d, i, now());
  if (!c) { audio.ui('err'); return ui.toast(t('noCoins')); }
  save.commit();
  track('basket_coins', { coins: c });
  ui.hideSheet();
  open = -1;
  audio.ui('coin');
  if (ctx.sync) ctx.sync();
  openBasket(i);
}
async function watch() {
  const i = open;
  if (adBusy || !ads.available()) return;
  adBusy = true;
  try {
    if (!(await ads.rewarded('basket'))) return ui.toast(t('adNone'));
    if (!K.adSkip(save.data, i, now())) return;
    save.commit();
    track('basket_ad');
    audio.ui('claim');
    ui.toast(t('bkSkipped'));
    tick();
    sync();
  } finally { adBusy = false; }
}
