// Economy checks: node scripts/check-econ.mjs (lives, Purr Streak, daily tasks, login, Cat Show, retention systems + a
// 120-day simulated player, R10 album/pop-up/Daily record/jobs/friend results, IAP, ads rules, save migration)
const stored = { v: null };
globalThis.localStorage = { getItem: () => stored.v, setItem: (k, v) => { stored.v = v; } };
const { save } = await import('../src/kit/save.js');
const E = await import('../src/game/econ.js');
const L = await import('../src/game/live.js');
const ST = await import('../src/game/street.js');
const R = await import('../src/game/r10.js');
const RT = await import('../src/game/r11-ret.js'); // R11 retention lane: album card, day goal, tomorrow
const { applyPurchase, PRODUCTS } = await import('../src/kit/iap.js');

let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.error('FAIL ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const fresh = () => { save.reset(); return save.data; };

const MIN = 60000;
const H = 3600000;
const at = (y, mo, d, h = 12, mi = 0) => new Date(y, mo, d, h, mi).getTime(); // local time: TZ independent
const T0 = at(2026, 0, 7, 12); // a Wednesday in January

// ---------------- lives ----------------
{
  const d = fresh();
  eq(E.lives(d, T0), 5, 'full lives on a fresh save');
  ok(E.loseLife(d, T0) && d.lives.n === 4 && d.lives.t === T0, 'losing a life starts the timer');
  eq(E.lives(d, T0 + 24 * MIN), 4, 'no regen before 25 min');
  eq(E.livesMs(d, T0 + 24 * MIN), MIN, 'timer shows the minute left');
  eq(E.lives(d, T0 + 25 * MIN), 5, 'regen after 25 min');
  eq(d.lives.t, 0, 'timer stops at full');
  for (let i = 0; i < 5; i++) E.loseLife(d, T0 + 30 * MIN);
  eq(d.lives.n, 0, 'five losses empty the lives');
  ok(!E.loseLife(d, T0 + 30 * MIN), 'cannot lose a life at zero');
  eq(E.lives(d, T0 + 30 * MIN + 51 * MIN), 2, '51 min after the empty state = 2 lives');
  eq(E.livesMs(d, T0 + 30 * MIN + 51 * MIN), 24 * MIN, 'partial regen keeps the remainder (no timer reset)');
  eq(E.lives(d, T0 + 30 * MIN + 10 * H), 5, 'caps at 5 after a long wait');
  // clock rollback: a timer stamped in the future never locks the player out nor pays free lives
  const r = fresh();
  E.loseLife(r, T0 + 2 * H);
  eq(E.lives(r, T0), 4, 'rollback: no lives gained');
  ok(E.livesMs(r, T0) <= 25 * MIN, 'rollback: the wait is at most one full interval');
  E.addLife(r, 9);
  eq(r.lives.n, 5, 'addLife caps at 5');
  E.refillLives(r);
  eq([r.lives.n, r.lives.t], [5, 0], 'refill');
}

// ---------------- Purr Streak ----------------
{
  const d = fresh();
  E.purrWin(d, true); E.purrWin(d, true);
  eq(E.purrConsume(d), 0, 'no bonus after 2');
  E.purrWin(d, true);
  eq(d.purr.pend, 1, '3 first-try wins queue the bonus');
  eq(E.purrConsume(d), 1, 'bonus consumed once');
  eq(E.purrConsume(d), 0, 'bonus does not repeat');
  E.purrWin(d, true); E.purrWin(d, true);
  eq([d.purr.pend, d.purr.n], [2, 0], '5 in a row queues the big bonus and restarts');
  eq(E.purrConsume(d), 2, 'big bonus');
  E.purrWin(d, true); E.purrWin(d, true);
  E.purrWin(d, false);
  eq(d.purr.n, 0, 'a win that was not first try resets');
  E.purrWin(d, true); E.purrWin(d, true); E.purrWin(d, true);
  E.purrLoss(d);
  eq([d.purr.n, d.purr.pend], [0, 1], 'a loss resets the count but keeps the bonus already earned');
}

// ---------------- daily tasks + chest ----------------
{
  const d = fresh();
  const day = E.dayOf(T0);
  ok(E.questsRoll(d, day), 'first roll');
  ok(!E.questsRoll(d, day), 'same day: no re-roll');
  eq(d.quests.list.length, 3, '3 tasks');
  eq(new Set(d.quests.list.map((x) => x.id)).size, 3, 'tasks are distinct');
  ok(d.quests.list.every((x) => x.id !== 'hard'), 'no hard-level task before hard levels exist');
  const copy = fresh();
  E.questsRoll(copy, day);
  eq(copy.quests.list, d.quests.list, 'same day = same tasks');
  // force known tasks
  d.quests.list = [{ id: 'carriers', p: 0, c: 0 }, { id: 'wins', p: 0, c: 0 }, { id: 'cats', p: 0, c: 0 }];
  E.questEvent(d, 'carrier', day, 4);
  E.questEvent(d, 'carrier', day, 20);
  eq(d.quests.list[0].p, 10, 'progress caps at need');
  eq(E.questClaim(d, 'wins', day), 0, 'unfinished task pays nothing');
  eq(E.questClaim(d, 'carriers', day), 15, 'finished task pays its coins');
  eq(E.questClaim(d, 'carriers', day), 0, 'no double pay');
  const coins = d.coins;
  ok(!E.chestReady(d), 'chest locked until all 3 are claimed');
  eq(E.chestClaim(d), null, 'locked chest gives nothing');
  for (let i = 0; i < 3; i++) E.questEvent(d, 'win', day);
  E.questEvent(d, 'cat', day, 50);
  E.questClaim(d, 'wins', day); E.questClaim(d, 'cats', day);
  ok(E.chestReady(d), 'chest ready');
  const sc = d.boosters.scoop;
  ok(!!E.chestClaim(d) && d.boosters.scoop === sc + 1 && d.coins > coins, 'chest pays');
  eq(E.chestClaim(d), null, 'chest pays once');
  E.questEvent(d, 'win', day);
  eq(d.quests.list[1].p, 3, 'claimed tasks do not progress further');
  // next day: new list; clock back: the list stays
  ok(E.questsRoll(d, day + 1) && d.quests.chest === 0 && d.quests.list.every((x) => x.p === 0 && !x.c), 'new day resets progress, claims and chest');
  const keep = JSON.stringify(d.quests);
  ok(!E.questsRoll(d, day) && JSON.stringify(d.quests) === keep, 'clock rollback does not re-roll or reset the day');
  const hardOk = fresh();
  hardOk.level = 40;
  const seen = new Set();
  for (let k = 0; k < 40; k++) { E.questsRoll(hardOk, day + 100 + k); hardOk.quests.list.forEach((x) => seen.add(x.id)); }
  ok(seen.has('hard') && seen.size === E.TASK_POOL.length, 'every task shows up over time once hard levels exist');
}

// ---------------- login calendar ----------------
{
  const d = fresh();
  const day = E.dayOf(T0);
  ok(E.loginState(d, day).avail, 'first login available');
  eq(E.loginClaim(d, day), E.LOGIN_REWARDS[0], 'day 1 reward');
  eq(E.loginClaim(d, day), null, 'no double claim on the same day');
  eq(E.loginClaim(d, day - 3), null, 'clock rollback cannot claim');
  eq(E.loginClaim(d, day + 1), E.LOGIN_REWARDS[1], 'day 2 on the next day');
  eq(E.loginClaim(d, day + 3), E.LOGIN_REWARDS[0], 'a missed day restarts the calendar');
  const w = fresh();
  for (let i = 0; i < 7; i++) E.loginClaim(w, day + i);
  eq(w.login.idx, 7, 'seven claims fill the calendar');
  ok(!E.loginState(w, day + 6).avail, 'nothing more the same day');
  eq(E.loginClaim(w, day + 7), E.LOGIN_REWARDS[0], 'after day 7 the cycle wraps');
}

// ---------------- weekly Cat Show ----------------
{
  const sun = E.dayOf(at(2026, 0, 11, 23, 30)); // Sunday
  const mon = E.dayOf(at(2026, 0, 12, 0, 30)); // Monday
  ok(E.weekOf(mon) === E.weekOf(sun) + 1, 'weeks turn over on Monday');
  eq(E.weekOf(E.dayOf(at(2026, 0, 12))) === E.weekOf(E.dayOf(at(2026, 0, 18, 23))), true, 'Monday to Sunday is one week');
  const ends = E.showEndsMs(sun, at(2026, 0, 11, 23, 30));
  ok(ends > 20 * MIN && ends < 40 * MIN, `the show ends at local midnight (got ${Math.round(ends / MIN)} min)`);
  ok(E.showEndsMs(mon, at(2026, 0, 12, 0, 30)) > 6 * 24 * H, 'a fresh week has almost 7 days left');
  const themes = new Set();
  for (let w = 0; w < 6; w++) themes.add(E.themeOf(E.weekOf(mon) + w).id);
  eq(themes.size, 6, 'the theme rotates weekly through the data list');
  eq(E.themeOf(E.weekOf(mon)).id, E.themeOf(E.weekOf(mon) + 6).id, 'and wraps around');

  const d = fresh();
  ok(E.showRoll(d, sun), 'first week roll');
  ok(E.showRoll(d, mon), 'week change rolls the event');
  ok(!E.showRoll(d, sun), 'clock rollback does not roll back the week');
}

// ---------------- retention: tip jar ----------------
{
  const d = fresh();
  eq(L.jarState(d, T0, 0, 0).on, false, 'no residents: no tip jar');
  const s0 = L.jarState(d, T0, 2, 1);
  eq([s0.on, s0.coins, d.jar.t], [true, 0, T0], 'the first resident starts an empty jar');
  const rate = L.jarRate(2, 1);
  eq(L.jarState(d, T0 + 2 * H, 2, 1).coins, rate * 2, 'the jar fills by the hour');
  eq(L.jarState(d, T0 + 2 * H, 2, 1).stage, 2, 'half full = stage 2');
  eq(L.jarState(d, T0 + 30 * H, 2, 1).coins, rate * L.JAR_CAP_H, `the jar caps at ${L.JAR_CAP_H} h`);
  const c0 = d.coins;
  eq(L.jarCollect(d, T0 + 3 * H, 2, 1), rate * 3, 'collect pays what is in the jar');
  ok(d.coins === c0 + rate * 3 && d.jar.t === T0 + 3 * H, 'coins added, jar restarts');
  eq(L.jarCollect(d, T0 + 3 * H, 2, 1), 0, 'an empty jar pays nothing');
  // clock rollback: a jar stamped in the future restarts empty, never pays free coins
  eq(L.jarState(d, T0, 2, 1).coins, 0, 'rollback: no coins');
  eq(d.jar.t, T0, 'rollback: the jar restarts at the current time');
  ok(L.jarRate(8, 24) * L.JAR_CAP_H <= 250, 'a full house fills the jar with at most 250 coins');
}

// ---------------- retention: resident requests, hearts and outfits ----------------
{
  const d = fresh();
  const res = ['mochi', 'biscuit'];
  d.req.bridge = 1; // the timed requests on their own (the second resident's bridge ask has its own check below)
  ok(!L.reqTick(d, T0, []), 'no residents: no requests');
  ok(L.reqTick(d, T0, res) && d.req.list.length === 1, 'the first resident brings a request at once');
  ok(!L.reqTick(d, T0 + H, res), 'nothing new within the interval');
  ok(L.reqTick(d, T0 + L.REQ_EVERY_H * H, res) && d.req.list.length === 2, 'a second one after the interval');
  ok(d.req.list[0].k !== d.req.list[1].k, 'two waiting requests never ask the same thing');
  ok(!L.reqTick(d, T0 + 40 * H, res) && d.req.list.length === L.REQ_MAX, 'at most 2 wait; no pile-up after a long break');
  ok(d.req.next >= T0 + 40 * H, 'while full, the request clock waits');
  // force a known pair
  d.req.list = [{ k: 'color', who: 'mochi', need: 9, p: 0, c: 3, s: 1 }, { k: 'win', who: 'biscuit', need: 2, p: 0, c: 0, s: 2 }];
  L.reqEvent(d, 'cat', 5, 2);
  eq(d.req.list[0].p, 0, 'cats of another colour do not count');
  L.reqEvent(d, 'cat', 20, 3);
  eq(d.req.list[0].p, 9, 'cats of the asked colour count, capped');
  eq(L.reqClaim(d, 1, T0 + 41 * H), null, 'an unfinished request pays nothing');
  const c0 = d.coins;
  const r = L.reqClaim(d, 0, T0 + 41 * H);
  ok(r && r.who === 'mochi' && d.coins === c0 + r.coins && L.heartsOf(d, 'mochi') === r.hearts, 'a done request pays coins + hearts to its resident');
  eq(d.req.list.length, 1, 'claimed requests leave the list');
  ok(!L.reqTick(d, T0 + 42 * H, res) && L.reqTick(d, T0 + 41 * H + L.REQ_EVERY_H * H, res), 'the open slot fills one interval after the claim');
  d.req.next = T0 + 900 * H;
  L.reqTick(d, T0 + 50 * H, res);
  ok(d.req.next <= T0 + 50 * H + L.REQ_EVERY_H * H, 'rollback: the request clock waits at most one interval');
  // pets, outfits
  const p = fresh();
  const day = E.dayOf(T0);
  eq([L.pet(p, 'mochi', day), L.pet(p, 'mochi', day), L.pet(p, 'mochi', day + 1)], [1, 0, 1], 'one pet heart per resident per day');
  ok(!L.wear(p, 'mochi', 'hat'), 'a locked outfit cannot be worn');
  L.addHearts(p, 'mochi', L.OUTFITS[0].need);
  ok(L.outfitOpen(p, 'mochi', 'hat') && L.wear(p, 'mochi', 'hat') && p.cafe.wear.mochi === 'hat', 'enough hearts unlock and wear the outfit');
  ok(L.wear(p, 'mochi', '') && !p.cafe.wear.mochi, 'outfit off');
  const n = L.nextOutfit(p, ['mochi', 'luna']);
  eq([n.id, n.outfit], ['luna', 'hat'], 'the nearest outfit is the one with the fewest hearts left');
  const g = L.giftOutfit(p, ['mochi', 'luna']);
  ok(g && L.outfitOpen(p, g.id, g.outfit), 'the calendar gift unlocks the nearest outfit');
  eq(E.LOGIN_REWARDS[6].outfit, 1, 'calendar day 7 is an outfit');
}

// ---------------- retention: daily streak chest, Show medals, seasons, Café Rush ----------------
{
  const coins = [1, 2, 3, 4, 5, 6, 7].map((s) => L.streakChest(s).coins);
  ok(coins.every((c, i) => i === 0 || c > coins[i - 1]), 'the streak chest grows every day of the week');
  ok(L.streakChest(3).hint && L.streakChest(5).scoop && L.streakChest(7).scoop && L.streakChest(7).undo, 'boosters on days 3, 5 and 7');
  eq(L.streakChest(30), L.streakChest(7), 'past a week the chest stays at the top');

  const d = fresh();
  const w = 3000;
  let m = L.showMedal(d, w, 'a', false);
  eq([m.bronze, m.gold, m.stamps, m.coins], [true, false, 1, L.SHOW_BRONZE_COINS], 'a clear is bronze: 1 stamp');
  m = L.showMedal(d, w, 'a', false);
  eq([m.stamps, m.coins], [0, 0], 'no double pay for replays');
  m = L.showMedal(d, w, 'a', true);
  eq([m.gold, m.stamps, m.coins, L.medalOf(d, w, 'a')], [true, 1, L.SHOW_GOLD_COINS, 'gold'], 'gold later adds a stamp');
  ok(!L.bothGold(d, w), 'one gold is not both');
  L.showMedal(d, w, 'b', true);
  ok(L.bothGold(d, w), 'gold on both boards');
  eq(L.medalOf(d, w, 'b'), 'gold', 'gold straight away counts as both medals');
  const s = L.seasonOf(w);
  eq(L.stampsOf(d, s), 4, '4 stamps from the week');
  L.addDailyStamp(d, w + 1);
  eq(L.stampsOf(d, s), 5, 'daily puzzles add stamps');
  eq(L.seasonClaimable(d, s), 0, 'not enough for a visitor yet');
  for (let k = 0; k < 3; k++) L.addDailyStamp(d, w + 2);
  eq(L.seasonClaimable(d, s), 1, `${L.VISIT_AT[0]} stamps invite the first visitor`);
  const v1 = L.seasonClaim(d, s, 10);
  ok(v1 && v1.visitor === L.seasonDef(s).visitors[0] && d.vis[v1.visitor], 'the visitor moves in for good');
  eq(L.seasonClaim(d, s, 10), null, 'nothing more to claim');
  // an archived board earns stamps for its own season, not the current one
  L.showMedal(d, w - 4, 'a', true);
  eq([L.stampsOf(d, s), L.stampsOf(d, L.seasonOf(w - 4))], [8, 2], 'archive medals stamp their own season');
  for (let k = 0; k < 12; k++) L.addDailyStamp(d, w);
  ok(L.seasonClaim(d, s, 11).visitor === L.seasonDef(s).visitors[1], `${L.VISIT_AT[1]} stamps invite the second visitor`);
  for (let k = 0; k < 6; k++) L.addDailyStamp(d, w);
  ok(L.seasonClaim(d, s, 12).gift, 'more stamps keep paying season gifts');
  ok(L.seasonDef(s + 3).id === L.seasonDef(s).id && L.seasonDef(s + 1).id !== L.seasonDef(s).id, 'seasons rotate through the data list');
  const lap = fresh();
  lap.vis[L.seasonDef(s).visitors[0]] = 1;
  for (let k = 0; k < 8; k++) L.addDailyStamp(lap, w);
  const c0 = lap.coins;
  const rep = L.seasonClaim(lap, s, 1);
  ok(rep.repeat && lap.coins > c0, 'a visitor already living there turns into a gift');
  ok(L.seasonEndsMs(L.seasonOf(E.weekOf(E.dayOf(T0))), T0) <= 28 * 24 * H, 'a season lasts at most 4 weeks');

  // Café Rush
  const bots = L.rushBots(w, 30);
  eq(bots.length, 19, '19 practice bots');
  eq(JSON.stringify(bots), JSON.stringify(L.rushBots(w, 30)), 'bot times are fixed for the week');
  ok(bots.every((b, i) => i === 0 || b.ms >= bots[i - 1].ms), 'sorted by time');
  ok(bots[0].ms >= 30 * L.RUSH_PER[0] * 1000 && bots[18].ms <= 30 * L.RUSH_PER[1] * 1000 + 4100, 'bot times stay in an honest human range');
  eq([L.rushRank(bots, 1), L.rushRank(bots, 1e9), L.rushRank(bots, 0)], [1, 20, 0], 'ranks: fastest 1st, slowest 20th, no time no rank');
  const r = fresh();
  L.rushRoll(r, w, 30);
  ok(L.rushResult(r, 50000) && !L.rushResult(r, 60000) && L.rushResult(r, 40000) && r.rush.best === 40000, 'the best time of the week is kept');
  ok(L.rushRoll(r, w + 1, 30) && r.rush.pend && r.rush.best === 0, 'a new week turns the best time into a prize');
  const won = L.rushClaim(r);
  ok(won && won.coins > 0 && L.rushClaim(r) === null, 'the prize pays once');
  r.rush.best = 1;
  L.rushRoll(r, w + 2, 30);
  const golds = r.rush.cups.gold || 0;
  const top = L.rushClaim(r);
  ok(top.cup === 'gold' && r.rush.cups.gold === golds + 1, 'first place puts a gold trophy in the café');
  ok(!L.rushRoll(r, w + 1, 30), 'rollback: the Rush week does not go back');

  // wrong device date: live timers in the future are pulled back
  const f = fresh();
  f.jar.t = T0 + 99 * H; f.req.next = T0 + 99 * H; f.rush.week = 99999; f.season.visDay = 99999; f.cafe.petDay.mochi = 99999;
  ok(L.clampAheadLive(f, T0), 'future live stamps are repaired');
  ok(f.jar.t === T0 && f.req.next <= T0 + L.REQ_EVERY_H * H && f.rush.week === E.weekOf(E.dayOf(T0)) && f.cafe.petDay.mochi === E.dayOf(T0), 'each one pulled back');
}

// ---------------- 120-day simulated player: always something to do, the house then Cat Street keep growing ----------------
// A steady player: 10 levels on day 1, 6 a day in the first week, then 4 a day; two visits a day (9:00 and 20:00),
// the daily puzzle 6 days out of 7, both Show boards each week (gold on board A, gold on B every other week), a
// mid Café Rush time (2.4 s per cat), pets 2 residents a day, collects the jar and claims what is ready.
{
  const { readFileSync } = await import('node:fs');
  const { levelKind } = await import('../src/core/generate.js');
  const C = JSON.parse(readFileSync(new URL('../data/cafe.json', import.meta.url), 'utf8'));
  const tasks = C.areas.flatMap((a) => a.tasks);
  // café pacing (as above): the level after which each task is built
  const builtAt = [];
  { let st = 0, i = 0; for (let n = 1; n < 400 && i < tasks.length; n++) { const k = levelKind(n); st += k === 'boss' ? 3 : k === 'hard' ? 2 : 1; if (n + 1 < 4) continue; while (i < tasks.length && st >= tasks[i].cost) { st -= tasks[i].cost; builtAt[i++] = n; } } }
  const houseDone = Math.max(...builtAt);
  const resAt = (lv) => tasks.map((t, i) => (t.resident && builtAt[i] < lv ? t.resident.id : null)).filter(Boolean);
  const d = fresh();
  const start = at(2026, 0, 5, 9); // a Monday
  d.meta.firstOpen = start;
  const days = [];
  let stars = 0;
  const collection = () => ST.streetSights(d) + R.cardsOwned(d) + R.printsHung(d) + (d.drec.got >> 2 ? 1 : 0) + ((d.drec.got >> 3) & 1) + ((d.drec.got >> 4) & 1) + ST.renoCount(d) + L.visitorsOwned(d).length + L.outfitsOwned(d, resAt(d.level)) + E.earnedDecor(d).length + Object.values(d.rush.cups).reduce((a, b) => a + b, 0);
  let doneDay = -1;
  let albumDays = 0, openDays = 0; // R11 ret: visits with an album reward open, and those whose goal was that step
  for (let dd = 0; dd < 120; dd++) {
    const earn = new Set();
    const ticking = new Set();
    const levels = dd === 0 ? 10 : dd < 7 ? 6 : 4;
    for (const hour of [9, 20]) {
      const now = start + dd * 24 * H + (hour - 9) * H;
      const day = E.dayOf(now);
      const week = E.weekOf(day);
      const res = resAt(d.level);
      L.clampAheadLive(d, now);
      E.questsRoll(d, day);
      E.showRoll(d, day);
      if (L.eventsOpen(d)) { if (!d.show.from) d.show.from = week; L.rushRoll(d, week, 30); }
      if (L.jarCollect(d, now, res.length, 0) > 0) earn.add('jar');
      L.reqTick(d, now, res);
      if (E.loginClaim(d, day)) { earn.add('login'); if (E.LOGIN_REWARDS[d.login.idx - 1].outfit && L.giftOutfit(d, res)) earn.add('outfit-gift'); }
      for (const id of res.slice(dd % Math.max(1, res.length)).concat(res).slice(0, 2)) if (L.pet(d, id, day)) earn.add('pet');
      R.jobsToday(d, day, res);
      { // R11 ret: every visit of every day has one concrete next goal the player can act on right now
        const dg = RT.dayGoal(d, { week, day, dailyDone: doneDay === day, res });
        ok(dg && (dg.k !== 'album' || RT.stepOk(d, week, dg.g, doneDay === day)), `day ${dd + 1} ${hour}:00: a concrete next goal reachable now (got ${dg ? dg.k : 'none'})`);
        const an = RT.albumNext(d, week, doneDay === day);
        if (an && an.today && !an.old) { openDays++; ok(dg && dg.k === 'album', `day ${dd + 1} ${hour}:00: an open album reward is the goal (got ${dg && dg.k})`); if (dg && dg.k === 'album') albumDays++; }
        if (an && an.k !== 'hang') { // R11 fix round 2: the album slot of that postcard shows the very same step
          const cs = RT.cardStep(d, week, an.card, doneDay === day);
          ok(cs && cs.k === an.k && cs.w === an.w && cs.left === an.left && cs.b === an.b, `day ${dd + 1} ${hour}:00: album slot and map agree (${an.k} vs ${cs && cs.k})`);
        }
        if (an && an.old && dg && dg.k === 'album') ok(doneDay === day && !d.req.list.length, `day ${dd + 1} ${hour}:00: an old archived board only leads when nothing fresher waits`);
      }
      // play this visit's half of the day's levels
      for (let k = 0; k < levels / 2; k++) {
        d.level++;
        { const k = levelKind(d.level - 1); stars += k === 'boss' ? 3 : k === 'hard' ? 2 : 1; }
        L.reqEvent(d, 'win');
        L.reqEvent(d, 'carrier', 4);
        R.jobsEvent(d, day, res, 'win'); R.jobsEvent(d, day, res, 'carrier', 4); R.jobsEvent(d, day, res, 'cat', 15);
        if (d.level % 3 === 0) R.jobsEvent(d, day, res, 'tidy');
        for (let c = 0; c < 15; c++) L.reqEvent(d, 'cat', 1, (d.level * 7 + c * 3) % 8);
        if (d.level % 3 === 0) L.reqEvent(d, 'tidy');
        E.questEvent(d, 'win', day); E.questEvent(d, 'carrier', day, 4); E.questEvent(d, 'cat', day, 15);
      }
      if (hour === 20 && dd % 7 !== 6 && doneDay !== day) { // the daily puzzle
        doneDay = day;
        d.daily.streak = +d.daily.last === day - 1 ? d.daily.streak + 1 : 1;
        d.daily.last = String(day);
        E.grant(d, L.streakChest(d.daily.streak));
        if (L.eventsOpen(d)) { L.addDailyStamp(d, week); R.popDaily(d, week); }
        L.reqEvent(d, 'daily');
        const ms = R.drecClear(d, day);
        if (ms.length) earn.add('drec');
        earn.add('daily');
      }
      if (hour === 20 && L.eventsOpen(d)) { // the week's Show boards and a Rush run
        if (!L.medalOf(d, week, 'a')) { L.showMedal(d, week, 'a', true); earn.add('show'); }
        if (!L.medalOf(d, week, 'b')) { L.showMedal(d, week, 'b', week % 2 === 0); earn.add('show'); }
        if (L.bothGold(d, week)) d.show.decor[E.themeOf(week).id] = 1;
        if (!d.rush.best) L.rushResult(d, 30 * 2400);
        if (L.rushClaim(d)) earn.add('rush');
        const med = { a: !!L.medalOf(d, week, 'a'), b: !!L.medalOf(d, week, 'b') };
        const pc = R.popClaim(d, week, med);
        if (pc) { earn.add('postcard'); if (pc.page >= 0) { R.hangPrint(d, pc.page, R.printsHung(d) % 5); earn.add('print'); } }
        for (const pw of R.catchWeeks(d, week, L.archiveWeeks(d, week))) { const c = R.catchUp(d, week, pw, { a: !!L.medalOf(d, pw, 'a'), b: !!L.medalOf(d, pw, 'b') }); if (c) { earn.add('postcard'); if (c.page >= 0) R.hangPrint(d, c.page, R.printsHung(d) % 5); break; } }
      }
      for (let s = 0; s < 2; s++) if (R.jobsClaim(d, day, res, s)) earn.add('job');
      for (let i = d.req.list.length - 1; i >= 0; i--) if (L.reqClaim(d, i, now)) earn.add('request');
      // past the finished house the stars go to Cat Street, with a renovation set every few street pieces
      if (d.level > houseDone) {
        d.cafe.stars += stars; stars = 0;
        for (let guard = 0; guard < 50; guard++) {
          const area = C.areas[(d.cafe.street + guard) % (C.areas.length - 1)].id;
          const ti = ST.renoNext(d, area, '');
          if (d.cafe.street % 3 === 2 && ST.renoCount(d) * 3 < d.cafe.street && ti >= 0 && ST.renoBuy(d, area, ti)) { earn.add('build'); continue; }
          if (!ST.streetBuild(d)) break;
          earn.add('build');
        }
      } else stars = 0; // (the house itself is paced by the cafe sim below)
      for (const x of d.quests.list) if (E.questClaim(d, x.id, day)) earn.add('task');
      for (const s of L.seasonsReady(d)) while (L.seasonClaim(d, s, day)) earn.add('season');
      const j = L.jarState(d, now, res.length, 0);
      if (j.on && j.fullMs > 0) ticking.add('jar');
      if (d.req.next > now) ticking.add('request');
    }
    days.push({ dd, level: d.level, earn: [...earn], ticking: [...ticking], items: collection(), street: d.cafe.street });
    { // R11 ret: the day's last visit names what opens tomorrow (the Daily chest or a fresh Daily, and a resident's jobs)
      const day = E.dayOf(start + dd * 24 * H + 11 * H);
      const tm = RT.tomorrow(d, { day, res: resAt(d.level), dailyDone: doneDay === day, streak: d.daily.streak });
      ok(tm.length >= (resAt(d.level).length ? 2 : 1), `day ${dd + 1}: the win card can name tomorrow (got ${tm.map((x) => x.k).join(', ')})`);
    }
  }
  ok(openDays >= 17, `R11 ret: an album reward is open on a visit every event week (${openDays} visits)`);
  console.log(`  R11 ret: the album card was the visit's goal on ${albumDays}/${openDays} visits with an album reward open`);
  // R10: past day 2 a resident job pays every single day (a new cat, a new goal), and the collection (postcards, prints,
  // street sights, Daily keepsakes) gains something new every week, before and after the house is finished
  days.slice(2).forEach((x) => ok(x.earn.includes('job'), `day ${x.dd + 1}: a resident job to finish and claim (got ${x.earn.join(', ')})`));
  for (let i = 14; i < days.length; i++) ok(days[i].items > days[i - 7].items, `a new collectible every week (day ${days[i].dd + 1}: ${days[i - 7].items} -> ${days[i].items})`);
  ok(R.cardsOwned(d) >= 16, `postcards by day 120: ${R.cardsOwned(d)}`);
  ok(d.drec.n >= 90 && R.drecHas(d, 'clock'), `the Daily record reaches its 90-clear clock by day 120 (${d.drec.n})`);
  ok(R.printsHung(d) >= 3, `framed prints hung by day 120: ${R.printsHung(d)}`);
  console.log(`  120-day R10: ${R.cardsOwned(d)} postcards, ${R.printsHung(d)} prints, Daily record ${d.drec.n}, street ${ST.housesDone(d)} units (${ST.curHouse(d).kind} ${ST.curHouse(d).name.en})`);
  days.forEach((x) => ok(x.earn.length >= 3, `day ${x.dd + 1}: at least 3 things to collect or do (got ${x.earn.join(', ') || 'none'})`));
  days.slice(1).forEach((x) => ok(x.ticking.length >= 1, `day ${x.dd + 1}: a timer ticks toward the next reward`));
  const after = days.filter((x) => x.level > houseDone);
  ok(after.length >= 21, `the sim reaches past the finished house (L${houseDone}) with weeks to spare`);
  for (let i = 7; i < after.length; i++) ok(after[i].items > after[i - 7].items, `past L${houseDone}, the collection grows every week (day ${after[i].dd + 1}: ${after[i - 7].items} -> ${after[i].items})`);
  for (let i = 7; i < after.length; i++) ok(after[i].street > after[i - 7].street, `Cat Street gains pieces every week (day ${after[i].dd + 1})`);
  const last = days[days.length - 1];
  ok(ST.housesDone(d) >= 6, `by day 120 the street has a few shops (got ${ST.housesDone(d)})`);
  ok(ST.housesDone(d) <= 40, `the street does not race ahead of the art (got ${ST.housesDone(d)} houses)`);
  console.log(`  120-day street: ${ST.housesDone(d)} units, ${ST.atPiece(d)}/${ST.curHouse(d).tasks.length} of ${ST.curHouse(d).name.en}, ${ST.renoCount(d)} renovation sets`);
  ok(L.visitorsOwned(d).length >= 2, `visiting cats by day 60: ${L.visitorsOwned(d).length}`);
  console.log(`  120-day sim: L${last.level} on day 120 (house done after L${houseDone}); collection ${days[13].items} on day 14 -> ${last.items} on day 120 (visitors ${L.visitorsOwned(d).length}, outfits ${L.outfitsOwned(d, resAt(d.level))}, rosettes ${E.earnedDecor(d).length}, cups ${Object.values(d.rush.cups).reduce((a, b) => a + b, 0)}); requests done ${d.req.done}; jar coins ${d.jar.total}`);
}

// ---------------- Cat Street, renovation, spotlight, Rush bots (round 10) ----------------
{
  const d = fresh();
  eq([ST.house(0).id, ST.house(1).id, ST.house(6).name.en, ST.house(7).name.tr], ['bakery', 'library', 'Bakery 2', 'Kütüphane 2'], 'the street laps forever');
  ok(ST.house(0).tasks.length === ST.HOUSE_TASKS && ST.house(0).tasks.every((x) => x.cost >= 2 && x.cost <= 5 && x.name.en && x.name.tr), 'every street piece has a cost and EN+TR names');
  ok(ST.house(9).tasks[0].cost > ST.house(0).tasks[0].cost, 'later houses cost a bit more');
  d.cafe.stars = 1;
  ok(ST.streetBuild(d) === null && d.cafe.street === 0, 'no stars, no build');
  d.cafe.stars = 100; const c0 = d.coins;
  let r;
  for (let i = 0; i < ST.HOUSE_TASKS; i++) r = ST.streetBuild(d);
  ok(r.houseDone && ST.housesDone(d) === 1 && d.coins === c0 + ST.HOUSE_REWARD.coins, 'the 8th piece finishes the house and pays');
  eq(ST.keepers(d), ['bakery'], 'its shopkeeper moves in');
  const s0 = d.cafe.stars;
  ok(ST.renoBuy(d, 'counter', 1) && d.cafe.style.counter === 'cocoa' && d.cafe.stars === s0 - 5, 'a renovation set is bought and applied');
  ok(!ST.renoBuy(d, 'counter', 1), 'a set is bought once per room');
  eq(ST.renoNext(d, 'counter', 'blossom'), 2, 'the featured (season) set is offered first');
  eq([ST.renoCycle(d, 'counter'), ST.renoCycle(d, 'counter')], ['', 'cocoa'], 'owned sets cycle with "none"');
  eq(L.spotlight({ claim: 'quests', req: 0, jarFull: true, build: true }).k, 'claim', 'spotlight: a claimable reward first');
  eq(L.spotlight({ claim: '', req: 1, jarFull: true, build: true }), { k: 'req', i: 1 }, 'then a finished request');
  eq(L.spotlight({ claim: '', req: -1, jarFull: true, build: true }).k, 'jar', 'then a full jar');
  eq(L.spotlight({ claim: '', req: -1, jarFull: false, build: true }).k, 'build', 'then the next build');
  eq(L.spotlight({ claim: '', req: -1, jarFull: false, build: false }), null, 'else nothing competes with Play');
  const bots = L.rushBots(2900, 20);
  ok(bots[0].ms >= 20 * 1600 && bots.every((b) => b.ms % 100 === 0), `Rush bots: no superhuman time (fastest ${bots[0].ms} ms for 20 cats)`);
  ok(L.rushBots(2900, 0)[0].ms >= 30 * 1600, 'an unknown board size never shows a 2-second bot');
}

// ---------------- R10: street laps past 2, pop-up week + album, Daily record, jobs, friend results ----------------
{
  const d = fresh();
  eq([12, 17, 18, 20, 21].map((k) => ST.house(k).kind), ['up', 'up', 'build', 'build', 'mix'], 'lap 3 upgrades, then new shops, then remix laps');
  eq(ST.house(12).tasks.map((x) => x.cost), [2, 2, 3], 'each shop has 3 visible upgrades at 2, 2 and 3 stars');
  eq([18, 19, 20].map((k) => ST.house(k).id), ['fish', 'post', 'yarn'], 'three new shop kinds with new keepers');
  const sig = new Set();
  for (let k = 21; k < 21 + 9 * 6; k++) { const h = ST.house(k); sig.add(h.id + h.theme.id + h.guest.name); }
  eq(sig.size, 9 * 6, 'six remix laps never repeat a shop + look + guest');
  for (let k = 0; k < 80; k++) if (ST.unitOf(ST.unitStart(k)) !== k) ok(false, `unit ${k} starts where unitOf finds it`);
  d.cafe.street = ST.unitStart(13) + 2; // the Library's bunting and planter are up
  eq(ST.shopLook(d, 'library').ups, ['bunting', 'planter'], 'a shop shows its upgrades so far');
  d.cafe.stars = 3;
  const r = ST.streetBuild(d);
  ok(r.houseDone && r.reward.coins === 120 && ST.shopLook(d, 'library').ups.includes('sign'), 'the reading lamp completes the Library upgrades');
  // pop-up week + album
  const w = 2900;
  ok(!R.popClaim(d, w, { a: true, b: true }), 'two board stamps are not enough');
  ok(R.popDaily(d, w) && !R.popDaily(d, w), "the week's first Daily clear stamps it once");
  const c0 = d.coins;
  const pc = R.popClaim(d, w, { a: true, b: true });
  ok(pc && d.coins === c0 + R.POP_COINS && R.hasCard(d, R.popIndex(w)), '3 stamps: postcard + coins');
  ok(!R.popClaim(d, w, { a: true, b: true }), 'claimed once');
  ok(!R.catchUp(d, w + 1, w - 1, { a: true, b: false }), 'catch-up needs both boards of the past week');
  ok(R.catchUp(d, w + 1, w - 1, { a: true, b: true }) && !R.catchUp(d, w + 1, w - 2, { a: true, b: true }), 'one catch-up postcard a week');
  // R11: the first framed print within four event weeks, whatever week the player starts on (this week's postcard +
  // one catch-up a week from the cards already released, the started page first)
  for (let start = 2900; start < 2924; start++) {
    const f = fresh();
    let got = -1;
    for (let k = 0; k < 6 && got < 0; k++) {
      const wk = start + k;
      f.pop.daily[wk] = 1;
      R.popClaim(f, wk, { a: true, b: true });
      const pw = R.catchWeeks(f, wk, []).find((x) => !R.hasCard(f, R.popIndex(x)));
      if (pw != null) R.catchUp(f, wk, pw, { a: true, b: true });
      if (R.PAGES.some((_, p) => R.pageDone(f, p))) got = k + 1;
    }
    ok(got > 0 && got <= 4, `first framed print by event week 4 (start ${start}: week ${got})`);
  }
  ok(R.catchWeeks(fresh(), 2905, []).every((x) => x < 2905), 'catch-up weeks are already released');
  for (const i of R.pageCards(3)) d.album.cards[i] = 1;
  ok(R.pageDone(d, 3) && R.hangPrint(d, 3, 1) && d.album.hung[1] === 3 && !R.hangPrint(d, 2, 0), 'a full page hangs its print; an open page cannot');
  ok(R.hangPrint(d, 3, 2) && d.album.hung[2] === 3 && d.album.hung[1] === undefined, 'a print hangs in one room at a time');
  eq(R.WEEKS.length, 24, '24 weeks of pop-up data');
  ok(R.WEEKS.every((x) => x.ev.en && x.ev.tr && x.card.en && x.card.tr && x.bg && x.fg), 'every week has EN+TR names and postcard art');
  // Daily record: each date once, milestones
  const e = fresh();
  for (let day = 100; day < 106; day++) R.drecClear(e, day);
  eq(R.drecClear(e, 105), [], 'a date counts once');
  const h0 = e.boosters.hint;
  eq(R.drecClear(e, 107).map((m) => m.at), [7], 'the 7th clear (after a missed day) is the first milestone');
  ok(e.boosters.hint === h0 + 1 && R.drecNext(e).at === 14, '7 clears: a Hint; next 14');
  e.drec.n = 29; R.drecClear(e, 200);
  ok(R.drecHas(e, 'frame') && !R.drecHas(e, 'pennant'), '30 clears unlock the portrait frame');
  // jobs: two a day, the first finished pays, tomorrow names a cat
  const j = fresh();
  const res = ['mochi', 'biscuit', 'luna'];
  const list = R.jobsToday(j, 500, res);
  ok(list.length === 2 && list[0].who !== list[1].who, 'two jobs for two different cats');
  R.jobsEvent(j, 500, res, list[0].k, list[0].need);
  const jc = j.coins;
  ok(R.jobsClaim(j, 500, res, 0) && j.coins === jc + 30 && j.cafe.hearts[list[0].who] === 1, 'the first finished job pays 30 coins + 1 heart');
  R.jobsEvent(j, 500, res, list[1].k, list[1].need);
  ok(!R.jobsClaim(j, 500, res, 1), 'only the first job pays');
  ok(R.jobsToday(j, 501, res)[0].p === 0 && R.jobsTomorrow(500, res) === R.jobsToday(j, 501, res)[0].who, 'a new day resets the jobs; tomorrow names the cat');
  const kinds = new Set(); for (let day = 0; day < 14; day++) R.jobsToday(j, day, res).forEach((x) => kinds.add(x.k));
  eq([...kinds].sort(), ['carrier', 'cat', 'tidy', 'win'], 'the 14-day rotation uses the win, cat, carrier and tidy hooks');
  // friend results: keep the latest 12, one entry per result id, mark replies to my own dares
  const f = fresh();
  R.noteSent(f, 'abc123');
  ok(R.frImport(f, { i: 'r1', r: 'abc123', pg: 3, nm: 'Ana', n: 13, b: 5, k: 'l', m: 'chain', g: 3 }, 1).mine, 'a reply to my dare is mine');
  R.frImport(f, { i: 'r1', r: 'abc123', pg: 3, nm: 'Ana', n: 13, b: 5, k: 'l', m: 'chain', g: 3 }, 2);
  eq(f.fr.list.length, 1, 'reopening the same reply keeps one entry');
  for (let k = 0; k < 20; k++) R.frImport(f, { i: 'x' + k, nm: 'B', n: 2, b: 5, k: 'l', m: 'seats', g: 1 }, 3 + k);
  ok(f.fr.list.length === 12 && f.fr.list[0].id === 'x19', 'the latest 12 results, newest first');
}

// ---------------- wrong device date: stamps in the future are pulled back to today ----------------
{
  const d = fresh();
  const day = E.dayOf(T0);
  d.login.last = day + 900;
  d.quests.day = day + 900;
  d.show.week = E.weekOf(day + 900);
  d.daily.last = String(day + 900);
  d.daily.doneDay = String(day + 900);
  ok(E.clampAhead(d, day), 'future stamps are repaired');
  eq([d.login.last, d.quests.day, d.show.week, d.daily.last, d.daily.doneDay], [day, day, E.weekOf(day), String(day), String(day)], 'each stamp is pulled back to today');
  ok(E.loginState(d, day + 1).avail && E.questsRoll(d, day + 1) && E.showRoll(d, day + 7), 'tomorrow the calendar, tasks and show roll again');
  ok(!E.clampAhead(d, day + 7), 'nothing to repair on a sane save');
}

// ---------------- IAP ----------------
{
  const d = fresh();
  const c0 = d.coins;
  ok(applyPurchase(d, 'coins500', 'tx1') && d.coins === c0 + 500, 'coin pack grants');
  ok(!applyPurchase(d, 'coins500', 'tx1') && d.coins === c0 + 500, 'a replayed transaction does not pay twice');
  ok(applyPurchase(d, 'coins500', 'tx2') && d.coins === c0 + 1000, 'a new transaction does');
  ok(applyPurchase(d, 'scoop10', 'tx3') && d.boosters.scoop === 12, 'scoop pack grants');
  ok(!d.ads.removeAds, 'no ads flag still off');
  ok(applyPurchase(d, 'starter', 'tx4') && d.ads.removeAds && d.iap.owned.starter && d.coins === c0 + 1000 + 1200 && d.boosters.scoop === 15, 'starter: coins, 3 scoops, No Ads');
  ok(!applyPurchase(d, 'starter', 'tx5'), 'one-time product cannot be bought twice');
  ok(!applyPurchase(d, 'nope', 't'), 'unknown product refused');
  const n = fresh();
  ok(applyPurchase(n, 'noads', 'a') && n.ads.removeAds && !applyPurchase(n, 'noads', 'b'), 'No Ads flag, once');
  eq(Object.keys(PRODUCTS).length, 7, 'seven products');
  const many = fresh();
  for (let i = 0; i < 40; i++) applyPurchase(many, 'coins500', 'x' + i);
  ok(many.iap.tx.length <= 30, 'receipt list stays bounded');
  // starter offer: once, after level 10
  const s = fresh();
  s.level = 10;
  ok(!E.starterDue(s), 'not at level 10 itself');
  s.level = 11;
  ok(E.starterDue(s), 'due after clearing level 10');
  s.shop.starterShown = true;
  ok(!E.starterDue(s), 'shown once only');
  const b = fresh();
  b.level = 12;
  b.iap.owned.noads = 1;
  ok(!E.starterDue(b), 'never offered to a No Ads owner');
}

// ---------------- interstitial rules ----------------
{
  const d = fresh();
  d.meta.firstOpen = T0 - 3 * H;
  ok(!E.interstitialOk(d, 7, T0), 'none before level 8');
  ok(E.interstitialOk(d, 8, T0), 'allowed from level 8');
  d.ads.lastInterstitial = T0 - 2 * MIN;
  ok(!E.interstitialOk(d, 9, T0), 'not within 3 min of the last one');
  ok(E.interstitialOk(d, 9, T0 + 2 * MIN), 'allowed once 3 min passed');
  d.ads.lastInterstitial = 0;
  d.meta.firstOpen = T0 - 4 * MIN;
  ok(!E.interstitialOk(d, 20, T0), 'none in the first 5 minutes');
  ok(E.interstitialOk(d, 20, T0 + 2 * MIN), 'allowed after the first 5 minutes');
  d.ads.removeAds = true;
  ok(!E.interstitialOk(d, 20, T0 + 2 * H), 'never with No Ads');
}

// ---------------- save migration ----------------
{
  const load = async (raw) => {
    stored.v = raw === undefined ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);
    const mod = await import('../src/kit/save.js?m=' + Math.random());
    return mod.save.data;
  };
  let d = await load({ v: 1, level: 35, coins: 120, settings: { sound: false } });
  eq([d.v, d.level, d.coins, d.settings.sound], [9, 35, 120, false], 'MVP save keeps level, coins and settings');
  eq([d.lives.n, d.purr.n, d.quests.list.length, d.login.last, Object.keys(d.show.marks).length], [5, 0, 0, 0, 0], 'MVP save gets the new systems at defaults');
  eq(d.meta.firstOpen, 0, 'an old save never counts as a fresh install (no first-5-minutes ad block)');
  ok(d.cafe.stars === 12, 'the MVP cafe head start is still applied');
  d = await load({ v: 3, level: 9, coins: 5, cafe: { stars: 1, built: { a: 1 } }, boosters: { hint: 1, scoop: 0, undo: 0 }, ads: { removeAds: true } });
  eq([d.v, d.cafe.built.a, d.boosters.hint, d.ads.removeAds], [9, 1, 1, true], 'v3 save keeps the cafe, boosters and the ads flag');
  d = await load({ v: 4, lives: { n: 99, t: -5 }, purr: { n: -2, pend: 7 }, quests: { day: 'x', list: [1, { id: 'wins', p: 'a', c: 5 }], chest: 3 }, login: { last: 5, idx: 99 }, show: { week: 3, ribbons: -1, claimed: [1, 'z', 99, 2], decor: [] }, iap: { owned: 5, tx: [1, 'ok'] }, clock: { max: 'q' }, meta: { firstOpen: 'x', funnel: 3 } });
  eq([d.lives.n, d.lives.t, d.purr.n, d.purr.pend, d.quests.day, d.quests.chest], [5, 0, 0, 0, 0, 1], 'corrupt economy fields are repaired');
  eq(d.quests.list, [{ id: 'wins', p: 0, c: 1 }], 'task list is repaired');
  eq([d.login.idx, d.show.week, d.iap.tx, d.clock.max, d.meta.firstOpen], [0, 3, ['ok'], 0, 0], 'login, show, iap, clock and meta are repaired');
  d = await load({ v: 5, level: 20, cafe: { stars: 2, built: { counter_counter: 1, counter_lamps: 1, counter_plant: 1, window_bookshelf: 1 } } });
  eq([d.cafe.built.counter_pastry, d.cafe.built.counter_chalkboard, d.cafe.built.window_plants, d.cafe.built.window_rug, d.cafe.stars], [1, 1, 1, undefined, 2], 'v5 save keeps its residents after they move to earlier tasks');
  d = await load({ v: 7, level: 30, show: { week: 2900, ch: 3, best: 2, mark: 2, markWeek: 2900, decor: { beach_day: 1 } } });
  eq([d.v, d.show.marks['2900a'], d.show.ch, d.show.decor.beach_day, d.jar.t, d.req.list.length, d.rush.best, d.settings.notify], [9, 3, undefined, 1, 0, 0, 0, false], 'v7 save: this week Show board medal carries over, retention systems at defaults, reminders off');
  d = await load({ v: 8, show: { marks: { '12a': 9, x: 1, '13b': 2 }, goals: { '12a': { kind: 'seats', n: 2 }, '12b': { kind: 'zz', n: 1 } } }, req: { list: [{ k: 'win', who: 'mochi', need: 2, p: 99, c: 77 }, 5] }, cafe: { hearts: { mochi: -3, luna: 4 }, wear: { mochi: 'tiara', luna: 'hat' } }, rush: { pend: { rank: 'x' }, cups: { gold: 2 } }, vis: { maple: 3 } });
  eq([d.show.marks, Object.keys(d.show.goals), d.req.list, d.cafe.hearts, d.cafe.wear, d.rush.pend, d.rush.cups, d.vis], [{ '13b': 2 }, ['12a'], [{ k: 'win', who: 'mochi', need: 2, p: 2, c: 0, s: 0 }], { luna: 4 }, { luna: 'hat' }, null, { gold: 2 }, { maple: 3 }], 'corrupt v8 retention fields are repaired, good ones kept');
  d = await load('{not json');
  ok(d.v === 9 && d.meta.firstOpen > 0 && d.lives.n === 5, 'corrupt JSON gives a fresh save stamped as a new install');
  d = await load(undefined);
  ok(d.meta.firstOpen > 0, 'a missing save is a new install');
}

// ---------------- café star pacing (sim of a player who wins every level first try) ----------------
// A first clear pays its stars (normal 1, hard 2, boss 3) into the café; the hub opens at L4 with the L1-3 stars banked
// (CAFE_FROM in main.js) and the player builds the next task as soon as it is affordable.
{
  const { readFileSync } = await import('node:fs');
  const { levelKind } = await import('../src/core/generate.js');
  const C = JSON.parse(readFileSync(new URL('../data/cafe.json', import.meta.url), 'utf8'));
  const tasks = C.areas.flatMap((a, ai) => a.tasks.map((t) => ({ ...t, ai })));
  ok(tasks.every((t) => t.cost >= 1 && t.cost <= 3), 'every café task costs 1-3 stars');
  let st = 0;
  let i = 0;
  const builtAt = [];
  for (let n = 1; n < 400 && i < tasks.length; n++) {
    const k = levelKind(n);
    st += k === 'boss' ? 3 : k === 'hard' ? 2 : 1;
    if (n + 1 < 4) continue; // the café opens once level 4 is reached
    while (i < tasks.length && st >= tasks[i].cost) { st -= tasks[i].cost; builtAt[i++] = n; }
  }
  eq(i, tasks.length, 'every café task gets built');
  const arrive = Object.fromEntries(tasks.map((t, k) => [t.resident && t.resident.id, builtAt[k]]).filter((x) => x[0]));
  ok(arrive.mochi <= 5, `Mochi moves in by L5 (got after L${arrive.mochi})`);
  for (let k = 1; k < builtAt.length; k++) ok(builtAt[k] - builtAt[k - 1] <= 3, `no decor takes more than 3 levels (${tasks[k].id}: ${builtAt[k] - builtAt[k - 1]})`);
  const areaEnd = C.areas.map((_, ai) => Math.max(...builtAt.filter((_, k) => tasks[k].ai === ai)));
  areaEnd.forEach((end, ai) => {
    const len = end - (ai ? areaEnd[ai - 1] : 0);
    ok(ai === 0 ? len <= 13 : len >= 10 && len <= 15, `area ${C.areas[ai].id} takes ${len} levels (want ${ai ? '10-15' : '<= 13'})`);
  });
  console.log('  café pacing: residents after ' + Object.entries(arrive).map(([r, n]) => `L${n} ${r}`).join(', ') + '; areas done after L' + areaEnd.join(', L'));
}

// ---------------- adoption orders (src/game/orders.js, data/orders.js) ----------------
// every level is an order from a Cat Street keeper, seeded by the level number; a first clear adopts one named cat into
// the shop's set (SET_SIZE), a full set pays SET_REWARDS; Urgent (hard) / VIP (boss) orders add a first-clear bonus
{
  const OR = await import('../src/game/orders.js');
  const { levelKind } = await import('../src/core/generate.js');
  eq(OR.orderOf(37), OR.orderOf(37), 'an order is deterministic');
  eq([OR.shopOf(1), OR.shopOf(10), OR.shopOf(11), OR.shopOf(91)], ['bakery', 'bakery', 'library', 'bakery'], 'a chapter of 10 levels per shop, in street order, then a new round');
  ok(OR.SHOP_ORDER.every((s) => OR.CUSTOMERS[s] && OR.keeperOf(s) && OR.CUSTOMERS[s].why.length && OR.CUSTOMERS[s].to.tr && OR.CUSTOMERS[s].at.tr), 'every shop has a keeper and EN/TR order words');
  let hardN = 0, superN = 0, bonus = 0;
  for (let n = 1; n <= 400; n++) {
    const k = levelKind(n);
    const o = OR.orderOf(n, k);
    if (k === 'hard') { hardN++; ok(o.kind === 'urgent' && o.bonus === OR.BONUS.hard, `L${n} hard = Urgent order`); }
    if (k === 'boss') { superN++; ok(o.kind === 'vip' && o.bonus === OR.BONUS.boss, `L${n} boss = VIP order`); }
    if (k === 'normal') ok(o.kind === 'normal' && o.bonus === 0, `L${n} normal order has no bonus`);
    bonus += OR.payParts(n, k).reduce((t, p) => t + p.n, 0);
    ok(o.name >= 0 && o.name < OR.CAT_NAMES.length, `L${n} names a cat`);
  }
  ok(hardN > 20 && superN > 5, `orders: ${hardN} Urgent + ${superN} VIP in 400 levels`);
  const d = fresh();
  const c0 = d.coins, s0 = d.boosters.scoop;
  let sets = 0, setCoins = 0;
  for (let n = 1; n <= 100; n++) {
    const a = OR.adopt(d, n, 12, n % 8);
    ok(a && a.shop === OR.shopOf(n), `L${n} adopts into its shop`);
    if (a && a.reward) { sets++; setCoins += a.reward.coins || 0; }
  }
  eq(OR.adopt(d, 50, 12, 0), null, 'a level adopts once (replays never adopt again)');
  eq(sets, 20, '100 orders fill 20 sets of 5 (2 per chapter)');
  eq(d.coins - c0, setCoins, 'set rewards pay the listed coins');
  eq(d.boosters.scoop - s0, 10, 'every second set pays a Scoop');
  eq(OR.totalAdopted(d), 100, 'one named cat per order');
  eq(d.orders.shops.bakery.cats, 12 * 20, 'cats delivered add up per shop (bakery: chapters 1 and 10)');
  eq(OR.lively(d, 'bakery'), 3, 'a busy shop shows 3 doorstep cats');
  eq(OR.lively(d, 'yarn'), 2, 'one chapter of deliveries shows 2');
  eq(OR.albumShops(d, 101), OR.SHOP_ORDER, 'every served shop has an album page');
  const per = (setCoins + (bonus * 100) / 400) / 100; // coins per level from orders (sets + the average Urgent/VIP bonus)
  ok(per <= 20, `orders add at most 20 coins a level (got ${per.toFixed(1)})`);
  // a hand-edited / old save: a broken orders state is repaired, not thrown on
  const d2 = fresh();
  d2.orders = { last: 'x', shops: { bakery: { cats: -3, cur: 5 } } };
  ok(OR.adopt(d2, 1, 9, 2) && d2.orders.shops.bakery.cats === 9 && d2.orders.shops.bakery.cur.length === 1, 'a broken orders save is repaired');
  console.log(`  orders: ${hardN} Urgent / ${superN} VIP in 400 levels, +${bonus} bonus coins; sets pay ${(setCoins / 100).toFixed(1)} coins a level`);
}
// ---------------- R10 shop: packs, deal of the day, ad gifts, Extra Cushion, cosmetics, 120-day coin sinks ----------------
{
  const SH = await import('../src/game/shop.js');
  const { levelKind } = await import('../src/core/generate.js');
  const day0 = E.dayOf(T0);
  // booster packs: the big pack is cheaper per piece than the small one, both cheaper than paying in a level, never a giveaway
  for (const k of SH.BOOSTERS) {
    const per = SH.PACKS.map((p) => SH.packPrice(k, p) / p.n);
    ok(per[0] < SH.UNIT[k] && per[1] < per[0] && per[1] >= SH.UNIT[k] * 0.6, `${k} packs: ${per.map((x) => x.toFixed(1)).join(' / ')} per piece vs ${SH.UNIT[k]}`);
  }
  // deal of the day: deterministic, never the same bundle two days running, every bundle shows up, a real but sane discount
  const seen = new Set();
  for (let dd = 0; dd < 400; dd++) {
    const a = SH.dealOf(day0 + dd);
    ok(JSON.stringify(a) === JSON.stringify(SH.dealOf(day0 + dd)), 'the deal is the same all day');
    if (dd) ok(SH.dealIndex(day0 + dd) !== SH.dealIndex(day0 + dd - 1), `deal repeats on day ${dd}`);
    ok(a.price % 5 === 0 && a.price < a.was && a.price >= a.was * 0.45 && a.price <= a.was * 0.75, `deal ${a.id}: ${a.price} for ${a.was}`);
    if (dd < 60) seen.add(a.id);
  }
  eq(seen.size, SH.DEALS.length, 'every deal shows up within 60 days');
  {
    const d = fresh();
    const x = SH.dealOf(day0);
    d.coins = x.price - 1;
    ok(!SH.dealBuy(d, day0) && d.coins === x.price - 1, 'deal: no coins, no sale');
    d.coins = x.price + 10;
    const b0 = { ...d.boosters };
    ok(SH.dealBuy(d, day0) && d.coins === 10, 'deal bought');
    for (const [k, n] of Object.entries(x.items)) ok(SH.have(d, k) === (k === 'cushion' ? n : b0[k] + n), `deal pays ${k} x${n}`);
    d.coins = 9999;
    ok(!SH.dealBuy(d, day0) && d.coins === 9999, 'deal: once a day');
    ok(!!SH.dealBuy(d, day0 + 1), 'deal: a new one tomorrow');
  }
  // rewarded-ad gifts: capped per day, refilled the next day
  {
    const d = fresh();
    const c0 = d.coins;
    const G = SH.AD_GIFTS.find((g) => g.id === 'coins');
    let n = 0;
    while (SH.adClaim(d, 'coins', day0)) n++;
    eq(n, G.per, 'ad coins: daily cap');
    eq(d.coins, c0 + n * G.give.coins, 'ad coins paid');
    ok(SH.adClaim(d, 'hint', day0) && !SH.adClaim(d, 'hint', day0), 'ad hint: once a day');
    ok(SH.adLeft(d, 'coins', day0 + 1) === G.per && !!SH.adClaim(d, 'coins', day0 + 1), 'ad gifts refill the next day');
  }
  // Extra Cushion: one is spent on the next new level and kept for its retries; replays and empty stock take none
  {
    const d = fresh();
    d.level = 20;
    ok(!SH.cushionAt(d, 20), 'no cushion in stock: no seat');
    d.coins = 1000;
    ok(SH.buyPack(d, 'cushion', 0) === SH.packPrice('cushion', SH.PACKS[0]) && SH.have(d, 'cushion') === 3, 'cushion pack bought');
    ok(SH.cushionAt(d, 20) && SH.have(d, 'cushion') === 2, 'the next level takes one');
    ok(SH.cushionAt(d, 20) && SH.have(d, 'cushion') === 2, 'a retry keeps the same seat for free');
    ok(!SH.cushionAt(d, 7) && SH.have(d, 'cushion') === 2, 'an old level replay takes none');
    d.level = 21;
    ok(SH.cushionAt(d, 21) && SH.have(d, 'cushion') === 1, 'the level after takes the next');
  }
  // cosmetics: buy once, it goes on at once; switch between owned ones; a broken save is repaired
  {
    const d = fresh();
    d.coins = 500;
    eq([SH.equipped(d, 'hat'), SH.equipped(d, 'car'), SH.equipped(d, 'room')], ['hat_none', 'car_none', 'room_sunny'], 'the free looks are on by default');
    ok(!SH.cosBuy(d, 'room_night') && d.coins === 500, 'cosmetic: no coins, no sale');
    ok(SH.cosBuy(d, 'hat_bow') === 300 && d.coins === 200 && SH.equipped(d, 'hat') === 'hat_bow', 'a bought outfit goes on');
    ok(!SH.cosBuy(d, 'hat_bow') && d.coins === 200, 'never paid twice');
    ok(SH.equip(d, 'hat_none') && SH.equipped(d, 'hat') === 'hat_none' && SH.equip(d, 'hat_bow'), 'switch between owned looks');
    ok(!SH.equip(d, 'hat_crown') && SH.equipped(d, 'hat') === 'hat_bow', 'an unowned look cannot go on');
    d.shop.eq.room = 'room_night'; d.shop.own.bogus = 1; d.shop.cush = -3;
    SH.ensure(d);
    ok(d.shop.eq.room === 'room_sunny' && !d.shop.own.bogus && d.shop.cush === 0, 'ensure() repairs a broken shop save');
  }
  // the shop keys survive a reload (save.js keeps d.shop's extra keys)
  {
    const d = fresh();
    d.coins = 2000; d.level = 9;
    SH.cosBuy(d, 'car_stars'); SH.buyPack(d, 'cushion', 0); SH.dealBuy(d, day0);
    save.commit();
    const mod = await import('../src/kit/save.js?shop=' + Math.random());
    const r = mod.save.data;
    ok(r.shop.own.car_stars === 1 && r.shop.eq.car === 'car_stars' && r.shop.cush >= 3 && r.shop.deal.day === day0, `shop state survives a reload: ${JSON.stringify(r.shop)}`);
    ok(r.shop.starterShown === false && r.shop.offerDay === -1, 'the older shop keys keep their defaults');
  }
  // 120 days of coins: a steady player (10 levels on day 1, 6 a day in week 1, then 4; tasks, chest, login), with and
  // without the ad gifts, spending a quarter of the day's pay in levels, buying the deal of the day and the cosmetics in
  // price order while a 300-coin reserve stays. The cosmetics are a real sink (not all in the first two weeks) yet a
  // steady player owns them all by day 120; the ad gifts never become the main income.
  for (const adsOn of [false, true]) {
    const d = fresh();
    d.level = 1;
    let income = 0, adIncome = 0, spent = 0, deals = 0, allAt = -1, firstCos = -1;
    const order = SH.COSMETICS.filter((x) => x.cost).sort((a, b) => a.cost - b.cost);
    for (let dd = 0; dd < 120; dd++) {
      const dy = day0 + dd;
      const c0 = d.coins;
      for (let k = 0; k < (dd === 0 ? 10 : dd < 7 ? 6 : 4); k++) {
        const kind = levelKind(d.level);
        d.coins += 20 + Math.floor(d.level / 5) + 5 + (kind === 'boss' ? 20 : kind === 'hard' ? 10 : 0) + Math.min(15, Math.floor(dd / 6)); // base, tidy, hard bonus, café perks / love
        d.level++;
      }
      d.coins += 15 + 15 + 20 + E.CHEST.coins + (E.LOGIN_REWARDS[dd % 7].coins || 0); // three daily tasks, the chest, the login day
      income += d.coins - c0;
      const lv = Math.round((d.coins - c0) * 0.25); d.coins -= lv; spent += lv; // boosters and seats bought in levels
      if (adsOn) { const a0 = d.coins; while (SH.adClaim(d, 'coins', dy)); adIncome += d.coins - a0; }
      for (const it of order) if (!SH.owns(d, it.id) && d.coins - it.cost >= 300) { spent += SH.cosBuy(d, it.id); if (firstCos < 0) firstCos = dd; }
      const x = SH.dealOf(dy);
      if (d.coins - x.price >= 300 && SH.dealBuy(d, dy)) { deals++; spent += x.price; }
      if (allAt < 0 && order.every((it) => SH.owns(d, it.id))) allAt = dd;
      ok(d.coins >= 0, `day ${dd + 1}: coins never go negative`);
    }
    const perDay = income / 120;
    const tag = adsOn ? 'ads' : 'no ads';
    ok(SH.cosTotal() >= 5000, `the cosmetics are a real sink (${SH.cosTotal()} coins)`);
    ok(allAt > 14, `${tag}: not every cosmetic in the first two weeks (all on day ${allAt + 1})`);
    ok(allAt >= 0 && allAt < 120, `${tag}: a steady player owns every cosmetic by day 120 (day ${allAt + 1})`);
    ok(firstCos >= 0 && firstCos <= 7, `${tag}: a first cosmetic within the first week (day ${firstCos + 1})`);
    ok(adIncome <= income * 0.35, `${tag}: ad gifts stay a side income (${adIncome} vs ${income})`);
    ok(SH.DEALS.every((_, i) => SH.dealOf(day0 + i).price <= perDay * 1.5), `a deal costs at most 1.5 days of play (${Math.round(perDay)} coins a day)`);
    ok(deals >= 30, `${tag}: the deal of the day is bought regularly (${deals} of 120 days)`);
    console.log(`  shop 120 days (${adsOn ? 'with' : 'no'} ad gifts): ${Math.round(perDay)} coins/day from play, +${Math.round(adIncome / 120)}/day from ads, ${deals} deals, all cosmetics on day ${allAt + 1}, spent ${spent}, left ${d.coins}`);
  }
}

// ---------------- R11 ret: the nearest album reward, step by step ----------------
{
  const d = fresh();
  d.level = 30;
  const wk = 2910;
  ok(RT.albumNext(fresh(), wk, false) === null, 'no album card before the events open');
  const card = R.popIndex(wk);
  let g = RT.albumNext(d, wk, false);
  eq([g.k, g.b, g.card, g.left, g.unit], ['board', 'a', card, 3, 'stamp'], 'a fresh week: board A of the Show, 3 stamps left');
  { // R11 fix round 1: an archived week jumps ahead of this week's postcard only once it is one clear from its own
    const d3 = JSON.parse(JSON.stringify(d));
    d3.album.cards[card] = 1;
    const ga = RT.albumNext(d3, wk, false);
    ok(ga && ga.arch && ga.left === 2 && ga.old, `an archived week two boards away is an old step (${ga && ga.left})`);
    const d4 = JSON.parse(JSON.stringify(d));
    L.showMedal(d4, ga.w, 'a', false);
    const gp = RT.albumNext(d4, wk, false);
    ok(gp && gp.arch && gp.w === ga.w && gp.promo && gp.left === 1, `one board from its postcard, the archived week leads (${gp && gp.k} w${gp && gp.w})`);
    eq(RT.dayGoal(d3, { week: wk, day: wk * 7, dailyDone: false, res: [] }).k, 'daily', 'an old archived board waits behind the Daily');
  }
  L.showMedal(d, wk, 'a', false);
  g = RT.albumNext(d, wk, false);
  eq([g.k, g.b, g.left], ['board', 'b', 2], 'then board B');
  L.showMedal(d, wk, 'b', false);
  g = RT.albumNext(d, wk, false);
  eq([g.k, g.left, g.today], ['daily', 1, true], "then 1 stamp: today's Daily");
  const gd = RT.albumNext(d, wk, true);
  ok(!(gd.k === 'daily' && gd.today), 'a Daily already done today is not a step for today');
  R.popDaily(d, wk);
  g = RT.albumNext(d, wk, true);
  eq(g.k, 'claim', 'three stamps: claim');
  ok(RT.stepOk(d, wk, g, true), 'the claim works');
  R.popClaim(d, wk, { a: true, b: true });
  g = RT.albumNext(d, wk, true);
  ok(g && g.arch && g.k === 'board' && g.w < wk && R.pageOf(g.card) === R.pageOf(card), `after the claim: a catch-up board on the same page (${g && g.k} w${g && g.w})`);
  for (const k of ['a', 'b']) L.showMedal(d, g.w, k, false);
  const g2 = RT.albumNext(d, wk, true);
  eq([g2.k, g2.w], ['catch', g.w], 'both archived boards cleared: add it');
  eq(RT.cardStep(d, wk, g2.card, true).k, 'catch', 'the album slot says the same: add it');
  R.catchUp(d, wk, g2.w, { a: true, b: true });
  const g3 = RT.albumNext(d, wk, true);
  ok(!g3 || !g3.arch, 'one catch-up a week: no second archived card this week');
  { // R11 fix round 2: an archived card past this week's catch-up: its slot still names its board, or the date it opens
    const aw = R.catchWeeks(d, wk, L.archiveWeeks(d, wk)).find((x) => x < wk && !R.hasCard(d, R.popIndex(x)));
    if (aw != null) {
      const s1 = RT.cardStep(d, wk, R.popIndex(aw), true);
      ok(s1 && s1.k === 'board' && s1.w === aw, `archived slot after the catch-up: its next board (${s1 && s1.k})`);
      for (const k of ['a', 'b']) L.showMedal(d, aw, k, false);
      eq(RT.cardStep(d, wk, R.popIndex(aw), true).k, 'wait', 'both cleared, catch-up used: the slot waits for next week');
    }
    eq(RT.cardStep(d, wk, card, true), null, 'an owned postcard has no step');
  }
  // a full page: the print waits, then it is hung
  const p = R.pageOf(card);
  for (const i of R.pageCards(p)) d.album.cards[i] = 1;
  RT.setHang(d, p);
  eq(RT.albumNext(d, wk, true).k, 'hang', 'a finished page: hang the print first');
  R.hangPrint(d, p, 0);
  ok(RT.hangPending(d) < 0 && RT.albumNext(d, wk, true)?.k !== 'hang', 'a hung print stops waiting');
  // the win day counter and tomorrow
  eq([RT.winDay(d, 5), RT.winDay(d, 5), RT.winDay(d, 5), RT.winDay(d, 6)], [1, 2, 3, 1], 'wins counted per day');
  const sun = wk * 7 + 3; // the last day of a week: tomorrow is a new postcard week
  ok(E.weekOf(sun) !== E.weekOf(sun + 1), 'test day is a Sunday');
  const tm = RT.tomorrow(d, { day: sun, res: ['mochi'], dailyDone: true, streak: 4 });
  ok(tm.some((x) => x.k === 'week') && tm.some((x) => x.k === 'chest' && x.n === 5) && tm.some((x) => x.k === 'job'), `tomorrow on a Sunday: ${tm.map((x) => x.k).join(', ')}`);
}

// ---------------- R11 fix round 1: the second resident's named ask bridges the wait for the third ----------------
{
  const d = fresh();
  const t0 = Date.UTC(2026, 10, 2, 9);
  L.reqTick(d, t0, ['mochi']);
  ok(!d.req.list.some((x) => x.need === 3 && x.k === 'win'), 'one resident: no bridge ask');
  d.req.list = [];
  L.reqTick(d, t0 + 1000, ['mochi', 'biscuit']);
  const br = d.req.list.find((x) => x.k === 'win' && x.who === 'biscuit');
  ok(br && br.need === 3 && d.req.fresh === 'biscuit', `two residents: the newest asks for three wins at once (${JSON.stringify(d.req.list)})`);
  d.req.list = d.req.list.filter((x) => x !== br);
  L.reqTick(d, t0 + 2000, ['mochi', 'biscuit']);
  ok(!d.req.list.some((x) => x.k === 'win' && x.need === 3), 'the bridge ask comes once');
}

// ---------------- R11 boss lane: boss chests, milestone chests, the flame streak; 120 days with chests on ----------------
{
  const BS = await import('../src/game/boss.js');
  const SH = await import('../src/game/shop.js');
  const { levelKind } = await import('../src/core/generate.js');
  // rules: what each first clear queues, replays queue nothing, a continue keeps the flame, a given-up loss puts it out
  {
    const d = fresh();
    const got = {};
    for (let n = 1; n <= 40; n++) got[n] = BS.onClear(d, n).map((e) => e.t).join('+');
    eq([got[5], got[10], got[15], got[20], got[40]], ['wood', 'wood', 'wood+streak', 'boss', 'boss'], 'chests on 5 / 10 / 15 / 20 / 40');
    eq(BS.onClear(d, 12), [], 'a replayed level queues nothing');
    ok(BS.state(d).beat === 2, 'two bosses beaten');
    const f = fresh();
    BS.onClear(f, 1); BS.onClear(f, 2);
    BS.markFail(f, 3);
    const g = BS.onClear(f, 3); // lost, continued, won
    ok(g.some((e) => e.t === 'streak'), 'a continue keeps the flame: the 3rd win pays the streak chest');
    BS.onClear(f, 4);
    BS.markFail(f, 5);
    ok(BS.startAttempt(f) && BS.flame(f) === 0, 'a loss given up (a new attempt) puts the flame out');
    ok(!BS.startAttempt(f), 'only once');
  }
  // boss chests: tier fixed per boss index, the first boss always rare (a cosmetic), loot deterministic
  {
    eq(BS.tierOf(0), 'rare', 'the first boss chest is rare');
    const tiers = Array.from({ length: 60 }, (_, i) => BS.tierOf(i));
    ok(tiers.every((x, i) => !i || !(x === 'common' && tiers[i - 1] === 'common')), 'never two common boss chests in a row');
    ok(tiers.filter((x) => x === 'epic').length >= 8, 'an epic every 6 bosses');
    const a = BS.lootOf(fresh(), { t: 'boss', n: 20, i: 0 });
    const b = BS.lootOf(fresh(), { t: 'boss', n: 20, i: 0 });
    eq(a, b, 'the same boss chest holds the same loot');
    ok(a.tier === 'rare' && !!a.cos && SH.item(a.cos).kind !== 'room', `the first boss gives an outfit or carrier skin (${a.cos})`);
    const e = BS.lootOf(fresh(), { t: 'boss', n: 100, i: 4 });
    ok(e.tier === 'epic' && SH.item(e.cos).kind === 'room', `an epic boss chest gives a play room (${e.cos})`);
    const d = fresh();
    SH.ensure(d);
    for (const x of SH.COSMETICS) if (x.cost) d.shop.own[x.id] = 1;
    const c = BS.lootOf(d, { t: 'boss', n: 20, i: 0 });
    ok(!c.cos && c.coins > a.coins, 'everything owned: a rare chest pays coins instead');
    // the queue pays on open and survives a reload
    const q = fresh();
    q.level = 21;
    BS.onClear(q, 20);
    save.commit();
    const mod = await import('../src/kit/save.js?boss=' + Math.random());
    ok(mod.save.data.boss && mod.save.data.boss.q.length === 1 && mod.save.data.boss.q[0].t === 'boss', 'an unopened chest survives a reload');
    const c0 = q.coins;
    const r = BS.openNext(q);
    ok(r && q.coins === c0 + r.loot.coins && SH.owns(q, r.loot.cos) && BS.pending(q) === 0, 'opening pays coins, boosters and the look');
  }
  // 120 days (the shop sim's steady player: 10 levels on day 1, 6 a day in week 1, then 4) with every chest opened. One
  // level in 6 is lost and retried (the flame goes out). Chest coins stay a side income, the cosmetics stay a real sink,
  // and the boosters the chests hand out are used up by a player who spends one every 3 levels plus one per hard / boss
  // (the shop deals' boosters are left out: the chests alone must not pile up).
  {
    const d = fresh();
    d.level = 1;
    const order = SH.COSMETICS.filter((x) => x.cost).sort((x, y) => x.cost - y.cost);
    let play = 0, chestCoins = 0, chestBoost = 0, allAt = -1, peak = 0, used = 0, gifts = 0, cs = 0; // cs: boosters from chests still unused
    for (let dd = 0; dd < 120; dd++) {
      const c0 = d.coins;
      for (let k = 0; k < (dd === 0 ? 10 : dd < 7 ? 6 : 4); k++) {
        const n = d.level;
        const kind = levelKind(n);
        if (n % 6 === 4) BS.markFail(d, n); // lost once, then retried
        BS.startAttempt(d);
        d.coins += 20 + Math.floor(n / 5) + 5 + (kind === 'boss' ? 20 : kind === 'hard' ? 10 : 0) + Math.min(15, Math.floor(dd / 6));
        BS.onClear(d, n);
        d.level++;
        const use = (n % 3 === 0 ? 1 : 0) + (kind !== 'normal' ? 1 : 0);
        for (let u = 0; u < use && cs > 0; u++) { cs--; used++; } // a chest booster is spent first
      }
      d.coins += 15 + 15 + 20 + E.CHEST.coins + (E.LOGIN_REWARDS[dd % 7].coins || 0);
      play += d.coins - c0;
      const c1 = d.coins;
      const b1 = d.boosters.hint + d.boosters.undo + d.boosters.scoop;
      while (BS.pending(d)) { const r = BS.openNext(d); if (r.loot.cos) gifts++; }
      chestCoins += d.coins - c1;
      const gotB = d.boosters.hint + d.boosters.undo + d.boosters.scoop - b1;
      chestBoost += gotB;
      cs += gotB;
      const lv = Math.round((d.coins - c0) * 0.25); d.coins -= lv; // boosters and seats bought in levels
      for (const it of order) if (!SH.owns(d, it.id) && d.coins - it.cost >= 300) SH.cosBuy(d, it.id);
      const x = SH.dealOf(E.dayOf(T0) + dd);
      if (d.coins - x.price >= 300) SH.dealBuy(d, E.dayOf(T0) + dd); // the deal of the day, as in the shop sim
      if (allAt < 0 && order.every((it) => SH.owns(d, it.id))) allAt = dd;
      peak = Math.max(peak, cs);
      ok(d.coins >= 0, `boss sim day ${dd + 1}: coins never go negative`);
    }
    const cpd = chestCoins / 120, ppd = play / 120, bpd = chestBoost / 120;
    ok(cpd >= 20 && cpd <= ppd * 0.18, `chest coins a day ${cpd.toFixed(1)} within 20 coins..18% of play (${ppd.toFixed(0)})`);
    ok(bpd <= 2, `chest boosters a day ${bpd.toFixed(2)} <= 2`);
    ok(peak <= 12, `the chests' boosters never pile up (peak unused ${peak})`);
    ok(allAt > 30 && allAt < 120, `with chests: the cosmetics are still a sink (all owned on day ${allAt + 1})`);
    ok(gifts >= 3 && gifts <= order.length - 2, `chests give some looks, the shop sells the rest (${gifts} of ${order.length})`);
    console.log(`  boss chests 120 days: ${cpd.toFixed(1)} coins/day from chests vs ${ppd.toFixed(0)} from play (${((cpd / ppd) * 100).toFixed(0)}%), ${bpd.toFixed(2)} boosters/day (used ${used}, peak unused ${peak}), ${gifts} looks from chests, all cosmetics on day ${allAt + 1}, ${BS.state(d).beat} bosses`);
  }
}

if (failures) {
  console.error(`\n${failures} econ check(s) failed`);
  process.exit(1);
}
console.log('econ checks passed');
