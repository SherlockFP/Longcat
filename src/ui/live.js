// Retention UI (src/game/live.js): hub rail badges, the "next goals" strip, the café tips sheet (tip jar + resident
// requests), the daily puzzle sheet, the Events sheet (Daily, this week's one event: Cat Show / Café Rush / pop-up, the
// archive, friends) and the floating coin burst. Pure view like ui.js: main.js passes the info in. Every sheet fits the screen (no scrolling).
import { t, lang } from '../i18n.js';
import { assetUrl } from '../game/breeds.js';
import { COLORS } from '../core/board.js';
import { openSheet } from './ui.js';
import { SNACKS } from '../../data/live.js';
import './live.css';
import { popCard, friendsTab } from './r10.js';

const r7 = (name, cls = '') => `<img class="${cls}" src="${assetUrl('r7/' + name + '.webp')}" alt="" draggable="false">`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const loc = (o) => (o && typeof o === 'object' ? o[lang()] || o.en || '' : o || '');
const fmtMs = (ms) => { const s = Math.ceil(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };
const fmtLong = (ms) => { const m = Math.floor(ms / 60000); const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); return d > 0 ? t('daysHours', { d, h }) : t('hoursMins', { h, m: m % 60 }); };
const fmtTime = (ms) => (ms > 0 ? (ms / 1000).toFixed(1) + t('secShort') : '-');
const RES_ICON = { coins: 'hud_coin', hint: 'btn_hint', scoop: 'btn_scoop', undo: 'btn_undo' };
const chips = (r) => `<span class="lchips">${['coins', 'hint', 'scoop', 'undo'].filter((k) => r[k]).map((k) => `<span class="lchip">${r7(RES_ICON[k])}<b>${k === 'coins' ? r[k] : 'x' + r[k]}</b></span>`).join('')}${r.hearts ? `<span class="lchip">${r7('hud_heart')}<b>+${r.hearts}</b></span>` : ''}${r.outfit ? `<span class="lchip">${r7('hud_yarn')}</span>` : ''}</span>`;
const bar = (have, need, label = `${have}/${need}`) => `<div class="lbar"><i style="width:${Math.min(100, Math.round((have / Math.max(1, need)) * 100))}%"></i><em>${label}</em></div>`;
const medalSvg = (m) => `<svg class="medal ${m || 'none'}" viewBox="0 0 24 24"><path d="M7.5 2h4l1.6 5h-4zM16.5 2h-4l-1.6 5h4z" class="rb"/><circle cx="12" cy="14.5" r="7.2"/><path d="m12 10.3 1.3 2.7 3 .4-2.2 2 .6 3-2.7-1.5-2.7 1.5.6-3-2.2-2 3-.4z" class="st"/></svg>`;
const resImg = (id, wear) => r7(`res7_${id}_${wear || 'idle'}`);
export const snack = (n) => SNACKS[n % SNACKS.length];
// Café Rush trophies won (top 3 of a week) stand on the café floor, tinted by place
export function cupsHtml(c) {
  const list = ['gold', 'silver', 'bronze'].flatMap((k) => Array(Math.min(3, (c && c[k]) || 0)).fill(k));
  return list.length ? `<div class="cups">${list.map((k) => `<i class="cup ${k}">${r7('icon_trophy')}</i>`).join('')}</div>` : '';
}
export const reqText = (x) => t('req_' + x.k, { n: x.need, c: t('col_' + COLORS[x.c]) });

// ---- hub: right rail badges (tasks stays in ui.js) ----
// L: { jar, daily, dots: { jar, daily } }
export function railHtml(L) {
  if (!L) return '';
  const dot = (on) => `<i class="dot" ${on ? '' : 'hidden'}></i>`;
  const ring = (p) => `style="--p:${Math.round(Math.min(1, p) * 100)}"`;
  const d = L.daily;
  const daily = `<button class="rr lr" data-act="dailysheet" aria-label="${t('dailyLevel')}">${r7('hud_medal')}${d.done ? '<i class="rok">&#10003;</i>' : d.streak ? `<i class="rnum">${d.streak}</i>` : ''}${dot(!d.done && L.dots.daily)}<span>${d.done ? fmtShort(d.ms) : t('daily')}</span></button>`;
  const j = L.jar; // null: the jar stands on the counter in this room (or is empty), not on the rail
  const jar = j && j.on ? `<button class="rr lr ring ${j.pct >= 1 ? 'full' : ''}  ${L.jarSpot ? 'spot' : ''}" data-act="jartap" ${ring(j.pct)} aria-label="${t('tipJar')}">${r7('tipjar_' + j.stage, 'jarimg')}${dot(L.dots.jar)}<span>${j.pct >= 1 ? t('jarFull') : j.coins > 0 ? j.coins : fmtShort(j.fullMs)}</span></button>` : '';
  return daily + jar;
}
const fmtShort = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}${t('hShort')}` : `${m}${t('mShort')}`; };

// ---- hub: the "next goals" strip (nearest 3 goals with progress) ----
// one goal's icon, label and the tap that opens where it is tracked
function goalParts(g) {
  let icon = r7('hud_star');
  let label = '';
  let act = 'cafeview';
  let extra = '';
  if (g.k === 'build') { label = g.name; act = 'cafeview'; }
  else if (g.k === 'resident') { icon = resImg(g.id || ''); label = t('goalResident', { name: g.name }); }
  else if (g.k === 'req') { icon = resImg(g.who) + r7(g.req.k === 'color' ? `cat_head_${COLORS[g.req.c]}_happy` : 'hud_yarn', 'sub'); label = t('g_' + g.req.k, { n: g.req.need }); act = 'cafesheet'; }
  else if (g.k === 'outfit') { icon = resImg(g.who, g.outfit); label = t('outfit_' + g.outfit); act = 'residents'; }
  else if (g.k === 'job') { icon = resImg(g.who) + `<i class="gjrw">${r7('hud_coin')}30</i>`; label = t('jobGoal', { name: g.job.name, task: t('jk_' + g.job.k, { n: g.job.need }) }); act = g.job.done ? 'jobclaim' : 'quests'; extra = `data-s="${g.job.s}"`; }
  else if (g.k === 'daily') { icon = r7('hud_medal'); label = t('g_daily'); act = 'dailysheet'; }
  else if (g.k === 'show') { icon = r7('icon_trophy'); label = t('goalShow'); act = 'events'; extra = 'data-tab="show"'; }
  else if (g.k === 'party') { icon = r7('hud_star'); label = t('goalParty'); }
  else if (g.k === 'thread') { icon = resImg(g.who); label = threadLine(g); act = g.have >= g.need ? 'cafeview' : 'play'; }
  return { icon, label, act, extra };
}
// the next resident's exact remaining action: "Pip moves in after 2 more wins" / "Build the Bookshelf for Pip"
export function threadLine(g) {
  if (g.have >= g.need) return t('thrBuild', { name: g.name, task: g.task });
  return t(g.wins === 1 ? 'thrWin1' : 'thrWin', { name: g.name, w: g.wins });
}
export function goalsHtml(list) {
  if (!list || !list.length) return '';
  const row = list.map((g) => {
    const { icon, label, act, extra } = goalParts(g);
    const ready = g.pct >= 1;
    return `<button class="goal ${ready ? 'ready' : ''} ${g.fresh ? 'fresh' : ''}" data-act="${act}" ${extra} ${act === 'cafeview' ? 'data-view="room"' : ''}><span class="gi">${icon}</span><span class="gt"><b>${label}</b>${bar(g.have, g.need)}</span></button>`;
  }).join('');
  return `<div class="goals">${row}</div>`;
}
// R11: the hub features ONE goal: the claimable one, else the nearest (main.js orders them). It shows its reward and
// goes straight to where it is earned: Play for a cat / carrier / win goal, the Daily puzzle, the Cat Show, a Claim.
// pick: a goal ready to claim, else a newcomer's first ask, else the nearest one at least half done, else the first in
// the pinned order
export function featGoal(list) {
  if (!list || !list.length) return null;
  const ready = list.find((g) => g.pct >= 1);
  if (ready) return ready;
  const fresh = list.find((g) => g.fresh); // a newcomer's first ask is a moment of its own
  if (fresh) return fresh;
  const th = list.find((g) => g.k === 'thread'); // R11 fix 2: early on, the next resident is THE goal (map, win card, room)
  if (th) return th;
  const near = list.filter((g) => g.pct >= 0.5).sort((a, b) => b.pct - a.pct)[0];
  return near || list[0];
}
export function featGoalHtml(list) {
  const g = featGoal(list);
  if (!g) return '';
  const p = goalParts(g);
  const ready = g.pct >= 1;
  let act = p.act;
  let extra = p.extra;
  let cta = t('goThere');
  if (g.k === 'req') { act = ready ? 'cafesheet' : 'play'; extra = ''; cta = ready ? t('claim') : t('play'); }
  else if (g.k === 'job') { act = ready ? 'jobclaim' : 'play'; cta = ready ? t('claim') : t('play'); }
  else if (g.k === 'daily') { act = 'daily'; cta = t('play'); }
  else if (g.k === 'thread') { act = ready ? 'cafeview' : 'play'; cta = ready ? t('build') : t('play'); }
  else if (ready) cta = t('claim');
  const icon = g.k === 'job' ? resImg(g.who) : p.icon; // the reward chip carries the coins
  return `<div class="goals feat"><button class="goal feat ${ready ? 'ready' : ''} ${g.fresh ? 'fresh' : ''}" data-act="${act}" ${extra} ${act === 'cafeview' ? 'data-view="room"' : ''}><span class="gi">${icon}</span><span class="gt"><b>${p.label}</b>${bar(g.have, g.need)}</span>${g.rw ? chips(g.rw) : ''}<i class="gcta">${cta}</i></button></div>`;
}

// ---- café tips sheet: the tip jar + resident requests ----
// info: { jar: {coins, cap, rate, pct, stage, fullMs}, reqs: [{x, name, snack, reward, ready}], nextMs, wear }
export function cafeSheet(info) {
  const j = info.jar;
  const jar = `<div class="jarbox">${r7('tipjar_' + j.stage, 'jbig')}<div class="jt"><b>${t('tipJar')}</b><small>${t('jarRate', { n: j.rate })}</small>${bar(j.coins, j.cap, `${j.coins}/${j.cap}`)}<small>${j.pct >= 1 ? t('jarIsFull') : t('jarFullIn', { t: fmtLong(j.fullMs) })}</small></div><button class="btn green xs jarbtn ${j.coins > 0 ? '' : 'dim'}" data-act="jarcollect" ${j.coins > 0 ? '' : 'disabled'}>${r7('hud_coin', 'mini')}<b>${t('collect')}</b></button></div>`;
  const reqs = info.reqs.map((r, i) => `<div class="qrow lreq ${r.ready ? 'ready' : ''}"><span class="rport">${resImg(r.x.who, info.wear[r.x.who])}</span><div class="qt"><b>${t('reqWants', { name: r.name, snack: loc(r.snack) })}</b><span>${reqText(r.x)}</span>${bar(r.x.p, r.x.need)}</div>${r.ready ? `<button class="btn green xs" data-act="reqclaim" data-i="${i}">${t('claim')}</button>` : chips(r.reward)}</div>`).join('');
  const empty = info.reqs.length < 2 ? `<div class="lnote">${info.resN ? t('reqNext', { t: fmtLong(info.nextMs) }) : t('reqLocked')}</div>` : '';
  openSheet('cafesheet', 'quests lsheet', t('cafeChores'), `${jar}<div class="qsec">${t('requests')}</div>${reqs}${empty}<div class="lnote small">${t('reqHow')}</div>`);
}

// ---- daily puzzle sheet: streak flames, the escalating chest, play (also the Events sheet's Daily tab) ----
// info: { streak, done, ms (to midnight), chests: [7 rewards], shield, drec }
export function dailySheet(info) { openSheet('dailysheet', 'quests lsheet', t('dailyLevel'), dailyBody(info)); }
function dailyBody(info) {
  const cur = info.done ? info.streak : info.streak + 1; // the box today's clear opens
  const boxes = info.chests.map((r, i) => {
    const n = i + 1;
    const st = n < cur || (info.done && n === cur) ? 'done' : n === cur ? 'today' : '';
    return `<div class="sday ${st}"><small>${n}</small>${st === 'done' ? '<i class="ok">&#10003;</i>' : chips(r)}</div>`;
  }).join('');
  const shield = `<div class="shieldchip ${info.shield ? 'on' : 'used'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path class="ck" d="m8 12 3 3 5-6"/></svg>${t(info.shield ? 'shieldReady' : 'shieldUsed')}</div>`;
  return `<div class="streakhead">${r7('hud_medal', 'flame')}<b>${t('streakDays', { n: info.streak })}</b>${shield}<small>${t('streakRule')}</small></div>
<div class="sdays">${boxes}</div>
${info.drec ? `<div class="drecbar">${info.drec.next ? r7(info.drec.next.art, 'drart sil') : ''}<span><b>${info.drec.next ? t('drecProg', { n: info.drec.n, at: info.drec.next.at }) : t('drecTotal', { n: info.drec.n })}</b><small>${info.drec.next ? t('drecNext', { name: info.drec.next.name }) : t('drecAll')}</small></span>${info.drec.next ? bar(info.drec.n, info.drec.next.at, '') : ''}</div>` : ''}
${info.done ? `<div class="lnote">${t('dailyDoneTil', { t: fmtLong(info.ms) })}</div>` : `<button class="btn green sm" data-act="dailyplay">${t('play')}</button><div class="lnote small">${t('dailyEnds', { t: fmtLong(info.ms) })}</div>`}`;
}

// ---- Events sheet: Daily | this week's event (Cat Show or pop-up + the Show archive, or Café Rush) | Friends ----
let evTab = 'show';
let archPage = 0;
export const eventsTab = (k) => { if (k) evTab = k; return evTab; };
export function eventsSheet(info) {
  if (!info.open) {
    openSheet('events', 'quests lsheet', t('events'), `<div class="locked">${r7('icon_trophy', 'lt')}<b>${t('eventsLocked', { n: info.from + 1 })}</b><small>${t('eventsLockedSub')}</small></div>`);
    return;
  }
  const ev = info.ev === 'rush' ? 'rush' : 'show'; // the one event tab: a pop-up week plays the Show boards
  if (!['daily', 'friends', 'arch', ev].includes(evTab)) evTab = ev; // a tab from another week (or a removed one)
  const tab = (k, label, dot) => `<button class="stab ${evTab === k || (k === 'show' && evTab === 'arch') ? 'on' : ''}" data-act="evtab" data-tab="${k}">${label}${dot ? '<i class="dot"></i>' : ''}</button>`;
  const evDot = ev === 'rush' ? info.rush.dot : info.show.dot || !!info.rush.pend || (info.pop && info.pop.next && info.pop.next.k === 'claim');
  const tabs = `<div class="stabs">${tab('daily', t('daily'), false)}${tab(ev, t(ev), evDot)}${tab('friends', t('friends'), false)}</div>`;
  let body = '';
  if (evTab === 'daily') body = dailyBody(info.daily);
  else if (evTab === 'friends') body = friendsTab(info.friends);
  else if (evTab === 'arch') body = archTab(info.arch);
  else if (evTab === 'rush') body = rushTab(info.rush);
  else body = rushPend(info.rush) + showTab(info.show, info.pop); // last Rush week's prize waits here
  openSheet('events', 'quests lsheet events', t('events'), tabs + body);
}

const goalText = (g) => (g.kind === 'chain' ? t('goalChain', { n: g.n }) : t('goalSeats', { n: g.n }));
function showTab(s, pop) {
  const card = (b) => `<div class="sbcard ${b.medal}">${medalSvg(b.medal)}<div class="sbt"><b>${t('showBoardN', { k: b.k.toUpperCase() })}</b><small>${b.goal ? goalText(b.goal) : t('goalLoading')}</small><small class="mst">${b.medal === 'gold' ? t('medalGold') : b.medal === 'bronze' ? t('medalBronze') : t('medalNone')}</small></div><button class="btn green xs" data-act="showplay" data-w="${b.w}" data-k="${b.k}">${b.medal ? t('replay') : t('play')}</button></div>`;
  // R10: the week's pop-up event leads the tab (its postcard, 3 stamps, the one thing left to do); the boards below are its boards
  return `${pop ? popCard(pop) : `<div class="theme lth" style="--th:${s.color}"><b>${s.name}</b><span>${t('showEnds', { t: fmtLong(s.endsMs) })}</span></div>`}
<div class="lnote">${t('showRules')}</div>
${s.boards.map(card).join('')}
<div class="lnote small">${t('showPays', { b: s.bronze, g: s.gold })}${s.rosette ? '' : ' · ' + t('showRosette')}</div>
<button class="link" data-act="evtab" data-tab="arch">${t('archive')} (${s.archN})</button>`;
}
function archTab(a) {
  const per = 3;
  const pages = Math.max(1, Math.ceil(a.weeks.length / per));
  archPage = Math.max(0, Math.min(pages - 1, archPage));
  // each past week keeps its postcard: owned, or caught up once both boards are cleared (one catch-up a week)
  const pc = (w) => (!w.card ? '' : w.card.own ? `<span class="apc own">${r7(w.card.fg)}<i>&#10003;</i></span>` : w.card.ok ? `<button class="apc get" data-act="catchup" data-w="${w.w}">${r7(w.card.fg)}<em>${t('catchGet')}</em></button>` : `<span class="apc">${r7(w.card.fg, 'sil')}</span>`);
  const rows = a.weeks.slice(archPage * per, archPage * per + per).map((w) => `<div class="qrow arow"><div class="qt"><b>${w.name}</b><span>${t('weeksAgo', { n: w.ago })}</span></div>${w.boards.map((b) => `<button class="abtn ${b.medal}" data-act="showplay" data-w="${w.w}" data-k="${b.k}">${medalSvg(b.medal)}<b>${b.k.toUpperCase()}</b></button>`).join('')}${pc(w)}</div>`).join('');
  const arrow = (d) => `<button class="arr ${archPage + d < 0 || archPage + d >= pages ? 'dis' : ''}" data-act="archpage" data-p="${archPage + d}" aria-label="${d < 0 ? t('back') : t('next')}"><svg viewBox="0 0 24 24"><path d="${d < 0 ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  return `<div class="lnote">${t('archiveSub')} ${a.catchOpen ? t('catchRule') : t('catchUsed')}</div>${rows || `<div class="lnote">${t('archiveEmpty')}</div>`}${pages > 1 ? `<div class="rpager">${arrow(-1)}<span>${archPage + 1}/${pages}</span>${arrow(1)}</div>` : ''}<button class="link" data-act="evtab" data-tab="show">${t('back')}</button>`;
}
export const setArchPage = (p) => { archPage = +p || 0; };
const rushPend = (r) => (r.pend ? `<div class="qrow ready"><div class="qt"><b>${t('rushLastWeek', { n: r.pend.rank })}</b>${chips(r.pend.prize)}</div><button class="btn green xs" data-act="rushclaim">${t('claim')}</button></div>` : '');
function rushTab(r) {
  const row = (e) => `<div class="lrow ${e.me ? 'me' : ''}"><i>${e.rank}</i><b>${e.me ? t('you') : `${e.name} <em class="bot">${t('botTag')}</em>`}</b><span>${fmtTime(e.ms)}</span></div>`;
  return `<div class="theme lth" style="--th:#e2843c"><b>${t('rush')}</b><span>${t('showEnds', { t: fmtLong(r.endsMs) })}</span></div>
${rushPend(r)}
<div class="sbcard">${r7('icon_trophy', 'medal')}<div class="sbt"><b>${t('rushGoal')}</b><small>${r.best ? t('rushBest', { t: fmtTime(r.best), n: r.rank }) : t('rushNone')}</small></div><button class="btn green xs" data-act="rushplay">${r.best ? t('replay') : t('play')}</button></div>
<div class="lboard">${r.rows.map(row).join('')}</div>
<div class="lnote small">${t('rushBots')} · ${t('rushPrizes')}</div>`;
}
// ---- arrival scene: a Cat Street shopkeeper (or apprentice, guest) walks in, waves, and a card says where it lives ----
// a: { kind: 'keeper'|'apprentice'|'upgrade'|'guest', id, name, line, place, reward, keeper?, art?, theme? }. Tap anywhere (or the button) closes. Reduced motion:
// no walk, the card shows at once.
// a new shop / upgrade / guest on Cat Street can be shown off: Share makes a picture of the street with the game's link
const SHARE_ICON = '<svg class="shi" viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke-width="3" stroke-linecap="round"/></svg>';
export function arrival(a) {
  closeArrival();
  const shop = a.kind === 'keeper' || a.kind === 'apprentice';
  const art = a.kind === 'apprentice' ? r7('keeper_' + a.id, 'arcat') + r7('appr_' + a.id, 'arcat arkit') : a.kind === 'keeper' || a.kind === 'upgrade' ? r7('keeper_' + a.id, 'arcat') : r7(a.art, 'arcat');
  const title = shop ? t('keeperArrive', { place: a.place }) : a.kind === 'upgrade' ? t('upDone', { place: a.place }) : t('guestArrive', { name: a.name, place: a.place });
  const sub = a.kind === 'apprentice' ? t('apprMoved', { name: a.name, keeper: a.keeper }) : a.kind === 'keeper' ? t('keeperMoved', { name: a.name }) : a.kind === 'upgrade' ? t('upDoneSub', { name: a.name }) : t('guestSub', { theme: a.theme });
  const el = document.createElement('div');
  el.id = 'arrival';
  el.className = 'arrival' + (reduced() ? ' calm' : '');
  el.dataset.act = 'arrivalclose'; // a tap anywhere closes it
  el.innerHTML = `<div class="arwalk">${art}</div>
<div class="arcard"><b>${title}</b><p>&ldquo;${loc(a.line)}&rdquo;</p><small>${sub}</small>${a.reward ? chips(a.reward) : ''}<div class="arbtns"><button class="btn green sm" data-act="arrivalclose">${t('yay')}</button><button class="btn pink sm hshare" data-act="sharehouse" data-k="street" data-id="${a.id}">${SHARE_ICON}<span>${t('shareHouse')}</span></button></div></div>`;
  (document.getElementById('ui') || document.body).appendChild(el); // inside #ui: its taps reach the action handler
}
export function closeArrival() { document.getElementById('arrival')?.remove(); }

// ---- floating coin burst: from an element to the coin pill, then the counter ticks up ----
export function coinBurst(fromEl, from, to) {
  const hc = document.getElementById('coins');
  if (!hc) return;
  if (!fromEl || reduced()) { hc.textContent = to; return; }
  const a = fromEl.getBoundingClientRect();
  const b = hc.getBoundingClientRect();
  const n = 7;
  hc.textContent = from;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('img');
    c.src = assetUrl('r7/hud_coin.webp');
    c.className = 'flycoin';
    const o = document.body.getBoundingClientRect(); // the wide-screen body is the containing block
    c.style.left = a.left - o.left + a.width / 2 - 14 + 'px';
    c.style.top = a.top - o.top + a.height / 2 - 14 + 'px';
    document.body.appendChild(c);
    const dx = b.left - a.left - a.width / 2 + 6;
    const dy = b.top - a.top - a.height / 2 + 4;
    const k = c.animate([
      { transform: 'translate(0,0) scale(.6)', opacity: 0 },
      { transform: `translate(${(i - 3) * 16}px,${-40 - (i % 3) * 14}px) scale(1.15)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${dx}px,${dy}px) scale(.55)`, opacity: 1 },
    ], { duration: 720, delay: i * 60, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'both' });
    k.onfinish = () => {
      c.remove();
      const el = document.getElementById('coins');
      if (el) el.textContent = Math.round(from + ((to - from) * (i + 1)) / n);
      const pill = el && el.closest('.pill');
      if (pill) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
    };
  }
}
