// Adoption orders UI (logic: src/game/orders.js, data: data/orders.js). Every normal level is an order from a Cat Street
// shopkeeper:
//  - intro at the level start (first attempt): an ordinary order is a one-line speech bubble beside the order row
//    ("Baker Crumb's bakery needs 9 cats!"), so the bench and the top cats stay in view; an Urgent / VIP order keeps the
//    big card with its reason and tag. Neither blocks a tap; both fly into the strip after ~2.4 s or on the first cat.
//  - the strip at the left end of the carrier belt: the keeper in a shop door, n/N cats delivered, a mood (a heart on
//    chains, a sweat drop when the bench is one seat from full). A full carrier drives off the left edge into that door:
//    the count ticks when it gets there.
//  - the delivery ceremony before the win card: the first adoption ever, a finished set, an Urgent / VIP order. The cats
//    hop into the shop, the keeper says thanks, the named cat joins the shop's album set (a full set pays). Tap skips it.
//    Any other first clear credits the adoption at once and names the cat in one row on the win card (R11).
//  - "Adopted cats" tab in the album sheet: one page per shop served; street façades get doorstep cats as they fill up.
// Hooks (main.js): initOrders(game, ctx) once at boot, startOrder(n, board, special) after each level load.
import { t, lang } from '../i18n.js';
import { assetUrl, COLOR_PAL } from '../game/breeds.js';
import { loc } from '../game/cafe.js';
import { save } from '../kit/save.js';
import { trGenitive } from '../kit/dare.js';
import { openSheet } from './ui.js';
import * as O from '../game/orders.js';
import './orders.css';

let G = null; // the Game
let ctx = null; // { cur: () => main's S (n, daily, show, mode) }
let cur = null; // the order on the board: { n, o, board, caps, total, shown }
let strip = null;
let intro = null;
let cer = null; // the running ceremony: { el, go, snap, timer, t0 }
let happyT = 0;
let pendIntro = false; // the intro card waits for a content-lane card (#cmodal) to close
let flushing = false;
let adPage = -1;
const seen = new Set(); // levels whose intro card already showed this session

const url = (n) => assetUrl('r7/' + n + '.webp');
const r7 = (n, cls = '') => `<img class="${cls}" src="${url(n)}" alt="" draggable="false">`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const calm = () => (G ? !!G.calm : false) || reduced();
const head = (color) => `cat_head_${(COLOR_PAL[color] || COLOR_PAL[0]).name}_happy`;
const HEART = '<svg viewBox="0 0 24 24" class="mh"><path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11z"/></svg>';
const DROP = '<svg viewBox="0 0 24 24" class="md"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>';

// "Baker Crumb's bakery needs 9 cats!" / "Fırıncı Crumb'un fırınına 9 kedi lazım!"
export function orderTitle(o, n) {
  const c = O.CUSTOMERS[o.shop];
  const who = lang() === 'tr' ? `${c.title.tr} ${c.gen || trGenitive(o.keeper)}` : `${loc(c.title)} ${o.keeper}'s`;
  return t('ordNeeds', { who, shop: loc(c.to), n });
}
const tagHtml = (o) => (o.kind === 'normal' ? '' : `<i class="ostag ${o.kind}">${r7(o.kind === 'vip' ? 'ord_vip' : 'ord_urgent')}<b>${t(o.kind === 'vip' ? 'ordVip' : 'ordUrgent')}</b></i>`);
const rewardText = (r) => `${r.coins ? `${r7('hud_coin', 'oci')}+${r.coins}` : ''}${r.scoop ? ` +${r.scoop} ${esc(t('scoop'))}` : ''}`;

// ---------------- boot hooks ----------------
export function initOrders(game, c) {
  G = game;
  ctx = c;
  const on = game.on;
  const wrap = (k, fn) => { const prev = on[k]; on[k] = (...a) => { const r = prev ? prev(...a) : undefined; fn(...a); return r; }; };
  wrap('chain', () => { happyT = performance.now() + 2600; });
  wrap('depart', (e) => { if (e && e.chain >= 2) happyT = performance.now() + 2200; });
  wrap('free', () => dismissIntro(false));
  wrap('layout', () => place());
  const win0 = on.win;
  on.win = (stars) => delivered(() => win0(stars));
  // leaving the board early (Home) credits the win at once: no ceremony then, and a running one finishes first
  const flush0 = game.flushWin.bind(game);
  game.flushWin = () => { flushing = true; try { flush0(); } finally { flushing = false; } finishCer(false); };
  // a new board loaded while the ceremony still runs (only scripted: the overlay takes every tap): credit the old win
  // with the old level's identity first
  const load0 = game.load.bind(game);
  game.load = (...a) => { if (cer) finishCer(true); return load0(...a); };

  strip = document.createElement('div');
  strip.id = 'ordstrip';
  strip.className = 'ordstrip';
  strip.hidden = true;
  const ui = document.getElementById('ui');
  document.body.insertBefore(strip, ui); // above the canvas, under every card and sheet
  setInterval(tick, 200);
  window.addEventListener('resize', () => setTimeout(place, 50));

  // the album's "Adopted cats" tab and the street's doorstep cats: decorate whatever the UI just drew
  let raf = 0;
  const scan = () => {
    raf = 0;
    const pb = document.querySelector('#sheet .panel.album:not(.adopt) > .pbody');
    if (pb && !pb.querySelector('.ordtabs')) pb.insertAdjacentHTML('afterbegin', tabsHtml('cards'));
    decorateStreet();
  };
  if (ui) new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); }).observe(ui, { childList: true, subtree: true });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-ord]');
    if (!el) return;
    if (el.dataset.ord === 'adopt') { adPage = -1; adoptedSheet(); }
    else if (el.dataset.ord === 'adpage') { adPage = +el.dataset.p; adoptedSheet(); }
  });
}

// after every level load: an order on a normal level, nothing on the Daily / Cat Show / Rush / dare boards
export function startOrder(n, board, special) {
  dismissIntro(true);
  pendIntro = false;
  if (special || !board || !strip) { cur = null; if (strip) strip.hidden = true; return; }
  const o = O.orderOf(n, board.meta && board.meta.kind);
  const caps = (board.carriers || []).map((c) => c.cap || 3);
  const total = caps.reduce((a, b) => a + b, 0) || board.cats.length;
  cur = { n, o, board, caps, total, shown: 0 };
  happyT = 0;
  strip.className = `ordstrip k-${o.kind}`;
  strip.dataset.mood = '';
  strip.setAttribute('role', 'status');
  // the keeper's door, then one order row under it: the delivered count (the level clock docks on its right end,
  // src/ui/iq.js) and an Urgent / VIP icon on the door (its word is on the intro card)
  strip.innerHTML = `<div class="osdoor" style="--sh:url('${url('street_' + o.shop)}')"><i class="osawn"></i><div class="osface" style="background-image:url('${url('keeper_' + o.shop)}')"></div><i class="osmood">${HEART}${DROP}</i>${tagHtml(o)}</div><b class="oscount">${r7(head(board.carriers && board.carriers.length ? board.carriers[0].color : 0), 'osc')}<span>0/${total}</span></b>`;
  strip.setAttribute('aria-label', `${orderTitle(o, total)} ${t('ordStrip', { a: 0, b: total })}`);
  place();
  // a pack / new-piece card (content lane, #cmodal) goes first: the order card waits for it to close
  const boss = board.meta && board.meta.kind === 'boss'; // boss lane: the boss card (src/ui/boss.js) is this level's intro
  if (!seen.has(n)) { seen.add(n); if (boss) { /* no order card */ } else if (document.getElementById('cmodal')) pendIntro = true; else showIntro(); }
}

function onPlay() {
  if (!cur || !G || G.demo || G.board !== cur.board) return false;
  const S = ctx.cur();
  return S.mode === 'play' && !!document.getElementById('hud');
}

// the strip sits at the left end of the belt, under the Home button and left of the front carrier's open door
function place() {
  if (!G || !strip || !G.cs) return;
  const hdr = G.beltY - G.cs * 1.08;
  const w = clamp(G.slotX(0) - G.cs * 0.62 - 8, 46, 92);
  strip.style.left = '4px';
  strip.style.top = Math.round(hdr + 9) + 'px'; // clear of the Home button
  strip.style.width = Math.round(w) + 'px';
  strip.style.setProperty('--ps', Math.round(Math.min(w - 4, G.cs * 0.74)) + 'px');
  if (intro) placeIntro();
}
// the big card (Urgent / VIP) sits over the bench; the tucked bubble sits right of the order row (count + clock)
function placeIntro() {
  if (!intro.classList.contains('tuck')) { intro.style.top = Math.round(G.benchY - G.bw * 0.5) + 'px'; return; }
  const row = strip && !strip.hidden ? strip.querySelector('.oscount') : null;
  if (!row) return;
  const r = row.getBoundingClientRect();
  const clk = document.querySelector('#iqclk.dock');
  const right = Math.max(r.right, clk && clk.offsetParent ? clk.getBoundingClientRect().right : 0);
  const host = document.body.getBoundingClientRect(); // wide screens: the centred phone column
  const left = right + 7;
  const q = G.queueBox && G.queueBox(); // R14: never over the queue capsule (a colour gate's carrier may wait there)
  const edge = q ? Math.min(host.right, G.canvas.getBoundingClientRect().left + q.x0) : host.right;
  intro.style.left = Math.round(left) + 'px';
  intro.style.maxWidth = Math.max(120, Math.round(edge - left - 6)) + 'px';
  intro.style.top = Math.round(r.top + r.height / 2) + 'px';
}

function tick() {
  if (!strip) return;
  const vis = onPlay();
  strip.hidden = !vis;
  if (!vis) { if (intro && !(cur && G && G.board === cur.board)) dismissIntro(true); return; }
  if (pendIntro && !document.getElementById('cmodal')) { pendIntro = false; showIntro(); }
  if (intro && intro.classList.contains('tuck') && !intro.classList.contains('fly')) placeIntro(); // the clock docks after the load
  const st = G.state;
  if (!st) return;
  // a carrier counts once it has driven off the edge into the shop (still on screen = still on its way)
  const dep = clamp((st.departed || 0) - G.vis.leaving.length, 0, cur.caps.length);
  let del = 0;
  for (let i = 0; i < dep; i++) del += cur.caps[i];
  if (del !== cur.shown) {
    const up = del - cur.shown;
    cur.shown = del;
    const sp = strip.querySelector('.oscount span');
    if (sp) sp.textContent = `${del}/${cur.total}`;
    strip.setAttribute('aria-label', `${orderTitle(cur.o, cur.total)} ${t('ordStrip', { a: del, b: cur.total })}`);
    if (up > 0) bump(up);
  }
  const worried = !st.failed && st.benchUsed > 0 && st.benchUsed >= st.benchSize - 1;
  const mood = performance.now() < happyT || (st.aliveCount === 0 && !st.failed) ? 'happy' : worried ? 'worried' : '';
  if (strip.dataset.mood !== mood) strip.dataset.mood = mood;
}

function bump(n) {
  if (calm()) return;
  strip.classList.remove('bump');
  void strip.offsetWidth;
  strip.classList.add('bump');
  const p = document.createElement('i');
  p.className = 'osplus';
  p.textContent = '+' + n;
  strip.appendChild(p);
  setTimeout(() => p.remove(), 950);
}

// ---------------- intro card ----------------
function showIntro() {
  const o = cur.o;
  const c = O.CUSTOMERS[o.shop];
  const tuck = o.kind === 'normal';
  // R12 (sol-r12-3 pres): on a pair lesson (L9 / L10) the order borrows the teaching card instead of a bubble beside the
  // pair's tag and route, then hands the card back to the seat rule (unless a tap or a cue took it meanwhile)
  const tut = document.getElementById('tut');
  if (tuck && cur.board.meta.cur === 'pair' && tut && !tut.hidden) {
    const rule = tut.textContent, title = orderTitle(o, cur.total);
    tut.textContent = title;
    setTimeout(() => { if (tut.textContent === title) tut.textContent = rule; }, 2600);
    return;
  }
  intro = document.createElement('div');
  intro.className = 'ordintro' + (tuck ? ' tuck' : '') + (calm() ? ' calm' : '');
  const line = o.kind === 'normal' ? loc(c.why[o.why]) : t(o.kind === 'vip' ? 'ordVipLine' : 'ordUrgentLine', { c: o.bonus });
  intro.innerHTML = tuck
    ? `<b>${esc(orderTitle(o, cur.total))}</b>` // the keeper's door is right beside it: no face, no reason line
    : `<div class="oiface" style="background-image:url('${url('keeper_' + o.shop)}')"></div><div class="oitext">${tagHtml(o)}<b>${esc(orderTitle(o, cur.total))}</b><small>${esc(line)}</small></div>`;
  document.body.insertBefore(intro, document.getElementById('ui'));
  place();
  const el = intro;
  el._t = setTimeout(() => { if (intro === el) dismissIntro(); }, cur.n <= 3 ? 1900 : 2600);
}

// the card flies into the strip (or just fades under reduced motion)
function dismissIntro(now = false) {
  const el = intro;
  if (!el) return;
  intro = null;
  clearTimeout(el._t);
  if (now || calm() || !strip || strip.hidden) { el.classList.add('fade'); setTimeout(() => el.remove(), now ? 0 : 260); return; }
  const a = el.getBoundingClientRect();
  const b = strip.getBoundingClientRect();
  el.style.setProperty('--dx', Math.round(b.left + b.width / 2 - (a.left + a.width / 2)) + 'px'); // .tuck has no -50% shift
  el.style.setProperty('--dy', Math.round(b.top + b.height / 3 - (a.top + a.height / 2)) + 'px');
  el.classList.add('fly');
  setTimeout(() => el.remove(), 480);
}

// ---------------- the delivery ceremony ----------------
function delivered(go) {
  const S = ctx.cur();
  const ok = onPlay() && !S.daily && !S.show && S.n === cur.n;
  const first = ok && S.n === save.data.level; // checked before main's onWin moves the level on
  const last = cur && cur.board.carriers && cur.board.carriers.length ? cur.board.carriers[cur.board.carriers.length - 1].color : 0;
  const a = first ? O.adopt(save.data, cur.n, cur.total, last, cur.board.meta && cur.board.meta.kind) : null;
  if (a) save.commit();
  happyT = performance.now() + 4000;
  dismissIntro(true);
  if (!a || flushing) return go();
  // R11: the full ceremony only for the first adoption ever, a finished set and Urgent / VIP orders; an ordinary first
  // clear credits the cat at once and names it on the win card (main.js reads S.quickAdopt)
  if (!(O.totalAdopted(save.data) <= 1 || a.reward || (cur.o.kind !== 'normal' && !(cur.board.meta && cur.board.meta.kind === 'boss')))) { // boss lane: a boss has its own ceremony
    S.quickAdopt = adoptRow(a);
    try { go(); } finally { S.quickAdopt = null; }
    return;
  }
  showCeremony(a, go, { n: S.n, daily: S.daily, show: S.show });
}

// the win card's adoption row: the new cat's face, "Cupcake now lives at the Library", the set's progress
function adoptRow(a) {
  const c = O.CUSTOMERS[a.shop];
  const name = O.CAT_NAMES[a.cat[1]];
  const segs = Array.from({ length: a.set.size }, (_, i) => `<i class="${i < a.set.have ? 'on' : ''}"></i>`).join('');
  return `<div class="ordwin${calm() ? ' calm' : ''}">${r7(head(a.cat[2]), 'owcat')}<span><b>${esc(t('ordAdopted', { name, at: loc(c.at) }))}</b><small>${esc(t('ordSet', { k: a.set.k, a: a.set.have, b: a.set.size }))}<i class="ocsegs">${segs}</i></small></span></div>`;
}

function showCeremony(a, go, snap) {
  const o = cur.o;
  const c = O.CUSTOMERS[o.shop];
  const still = calm();
  const cols = [...new Set((cur.board.carriers || []).map((x) => x.color))].slice(0, 6);
  const hop = cols.map((col, i) => r7(head(col), 'occat').replace('<img ', `<img style="--i:${i}" `)).join('');
  const rec = O.shopRec(save.data, a.shop);
  const step = [...rec.done, ...rec.cur].slice(-a.lively).map((x) => r7(head(x[2]), 'ocstep')).join('');
  const thanks = t(o.kind === 'vip' ? 'ordThanksVip' : o.kind === 'urgent' ? 'ordThanksUrgent' : 'ordThanks', { n: cur.total });
  const name = O.CAT_NAMES[a.cat[1]];
  const segs = Array.from({ length: a.set.size }, (_, i) => `<i class="${i < a.set.have ? 'on' : ''}"></i>`).join('');
  const el = document.createElement('div');
  el.id = 'ordcer';
  el.className = 'ordcer' + (still ? ' calm' : '');
  el.innerHTML = `<div class="occard k-${o.kind}">
  <div class="ochead">${tagHtml(o)}<b>${esc(loc(O.shopName(a.shop)))}</b></div>
  <div class="ocscene">${r7('street_' + a.shop, 'ocshop')}<div class="ocdoor">${hop}</div><div class="ocsteps">${step}</div>${r7('keeper_' + a.shop, 'ockeeper')}<i class="ocbub">${esc(thanks)}</i></div>
  <div class="ocad">${r7(head(a.cat[2]), 'ocnew')}<div class="ocadt"><b>${esc(t('ordAdopted', { name, at: loc(c.at) }))}</b><small>${esc(t('coat_' + a.cat[2]))} · ${esc(t('ordSet', { k: a.set.k, a: a.set.have, b: a.set.size }))}</small><span class="ocsegs">${segs}</span></div></div>
  ${a.reward ? `<div class="ocrew">${r7('ord_basket', 'ocb')}<b>${t('ordSetDone')}</b><span>${rewardText(a.reward)}</span></div>` : ''}
  <small class="octap">${t('ordTap')}</small>
</div>`;
  document.body.appendChild(el);
  const t0 = performance.now();
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (performance.now() - t0 > 300) finishCer(false, true); });
  cer = { el, go, snap, timer: setTimeout(() => finishCer(false), (a.reward ? 3600 : 2700) + (still ? 0 : cols.length * 120)) };
}

function finishCer(restore, tapped = false) {
  if (!cer) return;
  const { el, go, snap, timer } = cer;
  cer = null;
  clearTimeout(timer);
  el.classList.add('out');
  el.style.pointerEvents = 'none';
  setTimeout(() => el.remove(), 260);
  if (tapped) { // the click of the tap that closed it never lands on the win card that just opened under it
    const eat = (e) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 450);
  }
  if (!restore) { go(); return; }
  const S = ctx.cur();
  const now = { n: S.n, daily: S.daily, show: S.show };
  Object.assign(S, snap);
  try { go(); } finally { Object.assign(S, now); }
}

// ---------------- album: Adopted cats ----------------
const tabsHtml = (on) => `<div class="ordtabs"><button class="otab ${on === 'cards' ? 'on' : ''}" ${on === 'cards' ? '' : 'data-act="album"'}>${r7('album_book', 'oti')}<b>${t('albCards')}</b></button><button class="otab ${on === 'adopt' ? 'on' : ''}" data-ord="adopt">${r7('ord_basket', 'oti')}<b>${t('albAdopt')}</b></button></div>`;

function adoptedSheet() {
  const d = save.data;
  const shops = O.albumShops(d, d.level);
  if (adPage < 0) adPage = Math.max(0, shops.indexOf(O.shopOf(d.level)));
  adPage = clamp(adPage, 0, shops.length - 1);
  const id = shops[adPage];
  const c = O.CUSTOMERS[id];
  const r = O.shopRec(d, id);
  const showDone = !r.cur.length && r.done.length > 0;
  const list = showDone ? r.done : r.cur;
  const k = showDone ? r.sets : r.sets + 1;
  const rw = O.SET_REWARDS[(k - 1) % O.SET_REWARDS.length];
  const slot = (x) => (x
    ? `<div class="adcat">${r7(head(x[2]))}<b>${esc(O.CAT_NAMES[x[1]] || '')}</b><small>${esc(t('coat_' + x[2]))}</small></div>`
    : `<div class="adcat empty">${r7('cat_head_orange_happy', 'sil')}<b>?</b><small>${t('adNext')}</small></div>`);
  const slots = Array.from({ length: O.SET_SIZE }, (_, i) => slot(list[i])).join('');
  const rew = `<div class="adcat rew ${showDone ? 'done' : ''}">${r7('ord_basket')}<b>${showDone ? t('ordSetDone') : t('ordSet', { k, a: list.length, b: O.SET_SIZE })}</b><small>${t('adSetReward', { r: rewardText(rw) })}</small></div>`;
  const live = O.lively(d, id);
  const step = [...r.done, ...r.cur].slice(-live).map((x) => r7(head(x[2]), 'adstep')).join('');
  const isNow = id === O.shopOf(d.level);
  const arrow = (dd) => `<button class="arr ${adPage + dd < 0 || adPage + dd >= shops.length ? 'dis' : ''}" data-ord="adpage" data-p="${adPage + dd}" aria-label="${dd < 0 ? t('back') : t('next')}"><svg viewBox="0 0 24 24"><path d="${dd < 0 ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  const dots = shops.map((_, i) => `<i class="${i === adPage ? 'on' : ''}"></i>`).join('');
  const total = O.totalAdopted(d);
  openSheet('adopted', 'quests lsheet album adopt', t('album'), `${tabsHtml('adopt')}
<div class="albhead">${arrow(-1)}<span><b>${esc(loc(O.shopName(id)))}</b><small>${esc(loc(c.title))} ${esc(O.keeperOf(id))} · ${t('adHead', { n: r.cats })}</small></span>${arrow(1)}</div>
<div class="adscene">${r7('street_' + id, 'adshop')}<div class="adsteps">${step}</div><div class="adtalk">${isNow ? `<i class="adnow">${t('adOrdering')}</i>` : ''}<small>${esc(loc(c.why[0]))}</small></div>${r7('keeper_' + id, 'adkeeper')}</div>
<div class="adgrid">${slots}${rew}</div>
<div class="adfoot">${total ? `${t('adSets', { n: r.sets })} · ${t(total === 1 ? 'adTotal1' : 'adTotal', { n: total })}` : t('adNone')}${shops.length < O.SHOP_ORDER.length ? `<br>${t('adMore')}` : ''}</div>
${shops.length > 1 ? `<div class="pdots albdots">${dots}</div>` : ''}`);
}

// ---------------- Cat Street: shops that took orders get doorstep cats (1-3 by cats delivered) ----------------
function decorateStreet() {
  const S = save.data.orders && save.data.orders.shops;
  if (!S) return;
  for (const sh of document.querySelectorAll('.street .sh.sl, .street .sh.sc.up, .street .sh.sc.mix')) {
    if (sh.querySelector('.ordstep')) continue;
    const im = sh.querySelector('img[src*="street_"]');
    const m = im && /street_(\w+)\.webp/.exec(im.getAttribute('src') || '');
    const r = m && S[m[1]];
    if (!r || !r.cats) continue;
    const n = O.lively(save.data, m[1]);
    const cols = [...(r.done || []), ...(r.cur || [])].slice(-n).map((x) => x[2]);
    while (cols.length < n) cols.unshift(cols.length % 8);
    sh.insertAdjacentHTML('beforeend', `<div class="ordstep" title="${esc(t('adHead', { n: r.cats }))}">${cols.map((col) => r7(head(col))).join('')}<b>${r.cats}</b></div>`);
  }
}
