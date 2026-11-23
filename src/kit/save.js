// Versioned localStorage save. Safe when storage is blocked.
import { TASK_POOL } from '../game/econ.js';

const KEY = 'lco_save';
const VERSION = 9;

const defaults = () => ({
  v: VERSION,
  level: 1,
  coins: 50,
  bestStars: {},
  settings: { sound: true, music: true, haptics: true, lang: guessLang(), notify: false }, // music: older saves get it on through the defaults merge
  daily: { last: '', streak: 0, doneDay: '', shieldW: -1 }, // shieldW: the week whose one free missed day is spent
  ads: { wins: 0, lastInterstitial: 0, removeAds: false },
  counters: {},
  boosters: { hint: 3, scoop: 2, undo: 3 },
  cafe: { stars: 0, built: {}, hintDay: '', hintN: 0, scoopLevel: 0, love: {}, party: 0, hearts: {}, wear: {}, petDay: {}, street: 0, reno: {}, style: {} }, // street: Cat Street pieces built (src/game/street.js); reno: area id -> owned theme-set bits; style: area id -> shown set // hintN: free perk hints used on hintDay; love: resident id -> affection level 0..3 (treats)
  lives: { n: 5, t: 0 }, // t = when the next life regen started (0 while full)
  purr: { n: 0, pend: 0, lost: 0, seatLv: 0 }, // Purr Streak count + the bonus waiting for the next level (0/1/2) + the level last lost (so a restart cannot fake a first try) + the level whose bonus bench seat is still owed
  quests: { day: 0, list: [], chest: 0 }, // 3 daily tasks: { id, p: progress, c: claimed }
  login: { last: 0, idx: 0 }, // 7-day calendar: last claimed day number, claims in this cycle
  show: { week: 0, decor: {}, marks: {}, goals: {}, from: 0 }, // weekly Cat Show: decor = rosettes won (theme id), marks = board key ('<week>a|b') -> medal bits (1 bronze, 2 gold), goals = computed board goals, from = first Show week (archive start)
  shop: { starterShown: false, offerDay: -1 }, // offerDay: the day the hub's Shop 'Offer' badge was last seen (once a day)
  iap: { owned: {}, tx: [] }, // non-consumables owned + recent transaction ids (no double grants)
  clock: { max: 0 }, // highest time ever seen: the rollback guard
  // v8 retention (src/game/live.js): tip jar fill start, resident requests, Café Rush, season stamps/claims, visiting cats
  jar: { t: 0, total: 0 },
  req: { list: [], next: 0, n: 0, done: 0, fresh: '' }, // fresh: the newcomer whose first request leads the hub (kept across reloads)
  rush: { week: 0, best: 0, cats: 0, pend: null, cups: {} },
  season: { daily: {}, claim: {}, visDay: 0 },
  vis: {},
  // v9 (R10, src/game/r10.js): pop-up week stamps (daily: week -> 1, paid: week -> 1, cu: the week a catch-up postcard was
  // taken), the album (cards: postcard index -> 1, hung: room index -> page), the Daily record, resident jobs, friend results
  pop: { daily: {}, paid: {}, cu: -1 },
  album: { cards: {}, hung: {} },
  drec: { n: 0, last: -1, got: 0 },
  jobs: { day: -1, p: [0, 0], paid: 0 },
  fr: { list: [], sent: [] },
  meta: { firstOpen: 0, sessions: 0, funnel: {}, ret: {}, shareNudge: 0, dares: 0, bestChain: 0, nick: '' }, // shareNudge: the first "show a friend" prompt was shown; dares: friend challenges played; bestChain: the best bench chain ever (a new best is a share moment); nick: the optional name on this player's dares
});

function guessLang() {
  try {
    return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

function merge(base, over) {
  for (const k of Object.keys(base)) {
    if (over && over[k] !== undefined) {
      if (isObj(base[k])) merge(base[k], isObj(over[k]) ? over[k] : {});
      else base[k] = over[k];
    }
  }
  return base;
}

// v1 (MVP) saves keep level, coins, stars and settings; v2 adds booster counts (they stay at the defaults).
// v3 adds the Cat Café: an MVP player gets a head start of café stars for the levels already cleared (capped), nothing pre-built.
function migrate(raw) {
  if (!Number.isInteger(raw.v) || raw.v < 2) raw.v = 2;
  if (raw.v < 3) {
    const done = Number.isInteger(raw.level) && raw.level > 1 ? raw.level - 1 : 0;
    if (!isObj(raw.cafe)) raw.cafe = { stars: Math.min(12, done) };
    raw.v = 3;
  }
  // v4 adds lives, streak, tasks, login, Cat Show, shop and meta: all take their defaults (an MVP player starts with full lives).
  if (raw.v < 4) raw.v = 4;
  // v5 adds resident affection (cafe.love) and purr.lost: both default to empty, nothing to convert.
  if (raw.v < 5) raw.v = 5;
  // v6: residents move in earlier (a resident every 2-3 tasks). A player who already has a resident through its old task
  // keeps it: the task that brings that resident now is marked built too (a free decor piece, never a lost cat).
  if (raw.v < 6) {
    const b = isObj(raw.cafe) && isObj(raw.cafe.built) ? raw.cafe.built : null;
    if (b) for (const [from, to] of [['counter_lamps', 'counter_pastry'], ['counter_plant', 'counter_chalkboard'], ['window_bookshelf', 'window_plants'], ['window_lights', 'window_rug']]) if (b[from] && !b[to]) b[to] = 1;
    raw.v = 6;
  }
  // v7 adds the Cat Show board (show.best/ch/mark/markWeek), purr.seatLv and cafe.party: all take their defaults.
  if (raw.v < 7) raw.v = 7;
  // v8: Cat Show mastery (show.marks: board key -> medal bits) replaces the ribbon track (show.ribbons/claimed/best/ch/
  // mark/markWeek are dropped). A player who won that week's old Show board keeps it as a bronze (gold with the judges'
  // mark) on board A of that week. The retention systems take their defaults.
  if (raw.v < 8) {
    const w = isObj(raw.show) ? raw.show : null;
    if (w && Number.isInteger(w.ch) && w.ch > 0 && Number.isInteger(w.week) && w.week > 0) w.marks = { [w.week + 'a']: w.ch & 3 };
    raw.v = 8;
  }
  // v9 adds the pop-up week, album, Daily record, jobs and friend results: all take their defaults.
  if (raw.v < 9) raw.v = 9;
  return raw;
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

// Repair anything a corrupt or hand-edited save could break.
function validate(d) {
  const num = (v, min, dflt) => (Number.isFinite(v) && v >= min ? v : dflt);
  d.v = VERSION;
  d.level = Number.isInteger(d.level) && d.level >= 1 ? d.level : 1;
  d.coins = num(d.coins, 0, 50);
  if (!isObj(d.bestStars)) d.bestStars = {};
  if (!isObj(d.counters)) d.counters = {};
  const s = d.settings;
  s.sound = !!s.sound;
  s.music = !!s.music;
  s.haptics = !!s.haptics;
  if (s.lang !== 'en' && s.lang !== 'tr') s.lang = guessLang();
  d.daily.last = String(d.daily.last ?? '');
  d.daily.doneDay = String(d.daily.doneDay ?? '');
  d.daily.streak = num(d.daily.streak, 0, 0);
  d.daily.shieldW = num(d.daily.shieldW, -1, -1);
  d.ads.wins = num(d.ads.wins, 0, 0);
  d.ads.lastInterstitial = num(d.ads.lastInterstitial, 0, 0);
  d.ads.removeAds = !!d.ads.removeAds;
  const c = d.cafe;
  c.stars = Number.isInteger(c.stars) && c.stars >= 0 ? c.stars : 0;
  if (!isObj(c.built)) c.built = {};
  if (!isObj(c.love)) c.love = {};
  for (const k of Object.keys(c.love)) c.love[k] = Number.isInteger(c.love[k]) ? Math.min(3, Math.max(0, c.love[k])) : 0;
  c.hintDay = String(c.hintDay ?? '');
  c.scoopLevel = num(c.scoopLevel, 0, 0);
  c.street = Number.isInteger(c.street) && c.street >= 0 ? Math.min(c.street, 1e5) : 0;
  if (!isObj(c.reno)) c.reno = {};
  for (const k of Object.keys(c.reno)) if (!(Number.isInteger(c.reno[k]) && c.reno[k] > 0 && c.reno[k] <= 7)) delete c.reno[k];
  if (!isObj(c.style)) c.style = {};
  for (const k of Object.keys(c.style)) if (!['lantern', 'cocoa', 'blossom'].includes(c.style[k])) delete c.style[k];
  c.party = Number.isInteger(c.party) && c.party >= 0 ? c.party : 0; // rooftop parties hosted after the last area
  c.hintN = Number.isInteger(c.hintN) ? Math.min(9, Math.max(0, c.hintN)) : 0; // older saves: a set hintDay counts as 1 used (see main.js hintsUsed)
  const L = d.lives;
  L.n = Number.isInteger(L.n) ? Math.min(5, Math.max(0, L.n)) : 5;
  L.t = num(L.t, 0, 0);
  d.purr.n = Number.isInteger(d.purr.n) && d.purr.n >= 0 ? d.purr.n : 0;
  d.purr.lost = Number.isInteger(d.purr.lost) && d.purr.lost >= 0 ? d.purr.lost : 0;
  d.purr.pend = d.purr.pend === 1 || d.purr.pend === 2 ? d.purr.pend : 0;
  d.purr.seatLv = Number.isInteger(d.purr.seatLv) && d.purr.seatLv >= 0 ? d.purr.seatLv : 0;
  const q = d.quests;
  q.day = num(q.day, 0, 0);
  q.chest = q.chest ? 1 : 0;
  q.list = Array.isArray(q.list) ? q.list.filter((x) => isObj(x) && typeof x.id === 'string' && TASK_POOL.some((p) => p.id === x.id)).slice(0, 3).map((x) => ({ id: x.id, p: num(x.p, 0, 0), c: x.c ? 1 : 0 })) : [];
  d.login.last = num(d.login.last, 0, 0);
  d.login.idx = Number.isInteger(d.login.idx) && d.login.idx >= 0 && d.login.idx <= 7 ? d.login.idx : 0;
  const w = d.show;
  w.week = num(w.week, 0, 0);
  if (!isObj(w.decor)) w.decor = {};
  const intMap = (o, max) => { for (const k of Object.keys(o)) if (!(Number.isInteger(o[k]) && o[k] >= 0 && o[k] <= max)) delete o[k]; return o; };
  w.marks = intMap(isObj(w.marks) ? w.marks : {}, 3);
  for (const k of Object.keys(w.marks)) if (!/^\d+[ab]$/.test(k)) delete w.marks[k];
  if (!isObj(w.goals)) w.goals = {};
  for (const k of Object.keys(w.goals)) { const g = w.goals[k]; if (!isObj(g) || (g.kind !== 'seats' && g.kind !== 'chain') || !Number.isInteger(g.n) || g.n < 0 || g.n > 9) delete w.goals[k]; }
  const gk = Object.keys(w.goals).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  for (const k of gk.slice(12)) delete w.goals[k]; // computed goal cache: recent weeks only
  w.from = num(w.from, 0, 0);
  s.notify = !!s.notify;
  for (const k of ['hearts', 'petDay']) c[k] = intMap(isObj(c[k]) ? c[k] : {}, 1e7);
  if (!isObj(c.wear)) c.wear = {};
  for (const k of Object.keys(c.wear)) if (!['hat', 'scarf', 'crown'].includes(c.wear[k])) delete c.wear[k];
  d.jar.t = num(d.jar.t, 0, 0);
  d.jar.total = num(d.jar.total, 0, 0);
  const R = d.req;
  R.next = num(R.next, 0, 0);
  R.n = Number.isInteger(R.n) && R.n >= 0 ? R.n : 0;
  R.done = Number.isInteger(R.done) && R.done >= 0 ? R.done : 0;
  R.list = Array.isArray(R.list) ? R.list.filter((x) => isObj(x) && typeof x.k === 'string' && typeof x.who === 'string' && Number.isInteger(x.need) && x.need > 0).slice(0, 2).map((x) => ({ k: x.k, who: x.who, need: x.need, p: Math.min(x.need, num(x.p, 0, 0)), c: Number.isInteger(x.c) && x.c >= 0 && x.c < 8 ? x.c : 0, s: num(x.s, 0, 0) })) : [];
  const ru = d.rush;
  ru.week = num(ru.week, 0, 0);
  ru.best = num(ru.best, 0, 0);
  ru.cats = num(ru.cats, 0, 0);
  ru.pend = isObj(ru.pend) && Number.isInteger(ru.pend.rank) && ru.pend.rank > 0 ? { week: num(ru.pend.week, 0, 0), rank: ru.pend.rank } : null;
  ru.cups = intMap(isObj(ru.cups) ? ru.cups : {}, 1e4);
  const se = d.season;
  se.daily = intMap(isObj(se.daily) ? se.daily : {}, 1e4);
  se.claim = intMap(isObj(se.claim) ? se.claim : {}, 1e3);
  se.visDay = num(se.visDay, 0, 0);
  if (!isObj(d.vis)) d.vis = {};
  d.shop.starterShown = !!d.shop.starterShown;
  d.shop.offerDay = Number.isInteger(d.shop.offerDay) ? d.shop.offerDay : -1;
  if (!isObj(d.iap.owned)) d.iap.owned = {};
  d.iap.tx = Array.isArray(d.iap.tx) ? d.iap.tx.filter((x) => typeof x === 'string').slice(-30) : [];
  d.clock.max = num(d.clock.max, 0, 0);
  const m = d.meta;
  m.firstOpen = num(m.firstOpen, 0, 0);
  m.sessions = num(m.sessions, 0, 0);
  m.shareNudge = m.shareNudge ? 1 : 0;
  m.dares = num(m.dares, 0, 0);
  m.bestChain = Math.min(8, num(m.bestChain, 0, 0));
  m.nick = typeof m.nick === 'string' ? m.nick.slice(0, 12) : '';
  if (!isObj(m.funnel)) m.funnel = {};
  if (!isObj(m.ret)) m.ret = {};
  const P = d.pop;
  P.daily = intMap(isObj(P.daily) ? P.daily : {}, 1);
  P.paid = intMap(isObj(P.paid) ? P.paid : {}, 1);
  P.cu = Number.isInteger(P.cu) ? P.cu : -1;
  const A = d.album;
  A.cards = intMap(isObj(A.cards) ? A.cards : {}, 1);
  for (const k of Object.keys(A.cards)) if (!(+k >= 0 && +k < 24)) delete A.cards[k];
  A.hung = intMap(isObj(A.hung) ? A.hung : {}, 5);
  for (const k of Object.keys(A.hung)) if (!(+k >= 0 && +k < 5)) delete A.hung[k];
  d.drec.n = Number.isInteger(d.drec.n) && d.drec.n >= 0 ? d.drec.n : 0;
  d.drec.last = Number.isInteger(d.drec.last) ? d.drec.last : -1;
  d.drec.got = Number.isInteger(d.drec.got) && d.drec.got >= 0 && d.drec.got < 32 ? d.drec.got : 0;
  const J = d.jobs;
  J.day = Number.isInteger(J.day) ? J.day : -1;
  J.p = Array.isArray(J.p) ? [0, 1].map((i) => num(J.p[i], 0, 0)) : [0, 0];
  J.paid = J.paid === 1 || J.paid === 2 ? J.paid : 0;
  const F = d.fr;
  F.sent = Array.isArray(F.sent) ? F.sent.filter((x) => typeof x === 'string' && /^[a-z0-9]{1,8}$/.test(x)).slice(-30) : [];
  F.list = Array.isArray(F.list) ? F.list.filter((x) => isObj(x) && typeof x.id === 'string' && /^[a-z0-9]{1,8}$/.test(x.id) && Number.isInteger(x.n) && Number.isInteger(x.b) && ['chain', 'seats', 'time'].includes(x.m) && Number.isInteger(x.g)).slice(0, 12)
    .map((x) => ({ id: x.id, nm: typeof x.nm === 'string' ? x.nm.slice(0, 12) : '', n: x.n, b: x.b, k: ['l', 'd', 's', 'r'].includes(x.k) ? x.k : 'l', m: x.m, g: x.g, pg: Number.isInteger(x.pg) ? x.pg : null, mine: !!x.mine, t: num(x.t, 0, 0) })) : [];
  for (const k of ['hint', 'scoop', 'undo']) d.boosters[k] = Number.isInteger(d.boosters[k]) && d.boosters[k] >= 0 ? d.boosters[k] : 0;
  return d;
}

function load() {
  const d = defaults();
  let fresh = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (isObj(raw)) {
      fresh = false;
      const m = migrate(raw);
      merge(d, m);
      // bestStars is a free-form map
      if (isObj(m.bestStars)) d.bestStars = m.bestStars;
      if (isObj(m.counters)) d.counters = m.counters;
      if (isObj(m.cafe) && isObj(m.cafe.built)) d.cafe.built = m.cafe.built;
      if (isObj(m.cafe) && isObj(m.cafe.love)) d.cafe.love = m.cafe.love;
      for (const k of ['hearts', 'wear', 'petDay', 'reno', 'style']) if (isObj(m.cafe) && isObj(m.cafe[k])) d.cafe[k] = m.cafe[k];
      if (isObj(m.show) && isObj(m.show.marks)) d.show.marks = m.show.marks;
      if (isObj(m.show) && isObj(m.show.goals)) d.show.goals = m.show.goals;
      if (isObj(m.season)) for (const k of ['daily', 'claim']) if (isObj(m.season[k])) d.season[k] = m.season[k];
      if (isObj(m.vis)) d.vis = m.vis;
      if (isObj(m.orders)) d.orders = m.orders; // adoption orders: free-form, sanitised in src/game/orders.js
      if (isObj(m.hub)) d.hub = { seen: Number.isInteger(m.hub.seen) && m.hub.seen >= 0 ? m.hub.seen : 0 }; // hub lane (src/ui/hub.js): the last level the map showed
      if (isObj(m.ret)) d.ret = m.ret; // R11 ret lane: day wins + a print waiting to be hung (sanitised in src/game/r11-ret.js state())
      for (const [o, ks] of [['pop', ['daily', 'paid']], ['album', ['cards', 'hung']]]) if (isObj(m[o])) for (const k of ks) if (isObj(m[o][k])) d[o][k] = m[o][k];
      if (isObj(m.rush) && isObj(m.rush.cups)) d.rush.cups = m.rush.cups;
      if (isObj(m.iap) && isObj(m.iap.owned)) d.iap.owned = m.iap.owned;
      if (isObj(m.shop)) d.shop = { ...m.shop, ...d.shop }; // R10 shop keys (own, eq, deal, ad, cush): checked by src/game/shop.js ensure()
      if (isObj(m.show) && isObj(m.show.decor)) d.show.decor = m.show.decor;
      if (isObj(m.meta)) { if (isObj(m.meta.funnel)) d.meta.funnel = m.meta.funnel; if (isObj(m.meta.ret)) d.meta.ret = m.meta.ret; }
    }
  } catch {
    /* blocked or corrupt: fresh save */
  }
  if (fresh) d.meta.firstOpen = Date.now();
  return validate(d);
}

export const save = {
  data: load(),
  commit() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  },
  reset() {
    this.data = defaults();
    this.commit();
  },
};
