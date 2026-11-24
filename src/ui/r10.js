// R10 retention UI: the album sheet (6 pages x 4 postcards, the framed print of a full page), the postcard reveal, the
// pop-up week card and the Friend Results list for the Events sheet. Pure view: main.js passes the info in.
import { t, lang } from '../i18n.js';
import { assetUrl } from '../game/breeds.js';
import { openSheet } from './ui.js';
import './r10.css';

const r7 = (name, cls = '') => `<img class="${cls}" src="${assetUrl('r7/' + name + '.webp')}" alt="" draggable="false">`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const fmtLong = (ms) => { const m = Math.floor(ms / 60000); const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); return d > 0 ? t('daysHours', { d, h }) : t('hoursMins', { h, m: m % 60 }); };
const arrowSvg = (d) => `<svg viewBox="0 0 24 24"><path d="${d < 0 ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
void lang;

// a postcard: a photo composed from game art (a room or the street, a shop façade, the cat) with its name under it
export function postcardHtml(c, cls = '') {
  return `<div class="pc ${cls}"><div class="pcph">${r7(c.bg, 'pcbg')}${c.mid ? r7(c.mid, 'pcmid') : ''}${r7(c.fg, 'pcfg')}</div><b class="pcn">${esc(c.name)}</b></div>`;
}

// ---- album sheet ----
// info: { page: { p, name, print, have, cards: [{ i, name, bg, mid, fg, ev, own, src: now|arch|soon|locked, weeks }], done, hung, from },
//         pages, total, all, prints: [bool] }
export function album(info) {
  const P = info.page;
  const slot = (c) => {
    if (c.own) return postcardHtml(c);
    // an empty slot names its week and where the postcard comes from, and links there
    // R11 fix round 2 (sol-r12-2 retention): a slot the player can work on now shows its exact step, the same one the
    // map's album strip would show (game/r11-ret.js cardStep): "1 clear left" + a button straight to that board
    const st = c.step;
    if (st) {
      const K = (st.b || 'a').toUpperCase();
      const left = st.k === 'claim' ? t('albAllStamps') : st.k === 'catch' ? t('albBothDone') : st.k === 'wait' ? t('albWait', { t: fmtLong(c.endsMs || 0) })
        : !st.today ? t('popDailyTomorrow') : t(`albLeft_${st.unit}${st.left === 1 ? '1' : ''}`, { n: st.left });
      const btn = !st.today ? '' : st.k === 'claim' ? `<button class="pcgo" data-act="popclaim">${t('claim')}</button>`
        : st.k === 'catch' ? `<button class="pcgo" data-act="catchup" data-w="${st.w}">${t('catchGet')}</button>`
          : st.k === 'daily' ? `<button class="pcgo" data-act="dailyplay">${t('rtGoDaily')}</button>`
            : `<button class="pcgo" data-act="showplay" data-w="${st.w}" data-k="${st.b}">${t('rtGoBoard', { k: K })}</button>`;
      return `<div class="pc empty step"><div class="pcph">${r7(c.fg, 'pcfg sil')}</div><b class="pcn">${esc(c.ev)}</b><span class="pcstep"><small>${esc(left)}</small>${btn}</span></div>`;
    }
    const how = c.src === 'now' ? `<button class="pcgo" data-act="events" data-tab="show">${t('albNow')}</button>`
      : c.src === 'arch' ? `<button class="pcgo" data-act="events" data-tab="arch">${t('albArch')}</button>`
        : c.src === 'locked' ? `<small>${t('albLocked', { n: P.from + 1 })}</small>` : `<small>${c.weeks === 1 ? t('albNext') : t('albSoon', { n: c.weeks })}</small>`;
    return `<div class="pc empty"><div class="pcph">${r7(c.fg, 'pcfg sil')}</div><b class="pcn">${esc(c.ev)}</b>${how}</div>`;
  };
  const prn = P.done
    ? `<div class="albprint done">${r7('print_' + P.print, 'prt')}<span><b>${t('printReady')}</b><small>${P.hung ? t('printHungIn', { room: P.hung }) : t('printHow')}</small></span><button class="btn green xs" data-act="hang" data-p="${P.p}">${P.hung ? t('hangAgain') : t('hangCafe')}</button></div>`
    : `<div class="albprint">${r7('print_' + P.print, 'prt sil')}<span><b>${t('printLocked', { n: 4 - P.have })}</b><small>${t('printWhat')}</small></span></div>`;
  const arrow = (d) => `<button class="arr ${P.p + d < 0 || P.p + d >= info.pages ? 'dis' : ''}" data-act="albpage" data-p="${P.p + d}" aria-label="${d < 0 ? t('back') : t('next')}">${arrowSvg(d)}</button>`;
  const dots = info.prints.map((done, i) => `<i class="${i === P.p ? 'on' : ''} ${done ? 'full' : ''}"></i>`).join('');
  openSheet('album', 'quests lsheet album', t('album'), `<div class="albhead">${arrow(-1)}<span><b>${esc(P.name)}</b><small>${t('albPage', { a: P.have, b: 4 })} · ${t('albTotal', { a: info.total, b: info.all })}</small></span>${arrow(1)}</div>
<div class="albgrid">${P.cards.map(slot).join('')}</div>
${prn}
<div class="pdots albdots">${dots}</div>`);
}

// ---- a new postcard: it slides in, then the page progress (and the framed print when the page is full) ----
// a: { card, coins, page: pageInfo | null (the page just completed) }
export function postcard(a) {
  document.getElementById('pcard')?.remove();
  const el = document.createElement('div');
  el.id = 'pcard';
  el.className = 'pcard' + (reduced() ? ' calm' : '');
  el.innerHTML = `<div class="pcin">${postcardHtml(a.card, 'big')}</div>
<div class="arcard pccard"><b>${t('newPostcard')}</b><small>${esc(a.card.ev)}${a.coins ? ` · ${r7('hud_coin', 'mini')}+${a.coins}` : ''}</small>
${a.page ? `<div class="pcpage">${r7('print_' + a.page.print, 'prt')}<span><b>${t('pageDone', { name: a.page.name })}</b><small>${t('printUnlocked')}</small></span></div>` : ''}
<div class="pcbtns">${a.page ? `<button class="btn green sm" data-act="hang" data-p="${a.page.p}">${t('hangCafe')}</button>` : `<button class="btn green sm" data-act="album" data-p="${Math.floor(a.card.i / 4)}">${t('openAlbum')}</button>`}<button class="link" data-act="pcclose">${t('yay')}</button></div></div>`;
  (document.getElementById('ui') || document.body).appendChild(el);
}
export const closePostcard = () => document.getElementById('pcard')?.remove();

// ---- Events: the pop-up week card (top of the Cat Show tab) ----
// p: { name, card, have, stamps: { a, b, daily, n }, need, coins, paid, next: { k: claim|board|daily, w, b, done } | null, endsMs }
export function popCard(p) {
  const stamp = (on, label) => `<i class="pst ${on ? 'on' : ''}">${r7('pop_stamp')}<em>${label}</em></i>`;
  const n = p.next;
  const act = !n ? `<small class="pdone">${t('popDone')}</small>`
    : n.k === 'claim' ? `<button class="btn green xs" data-act="popclaim">${t('claim')}</button>`
      : n.k === 'board' ? `<button class="btn green xs" data-act="showplay" data-w="${n.w}" data-k="${n.b}">${t('popBoard', { k: n.b.toUpperCase() })}</button>`
        : n.done ? `<small class="pdone">${t('popDailyTomorrow')}</small>` : `<button class="btn green xs" data-act="dailyplay">${t('popDaily')}</button>`;
  return `<div class="popcard ${p.paid ? 'paid' : ''}">${postcardHtml(p.card, `mini ${p.paid || p.have ? '' : 'sil'}`)}<div class="popt"><b>${esc(p.name)}</b><small>${t('popLine', { n: p.stamps.n, m: p.need, t: fmtLong(p.endsMs) })}</small><span class="psts">${stamp(p.stamps.a, 'A')}${stamp(p.stamps.b, 'B')}${stamp(p.stamps.daily, t('popDailyShort'))}</span><small class="pprize">${t('popPrize', { c: p.coins })}</small></div><div class="popact">${act}</div></div>`;
}

// ---- Events: Friend Results ----
// f: { list: [{ id, nm, n, b, k, m, g, pg, res, board }], n }
export function friendsTab(f) {
  if (!f.list.length) return `<div class="frempty">${r7('fr_letter', 'frl')}<b>${t('frEmpty')}</b><small>${t('frEmptySub')}</small></div>`;
  const val = (m, v) => (m === 'chain' ? '×' + v : m === 'time' ? (v / 10).toFixed(1) + t('secShort') : t('frSeats', { n: v }));
  const row = (e, i) => {
    const who = e.nm || t('dareFriend');
    const line = e.pg == null ? t('frSent', { name: who, v: val(e.m, e.g) }) : t('fr_' + (e.res || 'tie'), { name: who, v: val(e.m, e.pg) });
    return `<div class="frrow ${i === 0 ? 'latest' : ''}">${r7('fr_letter', 'frl')}<div class="frt"><b>${esc(line)}</b><small>${esc(e.board)} · ${t('frCushions', { n: e.b })}</small>${e.pg != null ? `<span class="frvs">${t('frYou')} ${val(e.m, e.pg)} · ${esc(who)} ${val(e.m, e.g)}</span>` : ''}</div><button class="btn ${i === 0 ? 'pink' : 'teal'} xs" data-act="rematch" data-id="${e.id}">${t('rematch')}</button></div>`;
  };
  return `<div class="lnote small">${t('frSub', { n: f.n })}</div>${f.list.map(row).join('')}`;
}
