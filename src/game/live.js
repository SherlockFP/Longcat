// Long-term retention systems: the café tip jar, resident requests, affection hearts + outfits, the daily-puzzle streak
// chest, Cat Show mastery medals, the weekly Café Rush, 4-week seasons with stamps and visiting cats.
// Pure functions over the save data `d` and a caller-supplied `now` (the rollback-guarded clock, src/kit/clock.js), so
// node can test them (scripts/check-econ.mjs). Nothing here reads cafe.js: callers pass the moved-in resident ids.
import { DAY_MS, dayOf, dayStart, weekOf, grant } from './econ.js';
import { SEASONS, VISITORS, VISIT_GIFT, VISIT_AT, SEASON_GIFT_EVERY, SEASON_GIFT, REPEAT_GIFT, REQ_KINDS, OUTFITS, RUSH_BOTS, RUSH_PRIZES, RUSH_PRIZE_TOP10, RUSH_PRIZE_REST } from '../../data/live.js';

export { SEASONS, VISITORS, VISIT_AT, OUTFITS, REQ_KINDS };
export const H_MS = 3600000;
export const EVENTS_FROM = 10; // Cat Show, Café Rush, seasons and notifications open after level 10 (d.level > 10)
const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
export const eventsOpen = (d) => d.level > EVENTS_FROM;

// ---- tip jar: the residents tip while you are away. Fills over JAR_CAP_H hours. ----
export const JAR_CAP_H = 4;
export const jarRate = (resN, loveN) => (resN > 0 ? 4 + 3 * resN + loveN : 0); // coins per hour
export function jarTick(d, now, resN) {
  const j = d.jar;
  if (resN <= 0) { j.t = 0; return; }
  if (!j.t || j.t > now) j.t = now; // first resident: the jar starts empty; a stamp in the future (clock rollback): restart, never free coins
}
export function jarState(d, now, resN, loveN) {
  jarTick(d, now, resN);
  const rate = jarRate(resN, loveN);
  const cap = rate * JAR_CAP_H;
  if (!rate) return { on: false, coins: 0, cap: 0, pct: 0, stage: 0, fullMs: 0 };
  const el = Math.min(JAR_CAP_H * H_MS, Math.max(0, now - d.jar.t));
  const coins = Math.floor((rate * el) / H_MS);
  const pct = el / (JAR_CAP_H * H_MS);
  return { on: true, coins, cap, rate, pct, stage: pct >= 1 ? 3 : pct >= 0.5 ? 2 : pct >= 0.2 ? 1 : 0, fullMs: Math.max(0, d.jar.t + JAR_CAP_H * H_MS - now) };
}
export function jarCollect(d, now, resN, loveN) { // -> coins paid (0: empty)
  const s = jarState(d, now, resN, loveN);
  if (s.coins <= 0) return 0;
  d.coins += s.coins;
  d.jar.t = now;
  d.jar.total = (d.jar.total || 0) + s.coins;
  return s.coins;
}

// ---- affection hearts + outfits ----
export const heartsOf = (d, id) => d.cafe.hearts[id] || 0;
export function addHearts(d, id, n) { d.cafe.hearts[id] = heartsOf(d, id) + n; }
export const outfitOpen = (d, id, o) => { const f = OUTFITS.find((x) => x.id === o); return !!f && heartsOf(d, id) >= f.need; };
export const outfitsOwned = (d, res) => res.reduce((n, id) => n + OUTFITS.filter((o) => heartsOf(d, id) >= o.need).length, 0);
export function wear(d, id, o) { // o '' = none
  if (o && !outfitOpen(d, id, o)) return false;
  if (o) d.cafe.wear[id] = o; else delete d.cafe.wear[id];
  return true;
}
// the nearest locked outfit among the residents: { id, outfit, have, need } or null
export function nextOutfit(d, res) {
  let best = null;
  for (const id of res) {
    const o = OUTFITS.find((x) => heartsOf(d, id) < x.need);
    if (!o) continue;
    const left = o.need - heartsOf(d, id);
    if (!best || left < best.need - best.have) best = { id, outfit: o.id, have: heartsOf(d, id), need: o.need };
  }
  return best;
}
// petting a resident: +1 heart once a day each
export function pet(d, id, day) {
  if (d.cafe.petDay[id] >= day) return 0;
  d.cafe.petDay[id] = day;
  addHearts(d, id, 1);
  return 1;
}
export const petReady = (d, id, day) => !(d.cafe.petDay[id] >= day);
// the 7-day calendar's last day: the nearest locked outfit is unlocked outright -> { id, outfit } or null
export function giftOutfit(d, res) {
  const n = nextOutfit(d, res);
  if (!n) return null;
  d.cafe.hearts[n.id] = n.need;
  return { id: n.id, outfit: n.outfit };
}

// ---- resident requests: 1 new every REQ_EVERY_H hours, at most REQ_MAX waiting ----
export const REQ_EVERY_H = 4;
export const REQ_MAX = 2;
export function reqTick(d, now, res) { // -> true when a request was added
  const R = d.req;
  if (!res.length) return false;
  if (!R.next) R.next = now; // the first resident: one request right away
  if (R.next > now + REQ_EVERY_H * H_MS) R.next = now + REQ_EVERY_H * H_MS; // a stamp in the future (clock rollback): at most one interval
  let added = false;
  while (now >= R.next && R.list.length < REQ_MAX) {
    R.n++;
    const r = rng(R.n * 2654435761 + 7);
    const kinds = REQ_KINDS.filter((k) => !R.list.some((x) => x.k === k.k)); // two waiting requests never ask the same
    const kd = kinds[Math.floor(r() * kinds.length)];
    const others = res.filter((id) => !R.list.some((x) => x.who === id));
    const pool = others.length ? others : res;
    R.list.push({ k: kd.k, who: pool[Math.floor(r() * pool.length)], need: kd.need, p: 0, c: Math.floor(r() * 8), s: R.n });
    R.next += REQ_EVERY_H * H_MS;
    added = true;
  }
  if (R.list.length >= REQ_MAX) R.next = Math.max(R.next, now + REQ_EVERY_H * H_MS); // full: the clock waits (no pile of catch-up requests)
  return added;
}
// a resident who just moved in asks for something at once (their first request is the next thread on the hub);
// a full list keeps its requests and the newcomer asks with the next one
export function reqArrive(d, id) { // -> the new request or null
  const R = d.req;
  if (R.list.length >= REQ_MAX || R.list.some((x) => x.who === id)) return null;
  R.n++;
  // an easy first ask the next levels fill on their own: win two, else fill carriers
  const kd = REQ_KINDS.find((k) => (k.k === 'win' || k.k === 'carrier') && !R.list.some((x) => x.k === k.k)) || REQ_KINDS[0];
  const x = { k: kd.k, who: id, need: kd.need, p: 0, c: 0, s: R.n };
  R.list.push(x);
  R.fresh = id;
  return x;
}
export const reqDef = (k) => REQ_KINDS.find((x) => x.k === k);
export function reqEvent(d, ev, n = 1, color = -1) { // ev: win | cat | carrier | tidy | daily -> true when progress moved
  let hit = false;
  for (const x of d.req.list) {
    const want = x.k === 'color' ? 'cat' : x.k;
    if (want !== ev || x.p >= x.need) continue;
    if (x.k === 'color' && color !== x.c) continue;
    x.p = Math.min(x.need, x.p + n);
    hit = true;
  }
  return hit;
}
export function reqClaim(d, i, now) { // -> { coins, hearts, who } or null
  const x = d.req.list[i];
  if (!x || x.p < x.need) return null;
  const def = reqDef(x.k);
  d.req.list.splice(i, 1);
  if (d.req.fresh === x.who) d.req.fresh = '';
  d.coins += def.coins;
  addHearts(d, x.who, def.hearts);
  d.req.done = (d.req.done || 0) + 1;
  if (!(d.req.next > now)) d.req.next = now + REQ_EVERY_H * H_MS; // the open slot fills one interval from now
  return { coins: def.coins, hearts: def.hearts, who: x.who, first: d.req.done === 1 };
}
export const reqReady = (d) => d.req.list.some((x) => x.p >= x.need);

// ---- daily puzzle streak chest (the streak itself lives in d.daily: a missed day resets it) ----
export function streakChest(streak) {
  const s = Math.max(1, Math.min(7, streak));
  const r = { coins: 20 + 10 * s };
  if (s === 3) r.hint = 1;
  if (s === 5) r.scoop = 1;
  if (s === 7) { r.scoop = 1; r.undo = 1; r.coins += 30; }
  return r;
}

// ---- seasons: 4 weeks each, rotating through data/live.js SEASONS ----
export const seasonOf = (week) => Math.floor(week / 4);
export const seasonDef = (s) => SEASONS[((s % SEASONS.length) + SEASONS.length) % SEASONS.length];
export const seasonEndsMs = (s, now) => Math.max(0, dayStart((s + 1) * 4 * 7 - 3) - now);
const bits = (b) => (b & 1) + ((b >> 1) & 1);
export const boardKey = (w, k) => `${w}${k}`;
const keyWeek = (key) => parseInt(key, 10);
export function stampsOf(d, s) {
  let n = d.season.daily[s] || 0;
  for (const [key, b] of Object.entries(d.show.marks)) if (seasonOf(keyWeek(key)) === s) n += bits(b);
  return n;
}
// what a season pays at a stamp count: its 2 visitors, then a gift every SEASON_GIFT_EVERY stamps
export function seasonSteps(s, stamps) {
  const out = VISIT_AT.map((at, i) => ({ at, visitor: seasonDef(s).visitors[i] }));
  const last = VISIT_AT[VISIT_AT.length - 1];
  const gifts = Math.max(1, Math.floor((stamps - last) / SEASON_GIFT_EVERY) + 1);
  for (let g = 1; g <= gifts; g++) out.push({ at: last + g * SEASON_GIFT_EVERY, gift: true });
  return out;
}
export function seasonClaimable(d, s) {
  const st = stampsOf(d, s);
  const done = d.season.claim[s] || 0;
  return seasonSteps(s, st).filter((x, i) => i >= done && st >= x.at).length;
}
// claims the next reached step of season s -> { visitor, repeat } | { gift } | null
export function seasonClaim(d, s, day) {
  const st = stampsOf(d, s);
  const done = d.season.claim[s] || 0;
  const step = seasonSteps(s, st)[done];
  if (!step || st < step.at) return null;
  d.season.claim[s] = done + 1;
  if (step.visitor) {
    if (d.vis[step.visitor]) { grant(d, REPEAT_GIFT); return { visitor: step.visitor, repeat: true, reward: REPEAT_GIFT }; }
    d.vis[step.visitor] = day || 1;
    return { visitor: step.visitor };
  }
  grant(d, SEASON_GIFT);
  return { gift: true, reward: SEASON_GIFT };
}
// any season (current or archived) with a reward waiting
export function seasonsReady(d) {
  const seen = new Set(Object.keys(d.show.marks).map((k) => seasonOf(keyWeek(k))));
  for (const s of Object.keys(d.season.daily)) seen.add(+s);
  return [...seen].filter((s) => seasonClaimable(d, s) > 0).sort((a, b) => b - a);
}
export const addDailyStamp = (d, week) => { const s = seasonOf(week); d.season.daily[s] = (d.season.daily[s] || 0) + 1; };
export const visitorsOwned = (d) => Object.keys(d.vis).filter((id) => VISITORS[id]);
// the visitor who drops by today (rotates), its daily gift once per day
export const visitorToday = (d, day) => { const v = visitorsOwned(d); return v.length ? v[day % v.length] : null; };
export function visitorGift(d, id, day) {
  if (!d.vis[id] || d.season.visDay >= day) return 0;
  d.season.visDay = day;
  d.coins += VISIT_GIFT.coins;
  return VISIT_GIFT.coins;
}

// ---- Cat Show mastery: 2 fixed boards a week, each with one published goal; bronze = clear, gold = goal ----
export const SHOW_BRONZE_COINS = 30;
export const SHOW_GOLD_COINS = 60;
export function showMedal(d, w, k, gold) { // -> { bronze, gold, coins, stamps, rosette } newly earned
  const key = boardKey(w, k);
  const b = d.show.marks[key] || 0;
  const nb = b | 1 | (gold ? 2 : 0);
  const out = { bronze: !(b & 1), gold: !!gold && !(b & 2), coins: 0, stamps: bits(nb) - bits(b), rosette: false };
  d.show.marks[key] = nb;
  if (out.bronze) out.coins += SHOW_BRONZE_COINS;
  if (out.gold) out.coins += SHOW_GOLD_COINS;
  d.coins += out.coins;
  return out;
}
export const medalOf = (d, w, k) => { const b = d.show.marks[boardKey(w, k)] || 0; return b & 2 ? 'gold' : b & 1 ? 'bronze' : ''; };
export const bothGold = (d, w) => medalOf(d, w, 'a') === 'gold' && medalOf(d, w, 'b') === 'gold';
// the weeks the archive shows (the player's first Show week up to last week), newest first
export function archiveWeeks(d, week) {
  const from = d.show.from || week;
  const out = [];
  for (let w = week - 1; w >= from && out.length < 52; w--) out.push(w);
  return out;
}

// ---- Café Rush: one board a week vs 19 practice bots with simulated, honest times ----
// Bot times scale with the board's cat count: a spread from a brisk 1.6 s per cat (a sharp human pace: every send is
// a ~0.5 s animation plus the read) to a slow 4.2 s per cat, plus a short reading pause, rounded to tenths. A board
// whose size is not known yet counts as 30 cats, so a bot never shows a 2-second clear.
export const RUSH_PER = [1.6, 4.2];
export function rushBots(week, cats) {
  const r = rng(week * 7919 + 13);
  const n = cats > 0 ? cats : 30;
  const out = RUSH_BOTS.map((name, i) => {
    const per = RUSH_PER[0] + ((RUSH_PER[1] - RUSH_PER[0]) * (i + r())) / RUSH_BOTS.length;
    return { name, ms: Math.round((n * per * 1000 + 1500 + r() * 2500) / 100) * 100 };
  });
  return out.sort((a, b) => a.ms - b.ms);
}
export const rushRank = (bots, ms) => (ms > 0 ? 1 + bots.filter((b) => b.ms < ms).length : 0);
export function rushPrize(rank) {
  if (rank <= 0) return null;
  if (rank <= 3) return RUSH_PRIZES[rank - 1];
  return rank <= 10 ? RUSH_PRIZE_TOP10 : RUSH_PRIZE_REST;
}
// a new week: last week's best becomes a prize waiting to be claimed
export function rushRoll(d, week, cats) {
  const R = d.rush;
  if (R.week >= week) return false;
  if (R.week && R.best > 0 && !R.pend) R.pend = { week: R.week, rank: rushRank(rushBots(R.week, R.cats || cats), R.best) };
  R.week = week;
  R.best = 0;
  R.cats = cats;
  return true;
}
export function rushResult(d, ms) { // -> true on a new best
  if (!(ms > 0)) return false;
  if (d.rush.best && d.rush.best <= ms) return false;
  d.rush.best = Math.round(ms);
  return true;
}
export function rushClaim(d) {
  const p = d.rush.pend;
  if (!p) return null;
  d.rush.pend = null;
  const prize = rushPrize(p.rank);
  if (!prize) return null;
  d.coins += prize.coins;
  if (prize.cup) d.rush.cups[prize.cup] = (d.rush.cups[prize.cup] || 0) + 1;
  return { ...prize, rank: p.rank };
}

// ---- every timer and stamp that a wrong device date can leave in the future ----
export function clampAheadLive(d, now) {
  let hit = false;
  if (d.jar.t > now) { d.jar.t = now; hit = true; }
  if (d.req.next > now + REQ_EVERY_H * H_MS) { d.req.next = now + REQ_EVERY_H * H_MS; hit = true; }
  const day = dayOf(now);
  const w = weekOf(day);
  if (d.rush.week > w) { d.rush.week = w; hit = true; }
  if (d.season.visDay > day) { d.season.visDay = day; hit = true; }
  for (const k of Object.keys(d.cafe.petDay)) if (d.cafe.petDay[k] > day) { d.cafe.petDay[k] = day; hit = true; }
  return hit;
}

// ---- the hub's "next goals" strip: at most 2 rows, claimable ones first ----
// c: { stars, resident, res: [ids], week, streak, dailyDone, party (star cost), show: {have, need} | null }
// The next resident is the thread of the hub and lives on the build card, so it is not repeated here. Pinned after the
// claimable rows: a newcomer's first request, today's puzzle (until played), this week's Cat Show medals; then the nearest.
export function goals(d, now, c) {
  const out = [];
  const add = (g, pin = 9) => { if (g.need > 0) out.push({ ...g, pct: Math.min(1, g.have / g.need), pin }); };
  d.req.list.forEach((x, i) => add({ k: 'req', i, have: x.p, need: x.need, who: x.who, req: x, fresh: d.req.fresh === x.who }, d.req.fresh === x.who ? 0 : 9));
  if (!c.dailyDone) add({ k: 'daily', have: Math.min(7, c.streak || 0), need: 7 }, 1);
  if (c.show && c.show.have < c.show.need) add({ k: 'show', have: c.show.have, need: c.show.need }, 2);
  const o = nextOutfit(d, c.res);
  if (o) add({ k: 'outfit', have: o.have, need: o.need, who: o.id, outfit: o.outfit });
  if (eventsOpen(d)) {
    const s = seasonOf(c.week);
    const st = stampsOf(d, s);
    const done = d.season.claim[s] || 0;
    const step = seasonSteps(s, st)[done];
    if (step) add({ k: 'season', have: Math.min(st, step.at), need: step.at, visitor: step.visitor || '' });
  }
  if (c.party) add({ k: 'party', have: Math.min(c.stars, c.party), need: c.party });
  // claimable first, then the pinned rows in order, then the nearest (largest share done); ties keep the order above
  return out.map((g, i) => ({ g, i })).sort((a, b) => (b.g.pct >= 1) - (a.g.pct >= 1) || a.g.pin - b.g.pin || b.g.pct - a.g.pct || a.i - b.i).map((x) => x.g).slice(0, 2);
}

// ---- the hub's one spotlight: the single most useful thing to do now (r10 retention) ----
// c: { claim: 'quests'|'season'|'rush'|'', req: index of a ready request or -1, jarFull, build: affordable next build }
// priority: a reward waiting to be claimed > a finished resident request > a full tip jar > the next build > nothing
export function spotlight(c) {
  if (c.claim) return { k: 'claim', what: c.claim };
  if (c.req >= 0) return { k: 'req', i: c.req };
  if (c.jarFull) return { k: 'jar' };
  if (c.build) return { k: 'build' };
  return null;
}

export const dayMs = DAY_MS;
