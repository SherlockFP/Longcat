// R11 retention lane UI (sol-r11-3 fix 5). Hooks called from hub.js (the map, the room, the wide-screen panel) and
// main.js (the win card):
//  - the map's goal strip: once the early resident thread is over, the nearest album reward as one actionable card:
//    the postcard itself, the exact stamp or board left and a button that opens that board / the Daily / the claim
//  - the room: a completed page's print waits with "Hang" pre-selected (main.js sends the player here)
//  - the win card: from the 3rd win of a day, one line naming what opens tomorrow
// Every tap is a data-act button handled by ui.js / main.js.
import './r11-ret.css';
import { t, lang } from '../i18n.js';
import { assetUrl } from '../game/breeds.js';
import { save } from '../kit/save.js';
import { now } from '../kit/clock.js';
import { dayOf, weekOf } from '../game/econ.js';
import { AREAS, RESIDENTS, areaDone } from '../game/cafe.js';
import { PAGES, WEEKS, CARDS_PER_PAGE, pageHave } from '../game/r10.js';
import { albumNext, stepOk, hangPending } from '../game/r11-ret.js';
import { featGoal } from './live.js';

const r7 = (name, cls = '') => `<img class="${cls}" src="${assetUrl('r7/' + name + '.webp')}" alt="" draggable="false">`;
const loc = (o) => (o && typeof o === 'object' ? o[lang()] || o.en || '' : o || '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const RES_ICON = { coins: 'hud_coin', hint: 'btn_hint', scoop: 'btn_scoop', undo: 'btn_undo' };

const today = () => dayOf(now());
const dailyDone = () => save.data.daily.doneDay === String(today());
// the room a print goes up in when the player has not picked one: the same rule as main.js hangRoom
export function suggestRoom(p) {
  const d = save.data;
  const held = Object.keys(d.album.hung).map(Number);
  const cur = held.find((k) => d.album.hung[k] === p);
  if (cur != null) return cur;
  const done = AREAS.map((_, i) => i).filter((i) => areaDone(i));
  return done.find((i) => !held.includes(i)) ?? 0;
}
const roomName = (i) => loc((AREAS[i] || AREAS[0] || {}).name);

// the album card for the strip (null: nothing to show now)
function albumCard(L) {
  const d = save.data;
  if (!L || L.thread) return ''; // the early resident thread stays THE goal
  const fg = featGoal(L.goals || []);
  if (fg && fg.pct >= 1) return ''; // a goal ready to claim keeps the strip
  const week = weekOf(today());
  const dd = dailyDone();
  const g = albumNext(d, week, dd);
  if (!g || !g.today || !stepOk(d, week, g, dd)) return '';
  if (g.old && fg) return ''; // R11 fix round 1: an old archived board leaves the strip to a request, a job or the Daily
  return cardHtml(g);
}

function cardHtml(g) {
  if (g.k === 'hang') {
    const pg = PAGES[g.page];
    return `<div class="goals feat rtalb"><button class="goal feat rtcard ready" data-act="rthangroom" data-p="${g.page}" data-view="room"><span class="rtpc prt">${r7('print_' + pg.print)}</span><span class="gt"><small>${esc(t('rtHangSmall', { page: loc(pg.name) }))}</small><b>${t('rtHangTitle')}</b><em>${esc(t('rtHangWhere', { room: roomName(suggestRoom(g.page)) }))}</em></span><i class="gcta">${t('rtGoHang')}</i></button></div>`;
  }
  const c = WEEKS[g.card];
  const pg = PAGES[g.page];
  const top = g.pageLeft <= 0 ? t('rtLastCard', { page: loc(pg.name) }) : t('rtNextCard', { page: loc(pg.name), a: pageHave(save.data, g.page), b: CARDS_PER_PAGE });
  const K = (g.b || 'a').toUpperCase();
  let task = '';
  let act = '';
  let cta = '';
  if (g.k === 'claim') { task = t('rtClaimLine'); act = 'data-act="popclaim"'; cta = t('claim'); }
  else if (g.k === 'catch') { task = t('rtCatchLine'); act = `data-act="catchup" data-w="${g.w}"`; cta = t('catchGet'); }
  else {
    const what = g.k === 'daily' ? t('rtDoDaily') : g.arch ? t('rtDoArch', { k: K, ev: loc(c.ev) }) : t('rtDoBoard', { k: K });
    task = g.unit === 'stamp' ? t(g.left === 1 ? 'rtStamp1' : 'rtStamps', { n: g.left, task: what }) : t(g.left === 1 ? 'rtBoard1' : 'rtBoards', { n: g.left, task: what });
    act = g.k === 'daily' ? 'data-act="daily"' : `data-act="showplay" data-w="${g.w}" data-k="${g.b}"`;
    cta = g.k === 'daily' ? t('rtGoDaily') : t('rtGoBoard', { k: K });
  }
  const ready = g.k === 'claim' || g.k === 'catch';
  const ph = `<span class="pcph">${r7(c.bg, 'pcbg')}${c.mid ? r7(c.mid, 'pcmid') : ''}${r7(c.fg, 'pcfg')}</span>`;
  return `<div class="goals feat rtalb"><button class="goal feat rtcard ${ready ? 'ready' : ''}" ${act}><span class="rtpc ${ready ? '' : 'sil'}">${ph}</span><span class="gt"><small>${esc(top)}</small><b>${esc(loc(c.card))}</b><em>${esc(task)}</em></span><i class="gcta">${esc(cta)}</i></button></div>`;
}

// ---- the map (hub.js showMap / hideMap): the album card takes the strip's place ----
export function retMap(on, info) {
  const room = document.querySelector('#cafe .room');
  if (!room) return;
  room.querySelectorAll('.rtalb').forEach((x) => x.remove());
  room.classList.remove('rtalb-on');
  if (!on) return;
  const html = albumCard(info && info.live);
  if (!html) return;
  room.insertAdjacentHTML('beforeend', html);
  room.classList.add('rtalb-on');
}

// ---- the room (hub.js hubAfter, map off): a finished page's print waits with Hang pre-selected ----
export function retRoom(info, mapOn) {
  const nb = document.querySelector('#cafe .nbcard');
  const c = document.getElementById('cafe');
  if (!nb || !c || mapOn || !c.classList.contains('vroom') || c.classList.contains('vstreet')) return;
  const p = hangPending(save.data);
  if (p < 0) return;
  const ai = Math.max(0, Math.min(AREAS.length - 1, (info && info.area) || 0));
  const here = areaDone(ai);
  const pg = PAGES[p];
  nb.innerHTML = `<div class="trow rthang ${reduced() ? '' : 'spot'}"><span class="ticon">${r7('print_' + pg.print, 'rtprint')}</span><span class="tname"><small>${esc(t('rtHangSmall', { page: loc(pg.name) }))}</small><b>${t('rtHangTitle')}</b><small>${esc(here ? t('rtHangHere', { room: roomName(ai) }) : t('rtHangWhere', { room: roomName(suggestRoom(p)) }))}</small></span><span class="rtbtns"><button class="btn green xs rtsel" data-act="rthang" data-p="${p}" data-room="${here ? ai : suggestRoom(p)}" data-view="room">${t('rtGoHang')}</button><button class="link" data-act="rtlater">${t('rtLater')}</button></span></div>`;
  const b = nb.querySelector('.rtsel');
  try { b.focus({ preventScroll: true }); } catch { /* focus is a nicety */ }
}

// ---- the wide-screen left panel (hub.js panels): the same album card above the keys ----
export function retPanel(L, Lv) {
  if (!L) return;
  const html = albumCard(Lv);
  if (!html) return;
  const keys = L.querySelector('.hskeys');
  const at = keys && keys.previousElementSibling;
  const box = `<h4>${t('album')}</h4><div class="hsgoals rtside">${html}</div>`;
  if (at) at.insertAdjacentHTML('beforebegin', box); else L.querySelector('.hscard')?.insertAdjacentHTML('beforeend', box);
}

// ---- the win card (main.js after ui.win): from the 3rd win of the day, what opens tomorrow ----
// n: wins today; list: game/r11-ret.js tomorrow()
const resName = (id) => (RESIDENTS.find((r) => r.id === id) || {}).name || '';
function tmItem(x) {
  if (x.k === 'chest') {
    const rw = x.rw || {};
    const k = ['coins', 'hint', 'scoop', 'undo'].find((q) => rw[q]);
    return `<span class="rtti">${k ? r7(RES_ICON[k]) : ''}${esc(t('rtTm_chest', { n: x.n }))}</span>`;
  }
  if (x.k === 'week') return `<span class="rtti">${r7(WEEKS[x.card].fg)}${esc(t('rtTm_week', { card: loc(WEEKS[x.card].card) }))}</span>`;
  if (x.k === 'job') return `<span class="rtti">${r7('res7_' + x.who + '_idle')}${esc(t('rtTm_job', { name: resName(x.who) }))}</span>`;
  return `<span class="rtti">${esc(t('rtTm_' + x.k))}</span>`;
}
export function winCard(n, list) {
  if (n < 3 || !list || !list.length) return;
  const card = document.querySelector('#modal .card.win');
  if (!card || card.querySelector('.rttm')) return;
  const row = card.querySelector('.nextrow') || card.lastElementChild;
  const html = `<div class="rttm"><b>${esc(t('rtWins', { n }))} ${esc(t('rtTmrw'))}</b>${list.slice(0, 2).map(tmItem).join('<i class="rtsep">·</i>')}</div>`;
  if (row) row.insertAdjacentHTML('beforebegin', html); else card.insertAdjacentHTML('beforeend', html);
}
