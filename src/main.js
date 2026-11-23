import './ui/ui.css';
import { generate } from './core/generate.js';
import { COLORS } from './core/board.js';
import { freeCats, hint as solverHint, solveFrom } from './core/solver.js';
import { compile, Sim, searchWin } from './core/search.js';
import { findBlocker, isFailed, canUndo, dogLeft, isHidden, tap as rulesTap } from './core/rules.js';
import { loadAssets } from './game/assets.js';
import { Game } from './game/game.js';
import { ui } from './ui/ui.js';
import { t } from './i18n.js';
import { save } from './kit/save.js';
import { audio } from './kit/audio.js';
import { haptics } from './kit/haptics.js';
import { ads } from './kit/ads.js';
import { track, funnel, retention } from './kit/analytics.js';
import { now } from './kit/clock.js';
import * as iap from './kit/iap.js';
import { pwa, initPwa } from './kit/pwa.js';
import * as econ from './game/econ.js';
import * as cafe from './game/cafe.js';
import { makeClip, shareFile } from './kit/clip.js';

const HINT_COST = 60;
const UNDO_COST = 90;
const SCOOP_COST = 150;
const seatCost = () => econ.SEAT_COSTS[Math.min(S.seatBuys || 0, econ.SEAT_COSTS.length - 1)]; // 120 / 200 / 300 within one level
const CAFE_FROM = 4; // the café hub is home from this level; levels 1-3 go straight to play
const S = { mode: 'home', n: 1, daily: false, show: false, area: 0, tries: {}, freeBack: {} };
let game;
let busy = false; // guards async actions (ads) against double taps
let busyTok = null;
const guarded = (fn) => async (...a) => {
  if (busy) return;
  busy = true;
  const tok = (busyTok = {});
  const release = setTimeout(() => { if (busyTok === tok) busy = false; }, 20000); // a stalled ad/store call never locks every button
  try {
    await fn(...a);
  } finally {
    clearTimeout(release);
    if (busyTok === tok) busy = false;
  }
};

// ---- helpers ----
const dayNum = () => econ.dayOf(now());
const todayKey = () => String(dayNum());
const dailyLevel = () => 100 + (dayNum() % 400);

function streak(today = dayNum()) {
  const d = save.data.daily;
  return d.last && (+d.last === +today || +d.last === today - 1) ? d.streak : 0;
}
// attempts, seat prices and the Purr "lost" flag are per level; the daily puzzle reuses a level number, so it gets its own key
const triesKey = () => (S.show ? 's' : S.daily ? 'd' : '') + S.n;

const homeInfo = () => ({
  coins: save.data.coins,
  level: save.data.level,
  streak: streak(),
  dailyDone: save.data.daily.doneDay === todayKey(),
});

// perk: free Hints every day (Biscuit 1, Clover +2). An older save with today's hintDay but no count has used one.
const hintsUsed = () => (save.data.cafe.hintDay === todayKey() ? Math.max(1, save.data.cafe.hintN || 0) : 0);
const hintFree = () => cafe.perkLevel('hint') > hintsUsed();

const hudInfo = () => ({
  lives: lifeGate() ? econ.lives(save.data, now()) : null, // hearts only matter once the first resident has moved in
  hintFree: hintFree(),
  coins: save.data.coins,
  boost: { ...save.data.boosters },
  costs: { hint: HINT_COST, undo: UNDO_COST, scoop: SCOOP_COST },
  canUndo: !!game.state && !game.demo && !game.busy() && canUndo(game.state),
  scoopOn: game.scoopMode,
});

const setTexts = () => {
  game.texts = [t('purrfect'), t('combo2'), t('combo3')];
  game.chainText = (n) => t('chainX', { n });
  document.title = t('title');
};
const peekColor = () => COLORS[game.board.cats[0].color];

// a booster costs one in stock, else coins. Returns false when neither is there.
function payBooster(k, cost) {
  const d = save.data;
  if (d.boosters[k] > 0) d.boosters[k]--;
  else if (d.coins >= cost) d.coins -= cost;
  else return false;
  save.commit();
  track('booster_use', { k });
  return true;
}
const canPayBooster = (k, cost) => save.data.boosters[k] > 0 || save.data.coins >= cost;

// ---- economy glue (rules live in game/econ.js; this file only wires them to the screens) ----
const lifeGate = () => cafe.RESIDENTS.some((r) => cafe.isBuilt(r.task.id)); // lives only matter once the first resident has moved in
const livesInfo = () => ({ n: econ.lives(save.data, now()), ms: econ.livesMs(save.data, now()) });
const dots = () => econ.dots(save.data, now());
const syncCoins = () => { ui.setCoins(save.data.coins); if (S.mode === 'play' && game.state) ui.setHud(hudInfo()); };
// roll the day/week/life timers forward (clock-guarded), persist when something changed
function econTick() {
  const d = save.data;
  const day = dayNum();
  const z = econ.clampAhead(d, day); // stamps left in the future by a wrong device date
  const a = econ.questsRoll(d, day) || z;
  const b = econ.showRoll(d, day);
  const before = d.lives.n;
  econ.livesTick(d, now());
  if (a || b || d.lives.n !== before) save.commit();
}
function quest(ev, n = 1) {
  if (S.noQuest && S.mode === 'play') return; // a replayed daily puzzle farms no task progress
  if (econ.questEvent(save.data, ev, dayNum(), n)) {
    save.commit();
    if (S.mode === 'cafe') ui.setDots(dots());
  }
}
function questsInfo() {
  const d = save.data;
  econ.questsRoll(d, dayNum());
  return {
    login: econ.loginState(d, dayNum()),
    rewards: econ.LOGIN_REWARDS,
    tasks: d.quests.list.filter((x) => econ.taskDef(x.id)).map((x) => { const def = econ.taskDef(x.id); return { id: x.id, p: x.p, need: def.need, coins: def.coins, c: x.c, done: econ.taskDone(x) }; }),
    chest: { ready: econ.chestReady(d), opened: !!d.quests.chest },
    chestReward: econ.CHEST,
  };
}
// the week's Cat Show board: one fixed generated board per week (the same for every player), and the judges' mark,
// the fewest bench seats it can be cleared with (searched once per week, then kept in the save)
const showLevel = () => 120 + (econ.weekOf(dayNum()) % 380);
function showMark() {
  const d = save.data;
  const w = econ.weekOf(dayNum());
  if (d.show.markWeek === w && d.show.mark > 0) return d.show.mark;
  const board = generate(showLevel());
  const C = compile(board);
  let mark = board.meta.benchSize - 1; // the generator's own line never needs more
  for (let k = 1; k < mark; k++) if (searchWin(new Sim(C, k), 6000, false) === 1) { mark = k; break; }
  d.show.mark = mark;
  d.show.markWeek = w;
  save.commit();
  return mark;
}
function showInfo() {
  const d = save.data;
  econ.showRoll(d, dayNum());
  const th = econ.themeOf(d.show.week);
  return {
    board: { mark: showMark(), best: d.show.best, cleared: !!(d.show.ch & 1), gold: !!(d.show.ch & 2), clearRibbons: econ.SHOW_CLEAR, markRibbons: econ.SHOW_MARK },
    name: cafe.loc(th.name),
    color: th.color,
    endsMs: econ.showEndsMs(dayNum(), now()),
    ribbons: d.show.ribbons,
    max: econ.SHOW_STEPS[econ.SHOW_STEPS.length - 1],
    ready: econ.showAnyReady(d),
    steps: econ.SHOW_STEPS.map((need, i) => ({ need, reward: econ.SHOW_REWARDS[i], state: d.show.claimed.includes(i) ? 'claimed' : d.show.ribbons >= need ? 'ready' : 'locked' })),
  };
}
const shopInfo = () => ({ owned: save.data.iap.owned, noAds: iap.noAds(), store: iap.available() });
// the Starter Bundle: a badge on the hub rail once it is due (never a pop-up on café entry) and one offer card on a
// quiet win card (no café build waiting), only where it can really be bought
const starterOpen = () => iap.available() && !save.data.iap.owned.starter && !save.data.iap.owned.noads && save.data.level > 10;
// a lost bench ends the attempt; taking a continue gives the life back (and the attempt is no longer a first-try win)
function continued(kind) {
  S.continued = true;
  if (S.lifeLost) { econ.addLife(save.data, 1); S.lifeLost = false; }
  save.commit();
  track('continue_taken', { kind, n: S.n });
}
// start a level unless the life gate is shut
function tryStart(n, daily = false, show = false) {
  if (show) { startLevel(n, false, true); return true; } // Cat Show practice is free and unlimited: no life is spent
  if (lifeGate() && econ.lives(save.data, now()) <= 0) {
    ui.noLives({ ms: econ.livesMs(save.data, now()), coins: save.data.coins, cost: econ.LIFE_REFILL_COST, ad: ads.available() });
    track('no_lives_gate', { n });
    return false;
  }
  startLevel(n, daily);
  return true;
}

// ---- flow ----
// the Cat Show rosettes the player has won hang on the café wall (one per theme, in its colour)
const rosettes = () => econ.earnedDecor(save.data).map((id) => econ.THEMES.find((x) => x.id === id)).filter(Boolean).map((x) => ({ id: x.id, color: x.color, name: cafe.loc(x.name) }));
const cafeInfo = (justBuilt) => ({ stars: cafe.stars(), level: save.data.level, area: S.area, justBuilt, coins: save.data.coins, lives: livesInfo(), dots: dots(), day: dayNum(), offer: starterOpen(), rosettes: rosettes(), party: cafe.partyOpen() ? { n: cafe.parties(), cost: cafe.PARTY_COST, ok: cafe.stars() >= cafe.PARTY_COST, coins: cafe.PARTY_REWARD.coins } : null });

function startHome() {
  if (S.mode === 'play' && game) {
    game.flushWin(); // a cleared board is credited even when the player leaves early
    if (game.state && game.state.failed && !game.failFired && !game.demo) { // the fail card was still on its way: the loss counts anyway
      game.failFired = true;
      game.over = true;
      onFail(true);
    }
  }
  S.winToken = (S.winToken || 0) + 1; // a pending Next (interstitial) or clip job of the left level is dropped
  clearTimeout(S.clipTimer);
  if (clip) clip.drop();
  if (S.mode === 'play' && game.state && !game.over && !game.demo && game.state.aliveCount > 0) track('level_quit', { n: S.n });
  S.mode = 'home';
  game.autoHint = false;
  game.load(generate(1), { demo: true, top: 146, bottom: 246 }); // the hero shows the real move: cats run into their carrier
  if (save.data.level >= CAFE_FROM) {
    S.mode = 'cafe';
    S.area = cafe.currentArea();
    ui.cafe(cafeInfo()); // the Starter Bundle waits as a badge on the rail: never a pop-up over the room
  } else ui.home(homeInfo());
}

// one-line hint card: the tutorial levels and the teaching level of each new mechanic
const TUT_KEY = { 1: 'tut1', 2: 'tut2', 3: 'tut3', 4: 'tut4', 8: 'tutDog', 12: 'tutYarn', 40: 'tutMystery', 55: 'tutFrozen' };

function startLevel(n, daily = false, show = false) {
  S.mode = 'play';
  S.n = n;
  S.daily = daily;
  S.show = show;
  S.winToken = (S.winToken || 0) + 1; // a pending win-card job (clip preview) of an older attempt is dropped
  clearTimeout(S.clipTimer);
  game.autoHint = !daily && !show && n <= 3; // L3's arrow points past the tempting pink pair; L4 is a real choice now: no tap-by-tap guide, only a nudge after a costly park
  const board = generate(n);
  const tries = (S.tries[triesKey()] = (S.tries[triesKey()] || 0) + 1);
  S.continued = false;
  S.lifeLost = false;
  S.seatBuys = S.seatN === triesKey() ? S.seatBuys || 0 : 0; // the seat price keeps climbing across retries of one level
  S.seatN = triesKey();
  S.undid = false;
  S.dayKey = todayKey(); // one snapshot decides daily-repeat for the whole attempt, even across midnight
  S.noQuest = daily && save.data.daily.doneDay === S.dayKey;
  const special = daily || show; // the daily puzzle and the Cat Show board: no perks, no lessons
  const perks = [];
  // Purr Streak bonus earned by the previous wins: a free Hint (and a Scoop at 5), plus a bench seat for this level and
  // every retry of it until it is cleared (kept in the save: leaving for the café or reloading never loses the seat)
  if (!daily && !show && n === save.data.level && save.data.purr.pend) {
    const k = econ.purrConsume(save.data);
    if (k) {
      save.data.boosters.hint++;
      if (k > 1) save.data.boosters.scoop++;
      save.data.purr.seatLv = n;
      save.commit();
      track('purr_bonus', { k, n });
      perks.push(t(k > 1 ? 'purrBonusToast2' : 'purrBonusToast'));
    }
  }
  if (!daily && !show && save.data.purr.seatLv === n) board.meta.benchSize++;
  // perk: +1 bench seat on a hard level: the first try (Luna), every try once Noodle stacks on it
  const seatLv = cafe.perkLevel('seat');
  if (!special && board.meta.kind !== 'normal' && seatLv && (tries === 1 || seatLv >= 2)) {
    board.meta.benchSize++;
    perks.push(t('perkSeatToast', { name: cafe.perkOwner('seat').name }));
  }
  // perk: a free Scoop on every 5th level (Pudding), every 3rd once Captain stacks on it; once per level
  const scoopLv = cafe.perkLevel('scoop');
  if (!special && scoopLv && n % (scoopLv >= 2 ? 3 : 5) === 0 && save.data.cafe.scoopLevel !== n) {
    save.data.cafe.scoopLevel = n;
    save.data.boosters.scoop++;
    save.commit();
    perks.push(t('perkScoopToast', { name: cafe.perkOwner('scoop').name }));
  }
  // a bench of a different size than last level is announced once (hard levels bring a smaller one)
  const bs = board.meta.benchSize;
  if (!special && n > 3 && S.lastBench && S.lastBench !== bs) perks.push(t('benchSeats', { n: bs }));
  S.lastBench = bs;
  setTexts();
  const tut = !special && TUT_KEY[n] ? t(TUT_KEY[n]) : '';
  S.tutDrop = !!tut && n > 4; // the hint card collapses after its first read (teaching levels only)
  S.scare = !special && n === 4 ? 1 : 0; // L4: one nudge once a park has cost the win
  S.scareMoves = 0;
  S.tut3b = false;
  S.tut = tut;
  game.load(board, { extraBottom: tut ? 64 : 0 });
  clipReset();
  ui.none();
  ui.play({ ...hudInfo(), level: n, daily, show, tut });
  track('level_start', { n, daily });
  if (perks.length) setTimeout(() => { if (S.mode === 'play' && S.n === n) perks.forEach((p, i) => setTimeout(() => ui.toast(p), i * 1500)); }, 500);
}

function onFree({ ids, step, purrfect }) {
  if (game.demo) return;
  if (!S.undid) quest('cat', ids.length); // replays after a paid undo do not count twice
  audio.mrrp(step);
  haptics.light();
  if (purrfect) audio.pop();
}

function onBonk(r) {
  if (game.demo) return;
  audio.mew();
  haptics.heavy();
  ui.setHud(hudInfo());
  track('bonk', { n: S.n });
}

// Cat Show board won: the score is the most seats used at once (lower is better); the first clear of the week pays
// ribbons, matching the judges' mark (the fewest seats the board can be cleared with) pays more and the gold rosette
function onShowWin() {
  const d = save.data;
  econ.showRoll(d, dayNum());
  const peak = game.state ? game.state.benchPeak : 0;
  const mark = showMark();
  const r = econ.showBoardResult(d, peak, mark);
  if (r.ribbons) econ.showAdd(d, r.ribbons, dayNum());
  save.commit();
  track('show_board_win', { peak, mark, ribbons: r.ribbons });
  audio.clear();
  haptics.success();
  ui.win({ stars: 1, title: peak <= mark ? 'winTitle' : 'winTitle2', coins: 0, peek: peekColor(), ribbons: r.ribbons, purr: t('showScore', { n: peak, m: mark }) + (r.best ? ' · ' + t('showBest') : ''), ach: [], show: true });
}

function onWin(stars) {
  ui.setTut('');
  if (S.show) return onShowWin();
  const d = save.data;
  const dayKey = S.dayKey || todayKey();
  const dailyRepeat = S.daily && d.daily.doneDay === dayKey;
  // a daily already cleared today pays nothing (no coin farming)
  // perk: +5 coins per coin-perk level on every win (Mochi 1, Pepper +2)
  const first = !S.daily && S.n === d.level;
  // coins pay on a first clear (and the daily); replaying an old level only drops a few coins, so it cannot be farmed
  const full = first || S.daily;
  // a flat base that grows with the level, a bonus for a tidy bench (it teaches: fewer seats used = more coins), the
  // hard / super-hard bonus, the daily bonus and the café perks; every part is listed on the win card
  const peakUsed = game.state ? game.state.benchPeak : 0;
  const parts = [];
  if (dailyRepeat) { /* a daily already cleared today pays nothing (no coin farming) */ } else if (!full) parts.push({ k: 'payReplay', n: 5 });
  else {
    parts.push({ k: 'payBase', n: 20 + Math.floor(S.n / 5) });
    const tidy = peakUsed <= 1 ? 10 : peakUsed <= 2 ? 5 : 0;
    if (tidy) parts.push({ k: 'payTidy', n: tidy, v: peakUsed });
    if (stars >= 2) parts.push({ k: stars === 3 ? 'paySuper' : 'payHard', n: stars === 3 ? 20 : 10 });
    if (S.daily) parts.push({ k: 'payDaily', n: 25 });
    const perk = 5 * cafe.perkLevel('coins') + cafe.love();
    if (perk) parts.push({ k: 'payCafe', n: perk });
  }
  const reward = parts.reduce((t, p) => t + p.n, 0);
  let cafeStars = 0;
  if (first) {
    d.level++;
    cafeStars = stars; // a first clear pays its star count into the café (normal 1, hard 2, super hard 3)
    cafe.addStars(cafeStars);
  }
  if (!S.daily) d.bestStars[S.n] = Math.max(d.bestStars[S.n] || 0, stars);
  if (S.daily && d.daily.doneDay !== dayKey) {
    d.daily.streak = streak(+dayKey) + 1; // one day snapshot (taken at level start) for the whole daily bookkeeping
    d.daily.last = dayKey;
    d.daily.doneDay = dayKey;
  }
  d.coins += reward;
  // economy: Purr Streak, daily tasks, Cat Show ribbons (a replayed daily puzzle pays no ribbons)
  const firstTry = first && S.tries[triesKey()] === 1 && !S.continued && d.purr.lost !== S.n;
  if (first) econ.purrWin(d, firstTry); // a replay of an old level never touches the streak
  if (!S.daily && d.purr.lost === S.n) d.purr.lost = 0;
  if (first && d.purr.seatLv === S.n) d.purr.seatLv = 0; // the streak's bench seat is used up once its level is cleared
  // Cat Show ribbons: a first clear pays its stars, +1 for a clean first try (so ~3-4 wins a day can finish the track in a week)
  const ribbons = dailyRepeat || !full ? 0 : stars + (firstTry ? 1 : 0);
  quest('win');
  if (game.board.meta.kind !== 'normal') quest('hard');
  if (ribbons) econ.showAdd(d, ribbons, dayNum());
  const purr = S.daily ? '' : d.purr.pend ? t('purrReady') : d.purr.n > 0 ? t('purrProg', { n: d.purr.n, g: econ.purrGoal(d) }) : '';
  save.commit();
  track('level_win', { n: S.n, stars, firstTry });
  if (first) for (const [lv, k] of [[1, 'l1'], [3, 'l3'], [10, 'l10']]) if (S.n === lv) funnel(k);
  audio.clear();
  haptics.success();
  S.lastStars = stars;
  const canBuild = !S.daily && d.level >= CAFE_FROM && cafe.anyAffordable();
  // the title follows how cleanly it went, not the star payout
  const peak = game.state ? game.state.benchPeak : 0;
  const title = !S.undid && !S.continued && peak <= 1 ? 'winTitle' : !S.continued && peak <= 2 ? 'winTitle2' : 'winTitle1';
  const res = cafe.RESIDENTS.filter((r) => cafe.isBuilt(r.task.id)).at(-1); // the newest resident peeks over the card
  const nextTask = !S.daily && d.level >= CAFE_FROM ? cafe.ALL_TASKS.find((x) => !cafe.isBuilt(x.id)) : null;
  const nr = nextTask && cafe.nextResident();
  const cafeNext = nextTask && { sprite: nextTask.sprite, cost: nextTask.cost || 1, name: cafe.loc(nextTask.name), stars: cafe.stars(), res: nr && { id: nr.id, name: nr.name, left: Math.max(0, cafe.starsToResident(nr) - cafe.stars()) } };
  // what the player pulled off, from their own moves only: the best bench chain, a clear without parking
  const ach = [];
  if (clip.score >= 2) ach.push({ k: 'chain', text: t('achChain', { n: clip.score }) });
  if (peak === 0) ach.push({ k: 'nobench', text: t('achNoBench') });
  // the win card is the payoff moment: never an upsell on it (the Starter Bundle shows once, on a lost bench instead)
  const pay = parts.length > 1 || (parts[0] && parts[0].k === 'payReplay') ? parts.map((p) => `${t(p.k, { n: p.v })} +${p.n}`).join(' · ') : '';
  ui.win({ stars, title, cheer: { winTitle: 'cheer3', winTitle2: 'cheer2', winTitle1: 'cheer1' }[title], res: res && res.id, coins: reward, coinsBefore: d.coins - reward, pay, peek: peekColor(), cafeStars, canBuild, cafeNext, ribbons, purr, ach, chain: clip.has() && clip.score >= 2 });
  S.shareTitle = title;
  for (let i = 0; i < stars; i++) setTimeout(() => audio.star(i), 300 + i * 300);
  // the chain loops on the card at once (the frames are already there); the video for Share is encoded behind it
  const token = S.winToken;
  clearTimeout(S.clipTimer);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startPreview = () => {
    if (token !== S.winToken || ui.screen !== 'win' || !clip.has() || clip.score < 2) return;
    if (clip.recording) { S.clipTimer = setTimeout(startPreview, 300); return; } // the last hops are still being caught
    clip.play(document.querySelector('#modal .chainclip canvas'), clipOverlay(), still);
    clip.encode(clipOverlay());
  };
  S.clipTimer = setTimeout(startPreview, 500);
}

// ---- share clip of the level's best carrier chain ----
let clip;
const clipOverlay = () => ({ title: t('title'), badge: clip.score >= 2 ? t('chainX', { n: clip.score }) : t(S.shareTitle || 'winTitle'), level: S.daily ? t('dailyLevel') : t('level', { n: S.n }) });
function clipReset() {
  clip.reset(clipRect());
}
function clipRect() {
  const c = game.canvas;
  const k = game.dpr;
  const y0 = Math.max(0, game.beltY - game.cs * 1.25);
  const y1 = Math.min(game.H, game.oy + game.board.h * game.cell + 26);
  return { x: 0, y: Math.round(y0 * k), w: c.width, h: Math.round((y1 - y0) * k) };
}

// the continue card: what went wrong (the stuck cat, seats vs the missing carrier), then the ways out
function failInfo() {
  const st = game.state;
  const sid = st && st.pending && st.pending.length ? st.pending[0] : null;
  const color = sid != null ? COLORS[game.board.cats[sid].color] : peekColor();
  const sp = sid != null && game.vis.stuck.length ? game.stuckPos(0) : null;
  return {
    peek: color,
    why: st ? t('offerWhy', { n: st.benchSize, c: t('col_' + color) }) : '',
    stuckAt: sp && { x: Math.round(Math.min(game.W - 72, Math.max(72, sp.x))), y: Math.round(sp.y - game.bw * 0.62) },
    coins: save.data.coins,
    seatCost: seatCost(),
    canSeat: save.data.coins >= seatCost(),
    scoop: save.data.boosters.scoop,
    scoopCost: SCOOP_COST,
    ad: ads.available(),
    store: iap.available(),
    tip: t(st && st.carriers[0] && freeCats(st).some((i) => game.board.cats[i].color === st.carriers[0].color) ? 'failTip2' : 'failTip'),
    // the first lost bench on a level offers one free Take Back (the losing tap undone), so the lesson can be applied
    freeBack: !S.show && !S.freeBack[triesKey()] && !!st && canUndo(st),
    practice: !!S.show, // the Show board: Retry is free, nothing to buy
    // the Starter Bundle shows once, here (never on a win card), and not in the first session
    offer: !S.show && !S.daily && save.data.meta.sessions >= 2 && econ.starterDue(save.data) && starterOpen() && { coins: iap.PRODUCTS.starter.coins, scoop: iap.PRODUCTS.starter.scoop, price: iap.PRODUCTS.starter.price },
  };
}

function onFail(silent = false) {
  ui.setTut('');
  track('level_fail', { n: S.n, show: !!S.show });
  track('bench_full', { n: S.n });
  if (!S.show) { // Cat Show practice is free: no life, no streak
    econ.purrLoss(save.data);
    if (!S.daily) save.data.purr.lost = S.n;
    S.lifeLost = lifeGate() && econ.loseLife(save.data, now());
  }
  save.commit();
  if (S.lifeLost) track('life_lost', { n: S.n });
  if (silent) return;
  audio.mew();
  const info = failInfo();
  ui.fail(info);
  if (info.offer) {
    save.data.shop.starterShown = true;
    save.commit();
    track('starter_shown', { at: 'fail' });
  }
  if (S.lifeLost) ui.toast(t('lifeLost'));
}

// ---- actions ----
const actions = {
  click: () => audio.tick(),
  play: () => tryStart(save.data.level),
  daily: () => tryStart(dailyLevel(), true),
  cafe: () => startHome(),
  starter() { if (!starterOpen()) return; ui.starter(); track('starter_open', { from: S.mode }); },
  cafeback() { ui.cafe(cafeInfo()); },
  residents: () => ui.residents(),
  pet({ id }) {
    if (S.mode !== 'cafe' || !ui.pet(id)) return;
    audio.mrrp(0);
    haptics.light();
    track('pet', { id });
  },
  treat({ id }) {
    if (S.mode !== 'cafe') return;
    const r = cafe.RESIDENTS.find((x) => x.id === id);
    if (!r || cafe.loveOf(id) >= cafe.LOVE_COSTS.length) return;
    if (!cafe.treat(id)) return ui.toast(t('needCoins', { n: cafe.treatCost(id) }));
    audio.star(1);
    haptics.success();
    track('treat', { id });
    ui.residents();
    ui.toast(t('loveToast', { name: r.name }));
  },
  cafearea({ d }) {
    const a = Math.max(0, Math.min(cafe.AREAS.length, S.area + +d));
    if (a === S.area) return;
    S.area = a;
    ui.cafe(cafeInfo());
  },
  build({ id }) {
    const task = cafe.ALL_TASKS.find((x) => x.id === id);
    if (!task || S.mode !== 'cafe') return;
    if (!cafe.build(id)) return ui.toast(t('needStars', { n: task.cost || 1 }));
    S.area = task.area;
    audio.clear();
    haptics.success();
    track('task_done', { id });
    ui.cafe(cafeInfo(id));
    if (task.resident) {
      track('resident_arrive', { id: task.resident.id });
      funnel('first_resident');
      econ.grant(save.data, { hint: 1 }); // every new resident arrives with a free Hint
      save.commit();
      setTimeout(() => {
        if (S.mode === 'cafe') { audio.star(2); ui.arrive({ resident: task.resident, sprite: task.sprite, level: save.data.level }); ui.toast(t('arriveGift', { name: task.resident.name })); }
      }, 1100);
    }
  },
  party() {
    if (S.mode !== 'cafe') return;
    if (!cafe.hostParty()) return ui.toast(t('needStars', { n: cafe.PARTY_COST }));
    econ.grant(save.data, cafe.PARTY_REWARD);
    save.commit();
    audio.clear();
    haptics.success();
    track('party', { n: cafe.parties() });
    ui.cafe(cafeInfo());
    ui.toast(t('partyDone', { n: cafe.parties(), c: cafe.PARTY_REWARD.coins }));
  },
  arriveplay() { ui.hideModal(); tryStart(save.data.level); },
  arriveclose() { ui.hideModal(); ui.cafe(cafeInfo()); },
  settings: () => ui.settings(settingsInfo()),
  shop() { ui.shop(shopInfo()); track('shop_open', { from: S.mode }); },
  closesheet: () => ui.hideSheet(),
  buy: guarded(async ({ id }) => {
    const r = await iap.purchase(id);
    if (!r.ok) return ui.toast(t('buyFail'));
    track('iap_purchase', { id });
    audio.clear();
    haptics.success();
    ui.toast(t('thanks'));
    if (ui.sheet === 'starter') ui.hideSheet();
    else if (ui.sheet === 'shop') ui.shop(shopInfo());
    syncCoins();
    if (ui.screen === 'fail' && S.mode === 'play' && game.over) { ui.hideModal(); ui.fail(failInfo()); } // coins bought from the continue card: show what is now affordable
  }),
  restore: guarded(async () => {
    const ids = await iap.restore();
    ui.toast(t(ids.length ? 'restored' : 'nothingRestore'));
    if (ui.sheet === 'shop') ui.shop(shopInfo());
    if (ui.screen === 'settings') ui.settings(settingsInfo());
  }),
  quests() { ui.quests(questsInfo()); track('tasks_open'); },
  qclaim({ id }) {
    if (!econ.questClaim(save.data, id, dayNum())) return;
    save.commit();
    track('daily_task_done', { id });
    audio.star(0);
    ui.quests(questsInfo());
    syncCoins();
    if (S.mode === 'cafe') ui.setDots(dots());
  },
  chest() {
    if (!econ.chestClaim(save.data)) return ui.toast(t('chestSub'));
    save.commit();
    track('daily_chest');
    audio.clear();
    haptics.success();
    ui.quests(questsInfo());
    syncCoins();
    if (S.mode === 'cafe') ui.setDots(dots());
  },
  loginclaim() {
    const r = econ.loginClaim(save.data, dayNum());
    if (!r) return;
    save.commit();
    track('login_claim', { idx: save.data.login.idx });
    audio.star(1);
    ui.quests(questsInfo());
    syncCoins();
    if (S.mode === 'cafe') ui.setDots(dots());
  },
  show() { ui.show(showInfo()); track('show_open'); },
  showclaim() {
    const out = econ.showClaim(save.data, dayNum());
    if (!out.length) return;
    save.commit();
    track('show_claim', { n: out.length });
    audio.clear();
    haptics.success();
    ui.show(showInfo());
    syncCoins();
    if (S.mode === 'cafe') ui.setDots(dots());
  },
  adlife: guarded(async () => {
    if (ui.sheet !== 'nolives' || !ads.available()) return;
    if (!(await ads.rewarded('life'))) return ui.toast(t('adNone'));
    if (ui.sheet !== 'nolives') return;
    econ.addLife(save.data, 1);
    save.commit();
    track('life_ad');
    ui.hideSheet();
    ui.setLives(livesInfo());
  }),
  liferefill() {
    if (ui.sheet !== 'nolives') return;
    if (save.data.coins < econ.LIFE_REFILL_COST) return ui.toast(t('noCoins'));
    save.data.coins -= econ.LIFE_REFILL_COST;
    econ.refillLives(save.data);
    save.commit();
    track('life_refill');
    ui.hideSheet();
    ui.setLives(livesInfo());
    syncCoins();
  },
  close: () => ui.hideModal(),
  // the free Take Back on a level's first lost bench: the losing tap is undone, nothing is charged
  takeback() {
    if (busy || S.mode !== 'play' || !game.over || !game.state.failed || S.freeBack[triesKey()]) return;
    if (!game.undoMove()) return ui.toast(t('noUndo'));
    S.freeBack[triesKey()] = true;
    S.undid = true;
    ui.hideModal();
    ui.resume();
    ui.setHud(hudInfo());
    track('free_takeback', { n: S.n });
    continued('takeback');
  },
  showplay() { ui.hideSheet(); tryStart(showLevel(), false, true); track('show_board_play'); },
  home: () => startHome(),
  retry: () => tryStart(S.n, S.daily, S.show),
  adheart: guarded(async () => {
    const st = game.state;
    if (S.mode !== 'play' || !game.over || !st.failed || !ads.available()) return;
    if (!(await ads.rewarded('heart'))) return ui.toast(t('adNone'));
    if (S.mode !== 'play' || game.state !== st || !game.over || !st.failed) return; // the failure was already resolved while the ad ran
    game.heartsAdd();
    ui.hideModal();
    ui.resume();
    ui.setHud(hudInfo());
    track('rewarded_seat');
    continued('ad');
  }),
  coinseat() {
    if (busy || S.mode !== 'play' || !game.over) return;
    const cost = seatCost();
    if (!game.state.failed) return;
    if (save.data.coins < cost) return ui.toast(t('needCoins', { n: cost }));
    save.data.coins -= cost;
    S.seatBuys = (S.seatBuys || 0) + 1;
    save.commit();
    game.heartsAdd();
    ui.hideModal();
    ui.resume();
    ui.setHud(hudInfo());
    track('coin_seat');
    continued('coins');
  },
  // continue by scoop: take the losing move back, then scoop a cat of your choice
  offerscoop() {
    if (busy || S.mode !== 'play' || !game.over) return;
    if (!canPayBooster('scoop', SCOOP_COST)) return ui.toast(t('noCoins'));
    if (!game.undoMove()) return ui.toast(t('noUndo')); // nothing is charged unless the move was really taken back
    S.undid = true; // the undone move's cats and carrier are not credited to the daily tasks twice
    if (save.data.boosters.scoop <= 0) {
      save.data.coins -= SCOOP_COST;
      save.data.boosters.scoop = 1;
      save.commit();
    }
    ui.hideModal();
    ui.resume();
    actions.scoop();
    track('offer_scoop');
    continued('scoop');
  },
  undo() {
    if (S.mode !== 'play' || game.demo) return;
    if (game.busy() || !canUndo(game.state)) return ui.toast(t('noUndo'));
    if (!payBooster('undo', UNDO_COST)) return ui.toast(t('noCoins'));
    if (game.undoMove()) S.undid = true;
    ui.setHud(hudInfo());
    track('undo');
  },
  scoop() {
    if (S.mode !== 'play' || game.demo || game.over) return;
    if (game.scoopMode) game.scoopMode = false;
    else if (!canPayBooster('scoop', SCOOP_COST)) return ui.toast(t('noCoins'));
    else game.scoopMode = true;
    ui.setTut(game.scoopMode ? t('scoopTip') : '');
    ui.setHud(hudInfo());
  },
  next: guarded(async () => {
    if (S.show) { startHome(); return actions.show(); } // back to the Show sheet: try for a better score
    if (S.daily) return startHome();
    const n = S.n;
    const token = S.winToken;
    if (ads.shouldShowInterstitial(n)) await ads.interstitial();
    if (S.mode !== 'play' || ui.screen !== 'win' || token !== S.winToken) return; // the player went Home while the ad ran
    tryStart(n + 1);
  }),
  hint: guarded(async () => {
    const ok = () => S.mode === 'play' && game.state && !game.over && !isFailed(game.state) && game.state.aliveCount > 0 && game.hintId == null;
    if (!ok()) return;
    const id = solverHint(game.state); // nothing is paid for a hint that cannot point at a cat
    if (id == null) return ui.toast(t('noHint'));
    if (hintFree()) {
      save.data.cafe.hintN = hintsUsed() + 1;
      save.data.cafe.hintDay = todayKey();
      save.commit();
      game.hintId = id;
      ui.setHud(hudInfo());
      track('hint_free_perk');
    } else if (payBooster('hint', HINT_COST)) {
      game.hintId = id;
      ui.setHud(hudInfo());
      track('hint_booster');
    } else if (!ads.available()) {
      ui.toast(t('noCoins'));
    } else if (await ads.rewarded('hint')) {
      if (ok()) game.setHint();
      else { save.data.boosters.hint++; save.commit(); ui.setHud(hudInfo()); ui.toast(t('hintSaved')); } // the board moved on while the ad ran: the hint waits in stock
      track('hint_ad');
    } else ui.toast(t('adNone'));
  }),
  // Share: the level's best carrier chain as a short video (PNG card without MediaRecorder), else the text line
  async share() {
    if (S.sharing) return;
    S.sharing = true;
    try { await doShare(); } finally { S.sharing = false; }
  },
  async install() {
    await pwa.install();
  },
  toggle({ k }) {
    save.data.settings[k] = !save.data.settings[k];
    save.commit();
    ui.settings(settingsInfo());
  },
  lang({ l }) {
    save.data.settings.lang = l;
    save.commit();
    if (game.board) setTexts();
    document.documentElement.lang = l;
    if (S.mode === 'home') ui.home(homeInfo());
    else if (S.mode === 'cafe') ui.cafe(cafeInfo());
    ui.settings(settingsInfo());
  },
};

// Share: the level's best bench chain as a WebM (an animated-strip PNG while it is still encoding or without
// MediaRecorder), else the text line. Its own flag, so Next stays live while a share sheet is open.
async function doShare() {
  const text = clip.score >= 2 ? t('shareClip', { n: S.n, c: clip.score }) : t('shareText', { n: S.n, stars: '★'.repeat(S.lastStars || 1) });
  if (clip.has()) {
    const ov = clipOverlay();
    const f = clip.ready() || (await clip.png(ov)); // no long await: the tap's user activation must still hold
    if (f) {
      const how = await shareFile(f, `long-cat-out-level-${S.n}`, text);
      track('share', { kind: f.ext, how });
      if (how === 'saved') ui.toast(t('clipSaved'));
      return;
    }
  }
  try {
    if (navigator.share) await navigator.share({ text });
    else if (!navigator.clipboard) ui.toast(text);
    else {
      await navigator.clipboard.writeText(text);
      ui.toast(t('copied'));
    }
  } catch (e) {
    if (e && e.name !== 'AbortError') ui.toast(text);
  }
}

const settingsInfo = () => ({ settings: save.data.settings, removeAds: ads.isRemoved(), canInstall: pwa.canInstall() });

// ---- boot ----
async function boot() {
  game = new Game(document.getElementById('game'));
  setTexts(); // popups speak the saved language from the first frame
  game.on.free = onFree;
  game.on.bonk = onBonk;
  game.on.mech = (e) => { if (game.demo) return; if (e.type === 'wake' || e.type === 'thaw') audio.pop(); else if (e.type === 'knock' || e.type === 'reveal') audio.land(); };
  game.on.win = onWin;
  clip = makeClip(game);
  game.on.fail = onFail;
  game.on.depart = ({ chain }) => { if (game.demo) return; audio.depart(chain - 1); haptics.success(); if (!game.demo && !S.undid) quest('carrier'); };
  // a bench chain (2+ parked cats hop in from one tap): the share clip keeps the best one of the level
  game.on.chain = ({ n }) => { if (game.demo) return; clip.mark(n); track('chain', { n, lv: S.n }); };
  game.on.hop = ({ k }) => { if (game.demo) return; audio.chain(k - 1); haptics.light(); };
  game.on.land = () => { if (!game.demo) audio.land(); };
  game.on.scoopCan = () => canPayBooster('scoop', SCOOP_COST) || (ui.toast(t('noCoins')), false);
  game.on.scoop = () => { payBooster('scoop', SCOOP_COST); ui.setTut(''); ui.setHud(hudInfo()); track('scoop'); };
  game.on.scoopFull = () => ui.toast(t('offerSub'));
  game.on.layout = () => {
    if (game.demo) return;
    // the toast lane above the booster bar and the combo band over the board's top rows follow the board layout
    const r = document.documentElement.style;
    r.setProperty('--lane-b', game.laneB + 'px');
    r.setProperty('--combo-y', game.comboY + 'px');
    if (S.mode === 'play' && game.board) clip.setCrop(clipRect()); // resize / rotation
  };
  game.on.combo = (text) => { if (S.mode === 'play') ui.combo(text); };
  game.on.demoReset = () => game.load(generate(1), { demo: true, top: 146, bottom: 246 });
  ui.init(actions);
  initPwa();
  pwa.onChange(() => { if (ui.screen === 'settings') ui.settings(settingsInfo()); });
  document.documentElement.lang = save.data.settings.lang;
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  await loadAssets();
  econTick(); // day stamps repaired and rolled before the first screen reads them
  if (save.data.level < CAFE_FROM) startLevel(save.data.level);
  else startHome();
  setInterval(() => {
    if (S.mode !== 'play' || !game.state) return;
    ui.setHud(hudInfo());
    // L4: no answer up front. The card names the idea, never the tap: at 4 of 5 seats a reminder of the rule, and once a
    // park has cost the win (no winning line left) a nudge toward Undo.
    if (S.scare && S.scare < 3 && game.state.moves !== S.scareMoves && !game.busy() && !game.over && game.state.aliveCount > 0) {
      S.scareMoves = game.state.moves;
      if (!solveFrom(structuredClone(game.state), 2500).order) {
        S.scare = 3;
        ui.setTut(t('tut4b'));
        haptics.light();
      } else if (S.scare === 1 && game.state.benchUsed >= 4) {
        S.scare = 2;
        ui.setTut(t('tut4c'));
      }
    }
    // L3: the moment a mother + kitten pair parks, the card names what just happened (two seats taken until their
    // carrier comes), before the bench runs out
    if (S.n === 3 && !S.daily && !S.show && !S.tut3b && game.state.bench.some((id) => id >= 0 && game.board.cats[id].kittenOf != null)) {
      S.tut3b = true;
      ui.setTut(t('tut3b'));
      haptics.light();
    }
    // the "4 of 5 seats" card never outlives the full bench: once seats free up it goes back to the level's rule
    if (S.scare === 2 && game.state.benchUsed < 4 && !game.busy()) {
      S.scare = 1;
      ui.setTut(S.tut);
    }
    // the hint card empties after its first read, but its space stays: the board never moves under the thumb
    if (S.tutDrop && !game.scoopMode && game.state.aliveCount < game.board.cats.length && !game.busy() && !game.over) {
      S.tutDrop = false;
      ui.setTut('');
    }
  }, 250);
  // the share clip films only while there is something to film: the level in play, or a chain still finishing after it
  setInterval(() => { if (S.mode === 'play' && game.state && !game.demo && ((!game.over && ui.screen === 'play') || clip.recording)) clip.tick(); }, 100);
  setInterval(() => {
    econTick();
    const l = livesInfo();
    ui.setLives(l);
    if (ui.sheet === 'nolives' && l.n > 0) ui.hideSheet();
  }, 1000);
  save.data.meta.sessions++;
  save.commit();
  track('app_open', { session: save.data.meta.sessions });
  retention();

  if (import.meta.env.DEV) {
    const blocked = () => game.board.cats.filter((c) => game.state.alive[c.id] && findBlocker(game.state, c.id)).map((c) => c.id);
    window.__qa = {
      level: (n) => startLevel(n),
      showBoard: () => startLevel(showLevel(), false, true),
      showMark: () => showMark(),
      daily: () => startLevel(dailyLevel(), true),
      home: () => startHome(),
      cafe: () => { startHome(); },
      addStars: (n) => { cafe.addStars(n); startHome(); },
      screen(name) {
        if (name === 'shop') actions.shop();
        else if (name === 'quests') actions.quests();
        else if (name === 'show') actions.show();
        else if (name === 'starter') ui.starter();
        else if (name === 'nolives') ui.noLives({ ms: econ.livesMs(save.data, now()), coins: save.data.coins, cost: econ.LIFE_REFILL_COST, ad: ads.available() });
        else if (name === 'residents') actions.residents();
        else if (name === 'settings') actions.settings();
      },
      lang: (l) => actions.lang({ l }),
      act: (name, d = {}) => actions[name](d),
      save: (patch) => { Object.assign(save.data, patch); save.commit(); },
      sheet: () => ui.sheet,
      slow: (f) => { game.timeScale = f; },
      solveStep() {
        const id = solverHint(game.state);
        return id == null ? null : game.tapCat(id);
      },
      // tap a free cat that does (match) or does not match the front carrier; returns its id or null
      tapColor(match) {
        const f = game.state.carriers[0];
        const id = freeCats(game.state).find((i) => f && (game.board.cats[i].color === f.color) === match);
        if (id == null) return null;
        game.tapCat(id);
        return id;
      },
      // keep tapping non-matching cats until the bench holds n
      benchTo(n) {
        const go = () => {
          if (!game.state || game.state.benchUsed >= n) return;
          if (window.__qa.tapColor(false) == null) return;
          setTimeout(go, 160);
        };
        go();
      },
      // overflow the bench with real taps (bonks are free): fill 3 seats with wrong-color cats, shrink the bench to them, tap one more
      failNow() {
        let shrunk = false;
        const go = () => {
          const st = game.state;
          if (!st || game.over || st.failed) return;
          if (!shrunk && st.benchUsed >= 3 && !game.busy()) {
            st.bench = st.bench.filter((x) => x >= 0);
            st.benchSize = st.bench.length;
            game.syncVis();
            shrunk = true;
          }
          const f = st.carriers[0];
          const free = freeCats(st);
          let id = free.find((i) => !f || game.board.cats[i].color !== f.color);
          if (id == null && shrunk && f && free.length) {
            f.color = (game.board.cats[free[0]].color + 1) % 8; // qa only: no wrong-color cat is free, so recolor the front carrier
            game.syncVis();
            id = free[0];
          }
          id ??= free[0];
          if (id != null && (shrunk || st.benchUsed < 3 || !game.busy())) game.tapCat(id);
          setTimeout(go, 330);
        };
        go();
      },
      forceBlink: (v) => { game.blinkOf = () => v; },
      clip: () => ({ has: clip.has(), score: clip.score, recording: clip.recording }),
      async clipEncode() { const r = (await clip.encode(clipOverlay())) || (await clip.png(clipOverlay())); return r && { ext: r.ext, size: r.blob.size }; },
      freeId: () => solverHint(game.state),
      blockedId: () => blocked()[0] ?? null,
      // first cat of a mechanic on the current board ('mystery' | 'frozen'), or null
      mechCat: (k) => game.board.cats.find((c) => c.mech === k)?.id ?? null,
      objs: () => game.board.objs.map((o) => o.kind),
      mechState() {
        const st = game.state;
        const cats = game.board.cats;
        return {
          yarn: st.objs.filter((o, k) => o.kind === 'yarn' && st.objAlive[k]).length,
          dog: st.objs.map((o, k) => (o.kind === 'dog' && st.objAlive[k] ? dogLeft(st, k) : -1)).filter((x) => x >= 0),
          frozen: cats.filter((c) => c.mech === 'frozen' && st.frozen[c.id] && st.alive[c.id]).length,
          chipped: cats.filter((c) => c.mech === 'frozen' && st.alive[c.id] && st.thaw[c.id] > 0).length,
          hidden: cats.filter((c) => st.alive[c.id] && isHidden(st, c.id)).length,
        };
      },
      pos: (id) => game.cellPos(id),
      // what tapping a cat would do (rules only, on a copy): bench chain size, whether a dog wakes, seats after
      peek(id) {
        const st = structuredClone(game.state);
        const r = rulesTap(st, id);
        const ev = r.events || [];
        return { ok: !!(r.ok || r.freed), boards: ev.filter((e) => e.type === 'board').length, wake: ev.some((e) => e.type === 'wake'), used: st.benchUsed, failed: !!st.failed };
      },
      order: () => game.board.meta.order || [],
      meta: () => ({ ...game.board.meta, order: undefined }),
      tap: (id) => { const r = game.tapCat(id); return !!r; },
      alive: (id) => !!game.state && !!game.state.alive[id],
      chainFx: () => game.chainFx && { n: game.chainFx.n, k: game.chainFx.k },
      trot: () => { const a = game.anims.find((x) => x.type === 'trot'); return a ? game.clock - a.t0 : -1; },
      // a free mother whose kitten trails her (the usual trap of a generated board), or null
      trapCat() {
        const st = game.state;
        const free = freeCats(st);
        return free.find((i) => game.board.cats.some((k) => k.kittenOf === i && st.alive[k.id])) ?? null;
      },
      tut: () => document.getElementById('tut')?.textContent || '',
      winNow() {
        const go = () => {
          if (!game.state || game.state.aliveCount === 0) return;
          const id = solverHint(game.state);
          if (id != null) game.tapCat(id);
          setTimeout(go, 60);
        };
        go();
      },
      state: () => ({
        screen: ui.screen,
        sheet: ui.sheet,
        mode: S.mode,
        level: S.n,
        bench: game.state && [game.state.benchUsed, game.state.benchSize],
        departed: game.state && game.state.departed,
        leaving: game.vis.leaving.length,
        busy: game.busy(),
        alive: game.state && game.state.aliveCount,
        over: game.over,
        free: game.state ? freeCats(game.state) : [],
        blocked: game.state ? blocked() : [],
        anims: game.anims.length,
        cell: game.cell,
        board: game.board && [game.board.w, game.board.h],
      }),
    };
  }
}

boot();
