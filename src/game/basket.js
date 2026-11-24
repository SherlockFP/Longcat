// Timed baskets, the "wait or pay" loop (view: src/ui/basket.js). A first clear from L4 sometimes drops a sleeping-cat
// basket into one of 3 slots on the map. One basket wakes at a time (a tap starts it); when its timer ends it opens
// with the boss lane's chest opening and pays through boss.js pay(). Speed-ups: coins (by the minutes left), a rewarded
// ad (30 min off) or the "Fast paws" IAP stub (every basket awake). Timers are clock.js now() stamps, so they survive
// reloads and a clock set back never shortens one.
// Also here: the start gifts (an instant gift on each of the first 5 first clears) and the day-1 welcome gift.
// State, created lazily: d.bask = { s: [{ r: tier, end: 0 asleep | ms stamp waking/awake }], k: baskets opened,
//   g: the last level that paid its start gift (0..5), w: 1 once the welcome gift is paid }
import { pay, nextLook } from './boss.js';

export const SLOTS = 3;
export const DROP_FROM = 4; // the map (where the slots live) is home from L4
export const TIERS = {
  common: { min: 15, coins: 20, boost: 0 },
  rare: { min: 60, coins: 35, boost: 1 },
  epic: { min: 180, coins: 60, boost: 1, look: true },
};
export const DROP = [['epic', 2], ['rare', 6], ['common', 18]]; // % per first clear (tuned in scripts/check-econ.mjs)
export const AD_SKIP = 30 * 60000;
const BOOST = ['hint', 'undo', 'hint', 'scoop'];
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v, lo = 0) => (Number.isInteger(v) && v >= lo ? v : lo);

export function state(d) {
  const b = isObj(d.bask) ? d.bask : (d.bask = {});
  b.s = Array.isArray(b.s) ? b.s.filter((x) => isObj(x) && TIERS[x.r]).slice(0, SLOTS) : []; // the same objects: callers hold them
  for (const x of b.s) if (!(Number.isFinite(x.end) && x.end > 0)) x.end = 0;
  b.k = int(b.k);
  b.g = Math.min(5, int(b.g));
  b.w = b.w ? 1 : 0;
  return b;
}

// the drop roll for level n: deterministic (a replayed save drops the same), null = nothing
export function roll(n) {
  let x = Math.imul(n + 0x9e37, 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  let p = (x >>> 8) % 100;
  for (const [r, pct] of DROP) { if (p < pct) return r; p -= pct; }
  return null;
}
// a first clear of campaign level n -> the tier dropped, 'full' (slots full: the basket is lost), or null
export function onClear(d, n) {
  const r = n >= DROP_FROM ? roll(n) : null;
  if (!r) return null;
  const b = state(d);
  if (b.s.length >= SLOTS) return 'full';
  b.s.push({ r, end: 0 });
  return r;
}

export const durMs = (r) => TIERS[r].min * 60000;
// 'sleep' (not started) | 'wake' (timer running) | 'ready'
export const status = (x, now) => (!x.end ? 'sleep' : x.end > now ? 'wake' : 'ready');
export const waking = (d, now) => state(d).s.findIndex((x) => status(x, now) === 'wake');
export const left = (x, now) => (!x.end ? durMs(x.r) : Math.max(0, x.end - now));
// coins to wake a basket now: 1.5 coins a minute left, in steps of 5 (15 min = 25, 1 h = 90, 3 h = 270)
export const price = (ms) => Math.max(5, Math.ceil((Math.ceil(ms / 60000) * 1.5) / 5) * 5);

// tap on a sleeping basket: its timer starts unless another one is waking -> true when started
export function start(d, i, now) {
  const b = state(d);
  const x = b.s[i];
  if (!x || x.end || waking(d, now) >= 0) return false;
  x.end = now + durMs(x.r);
  return true;
}
// wake basket i now for coins -> coins paid, 0 when not affordable / nothing to wake
export function buyWake(d, i, now) {
  const x = state(d).s[i];
  if (!x || status(x, now) === 'ready') return 0;
  const c = price(left(x, now));
  if (d.coins < c) return 0;
  d.coins -= c;
  x.end = Math.min(now, x.end || now);
  return c;
}
// a rewarded ad watched: 30 min off the waking basket -> true when applied
export function adSkip(d, i, now) {
  const x = state(d).s[i];
  if (!x || status(x, now) !== 'wake') return false;
  x.end = Math.max(1, x.end - AD_SKIP);
  return true;
}
// "Fast paws" (kit/iap.js): every basket awake now (end 1 = long past)
export function wakeAll(d) { for (const x of state(d).s) x.end = 1; }

// what basket x holds: coins, boosters, an outfit / carrier skin from an epic (coins when every look is owned)
export function lootOf(d, x, k = state(d).k) {
  const T = TIERS[x.r];
  const items = {};
  for (let j = 0; j < T.boost; j++) { const id = BOOST[(k + j) % BOOST.length]; items[id] = (items[id] || 0) + 1; }
  const L = { t: 'bask', tier: x.r, coins: T.coins, items, cos: null };
  if (T.look) { const it = nextLook(d); if (it) L.cos = it.id; else L.coins += 100; }
  return L;
}
// open the ready basket i: pays it -> { e, loot } or null
export function take(d, i, now) {
  const b = state(d);
  const x = b.s[i];
  if (!x || status(x, now) !== 'ready') return null;
  b.s.splice(i, 1);
  const loot = pay(d, lootOf(d, x));
  b.k++;
  return { e: { t: 'bask', r: x.r }, loot };
}

// ---- start gifts: the first 5 first clears each pay at once (L3: the first basket, already awake; L5: the milestone
// chest boss.js queues there, which the view opens right away). -> { e, loot } | { basket: true } | { chest: true } | null
export function startGift(d, n) {
  const b = state(d);
  if (n !== b.g + 1 || n > 5) return null;
  b.g = n;
  const gift = (loot) => ({ e: { t: 'gift' }, loot: pay(d, { t: 'gift', tier: 'common', coins: 0, items: {}, cos: null, ...loot }) });
  if (n === 1) return gift({ coins: 50 });
  if (n === 2) return gift({ items: { hint: 2 } });
  if (n === 3) { if (b.s.length < SLOTS) b.s.unshift({ r: 'common', end: 1 }); return { basket: true }; }
  if (n === 4) { const it = nextLook(d); return gift(it ? { tier: 'rare', cos: it.id } : { coins: 100 }); }
  return { chest: true };
}
// the day-1 welcome gift: once, on the first map after the tutorial levels (new players only: their start gifts ran)
export function welcome(d) {
  const b = state(d);
  if (b.w || b.g < 3 || d.level < DROP_FROM) return null;
  b.w = 1;
  return { e: { t: 'welcome' }, loot: pay(d, { t: 'welcome', tier: 'rare', coins: 100, items: { undo: 1, hint: 1 }, cos: null }) };
}
