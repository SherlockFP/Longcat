// Economy and long-term systems (DESIGN-V2 section 5). Pure functions over the save data `d` and a caller-supplied `now` (ms),
// so they are testable in node. The caller passes the rollback-guarded clock (src/kit/clock.js).
import { EVENT_THEMES } from '../../data/events.js';

export const MAX_LIVES = 5;
export const REGEN_MS = 25 * 60 * 1000;
export const DAY_MS = 86400000;
export const INTERSTITIAL_GAP_MS = 3 * 60 * 1000;
export const FIRST_SESSION_MS = 5 * 60 * 1000;
export const INTERSTITIAL_FROM = 8;
export const HARD_FROM = 15; // first level that can be hard
export const LIFE_REFILL_COST = 300;
export const SEAT_COSTS = [120, 200, 300]; // the n-th paid seat within one level
export const SEAT_COST = SEAT_COSTS[0];

export const dayOf = (now) => Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / DAY_MS);
export const dayStart = (day) => { // local midnight of a day number, in ms
  const approx = day * DAY_MS;
  return approx + new Date(approx + DAY_MS / 2).getTimezoneOffset() * 60000;
};

export function grant(d, r) {
  if (r.coins) d.coins += r.coins;
  for (const k of ['hint', 'scoop', 'undo']) if (r[k]) d.boosters[k] += r[k];
}

// ---- lives ----
export function livesTick(d, now) {
  const L = d.lives;
  if (L.n >= MAX_LIVES) { L.n = MAX_LIVES; L.t = 0; return; }
  if (!L.t || L.t > now) L.t = now; // repair, or a timer stamped in the future (clock rollback): no free time, no lockout
  const gain = Math.floor((now - L.t) / REGEN_MS);
  if (gain > 0) {
    L.n = Math.min(MAX_LIVES, L.n + gain);
    L.t = L.n >= MAX_LIVES ? 0 : L.t + gain * REGEN_MS;
  }
}
export function lives(d, now) { livesTick(d, now); return d.lives.n; }
export function livesMs(d, now) { // ms until the next life, 0 when full
  livesTick(d, now);
  return d.lives.n >= MAX_LIVES ? 0 : Math.max(0, d.lives.t + REGEN_MS - now);
}
export function loseLife(d, now) {
  livesTick(d, now);
  if (d.lives.n <= 0) return false;
  if (d.lives.n >= MAX_LIVES) d.lives.t = now;
  d.lives.n--;
  return true;
}
export function addLife(d, n = 1) {
  d.lives.n = Math.min(MAX_LIVES, d.lives.n + n);
  if (d.lives.n >= MAX_LIVES) d.lives.t = 0;
}
export function refillLives(d) { d.lives.n = MAX_LIVES; d.lives.t = 0; }

// ---- Purr Streak: 3 first-try wins -> next level starts with a Hint + a bench seat; 5 -> also a Scoop. A loss resets it. ----
export function purrWin(d, firstTry) {
  const p = d.purr;
  if (!firstTry) { p.n = 0; return; }
  p.n++;
  if (p.n >= 5) { p.pend = 2; p.n = 0; } else if (p.n === 3) p.pend = Math.max(p.pend, 1);
}
export const purrLoss = (d) => { d.purr.n = 0; };
export function purrConsume(d) { const k = d.purr.pend; d.purr.pend = 0; return k; } // 0 none, 1 hint+seat, 2 hint+seat+scoop
export const purrGoal = (d) => (d.purr.n < 3 ? 3 : 5);

// ---- daily tasks (3 a day) + chest ----
export const TASK_POOL = [
  { id: 'carriers', ev: 'carrier', need: 10, coins: 15 },
  { id: 'wins', ev: 'win', need: 3, coins: 15 },
  { id: 'hard', ev: 'hard', need: 1, coins: 25 },
  { id: 'cats', ev: 'cat', need: 50, coins: 20 },
];
export const CHEST = { coins: 40, scoop: 1 };
export const taskDef = (id) => TASK_POOL.find((x) => x.id === id);

export function questsRoll(d, day) {
  const q = d.quests;
  if (q.day >= day) return false; // same day, or the clock went back: keep the current list
  let s = (day * 2654435761) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const pool = TASK_POOL.filter((x) => x.id !== 'hard' || d.level > HARD_FROM).map((x) => x.id);
  const pick = [];
  while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  d.quests = { day, list: pick.map((id) => ({ id, p: 0, c: 0 })), chest: 0 };
  return true;
}
export function questEvent(d, ev, day, n = 1) {
  questsRoll(d, day);
  let hit = false;
  for (const x of d.quests.list) {
    const def = taskDef(x.id);
    if (def && def.ev === ev && !x.c && x.p < def.need) { x.p = Math.min(def.need, x.p + n); hit = true; }
  }
  return hit;
}
export const taskDone = (x) => !!taskDef(x.id) && x.p >= taskDef(x.id).need;
export function questClaim(d, id, day) { // -> coins paid, 0 when not claimable (no double pay)
  questsRoll(d, day);
  const x = d.quests.list.find((y) => y.id === id);
  if (!x || x.c || !taskDone(x)) return 0;
  x.c = 1;
  const c = taskDef(id).coins;
  d.coins += c;
  return c;
}
export const chestReady = (d) => !d.quests.chest && d.quests.list.length > 0 && d.quests.list.every((x) => x.c);
export function chestClaim(d) {
  if (!chestReady(d)) return null;
  d.quests.chest = 1;
  grant(d, CHEST);
  return CHEST;
}

// ---- 7-day login calendar (a missed day restarts it) ----
export const LOGIN_REWARDS = [
  { coins: 20 }, { coins: 10, hint: 1 }, { coins: 40 }, { scoop: 1 }, { coins: 60, undo: 1 }, { coins: 30, hint: 1, scoop: 1 }, { coins: 150, scoop: 2, hint: 2 },
];
export function loginState(d, day) { // -> { avail, idx }: idx = today's reward when avail, else the count already claimed this cycle
  const g = d.login;
  if (g.last >= day) return { avail: false, idx: g.idx };
  const idx = g.last === 0 || day - g.last > 1 || g.idx >= LOGIN_REWARDS.length ? 0 : g.idx;
  return { avail: true, idx };
}
export function loginClaim(d, day) {
  const s = loginState(d, day);
  if (!s.avail) return null;
  d.login.idx = s.idx + 1;
  d.login.last = day;
  const r = LOGIN_REWARDS[s.idx];
  grant(d, r);
  return r;
}

// ---- weekly Cat Show ----
export const SHOW_STEPS = [3, 6, 9, 13, 17, 21, 26, 31, 37, 44]; // cumulative ribbons
export const SHOW_REWARDS = [
  { coins: 30 }, { hint: 1 }, { coins: 50 }, { undo: 1 }, { scoop: 1 }, { coins: 80 }, { hint: 2 }, { scoop: 1, coins: 50 }, { coins: 120 }, { coins: 100, scoop: 2, decor: true },
];
export const THEMES = EVENT_THEMES;
export const weekOf = (day) => Math.floor((day + 3) / 7); // weeks start Monday
export const themeOf = (week) => EVENT_THEMES[((week % EVENT_THEMES.length) + EVENT_THEMES.length) % EVENT_THEMES.length];
export function showRoll(d, day) {
  const w = weekOf(day);
  if (d.show.week >= w) return false; // same week, or the clock went back
  d.show.week = w;
  d.show.ribbons = 0;
  d.show.claimed = [];
  d.show.best = -1;
  d.show.ch = 0;
  return true;
}

// the week's Show board (practice is free and unlimited): the first clear pays SHOW_CLEAR ribbons, clearing it within
// the judges' mark (the fewest seats it can be done with) pays SHOW_MARK more. Score = most seats used at once.
export const SHOW_CLEAR = 3;
export const SHOW_MARK = 5;
export function showBoardResult(d, peak, mark) {
  const s = d.show;
  let ribbons = 0;
  const best = s.best < 0 || peak < s.best;
  if (best) s.best = peak;
  if (!(s.ch & 1)) { s.ch |= 1; ribbons += SHOW_CLEAR; }
  if (peak <= mark && !(s.ch & 2)) { s.ch |= 2; ribbons += SHOW_MARK; }
  return { ribbons, best };
}
export function showAdd(d, n, day) {
  showRoll(d, day);
  d.show.ribbons += n;
}
export const showReady = (d, i) => d.show.ribbons >= SHOW_STEPS[i] && !d.show.claimed.includes(i);
export const showAnyReady = (d) => SHOW_STEPS.some((_, i) => showReady(d, i));
export function showClaim(d, day) { // claims every reached step; -> list of rewards (empty when none)
  showRoll(d, day);
  const out = [];
  SHOW_STEPS.forEach((_, i) => {
    if (!showReady(d, i)) return;
    d.show.claimed.push(i);
    const r = SHOW_REWARDS[i];
    grant(d, r);
    if (r.decor) d.show.decor[themeOf(d.show.week).id] = 1;
    out.push(r);
  });
  return out;
}
export const showEndsMs = (day, now) => Math.max(0, dayStart((weekOf(day) + 1) * 7 - 3) - now);
export const earnedDecor = (d) => Object.keys(d.show.decor); // theme ids: the café hangs one rosette per theme on its wall

// A session on a wrong device date can leave day / week stamps in the future. The clock guard (kit/clock.js) only
// pins now() to at most 2 days ahead, so once the date is fixed these stamps would freeze the login calendar, the
// daily tasks, the weekly show and the daily streak until real time caught up. Pull them back to today.
export function clampAhead(d, day) {
  let hit = false;
  if (d.login.last > day) { d.login.last = day; hit = true; }
  if (d.quests.day > day) { d.quests.day = day; hit = true; }
  const w = weekOf(day);
  if (d.show.week > w) { d.show.week = w; hit = true; }
  if (d.show.markWeek > w) { d.show.markWeek = 0; hit = true; }
  for (const k of ['last', 'doneDay']) if (d.daily[k] && +d.daily[k] > day) { d.daily[k] = String(day); hit = true; }
  if (+d.cafe.hintDay > day) { d.cafe.hintDay = String(day); hit = true; }
  return hit;
}

// ---- ads: after a win only, from level 8, 1 per 3 min, none in the first 5 minutes after install ----
export function interstitialOk(d, level, now) {
  if (d.ads.removeAds || level < INTERSTITIAL_FROM) return false;
  if (d.meta.firstOpen && now - d.meta.firstOpen < FIRST_SESSION_MS) return false;
  return now - d.ads.lastInterstitial >= INTERSTITIAL_GAP_MS;
}

// ---- starter bundle: offered once, after level 10 ----
export const starterDue = (d) => !d.shop.starterShown && !d.iap.owned.starter && !d.iap.owned.noads && d.level > 10;

// notification dots on the hub
export function dots(d, now) {
  const day = dayOf(now);
  questsRoll(d, day);
  showRoll(d, day);
  return {
    quests: loginState(d, day).avail || chestReady(d) || d.quests.list.some((x) => !x.c && taskDone(x)),
    show: showAnyReady(d),
  };
}
