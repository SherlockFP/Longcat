// R11 retention lane (sol-r11-3 fix 5): the album as a plan, not a list. Pure functions over the save data `d` (node
// tests them in scripts/check-econ.mjs); callers pass the day / week numbers.
//  - albumNext: the nearest album reward (one postcard) and the exact step left: a stamp or board to clear, a claim,
//    or a finished page's print to hang
//  - dayGoal: the concrete thing to do today (the album step, else the Daily, a resident job, a request)
//  - tomorrow: what opens tomorrow (the Daily chest, a new postcard week, the next resident's jobs, a request)
//  - winDay: wins counted per day (the win card names tomorrow from the 3rd one on)
// State lives in d.ret, created lazily: { wd: day of the win count, wn: wins that day, hang: page waiting to be hung }.
import * as r10 from './r10.js';
import { archiveWeeks, medalOf, eventsOpen, streakChest, REQ_MAX } from './live.js';
import { weekOf } from './econ.js';

export function state(d) {
  if (!d.ret || typeof d.ret !== 'object') d.ret = {};
  const R = d.ret;
  if (!Number.isInteger(R.wd)) R.wd = -1;
  if (!(Number.isInteger(R.wn) && R.wn >= 0)) R.wn = 0;
  if (!(Number.isInteger(R.hang) && R.hang >= -1 && R.hang < r10.PAGES.length)) R.hang = -1;
  return R;
}

const medals = (d, w) => ({ a: !!medalOf(d, w, 'a'), b: !!medalOf(d, w, 'b') });
const isHung = (d, p) => Object.values(d.album.hung).includes(p);

// a page just completed: its print waits to be hung (the room view pre-selects "Hang the print")
export function setHang(d, p) { state(d).hang = p; }
export function clearHang(d) { state(d).hang = -1; }
// the page whose print waits for a wall, or -1 (hung somewhere since, or never completed: nothing waits)
export function hangPending(d) {
  const p = state(d).hang;
  return p >= 0 && r10.pageDone(d, p) && !isHung(d, p) ? p : -1;
}

// The nearest album reward -> null or
//   { k: 'hang', page }
//   { k: 'claim' | 'catch' | 'board' | 'daily', card, w, b?, left, unit: 'stamp' | 'board', arch, page, pageLeft, today }
// left = stamps (this week's pop-up) or boards (an archived week's catch-up) still missing; pageLeft = postcards the page
// still needs after this one (0: this card completes the framed print); today = the step can be done right now.
// Nearest: fewest steps left (the week's Daily stamp counts half: the player clears the Daily anyway, and a catch-up
// counts half a step more: one a week, and this week's card expires), then the fuller page; on a tie this week first.
export function albumNext(d, week, dailyDone) {
  if (!eventsOpen(d)) return null;
  const hp = hangPending(d);
  if (hp >= 0) return { k: 'hang', page: hp, left: 0, today: true };
  const out = [];
  const ci = r10.popIndex(week);
  if (!r10.hasCard(d, ci) && !d.pop.paid[week]) {
    const s = r10.popStamps(d, week, medals(d, week));
    const left = Math.max(0, r10.POP_STAMPS - s.n);
    const step = left === 0 ? { k: 'claim' } : !s.a ? { k: 'board', b: 'a' } : !s.b ? { k: 'board', b: 'b' } : { k: 'daily' };
    out.push({ ...step, card: ci, w: week, left, cost: left - (s.daily ? 0 : 0.5), unit: 'stamp', arch: false, today: step.k !== 'daily' || !dailyDone });
  }
  if (r10.catchOpen(d, week)) {
    const seen = new Set([ci]);
    for (const w of r10.catchWeeks(d, week, archiveWeeks(d, week))) {
      const i = r10.popIndex(w);
      if (w >= week || seen.has(i) || r10.hasCard(d, i)) continue;
      seen.add(i);
      const m = medals(d, w);
      const left = (m.a ? 0 : 1) + (m.b ? 0 : 1);
      out.push({ k: left ? 'board' : 'catch', b: m.a ? 'b' : 'a', card: i, w, left, cost: left + 0.5, unit: 'board', arch: true, today: true });
    }
  }
  for (const g of out) {
    g.page = r10.pageOf(g.card);
    g.pageLeft = r10.CARDS_PER_PAGE - r10.pageHave(d, g.page) - 1;
  }
  const key = (g) => [g.today ? 0 : 1, g.cost, g.pageLeft];
  const cmp = (x, y) => { const a = key(x), b = key(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  return out.sort(cmp)[0] || null; // sort is stable: equal keys keep this week first, then the archive's order
}

// can the step be taken right now (the button it shows does something)?
export function stepOk(d, week, g, dailyDone) {
  if (!g) return false;
  if (g.k === 'hang') return r10.pageDone(d, g.page) && !isHung(d, g.page);
  if (g.k === 'claim') return r10.popReady(d, week, medals(d, week));
  if (g.k === 'catch') { const m = medals(d, g.w); return g.w < week && r10.catchOpen(d, week) && !r10.hasCard(d, g.card) && m.a && m.b; }
  if (g.k === 'board') return g.w <= week && !medalOf(d, g.w, g.b) && (!g.arch || r10.catchOpen(d, week));
  if (g.k === 'daily') return !dailyDone;
  return false;
}

// the one concrete goal for today -> { k: 'album', g } | { k: 'daily' } | { k: 'job' } | { k: 'req', i } | null
export function dayGoal(d, { week, day, dailyDone, res = [] }) {
  const g = albumNext(d, week, dailyDone);
  if (g && g.today && stepOk(d, week, g, dailyDone)) return { k: 'album', g };
  if (!dailyDone) return { k: 'daily' };
  if (res.length && !(d.jobs.day === day && d.jobs.paid)) return { k: 'job' };
  if (d.req.list.length) return { k: 'req', i: 0 }; // a request to work on or to claim
  return null;
}

// what opens tomorrow, most concrete first -> [{ k: 'chest', n, rw } | { k: 'daily' } | { k: 'week', card } | { k: 'job', who } | { k: 'req' }]
// streak: the Daily streak now (after today's clear when dailyDone)
export function tomorrow(d, { day, res = [], dailyDone, streak = 0 }) {
  const out = [];
  if (dailyDone) out.push({ k: 'chest', n: streak + 1, rw: streakChest(streak + 1) });
  else out.push({ k: 'daily' });
  const w = weekOf(day), w1 = weekOf(day + 1);
  if (eventsOpen(d) && w1 !== w) {
    const i = r10.popIndex(w1);
    out.splice(r10.hasCard(d, i) ? out.length : 0, 0, { k: 'week', card: i, fresh: !r10.hasCard(d, i) }); // a missing postcard leads
  }
  if (res.length) out.push({ k: 'job', who: r10.jobsTomorrow(day, res) });
  if (res.length && d.req.list.length < REQ_MAX) out.push({ k: 'req' });
  return out;
}

// a win on `day` -> the wins that day so far
export function winDay(d, day) {
  const R = state(d);
  if (R.wd !== day) { R.wd = day; R.wn = 0; }
  R.wn++;
  return R.wn;
}
