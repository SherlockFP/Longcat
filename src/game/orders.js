// Adoption orders: pure functions over the save data `d` (node tests them in scripts/check-econ.mjs). Every level is an
// order from a Cat Street shopkeeper (data/orders.js); its first clear delivers the board's cats to that shop and adopts
// one named cat into the shop's album set. State lives in d.orders, created lazily here:
//   d.orders = { last: highest level adopted, shops: { [shop]: { cats, named, sets, cur: [[n, nameIdx, color]], done: [...] } } }
import { grant } from './econ.js';
import { levelKind } from '../core/generate.js';
import { SHOPS, SHOPS_NEW } from '../../data/street.js';
import { CHAPTER, SHOP_ORDER, SET_SIZE, SET_REWARDS, BONUS, CUSTOMERS, CAT_NAMES } from '../../data/orders.js';

export { CHAPTER, SHOP_ORDER, SET_SIZE, SET_REWARDS, BONUS, CUSTOMERS, CAT_NAMES };

const KEEPERS = Object.fromEntries([...SHOPS, ...SHOPS_NEW].map((s) => [s.id, s.keeper.name]));
const SHOP_NAMES = Object.fromEntries([...SHOPS, ...SHOPS_NEW].map((s) => [s.id, s.name]));
export const shopName = (id) => SHOP_NAMES[id];
export const keeperOf = (id) => KEEPERS[id];

// a small integer hash (same result in node and every browser)
export function hash(n, salt = 0) {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

export const chapterOf = (n) => Math.floor((Math.max(1, n) - 1) / CHAPTER);
export const shopOf = (n) => SHOP_ORDER[chapterOf(n) % SHOP_ORDER.length];
const KIND = { normal: 'normal', hard: 'urgent', boss: 'vip' }; // a boss level (every 20th) is the VIP order

// level n -> its order. kind: the level's difficulty (levelKind), passed in when the caller already has the board
export function orderOf(n, kind = levelKind(n)) {
  const shop = shopOf(n);
  const c = CUSTOMERS[shop];
  return {
    n, shop, keeper: KEEPERS[shop], kind: KIND[kind] || 'normal',
    why: hash(n, 1) % c.why.length,
    name: hash(n, 2) % CAT_NAMES.length,
    bonus: BONUS[kind] || 0,
  };
}

export function state(d) {
  const o = d.orders && typeof d.orders === 'object' ? d.orders : (d.orders = {});
  if (!Number.isInteger(o.last) || o.last < 0) o.last = 0;
  if (!o.shops || typeof o.shops !== 'object') o.shops = {};
  return o;
}
export function shopRec(d, shop) {
  const S = state(d).shops;
  const r = S[shop] && typeof S[shop] === 'object' ? S[shop] : (S[shop] = {});
  for (const k of ['cats', 'named', 'sets']) if (!Number.isInteger(r[k]) || r[k] < 0) r[k] = 0;
  for (const k of ['cur', 'done']) if (!Array.isArray(r[k])) r[k] = [];
  return r;
}

// the first clear of level n delivers `cats` cats; the named cat wears `color` (the board's last carrier colour).
// -> { shop, cat: [n, nameIdx, color], set: { k, have, size }, reward: {coins,scoop?} | null, lively } or null (already
// adopted: levels are adopted once, in order)
export function adopt(d, n, cats, color, kind) {
  const st = state(d);
  if (n <= st.last) return null;
  const o = orderOf(n, kind);
  const r = shopRec(d, o.shop);
  st.last = n;
  r.cats += Math.max(0, cats | 0);
  r.named++;
  const cat = [n, o.name, color | 0];
  r.cur.push(cat);
  let reward = null;
  const k = r.sets + 1; // the set this cat went into
  if (r.cur.length >= SET_SIZE) {
    reward = SET_REWARDS[r.sets % SET_REWARDS.length];
    grant(d, reward);
    r.sets++;
    r.done = r.cur;
    r.cur = [];
  }
  return { shop: o.shop, cat, set: { k, have: reward ? SET_SIZE : r.cur.length, size: SET_SIZE }, reward, lively: lively(d, o.shop) };
}

export const bonusOf = (n, kind) => orderOf(n, kind).bonus;
// the win card's pay lines for a first clear (main.js onWin): Urgent / VIP bonus
export function payParts(n, kind) {
  const o = orderOf(n, kind);
  return o.bonus ? [{ k: o.kind === 'vip' ? 'payVip' : 'payUrgent', n: o.bonus }] : [];
}
// how busy a shop looks on the street (0-3 doorstep cats) by the cats delivered there
export function lively(d, shop) {
  const c = d.orders && d.orders.shops && d.orders.shops[shop] ? d.orders.shops[shop].cats || 0 : 0;
  return c >= 150 ? 3 : c >= 50 ? 2 : c > 0 ? 1 : 0; // a chapter delivers ~100-250 cats: the shop fills up over it
}
// album pages: the shops already served, in street order, plus the shop of the current chapter
export function albumShops(d, level) {
  const S = state(d).shops;
  const cur = shopOf(level);
  return SHOP_ORDER.filter((s) => (S[s] && S[s].named > 0) || s === cur);
}
export const totalAdopted = (d) => Object.values(state(d).shops).reduce((t, r) => t + (r.named || 0), 0);
