// R10 retention: what keeps paying after the cat house is done. Pure functions over the save data `d` (node tests them
// in scripts/check-econ.mjs); callers pass the day/week numbers and the medals of the week's Cat Show boards.
//  - pop-up week: one named event a week on the Cat Show's two boards + the week's first Daily clear (3 stamps)
//  - album: the pop-up's postcard per week (24 over 6 pages), a full page unlocks a framed print to hang in a room
//  - Daily record: total Daily clears, each date once, milestones at 7/14/30/60/90
//  - resident jobs: 2 a day from a 14-day rotation, the first one finished pays
//  - friend results: replies to the player's dares, latest 12, one per result id
import { grant } from './econ.js';
import { PAGES, CARDS_PER_PAGE, WEEKS, POP_STAMPS, POP_COINS, DREC, JOB_ROT, JOB_REWARD, FRIENDS_MAX, SENT_MAX } from '../../data/r10.js';

export { PAGES, WEEKS, DREC, POP_STAMPS, POP_COINS, JOB_REWARD, CARDS_PER_PAGE };

// ---- pop-up week ----
export const popIndex = (w) => ((w % WEEKS.length) + WEEKS.length) % WEEKS.length;
export const popOf = (w) => ({ i: popIndex(w), ...WEEKS[popIndex(w)] });
// medals: { a: bool, b: bool } = the week's Cat Show boards cleared (any medal)
export function popStamps(d, w, medals) {
  return { a: !!medals.a, b: !!medals.b, daily: !!d.pop.daily[w], n: (medals.a ? 1 : 0) + (medals.b ? 1 : 0) + (d.pop.daily[w] ? 1 : 0) };
}
// the first Daily clear of a week stamps that week's card -> true when this clear stamped it
export function popDaily(d, w) {
  if (d.pop.daily[w]) return false;
  d.pop.daily[w] = 1;
  const keys = Object.keys(d.pop.daily).map(Number).sort((x, y) => y - x);
  for (const k of keys.slice(8)) delete d.pop.daily[k]; // recent weeks only
  return true;
}
export const hasCard = (d, i) => !!d.album.cards[i];
// claims this week's postcard + coins (3 stamps, once) -> { card, coins, page } or null
export function popClaim(d, w, medals) {
  const s = popStamps(d, w, medals);
  if (s.n < POP_STAMPS || d.pop.paid[w]) return null;
  d.pop.paid[w] = 1;
  const i = popIndex(w);
  d.coins += POP_COINS;
  const fresh = !hasCard(d, i);
  d.album.cards[i] = 1;
  return { card: i, coins: POP_COINS, fresh, page: pageDone(d, pageOf(i)) ? pageOf(i) : -1 };
}
export const popReady = (d, w, medals) => popStamps(d, w, medals).n >= POP_STAMPS && !d.pop.paid[w];
// catch-up: an archived week's postcard, once both of its boards are cleared; one catch-up per current week
export const catchOpen = (d, week) => d.pop.cu !== week;
export function catchUp(d, week, pastW, medals) { // -> { card, page } or null
  const i = popIndex(pastW);
  if (pastW >= week || !catchOpen(d, week) || hasCard(d, i) || !(medals.a && medals.b)) return null;
  d.pop.cu = week;
  d.album.cards[i] = 1;
  return { card: i, page: pageDone(d, pageOf(i)) ? pageOf(i) : -1 };
}
// R11: the weeks whose postcard the weekly catch-up can claim, in the order the archive lists them: first the latest
// release of every card still missing on a page the player has started (or this week's page), the fullest page
// first, then the player's own archive. With this week's card and one catch-up a week, the first framed print is
// done within four event weeks even when the player starts on a page's last week.
export function catchWeeks(d, week, archive = []) {
  const cur = popIndex(week);
  const pages = PAGES.map((_, p) => p).filter((p) => p === pageOf(cur) || pageHave(d, p) > 0).sort((a, b) => pageHave(d, b) - pageHave(d, a));
  const first = [];
  for (const p of pages) {
    for (const i of pageCards(p)) {
      if (hasCard(d, i) || i === cur) continue;
      const back = (((cur - i) % WEEKS.length) + WEEKS.length) % WEEKS.length || WEEKS.length;
      if (!first.includes(week - back)) first.push(week - back);
    }
  }
  return [...first, ...archive.filter((w) => !first.includes(w))];
}

// ---- album ----
export const pageOf = (i) => Math.floor(i / CARDS_PER_PAGE);
export const pageCards = (p) => Array.from({ length: CARDS_PER_PAGE }, (_, j) => p * CARDS_PER_PAGE + j);
export const pageHave = (d, p) => pageCards(p).filter((i) => hasCard(d, i)).length;
export const pageDone = (d, p) => pageHave(d, p) === CARDS_PER_PAGE;
export const cardsOwned = (d) => WEEKS.filter((_, i) => hasCard(d, i)).length;
// a full page's print: hung in room `area` (index) -> true
export function hangPrint(d, p, area) {
  if (!pageDone(d, p)) return false;
  for (const k of Object.keys(d.album.hung)) if (d.album.hung[k] === p) delete d.album.hung[k]; // one place per print
  d.album.hung[area] = p;
  return true;
}
export const printsHung = (d) => Object.keys(d.album.hung).length;
// the next week (from `week` on) whose postcard is still missing -> weeks away (0 = this week) or -1
export function nextCardWeek(d, week, i) {
  for (let k = 0; k < WEEKS.length; k++) if (popIndex(week + k) === i) return k;
  return -1;
}

// ---- Daily record ----
// a Daily clear on `day`: counted once per date -> the milestones newly reached ([] if none)
export function drecClear(d, day) {
  if (d.drec.last === day) return [];
  d.drec.last = day;
  d.drec.n++;
  const out = [];
  DREC.forEach((m, i) => {
    if (d.drec.n >= m.at && !(d.drec.got & (1 << i))) {
      d.drec.got |= 1 << i;
      if (m.reward) grant(d, m.reward);
      out.push({ ...m, i });
    }
  });
  return out;
}
export const drecNext = (d) => DREC.find((m, i) => !(d.drec.got & (1 << i))) || null;
export const drecHas = (d, item) => DREC.some((m, i) => m.item === item && d.drec.got & (1 << i));

// ---- resident jobs ----
// today's two jobs: kinds from the 14-day rotation, the cats rotate over the residents who live in the café
export function jobsToday(d, day, res) {
  const J = d.jobs;
  if (J.day !== day) { J.day = day; J.p = [0, 0]; J.paid = 0; }
  if (!res.length) return [];
  const rot = JOB_ROT[((day % JOB_ROT.length) + JOB_ROT.length) % JOB_ROT.length];
  return rot.map((j, s) => ({ s, k: j.k, need: j.need, who: res[(day * 2 + s) % res.length], p: Math.min(j.need, J.p[s] || 0), done: (J.p[s] || 0) >= j.need }));
}
export function jobsEvent(d, day, res, ev, n = 1) { // -> true when a job moved
  const list = jobsToday(d, day, res);
  if (d.jobs.paid) return false;
  let hit = false;
  for (const j of list) if (j.k === ev && !j.done) { d.jobs.p[j.s] = Math.min(j.need, (d.jobs.p[j.s] || 0) + n); hit = true; }
  return hit;
}
export function jobsClaim(d, day, res, s) { // -> { who, coins, hearts } or null
  const j = jobsToday(d, day, res)[s];
  if (!j || !j.done || d.jobs.paid) return null;
  d.jobs.paid = s + 1;
  d.coins += JOB_REWARD.coins;
  d.cafe.hearts[j.who] = (d.cafe.hearts[j.who] || 0) + JOB_REWARD.hearts;
  return { who: j.who, coins: JOB_REWARD.coins, hearts: JOB_REWARD.hearts };
}
// tomorrow's first cat (shown in the slot after the claim)
export const jobsTomorrow = (day, res) => (res.length ? res[((day + 1) * 2) % res.length] : '');

// ---- friend results ----
export function noteSent(d, id) {
  if (!id) return;
  d.fr.sent = [...d.fr.sent.filter((x) => x !== id), id].slice(-SENT_MAX);
}
// a reply link opened on this browser -> the stored entry (dedup by its result id), or null for a bad one
export function frImport(d, r, t) {
  if (!r || !r.i) return null;
  const e = { id: r.i, nm: r.nm || '', n: r.n, b: r.b, k: r.k, m: r.m, g: r.g, pg: r.pg ?? null, mine: d.fr.sent.includes(r.r), t };
  const old = d.fr.list.findIndex((x) => x.id === e.id);
  if (old >= 0) d.fr.list.splice(old, 1);
  d.fr.list.unshift(e);
  d.fr.list = d.fr.list.slice(0, FRIENDS_MAX);
  return e;
}
