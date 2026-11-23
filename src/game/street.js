// Cat Street + renovation: the meta past the cat house rooftop (data/street.js). Pure functions over the save data
// `d` so node can test them (scripts/check-econ.mjs). d.cafe.street = street tasks built so far (all houses in a row);
// d.cafe.reno[areaId] = bitmask of owned theme sets, d.cafe.style[areaId] = the set shown ('' = none).
import { grant } from './econ.js';
import { SHOPS, COMMON, HOUSE_TASKS, taskCost, HOUSE_REWARD, RENO, UP_SHARED, UP_SIGN, UP_SIGN_COST, UP_REWARD, SHOPS_NEW, NEW_REWARD, REMIX, REMIX_TASKS, REMIX_COST, REMIX_REWARD, REMIX_GUESTS } from '../../data/street.js';

export { SHOPS, HOUSE_TASKS, HOUSE_REWARD, RENO, SHOPS_NEW, REMIX };
export const ALL_SHOPS = [...SHOPS, ...SHOPS_NEW];

// The street is a list of units built one after another (k = unit index):
//   k 0-5   lap 1: the six shops are built (8 pieces each), each brings its keeper
//   k 6-11  lap 2: a second house per shop (8 pieces) with the keeper's kitten apprentice
//   k 12-17 lap 3: 3 visible upgrades on each original shop's façade (bunting 2, planter 2, signature piece 3 stars)
//   k 18-20 three new shop kinds (8 pieces) with new keepers
//   k 21+   remix laps over all nine shops (4 pieces at 3 stars): a colour variant, a festival decoration and a guest
const N_UP = SHOPS.length; // 6
const K_UP = 2 * SHOPS.length; // 12
const K_NEW = K_UP + N_UP; // 18
const K_MIX = K_NEW + SHOPS_NEW.length; // 21
const P_UP = K_UP * HOUSE_TASKS; // 96 pieces
const P_NEW = P_UP + N_UP * 3; // 114
const P_MIX = P_NEW + SHOPS_NEW.length * HOUSE_TASKS; // 138
const MIX_N = REMIX_TASKS.length;
export const unitStart = (k) => (k <= K_UP ? k * HOUSE_TASKS : k <= K_NEW ? P_UP + (k - K_UP) * 3 : k <= K_MIX ? P_NEW + (k - K_NEW) * HOUSE_TASKS : P_MIX + (k - K_MIX) * MIX_N);
export function unitOf(n) { // pieces built -> the unit under construction
  if (n < P_UP) return Math.floor(n / HOUSE_TASKS);
  if (n < P_NEW) return K_UP + Math.floor((n - P_UP) / 3);
  if (n < P_MIX) return K_NEW + Math.floor((n - P_NEW) / HOUSE_TASKS);
  return K_MIX + Math.floor((n - P_MIX) / MIX_N);
}
const remixOf = (k) => { const r = Math.floor((k - K_MIX) / ALL_SHOPS.length); return { r, theme: REMIX[r % REMIX.length], guest: REMIX_GUESTS[((k - K_MIX) + r * 5) % REMIX_GUESTS.length] }; };

// unit k of the street -> { k, lap, kind: 'build'|'up'|'mix', id, name: {en,tr}, keeper, apprentice, tasks: [{ i, name, cost, up? }],
// reward, theme?, guest? }. lap: 0, 1 (apprentices), 2 (upgrades), 3 (new shops), 4+ (remix laps)
export function house(k) {
  if (k < K_UP) {
    const s = SHOPS[k % SHOPS.length];
    const lap = Math.floor(k / SHOPS.length);
    const name = lap ? { en: `${s.name.en} ${lap + 1}`, tr: `${s.name.tr} ${lap + 1}` } : s.name;
    const tasks = COMMON.map((c, i) => ({ i, name: c || s.own[i - 4], cost: taskCost(k, i) }));
    return { k, lap, kind: 'build', id: s.id, name, keeper: s.keeper, apprentice: lap === 1 ? s.apprentice : null, tasks, reward: HOUSE_REWARD };
  }
  if (k < K_NEW) {
    const s = SHOPS[k - K_UP];
    const tasks = [...UP_SHARED.map((u, i) => ({ i, name: u.name, cost: u.cost, up: u.id })), { i: 2, name: UP_SIGN[s.id], cost: UP_SIGN_COST, up: s.id }];
    return { k, lap: 2, kind: 'up', id: s.id, name: s.name, keeper: s.keeper, apprentice: null, tasks, reward: UP_REWARD };
  }
  if (k < K_MIX) {
    const s = SHOPS_NEW[k - K_NEW];
    const tasks = COMMON.map((c, i) => ({ i, name: c || s.own[i - 4], cost: taskCost(k, i) }));
    return { k, lap: 3, kind: 'build', id: s.id, name: s.name, keeper: s.keeper, apprentice: null, tasks, reward: NEW_REWARD };
  }
  const s = ALL_SHOPS[(k - K_MIX) % ALL_SHOPS.length];
  const { r, theme, guest } = remixOf(k);
  const tasks = REMIX_TASKS.map((x, i) => ({ i, name: i === 0 ? { en: `${theme.name.en}: ${x.en}`, tr: `${theme.name.tr}: ${x.tr}` } : x, cost: REMIX_COST }));
  return { k, lap: 4 + r, kind: 'mix', id: s.id, name: s.name, keeper: s.keeper, apprentice: null, tasks, reward: REMIX_REWARD, theme, guest };
}
export const built = (d) => d.cafe.street || 0;
export const housesDone = (d) => unitOf(built(d));
export const curHouse = (d) => house(housesDone(d));
export const atPiece = (d) => built(d) - unitStart(housesDone(d)); // pieces of the current unit already built
export const nextTask = (d) => { const h = curHouse(d); return { house: h, ...h.tasks[atPiece(d)] }; };
export const houseLeft = (d) => { const h = curHouse(d); return h.tasks.slice(atPiece(d)).reduce((a, x) => a + x.cost, 0); };
// shopkeepers living on the street (one per shop kind, laps add no new keeper)
export const keepers = (d) => ALL_SHOPS.filter((s, i) => (i < SHOPS.length ? housesDone(d) > i : housesDone(d) > K_NEW + i - SHOPS.length)).map((s) => s.id);
// kitten apprentices on the street (one per shop, from the first repeat lap)
export const apprentices = (d) => SHOPS.slice(0, Math.max(0, Math.min(SHOPS.length, housesDone(d) - SHOPS.length))).map((s) => s.id);
// how a shop façade looks now: the upgrades it has (lap 3) and its latest remix (colour, decoration, guest)
export function shopLook(d, id) {
  const n = built(d);
  const i = SHOPS.findIndex((s) => s.id === id);
  const ups = [];
  if (i >= 0) { const k = K_UP + i; const have = Math.max(0, Math.min(3, n - unitStart(k))); for (let j = 0; j < have; j++) ups.push(j < 2 ? UP_SHARED[j].id : 'sign'); }
  let mix = null;
  const j = ALL_SHOPS.findIndex((s) => s.id === id);
  for (let k = unitOf(n) - 1; k >= K_MIX && !mix; k--) if ((k - K_MIX) % ALL_SHOPS.length === j) mix = remixOf(k);
  return { ups, theme: mix ? mix.theme : null, guest: mix ? mix.guest : null };
}
// every distinct thing the street shows (houses, keepers, apprentices, upgrades, remixes): the collection count
export const streetSights = (d) => housesDone(d) + keepers(d).length + apprentices(d).length;

// builds the next street piece -> { name, cost, houseDone, reward } or null (not enough stars)
export function streetBuild(d) {
  const t = nextTask(d);
  if (d.cafe.stars < t.cost) return null;
  d.cafe.stars -= t.cost;
  d.cafe.street = built(d) + 1;
  const houseDone = unitOf(d.cafe.street) !== t.house.k;
  if (houseDone) grant(d, t.house.reward);
  return { ...t, houseDone, reward: houseDone ? t.house.reward : null };
}

// ---- renovation ----
export const renoOwned = (d, areaId, ti) => !!((d.cafe.reno[areaId] || 0) & (1 << ti));
export const renoCount = (d) => Object.values(d.cafe.reno).reduce((n, b) => n + ((b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1)), 0);
// the set to offer next in a room: the featured one (current season) first, then the list order; -1 = all owned
export function renoNext(d, areaId, featured = '') {
  const order = RENO.map((_, i) => i).sort((a, b) => (RENO[b].id === featured) - (RENO[a].id === featured));
  const i = order.find((k) => !renoOwned(d, areaId, k));
  return i == null ? -1 : i;
}
export function renoBuy(d, areaId, ti) { // -> true when bought (and applied)
  const r = RENO[ti];
  if (!r || renoOwned(d, areaId, ti) || d.cafe.stars < r.cost) return false;
  d.cafe.stars -= r.cost;
  d.cafe.reno[areaId] = (d.cafe.reno[areaId] || 0) | (1 << ti);
  d.cafe.style[areaId] = r.id;
  return true;
}
// cycles the owned sets of a room (and "none") -> the new style id
export function renoCycle(d, areaId) {
  const own = RENO.filter((_, i) => renoOwned(d, areaId, i)).map((r) => r.id);
  if (!own.length) return '';
  const list = ['', ...own];
  const next = list[(list.indexOf(d.cafe.style[areaId] || '') + 1) % list.length];
  if (next) d.cafe.style[areaId] = next; else delete d.cafe.style[areaId];
  return next;
}
