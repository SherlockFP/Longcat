// Boss lane rules: pure functions over the save data `d` (node tests them in scripts/check-econ.mjs / check-core.mjs).
//  - every 20th level is a boss (src/core/generate.js isBossLevel): a named Big Boss Cat (data/boss.js) whose HP is the
//    cats the board delivers;
//  - chests: a wooden milestone chest on every 5th first clear (not a boss level), a gold boss chest on a boss's first
//    clear (tier fixed per boss index: the first boss is always rare);
//  - chests wait in a queue (d.boss.q) and pay when they are opened (src/ui/boss.js), so a reload never loses one.
// State, created lazily here: d.boss = { last, q: [{ t: 'wood'|'boss', n, i }], beat, open } (an old save's flame streak
// `fl` and its queued 'streak' chests are dropped)
import { isBossLevel, BOSS_EVERY } from '../core/generate.js';
import { COSMETICS } from '../../data/shop.js';
import { owns, ensure as shopEnsure } from './shop.js';
import { BOSSES, TAUNTS, HURT, DEFEAT, CH_ADJ, CH_PLACE, WOOD, BOSS_CHEST, MINI_BOSS } from '../../data/boss.js';

export { BOSSES, TAUNTS, HURT, DEFEAT, isBossLevel, BOSS_EVERY };

const int = (v, lo = 0) => (Number.isInteger(v) && v >= lo ? v : lo);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const TYPES = ['wood', 'boss'];
const QMAX = 30; // unopened chests kept; past it the oldest pays out unseen (never lost)

export function state(d) {
  const b = isObj(d.boss) ? d.boss : (d.boss = {});
  b.last = int(b.last);
  b.beat = int(b.beat);
  b.open = int(b.open); // chests opened in total (the skip-on-tap rule: from the 2nd opening on)
  delete b.fl;
  b.q = Array.isArray(b.q) ? b.q.filter((e) => isObj(e) && TYPES.includes(e.t) && Number.isInteger(e.n) && e.n >= 0).slice(0, QMAX * 2) : [];
  return b;
}

// ---- who the boss is ----
export const bossIndex = (n) => (isBossLevel(n) ? n / BOSS_EVERY - 1 : -1);
// R13: L10 is a mini boss (its rev-7 board is kind 'boss', core/curated.js): the boss card, HP bar and defeat, a gold chest
// that is always rare (chest index 0, like the first big boss); it never counts as a beaten boss
export const MINI = 10;
export const isBoss = (n) => n === MINI || isBossLevel(n);
export function bossOf(n) {
  if (n === MINI) return { ...MINI_BOSS, i: 0, n, lap: 0, mini: true };
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
// a first clear of campaign level n -> the chests it queued ([{ t, n, i }]); replays and daily boards never reach here
export function onClear(d, n) {
  const b = state(d);
  if (n <= b.last) return [];
  b.last = n;
  const got = [];
  if (n === MINI) got.push({ t: 'boss', n, i: 0 });
  else if (isBossLevel(n)) {
    got.push({ t: 'boss', n, i: bossIndex(n) });
    b.beat = Math.max(b.beat, bossIndex(n) + 1);
  } else if (n % WOOD.step === 0) got.push({ t: 'wood', n });
  b.q.push(...got);
  while (b.q.length > QMAX) openNext(d);
  return got;
}
export const pending = (d) => state(d).q.length;
// the next chest on the road from level `cur` (the level about to be played): { n, t: 'wood' | 'boss', left }
export function nextChest(cur) {
  const n = Math.ceil(Math.max(1, cur) / WOOD.step) * WOOD.step;
  return { n, t: isBoss(n) ? 'boss' : 'wood', left: n - cur + 1 };
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
