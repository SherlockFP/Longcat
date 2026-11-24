// Boss lane rules: pure functions over the save data `d` (node tests them in scripts/check-econ.mjs / check-core.mjs).
//  - every 20th level is a boss (src/core/generate.js isBossLevel): a named Big Boss Cat (data/boss.js) whose HP is the
//    cats the board delivers;
//  - chests: a wooden milestone chest on every 5th first clear (not a boss level), a gold boss chest on a boss's first
//    clear (tier fixed per boss index: the first boss is always rare), and a streak chest every 3 first clears in a row;
//  - chests wait in a queue (d.boss.q) and pay when they are opened (src/ui/boss.js), so a reload never loses one.
// State, created lazily here: d.boss = { last, fl: { n, fail, k }, q: [{ t: 'wood'|'boss'|'streak', n, i }], beat, open }
import { isBossLevel, BOSS_EVERY } from '../core/generate.js';
import { COSMETICS } from '../../data/shop.js';
import { owns, ensure as shopEnsure } from './shop.js';
import { BOSSES, TAUNTS, HURT, DEFEAT, CH_ADJ, CH_PLACE, WOOD, STREAK, STREAK_LEN, BOSS_CHEST } from '../../data/boss.js';

export { BOSSES, TAUNTS, HURT, DEFEAT, STREAK_LEN, isBossLevel, BOSS_EVERY };

const int = (v, lo = 0) => (Number.isInteger(v) && v >= lo ? v : lo);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const TYPES = ['wood', 'boss', 'streak'];
const QMAX = 30; // unopened chests kept; past it the oldest pays out unseen (never lost)

export function state(d) {
  const b = isObj(d.boss) ? d.boss : (d.boss = {});
  b.last = int(b.last);
  b.beat = int(b.beat);
  b.open = int(b.open); // chests opened in total (the skip-on-tap rule: from the 2nd opening on)
  if (!isObj(b.fl)) b.fl = {};
  b.fl.n = Math.min(STREAK_LEN - 1, int(b.fl.n));
  b.fl.fail = int(b.fl.fail);
  b.fl.k = int(b.fl.k);
  b.q = Array.isArray(b.q) ? b.q.filter((e) => isObj(e) && TYPES.includes(e.t) && Number.isInteger(e.n) && e.n >= 0).slice(0, QMAX * 2) : [];
  return b;
}

// ---- who the boss is ----
export const bossIndex = (n) => (isBossLevel(n) ? n / BOSS_EVERY - 1 : -1);
export function bossOf(n) {
  const i = bossIndex(n);
  if (i < 0) return null;
  const B = BOSSES[i % BOSSES.length];
  return { ...B, i, n, lap: Math.floor(i / BOSSES.length), taunt: TAUNTS[i % TAUNTS.length], defeat: DEFEAT[i % DEFEAT.length] };
}
export const nextBoss = (n) => Math.ceil(Math.max(1, n) / BOSS_EVERY) * BOSS_EVERY; // the boss level at or after n
export const hurtLine = (k) => HURT[Math.max(0, Math.min(HURT.length - 1, k))];

// a map chapter past the named ones (1-based chapter number c, `named` = how many names data/hub.js has)
export function chapterName(c, named) {
  const i = Math.max(0, c - 1 - named) % (CH_ADJ.length * CH_PLACE.length);
  const a = CH_ADJ[i % CH_ADJ.length];
  const p = CH_PLACE[(7 * i + Math.floor(i / CH_ADJ.length)) % CH_PLACE.length];
  return { en: `${a.en} ${p.en}`, tr: `${a.tr} ${p.tr}` };
}

// ---- chest tiers: fixed per boss index (never a roll at open time): the first boss is rare, then a 6-boss cycle of
// common, rare, common, epic, common, rare (two commons never meet; one epic every 6 bosses = 120 levels) ----
const CYCLE = ['common', 'rare', 'common', 'epic', 'common', 'rare'];
export const tierOf = (i) => (i <= 0 ? 'rare' : CYCLE[(i - 1) % CYCLE.length]);

// the next cosmetic a chest gives: rare = an outfit or carrier skin, epic = a play-room theme (cheapest unowned first)
const RARE = COSMETICS.filter((x) => x.cost && x.kind !== 'room').sort((a, b) => a.cost - b.cost);
const EPIC = COSMETICS.filter((x) => x.cost && x.kind === 'room').sort((a, b) => a.cost - b.cost);
const firstFree = (d, list) => { shopEnsure(d); return list.find((x) => !owns(d, x.id)) || null; };
export const nextLook = (d) => firstFree(d, RARE); // the cheapest outfit / carrier skin not owned yet (or null)

// what a queued chest holds -> { t, tier, coins, items: { hint, undo, scoop }, cos: cosmetic id | null }
export function lootOf(d, e) {
  if (e.t === 'wood') {
    const k = Math.floor(e.n / WOOD.step);
    return { t: 'wood', tier: 'common', coins: Math.min(WOOD.cap, WOOD.coins + 5 * Math.floor(e.n / 50)), items: { [WOOD.boosters[k % WOOD.boosters.length]]: 1 }, cos: null };
  }
  if (e.t === 'streak') {
    const k = int(e.i, 1);
    return { t: 'streak', tier: 'common', coins: STREAK.coins, items: k % STREAK.hintEvery === 0 ? { hint: 1 } : {}, cos: null };
  }
  const i = int(e.i);
  const tier = tierOf(i);
  const L = { t: 'boss', tier, coins: Math.min(BOSS_CHEST.cap, BOSS_CHEST.coins + BOSS_CHEST.step * i), items: { hint: 1, undo: 1 }, cos: null };
  if (i % 2) L.items.scoop = 1;
  if (tier === 'epic') {
    const it = firstFree(d, EPIC) || firstFree(d, RARE);
    if (it) L.cos = it.id; else L.coins += BOSS_CHEST.epicCoins;
    L.items.scoop = (L.items.scoop || 0) + 1;
  } else if (tier === 'rare') {
    const it = firstFree(d, RARE);
    if (it) L.cos = it.id; else L.coins += BOSS_CHEST.rareCoins;
  }
  return L;
}

// ---- earning ----
// a campaign level was lost (main.js onFail): the flame goes out only if this attempt is given up (startAttempt);
// a continue that wins the level keeps it
export function markFail(d, n) { state(d).fl.fail = Math.max(1, n | 0); }
// a new attempt starts (main.js startLevel): a loss that was never turned into a win puts the flame out
export function startAttempt(d) {
  const b = state(d);
  if (!b.fl.fail) return false;
  b.fl.fail = 0;
  const had = b.fl.n > 0;
  b.fl.n = 0;
  return had;
}
// a first clear of campaign level n -> the chests it queued ([{ t, n, i }]); replays and daily boards never reach here
export function onClear(d, n) {
  const b = state(d);
  if (n <= b.last) return [];
  b.last = n;
  b.fl.fail = 0; // won: a lost bench on the way was continued
  const got = [];
  if (isBossLevel(n)) {
    got.push({ t: 'boss', n, i: bossIndex(n) });
    b.beat = Math.max(b.beat, bossIndex(n) + 1);
  } else if (n % WOOD.step === 0) got.push({ t: 'wood', n });
  b.fl.n++;
  if (b.fl.n >= STREAK_LEN) {
    b.fl.n = 0;
    b.fl.k++;
    got.push({ t: 'streak', n, i: b.fl.k });
  }
  b.q.push(...got);
  while (b.q.length > QMAX) openNext(d);
  return got;
}
// the flame meter: 0..STREAK_LEN-1 lit pips (a chest just paid resets it to 0)
export const flame = (d) => state(d).fl.n;
export const pending = (d) => state(d).q.length;
// the next chest on the road from level `cur` (the level about to be played): { n, t: 'wood' | 'boss', left }
export function nextChest(cur) {
  const n = Math.ceil(Math.max(1, cur) / WOOD.step) * WOOD.step;
  return { n, t: isBossLevel(n) ? 'boss' : 'wood', left: n - cur + 1 };
}

// open the oldest queued chest: pays it into the save -> { e, loot } or null
export function openNext(d) {
  const b = state(d);
  const e = b.q.shift();
  if (!e) return null;
  const loot = pay(d, lootOf(d, e));
  b.open++;
  return { e, loot };
}
// pay a loot ({ coins, items, cos }) into the save; the timed baskets (src/game/basket.js) pay through here too
export function pay(d, loot) {
  d.coins += loot.coins;
  for (const [k, v] of Object.entries(loot.items)) if (k in d.boosters) d.boosters[k] += v;
  if (loot.cos) { shopEnsure(d); d.shop.own[loot.cos] = 1; }
  return loot;
}
