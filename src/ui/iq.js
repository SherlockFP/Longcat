// R10 "iq" lane UI: the level clock in the play HUD, the time row on the win card, Record Run (5 boards on one clock)
// and the Records sheet (Levels with time medals + replay, Run, Stats with Cat IQ, Rank list). It hooks in from one
// init() call in main.js: it wraps game.load / game.on.free / game.on.win, adds its own actions, and puts a Records
// button on the café's right rail. The rules live in src/game/iq.js; state under save.data.iq.
import { t } from '../i18n.js';
import { assetUrl } from '../game/breeds.js';
import { openSheet } from './ui.js';
import { save } from '../kit/save.js';
import { audio } from '../kit/audio.js';
import { haptics } from '../kit/haptics.js';
import { track } from '../kit/analytics.js';
import { now } from '../kit/clock.js';
import { levelKind } from '../core/generate.js';
import { isWon } from '../core/rules.js';
import { dayOf, weekOf } from '../game/econ.js';
import * as iq from '../game/iq.js';
import './iq.css';

const r7 = (name, cls = '') => `<img class="${cls}" src="${assetUrl('r7/' + name + '.webp')}" alt="" draggable="false">`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const arrowSvg = (d) => `<svg viewBox="0 0 24 24"><path d="${d < 0 ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const MEDAL_ART = ['iq_watch', 'iq_bronze', 'iq_silver', 'iq_gold'];
const medalImg = (m, cls = '') => r7(MEDAL_ART[m] || 'iq_watch', cls);
const PER_PAGE = 20;
const secs = (ms) => (ms < 60000 ? (ms / 1000).toFixed(1) + t('secShort') : iq.fmt(ms, true)); // a split: 15.2s
// d.iq survives a reload only through the raw save (save.js drops keys it does not know): read it back at import time,
// before main.js boots and commits
try { iq.restore(save.data, JSON.parse(localStorage.getItem('lco_save') || 'null')); } catch { iq.ensure(save.data); }

let C = null; // { game, S, actions, ui, tryStart, startLevel, streak } from main.js
const pnow = () => performance.now();
// a clock: acc (ms banked) + t0 (running since, 0 = stopped); held = stopped because the tab was hidden
const elapsed = (c) => (c ? c.acc + (c.t0 ? pnow() - c.t0 : 0) : 0);
const startC = (c) => { if (c && !c.t0 && !c.done) c.t0 = pnow(); };
const stopC = (c) => { if (c && c.t0) { c.acc += pnow() - c.t0; c.t0 = 0; } };
let clk = null; // the campaign level being played: { n, par, kind, acc, t0, done }
let run = null; // a Record Run: { boards, i, bi, bc (board clock), splits, ms, tok }
let last = null; // the finished run (for Share)
let tab = 'levels';
let page = -1;

const parOf = (board) => (board.meta && Array.isArray(board.meta.order) && board.meta.order.length) || board.cats.length;
const inRun = () => !!run && !!C.S.show && C.S.show.kind === 'iqrun';

export function init(ctx) {
  C = ctx;
  const { game } = C;
  iq.ensure(save.data);
  const load = game.load.bind(game);
  game.load = (board, o = {}) => { const r = load(board, o); onLoad(board, o); return r; };
  const free = game.on.free;
  game.on.free = (e) => {
    if (free) free(e);
    if (game.demo) return;
    iq.noteFree(save.data, e.ids.length);
    if (inRun()) { startC(run.bc); if (isWon(game.state)) stopC(run.bc); } else if (clk) { startC(clk); if (isWon(game.state)) { stopC(clk); clk.done = true; } }
  };
  const win = game.on.win;
  game.on.win = (stars) => {
    if (game.demo) return win(stars);
    const st = game.state;
    iq.noteWin(save.data, st ? st.benchPeak : 0, game.board.cats.length, C.S.chainBest || 0);
    if (inRun()) return runWin();
    let rec = null;
    if (clk && !C.S.show && !C.S.daily && clk.n === C.S.n) {
      stopC(clk);
      clk.done = true;
      if (clk.acc > 0) rec = iq.recordClear(save.data, clk.n, clk.acc, clk.par, clk.kind);
    }
    win(stars); // main.js commits the save
    save.commit();
    if (rec) { winRow(rec); track('iq_time', { n: clk.n, ms: rec.ms, medal: rec.medal, best: rec.best ? 1 : 0 }); }
  };
  Object.assign(C.actions, actions);
  // the Records button on the café's right rail (the hub re-mounts #ui; the button follows)
  const root = document.getElementById('ui');
  if (root) new MutationObserver(addRail).observe(root, { childList: true });
  // the clocks stop while the tab is hidden
  document.addEventListener('visibilitychange', () => {
    for (const c of [clk, run && run.bc]) {
      if (!c) continue;
      if (document.hidden && c.t0) { stopC(c); c.held = true; } else if (!document.hidden && c.held) { c.held = false; startC(c); }
    }
  });
  let lastT = pnow(), ticks = 0;
  setInterval(() => {
    const tn = pnow();
    const dt = tn - lastT;
    lastT = tn;
    const S = C.S;
    if (S.mode !== 'play' || !game.state || game.demo) return;
    if (!document.hidden) { iq.notePlay(save.data, dt); if (++ticks % 150 === 0) save.commit(); }
    if (inRun()) {
      if (run.bc.t0 && isWon(game.state)) stopC(run.bc);
      let el = document.getElementById('iqrunclk');
      if (!el && C.ui.screen === 'play') el = hudRun();
      if (el) el.textContent = iq.fmt(run.ms + elapsed(run.bc), true);
    } else if (clk) {
      if (clk.t0 && isWon(game.state)) { stopC(clk); clk.done = true; }
      let el = document.getElementById('iqclk');
      if (!el && C.ui.screen === 'play') el = hudClock();
      if (el) el.querySelector('b').textContent = iq.fmt(elapsed(clk));
    }
  }, 100);
  if (import.meta.env.DEV) {
    window.__iq = {
      open: (k) => actions.iqopen({ tab: k }),
      run: () => actions.iqrun(),
      state: () => ({ clk: clk && { n: clk.n, ms: Math.round(elapsed(clk)), done: !!clk.done }, run: run && { i: run.i, boards: run.boards, ms: Math.round(run.ms + elapsed(run.bc)) }, data: save.data.iq }),
      // skip ahead in a run: bank `ms` on this board and win it (the QA has no hands)
      runWin: (ms = 20000) => { if (!inRun()) return false; run.bc.acc = ms; run.bc.t0 = 0; runWin(); return true; },
      clockAdd: (ms) => { if (clk) clk.acc += ms; },
    };
  }
}

// ---- a level loads: a fresh campaign clock, a run board (a retry keeps the run clock going), or none ----
function onLoad(board, o) {
  const S = C.S;
  if (o.demo) { clk = null; if (run) run = null; return; }
  if (S.show && S.show.kind === 'iqrun' && run) {
    clk = null;
    if (run.bi !== run.i) { run.bi = run.i; run.bc = { acc: 0, t0: 0 }; if (run.i > 0) startC(run.bc); } // board 1 waits for the first cat
    queueMicrotask(hudRun);
    return;
  }
  run = null; // any other board ends a run
  clk = !S.show && !S.daily ? { n: S.n, par: parOf(board), kind: board.meta.kind || 'normal', acc: 0, t0: 0, done: false } : null;
  if (clk) queueMicrotask(hudClock);
}

// the HUD clock: small, top left under the Home button (clear of the carriers); the icon is this level's time medal so
// far (the stopwatch before one)
function hudClock() {
  const hud = document.getElementById('hud');
  if (!hud || !clk) return null;
  hud.querySelector('.iqclk')?.remove();
  hud.insertAdjacentHTML('beforeend', `<div class="iqclk" id="iqclk" aria-hidden="true">${medalImg(iq.medalAt(save.data, clk.n, clk.kind), 'iqci')}<b>${iq.fmt(elapsed(clk))}</b></div>`);
  return document.getElementById('iqclk');
}
function hudRun() {
  const hud = document.getElementById('hud');
  if (!hud || !run) return null;
  const sp = hud.querySelector('.lvl-pill span');
  if (sp) sp.textContent = t('iqRunN', { i: run.i + 1, n: run.boards.length });
  hud.querySelector('#iqrunclk')?.remove();
  hud.insertAdjacentHTML('beforeend', `<div class="rushclock iqrunclk" id="iqrunclk" aria-live="off">${iq.fmt(run.ms + elapsed(run.bc), true)}</div>`);
  return document.getElementById('iqrunclk');
}

// ---- the win card: this clear's time, a new best, the medal and the next cut ----
function winRow(rec, tries = 0) {
  const card = document.querySelector('#modal .card.win');
  // a first clear plays the adoption ceremony (orders lane) before the card: wait for it (about 3 s, a tap skips)
  if (!card) { if (tries < 50 && C.S.mode === 'play') setTimeout(() => winRow(rec, tries + 1), 120); return; }
  if (card.querySelector('.iqwin, .iqchip')) return;
  const tt = iq.fmt(rec.ms, true);
  const fresh = rec.best && rec.prev;
  const line = fresh ? t('iqNewBest', { t: tt }) : !rec.prev ? t('iqFirstTime', { t: tt }) : t('iqTimeVs', { t: tt, b: iq.fmt(rec.prev, true) });
  const sub = t('iqMedal' + rec.medal) + (rec.cut ? ' · ' + t('iqNextCut', { m: t('iqM' + rec.cut.m), t: iq.fmt(rec.cut.ms) }) : '');
  const calm = reduced() ? 'calm' : '';
  const top = card.querySelector('.cwtop');
  const stars = card.querySelector('.stars');
  if (top) top.insertAdjacentHTML('afterend', `<div class="iqwin ${fresh ? 'best' : ''} ${calm}">${medalImg(rec.medal, 'iqwm')}<span><b>${esc(line)}</b><small>${esc(sub)}</small></span></div>`);
  else if (card.classList.contains('withclip') && stars) // the chain-replay card has no height to spare: a chip beside the stars
    stars.insertAdjacentHTML('beforeend', `<div class="iqchip ${fresh ? 'best' : ''} ${calm}">${medalImg(rec.medal, 'iqwm')}<span><b>${tt}</b><small>${esc(fresh ? t('iqChipBest') : rec.prev ? t('iqRunPrev', { t: iq.fmt(rec.prev, true) }) : t('iqMedal' + rec.medal))}</small></span></div>`);
  else (stars || card.querySelector('h2.title') || card.firstElementChild).insertAdjacentHTML('afterend', `<div class="iqwin ${fresh ? 'best' : ''} ${calm}">${medalImg(rec.medal, 'iqwm')}<span><b>${esc(line)}</b><small>${esc(sub)}</small></span></div>`);
}

// ---- Record Run ----
function startBoard() {
  C.startLevel(run.boards[run.i], false, { kind: 'iqrun', k: `${run.i + 1}/${run.boards.length}`, w: 0 });
}
function runWin() {
  stopC(run.bc);
  const split = Math.round(run.bc.acc);
  run.splits.push(split);
  run.ms += split;
  run.bc = { acc: 0, t0: 0 };
  run.i++;
  audio.clear();
  haptics.success();
  if (run.i < run.boards.length) { // between boards: the split, then the next board on its own (the clock is stopped)
    document.getElementById('iqmid')?.remove();
    const host = document.getElementById('ui');
    if (host) host.insertAdjacentHTML('beforeend', `<div class="iqmid ${reduced() ? 'calm' : ''}" id="iqmid">${r7('iq_watch', 'iqmw')}<b>${t('iqRunBoard', { i: run.i, n: run.boards.length })}</b><span>${iq.fmt(split, true)}</span><small>${t('iqRunTotal', { t: iq.fmt(run.ms, true) })}</small></div>`);
    const tok = (run.tok = {});
    setTimeout(() => {
      document.getElementById('iqmid')?.remove();
      if (!run || run.tok !== tok || C.S.mode !== 'play') return; // the player went home
      startBoard();
    }, 1300);
    return;
  }
  const res = iq.runDone(save.data, run.splits);
  save.commit();
  track('iq_run_done', { ms: Math.round(res.ms), best: res.best ? 1 : 0 });
  last = { ...res, splits: run.splits.slice() };
  run = null;
  document.getElementById('iqrunclk')?.remove();
  runCard(last);
}
function runCard(r) {
  document.getElementById('modal')?.remove();
  const prev = r.prev ? (r.best ? t('iqRunPrev', { t: iq.fmt(r.prev, true) }) : t('iqRunPrev', { t: iq.fmt(r.prev, true) }) + ' · ' + t('iqRunSlower', { d: ((r.ms - r.prev) / 1000).toFixed(1) })) : '';
  const host = document.getElementById('ui');
  host.insertAdjacentHTML('beforeend', `
<div class="backdrop" id="modal"><div class="card teal win iqrunend">
  ${r7('iq_watch', 'peek iqpk')}
  <h2 class="title yellow">${t('iqRunDone')}</h2>
  ${r.best && r.prev ? `<div class="moment">${esc(t('iqNewBest', { t: iq.fmt(r.ms, true) }))}</div>` : ''}
  <div class="iqtotal">${iq.fmt(r.ms, true)}</div>
  <div class="iqsplits">${r.splits.map((s, i) => `<i><em>${i + 1}</em>${secs(s)}</i>`).join('')}</div>
  ${prev ? `<div class="purr">${esc(prev)}</div>` : ''}
  <button class="btn" data-act="iqrun">${t('iqRunAgain')}</button>
  <div class="row r7row"><button class="btn teal sm" data-act="home">${t('home')}</button><button class="btn pink sm" data-act="iqshare">${t('iqShare')}</button></div>
</div></div>`);
}
async function shareRun() {
  const ms = (last && last.ms) || iq.ensure(save.data).run.best;
  if (!ms) return;
  const text = t('iqShareRun', { t: iq.fmt(ms, true) });
  const url = location.origin + location.pathname;
  track('iq_share');
  try { if (navigator.share) { await navigator.share({ text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + url); C.ui.toast(t('iqCopied')); } catch { C.ui.toast(text); }
}

// ---- the Records sheet ----
const actions = {
  iqopen({ tab: k } = {}) { if (k) tab = k; page = -1; sheet(); track('iq_open', { tab }); },
  iqtab({ tab: k }) { tab = k; sheet(); },
  iqpage({ p }) { page = +p || 0; sheet(); },
  iqplay({ n }) {
    n = +n;
    if (!(n >= 1 && n < save.data.level)) return;
    C.ui.hideSheet();
    C.tryStart(n);
    track('iq_replay', { n });
  },
  iqrun() {
    if (!iq.runOpen(save.data)) return;
    C.ui.hideSheet();
    document.getElementById('modal')?.remove();
    run = { boards: iq.runPick(save.data.level), i: 0, bi: -1, bc: { acc: 0, t0: 0 }, splits: [], ms: 0, tok: null };
    startBoard();
    track('iq_run_start');
  },
  iqshare() { shareRun(); },
};

function sheet() {
  const tb = (k, label) => `<button class="stab ${tab === k ? 'on' : ''}" data-act="iqtab" data-tab="${k}">${label}</button>`;
  const tabs = `<div class="stabs ev4 iqtabs">${tb('levels', t('iqTabLevels'))}${tb('run', t('iqTabRun'))}${tb('stats', t('iqTabStats'))}${tb('rank', t('iqTabRank'))}</div>`;
  const body = tab === 'run' ? runTab() : tab === 'stats' ? statsTab() : tab === 'rank' ? rankTab() : levelsTab();
  openSheet('iq', 'quests lsheet iqsheet', t('iqRecords'), tabs + body);
}

function levelsTab() {
  const d = save.data;
  const cleared = d.level - 1;
  if (cleared < 1) return `<div class="iqempty">${r7('iq_watch', 'iqbig')}<b>${t('iqLevelsEmpty')}</b></div>`;
  // pages run back from the newest level (page 0 = the latest 20), so the first page is always full
  const pages = Math.ceil(cleared / PER_PAGE);
  if (page < 0 || page >= pages) page = 0;
  const b = cleared - page * PER_PAGE;
  const a = Math.max(1, b - PER_PAGE + 1);
  const mc = iq.medalCount(d, levelKind);
  const cells = [];
  for (let n = a; n <= b; n++) {
    const ms = iq.bestOf(d, n);
    const m = ms ? iq.medalAt(d, n, levelKind(n)) : 0;
    cells.push(`<button class="iqlv m${m} ${ms ? '' : 'nt'}" data-act="iqplay" data-n="${n}" aria-label="${t('level', { n })}"><b>${n}</b>${m ? medalImg(m, 'iqlm') : ''}<small>${ms ? iq.fmt(ms) : t('iqNone')}</small></button>`);
  }
  const arrow = (dd) => `<button class="arr ${page - dd < 0 || page - dd >= pages ? 'dis' : ''}" data-act="iqpage" data-p="${page - dd}" aria-label="${dd < 0 ? t('back') : t('next')}">${arrowSvg(dd)}</button>`; // left = older
  return `<div class="iqsum">${r7('iq_gold', 'iqsm')}<b>${mc[3]}</b>${r7('iq_silver', 'iqsm')}<b>${mc[2]}</b>${r7('iq_bronze', 'iqsm')}<b>${mc[1]}</b></div>
<div class="lnote small">${t('iqLevelsSub')}</div>
<div class="iqgrid">${cells.join('')}</div>
<div class="iqnav">${arrow(-1)}<span>${t('iqPage', { a, b, n: cleared })}</span>${arrow(1)}</div>`;
}

function runTab() {
  const d = save.data;
  const z = iq.ensure(d);
  const open = iq.runOpen(d);
  const best = z.run.best;
  return `<div class="iqrunhero">${r7('iq_watch', 'iqbig')}<span><b>${t('iqRunTitle')}</b><small>${t('iqRunRule')}</small></span></div>
<div class="iqbest"><small>${t('iqRunBest')}</small><b>${best ? iq.fmt(best, true) : t('iqRunNone')}</b>${z.run.n ? `<small>${t('iqRunCount', { n: z.run.n })}</small>` : ''}</div>
${best && z.run.split.length ? `<div class="lnote small">${t('iqSplits')}</div><div class="iqsplits">${z.run.split.map((s, i) => `<i><em>${i + 1}</em>${secs(s)}</i>`).join('')}</div>` : ''}
${open ? `<button class="btn green iqgo" data-act="iqrun">${t('iqRunGo')}</button>${best ? `<button class="link" data-act="iqshare">${t('iqShare')}</button>` : ''}` : `<div class="iqlock">${r7('icon_lock')}<span><b>${t('iqRunLocked', { n: iq.RUN_FROM - 1 })}</b><small>${t('iqRunLockedSub')}</small></span></div>`}`;
}

export function stats() {
  const d = save.data;
  const z = iq.ensure(d);
  const mc = iq.medalCount(d, levelKind);
  const s = { cleared: Math.max(0, d.level - 1), gold: mc[3], silver: mc[2], bronze: mc[1], perfect: z.perfect, chain: Math.max(z.chain, (d.meta && d.meta.bestChain) || 0), daily: (d.drec && d.drec.n) || 0, run: z.run.best };
  return { ...s, iq: iq.catIq(s), cats: z.cats, fast: iq.fastest(d), streak: C && C.streak ? C.streak() : d.daily.streak, play: z.play };
}
function statsTab() {
  const s = stats();
  const nx = iq.iqNext(s.iq);
  const pt = iq.fmtLong(s.play);
  const tile = (label, v, sub = '') => `<div class="iqtile"><small>${label}</small><b>${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  return `<div class="iqhero">${r7('iq_head', 'iqhead')}<div><small>${t('iqTitle')}</small><b class="iqnum">${s.iq}</b><em>${t(iq.iqTitle(s.iq))}</em><small class="iqnext">${nx ? t('iqNextTitle', { n: nx.at - s.iq, title: t(nx.k) }) : t('iqTop')}</small></div></div>
<div class="iqtiles">
${tile(t('iqStCleared'), s.cleared)}${tile(t('iqStCats'), s.cats.toLocaleString())}
${tile(t('iqStChain'), s.chain ? '×' + s.chain : t('iqNone'))}${tile(t('iqStFast'), s.fast ? iq.fmt(s.fast.ms, true) : t('iqNone'), s.fast ? t('level', { n: s.fast.n }) : '')}
${tile(t('iqStPerfect'), s.perfect, t('iqStPerfectSub'))}${tile(t('iqStStreak'), s.streak, t('iqStStreakSub', { n: s.daily }))}
${tile(t('iqStPlay'), pt.h ? t('iqHM', pt) : t('iqM', pt))}${tile(t('iqStMedals'), `<span class="iqmm">${r7('iq_gold')}${s.gold}${r7('iq_silver')}${s.silver}${r7('iq_bronze')}${s.bronze}</span>`)}
</div>
<div class="lnote small">${t('iqHow')}</div>`;
}

function rankTab() {
  const d = save.data;
  const rows = iq.rankList(d.level, weekOf(dayOf(now())), d.fr && d.fr.list, (d.meta && d.meta.nick) || t('iqRankYou'));
  const me = rows.findIndex((r) => r.me);
  // at most 8 rows, the window around the player
  const lo = Math.max(0, Math.min(me - 3, rows.length - 8));
  const view = rows.slice(lo, lo + 8);
  const row = (r) => `<div class="iqrow ${r.me ? 'me' : ''} ${r.bot ? 'bot' : ''}"><i class="iqrk">${r.rank}</i><b>${esc(r.name)}</b>${r.bot ? `<em class="iqtag bot">${t('iqBot')}</em>` : r.friend ? `<em class="iqtag fr">${t('iqFriend')}</em>` : r.me && r.name !== t('iqRankYou') ? `<em class="iqtag me">${t('iqRankYou')}</em>` : ''}<span>${r.friend && !r.lv ? `<small>${t('iqRankNoLv')}</small>` : r.lv}</span></div>`;
  return `<div class="iqpos">${r7('iq_podium', 'iqpod')}<b>${t('iqRankPos', { n: me + 1, m: rows.length })}</b></div>
<div class="iqrows"><div class="iqrow hd"><i></i><b></b><span>${t('iqRankHead')}</span></div>${view.map(row).join('')}</div>
<div class="lnote small">${t('iqRankSub')}</div>
<div class="lnote small">${t('iqRankFr')}</div>`;
}

// ---- the café's right rail: one Records button ----
function addRail() {
  const rail = document.querySelector('#cafe .rrail');
  if (!rail || rail.querySelector('.iqrr')) return;
  rail.insertAdjacentHTML('beforeend', `<button class="rr iqrr" data-act="iqopen" aria-label="${t('iqRecords')}">${r7('iq_watch')}<span>${t('iqRecords')}</span></button>`);
}
