// Versioned localStorage save. Safe when storage is blocked.
import { TASK_POOL } from '../game/econ.js';

const KEY = 'lco_save';
const VERSION = 7;

const defaults = () => ({
  v: VERSION,
  level: 1,
  coins: 50,
  bestStars: {},
  settings: { sound: true, haptics: true, lang: guessLang() },
  daily: { last: '', streak: 0, doneDay: '' },
  ads: { wins: 0, lastInterstitial: 0, removeAds: false },
  counters: {},
  boosters: { hint: 3, scoop: 2, undo: 3 },
  cafe: { stars: 0, built: {}, hintDay: '', hintN: 0, scoopLevel: 0, love: {}, party: 0 }, // hintN: free perk hints used on hintDay; love: resident id -> affection level 0..3 (treats)
  lives: { n: 5, t: 0 }, // t = when the next life regen started (0 while full)
  purr: { n: 0, pend: 0, lost: 0, seatLv: 0 }, // Purr Streak count + the bonus waiting for the next level (0/1/2) + the level last lost (so a restart cannot fake a first try) + the level whose bonus bench seat is still owed
  quests: { day: 0, list: [], chest: 0 }, // 3 daily tasks: { id, p: progress, c: claimed }
  login: { last: 0, idx: 0 }, // 7-day calendar: last claimed day number, claims in this cycle
  show: { week: 0, ribbons: 0, claimed: [], decor: {}, best: -1, ch: 0, mark: 0, markWeek: 0 }, // weekly Cat Show (+ the Show board: best seats used, cleared/gold bits, the judges' mark and its week)
  shop: { starterShown: false },
  iap: { owned: {}, tx: [] }, // non-consumables owned + recent transaction ids (no double grants)
  clock: { max: 0 }, // highest time ever seen: the rollback guard
  meta: { firstOpen: 0, sessions: 0, funnel: {}, ret: {} },
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
  s.haptics = !!s.haptics;
  if (s.lang !== 'en' && s.lang !== 'tr') s.lang = guessLang();
  d.daily.last = String(d.daily.last ?? '');
  d.daily.doneDay = String(d.daily.doneDay ?? '');
  d.daily.streak = num(d.daily.streak, 0, 0);
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
  w.ribbons = num(w.ribbons, 0, 0);
  w.claimed = Array.isArray(w.claimed) ? w.claimed.filter((i) => Number.isInteger(i) && i >= 0 && i < 10) : [];
  if (!isObj(w.decor)) w.decor = {};
  w.best = Number.isInteger(w.best) && w.best >= -1 && w.best < 20 ? w.best : -1;
  w.ch = Number.isInteger(w.ch) && w.ch >= 0 && w.ch <= 3 ? w.ch : 0;
  w.mark = Number.isInteger(w.mark) && w.mark >= 0 && w.mark < 20 ? w.mark : 0;
  w.markWeek = num(w.markWeek, 0, 0);
  d.shop.starterShown = !!d.shop.starterShown;
  if (!isObj(d.iap.owned)) d.iap.owned = {};
  d.iap.tx = Array.isArray(d.iap.tx) ? d.iap.tx.filter((x) => typeof x === 'string').slice(-30) : [];
  d.clock.max = num(d.clock.max, 0, 0);
  const m = d.meta;
  m.firstOpen = num(m.firstOpen, 0, 0);
  m.sessions = num(m.sessions, 0, 0);
  if (!isObj(m.funnel)) m.funnel = {};
  if (!isObj(m.ret)) m.ret = {};
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
      if (isObj(m.iap) && isObj(m.iap.owned)) d.iap.owned = m.iap.owned;
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
