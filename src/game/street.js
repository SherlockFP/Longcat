// Cat Street + renovation: the meta past the cat house rooftop (data/street.js). Pure functions over the save data
// `d` so node can test them (scripts/check-econ.mjs). d.cafe.street = street tasks built so far (all houses in a row);
// d.cafe.reno[areaId] = bitmask of owned theme sets, d.cafe.style[areaId] = the set shown ('' = none).
import { grant } from './econ.js';
import { SHOPS, COMMON, HOUSE_TASKS, taskCost, HOUSE_REWARD, RENO } from '../../data/street.js';

export { SHOPS, HOUSE_TASKS, HOUSE_REWARD, RENO };

// house k of the street (endless: laps over SHOPS) -> { k, lap, id, name: {en,tr}, keeper, apprentice, tasks: [{ name, cost }] }
// apprentice: on the first repeat lap (lap 1) each shop's keeper takes on a kitten apprentice who moves in with the house
export function house(k) {
  const s = SHOPS[k % SHOPS.length];
  const lap = Math.floor(k / SHOPS.length);
  const name = lap ? { en: `${s.name.en} ${lap + 1}`, tr: `${s.name.tr} ${lap + 1}` } : s.name;
  const tasks = COMMON.map((c, i) => ({ i, name: c || s.own[i - 4], cost: taskCost(k, i) }));
  return { k, lap, id: s.id, name, keeper: s.keeper, apprentice: lap === 1 ? s.apprentice : null, tasks };
}
export const built = (d) => d.cafe.street || 0;
export const housesDone = (d) => Math.floor(built(d) / HOUSE_TASKS);
export const curHouse = (d) => house(housesDone(d));
export const nextTask = (d) => { const h = curHouse(d); return { house: h, ...h.tasks[built(d) % HOUSE_TASKS] }; };
export const houseLeft = (d) => { const h = curHouse(d); return h.tasks.slice(built(d) % HOUSE_TASKS).reduce((a, x) => a + x.cost, 0); };
// shopkeepers living on the street (one per shop kind, laps add no new keeper)
export const keepers = (d) => SHOPS.slice(0, Math.min(SHOPS.length, housesDone(d))).map((s) => s.id);
// kitten apprentices on the street (one per shop, from the first repeat lap)
export const apprentices = (d) => SHOPS.slice(0, Math.max(0, Math.min(SHOPS.length, housesDone(d) - SHOPS.length))).map((s) => s.id);

// builds the next street piece -> { name, cost, houseDone, reward } or null (not enough stars)
export function streetBuild(d) {
  const t = nextTask(d);
  if (d.cafe.stars < t.cost) return null;
  d.cafe.stars -= t.cost;
  d.cafe.street = built(d) + 1;
  const houseDone = d.cafe.street % HOUSE_TASKS === 0;
  if (houseDone) grant(d, HOUSE_REWARD);
  return { ...t, houseDone, reward: houseDone ? HOUSE_REWARD : null };
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
