// R10 shop rules: coin-priced booster packs, the deal of the day, rewarded-ad gifts, the Extra Cushion booster and the
// cosmetics (owned / in use). Pure functions over the save data `d` and a day number, testable in node
// (scripts/check-econ.mjs). State lives in d.shop next to the older starterShown / offerDay keys, set up lazily here.
import { UNIT, BOOSTERS, PACKS, DEALS, AD_GIFTS, COSMETICS, KINDS } from '../../data/shop.js';

export { UNIT, BOOSTERS, PACKS, DEALS, AD_GIFTS, COSMETICS, KINDS };

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v, lo = 0) => (Number.isInteger(v) && v >= lo ? v : lo);
export const item = (id) => COSMETICS.find((x) => x.id === id) || null;
const firstOf = (kind) => COSMETICS.find((x) => x.kind === kind && !x.cost).id;

// d.shop.{ own: { cosmetic id: 1 }, eq: { hat, car, room }, deal: { day, got }, ad: { day, coins, hint }, cush, cushLv }
export function ensure(d) {
  const s = d.shop;
  if (!isObj(s.own)) s.own = {};
  for (const k of Object.keys(s.own)) if (!item(k)) delete s.own[k];
  if (!isObj(s.eq)) s.eq = {};
  for (const k of KINDS) {
    const it = item(s.eq[k]);
    if (!it || it.kind !== k || !owns(d, it.id)) s.eq[k] = firstOf(k);
  }
  if (!isObj(s.deal)) s.deal = { day: -1, got: 0 };
  s.deal.day = Number.isInteger(s.deal.day) ? s.deal.day : -1;
  s.deal.got = s.deal.got ? 1 : 0;
  if (!isObj(s.ad)) s.ad = { day: -1 };
  s.ad.day = Number.isInteger(s.ad.day) ? s.ad.day : -1;
  for (const g of AD_GIFTS) s.ad[g.id] = int(s.ad[g.id]);
  s.cush = int(s.cush);
  s.cushLv = int(s.cushLv);
  return s;
}

const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);
export const listPrice = (items) => Object.entries(items).reduce((t, [k, n]) => t + (UNIT[k] || 0) * n, 0);
export const packPrice = (k, p) => round5(UNIT[k] * p.n * (1 - p.off / 100));

// ---- boosters: d.boosters keeps hint / undo / scoop (save.js validates those three); the cushion lives in d.shop.cush ----
export const have = (d, k) => (k === 'cushion' ? ensure(d).cush : d.boosters[k] || 0);
export function give(d, items) {
  ensure(d);
  for (const [k, n] of Object.entries(items)) {
    if (k === 'coins') d.coins += n;
    else if (k === 'cushion') d.shop.cush += n;
    else if (k in d.boosters) d.boosters[k] += n;
  }
}
// -> coins paid, 0 when not affordable
export function buyPack(d, k, pi) {
  const p = PACKS[pi];
  if (!p || !BOOSTERS.includes(k)) return 0;
  const cost = packPrice(k, p);
  if (d.coins < cost) return 0;
  d.coins -= cost;
  give(d, { [k]: p.n });
  return cost;
}

// ---- deal of the day ----
// days run in blocks of DEALS.length: each block is a seeded shuffle of every deal (all of them within a week), and a
// block never opens with the bundle the previous one closed on
function blockOrder(b) {
  let s = (Math.imul(b + 7919, 2654435761) ^ 0x5bd1e995) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const p = DEALS.map((_, i) => i);
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}
export function dealIndex(day) {
  const n = DEALS.length;
  const b = Math.floor(day / n);
  const p = blockOrder(b);
  const prev = blockOrder(b - 1);
  if (p[0] === prev[n - 1]) [p[0], p[1]] = [p[1], p[0]];
  return p[day - b * n];
}
export function dealOf(day) {
  const x = DEALS[dealIndex(day)];
  const was = listPrice(x.items);
  return { ...x, was, price: round5(was * (1 - x.off / 100)) };
}
export const dealBought = (d, day) => { const s = ensure(d); return s.deal.day === day && !!s.deal.got; };
export function dealBuy(d, day) { // -> the deal, or null (bought today already / not enough coins)
  if (dealBought(d, day)) return null;
  const x = dealOf(day);
  if (d.coins < x.price) return null;
  d.coins -= x.price;
  give(d, x.items);
  d.shop.deal = { day, got: 1 };
  return x;
}

// ---- rewarded-ad gifts (the caller shows the ad first) ----
function adRoll(d, day) {
  const s = ensure(d);
  if (s.ad.day !== day) { s.ad = { day }; for (const g of AD_GIFTS) s.ad[g.id] = 0; }
  return s.ad;
}
export const adLeft = (d, id, day) => { const g = AD_GIFTS.find((x) => x.id === id); return g ? Math.max(0, g.per - adRoll(d, day)[id]) : 0; };
export function adClaim(d, id, day) { // -> the gift, or null when none left today
  const g = AD_GIFTS.find((x) => x.id === id);
  if (!g || adLeft(d, id, day) <= 0) return null;
  d.shop.ad[id]++;
  give(d, g.give);
  return g.give;
}

// ---- Extra Cushion: the next new level starts with +1 bench seat; the seat stays for every retry until it is cleared ----
export function cushionAt(d, n) {
  const s = ensure(d);
  if (n !== d.level) return false; // replays of old levels never take one
  if (s.cushLv === n) return true;
  if (s.cush <= 0) return false;
  s.cush--;
  s.cushLv = n;
  return true;
}

// ---- cosmetics ----
export const owns = (d, id) => { const it = item(id); return !!it && (!it.cost || !!d.shop.own?.[id]); };
export const equipped = (d, kind) => ensure(d).eq[kind];
export function cosBuy(d, id) { // -> coins paid, 0 when owned already / not enough coins; a bought item goes on at once
  const it = item(id);
  ensure(d);
  if (!it || owns(d, id) || d.coins < it.cost) return 0;
  d.coins -= it.cost;
  d.shop.own[id] = 1;
  d.shop.eq[it.kind] = id;
  return it.cost;
}
export function equip(d, id) {
  const it = item(id);
  ensure(d);
  if (!it || !owns(d, id)) return false;
  d.shop.eq[it.kind] = id;
  return true;
}
export const cosOwned = (d) => COSMETICS.filter((x) => x.cost && owns(d, x.id)).length;
export const cosTotal = () => COSMETICS.reduce((t, x) => t + x.cost, 0);
