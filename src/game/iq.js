// R10 "iq" lane: level clocks and records. Pure functions over the save data `d` (no DOM), so node can test them.
//  - per-level best time + a time medal (gold / silver / bronze) from the board's par (the solver's winning line length)
//  - Record Run: 5 boards of cleared difficulty back to back against one clock, personal best kept
//  - statistics + the playful "Cat IQ" (80-160, deterministic from the stats)
//  - the rank list: the player, friends whose dare replies landed here, and BOT rivals around the player's level
// Time medals are an extra layer: they never pay coins or café stars, so the star economy is untouched.
// State lives under d.iq, created lazily here (no save.js defaults).

export const RUN_BOARDS = 5;
export const RUN_FROM = 9; // Record Run opens once levels 4-8 are cleared (5 real boards to draw from)
const RUN_SPAN = 40; // the boards come from the last 40 cleared levels (the player's current difficulty)

export function ensure(d) {
  const z = d.iq && typeof d.iq === 'object' ? d.iq : (d.iq = {});
  if (!z.t || typeof z.t !== 'object') z.t = {}; // level -> best clear in ms (campaign levels only)
  if (!z.p || typeof z.p !== 'object') z.p = {}; // level -> par (the solver's winning line length) when it was set
  for (const k of ['cats', 'perfect', 'clears', 'play', 'chain']) if (!Number.isFinite(z[k]) || z[k] < 0) z[k] = 0;
  if (!z.run || typeof z.run !== 'object') z.run = {};
  const r = z.run;
  if (!Number.isFinite(r.best) || r.best < 0) r.best = 0; // the best Record Run total in ms (0 = none yet)
  if (!Array.isArray(r.split)) r.split = []; // the best run's board times
  if (!Number.isFinite(r.n) || r.n < 0) r.n = 0; // runs finished
  return z;
}

// save.js keeps only the keys it knows when it loads, so d.iq would be dropped on every reload: the stored copy is read
// back from the raw save (`raw` = the parsed localStorage object) before anything commits, and validated here
export function restore(d, raw) {
  const o = raw && typeof raw === 'object' && raw.iq && typeof raw.iq === 'object' ? raw.iq : null;
  if (!o) return ensure(d);
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
  const map = (m, max) => { const out = {}; if (m && typeof m === 'object') for (const k of Object.keys(m)) if (/^\d{1,5}$/.test(k) && Number.isFinite(m[k]) && m[k] > 0 && m[k] <= max) out[k] = m[k]; return out; };
  const r = o.run && typeof o.run === 'object' ? o.run : {};
  d.iq = { t: map(o.t, 36e5), p: map(o.p, 500), cats: num(o.cats), perfect: num(o.perfect), clears: num(o.clears), play: num(o.play), chain: Math.min(99, num(o.chain)), run: { best: num(r.best), split: Array.isArray(r.split) ? r.split.filter((x) => Number.isFinite(x) && x > 0).slice(0, 5) : [], n: num(r.n) } };
  return ensure(d);
}

// ---- time medals ----
// par: the number of taps on the generator's winning line. A brisk player frees about a cat a second; the cuts leave
// room for reading the board and grow on hard (x1.15) and super hard (x1.3) boards, whose lines hide traps.
export function cuts(par, kind = 'normal') {
  const k = kind === 'boss' ? 1.3 : kind === 'hard' ? 1.15 : 1;
  const p = Math.max(1, par | 0);
  const r = (s) => Math.round(s * k) * 1000;
  return { g: r(p * 1.2 + 3), s: r(p * 2 + 6), b: r(p * 3.2 + 10) };
}
// 3 gold, 2 silver, 1 bronze, 0 none
export function medalOf(ms, par, kind) {
  if (!(ms > 0)) return 0;
  const c = cuts(par, kind);
  return ms <= c.g ? 3 : ms <= c.s ? 2 : ms <= c.b ? 1 : 0;
}
export const MEDALS = ['', 'bronze', 'silver', 'gold'];

// a campaign clear of level n in ms -> { ms, prev, best, medal, prevMedal, cut } (best: a new personal best)
export function recordClear(d, n, ms, par, kind) {
  const z = ensure(d);
  ms = Math.max(100, Math.round(ms / 100) * 100); // tenths of a second
  const prev = z.t[n] || 0;
  const best = !prev || ms < prev;
  const prevMedal = prev ? medalOf(prev, z.p[n] || par, kind) : 0;
  if (best) { z.t[n] = ms; z.p[n] = par; }
  const medal = medalOf(ms, par, kind);
  // the next cut to aim for (the faster medal this run missed)
  const c = cuts(par, kind);
  const cut = medal >= 3 ? null : { m: medal + 1, ms: medal === 2 ? c.g : medal === 1 ? c.s : c.b };
  return { ms, prev, best, medal, prevMedal, cut };
}
export const bestOf = (d, n) => ensure(d).t[n] || 0;
export const medalAt = (d, n, kind) => { const z = ensure(d); return z.t[n] ? medalOf(z.t[n], z.p[n] || 1, kind) : 0; };
export function medalCount(d, kindOf = () => 'normal') {
  const z = ensure(d);
  const out = [0, 0, 0, 0];
  for (const n of Object.keys(z.t)) out[medalOf(z.t[n], z.p[n] || 1, kindOf(+n))]++;
  return out; // [none, bronze, silver, gold]
}
// the fastest clear of a real board (par 10+, so level 1's three cats never win it) -> { n, ms } or null
export function fastest(d) {
  const z = ensure(d);
  let out = null;
  for (const k of Object.keys(z.t)) if ((z.p[k] || 0) >= 10 && (!out || z.t[k] < out.ms)) out = { n: +k, ms: z.t[k] };
  return out;
}

// ---- counters (fed by the game's events) ----
export function noteFree(d, n) { ensure(d).cats += n; }
export function noteWin(d, peak, cats, chain) {
  const z = ensure(d);
  z.clears++;
  if (peak === 0 && cats >= 10) z.perfect++; // a clean sweep of a real board: no cushion ever used
  if (chain > z.chain) z.chain = chain;
}
export function notePlay(d, ms) { ensure(d).play += Math.max(0, Math.min(ms, 60000)); } // a long gap (sleep) never counts

// ---- Record Run ----
// 5 distinct cleared levels (from level 4 up, the last RUN_SPAN of them), in rising order so the run warms up
export function runPick(level, rand = Math.random) {
  const hi = level - 1;
  const lo = Math.max(4, hi - RUN_SPAN + 1);
  const pool = [];
  for (let n = lo; n <= hi; n++) pool.push(n);
  const out = [];
  while (out.length < RUN_BOARDS && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out.sort((a, b) => a - b);
}
export const runOpen = (d) => d.level >= RUN_FROM;
// a finished run -> { ms, prev, best }
export function runDone(d, splits) {
  const z = ensure(d);
  const ms = splits.reduce((a, b) => a + b, 0);
  const prev = z.run.best;
  const best = !prev || ms < prev;
  z.run.n++;
  if (best) { z.run.best = ms; z.run.split = splits.map((x) => Math.round(x)); }
  return { ms, prev, best };
}

// ---- Cat IQ ----
// 80 at the start, 160 at the top: progress (30), time medals (15), clean sweeps (10), the best chain (10), Daily
// clears (5) and the Record Run (10). Same stats, same number: no randomness, no decay.
export function catIq(s) {
  const c = (v, max) => Math.max(0, Math.min(max, v));
  const prog = c((30 * Math.log10(1 + s.cleared)) / Math.log10(301), 30);
  const med = c(s.gold * 0.5 + s.silver * 0.25 + s.bronze * 0.1, 15);
  const sweep = c(s.perfect * 0.5, 10);
  const chain = c((s.chain - 1) * 2, 10);
  const daily = c(s.daily * 0.25, 5);
  const run = s.run > 0 ? c((10 * (300000 - s.run)) / 240000, 10) : 0; // 1:00 or faster = 10, 5:00 = 0
  return Math.round(80 + prog + med + sweep + chain + daily + run);
}
export const IQ_TITLES = [[150, 'iqT6'], [135, 'iqT5'], [120, 'iqT4'], [110, 'iqT3'], [100, 'iqT2'], [90, 'iqT1'], [0, 'iqT0']];
export const iqTitle = (iq) => IQ_TITLES.find(([at]) => iq >= at)[1];
export const iqNext = (iq) => { const i = IQ_TITLES.findIndex(([at]) => iq >= at); return i > 0 ? { at: IQ_TITLES[i - 1][0], k: IQ_TITLES[i - 1][1] } : null; };

// ---- rank list ----
// BOT rivals: practice opponents placed around the player's level, labelled BOT everywhere they show. Their levels move
// with the week (some ahead, some behind), from a fixed seed, so the list is stable within a week.
const BOTS = ['Whiskers', 'Pebble', 'Marmalade', 'Tofu', 'Juniper', 'Sprout', 'Nimbus', 'Ziggy'];
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function bots(level, week) {
  const cleared = Math.max(0, level - 1);
  return BOTS.slice(0, 6).map((name, i) => {
    const h = hash(name + ':' + week);
    const off = [-9, -5, -2, 3, 6, 11][i] + ((h % 5) - 2);
    return { name, bot: true, lv: Math.max(1, cleared + off) };
  });
}
// friends: replies imported from ?c= links (d.fr.list). A campaign board (k 'l') tells at least how far they got; other
// boards (Daily, Show, Rush) say nothing about progress, so those friends rank with what is known: their board level 0.
export function friendRows(list) {
  const by = new Map();
  for (const e of list || []) {
    const nm = (e.nm || '').trim();
    if (!nm) continue;
    const lv = e.k === 'l' ? e.n : 0;
    const o = by.get(nm.toLowerCase());
    if (!o || lv > o.lv) by.set(nm.toLowerCase(), { name: nm, friend: true, lv });
  }
  return [...by.values()];
}
export function rankList(level, week, friends, me) {
  const rows = [{ name: me, me: true, lv: Math.max(0, level - 1) }, ...friendRows(friends), ...bots(level, week)];
  rows.sort((a, b) => b.lv - a.lv || (a.me ? -1 : b.me ? 1 : 0));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

// m:ss (under a minute: 0:42); with tenths for the win card and runs
export function fmt(ms, tenths = false) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return tenths ? `${m}:${r.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(r)).padStart(2, '0')}`;
}
export const fmtLong = (ms) => { const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); return { h, m }; };
