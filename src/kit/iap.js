// IAP stub. Test mode: purchase() resolves after a short fake sheet. Real store plugin plugs in behind the same interface (setBackend).
import { save } from './save.js';
import { grant } from '../game/econ.js';
import { wakeAll } from '../game/basket.js';
import { ensure, equip } from '../game/shop.js';

export const PRODUCTS = {
  starter: { price: '$4.99', coins: 1200, scoop: 3, noAds: true, once: true },
  noads: { price: '$2.99', noAds: true, once: true },
  coins500: { price: '$0.99', coins: 500 },
  coins1500: { price: '$2.99', coins: 1500 },
  coins4000: { price: '$6.99', coins: 4000 },
  scoop3: { price: '$1.99', scoop: 3 },
  scoop10: { price: '$4.99', scoop: 10 },
  fastpaws: { price: '$0.99', wake: true }, // R13: every sleeping basket on the map wakes now (src/game/basket.js)
  look_galaxy: { price: '$1.99', cos: 'room_galaxy', once: true },
  look_candy: { price: '$1.99', cos: 'room_candy', once: true },
  skin_golden: { price: '$2.99', cos: 'skin_golden', once: true },
};
// Dev/test builds only: a production build with no real store backend registered buys nothing (fail closed).
export const TEST_MODE = !!(import.meta.env && import.meta.env.DEV);

// Pure: apply a finished purchase to the save data. Returns false for an unknown product, an owned one-time product,
// or a transaction id that was already applied (a replayed receipt never pays twice).
export function applyPurchase(d, id, tx) {
  const p = PRODUCTS[id];
  if (!p || (p.once && d.iap.owned[id])) return false;
  if (tx) {
    if (d.iap.tx.includes(tx)) return false;
    d.iap.tx.push(tx);
    if (d.iap.tx.length > 30) d.iap.tx.shift();
  }
  grant(d, p);
  if (p.wake) wakeAll(d);
  if (p.once) d.iap.owned[id] = 1;
  if (p.noAds) d.ads.removeAds = true;
  if (p.cos) { ensure(d).own[p.cos] = 1; equip(d, p.cos); }
  return true;
}

const testBackend = {
  buy: (id) => new Promise((res) => setTimeout(() => res({ ok: true, tx: `test-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }), 700)),
  restore: () => Promise.resolve(Object.keys(save.data.iap.owned)),
};
let backend = TEST_MODE ? testBackend : null;
const offBackend = { buy: () => Promise.resolve({ ok: false }), restore: () => Promise.resolve([]) };
export const setBackend = (b) => { backend = b; };
// false when nothing can be bought (production build without a store backend): hide prices and offers
export const available = () => !!backend;

export const owned = (id) => !!save.data.iap.owned[id];
export const noAds = () => !!save.data.ads.removeAds;

// -> Promise<{ ok, id }>
export async function purchase(id) {
  if (!PRODUCTS[id] || (PRODUCTS[id].once && owned(id))) return { ok: false, id }; // never charge for a one-time product that is already owned
  const r = await (backend || offBackend).buy(id);
  if (!r || !r.ok) return { ok: false, id };
  const ok = applyPurchase(save.data, id, r.tx);
  save.commit();
  return { ok, id };
}

// -> Promise<string[]> ids of the one-time products restored (No Ads flag is re-derived from them)
export async function restore() {
  const ids = (await (backend || offBackend).restore()).filter((id) => PRODUCTS[id] && PRODUCTS[id].once);
  const d = save.data;
  for (const id of ids) {
    const p = PRODUCTS[id];
    d.iap.owned[id] = 1;
    if (p.noAds) d.ads.removeAds = true;
    if (p.cos) ensure(d).own[p.cos] = 1;
  }
  save.commit();
  return ids;
}
