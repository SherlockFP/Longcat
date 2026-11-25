import './ui/ui.css';
import { generate, levelKind } from './core/generate.js';
import { boardOf, BOARD_REV, linkRev } from './core/curated.js';
import { COLORS, DIRS, makeCat, makeBoard } from './core/board.js';
import { freeCats, hint as solverHint, solveFrom } from './core/solver.js';
import { compile, Sim, searchWin, maxChain } from './core/search.js';
import { findBlocker, isFailed, canUndo, dogLeft, isHidden, tap as rulesTap, createState, undo as rulesUndo, isLocked } from './core/rules.js';
import { loadAssets } from './game/assets.js';
import { Game } from './game/game.js';
import { ui } from './ui/ui.js';
import { t } from './i18n.js';
import { save } from './kit/save.js';
import { audio } from './kit/audio.js';
import { haptics } from './kit/haptics.js';
import { landBuzz } from './ui/r11-juice.js'; // R11 juice: the chain's last landing buzz
import { ads } from './kit/ads.js';
import * as portal from './kit/portal.js'; // R17: CrazyGames SDK (crazygames build only)
import * as money from './ui/money.js'; // R17: rewarded offers (double coins, hint), shop flags
import { track, funnel, retention } from './kit/analytics.js';
import { now } from './kit/clock.js';
import * as iap from './kit/iap.js';
import { pwa, initPwa } from './kit/pwa.js';
import * as econ from './game/econ.js';
import * as cafe from './game/cafe.js';
import { makeShareClip, planClip, shareFile, canRecord } from './kit/clip.js';
import { houseCard } from './kit/card.js';
import * as dare from './kit/dare.js';
import './i18n-dare.js';
import { appealBoard } from './game/r11-appeal.js'; // R11 appeal: the shaped-body showcase board (dev QA)
import * as live from './game/live.js';
import * as street from './game/street.js';
import * as r10 from './game/r10.js';
import * as lui from './ui/live.js';
import * as rui from './ui/r10.js';
import * as cui from './ui/content.js'; // content lane: spring cats, swivel beds, themed packs past L60
import * as sui from './ui/shape.js'; // shape lane: first shaped / folded board cards, the flap's count and toast
import { notify } from './kit/notify.js';
import './i18n-live.js';
import './i18n-r10.js';
import './i18n-content.js';
import './i18n-perf.js';
import { toggleGpu } from './ui/perf.js';
import './i18n-orders.js';
import * as ord from './game/orders.js';
import * as ordUi from './ui/orders.js';
import './i18n-iq.js';
import * as iqui from './ui/iq.js'; // R10 iq lane: level clocks + time medals, Record Run, Records sheet
import './i18n-shop.js';
import * as shopRules from './game/shop.js';
import { shopActions } from './ui/shop.js';
import './i18n-hub.js';
import * as hub from './ui/hub.js';
import './i18n-r11.js';
import './i18n-r11-ret.js';
import * as rret from './ui/r11-ret.js'; // R11 retention lane: album card, hang card, tomorrow on the win card
import * as rtg from './game/r11-ret.js';
import './ui/r11.css'; // R11 fix round 1: plaque pack line, on-demand clip, featured goal, one Play
import './ui/r11-pres.css'; // R11 pres: one Play per hub screen, the resident line in full, shared card spacing
import './ui/r11b.css'; // R11 fix round 2: win card rows, thread bar, video progress
import './i18n-fun.js';
import * as fun from './game/r11-fun.js'; // R11 fun lane: winnable Take back, park ghosts, teaching rewind, a free opening
import * as vir from './ui/r11-vir.js'; // R11 vir: QR dare card, background video
import './i18n-r11-vir.js';
// which UI sound a [data-act] tap makes (the action itself may add a result sound: build, claim, coin, error)
const UI_BACK = /^(close|closesheet|cafeback|arriveclose|arrivalclose|pcclose|home|rtlater|dareskip)$/;
const UI_TAB = /^(cafeview|cafearea|evtab|iqtab|shoptab|stab4|rpage|albpage|archpage|iqpage|lang|toggle|shopsel|reno)$/;
const UI_OK = /^(play|next|retry|dailyplay|dareplay|rushplay|showplay|iqplay|iqrun|arriveplay|rematch)$/;
const UI_SILENT = /^(build|streetbuild|treat|party|hang|rthang|rthangroom|wear|qclaim|chest|loginclaim|popclaim|catchup|jobclaim|rushclaim|jarcollect|reqclaim|buy|shoppack|shopcos|shopcat|starter|restore|liferefill|shopad|adlife|shopbundle|adcoins|adhint)$/;
const uiKind = (el) => {
  const a = (el && el.dataset && el.dataset.act) || '';
  return UI_BACK.test(a) ? 'back' : UI_TAB.test(a) ? 'tab' : UI_OK.test(a) ? 'ok' : UI_SILENT.test(a) ? '' : 'click';
};
import './ui/r11-vir.css';
import './i18n-boss.js';
import { bigText } from './kit/a11y.js';
import { isBoss } from './game/boss.js'; // R17: CrazyGames happytime on boss clears
import * as bossUi from './ui/boss.js'; // R11 boss lane: boss every 20 levels, chests (src/game/boss.js)
import * as talk from './ui/talk.js'; // R16: talking cats (board bubbles, café guest lines, Settings > Cat chatter)

const HINT_COST = 60;
const UNDO_COST = 90;
const SCOOP_COST = 150;
const seatCost = () => econ.SEAT_COSTS[Math.min(S.seatBuys || 0, econ.SEAT_COSTS.length - 1)]; // 120 / 200 / 300 within one level
const EARLY = 15; // R16: the opening levels (about 30 minutes): one track on the win card, no Shop badge on the hub
const CAFE_FROM = 4; // the café hub is home from this level; levels 1-3 go straight to play
const S = { mode: 'home', n: 1, daily: false, show: false, area: 0, tries: {}, freeBack: {} }; // show: false | { kind: 'show', w, k, goal } | { kind: 'rush', w }
let game;
let busy = false; // guards async actions (ads) against double taps
let busyTok = null;
const guarded = (fn) => async (...a) => {
  if (busy) return;
  busy = true;
  const tok = (busyTok = {});
  const release = setTimeout(() => { if (busyTok === tok) busy = false; }, 20000); // a stalled ad/store call never locks every button
  try {
    await fn(...a);
  } finally {
    clearTimeout(release);
    if (busyTok === tok) busy = false;
  }
};

// ---- helpers ----
const dayNum = () => econ.dayOf(now());
const todayKey = () => String(dayNum());
// the daily puzzle is curated: of three generated candidates for the day, the board whose winning line holds the most
// decisions (bench chains, whole-carrier chains, lose-later traps, as measured by search.js decisions()) is kept
let dailyMemo = null;
function dailyLevel() {
  const day = dayNum();
  if (dailyMemo && dailyMemo.day === day) return dailyMemo.n;
  let best = 0, bs = -1;
  for (let i = 0; i < 3; i++) {
    const n = 100 + ((day * 3 + i) % 400);
    const m = generate(n).meta;
    const s = 3 * (m.chains || 0) + 4 * (m.chain3 || 0) + 2 * (m.late || 0) + (m.traps || 0) + (m.band ? 2 : 0);
    if (s > bs) { bs = s; best = n; }
  }
  dailyMemo = { day, n: best };
  return best;
}

// forgiving streak: one missed day a week is covered by a shield (the streak survives a two-day gap once per week)
const shieldFree = (today = dayNum()) => save.data.daily.shieldW !== econ.weekOf(+today);
function streak(today = dayNum()) {
  const d = save.data.daily;
  if (!d.last) return 0;
  const gap = +today - +d.last;
  return gap <= 1 || (gap === 2 && shieldFree(today)) ? d.streak : 0;
}
// attempts, seat prices and the Purr "lost" flag are per level; the daily puzzle reuses a level number, so it gets its own key
const triesKey = () => (S.show ? S.show.kind + (S.show.w || '') + (S.show.k || '') : S.daily ? 'd' : '') + S.n;

const homeInfo = () => ({
  coins: save.data.coins,
  level: save.data.level,
  streak: streak(),
  dailyDone: save.data.daily.doneDay === todayKey(),
});

// perk: free Hints every day (Biscuit 1, Clover +2). An older save with today's hintDay but no count has used one.
const hintsUsed = () => (save.data.cafe.hintDay === todayKey() ? Math.max(1, save.data.cafe.hintN || 0) : 0);
const hintFree = () => cafe.perkLevel('hint') > hintsUsed();

const hudInfo = () => ({
  lives: lifeGate() ? econ.lives(save.data, now()) : null, // hearts only matter once the first resident has moved in
  hintFree: hintFree(),
  coins: save.data.coins,
  boost: { ...save.data.boosters },
  costs: { hint: HINT_COST, undo: UNDO_COST, scoop: SCOOP_COST },
  canUndo: !!game.state && !game.demo && !game.busy() && canUndo(game.state),
  scoopOn: game.scoopMode,
  goal: goalPill(),
});
// Cat Show board: the gold goal's live progress, a small pill in the HUD (ok = gold still in reach / reached)
function goalPill() {
  const sh = S.show;
  if (!sh || sh.kind === 'rush' || !sh.goal || !game.state || game.demo) return null;
  const g = sh.goal;
  if (g.kind === 'chain') {
    const v = Math.min(g.n, S.chainBest || 0);
    return { text: t('pillChain', { v, n: g.n }), state: v >= g.n ? 'ok' : '' };
  }
  const v = game.state.benchPeak || 0;
  return { text: t('pillPeak', { v, n: g.n }), state: v > g.n ? 'bad' : v === g.n ? 'edge' : 'ok' };
}

const setTexts = () => {
  game.texts = [t('purrfect'), t('combo2'), t('combo3')];
  game.chainText = (n) => t('chainX', { n });
  game.lastSeatText = t('lastSeat');
  game.teachTexts = [t('teachBoards'), t('teachWaits')];
  if (game.pairCost) game.pairCost = t('pairSeats'); // a language switch mid-L9
  // R11 fix round 2 (sol-r12-2 fun): the pair tag names the queue in words: "Green in 3 carriers" (read at draw time)
  game.pairWait = (k, color) => { const c = t('col_' + COLORS[color]); return t(k === 1 ? 'pairWait1' : 'pairWait', { k, c: c.charAt(0).toLocaleUpperCase(save.data.settings.lang === 'tr' ? 'tr' : 'en') + c.slice(1) }); };
  document.title = t('title');
};
const peekColor = () => COLORS[game.board.cats[0].color];

// a booster costs one in stock, else coins. Returns false when neither is there.
function payBooster(k, cost) {
  const d = save.data;
  if (d.boosters[k] > 0) d.boosters[k]--;
  else if (d.coins >= cost) d.coins -= cost;
  else return false;
  save.commit();
  track('booster_use', { k });
  return true;
}
const canPayBooster = (k, cost) => save.data.boosters[k] > 0 || save.data.coins >= cost;

// ---- economy glue (rules live in game/econ.js; this file only wires them to the screens) ----
const lifeGate = () => cafe.RESIDENTS.some((r) => cafe.isBuilt(r.task.id)); // lives only matter once the first resident has moved in
const livesInfo = () => ({ n: econ.lives(save.data, now()), ms: econ.livesMs(save.data, now()) });
const dots = () => liveHub().dots; // the hub's badge budget (max 3 dots), see liveHub
const syncCoins = () => { ui.setCoins(save.data.coins); if (S.mode === 'play' && game.state) ui.setHud(hudInfo()); };
// roll the day/week/life timers forward (clock-guarded), persist when something changed
function econTick() {
  const d = save.data;
  const day = dayNum();
  const z = econ.clampAhead(d, day); // stamps left in the future by a wrong device date
  const a = econ.questsRoll(d, day) || z;
  const b = econ.showRoll(d, day);
  const before = d.lives.n;
  econ.livesTick(d, now());
  // retention timers: tip jar, resident requests, the Café Rush week, the first Show week (archive start)
  const res = resOwned();
  const z2 = live.clampAheadLive(d, now());
  const jt = d.jar.t;
  live.jarTick(d, now(), res.length);
  const r = live.reqTick(d, now(), res);
  const ru = live.eventsOpen(d) && live.rushRoll(d, econ.weekOf(day), 0);
  let f = false;
  if (live.eventsOpen(d) && !d.show.from) { d.show.from = econ.weekOf(day); f = true; }
  if (a || b || d.lives.n !== before || z2 || jt !== d.jar.t || r || ru || f) save.commit();
  if ((r || ru) && S.mode === 'cafe' && !ui.sheet && ui.screen === 'cafe' && !document.getElementById('arrival')) ui.cafe(cafeInfo());
}
// today's resident jobs count the same moments as the resident requests (R10)
const jobEv = (ev, n = 1) => r10.jobsEvent(save.data, dayNum(), resOwned(), ev, n);
function quest(ev, n = 1) {
  if (S.noQuest && S.mode === 'play') return; // a replayed daily puzzle farms no task progress
  if (ev === 'carrier') { live.reqEvent(save.data, ev, n); jobEv(ev, n); } // resident requests count the same moments ('win' only counts new levels, the daily and new Show medals)
  if (econ.questEvent(save.data, ev, dayNum(), n)) {
    if (ev === 'cat' || ev === 'carrier') save.commitSoon(); // R17 perf: no whole-save write inside a send
    else save.commit();
    if (S.mode === 'cafe') ui.setDots(dots());
  }
}
function questsInfo() {
  const d = save.data;
  econ.questsRoll(d, dayNum());
  return {
    login: econ.loginState(d, dayNum()),
    rewards: econ.LOGIN_REWARDS,
    tasks: d.quests.list.filter((x) => econ.taskDef(x.id)).map((x) => { const def = econ.taskDef(x.id); return { id: x.id, p: x.p, need: def.need, coins: def.coins, c: x.c, done: econ.taskDone(x) }; }),
    chest: { ready: econ.chestReady(d), opened: !!d.quests.chest },
    chestReward: econ.CHEST,
    jobs: jobsInfo(),
  };
}
// today's 2 resident jobs (R10): the first one finished pays; after the claim the slot names tomorrow's cat
function jobsInfo() {
  const d = save.data;
  const res = resOwned();
  if (!res.length) return null;
  const list = r10.jobsToday(d, dayNum(), res).map((j) => ({ ...j, name: resName(j.who) }));
  const tw = r10.jobsTomorrow(dayNum(), res);
  return { list, paid: d.jobs.paid, reward: r10.JOB_REWARD, tomorrow: { who: tw, name: resName(tw) }, ms: msToMidnight() };
}
// ---- Cat Show mastery: two fixed boards a week (the same for everyone), each with one published goal ----
// Board A: the fewest seats it can be cleared with (searched). Board B: the biggest bench chain on the generator's own
// winning line (so it is always possible), else a seats goal. Goals are computed once per board and kept in the save.
const weekNum = () => econ.weekOf(dayNum());
const showLevelOf = (w, k) => 120 + ((w * 2 + (k === 'b' ? 1 : 0)) % 380);
function seatsGoal(board) {
  const C = compile(board);
  let mark = board.meta.benchSize - 1; // the generator's own line never needs more
  for (let k = 1; k < mark; k++) if (searchWin(new Sim(C, k), 6000, false) === 1) { mark = k; break; }
  return { kind: 'seats', n: mark };
}
function chainGoal(board) { // the biggest bench chain (parked cats hopping in on one tap) along the generator's line
  const C = compile(board);
  const sim = new Sim(C, board.meta.benchSize);
  let best = 0;
  for (const id of board.meta.order || []) {
    const u = C.unitOf[id];
    if (u == null || !sim.free().includes(u) || !sim.apply(u)) break;
    best = Math.max(best, sim.boards.reduce((a, k) => a + k, 0));
  }
  return best >= 2 ? { kind: 'chain', n: Math.min(4, best) } : null;
}
function showGoal(w, k) {
  const d = save.data;
  const key = live.boardKey(w, k);
  if (d.show.goals[key]) return d.show.goals[key];
  const board = generate(showLevelOf(w, k));
  const g = (k === 'b' && chainGoal(board)) || seatsGoal(board);
  d.show.goals[key] = g;
  save.commit();
  return g;
}
const goalText = (g) => (g.kind === 'chain' ? t('goalChain', { n: g.n }) : t('goalSeats', { n: g.n }));
// ---- Café Rush: one normal board a week, timed, ranked against 19 practice bots ----
function rushLevel(w) {
  let n = 20 + ((w * 7) % 40);
  while (levelKind(n) !== 'normal') n++;
  return n;
}
const resOwned = () => cafe.RESIDENTS.filter((r) => cafe.isBuilt(r.task.id)).map((r) => r.id);
// R11 fix 2: the early resident thread (until three residents live in, up to L24): one named cat whose next payoff rides from the
// map (the featured goal) to the win card (the café bar) to the room (the build card), with the exact remaining action:
// the wins that pay the stars still missing (a hard level pays 2, super hard 3) or the build that brings them in
function threadInfo() {
  const d = save.data;
  const nr = d.level >= CAFE_FROM ? cafe.nextResident() : null;
  if (!nr || d.level > 24 || resOwned().length >= 3) return null; // the first sessions only: later the hub's own order rules
  const need = cafe.starsToResident(nr);
  const have = Math.min(need, cafe.stars());
  let wins = 0;
  for (let n = d.level, got = have; got < need && wins < 50; n++, wins++) got += { boss: 3, hard: 2 }[levelKind(n)] || 1;
  const next = cafe.pending(nr.task.area)[0];
  return { who: nr.id, name: nr.name, have, need, wins, task: cafe.loc((next || nr.task).name) };
}
// one funnel event per thread step and resident (map, win card, built), with the session it happened in
function threadStep(step, th) {
  if (!th) return;
  const k = step + ':' + th.who;
  S.thrSeen = S.thrSeen || {};
  if (S.thrSeen[k]) return;
  S.thrSeen[k] = 1;
  track('thread_' + step, { id: th.who, left: th.need - th.have, wins: th.wins, session: save.data.meta.sessions });
}
const resName = (id) => (cafe.RESIDENTS.find((r) => r.id === id) || {}).name || '';
const visName = (id) => (live.VISITORS[id] || {}).name || '';
const jarNow = () => live.jarState(save.data, now(), resOwned().length, cafe.love());
// R10 pop-up week: the event, its stamps (board A, board B, the week's first Daily), its postcard and the one next step
const popMedals = (w) => ({ a: !!live.medalOf(save.data, w, 'a'), b: !!live.medalOf(save.data, w, 'b') });
const cardInfo = (i) => { const c = r10.WEEKS[i]; return { i, name: cafe.loc(c.card), bg: c.bg, mid: c.mid || '', fg: c.fg, ev: cafe.loc(c.ev) }; };
function popInfo(w = weekNum()) {
  const d = save.data;
  const p = r10.popOf(w);
  const st = r10.popStamps(d, w, popMedals(w));
  const paid = !!d.pop.paid[w];
  const next = st.n >= r10.POP_STAMPS ? (paid ? null : { k: 'claim' }) : !st.a ? { k: 'board', w, b: 'a' } : !st.b ? { k: 'board', w, b: 'b' } : { k: 'daily', done: d.daily.doneDay === todayKey() };
  return { name: cafe.loc(p.ev), card: cardInfo(p.i), have: r10.hasCard(d, p.i), stamps: st, need: r10.POP_STAMPS, coins: r10.POP_COINS, paid, next, endsMs: econ.showEndsMs(dayNum(), now()) };
}
// the album (R2): 6 pages x 4 postcards; an empty slot names its week and where to get it
let albumPage = 0;
// an empty album opens on the page holding this week's postcard (page 1 alone can be all "Comes in 10 weeks")
const firstAlbumPage = () => { const d = save.data; if (d.album.pin >= 0 && !r10.pageDone(d, d.album.pin)) return d.album.pin; const i = r10.PAGES.findIndex((_, p) => r10.pageHave(d, p) > 0 && !r10.pageDone(d, p)); if (i >= 0) return i; const j = r10.PAGES.findIndex((_, p) => r10.pageHave(d, p) > 0); if (j >= 0) return j; return Math.max(0, r10.PAGES.findIndex((_, p) => pageInfo(p).cards.some((c) => c.src === 'now'))); };
// a full page's print hangs in a finished room: the room after the ones already holding a print, else the ground floor
function hangRoom(p) {
  const d = save.data;
  const done = cafe.AREAS.map((_, i) => i).filter((i) => cafe.areaDone(i));
  const held = Object.keys(d.album.hung).map(Number);
  const cur = held.find((k) => d.album.hung[k] === p);
  if (cur != null) return cur;
  return done.find((i) => !held.includes(i)) ?? 0;
}
// R11 ret: a page just completed: its print waits with Hang pre-selected, and the player goes straight to that room
function retPageDone(p) {
  rtg.setHang(save.data, p);
  save.commit();
  if (S.mode !== 'cafe') return; // the hub shows the hang card next time
  ui.hideSheet();
  S.area = hangRoom(p);
  hub.roomMode();
  ui.setCafeView('room');
  ui.cafe(cafeInfo());
  track('ret_page_done', { p });
}
function pageInfo(p) {
  const d = save.data;
  const pg = r10.PAGES[p];
  const w = weekNum();
  const open = live.eventsOpen(d);
  const cards = r10.pageCards(p).map((i) => {
    const c = cardInfo(i);
    if (r10.hasCard(d, i)) return { ...c, own: true };
    const ago = r10.catchWeeks(d, w, live.archiveWeeks(d, w)).find((x) => r10.popIndex(x) === i);
    const ahead = r10.nextCardWeek(d, w, i);
    // R11 fix round 2 (sol-r12-2 retention): the slot's exact next step, from the same rules as the map's album strip
    const step = open ? rtg.cardStep(d, w, i, d.daily.doneDay === todayKey()) : null;
    return { ...c, own: false, src: !open ? 'locked' : ahead === 0 ? 'now' : ago != null ? 'arch' : 'soon', weeks: ahead, step, endsMs: econ.showEndsMs(dayNum(), now()) };
  });
  const hungIn = Object.keys(d.album.hung).find((k) => d.album.hung[k] === p);
  return { p, name: cafe.loc(pg.name), print: pg.print, have: r10.pageHave(d, p), cards, done: r10.pageDone(d, p), pin: d.album.pin === p, hung: hungIn != null ? cafe.loc(cafe.AREAS[+hungIn].name) : '', from: live.EVENTS_FROM };
}
const albumInfo = () => ({ page: pageInfo(albumPage), pages: r10.PAGES.length, total: r10.cardsOwned(save.data), all: r10.WEEKS.length, prints: r10.PAGES.map((_, p) => r10.pageDone(save.data, p)) });
// friend results (R6): the latest replies to this player's dares, newest first, with Rematch on the exact board
function friendsInfo() {
  return save.data.fr.list.slice(0, 3).map((e) => ({ ...e, board: srcName(e.k, e.n), res: e.pg == null ? '' : dare.judge(e.m, e.pg, e.g) }));
}
function eventsInfo() {
  const d = save.data;
  const w = weekNum();
  const open = live.eventsOpen(d);
  if (!open) return { open, from: live.EVENTS_FROM };
  const th = econ.themeOf(w);
  const boards = ['a', 'b'].map((k) => ({ w, k, medal: live.medalOf(d, w, k), goal: showGoal(w, k) }));
  const arch = r10.catchWeeks(d, w, live.archiveWeeks(d, w)).map((x) => { const pi = r10.popIndex(x); const m = popMedals(x); return { w: x, ago: w - x, name: cafe.loc(r10.WEEKS[pi].ev), boards: ['a', 'b'].map((k) => ({ k, medal: live.medalOf(d, x, k) })), card: { own: r10.hasCard(d, pi), fg: r10.WEEKS[pi].fg, ok: !r10.hasCard(d, pi) && m.a && m.b && r10.catchOpen(d, w) } }; });
  // Rush: the board's cat count sets the bots' simulated times; the table shows the top 3 and you
  if (!(d.rush.week === w && d.rush.cats)) { d.rush.cats = generate(rushLevel(w)).cats.length; save.commit(); }
  const bots = live.rushBots(w, d.rush.cats);
  const all = [...bots, ...(d.rush.best ? [{ me: true, ms: d.rush.best }] : [])].sort((x, y) => x.ms - y.ms).map((e, i) => ({ ...e, rank: i + 1 }));
  const mine = all.find((e) => e.me);
  const rank = mine ? mine.rank : 0;
  const rows = all.slice(0, 3);
  if (!mine) rows.push({ me: true, ms: 0, rank: '-' });
  else if (rank > 3) rows.push(mine);
  const ev = live.eventOf(w);
  const showDot = ev !== 'rush' && boards.some((b) => !b.medal) && econ.showEndsMs(dayNum(), now()) < econ.DAY_MS;
  return {
    open,
    ev,
    daily: dailyInfo(),
    show: { name: cafe.loc(th.name), color: th.color, endsMs: econ.showEndsMs(dayNum(), now()), boards, bronze: live.SHOW_BRONZE_COINS, gold: live.SHOW_GOLD_COINS, rosette: !!d.show.decor[th.id], archN: arch.length, dot: showDot },
    arch: { weeks: arch, catchOpen: r10.catchOpen(d, w) },
    pop: ev === 'pop' ? popInfo(w) : null,
    friends: { list: friendsInfo(), n: d.fr.list.length },
    rush: { endsMs: econ.showEndsMs(dayNum(), now()), best: d.rush.best, rank, rows, pend: d.rush.pend && { rank: d.rush.pend.rank, prize: live.rushPrize(d.rush.pend.rank) }, dot: !!d.rush.pend },
  };
}
function cafeSheetInfo() {
  const d = save.data;
  return {
    jar: jarNow(),
    resN: resOwned().length,
    wear: d.cafe.wear,
    reqs: d.req.list.map((x) => { const def = live.reqDef(x.k); return { x, name: resName(x.who), snack: lui.snack(x.s), reward: { coins: def.coins, hearts: def.hearts }, ready: x.p >= x.need }; }),
    nextMs: Math.max(0, d.req.next - now()),
  };
}
const msToMidnight = () => Math.max(0, econ.dayStart(dayNum() + 1) - now());
const dailyInfo = () => ({ shield: shieldFree(), streak: streak(), done: save.data.daily.doneDay === todayKey(), ms: msToMidnight(), chests: Array.from({ length: 7 }, (_, i) => live.streakChest(i + 1)), drec: drecInfo() });
// the hub's retention layer: rail badges, the goals strip, pets due, outfits, today's visitor, Rush cups (max 3 dots)
function liveHub() {
  const d = save.data;
  const day = dayNum();
  const w = weekNum();
  const res = resOwned();
  const jar = jarNow();
  const open = live.eventsOpen(d);
  const dailyDone = d.daily.doneDay === todayKey();
  const nr = cafe.nextResident();
  const need = nr ? cafe.starsToResident(nr) : 0;
  const showWeek = open && live.eventOf(w) !== 'rush';
  const showW = showWeek ? { have: ['a', 'b'].filter((k) => live.medalOf(d, w, k)).length, need: 2 } : null; // this week's Cat Show medals
  // today's resident job (R10): the slot with the most progress; after the claim the slot names tomorrow's cat
  const jobs = r10.jobsToday(d, day, res);
  const jb = d.jobs.paid ? null : jobs.slice().sort((x, y) => y.p / y.need - x.p / x.need)[0];
  const thread = threadInfo();
  threadStep('map', thread);
  const goals = live.goals(d, now(), { thread, stars: cafe.stars(), res, streak: streak(), dailyDone, party: cafe.partyOpen() ? cafe.PARTY_COST : 0, show: showW, job: jb ? { ...jb, name: resName(jb.who) } : null })
    .map((g) => ({ ...g, name: g.k === 'outfit' ? resName(g.who) : g.name, rw: goalReward(g) }));
  // badge budget: at most 3 red dots, claimable rewards first, then an event ending within a day, then the daily puzzle
  const want = [
    ['quests', econ.dots(d, now()).quests],
    ['jar', jar.pct >= 0.5 || live.reqReady(d)],
    ['show', open && (!!d.rush.pend || (showWeek && ['a', 'b'].some((k) => !live.medalOf(d, w, k)) && econ.showEndsMs(day, now()) < econ.DAY_MS))],
    ['daily', !dailyDone],
  ];
  const on = {};
  let n = 0;
  for (const [k, v] of want) { on[k] = !!v && n < 3; if (on[k]) n++; }
  const vid = live.visitorToday(d, day);
  // the one spotlight (priority: claimable > finished request > full jar > next build)
  const reqI = d.req.list.findIndex((x) => x.p >= x.need);
  const claim = econ.dots(d, now()).quests ? 'quests' : open && d.rush.pend ? 'rush' : '';
  const buildOk = cafe.partyOpen() ? cafe.stars() >= street.nextTask(d).cost : cafe.anyAffordable();
  let spot = live.spotlight({ claim, req: reqI, jarFull: jar.on && jar.pct >= 1, build: buildOk });
  if (spot && spot.k === 'req') {
    const x = d.req.list[reqI];
    const o = live.OUTFITS.find((f) => live.heartsOf(d, x.who) < f.need);
    spot = { ...spot, who: x.who, name: resName(x.who), outfit: o ? o.id : '' };
  }
  const shown = spot && spot.k === 'req' ? goals.filter((g) => !(g.k === 'req' && g.i === spot.i)) : goals;
  // visiting cats live in the house: each owned one has a furnished nook in a built room (in the order they joined)
  const floors = cafe.AREAS.filter((_, i) => i === 0 || cafe.areaDone(i - 1)).length;
  const nooks = live.visitorsOwned(d).map((id, j) => ({ id, name: visName(id), area: j % Math.max(1, floors), set: Math.max(0, live.SEASONS.findIndex((x) => x.visitors.includes(id))), line: live.VISITORS[id].line }));
  // in the room: a finished request is a Claim bubble over its resident, a newcomer's first ask shows over the cat too
  // (task, progress, reward), and right after a claim the resident says when to come back for the next one
  const reqs = d.req.list.map((x, i) => { const o = live.OUTFITS.find((f) => live.heartsOf(d, x.who) < f.need); const def = live.reqDef(x.k); return { i, who: x.who, name: resName(x.who), ready: x.p >= x.need, outfit: o ? o.id : '', fresh: d.req.fresh === x.who, task: lui.reqText(x), p: x.p, need: x.need, coins: def.coins, hearts: def.hearts }; });
  return {
    spot,
    // the hub's thread: the next resident and the stars still to spend before they move in (shown on the build card)
    nextRes: nr && { id: nr.id, name: nr.name, left: need },
    nooks,
    reqs,
    after: S.afterClaim && S.afterClaim.who && res.includes(S.afterClaim.who) ? S.afterClaim : null,
    jar,
    daily: { streak: streak(), done: dailyDone, ms: msToMidnight() },
    dots: on,
    goals: shown.slice(0, 4),
    thread,
    // residents whose request already shows as a bubble over them in a room (the goals strip skips those)
    bubbleWho: d.req.list.filter((x) => x.p >= x.need || d.req.fresh === x.who).map((x) => x.who),
    wear: d.cafe.wear,
    pet: Object.fromEntries(res.filter((id) => live.petReady(d, id, day)).map((id) => [id, 1])),
    visitor: vid && { id: vid, name: visName(vid), line: live.VISITORS[vid].line, gift: d.season.visDay < day },
    cups: lui.cupsHtml(d.rush.cups),
  };
}
// R11: what a hub goal pays, shown on the featured goal (null: a visitor, an outfit or a party, shown by its art)
function goalReward(g) {
  if (g.k === 'req') { const def = live.reqDef(g.req.k); return def ? { coins: def.coins, hearts: def.hearts } : null; }
  if (g.k === 'job') return { ...r10.JOB_REWARD };
  if (g.k === 'daily') return live.streakChest(streak() + 1);
  if (g.k === 'show') return { coins: live.SHOW_BRONZE_COINS };
  if (g.k === 'thread') return { hint: 1 }; // a newcomer moves in with a free Hint (build())
  return null;
}
// after a claim: the next reason to come back, said by the resident who was just thanked
function nextReturn() {
  const d = save.data;
  const open = d.req.list.find((x) => x.p < x.need);
  if (open) return t('nextAskNow', { name: resName(open.who), task: lui.reqText(open) });
  const ms = Math.max(0, d.req.next - now());
  return t('nextAskIn', { t: fmtWait(ms) });
}
const fmtWait = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}${t('hShort')} ${m % 60 ? (m % 60) + t('mShort') : ''}`.trim() : `${m}${t('mShort')}`; };
// reminders while the page sits in the background (opt-in, kit/notify.js)
function planNotify() {
  const d = save.data;
  const list = [];
  const j = jarNow();
  if (j.on && j.fullMs > 0) list.push({ tag: 'jar', ms: j.fullMs, title: t('nJarTitle'), body: t('nJarBody') });
  if (lifeGate() && d.lives.n < econ.MAX_LIVES) list.push({ tag: 'lives', ms: econ.livesMs(d, now()) + (econ.MAX_LIVES - d.lives.n - 1) * econ.REGEN_MS, title: t('nLivesTitle'), body: t('nLivesBody') });
  if (live.eventsOpen(d)) list.push({ tag: 'show', ms: econ.showEndsMs(dayNum(), now()) + 60000, title: t('nShowTitle'), body: t('nShowBody') });
  notify.plan(list);
}
const shopInfo = () => ({ owned: save.data.iap.owned, noAds: iap.noAds(), store: iap.available() });
// the Starter Bundle: a badge on the hub rail once it is due (never a pop-up on café entry) and one offer card on a
// quiet win card (no café build waiting), only where it can really be bought
const starterOpen = () => iap.available() && !save.data.iap.owned.starter && !save.data.iap.owned.noads && save.data.level > 10;
// a lost bench ends the attempt; taking a continue gives the life back (and the attempt is no longer a first-try win)
function continued(kind) {
  S.continued = true;
  if (S.lifeLost) { econ.addLife(save.data, 1); S.lifeLost = false; }
  save.commit();
  track('continue_taken', { kind, n: S.n });
}
// start a level unless the life gate is shut
function tryStart(n, daily = false, show = false) {
  if (show) { startLevel(n, false, show); return true; }
  if (daily) { startLevel(n, true); return true; } // the daily puzzle: retries are free, no life is spent // Cat Show / Café Rush retries are free and unlimited: no life is spent
  if (lifeGate() && econ.lives(save.data, now()) <= 0) {
    ui.noLives({ ms: econ.livesMs(save.data, now()), coins: save.data.coins, cost: econ.LIFE_REFILL_COST, ad: ads.available() });
    if (ads.available()) ads.offer('life');
    track('no_lives_gate', { n });
    return false;
  }
  startLevel(n, daily);
  return true;
}

// ---- flow ----
// the Cat Show rosettes the player has won hang on the café wall (one per theme, in its colour)
const rosettes = () => econ.earnedDecor(save.data).map((id) => econ.THEMES.find((x) => x.id === id)).filter(Boolean).map((x) => ({ id: x.id, color: x.color, name: cafe.loc(x.name) }));
const cafeInfo = (justBuilt, L = liveHub()) => ({ wall: wallInfo(), street: streetInfo(), reno: renoInfo(), live: L, stars: cafe.stars(), level: save.data.level, area: S.area, justBuilt, coins: save.data.coins, lives: livesInfo(), dots: L.dots, day: dayNum(), offer: starterOpen() && save.data.level > EARLY && save.data.shop.offerDay !== dayNum(), rosettes: rosettes(), party: cafe.partyOpen() ? { n: cafe.parties(), cost: cafe.PARTY_COST, ok: cafe.stars() >= cafe.PARTY_COST, coins: cafe.PARTY_REWARD.coins } : null });

// R10 café keepsakes: framed album prints hung per room, the Daily record's pennant and clock (ground floor)
function wallInfo() {
  const d = save.data;
  const hung = Object.fromEntries(Object.entries(d.album.hung).map(([room, p]) => [room, r10.PAGES[p] ? r10.PAGES[p].print : 0]));
  return { hung, pennant: r10.drecHas(d, 'pennant'), clock: r10.drecHas(d, 'clock'), frame: r10.drecHas(d, 'frame') };
}
// Cat Street (past the rooftop) and the renovation sets of a finished room
function streetInfo() {
  const d = save.data;
  const nt = street.nextTask(d);
  return { open: cafe.partyOpen(), shops: street.keepers(d).length, done: street.housesDone(d), at: street.atPiece(d), next: nt, left: street.houseLeft(d), ok: cafe.stars() >= nt.cost, looks: Object.fromEntries(street.ALL_SHOPS.map((x) => [x.id, street.shopLook(d, x.id)])) };
}
function renoInfo() {
  const d = save.data;
  const a = cafe.AREAS[S.area];
  if (!a || !cafe.areaDone(S.area) || !cafe.partyOpen()) return null; // renovation opens once the whole house is built
  const featured = live.seasonDef(live.seasonOf(weekNum())).id;
  const ti = street.renoNext(d, a.id, featured);
  const set = street.RENO[ti];
  return { area: a.id, style: d.cafe.style[a.id] || '', owned: street.RENO.filter((_, i) => street.renoOwned(d, a.id, i)).map((r) => r.id), ti, set: set && { id: set.id, name: cafe.loc(set.name), cost: set.cost, ok: cafe.stars() >= set.cost, featured: set.id === featured } };
}

function startHome() {
  if (S.mode === 'play' && game) {
    game.flushWin(); // a cleared board is credited even when the player leaves early
    if (game.state && game.state.failed && !game.failFired && !game.demo) { // the fail card was still on its way: the loss counts anyway
      game.failFired = true;
      game.over = true;
      onFail(true);
    }
  }
  S.winToken = (S.winToken || 0) + 1; // a pending Next (interstitial) or clip job of the left level is dropped
  clearTimeout(S.clipTimer);
  if (clip) clip.clear();
  if (S.mode === 'play' && game.state && !game.over && !game.demo && game.state.aliveCount > 0) track('level_quit', { n: S.n });
  S.mode = 'home';
  hub.home(); // the hub opens on the level map
  game.autoHint = false;
  game.load(generate(1), { demo: true, top: 146, bottom: 246 }); // the hero shows the real move: cats run into their carrier
  if (save.data.level >= CAFE_FROM) {
    S.mode = 'cafe';
    S.area = cafe.currentArea();
    const info = cafeInfo();
    S.offerSeen = !!info.offer; // the Shop 'Offer' badge shows on one hub visit a day
    ui.cafe(info); // the Starter Bundle waits as a badge on the rail: never a pop-up over the room
  } else ui.home(homeInfo());
}

// one-line hint card: the tutorial levels and the teaching level of each new mechanic
const TUT_KEY = { 1: 'tut1', 2: 'tut2', 3: 'tutHeart', 4: 'tut4', 5: 'tutChain', 7: 'tutQuilt', 8: 'tutDog', 12: 'tutYarn', 41: 'tutMystery', 55: 'tutFrozen' }; // mystery on L41: L40 is a boss (R11 boss lane)
Object.assign(TUT_KEY, cui.TUT);

function startLevel(n, daily = false, show = false) {
  S.afterClaim = null; // the "come back" note lives for one hub visit
  if (S.offerSeen) { S.offerSeen = false; save.data.shop.offerDay = dayNum(); save.commit(); }
  S.mode = 'play';
  S.n = n;
  S.daily = daily;
  S.show = show;
  S.chainBest = 0; // the biggest bench chain of this attempt (Show board goal)
  S.rushT0 = 0; // Café Rush: the clock starts on the first cat out
  S.winToken = (S.winToken || 0) + 1; // a pending win-card job (clip preview) of an older attempt is dropped
  clearTimeout(S.clipTimer);
  game.autoHint = !daily && !show && n <= 3; // L4 is a real choice: no tap-by-tap guide, only a nudge after a costly park
  game.hintWait = game.autoHint ? 3 : 0; // R13: the L1-3 arrow shows only once the player has hesitated 3 s
  const board = boardOf(n, show && show.kind === 'friend' ? show.rev : S.qaRev || BOARD_REV); // a curated L6 / L9 / L11 from rev 3 on, L7 from rev 4 (core/curated.js)
  if (show && show.kind === 'friend') board.meta.benchSize = show.b; // the sender's seats: the exact board they played
  const tries = (S.tries[triesKey()] = (S.tries[triesKey()] || 0) + 1);
  S.continued = false;
  S.lifeLost = false;
  S.seatBuys = S.seatN === triesKey() ? S.seatBuys || 0 : 0; // the seat price keeps climbing across retries of one level
  S.seatN = triesKey();
  S.undid = false;
  S.dayKey = todayKey(); // one snapshot decides daily-repeat for the whole attempt, even across midnight
  S.noQuest = daily && save.data.daily.doneDay === S.dayKey;
  const special = daily || show; // the daily puzzle and the Cat Show board: no perks, no lessons
  const perks = [];
  // Purr Streak bonus earned by the previous wins: a free Hint (and a Scoop at 5), plus a bench seat for this level and
  // every retry of it until it is cleared (kept in the save: leaving for the café or reloading never loses the seat)
  if (!daily && !show && n === save.data.level && save.data.purr.pend) {
    const k = econ.purrConsume(save.data);
    if (k) {
      save.data.boosters.hint++;
      if (k > 1) save.data.boosters.scoop++;
      save.data.purr.seatLv = n;
      save.commit();
      track('purr_bonus', { k, n });
      perks.push(t(k > 1 ? 'purrBonusToast2' : 'purrBonusToast'));
    }
  }
  if (!daily && !show && save.data.purr.seatLv === n) board.meta.benchSize++;
  // perk: +1 bench seat on a hard level: the first try (Luna), every try once Noodle stacks on it
  const seatLv = cafe.perkLevel('seat');
  if (!special && board.meta.kind !== 'normal' && seatLv && (tries === 1 || seatLv >= 2)) {
    board.meta.benchSize++;
    perks.push(t('perkSeatToast', { name: cafe.perkOwner('seat').name }));
  }
  // perk: a free Scoop on every 5th level (Pudding), every 3rd once Captain stacks on it; once per level
  const scoopLv = cafe.perkLevel('scoop');
  if (!special && scoopLv && n % (scoopLv >= 2 ? 3 : 5) === 0 && save.data.cafe.scoopLevel !== n) {
    save.data.cafe.scoopLevel = n;
    save.data.boosters.scoop++;
    save.commit();
    perks.push(t('perkScoopToast', { name: cafe.perkOwner('scoop').name }));
  }
  if (!special && shopRules.cushionAt(save.data, n)) { board.meta.benchSize++; save.commit(); perks.push(t('shCushOn')); } // shop Extra Cushion (src/game/shop.js)
  // a bench of a different size than last level is announced once (hard levels bring a smaller one)
  const bs = board.meta.benchSize;
  if (!special && n > 3 && S.lastBench && S.lastBench !== bs) perks.push(t('benchSeats', { n: bs }));
  S.lastBench = bs;
  if (!special && board.meta.flavour && tries === 1 && !TUT_KEY[n] && !board.meta.cur) perks.unshift(t('flav_' + board.meta.flavour)); // the board's flavour, named once
  setTexts();
  const friend = !!show && show.kind === 'friend';
  // a friend's challenge: the one rule a recipient needs, with the front carrier and a cushion ringed until the first tap
  // R11: a curated board (core/curated.js) names its idea on the first try and the way through on a retry: on the card
  // under a 7-row board, as a toast on an 8-row one (a card there would sit on the bottom row of a 667px phone)
  const curLine = !special && board.meta.cur ? t((tries > 1 ? 'curTry_' : 'curIdea_') + board.meta.cur) : '';
  // R11 fix round 2 (sol-r12-2 pres): every curated board (7 or 8 rows, L9 included) gets the card: since fix round 1 the
  // board keeps a measured slot for it, so L9's full rule reads on two lines instead of an ellipsised toast
  if (curLine && !curCard(board)) perks.push(curLine);
  const tut = friend ? t('dareTeach') : !special && TUT_KEY[n] ? t(TUT_KEY[n]) : curCard(board) ? curLine : '';
  S.tutDrop = !!tut; // the hint card collapses after the first tap (R13: the tutorials too, one line each)
  S.scare = !special && n === 4 ? 1 : 0; // L4: one nudge once a park has cost the win
  S.scareMoves = 0;
  S.tut3b = false;
  S.curCue = '';
  S.tut = tut;
  // R11 fix round 1 (pres): the card's own slot under the board (game.js layout). R11 fix round 2: on a curated board the
  // slot fits the taller of the rule and the cue that may replace it mid-level (the pair parked / every seat full)
  const tbs = tut ? [tut, ...(!friend && !special && !TUT_KEY[n] && board.meta.cur ? [t(board.meta.cur === 'pair' ? 'curPairPark' : 'curFull')] : [])].map(tutBox) : [];
  const tb = tbs.length ? tbs.reduce((x, y) => (y.h > x.h ? y : x)) : null;
  game.load(board, { extraBottom: tut ? 64 : 0, tipExtra: tb ? tb.extra : 0, tutH: tb ? tb.h : 0 });
  game.rulesTeach = friend;
  game.waitTags = !special && (n === 4 || (!!board.meta.cur && tries >= 3)); // L4's clue: the free cats show how many carriers they would wait on a cushion (R11 fun: a curated lesson's 3rd try brings it back)
  game.pairCost = !special && board.meta.cur === 'pair' && n === 9 ? t('pairSeats') : ''; // R11 fix round 1: L9's pair wears its seat cost before the first tap (game/r11-fun.js); R12: L10 (the old L9) is the test, no tag over its row-6 cats
  S.teach = !special && (!!TUT_KEY[n] || !!board.meta.cur); // R11 fun: a teaching level's free rewind goes back to the tap that cost the win
  game.funGhost = (!show || friend) && (S.teach || n <= 20); // R11 fun: a park shows its cushions and the carrier it waits for
  clip.clear();
  S.bench0 = board.meta.benchSize; // the seats this attempt started with (a friend challenge link carries them)
  ui.none();
  ui.play({ ...hudInfo(), level: n, daily, show: show ? (show.kind === 'friend' ? t('dareTitle') : show.kind === 'rush' ? t('rush') : t('showBoardN', { k: show.k.toUpperCase() })) : false, rush: !!show && (show.kind === 'rush' || (show.kind === 'friend' && show.m === 'time')), tut });
  cui.levelStart(n, !!special, board); // pack room + chip, pack / new-piece cards
  const shapeCard = sui.levelStart(n, !!special, board); // shape lane: one-time card for the first shaped / folded board
  ordUi.startOrder(n, board, special, S.teach || shapeCard); // adoption order: intro card + the keeper strip (normal levels only); R16: a lesson board keeps to its one message
  bossUi.levelStart(n, !!special, board); // boss lane: intro card, HP nameplate, board frame (boss levels)
  track('level_start', { n, daily });
  if (!special && n === 4) funnel('l4_start');
  if (!special && n === 10) funnel('l10_reach');
  if (perks.length) setTimeout(() => { if (S.mode === 'play' && S.n === n) perks.forEach((p, i) => setTimeout(() => ui.toast(p), i * 1500)); }, 500);
}

// Café Rush: the run clock under the board (starts on the first cat out, freezes on the win card)
setInterval(() => {
  const el = S.mode === 'play' && timed() && ui.screen === 'play' ? document.getElementById('rushclock') : null;
  if (el) el.textContent = ((S.rushT0 ? performance.now() - S.rushT0 : 0) / 1000).toFixed(1) + 's';
}, 100);

function onFree({ ids, step, purrfect }) {
  if (game.demo) return;
  if (!S.undid) quest('cat', ids.length); // replays after a paid undo do not count twice
  if (!S.undid && !(S.noQuest && S.mode === 'play')) { for (const id of ids) live.reqEvent(save.data, 'cat', 1, game.board.cats[id].color); jobEv('cat', ids.length); }
  if (timed() && !S.rushT0) S.rushT0 = performance.now();
  if (S.show && S.show.kind === 'friend' && !S.dareMoved) { S.dareMoved = true; track('dare_first_move', { i: S.show.i || '', m: S.show.m }); }
  audio.mrrp(step);
  if (purrfect) audio.pop();
}

function onBonk(r) {
  if (game.demo) return;
  audio.mew();
  haptics.heavy();
  ui.setHud(hudInfo());
  track('bonk', { n: S.n });
}

// Cat Show board won: bronze for the clear, gold when the published goal was met (seats peak or bench chain). Each new
// medal pays coins; gold on both boards of a week hangs that theme's rosette in the café.
// Café Rush won: the time from the first cat out to the clear; the best of the week is ranked against practice bots.
function onShowWin() {
  const d = save.data;
  const sh = S.show;
  const peek = peekColor();
  audio.clear();
  haptics.success();
  if (sh.kind === 'friend') return onFriendWin();
  if (sh.kind === 'rush') {
    const ms = S.lastMs || 0;
    econTick(); // a week that turned over mid-run pays last week's prize first
    const prev = sh.w === weekNum() ? d.rush.best || 0 : 0;
    const best = sh.w === weekNum() && live.rushResult(d, ms);
    // the split against the personal best: the number a second run is trying to beat
    const split = prev && ms > 0 ? ' · ' + t(best ? 'rushFaster' : 'rushSlower', { d: (Math.abs(ms - prev) / 1000).toFixed(1) }) : '';
    const bots = live.rushBots(sh.w, d.rush.cats || game.board.cats.length);
    const rank = live.rushRank(bots, Math.min(ms, d.rush.best || ms));
    save.commit();
    track('rush_win', { ms: Math.round(ms), rank, best });
    ui.win({ stars: 1, title: best ? 'winTitle' : 'winTitle2', coins: 0, peek, purr: t('rushTime', { t: (ms / 1000).toFixed(1), n: rank }) + (best ? ' · ' + t('showBest') : '') + split, ach: [], show: true, again: true, showTag: t('rush'), ...shareOn(rank <= 3 ? 'rush3' : null) });
    return;
  }
  const goal = sh.goal;
  const peak = game.state ? game.state.benchPeak : 0;
  const gold = goal.kind === 'chain' ? S.chainBest >= goal.n : peak <= goal.n;
  const r = live.showMedal(d, sh.w, sh.k, gold);
  if (r.bronze || r.gold) { live.reqEvent(d, 'win'); jobEv('win'); } // a new Show medal counts for requests, a replay does not
  const popWk = sh.w === weekNum() && live.eventOf(sh.w) === 'pop';
  const popNow = popWk && r.bronze && r10.popReady(d, sh.w, popMedals(sh.w)); // the pop-up's 3rd stamp
  let rosette = false;
  if (r.gold && live.bothGold(d, sh.w) && !d.show.decor[econ.themeOf(sh.w).id]) { d.show.decor[econ.themeOf(sh.w).id] = 1; rosette = true; }
  save.commit();
  track('show_board_win', { w: sh.w, k: sh.k, gold, peak, chain: S.chainBest, stamps: r.stamps });
  const line = gold ? t('medalGoldWon') : t('medalBronzeWon', { goal: goalText(goal) });
  const pop = popWk && r.bronze ? ' · ' + t(popNow ? 'popReadyLine' : 'popStampLine', { n: r10.popStamps(d, sh.w, popMedals(sh.w)).n, m: r10.POP_STAMPS }) : '';
  ui.win({ stars: 1, title: gold ? 'winTitle' : 'winTitle2', coins: r.coins, coinsBefore: d.coins - r.coins, peek, purr: line + (rosette ? ' · ' + t('rosetteWon') : '') + pop, ach: [], show: true, showTag: t('showBoardN', { k: sh.k.toUpperCase() }), ...shareOn(gold ? 'gold' : null) });
}

function onWin(stars) {
  ui.setTut('');
  S.dailyFirst = false;
  if (timed()) S.lastMs = S.rushT0 ? performance.now() - S.rushT0 : 0; // before the clip: its burned-in dare carries the time
  prepClip();
  if (S.show) return onShowWin();
  const d = save.data;
  const dayKey = S.dayKey || todayKey();
  const dailyRepeat = S.daily && d.daily.doneDay === dayKey;
  S.dailyFirst = S.daily && !dailyRepeat; // today's Daily, first clear: a share moment
  // a daily already cleared today pays nothing (no coin farming)
  // perk: +5 coins per coin-perk level on every win (Mochi 1, Pepper +2)
  const first = !S.daily && S.n === d.level;
  // coins pay on a first clear (and the daily); replaying an old level only drops a few coins, so it cannot be farmed
  const full = first || S.daily;
  // a flat base that grows with the level, a bonus for a tidy bench (it teaches: fewer seats used = more coins), the
  // hard / super-hard bonus, the daily bonus and the café perks; every part is listed on the win card
  const peakUsed = game.state ? game.state.benchPeak : 0;
  const parts = [];
  if (dailyRepeat) { /* a daily already cleared today pays nothing (no coin farming) */ } else if (!full) parts.push({ k: 'payReplay', n: 5 });
  else {
    parts.push({ k: 'payBase', n: 20 + Math.floor(S.n / 5) });
    const tidy = peakUsed <= 1 ? 10 : peakUsed <= 2 ? 5 : 0;
    if (tidy) parts.push({ k: 'payTidy', n: tidy, v: peakUsed });
    if (stars >= 2) parts.push({ k: stars === 3 ? 'paySuper' : 'payHard', n: stars === 3 ? 20 : 10 });
    if (S.daily) parts.push({ k: 'payDaily', n: 25 });
    if (S.daily) parts.push({ k: 'payStreak', n: live.streakChest(streak(+dayKey) + 1).coins }); // the streak chest (its boosters below)
    const perk = 5 * cafe.perkLevel('coins') + cafe.love();
    if (perk) parts.push({ k: 'payCafe', n: perk });
    if (first) parts.push(...ord.payParts(S.n, game.board.meta.kind)); // Urgent / VIP order bonus
  }
  const reward = parts.reduce((t, p) => t + p.n, 0);
  let cafeStars = 0;
  if (first) {
    d.level++;
    cafeStars = stars; // a first clear pays its star count into the café (normal 1, hard 2, super hard 3)
    cafe.addStars(cafeStars);
  }
  if (!S.daily) d.bestStars[S.n] = Math.max(d.bestStars[S.n] || 0, stars);
  let chest = null;
  let drecNew = null;
  if (S.daily && d.daily.doneDay !== dayKey) {
    if (d.daily.last && d.daily.streak && +dayKey - +d.daily.last === 2 && shieldFree(+dayKey)) d.daily.shieldW = econ.weekOf(+dayKey); // the missed day spent this week's shield
    d.daily.streak = streak(+dayKey) + 1; // one day snapshot (taken at level start) for the whole daily bookkeeping
    chest = live.streakChest(d.daily.streak);
    econ.grant(d, { ...chest, coins: 0 }); // the chest's coins are in the pay breakdown
    live.reqEvent(d, 'daily');
    drecNew = r10.drecClear(d, +dayKey); // the permanent Daily record: this date counts once
    if (live.eventsOpen(d)) r10.popDaily(d, econ.weekOf(+dayKey)); // a pop-up week's first Daily clear stamps the pop-up
    d.daily.last = dayKey;
    d.daily.doneDay = dayKey;
  }
  d.coins += reward;
  // economy: Purr Streak, daily tasks, resident requests (a replayed daily puzzle pays nothing)
  const firstTry = first && S.tries[triesKey()] === 1 && !S.continued && d.purr.lost !== S.n;
  if (first) econ.purrWin(d, firstTry); // a replay of an old level never touches the streak
  if (!S.daily && d.purr.lost === S.n) d.purr.lost = 0;
  if (first && d.purr.seatLv === S.n) d.purr.seatLv = 0; // the streak's bench seat is used up once its level is cleared
  quest('win');
  if (full && !dailyRepeat) jobEv('win');
  if (full && !dailyRepeat && game.state && game.state.benchPeak <= 2) jobEv('tidy');
  if (full && !dailyRepeat) live.reqEvent(d, 'win'); // a replayed old level or daily never fills a resident's 'win' request
  if (game.board.meta.kind !== 'normal') quest('hard');
  if (full && !dailyRepeat && game.state && game.state.benchPeak <= 2) live.reqEvent(d, 'tidy');
  const purr = S.daily ? '' : d.purr.pend ? t('purrReady') : d.purr.n > 0 ? t('purrProg', { n: d.purr.n, g: econ.purrGoal(d) }) : '';
  save.commit();
  track('level_win', { n: S.n, stars, firstTry });
  if (cur() && first) track('cur_win', { n: S.n, cur: cur(), tries: S.tries[triesKey()] || 1, undid: !!S.undid, peak: peakUsed });
  if (first) for (const [lv, k] of [[1, 'l1'], [3, 'l3'], [10, 'l10']]) if (S.n === lv) funnel(k);
  audio.clear();
  haptics.success();
  const canBuild = !S.daily && d.level >= CAFE_FROM && cafe.anyAffordable();
  // R16 (sol-r15 fix 1): the first ~30 minutes stay on one track: Next plus one café line on the win card, and the first
  // affordable build leads one win card only (after that the café line stays a quiet Build button)
  const early = !S.daily && S.n <= EARLY;
  const buildMain = canBuild && !d.meta.buildNudge;
  if (buildMain) d.meta.buildNudge = 1;
  // the title follows how cleanly it went, not the star payout
  const peak = game.state ? game.state.benchPeak : 0;
  const title = !S.undid && !S.continued && peak <= 1 ? 'winTitle' : !S.continued && peak <= 2 ? 'winTitle2' : 'winTitle1';
  const res = cafe.RESIDENTS.filter((r) => cafe.isBuilt(r.task.id)).at(-1); // the newest resident peeks over the card
  const nextTask = !S.daily && d.level >= CAFE_FROM ? cafe.ALL_TASKS.find((x) => !cafe.isBuilt(x.id)) : null;
  const nr = nextTask && cafe.nextResident();
  const th = !S.daily ? threadInfo() : null;
  const cafeNext = nextTask && { sprite: nextTask.sprite, cost: nextTask.cost || 1, name: cafe.loc(nextTask.name), stars: cafe.stars(), res: nr && { id: nr.id, name: nr.name, left: Math.max(0, cafe.starsToResident(nr) - cafe.stars()) }, thread: th };
  threadStep('win', th);
  // what the player pulled off, from their own moves only: the best bench chain, a clear without parking
  const ach = [];
  if (S.chainBest >= 2) ach.push({ k: 'chain', text: t('achChain', { n: S.chainBest }) });
  if (peak === 0) ach.push({ k: 'nobench', text: t('achNoBench') });
  // the win card is the payoff moment: never an upsell on it (the Starter Bundle shows once, on a lost bench instead)
  const pay = parts.length > 1 || (parts[0] && parts[0].k === 'payReplay') ? parts.map((p) => `${t(p.k, { n: p.v })} +${p.n}`).join(' · ') : '';
  // R11 fix 2: the replay card keeps only the order bonus in words (the rest of the breakdown is the coin chip's title)
  const payHi = parts.filter((p) => p.k === 'payUrgent' || p.k === 'payVip').map((p) => `${t(p.k, { n: p.v })} +${p.n}`).join(' · ');
  ui.win({ stars, title, cheer: { winTitle: 'cheer3', winTitle2: 'cheer2', winTitle1: 'cheer1' }[title], res: res && res.id, coins: reward, coinsBefore: d.coins - reward, pay, payHi, peek: peekColor(), cafeStars, canBuild, buildMain, cafeNext, purr: early ? '' : chest ? [t('streakChest', { n: d.daily.streak }), purr].filter(Boolean).join(' · ') : purr, drec: drecNew ? drecInfo(drecNew) : null, ach, adopt: S.quickAdopt || '', ...shareOn() });
  rret.winCard(rtg.winDay(d, dayNum()), rtg.tomorrow(d, { day: dayNum(), res: resOwned(), dailyDone: d.daily.doneDay === todayKey(), streak: streak() })); // R11 ret; R17: from day 1 (one line early)
  save.commit();
  for (let i = 0; i < stars; i++) setTimeout(() => audio.star(i), 300 + i * 300);
  cui.onWin(S.n, first); // a pack's last level: its reward and host
  // R17: a first clear's base coins can be doubled once with a rewarded ad (a small button under Next), capped per day
  S.dcBase = first && reward > 0 && ads.available() && econ.dcLeft(d, dayNum()) > 0 ? reward : 0;
  S.dcToken = S.winToken;
  if (S.dcBase && money.dcOffer(S.dcBase)) ads.offer('dcoins');
  if (first && (stars === 3 || isBoss(S.n))) portal.happytime(); // CrazyGames: a boss or a super-hard clear only
  clipPreview();
}

// the Daily record on the win card and the Daily sheet: the total, the next milestone (its art as a silhouette), or what
// this clear just unlocked
const DREC_ART = { frame: 'drec_frame', pennant: 'drec_pennant', clock: 'drec_clock' };
const drecArt = (m) => (m.item ? DREC_ART[m.item] : m.reward.hint ? 'btn_hint' : 'btn_undo');
const drecName = (m) => (m.item ? cafe.loc(m.name) : t(m.reward.hint ? 'drecHint' : 'drecUndo'));
function drecInfo(got = []) {
  const d = save.data;
  const nx = r10.drecNext(d);
  const g = got[got.length - 1];
  return { n: d.drec.n, got: g ? { art: drecArt(g), name: drecName(g), at: g.at } : null, next: nx && { at: nx.at, art: drecArt(nx), name: drecName(nx) } };
}

// ---- share clip + friend challenge ----
// The win keeps the board and the move list; kit/clip.js re-renders the best moment (the biggest bench chain, else the
// clear) as a vertical clip. Share hands it over with a challenge link to this exact board (kit/dare.js).
let clip;
const noBenchWin = () => S.winPeak === 0 && game.board.cats.length >= 10; // a clean sweep of a real board (not L1's three cats)
function prepClip() {
  S.winPeak = game.state ? game.state.benchPeak : 0;
  const plan = planClip(game.log, true);
  if (!plan) return clip.clear();
  const result = plan.kind === 'chain' ? t('chainX', { n: plan.n }) : S.winPeak === 0 ? t('clipNoBench') : t('clipClear');
  const wd = winDare(); // the clip and the Dare button name the same dare (one share id)
  clip.set({
    board: game.board,
    log: game.log.slice(),
    plan,
    dpr: vir.clipDpr(), // R11 vir: 360x640 on a slow device
    text: { combo: [t('purrfect'), t('combo2'), t('combo3')], chainX: (n) => t('chainX', { n }), lastSeat: t('lastSeat'), title: t('title'), board: boardName(), result, can: t('clipCan'), link: t('clipLink'), url: shortUrl(wd), qr: qrUrl(wd), scan: t('clipScan'), goal: `${dareGoal(wd.m, wd.g, wd.x)} · ${t('dareBoard', { board: boardName(), n: wd.b })}`, bench: (u, n) => t('clipBench', { u, n }), oneSeat: t('clipOneSeat'), chain: t('clipChain') },
  });
}
// the win card's share parts: the clip preview (a chain, or a clean sweep) and, at a moment that tells a story, Dare a
// friend as a labelled pink pill with the moment's own headline: the first chain x3 (with a once-per-browser "Show a
// friend!" nudge), a new best chain, any chain x3+, a clean sweep of a real board, the first clear of today's Daily, a
// Cat Show gold, a Café Rush top 3 (extra: 'gold' | 'rush3'). Ordinary wins keep Next first and the round share icon.
function shareOn(extra) {
  const d = save.data;
  const friend = S.show && S.show.kind === 'friend';
  const preview = clip.has() && (S.chainBest >= 2 || noBenchWin());
  const c = S.chainBest || 0;
  let k = '';
  if (friend) k = '';
  else if (c >= 3 && !d.meta.shareNudge) k = 'first3';
  else if (c >= 3 && c > (d.meta.bestChain || 0)) k = 'best';
  else if (S.dailyFirst) k = 'daily';
  else if (extra || S.qaMoment) k = extra || S.qaMoment; // qaMoment: QA forces a share moment (__qa.moment)
  else if (noBenchWin()) k = 'sweep';
  else if (c >= 3) k = 'chain';
  if (!friend && c > (d.meta.bestChain || 0)) d.meta.bestChain = Math.min(8, c);
  const nudge = k === 'first3';
  if (nudge) d.meta.shareNudge = 1;
  save.commit();
  if (k) track('share_offer_' + k);
  if (nudge) track('share_nudge', { n: S.n });
  S.moment = k;
  const head = { first3: t('momFirst3', { n: c }), best: t('momBest', { n: c }), sweep: t('momSweep'), daily: t('momDaily'), gold: t('momGold'), rush3: t('momRush') }[k] || '';
  return { chain: preview, dare: !!k, nudge, moment: head, rec: canRecord() && !clip.failed() };
}
// R11: the win card shows the peak still on its first frames and records nothing. The real-time encode (a second game
// replayed at 30 fps, the win card's 100 ms frames on a slow phone) starts only when the player taps Share clip: the
// thumbnail then plays as it records, and the button says "Making clip…" until the video can be sent (a second tap).
function clipPreview() {
  const token = S.winToken;
  clearTimeout(S.clipTimer);
  S.clipTimer = setTimeout(() => {
    if (token !== S.winToken || ui.screen !== 'win' || !clip.has()) return;
    const cv = document.querySelector('#modal .chainclip canvas');
    if (cv) clip.start(cv);
    const b = document.querySelector('#modal [data-act=shareclip]');
    if (b) b.hidden = false;
    vir.onWinCard(); // R11 vir: the QR card is drawn (the video waits for a tap)
  }, 60); // one frame after the card mounts: the card's pop-in starts before the replay to the peak runs
}
// R11 fix round 1: the line under the thumbnail: "Preparing video" until the clip is ready, then "Send video"
function clipCap(s) {
  const c = document.querySelector('#modal .clipcap');
  if (c) c.textContent = s || '';
}
// Share clip, first tap with no video yet: record it into the thumbnail, then the button is ready to send
function makeClip(bg) { // bg (R11 vir): started by the win card, not a tap
  const token = S.winToken;
  const btn = () => document.querySelector('#modal [data-act=shareclip]');
  const b = btn();
  // R11 fix 2: the video is made in real time, so the button says so and counts up; when it is ready it says Send
  const label = (x, s) => { const sp = x.querySelector('span'); if (sp) sp.textContent = s; x.setAttribute('aria-label', s); };
  const mk = bg ? 'virVideoBg' : 'clipMakingP';
  if (b) { b.classList.add('making'); label(b, t(mk, { p: 0 })); }
  clipCap(t('virVideoPrep'));
  track('clip_make', { n: S.n, bg: bg ? 1 : 0 });
  const cv = document.querySelector('#modal .chainclip canvas');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shown = 0;
  const prog = (f) => {
    const p = Math.floor(f * 20) * 5; // in steps of 5%: no text churn every frame
    const x = btn();
    if (p === shown || !x || token !== S.winToken) return;
    shown = p;
    label(x, t(mk, { p }));
    x.style.setProperty('--p', p + '%');
  };
  return clip.record(cv, still, prog, bg).then((r) => {
    const x = btn();
    if (token !== S.winToken || !x) return r;
    x.classList.remove('making');
    x.style.removeProperty('--p');
    label(x, t(r ? 'clipSend' : 'shareClipBtn'));
    clipCap(r ? t('clipSend') : '');
    if (r) x.classList.add('ready');
    return r;
  });
}
const srcName = (k, n) => (k === 'd' ? t('dailyLevel') : k === 's' ? t('showBoard') : k === 'r' ? t('rush') : t('level', { n }));
const boardName = () => (S.show ? (S.show.kind === 'friend' ? srcName(S.show.k, S.n) : S.show.kind === 'rush' ? t('rush') : t('showBoardN', { k: S.show.k.toUpperCase() })) : S.daily ? t('dailyLevel') : t('level', { n: S.n }));
const cur = () => (game.board && game.board.meta.cur) || ''; // a curated campaign board's idea (core/curated.js)
const curCard = (b) => b.h <= 8; // R11 fix round 2: a curated board's line sits on the teaching card (its own slot under the board)
const timed = () => !!S.show && (S.show.kind === 'rush' || (S.show.kind === 'friend' && S.show.m === 'time'));
// "Ana's" / "Ana'nın"; no name: "your friend's" / "Arkadaşının"
const whoOf = (nm) => (nm ? (save.data.settings.lang === 'tr' ? dare.trGenitive(nm) : nm + "'s") : t('dareWho'));
const dareGoal = (m, g, x) => (m === 'chain' ? t(x ? 'dareGoalChainMatch' : 'dareGoalChain', { n: g }) : m === 'time' ? t('dareGoalTime', { t: (g / 10).toFixed(1) }) : g === 0 ? t('dareGoalNoBench') : t('dareGoalSeats', { n: g }));
// how much taller the hint card is than one line (a 2-line hint would cover the board's bottom row otherwise), and its
// whole height (R11 fix round 1: the board keeps a slot for it)
function tutBox(text) {
  const el = document.createElement('div');
  el.className = 'tut';
  el.style.visibility = 'hidden';
  const host = document.getElementById('ui') || document.body;
  host.appendChild(el);
  el.textContent = 'x';
  const one = el.getBoundingClientRect().height;
  el.textContent = text;
  const h = el.getBoundingClientRect().height;
  el.remove();
  return { extra: Math.max(0, Math.round(h - one)), h: Math.ceil(h) };
}
// a result in words: x4, 2 seats, 12.3s
const valText = (m, v) => (m === 'chain' ? 'x' + v : m === 'time' ? t('valTime', { t: (v / 10).toFixed(1) }) : t('valSeats', { n: v }));
// the one dare of this win (cached per attempt): the exact board and what the player did on it, one share id (burned
// into the clip, so the clip and the link name the same dare), the player's optional name, and on a friend's board the
// reply (their share id + target), the thread so far (the latest 3 runs) and the next round number
const winDareC = { token: -1, d: null };
function setNick(v) {
  const nm = dare.cleanName(v || '');
  if (nm !== save.data.meta.nick) { save.data.meta.nick = nm; save.commit(); if (nm) track('dare_nick'); }
  if (winDareC.d) { if (nm) winDareC.d.nm = nm; else delete winDareC.d.nm; } // this win's dare was already drawn
}
function winDare() {
  if (winDareC.token === S.winToken && winDareC.d) return { ...winDareC.d, th: winDareC.d.th && [...winDareC.d.th] };
  const d = myDare();
  d.i = dare.shareId();
  if (save.data.meta.nick) d.nm = save.data.meta.nick;
  const sh = S.show;
  if (sh && sh.kind === 'friend') {
    d.rd = (sh.rd || 1) + 1;
    if (sh.i && d.m === sh.m) { d.r = sh.i; d.pg = sh.g; d.th = [...(sh.th || []), { nm: sh.nm || '', v: sh.g }].slice(-3); }
  }
  winDareC.token = S.winToken;
  winDareC.d = d;
  return { ...d, th: d.th && [...d.th] };
}
// the challenge this run sends: the same board and seats, and what the player did on it
function myDare() {
  const sh = S.show;
  const k = sh ? (sh.kind === 'rush' ? 'r' : sh.kind === 'friend' ? sh.k : 's') : S.daily ? 'd' : 'l';
  const peak = S.winPeak || 0;
  let m;
  if (timed()) m = 'time';
  else if (sh && sh.kind === 'friend' && sh.m === 'seats') m = 'seats';
  else m = (S.chainBest || 0) >= 2 ? 'chain' : 'seats';
  const g = m === 'time' ? Math.max(30, Math.round((S.lastMs || 0) / 100)) : m === 'chain' ? S.chainBest : peak;
  const rev = sh && sh.kind === 'friend' ? sh.rev : linkRev(S.n); // a reply names the board revision it was played on; a new dare the oldest one that plays this board
  return checkDare({ n: S.n, b: S.bench0 || game.board.meta.benchSize, k, m, g, rev });
}
// A dare goes out only if the recipient can really reach it: the sender's moves are replayed on the exact board and
// seat count the link carries. A run that bought a seat or used a Scoop (the friend may have neither) or that does not
// replay to the same result falls back to "clear it with these seats", which the board always allows. A chain that is
// already the board's best (exhaustive search on that seat count) asks the friend to match it, not beat it.
const dareCache = { token: -1, d: null };
function checkDare(d) {
  if (dareCache.token === S.winToken && dareCache.d) return { ...dareCache.d };
  const out = { ...d };
  if (d.m !== 'time') {
    const board = boardOf(d.n, d.rev);
    board.meta.benchSize = d.b;
    const st = createState(board);
    let ok = true, chain = 0;
    for (const o of game.log) {
      if (o.op === 'tap') {
        const r = rulesTap(st, o.id);
        if (!r.ok || r.failed) { ok = !r.failed && !!r.bonk; if (!ok) break; continue; }
        chain = Math.max(chain, r.events.filter((e) => e.type === 'board').length);
      } else if (o.op === 'undo') rulesUndo(st, true);
      else { ok = false; break; } // 'seat' or 'scoop'
    }
    ok = ok && st.aliveCount === 0 && (d.m === 'chain' ? chain >= d.g : st.benchPeak <= d.g);
    if (!ok) { out.m = 'seats'; out.g = d.b; track('dare_fallback', { n: d.n, m: d.m }); }
    else if (d.m === 'chain') {
      const mc = maxChain(new Sim(compile(board), d.b));
      if (mc.complete && d.g >= mc.best) out.x = 1;
    }
  }
  dareCache.token = S.winToken;
  dareCache.d = out;
  return { ...out };
}
function dareText(d) {
  const board = boardName();
  const sh = S.show;
  if (d.r && sh && sh.kind === 'friend') { // a reply: the round, both results
    const res = dare.judge(d.m, d.pg, d.g);
    return t(res === 'beat' ? 'backBeat' : res === 'tie' ? 'backTie' : 'backMiss', { r: d.rd || 2, board, pv: valText(d.m, d.pg), v: valText(d.m, d.g) });
  }
  if (d.m === 'chain') return t(d.x ? 'shareDareChainMatch' : 'shareDareChain', { c: d.g, board });
  if (d.m === 'time') return t('shareDareTime', { t: (d.g / 10).toFixed(1), board });
  return d.g === 0 ? t('shareDareNoBench', { board }) : t('shareDareSeats', { c: d.g, board });
}
// R11 fix 2: the link, the typed code and the QR share one address (dare.publicBase: the public https address of the
// build, else this page), so what a friend types off the clip and what a camera scans open the same board
const dareUrl = (d) => dare.gameLink(dare.encode(d));
// what the clip shows: the link without its scheme, with the typeable core only (board, seats, goal, share id); R12: plus
// the QR's compact reply context, so a counter-dare typed off the clip lands in Friend Results like the scanned one
const shortUrl = (d) => dare.gameLink(dare.qrCode(d)).replace(/^https?:\/\//, '');
// the QR on the clip's end card and PNG: the same address with the same typeable core (R11 fix round 2: plus the compact
// reply context on a counter-dare, so a scanned reply reaches Friend Results like the text link)
const qrUrl = (d) => dare.gameLink(dare.qrCode(d));
// a ?c= link opened the game: decoded (and clamped) once, then dropped from the address bar
function readDare() {
  let code = null;
  try { code = new URLSearchParams(location.search).get('c'); } catch { /* no URL API */ }
  if (!code) { code = portal.inviteParam('c'); return code ? openCode(code) : null; } // R17: a CrazyGames invite link
  try { const u = new URL(location.href); u.searchParams.delete('c'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch { /* file:// */ }
  return openCode(code);
}
// a dare code from the address bar or (R12) pasted / typed into Friend Results: decoded and clamped, a reply imported
function openCode(code) {
  const d = dare.decode(code, (n, rev) => boardOf(n, rev).meta.benchSize);
  if (d && !d.rev) d.rev = 2; // an older link: the generated board it was made on
  track(d ? 'dare_open' : 'dare_bad', d ? { m: d.m, k: d.k, i: d.i || '' } : {});
  if (d && d.r) importReply(d);
  return d;
}
// a reply link (R6): the result goes into Friend Results once it is plausible on that exact board (a chain no bigger than
// the board's searched maximum on those seats; seats within the board's bench); the same result id stays one entry
function importReply(d) {
  if (d.m === 'chain') {
    const board = boardOf(d.n, d.rev);
    const mc = maxChain(new Sim(compile(board), d.b));
    if (mc.complete && d.g > mc.best) { track('fr_bad', { n: d.n }); return; }
  }
  const e = r10.frImport(save.data, d, now());
  if (!e) return;
  save.commit();
  track('fr_import', { mine: e.mine ? 1 : 0, m: d.m });
  if (e.mine) S.frNew = e.id; // the landing says it landed only when it answers one of this browser's dares
}
function dareLanding(d) {
  S.dare = d;
  // R17 (sol-r16 fix 5): the landing is the target and Play this board; the thread and the name wait on the result
  ui.dare({ who: d.nm || t('dareFriend'), goal: dareGoal(d.m, d.g, d.x), board: srcName(d.k, d.n), seats: d.b, fresh: save.data.level <= 1, peek: COLORS[boardOf(d.n, d.rev).cats[0].color], reply: d.r && S.frNew === d.i ? t('frAdded', { name: d.nm || t('dareFriend') }) : '' });
}
function startDare(d) {
  const goal = d.m === 'chain' ? { kind: 'chain', n: d.g } : d.m === 'seats' ? { kind: 'seats', n: d.g } : null;
  startLevel(d.n, false, { kind: 'friend', m: d.m, g: d.g, nm: d.nm, k: d.k, b: d.b, x: d.x, i: d.i, th: d.th, rd: d.rd, rev: d.rev, goal });
  S.dareMoved = false;
  track('dare_play', { m: d.m, i: d.i || '' });
}
// after the challenge (or Not now): the normal flow, a new player straight into level 1
function afterDare() {
  S.dare = null;
  if (save.data.level < CAFE_FROM) tryStart(save.data.level);
  else startHome();
}
function onFriendWin() {
  const sh = S.show;
  const d = save.data;
  audio.clear();
  haptics.success();
  const ms = S.lastMs || 0;
  const v = sh.m === 'chain' ? S.chainBest || 0 : sh.m === 'seats' ? S.winPeak || 0 : Math.round(ms / 100);
  const res = dare.judge(sh.m, sh.g, v);
  d.meta.dares++;
  save.commit();
  track('dare_done', { m: sh.m, res, i: sh.i || '' }); // the funnel's clear step
  const n = sh.m === 'time' ? (sh.g / 10).toFixed(1) : sh.g;
  const vv = sh.m === 'time' ? (ms / 1000).toFixed(1) : v;
  const line = t(`dare_${res}_${sh.m}`, { who: whoOf(sh.nm), n, v: vv });
  const sp = shareOn();
  // both scores side by side ("Ana x3 · You x4") and the round this reply will start
  const vs = [`${sh.nm || t('dareFriend')} ${valText(sh.m, sh.g)}`, `${t('dareYou')} ${valText(sh.m, sh.m === 'time' ? Math.round(ms / 100) : v)}`];
  track('dare_result_' + res);
  const th = (sh.th || []).map((e) => `${e.nm || t('dareFriend')} ${valText(sh.m, e.v)}`); // the earlier runs of the thread
  ui.win({ stars: 1, title: res === 'miss' ? 'winTitle1' : 'winTitle', coins: 0, peek: peekColor(), purr: '', ach: [], show: true, showTag: t('dareTitle'), friend: { res, line, vs, th, round: (sh.rd || 1) + 1, nick: d.meta.nick }, chain: sp.chain, dare: true });
  // the optional name rides on the reply: kept on change (a tap on Dare back blurs the field first)
  document.getElementById('darename')?.addEventListener('change', (e) => setNick(e.target.value));
  clipPreview();
}

// the continue card: what went wrong (the stuck cat, seats vs the missing carrier), then the ways out
function failInfo() {
  const st = game.state;
  const sid = st && st.pending && st.pending.length ? st.pending[0] : null;
  const color = sid != null ? COLORS[game.board.cats[sid].color] : peekColor();
  const sp = sid != null && game.vis.stuck.length ? game.stuckPos(0) : null;
  // how far down the belt the stuck cat's carrier is: the loss names the distance, not just "not here yet"
  const away = st && sid != null ? st.carriers.findIndex((c) => c.color === game.board.cats[sid].color) : -1;
  const why = !st ? '' : away === 1 ? t('offerWhyNext', { n: st.benchSize, c: t('col_' + color) }) : away > 1 ? t('offerWhyK', { n: st.benchSize, c: t('col_' + color), k: away }) : t('offerWhy', { n: st.benchSize, c: t('col_' + color) });
  return {
    peek: color,
    why,
    lifeLost: !!S.lifeLost,
    stuckAt: sp && { x: Math.round(Math.min(game.W - 72, Math.max(72, sp.x))), y: Math.round(sp.y - game.bw * 0.62) },
    coins: save.data.coins,
    seatCost: seatCost(),
    canSeat: save.data.coins >= seatCost(),
    scoop: save.data.boosters.scoop,
    scoopCost: SCOOP_COST,
    ad: !S.show && ads.available() && S.adSeat !== triesKey() && !!st && (S.qaClose || econ.closeLoss(st.aliveCount, game.board.cats.length)), // R17: a close loss, once per board
    store: iap.available(),
    tip: S.daily ? t('dailyRetryFree') : cur() ? t('curTry_' + cur()) : t(st && st.carriers[0] && freeCats(st).some((i) => game.board.cats[i].color === st.carriers[0].color) ? 'failTip2' : 'failTip'),
    // the first lost bench on a level offers one free Take Back (the losing tap undone), so the lesson can be applied
    freeBack: !S.show && !S.freeBack[triesKey()] && !!st && canUndo(st),
    backLabel: S.teach ? t('funBackTap') : '', // R11 fun
    practice: !!S.show, // the Show board: Retry is free, nothing to buy
    // the Starter Bundle shows once, here (never on a win card), and not in the first session
    offer: !S.show && !S.daily && save.data.meta.sessions >= 2 && econ.starterDue(save.data) && starterOpen() && { coins: iap.PRODUCTS.starter.coins, scoop: iap.PRODUCTS.starter.scoop, price: iap.PRODUCTS.starter.price },
  };
}

function onFail(silent = false) {
  ui.setTut('');
  track('level_fail', { n: S.n, show: !!S.show });
  if (cur()) track('cur_fail', { n: S.n, cur: cur(), tries: S.tries[triesKey()] || 1, moves: game.state ? game.state.moves : 0 }); // R11: did the curated board's idea land?
  track('bench_full', { n: S.n });
  if (!S.show && !S.daily) { // Cat Show practice and the daily puzzle are free to retry: no life, no streak
    econ.purrLoss(save.data);
    save.data.purr.lost = S.n;
    bossUi.onFail(S.n); // boss lane: the boss gloats over a lost boss board
    S.lifeLost = lifeGate() && !fun.freeLoss(S.n) && econ.loseLife(save.data, now()); // R11 fun: the opening (L1-12) is practice
  }
  save.commit();
  if (S.lifeLost) track('life_lost', { n: S.n });
  if (S.lifeLost) { // the HUD heart count drops at once, not on the next 1 s tick
    ui.setHud(hudInfo());
    document.getElementById('hud-lives')?.classList.add('lost');
  }
  if (silent) return;
  audio.mew();
  const info = failInfo();
  // R11: the board shows the lesson too: the carrier the stuck cat needs glows with the departures still before it
  const st = game.state;
  if (st && st.pending && st.pending.length) game.cueNeed(game.board.cats[st.pending[0]].color);
  ui.fail(info);
  if (info.ad) ads.offer('seat');
  if (info.offer) {
    save.data.shop.starterShown = true;
    save.commit();
    track('starter_shown', { at: 'fail' });
  }
}

// ---- actions ----
const actions = {
  perfgpu() { toggleGpu(); ui.settings(settingsInfo()); }, // r10 perf: the opt-in PixiJS board renderer
  click: (el) => audio.ui(uiKind(el)),
  play: () => tryStart(save.data.level),
  daily: () => tryStart(dailyLevel(), true),
  cafe: () => startHome(),
  starter() { if (!starterOpen()) return; ui.starter(); track('starter_open', { from: S.mode }); },
  cafeback() { ui.cafe(cafeInfo()); },
  residents: () => ui.residents(),
  pet({ id }) {
    if (S.mode !== 'cafe' || !ui.pet(id)) return;
    audio.mrrp(0);
    haptics.light();
    if (live.pet(save.data, id, dayNum())) { // the day's first pet: +1 affection heart
      save.commit();
      const h = document.querySelector(`.guest[data-id="${id}"] .pheart`);
      if (h) h.remove();
      ui.toast(t('petHeart', { name: resName(id), n: live.heartsOf(save.data, id) }));
    }
    track('pet', { id });
  },
  treat({ id }) {
    if (S.mode !== 'cafe') return;
    const r = cafe.RESIDENTS.find((x) => x.id === id);
    if (!r || cafe.loveOf(id) >= cafe.LOVE_COSTS.length) return;
    if (!cafe.treat(id)) return audio.ui('err'), ui.toast(t('needCoins', { n: cafe.treatCost(id) }));
    audio.ui('ok');
    haptics.success();
    live.addHearts(save.data, id, 3); // a treat is also 3 affection hearts toward the outfits
    save.commit();
    track('treat', { id });
    ui.residents();
    ui.toast(t('loveToast', { name: r.name }));
  },
  cafearea({ d }) {
    const a = Math.max(0, Math.min(cafe.AREAS.length, S.area + +d));
    if (a === S.area) return;
    S.area = a;
    ui.cafe(cafeInfo());
  },
  build({ id }) {
    const task = cafe.ALL_TASKS.find((x) => x.id === id);
    if (!task || S.mode !== 'cafe') return;
    if (!cafe.build(id)) return audio.ui('err'), ui.toast(t('needStars', { n: task.cost || 1 }));
    S.area = task.area;
    audio.ui('build');
    haptics.success();
    track('task_done', { id });
    ui.cafe(cafeInfo(id));
    if (task.resident) {
      track('resident_arrive', { id: task.resident.id });
      if (resOwned().length <= 3) track('thread_done', { id: task.resident.id, session: save.data.meta.sessions, first2: save.data.meta.sessions <= 2 ? 1 : 0 }); // R11: finished the early thread
      funnel('first_resident');
      econ.grant(save.data, { hint: 1 }); // every new resident arrives with a free Hint
      const rq = live.reqArrive(save.data, task.resident.id); // and asks for something at once: the next thread to follow
      save.commit();
      const ask = rq ? t('reqFirst', { name: task.resident.name, what: t('g_' + rq.k, { n: rq.need }) }) : '';
      setTimeout(() => {
        if (S.mode === 'cafe') { audio.ui('friend'); ui.arrive({ resident: task.resident, sprite: task.sprite, level: save.data.level, ask }); ui.toast(t('arriveGift', { name: task.resident.name })); }
      }, 1100);
    }
  },
  party() {
    if (S.mode !== 'cafe') return;
    if (!cafe.hostParty()) return audio.ui('err'), ui.toast(t('needStars', { n: cafe.PARTY_COST }));
    econ.grant(save.data, cafe.PARTY_REWARD);
    save.commit();
    audio.clear();
    haptics.success();
    track('party', { n: cafe.parties() });
    ui.cafe(cafeInfo());
    ui.toast(t('partyDone', { n: cafe.parties(), c: cafe.PARTY_REWARD.coins }));
  },
  // Cat Street: the next piece of the house under construction; a finished house brings its shopkeeper
  streetbuild() {
    if (S.mode !== 'cafe' || !cafe.partyOpen()) return;
    const d = save.data;
    const r = street.streetBuild(d);
    if (!r) return audio.ui('err'), ui.toast(t('needStars', { n: street.nextTask(d).cost }));
    save.commit();
    audio.ui('build');
    haptics.success();
    track('street_build', { n: street.built(d), house: r.house.id });
    ui.cafe(cafeInfo('street'));
    if (r.houseDone) {
      track('street_house', { k: r.house.k });
      const h = r.house;
      const ap = h.apprentice; // the first repeat lap: the keeper's kitten apprentice moves in (new on the street)
      if (ap) track('street_apprentice', { id: h.id });
      // lap 3: the shop's upgrades are done (the keeper shows them off); remix laps: the lap's guest moves in
      const a = ap ? { kind: 'apprentice', id: h.id, name: ap.name, keeper: h.keeper.name, line: ap.line, place: cafe.loc(h.name), reward: r.reward }
        : h.kind === 'up' ? { kind: 'upgrade', id: h.id, name: h.keeper.name, line: h.keeper.line, place: t('streetUpName', { house: cafe.loc(h.name) }), reward: r.reward }
          : h.kind === 'mix' ? { kind: 'guest', id: h.id, art: h.guest.art, name: h.guest.name, line: { en: `I came for ${h.theme.name.en}. Can I stay?`, tr: `${h.theme.name.tr} için geldim. Kalabilir miyim?` }, place: cafe.loc(h.name), theme: cafe.loc(h.theme.name), reward: r.reward }
            : { kind: 'keeper', id: h.id, name: h.keeper.name, line: h.keeper.line, place: cafe.loc(h.name), reward: r.reward };
      setTimeout(() => { if (S.mode === 'cafe') { audio.ui('friend'); lui.arrival(a); } }, 900);
    }
  },
  // renovation: buy (and apply) the offered theme set of this finished room, or cycle the owned ones
  reno() {
    const R = renoInfo();
    if (S.mode !== 'cafe' || !R) return;
    if (R.ti < 0) { street.renoCycle(save.data, R.area); save.commit(); audio.ui('tab'); ui.cafe(cafeInfo()); return; }
    if (!street.renoBuy(save.data, R.area, R.ti)) return audio.ui('err'), ui.toast(t('needStars', { n: R.set.cost }));
    save.commit();
    audio.ui('build');
    haptics.success();
    track('reno', { area: R.area, set: R.set.id });
    ui.cafe(cafeInfo('reno'));
    ui.toast(t('renoDone', { set: R.set.name }));
  },
  // the tip jar on the cafe counter: a tap collects (an empty jar opens the tips sheet with its timer)
  jartap() {
    if (S.mode !== 'cafe') return;
    const d = save.data;
    const before = d.coins;
    const el = document.querySelector('.jar7, .rr.ring');
    const n = live.jarCollect(d, now(), resOwned().length, cafe.love());
    if (!n) { lui.cafeSheet(cafeSheetInfo()); return; }
    save.commit();
    audio.ui('coin');
    haptics.success();
    track('jar_collect', { n, at: 'room' });
    lui.coinBurst(el, before, d.coins);
    setTimeout(() => { if (S.mode === 'cafe' && !ui.sheet) ui.cafe(cafeInfo()); }, 1300);
  },
  // a resident's speech bubble: a finished request is claimed right there
  reqtap({ i }) {
    if (S.mode !== 'cafe') return;
    const d = save.data;
    const x = d.req.list[+i];
    if (!x || x.p < x.need) { lui.cafeSheet(cafeSheetInfo()); return; }
    const before = d.coins;
    const el = document.querySelector(`.rqbub[data-i="${i}"]`);
    const r = live.reqClaim(d, +i, now());
    if (!r) return;
    save.commit();
    audio.star(1);
    haptics.success();
    track('request_done', { who: r.who, at: 'room' });
    if (r.first) track('first_request_claim', { who: r.who }); // the session-1 funnel's last step
    funnel('first_request');
    S.afterClaim = { who: r.who, text: nextReturn() };
    ui.toast(t('reqThanks', { name: resName(r.who), h: r.hearts }));
    lui.coinBurst(el, before, d.coins);
    setTimeout(() => { if (S.mode === 'cafe' && !ui.sheet) ui.cafe(cafeInfo()); }, 1300);
  },
  arrivalclose() { lui.closeArrival(); if (S.mode === 'cafe') ui.cafe(cafeInfo()); },
  arriveplay() { ui.hideModal(); tryStart(save.data.level); },
  arriveclose() { ui.hideModal(); ui.cafe(cafeInfo()); },
  settings: () => ui.settings(settingsInfo()),
  shop() { if (save.data.shop.offerDay !== dayNum()) { save.data.shop.offerDay = dayNum(); save.commit(); } ui.shop(shopInfo()); track('shop_open', { from: S.mode }); },
  closesheet: () => ui.hideSheet(),
  buy: guarded(async ({ id }) => {
    const r = await iap.purchase(id);
    if (!r.ok) return ui.toast(t('buyFail'));
    track('iap_purchase', { id });
    audio.ui('rare');
    haptics.success();
    ui.toast(t('thanks'));
    if (ui.sheet === 'starter') ui.hideSheet();
    else if (ui.sheet === 'shop') ui.shop(shopInfo());
    syncCoins();
    if (ui.screen === 'fail' && S.mode === 'play' && game.over) { ui.hideModal(); ui.fail(failInfo()); } // coins bought from the continue card: show what is now affordable
  }),
  restore: guarded(async () => {
    const ids = await iap.restore();
    ui.toast(t(ids.length ? 'restored' : 'nothingRestore'));
    if (ui.sheet === 'shop') ui.shop(shopInfo());
    if (ui.screen === 'settings') ui.settings(settingsInfo());
  }),
  quests() { ui.quests(questsInfo()); track('tasks_open'); },
  qclaim({ id }) {
    if (!econ.questClaim(save.data, id, dayNum())) return;
    save.commit();
    track('daily_task_done', { id });
    audio.ui('claim');
    ui.quests(questsInfo());
    syncCoins();
    if (S.mode === 'cafe') ui.setDots(dots());
  },
  chest() {
    if (!econ.chestClaim(save.data)) return ui.toast(t('chestSub'));
    save.commit();
    track('daily_chest');
    audio.ui('chest');
    haptics.success();
    ui.quests(questsInfo());
    syncCoins();
    if (S.mode === 'cafe') ui.setDots(dots());
  },
  loginclaim() {
    const r = econ.loginClaim(save.data, dayNum());
    if (!r) return;
    if (r.outfit) { // calendar day 7: the nearest resident outfit unlocks (no resident yet: 100 coins instead)
      const g = live.giftOutfit(save.data, resOwned());
      if (g) ui.toast(t('outfitGift', { name: resName(g.id), o: t('outfit_' + g.outfit) }));
      else save.data.coins += 100;
    }
    save.commit();
    track('login_claim', { idx: save.data.login.idx });
    audio.ui('claim');
    ui.quests(questsInfo());
    syncCoins();
    if (S.mode === 'cafe') ui.setDots(dots());
  },
  show() { lui.eventsSheet(eventsInfo()); track('show_open'); },
  events({ tab }) { lui.eventsTab(tab); lui.eventsSheet(eventsInfo()); track('events_open', { tab: lui.eventsTab() }); },
  evtab({ tab }) { lui.eventsTab(tab); lui.eventsSheet(eventsInfo()); },
  archpage({ p }) { lui.setArchPage(p); lui.eventsSheet(eventsInfo()); },
  // ---- R10: pop-up week, album, catch-up, friend results, resident jobs ----
  popclaim() {
    const d = save.data;
    const w = weekNum();
    const r = r10.popClaim(d, w, popMedals(w));
    if (!r) return;
    save.commit();
    audio.ui('claim');
    haptics.success();
    track('pop_claim', { w, card: r.card });
    syncCoins();
    lui.eventsSheet(eventsInfo());
    if (r.page >= 0) retPageDone(r.page);
    rui.postcard({ card: cardInfo(r.card), coins: r.coins, page: r.page >= 0 ? pageInfo(r.page) : null });
  },
  catchup({ w }) {
    const d = save.data;
    const r = r10.catchUp(d, weekNum(), +w, popMedals(+w));
    if (!r) return;
    save.commit();
    audio.ui('sparkle');
    track('pop_catchup', { w: +w, card: r.card });
    lui.eventsSheet(eventsInfo());
    if (r.page >= 0) retPageDone(r.page);
    rui.postcard({ card: cardInfo(r.card), coins: 0, page: r.page >= 0 ? pageInfo(r.page) : null });
  },
  pcclose() { rui.closePostcard(); },
  // R12: a link or code pasted / typed into Friend Results opens like the link itself (a reply lands, the board plays)
  frcode() {
    const d = openCode(dare.codeOf(document.getElementById('frcode')?.value));
    if (!d) return ui.toast(t('frCodeBad'));
    ui.hideSheet();
    dareLanding(d);
  },
  rematch({ id }) {
    const e = save.data.fr.list.find((x) => x.id === id);
    if (!e) return;
    ui.hideSheet();
    track('fr_rematch', { m: e.m });
    startDare({ n: e.n, b: e.b, k: e.k, m: e.m, g: e.g, nm: e.nm, x: 0, i: e.id });
  },
  album({ p }) { rui.closePostcard(); if (p != null) albumPage = +p; else albumPage = firstAlbumPage(); rui.album(albumInfo()); track('album_open'); },
  // R12: pin an unfinished page as the goal; the map under the sheet redraws its strip for it
  albpin({ p }) { if (!r10.pinPage(save.data, +p)) return; save.commit(); track('album_pin', { p: +p }); if (S.mode === 'cafe') ui.cafe(cafeInfo()); rui.album(albumInfo()); },
  albpage({ p }) { albumPage = Math.max(0, Math.min(r10.PAGES.length - 1, +p || 0)); rui.album(albumInfo()); },
  hang({ p }) {
    const d = save.data;
    const room = hangRoom(+p);
    if (!r10.hangPrint(d, +p, room)) return;
    rui.closePostcard();
    save.commit();
    audio.ui('build');
    track('print_hang', { p: +p, room });
    ui.hideSheet();
    S.area = room;
    ui.cafe(cafeInfo('print'));
    ui.toast(t('printHung', { room: cafe.loc(cafe.AREAS[room].name) }));
  },
  // R11 ret: the room's hang card (Hang pre-selected), the map's album card leading there, and Later
  rthang({ p, room }) {
    const d = save.data;
    const a = cafe.areaDone(+room) ? +room : hangRoom(+p);
    if (!r10.hangPrint(d, +p, a)) return;
    rtg.clearHang(d);
    save.commit();
    audio.ui('build');
    track('print_hang', { p: +p, room: a, from: 'ret' });
    S.area = a;
    ui.cafe(cafeInfo('print'));
    ui.toast(t('printHung', { room: cafe.loc(cafe.AREAS[a].name) }));
  },
  rthangroom({ p }) { ui.hideSheet(); S.area = hangRoom(+p); hub.roomMode(); ui.setCafeView('room'); ui.cafe(cafeInfo()); track('ret_hang_go', { p: +p }); },
  rtlater() { rtg.clearHang(save.data); save.commit(); ui.cafe(cafeInfo()); },
  jobclaim({ s }) {
    const d = save.data;
    const r = r10.jobsClaim(d, dayNum(), resOwned(), +s);
    if (!r) return;
    save.commit();
    audio.ui('claim');
    haptics.success();
    track('job_claim', { who: r.who });
    syncCoins();
    ui.toast(t('jobThanks', { name: resName(r.who), c: r.coins }));
    if (ui.sheet === 'quests') ui.quests(questsInfo());
    if (S.mode === 'cafe' && !ui.sheet) ui.cafe(cafeInfo());
  },
  rushplay() {
    if (!live.eventsOpen(save.data)) return;
    ui.hideSheet();
    const w = weekNum();
    tryStart(rushLevel(w), false, { kind: 'rush', w });
    if (save.data.rush.week === w) { save.data.rush.cats = game.board.cats.length; save.commit(); }
    track('rush_play');
  },
  rushclaim() {
    const r = live.rushClaim(save.data);
    if (!r) return;
    save.commit();
    audio.ui('claim');
    haptics.success();
    track('rush_claim', { rank: r.rank });
    ui.toast(t(r.cup ? 'rushCupToast' : 'rushPrizeToast', { n: r.rank, c: r.coins }));
    lui.eventsSheet(eventsInfo());
    syncCoins();
  },
  cafesheet() { lui.cafeSheet(cafeSheetInfo()); track('cafe_sheet'); },
  jarcollect() {
    if (S.mode !== 'cafe') return;
    const d = save.data;
    const before = d.coins;
    const n = live.jarCollect(d, now(), resOwned().length, cafe.love());
    if (!n) return;
    save.commit();
    audio.ui('coin');
    haptics.success();
    track('jar_collect', { n });
    ui.cafe(cafeInfo());
    lui.cafeSheet(cafeSheetInfo());
    lui.coinBurst(document.querySelector('#sheet .jbig'), before, d.coins);
  },
  reqclaim({ i }) {
    if (S.mode !== 'cafe') return;
    const d = save.data;
    const before = d.coins;
    const r = live.reqClaim(d, +i, now());
    if (!r) return;
    save.commit();
    audio.ui('claim');
    haptics.success();
    track('request_done', { who: r.who });
    funnel('first_request');
    S.afterClaim = { who: r.who, text: nextReturn() };
    ui.cafe(cafeInfo());
    lui.cafeSheet(cafeSheetInfo());
    ui.toast(t('reqThanks', { name: resName(r.who), h: r.hearts }));
    lui.coinBurst(document.querySelector('#sheet .jbig'), before, d.coins);
  },
  dailysheet() { lui.dailySheet(dailyInfo()); track('daily_sheet'); },
  dailyplay() { ui.hideSheet(); tryStart(dailyLevel(), true); },
  visitor({ id }) {
    if (S.mode !== 'cafe') return;
    const before = save.data.coins;
    ui.pet(id);
    audio.mrrp(1);
    const n = live.visitorGift(save.data, id, dayNum());
    if (!n) return;
    save.commit();
    track('visitor_gift', { id });
    const el = document.querySelector(`.guest.visitor[data-id="${id}"]`);
    const g = el && el.querySelector('.pheart');
    if (g) g.remove();
    lui.coinBurst(el, before, save.data.coins);
  },
  wear({ id, o }) {
    if (!live.wear(save.data, id, o || '')) return;
    save.commit();
    audio.ui('ok');
    track('wear', { id, o: o || '' });
    ui.residents();
  },
  adlife: guarded(async () => {
    if (ui.sheet !== 'nolives' || !ads.available() || econ.lives(save.data, now()) > 0) return; // R17: only at zero lives
    if (!(await ads.rewarded('life'))) return ui.toast(t('adNone'));
    if (ui.sheet !== 'nolives' || econ.lives(save.data, now()) > 0) return;
    ads.grant('life');
    econ.addLife(save.data, 1);
    save.commit();
    track('life_ad');
    ui.hideSheet();
    ui.setLives(livesInfo());
  }),
  liferefill() {
    if (ui.sheet !== 'nolives') return;
    if (save.data.coins < econ.LIFE_REFILL_COST) return ui.toast(t('noCoins'));
    save.data.coins -= econ.LIFE_REFILL_COST;
    econ.refillLives(save.data);
    save.commit();
    track('life_refill');
    ui.hideSheet();
    ui.setLives(livesInfo());
    syncCoins();
  },
  close: () => ui.hideModal(),
  // the free Take Back on a level's first lost bench: the losing tap is undone, nothing is charged
  takeback() {
    if (busy || S.mode !== 'play' || !game.over || !game.state.failed || S.freeBack[triesKey()]) return;
    const before = game.state.bench.slice();
    const rw = fun.rewindWinnable(game); // R11 fun: back to the latest spot the solver proves winnable, not just one move
    if (!rw) return ui.toast(t('noUndo'));
    // R11: mark the cushion that came free and, when there is one, a cat that boards the front carrier right now
    const st = game.state;
    const seat = st.bench.findIndex((x, i) => x < 0 && before[i] >= 0);
    const fc = st.carriers[0];
    const now0 = fc ? freeCats(st).find((i) => game.board.cats[i].color === fc.color && !isHidden(st, i)) : undefined;
    const mark = S.teach && rw.proven && rw.id >= 0; // a teaching level: point at the tap that cost the win instead
    if (mark) fun.markCulprit(game, rw.id);
    else game.cueBack(seat, now0 ?? -1);
    if (mark) ui.toast(t('funTapLine'), 'funtoast'); // over the booster bar: the marked cat sits low on the board
    else if (rw.proven) ui.toast(rw.k > 1 ? t('funBackN', { n: rw.k }) : t('funBack1'), 'funtoast');
    track('takeback_cue', { seat: seat >= 0 ? 1 : 0, cat: now0 != null ? 1 : 0 });
    track('fun_rewind', { n: S.n, k: rw.k, proven: rw.proven ? 1 : 0, teach: S.teach ? 1 : 0 });
    S.freeBack[triesKey()] = true;
    S.undid = true;
    ui.hideModal();
    ui.resume();
    ui.setHud(hudInfo());
    track('free_takeback', { n: S.n });
    continued('takeback');
  },
  showplay({ w, k }) {
    if (!live.eventsOpen(save.data)) return;
    const wk = Math.min(+w || weekNum(), weekNum()); // archived boards stay playable; never a future week
    ui.hideSheet();
    tryStart(showLevelOf(wk, k === 'b' ? 'b' : 'a'), false, { kind: 'show', w: wk, k: k === 'b' ? 'b' : 'a', goal: showGoal(wk, k === 'b' ? 'b' : 'a') });
    track('show_board_play', { w: wk, k });
  },
  home: () => startHome(),
  dareplay() {
    if (!S.dare) return;
    ui.hideModal();
    startDare(S.dare);
  },
  dareskip() { ui.hideModal(); track('dare_skip'); afterDare(); },
  retry: () => tryStart(S.n, S.daily, S.show),
  adheart: guarded(async () => {
    const st = game.state;
    if (S.mode !== 'play' || !game.over || !st.failed || !ads.available()) return;
    if (S.adSeat === triesKey()) return;
    if (!(await ads.rewarded('seat'))) return ui.toast(t('adNone'));
    if (S.mode !== 'play' || game.state !== st || !game.over || !st.failed) return; // the failure was already resolved while the ad ran
    S.adSeat = triesKey(); // one rewarded seat per board
    ads.grant('seat');
    game.heartsAdd();
    ui.hideModal();
    ui.resume();
    ui.setHud(hudInfo());
    track('rewarded_seat');
    continued('ad');
  }),
  coinseat() {
    if (busy || S.mode !== 'play' || !game.over) return;
    const cost = seatCost();
    if (!game.state.failed) return;
    if (save.data.coins < cost) return audio.ui('err'), ui.toast(t('needCoins', { n: cost }));
    save.data.coins -= cost;
    S.seatBuys = (S.seatBuys || 0) + 1;
    save.commit();
    game.heartsAdd();
    ui.hideModal();
    ui.resume();
    ui.setHud(hudInfo());
    track('coin_seat');
    continued('coins');
  },
  // continue by scoop: take the losing move back, then scoop a cat of your choice
  offerscoop() {
    if (busy || S.mode !== 'play' || !game.over) return;
    if (!canPayBooster('scoop', SCOOP_COST)) return ui.toast(t('noCoins'));
    if (!game.undoMove()) return ui.toast(t('noUndo')); // nothing is charged unless the move was really taken back
    S.undid = true; // the undone move's cats and carrier are not credited to the daily tasks twice
    if (save.data.boosters.scoop <= 0) {
      save.data.coins -= SCOOP_COST;
      save.data.boosters.scoop = 1;
      save.commit();
    }
    ui.hideModal();
    ui.resume();
    actions.scoop();
    track('offer_scoop');
    continued('scoop');
  },
  undo() {
    if (S.mode !== 'play' || game.demo || S.show) return;
    if (game.busy() || !canUndo(game.state)) return ui.toast(t('noUndo'));
    if (!payBooster('undo', UNDO_COST)) return ui.toast(t('noCoins'));
    if (game.undoMove()) S.undid = true;
    ui.setHud(hudInfo());
    track('undo');
  },
  scoop() {
    if (S.mode !== 'play' || game.demo || game.over || S.show) return;
    if (game.scoopMode) game.scoopMode = false;
    else if (!canPayBooster('scoop', SCOOP_COST)) return ui.toast(t('noCoins'));
    else game.scoopMode = true;
    ui.setTut(game.scoopMode ? t('scoopTip') : '');
    ui.setHud(hudInfo());
  },
  next: guarded(async () => {
    if (S.show && S.show.kind === 'friend') return afterDare();
    if (S.show) { startHome(); lui.eventsTab(S.show.kind === 'rush' ? 'rush' : S.show.w < weekNum() ? 'arch' : 'show'); return actions.show(); } // back to the Events sheet: try for gold or a better time
    if (S.daily) return startHome();
    const n = S.n;
    const token = S.winToken;
    if (ads.shouldShowInterstitial(n)) await ads.interstitial();
    if (S.mode !== 'play' || ui.screen !== 'win' || token !== S.winToken) return; // the player went Home while the ad ran
    tryStart(n + 1);
  }),
  hint: guarded(async () => {
    const ok = () => S.mode === 'play' && !S.show && game.state && !game.over && !isFailed(game.state) && game.state.aliveCount > 0 && game.hintId == null;
    if (!ok()) return;
    const id = solverHint(game.state); // nothing is paid for a hint that cannot point at a cat
    if (id == null) return ui.toast(t('noHint'));
    if (hintFree()) {
      save.data.cafe.hintN = hintsUsed() + 1;
      save.data.cafe.hintDay = todayKey();
      save.commit();
      game.hintId = id;
      ui.setHud(hudInfo());
      track('hint_free_perk');
    } else if (payBooster('hint', HINT_COST)) {
      game.hintId = id;
      ui.setHud(hudInfo());
      track('hint_booster');
    } else if (!ads.available()) {
      ui.toast(t('noCoins'));
    } else {
      money.hintOffer(HINT_COST); // R17: an explicit offer (watch an ad, or no thanks), never an ad straight off the Hint button
      ads.offer('hint');
    }
  }),
  adhint: guarded(async () => {
    if (ui.sheet !== 'hintad') return;
    ui.hideSheet();
    const ok = () => S.mode === 'play' && !S.show && game.state && !game.over && !isFailed(game.state) && game.state.aliveCount > 0 && game.hintId == null;
    if (!(await ads.rewarded('hint'))) return ui.toast(t('adNone'));
    ads.grant('hint');
    if (ok()) game.setHint();
    else { save.data.boosters.hint++; save.commit(); ui.setHud(hudInfo()); ui.toast(t('hintSaved')); } // the board moved on while the ad ran: the hint waits in stock
    track('hint_ad');
  }),
  // R17: double the base coins of a first clear (paid already) with a rewarded ad, capped per day (econ.dcClaim)
  adcoins: guarded(async () => {
    const token = S.winToken;
    const base = S.dcBase;
    if (!base || S.dcToken !== token || ui.screen !== 'win' || !ads.available()) return;
    if (!(await ads.rewarded('dcoins'))) return ui.toast(t('adNone'));
    if (S.dcToken !== token || S.dcBase !== base) return; // the card moved on while the ad ran: nothing to double any more
    S.dcBase = 0;
    const got = econ.dcClaim(save.data, dayNum(), base);
    save.commit();
    money.dcDone();
    if (!got) return;
    ads.grant('dcoins');
    track('double_coins', { n: S.n, coins: got });
    syncCoins();
    audio.ui('coin');
    ui.toast(t('dcGot', { n: got }));
  }),
  daresheet: () => track('share_sheet'), // R17: the standout win's Dare a friend sheet opened (ui.js toggles it)
  // Share / Dare a friend: the challenge (text + link to this exact board), at once
  async share() {
    if (S.sharing) return;
    S.sharing = true;
    try { await doShare(false); } finally { S.sharing = false; }
  },
  // Share clip: the encoded replay of the best moment with the same text + link (R11: the first tap records it)
  sharehouse: (o) => shareHouse(o),
  async shareclip() {
    if (S.sharing) return;
    S.sharing = true;
    try { await doShare(true); } finally { S.sharing = false; }
  },
  async install() {
    await pwa.install();
  },
  async toggle({ k }) {
    if (k === 'notify' && !save.data.settings.notify) {
      if (!(await notify.enable())) { ui.toast(t('notifyDenied')); return; }
      track('notify_on');
    }
    save.data.settings[k] = !save.data.settings[k];
    save.commit();
    if (k === 'music' || k === 'sound') audio.sync();
    if (k === 'big') bigText(save.data.settings.big);
    ui.settings(settingsInfo());
  },
  lang({ l }) {
    save.data.settings.lang = l;
    save.commit();
    if (game.board) setTexts();
    document.documentElement.lang = l;
    if (S.mode === 'home') ui.home(homeInfo());
    else if (S.mode === 'cafe') ui.cafe(cafeInfo());
    ui.settings(settingsInfo());
  },
};

// Share: the challenge line with the link (withClip: the encoded clip with it, its short link burned in; without
// MediaRecorder, the captioned peak PNG). Its own flag, so Next stays live while a share sheet is open.
async function doShare(withClip) {
  const d = winDare();
  r10.noteSent(save.data, d.i); // every share id is kept so this browser knows its own dares when a reply comes back
  save.commit();
  const text = dareText(d);
  const url = dareUrl(d);
  S.lastShare = { text, url, clip: !!withClip, moment: S.moment || '' };
  track('share_tap_' + (withClip ? 'clip' : S.moment || (d.r ? 'reply' : 'plain')));
  const from = S.show && S.show.kind === 'friend' ? S.show.i || '' : null; // a recipient sharing on: the reshare step
  if (from != null) track('dare_reshare', { i: from, to: d.i });
  const goal = `${dareGoal(d.m, d.g, d.x)} · ${t('dareBoard', { board: boardName(), n: d.b })}`;
  if (withClip && clip.has()) {
    if (!clip.ready() && canRecord() && !clip.failed()) { if (!clip.encoding()) makeClip(); else ui.toast(t('virVideoSoon')); return; } // R11: the first tap makes the clip
    const f = clip.ready() || (await clip.png()); // no long await: the tap's user activation must still hold
    if (f) {
      const how = await shareFile(f, `long-cat-out-${d.k === 'l' ? 'level-' + S.n : 'challenge'}`, text, url);
      track('share', { kind: f.ext, how, m: d.m });
      track('share_done_' + how);
      track('dare_handoff', { i: d.i, via: 'clip', how });
      // no share sheet: the link was copied and the clip saved in the same tap (the clip shows the link too)
      if (how === 'saved') ui.toast(t('clipSavedLink'));
      else if (how === 'saved-nolink') { ui.toast(t('clipSaved')); ui.shareSheet({ title: t('shareDareBtn'), goal, url, text, copied: false }); }
      // many chat apps keep the video and drop the text beside it: the playable link follows as its own message
      if (how === 'shared') ui.dareLink({ text, url, board: boardName(), goal: dareGoal(d.m, d.g, d.x), seats: d.b, peek: peekColor() }, () => sendLink(text, url, d.i));
      return;
    }
  }
  await sendLink(text, url, d.i, { goal, clip: clip.has() });
}
// the challenge text + link on its own (the Dare button, and the follow-up after a clip). No share sheet in this browser:
// the link is copied in the same tap and a sheet shows what was copied (with the clip's end card, the link burned in)
// and offers the clip as a file too.
async function sendLink(text, url, id, o = {}) {
  track('dare_handoff', { i: id, via: 'link' });
  if (navigator.share) {
    try { await navigator.share({ text, url }); track('share_done_shared'); } catch (e) { if (e && e.name !== 'AbortError') linkSheet(text, url, o, false); }
    return;
  }
  let copied = false;
  try { if (navigator.clipboard) { await navigator.clipboard.writeText(text + ' ' + url); copied = true; } } catch { /* refused */ }
  track('share_done_' + (copied ? 'copied' : 'nocopy'));
  linkSheet(text, url, o, copied);
}
function linkSheet(text, url, o, copied) {
  let img = '';
  try { if (o.clip && clip.has()) img = (clip.frames(['end']) || [])[0]?.url || ''; } catch { img = ''; }
  ui.shareSheet({ title: t('shareDareBtn'), goal: o.goal || '', img, url, text, copied, file: o.clip && clip.has() ? 'clip' : '' }, async () => {
    const f = clip.ready() || (await clip.png());
    if (!f) return;
    const how = await shareFile(f, `long-cat-out-${S.n}`, text, url);
    track('share_done_' + how);
    ui.toast(t(how === 'saved' ? 'clipSavedLink' : 'clipSaved'));
  });
}

// a new floor of the Cat House or a new shop on Cat Street: a picture of it with the game's link burned in
async function shareHouse({ k, to, id }) {
  if (S.sharing) return;
  S.sharing = true;
  try {
    const url = dare.publicBase();
    const base = { brand: t('title'), cta: t('cardCta'), url: url.replace(/^https?:\/\//, '') };
    let info;
    if (k === 'floor') {
      const i = Math.max(0, Math.min(cafe.AREAS.length, +to || 0));
      const area = cafe.AREAS[i];
      const res = area ? area.tasks.find((x) => x.resident) : null;
      const title = area ? t('cardFloor', { name: cafe.loc(area.name) }) : t('cardHouseDone');
      const floors = Math.min(cafe.AREAS.length, i + 1);
      info = { ...base, title, sub: t('cardFloorSub', { n: floors }), tower: floors, art: res ? [{ name: 'res7_' + res.resident.id + '_idle', x: 600, y: 650, h: 200 }] : [] };
    } else {
      const h = street.ALL_SHOPS.find((x) => x.id === id);
      const sid = h ? h.id : 'bakery';
      info = { ...base, title: t('cardShop', { place: h ? cafe.loc(h.name) : '' }), sub: t(street.keepers(save.data).length > 1 ? 'cardShopSub' : 'cardShopSub1', { n: street.keepers(save.data).length }), art: [{ name: 'street_' + sid, x: 300, y: 640, h: 470 }, { name: 'keeper_' + sid, x: 575, y: 646, h: 220 }] };
    }
    const card = await houseCard(info);
    if (!card) return;
    S.lastHouseCard = card.url;
    const text = t('shareHouseText', { title: info.title });
    track('share_tap_house_' + (k === 'floor' ? 'floor' : 'street'));
    const how = await shareFile(card, 'long-cat-out-' + (k === 'floor' ? 'house' : 'street'), text, url);
    track('share_done_' + how);
    if (how === 'saved') ui.toast(t('cardSaved'));
    else if (how === 'saved-nolink') ui.shareSheet({ title: t('shareHouse'), goal: info.title, img: card.url, wide: true, url, text, copied: false });
  } finally { S.sharing = false; }
}

const settingsInfo = () => ({ notifyOk: live.eventsOpen(save.data) && notify.supported(), settings: save.data.settings, removeAds: ads.isRemoved(), canInstall: pwa.canInstall(), store: iap.available() });

// ---- boot ----
async function boot() {
  game = new Game(document.getElementById('game'));
  setTexts(); // popups speak the saved language from the first frame
  game.on.free = onFree;
  game.on.bonk = onBonk;
  game.on.mech = (e) => { if (game.demo) return; if (e.type === 'wake' || e.type === 'thaw') audio.pop(); else if (e.type === 'knock' || e.type === 'reveal') audio.land(); };
  game.on.win = onWin;
  cui.init({ game, audio });
  sui.init({ game, audio, toast: (s) => ui.toast(s) });
  clip = makeShareClip();
  game.on.fail = onFail;
  game.on.depart = ({ chain }) => { if (game.demo) return; audio.depart(chain - 1); haptics.success(); if (!game.demo && !S.undid) quest('carrier'); };
  // a bench chain (2+ parked cats hop in from one tap): the share clip keeps the best one of the level
  game.on.chain = ({ n }) => { if (game.demo) return; S.chainBest = Math.max(S.chainBest || 0, n); track('chain', { n, lv: S.n }); if (!S.show) funnel('first_chain'); };
  game.on.hop = ({ k }) => { if (game.demo) return; audio.chain(k - 1); haptics.light(); };
  game.on.chainLand = ({ k, last }) => { if (game.demo || !last) return; audio.star(Math.min(3, k)); if (!landBuzz()) haptics.success(); }; // the chain's last landing: the big accent (R11 juice: one short firm buzz)
  game.on.land = (e) => { if (game.demo) return; audio.land(); if (e && e.kind === 'carrier') haptics.light(); }; // the tick lands with the cat, not the tap
  game.on.scoopCan = () => canPayBooster('scoop', SCOOP_COST) || (ui.toast(t('noCoins')), false);
  game.on.scoop = () => { payBooster('scoop', SCOOP_COST); ui.setTut(''); ui.setHud(hudInfo()); track('scoop'); };
  game.on.scoopFull = () => ui.toast(t('offerSub'));
  game.on.layout = () => {
    if (game.demo) return;
    // the toast lane above the booster bar and the combo band over the board's top rows follow the board layout
    const r = document.documentElement.style;
    r.setProperty('--lane-b', game.laneB + 'px');
    r.setProperty('--combo-y', game.comboY + 'px');
  };
  game.on.combo = (text) => { if (S.mode === 'play') ui.combo(text); };
  game.on.demoReset = () => game.load(generate(1), { demo: true, top: 146, bottom: 246 });
  ordUi.initOrders(game, { cur: () => S }); // adoption orders: wraps the hooks above (strip, ceremony, album tab)
  bossUi.init(game, { cur: () => S, sync: syncCoins, toast: (s) => ui.toast(s), hubRedraw: () => { if (S.mode === 'cafe' && ui.screen === 'cafe') ui.cafe(cafeInfo()); } }); // boss lane: HP bar, defeat ceremony, chests
  talk.init({ game, audio, cur: () => S, pet: (id) => ui.pet(id) }); // R16 talking cats: wraps on.free/bonk/land/chain and game.load
  Object.assign(actions, shopActions(syncCoins)); // R10 shop tabs, packs, deal, ad gifts, cosmetics (src/ui/shop.js)
  Object.assign(actions, vir.init({ S, clip, ui, winDare, dareText, dareUrl, shortUrl, qrUrl, peek: peekColor, makeClip, goalLine: (d) => `${dareGoal(d.m, d.g, d.x)} · ${t('dareBoard', { board: boardName(), n: d.b })}` })); // R11 vir: Share QR card
  ui.init(actions);
  iqui.init({ game, S, actions, ui, tryStart, startLevel, streak }); // R10 iq lane: wraps game.load/on.free/on.win, adds its actions
  initPwa();
  pwa.onChange(() => { if (ui.screen === 'settings') ui.settings(settingsInfo()); });
  document.documentElement.lang = save.data.settings.lang;
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  // R17 CrazyGames build only: the SDK loads beside the assets; the first screen waits for both (at most 8 s for the SDK)
  const portalUp = portal.initPortal().then((ok) => { if (ok) { portal.loading(true); portal.checkAdblock(); } });
  await loadAssets();
  await portalUp;
  portal.loading(false);
  bigText(save.data.settings.big); // R13 a11y: Settings > Bigger text
  econTick(); // day stamps repaired and rolled before the first screen reads them
  const dc = readDare();
  if (dc) { startHome(); dareLanding(dc); } // a friend's challenge link: one intro card, then straight onto that board
  else if (save.data.level < CAFE_FROM) startLevel(save.data.level);
  else startHome();
  setInterval(() => {
    // R17 CrazyGames: gameplay runs while a board is in play and no card, sheet or intro covers it (only changes are sent)
    portal.gameplay(S.mode === 'play' && ui.screen === 'play' && !ui.sheet && !document.querySelector('#modal, #smodal, #cmodal, #bossintro'));
    if (S.mode !== 'play' || !game.state) return;
    ui.setHud(hudInfo());
    // L4: no answer up front. The card names the idea, never the tap: at 4 of 5 seats a reminder of the rule, and once a
    // park has cost the win (no winning line left) a nudge toward Undo.
    if (S.scare && S.scare < 3 && game.state.moves !== S.scareMoves && !game.busy() && !game.over && game.state.aliveCount > 0) {
      S.scareMoves = game.state.moves;
      if (!solveFrom(structuredClone(game.state), 2500).order) {
        S.scare = 3;
        ui.setTut(t('tut4b'));
        haptics.light();
      } else if (S.scare === 1 && game.state.benchUsed >= 4) {
        S.scare = 2;
        ui.setTut(t('tut4c'));
      }
    }
    // L3: the moment a mother + kitten pair parks, the card names what just happened (two seats taken until their
    // carrier comes), before the bench runs out
    if (S.n === 3 && !S.daily && !S.show && !S.tut3b && game.state.bench.some((id) => id >= 0 && game.board.cats[id].kittenOf != null)) {
      S.tut3b = true;
      ui.setTut(t('tut3b'));
      haptics.light();
    }
    // R11 curated boards: the pair parks (L9: two seats gone until green), or every seat is full while a cat that boards
    // the front carrier is free (L6 / L11): one line, back to the level's rule once seats free up
    const cb = cur() && !S.daily && !S.show ? game.state : null;
    if (cb && !game.over) {
      const pairIn = cur() === 'pair' && cb.bench.some((id) => id >= 0 && game.board.cats[id].kittenOf != null);
      const fr = cb.carriers[0];
      const full = cur() !== 'pair' && cb.benchUsed >= cb.benchSize && fr && freeCats(cb).some((i) => game.board.cats[i].color === fr.color);
      const want = pairIn ? 'curPairPark' : full ? 'curFull' : '';
      const card = curCard(game.board); // a taller board gets the line as a toast (see startLevel)
      if (want && S.curCue !== want) { S.curCue = want; haptics.light(); if (card) { S.tutDrop = false; ui.setTut(t(want)); } else ui.toast(t(want)); }
      else if (!want && S.curCue) { S.curCue = ''; if (card) ui.setTut(''); } // the rules state frees seats at once
    }
    // the "4 of 5 seats" card never outlives the full bench: once seats free up it goes back to the level's rule
    if (S.scare === 2 && game.state.benchUsed < 4 && !game.busy()) {
      S.scare = 1;
      ui.setTut(S.tut);
    }
    // the hint card empties after its first read, but its space stays: the board never moves under the thumb
    if (S.tutDrop && !game.scoopMode && game.state.aliveCount < game.board.cats.length && !game.busy() && !game.over) {
      S.tutDrop = false;
      ui.setTut('');
    }
  }, 250);
  setInterval(() => {
    econTick();
    if (S.mode === 'cafe' && ui.screen === 'cafe' && !ui.sheet && !document.getElementById('modal') && !document.getElementById('arrival')) { // the jar filled a stage, a dot or a goal moved: redraw the hub
      const L = liveHub();
      const key = JSON.stringify([L.jar.stage, L.spot, L.dots, L.goals.map((g) => [g.k, g.have]), L.daily.done]);
      if (S.hubKey && key !== S.hubKey) ui.cafe(cafeInfo());
      S.hubKey = key;
    }
    const l = livesInfo();
    ui.setLives(l);
    if (ui.sheet === 'nolives' && l.n > 0) ui.hideSheet();
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) planNotify(); else notify.clear(); });
  save.data.meta.sessions++;
  save.commit();
  track('app_open', { session: save.data.meta.sessions });
  retention();

  if (import.meta.env.DEV) {
    const blocked = () => game.board.cats.filter((c) => game.state.alive[c.id] && findBlocker(game.state, c.id)).map((c) => c.id);
    window.__qa = {
      level: (n, rev) => { S.qaRev = rev; startLevel(n); }, // QA: an older board revision (R14: qa.mjs plays the R12 L10 pair trap)
      // R17 money QA: no store backend (a production build), the rewarded offers' state
      noStore: (off = true) => { iap.qaNoStore(off); return iap.available(); },
      closeLoss: (on = true) => { S.qaClose = on; }, // the next lost bench counts as a close loss (few cats left)
      money: () => ({ dc: S.dcBase || 0, dcBtn: !!document.querySelector('#modal .dcbtn'), seatAd: !!document.querySelector('#modal [data-act=adheart]'), sheet: ui.sheet, lives: econ.lives(save.data, now()), coins: save.data.coins, counters: Object.fromEntries(Object.entries(save.data.counters).filter(([k]) => k.startsWith('ad_'))) }),
      // R11 fix 2 (appeal): the shaped tabby on a long straight run, a tight zigzag and an L bend, on the live renderer
      tabbyBoard: () => {
        const cats = [
          [[0, 7], [0, 6], [0, 5], [0, 4], [0, 3], [0, 2], [0, 1]],
          [[2, 0], [3, 0], [3, 1], [2, 1], [2, 2], [3, 2], [3, 3]],
          [[5, 7], [4, 7], [3, 7], [2, 7], [2, 6], [2, 5]],
          [[5, 1], [5, 2], [5, 3], [5, 4]],
          [[4, 3], [4, 4], [4, 5], [3, 5]],
        ].map((c, i) => makeCat(i, c, 'tabby'));
        game.load(makeBoard(6, 8, cats, { n: 0, kind: 'normal', benchSize: 5 }, [{ color: 0, cap: 3 }, { color: 0, cap: 3 }]));
        return cats.length;
      },
      appealBoard: () => { game.load(appealBoard()); return game.board.cats.length; },
      showBoard: (k = 'a') => { const w = weekNum(); startLevel(showLevelOf(w, k), false, { kind: 'show', w, k, goal: showGoal(w, k) }); },
      showGoal: (k = 'a') => showGoal(weekNum(), k),
      rush: () => actions.rushplay(),
      week: () => weekNum(),
      live: () => liveHub(),
      teach: () => !!game.rulesTeach,
      daily: () => startLevel(dailyLevel(), true),
      home: () => startHome(),
      cafe: () => { startHome(); },
      addStars: (n) => { cafe.addStars(n); startHome(); },
      screen(name) {
        if (name === 'shop') actions.shop();
        else if (name === 'quests') actions.quests();
        else if (name === 'show') actions.show();
        else if (name === 'starter') ui.starter();
        else if (name === 'nolives') ui.noLives({ ms: econ.livesMs(save.data, now()), coins: save.data.coins, cost: econ.LIFE_REFILL_COST, ad: ads.available() });
        else if (name === 'residents') actions.residents();
        else if (name === 'settings') actions.settings();
      },
      lang: (l) => actions.lang({ l }),
      act: (name, d = {}) => actions[name](d),
      save: (patch) => { Object.assign(save.data, patch); save.commit(); },
      drop: () => { clearTimeout(save.soon); save.soon = 0; }, // QA injects a save: a pending commitSoon must not write over it
      sheet: () => ui.sheet,
      slow: (f) => { game.timeScale = f; },
      solveStep() {
        const id = solverHint(game.state);
        return id == null ? null : game.tapCat(id);
      },
      // tap a free cat that does (match) or does not match the front carrier; returns its id or null
      tapColor(match) {
        const f = game.state.carriers[0];
        const id = freeCats(game.state).find((i) => f && (game.board.cats[i].color === f.color) === match);
        if (id == null) return null;
        game.tapCat(id);
        return id;
      },
      // keep tapping non-matching cats until the bench holds n
      benchTo(n) {
        const go = () => {
          if (!game.state || game.state.benchUsed >= n) return;
          if (window.__qa.tapColor(false) == null) return;
          setTimeout(go, 160);
        };
        go();
      },
      // overflow the bench with real taps (bonks are free): fill 3 seats with wrong-color cats, shrink the bench to them, tap one more
      failNow() {
        let shrunk = false;
        const go = () => {
          const st = game.state;
          if (!st || game.over || st.failed) return;
          if (!shrunk && st.benchUsed >= 3 && !game.busy()) {
            st.bench = st.bench.filter((x) => x >= 0);
            st.benchSize = st.bench.length;
            game.syncVis();
            shrunk = true;
          }
          const f = st.carriers[0];
          const free = freeCats(st);
          let id = free.find((i) => !f || game.board.cats[i].color !== f.color);
          if (id == null && shrunk && f && free.length) {
            f.color = (game.board.cats[free[0]].color + 1) % 8; // qa only: no wrong-color cat is free, so recolor the front carrier
            game.syncVis();
            id = free[0];
          }
          id ??= free[0];
          if (id != null && (shrunk || st.benchUsed < 3 || !game.busy())) game.tapCat(id);
          setTimeout(go, 330);
        };
        go();
      },
      forceBlink: (v) => { game.blinkOf = () => v; },
      // press preview: a free cat whose tap would end on kind ('last' = takes the final free cushion, 'seat', 'carrier')
      pressFind(kind) {
        for (const i of freeCats(game.state)) {
          const d = game.destOf(i);
          if (!d.length) continue;
          if (kind === 'last' ? d.last : d[0].kind === kind && !d.last) return i;
        }
        return null;
      },
      pressInfo: () => (game.press ? { id: game.press.id, last: !!game.press.dest.last, dest: game.press.dest.map((d) => d.kind + (d.wait ? ':' + d.wait : '')) } : null),
      waitTags: () => !!game.waitTags,
      toast: (s) => ui.toast(s),
      today: () => dayNum(),
      lives: () => econ.lives(save.data, now()),
      clip: () => ({ has: clip.has(), plan: clip.src && clip.src.plan, ready: !!clip.ready(), encoding: clip.encoding(), canRecord: canRecord(), url: clip.src && clip.src.text.url, qr: clip.src && clip.src.text.qr, goal: clip.src && clip.src.text.goal }),
      dareDecode: (c) => dare.decode(c, (n, rev) => boardOf(n, rev).meta.benchSize),
      async clipEncode() { if (canRecord() && !clip.ready() && !clip.encoding() && !clip.failed() && clip.has()) makeClip(); for (let i = 0; i < 150 && clip.encoding(); i++) await new Promise((r) => setTimeout(r, 100)); const r = clip.ready() || (await clip.png()); return r && { ext: r.ext, size: r.blob.size }; },
      clipFrames: (times) => clip.frames(times),
      dareLink: () => { const d = winDare(); return { d, text: dareText(d), url: dareUrl(d), short: shortUrl(d) }; },
      houseCard: () => S.lastHouseCard || null,
      dareCode: (o) => dare.encode(o),
      logSeat: () => { dareCache.token = -1; winDareC.token = -1; return game.log.push({ op: 'seat', t: game.clock }); }, // qa: as if a seat had been bought mid-run
      counters: () => ({ ...save.data.counters }),
      lastShare: () => S.lastShare || null,
      freeId: () => solverHint(game.state),
      blockedId: () => blocked()[0] ?? null,
      // first cat of a mechanic on the current board ('mystery' | 'frozen'), or null
      mechCat: (k) => game.board.cats.find((c) => c.mech === k)?.id ?? null,
      objs: () => game.board.objs.map((o) => o.kind),
      mechState() {
        const st = game.state;
        const cats = game.board.cats;
        return {
          yarn: st.objs.filter((o, k) => o.kind === 'yarn' && st.objAlive[k]).length,
          dog: st.objs.map((o, k) => (o.kind === 'dog' && st.objAlive[k] ? dogLeft(st, k) : -1)).filter((x) => x >= 0),
          frozen: cats.filter((c) => c.mech === 'frozen' && st.frozen[c.id] && st.alive[c.id]).length,
          chipped: cats.filter((c) => c.mech === 'frozen' && st.alive[c.id] && st.thaw[c.id] > 0).length,
          hidden: cats.filter((c) => st.alive[c.id] && isHidden(st, c.id)).length,
          locked: cats.filter((c) => c.mech === 'lock' && st.alive[c.id] && isLocked(st, c.id)).map((c) => c.id), // R13
          gates: st.objs.filter((o, k) => o.kind === 'gate' && st.objAlive[k]).length,
          gatesShown: st.objs.filter((o, k) => o.kind === 'gate' && game.mv.obj[k]).length, // R14: what the board still draws
          twins: cats.filter((c) => c.mech === 'twin' && st.alive[c.id]).length,
        };
      },
      pos: (id) => game.cellPos(id),
      layout: () => ({ beltY: game.beltY, benchY: game.benchY, bw: game.bw, oy: game.oy, cs: game.cs, W: game.W, cellsB: game.board ? game.oy + game.board.h * game.cell : 0, queue: game.queueBox() }), // cellsB: the bottom of the bottom row (R11 fix round 1)
      cue: () => (game.cue ? { ...game.cue, now: game.clock } : null),
      fun: () => ({ pairCost: game.pairCost || '', pairWait: fun.pairWaitText(game), ghost: !!game.funGhost, park: game.funPark ? game.funPark.seats.length : 0, culprit: game.funCulprit ? game.funCulprit.id : null, press: game.press ? game.press.dest.length : 0, seats: game.pairSeats || null }), // R11 fun lane (R16: L9's lit seats / bracket)
      // R12: the alive cats (cells inset 10%, exit chevrons) under the pair's tag (R16: the dashed route is gone)
      pairClash() {
        const g = game.pairTag, c = game.cell;
        if (!g) return null;
        const boxes = [[g.x, g.y, g.x + g.w, g.y + g.h]];
        (g.route || []).slice(1).forEach(([x, y], i) => { const [px, py] = g.route[i]; boxes.push([Math.min(x, px) - 2.5, Math.min(y, py) - 2.5, Math.max(x, px) + 2.5, Math.max(y, py) + 2.5]); });
        const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
        const out = [];
        for (const k of game.board.cats) {
          if (!game.state.alive[k.id]) continue;
          const rs = k.cells.map(([x, y]) => [game.ox + (x + 0.1) * c, game.oy + (y + 0.1) * c, game.ox + (x + 0.9) * c, game.oy + (y + 0.9) * c]);
          const [hx, hy] = k.cells[k.cells.length - 1], [dx, dy] = DIRS[k.dir];
          const ax = game.ox + (hx + 0.5 + dx * 0.62) * c, ay = game.oy + (hy + 0.5 + dy * 0.62) * c;
          rs.push([ax - c * 0.12, ay - c * 0.12, ax + c * 0.12, ay + c * 0.12]);
          if (rs.some((r) => boxes.some((b) => hit(r, b)))) out.push(k.id);
        }
        return out;
      },
      benchOut: () => game.vis.benchOut.filter((x) => x != null).length,
      // frame strip of a move (qa/_leap-strip.jpg, _chain-strip.jpg): freeze the clock, tap, then step the game to each
      // time (seconds after the tap; 'end' = when the send finishes) and crop the play area into a 3-column grid
      strip(id, times, cols = 3, wide = false) {
        game.timeScale = 0;
        const step = (to) => { while (game.clock < to - 1e-6) { const dt = Math.min(1 / 60, to - game.clock); game.clock += dt; game.update(dt); } game.draw(); };
        const t0 = game.clock;
        if (id != null) game.tapCat(id);
        const run = game.anims.find((x) => x.type === 'run');
        const ts = times.map((x) => (x === 'end' ? (run ? run.end - t0 - 0.02 : 0.5) : x));
        const k = game.dpr;
        const y0 = Math.max(0, game.beltY - game.cs * 1.45), y1 = Math.min(game.H, game.oy + game.board.h * game.cell + 8);
        const xw = wide ? game.W : game.W * 0.62; // close-up on the carrier side unless asked for the whole width
        const x0 = wide ? 0 : Math.max(0, Math.min(game.W - xw, game.carrierMouth().x - xw * 0.32));
        const sc = wide ? 0.5 : 0.7;
        const fw = Math.round(xw * k * sc), fh = Math.round((y1 - y0) * k * sc);
        const rows = Math.ceil(ts.length / cols);
        const cv = document.createElement('canvas');
        cv.width = fw * cols; cv.height = (fh + 22) * rows;
        const g = cv.getContext('2d');
        g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height);
        ts.forEach((tt, i) => {
          step(t0 + tt);
          const x = (i % cols) * fw, y = Math.floor(i / cols) * (fh + 22);
          g.drawImage(game.canvas, Math.round(x0 * k), Math.round(y0 * k), Math.round(xw * k), Math.round((y1 - y0) * k), x, y + 22, fw, fh);
          g.fillStyle = '#fff'; g.font = '700 16px sans-serif'; g.fillText(Math.round(tt * 1000) + ' ms', x + 8, y + 17);
        });
        game.timeScale = 1;
        return { url: cv.toDataURL('image/jpeg', 0.86), times: ts };
      },
      // stepped clock without a strip (for timed shots): freeze, advance s seconds, keep frozen
      freezeAt(s) { game.timeScale = 0; const to = game.clock + s; while (game.clock < to - 1e-6) { const dt = Math.min(1 / 60, to - game.clock); game.clock += dt; game.update(dt); } game.draw(); },
      sweep: () => !!game.sweep,
      matchId: () => { const f = game.state.carriers[0]; return freeCats(game.state).find((i) => f && game.board.cats[i].color === f.color) ?? null; },
      // what tapping a cat would do (rules only, on a copy): bench chain size, whether a dog wakes, seats after
      peek(id) {
        const st = structuredClone(game.state);
        const r = rulesTap(st, id);
        const ev = r.events || [];
        return { ok: !!(r.ok || r.freed), boards: ev.filter((e) => e.type === 'board').length, wake: ev.some((e) => e.type === 'wake'), used: st.benchUsed, failed: !!st.failed };
      },
      order: () => game.board.meta.order || [],
      hintId: () => game.hintId, // R13: the L1-3 arrow waits for a 3 s hesitation
      meta: () => ({ ...game.board.meta, order: undefined }),
      tap: (id) => { const r = game.tapCat(id); return !!r; },
      alive: (id) => !!game.state && !!game.state.alive[id],
      chainFx: () => game.chainFx && { n: game.chainFx.n, k: game.chainFx.k, land: game.chainFx.land || 0 },
      trot: () => { const a = game.anims.find((x) => x.type === 'trot'); return a ? game.clock - a.t0 : -1; },
      // a free mother whose kitten trails her (the usual trap of a generated board), or null
      trapCat() {
        const st = game.state;
        const free = freeCats(st);
        return free.find((i) => game.board.cats.some((k) => k.kittenOf === i && st.alive[k.id])) ?? null;
      },
      tut: () => document.getElementById('tut')?.textContent || '',
      moment: (k) => { S.qaMoment = k; }, // R17 QA: the next wins are share moments (the big card's Dare a friend sheet)
      winNow() {
        const go = () => {
          if (!game.state || game.state.aliveCount === 0) return;
          const id = solverHint(game.state);
          if (id != null) game.tapCat(id);
          setTimeout(go, 60);
        };
        go();
      },
      state: () => ({
        screen: ui.screen,
        sheet: ui.sheet,
        mode: S.mode,
        level: S.n,
        bench: game.state && [game.state.benchUsed, game.state.benchSize],
        departed: game.state && game.state.departed,
        leaving: game.vis.leaving.length,
        busy: game.busy(),
        alive: game.state && game.state.aliveCount,
        over: game.over,
        free: game.state ? freeCats(game.state) : [],
        blocked: game.state ? blocked() : [],
        anims: game.anims.length,
        cell: game.cell,
        board: game.board && [game.board.w, game.board.h],
      }),
    };
    Object.assign(window.__qa, vir.qaHooks()); // R11 vir: QR card, legibility probe
  }
}

boot();
