// Economy checks: node scripts/check-econ.mjs (lives, Purr Streak, daily tasks, login, Cat Show, retention systems + a
// 60-day simulated player, IAP, ads rules, save migration)
const stored = { v: null };
globalThis.localStorage = { getItem: () => stored.v, setItem: (k, v) => { stored.v = v; } };
const { save } = await import('../src/kit/save.js');
const E = await import('../src/game/econ.js');
const L = await import('../src/game/live.js');
const ST = await import('../src/game/street.js');
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
  { let st = 0, i = 0; for (let n = 1; n < 400 && i < tasks.length; n++) { const k = levelKind(n); st += k === 'super' ? 3 : k === 'hard' ? 2 : 1; if (n + 1 < 4) continue; while (i < tasks.length && st >= tasks[i].cost) { st -= tasks[i].cost; builtAt[i++] = n; } } }
  const houseDone = Math.max(...builtAt);
  const resAt = (lv) => tasks.map((t, i) => (t.resident && builtAt[i] < lv ? t.resident.id : null)).filter(Boolean);
  const d = fresh();
  const start = at(2026, 0, 5, 9); // a Monday
  d.meta.firstOpen = start;
  const days = [];
  let stars = 0;
  const collection = () => ST.housesDone(d) + ST.renoCount(d) + L.visitorsOwned(d).length + L.outfitsOwned(d, resAt(d.level)) + E.earnedDecor(d).length + Object.values(d.rush.cups).reduce((a, b) => a + b, 0);
  let doneDay = -1;
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
      // play this visit's half of the day's levels
      for (let k = 0; k < levels / 2; k++) {
        d.level++;
        { const k = levelKind(d.level - 1); stars += k === 'super' ? 3 : k === 'hard' ? 2 : 1; }
        L.reqEvent(d, 'win');
        L.reqEvent(d, 'carrier', 4);
        for (let c = 0; c < 15; c++) L.reqEvent(d, 'cat', 1, (d.level * 7 + c * 3) % 8);
        if (d.level % 3 === 0) L.reqEvent(d, 'tidy');
        E.questEvent(d, 'win', day); E.questEvent(d, 'carrier', day, 4); E.questEvent(d, 'cat', day, 15);
      }
      if (hour === 20 && dd % 7 !== 6 && doneDay !== day) { // the daily puzzle
        doneDay = day;
        d.daily.streak = +d.daily.last === day - 1 ? d.daily.streak + 1 : 1;
        d.daily.last = String(day);
        E.grant(d, L.streakChest(d.daily.streak));
        if (L.eventsOpen(d)) L.addDailyStamp(d, week);
        L.reqEvent(d, 'daily');
        earn.add('daily');
      }
      if (hour === 20 && L.eventsOpen(d)) { // the week's Show boards and a Rush run
        if (!L.medalOf(d, week, 'a')) { L.showMedal(d, week, 'a', true); earn.add('show'); }
        if (!L.medalOf(d, week, 'b')) { L.showMedal(d, week, 'b', week % 2 === 0); earn.add('show'); }
        if (L.bothGold(d, week)) d.show.decor[E.themeOf(week).id] = 1;
        if (!d.rush.best) L.rushResult(d, 30 * 2400);
        if (L.rushClaim(d)) earn.add('rush');
      }
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
  }
  days.forEach((x) => ok(x.earn.length >= 3, `day ${x.dd + 1}: at least 3 things to collect or do (got ${x.earn.join(', ') || 'none'})`));
  days.slice(1).forEach((x) => ok(x.ticking.length >= 1, `day ${x.dd + 1}: a timer ticks toward the next reward`));
  const after = days.filter((x) => x.level > houseDone);
  ok(after.length >= 21, `the sim reaches past the finished house (L${houseDone}) with weeks to spare`);
  for (let i = 7; i < after.length; i++) ok(after[i].items > after[i - 7].items, `past L${houseDone}, the collection grows every week (day ${after[i].dd + 1}: ${after[i - 7].items} -> ${after[i].items})`);
  for (let i = 7; i < after.length; i++) ok(after[i].street > after[i - 7].street, `Cat Street gains pieces every week (day ${after[i].dd + 1})`);
  const last = days[days.length - 1];
  ok(ST.housesDone(d) >= 6, `by day 120 the street has a few shops (got ${ST.housesDone(d)})`);
  ok(ST.housesDone(d) <= 40, `the street does not race ahead of the art (got ${ST.housesDone(d)} houses)`);
  console.log(`  120-day street: ${ST.housesDone(d)} shops, ${d.cafe.street % ST.HOUSE_TASKS}/8 of ${ST.curHouse(d).name.en}, ${ST.renoCount(d)} renovation sets`);
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
  eq([d.v, d.level, d.coins, d.settings.sound], [8, 35, 120, false], 'MVP save keeps level, coins and settings');
  eq([d.lives.n, d.purr.n, d.quests.list.length, d.login.last, Object.keys(d.show.marks).length], [5, 0, 0, 0, 0], 'MVP save gets the new systems at defaults');
  eq(d.meta.firstOpen, 0, 'an old save never counts as a fresh install (no first-5-minutes ad block)');
  ok(d.cafe.stars === 12, 'the MVP cafe head start is still applied');
  d = await load({ v: 3, level: 9, coins: 5, cafe: { stars: 1, built: { a: 1 } }, boosters: { hint: 1, scoop: 0, undo: 0 }, ads: { removeAds: true } });
  eq([d.v, d.cafe.built.a, d.boosters.hint, d.ads.removeAds], [8, 1, 1, true], 'v3 save keeps the cafe, boosters and the ads flag');
  d = await load({ v: 4, lives: { n: 99, t: -5 }, purr: { n: -2, pend: 7 }, quests: { day: 'x', list: [1, { id: 'wins', p: 'a', c: 5 }], chest: 3 }, login: { last: 5, idx: 99 }, show: { week: 3, ribbons: -1, claimed: [1, 'z', 99, 2], decor: [] }, iap: { owned: 5, tx: [1, 'ok'] }, clock: { max: 'q' }, meta: { firstOpen: 'x', funnel: 3 } });
  eq([d.lives.n, d.lives.t, d.purr.n, d.purr.pend, d.quests.day, d.quests.chest], [5, 0, 0, 0, 0, 1], 'corrupt economy fields are repaired');
  eq(d.quests.list, [{ id: 'wins', p: 0, c: 1 }], 'task list is repaired');
  eq([d.login.idx, d.show.week, d.iap.tx, d.clock.max, d.meta.firstOpen], [0, 3, ['ok'], 0, 0], 'login, show, iap, clock and meta are repaired');
  d = await load({ v: 5, level: 20, cafe: { stars: 2, built: { counter_counter: 1, counter_lamps: 1, counter_plant: 1, window_bookshelf: 1 } } });
  eq([d.cafe.built.counter_pastry, d.cafe.built.counter_chalkboard, d.cafe.built.window_plants, d.cafe.built.window_rug, d.cafe.stars], [1, 1, 1, undefined, 2], 'v5 save keeps its residents after they move to earlier tasks');
  d = await load({ v: 7, level: 30, show: { week: 2900, ch: 3, best: 2, mark: 2, markWeek: 2900, decor: { beach_day: 1 } } });
  eq([d.v, d.show.marks['2900a'], d.show.ch, d.show.decor.beach_day, d.jar.t, d.req.list.length, d.rush.best, d.settings.notify], [8, 3, undefined, 1, 0, 0, 0, false], 'v7 save: this week Show board medal carries over, retention systems at defaults, reminders off');
  d = await load({ v: 8, show: { marks: { '12a': 9, x: 1, '13b': 2 }, goals: { '12a': { kind: 'seats', n: 2 }, '12b': { kind: 'zz', n: 1 } } }, req: { list: [{ k: 'win', who: 'mochi', need: 2, p: 99, c: 77 }, 5] }, cafe: { hearts: { mochi: -3, luna: 4 }, wear: { mochi: 'tiara', luna: 'hat' } }, rush: { pend: { rank: 'x' }, cups: { gold: 2 } }, vis: { maple: 3 } });
  eq([d.show.marks, Object.keys(d.show.goals), d.req.list, d.cafe.hearts, d.cafe.wear, d.rush.pend, d.rush.cups, d.vis], [{ '13b': 2 }, ['12a'], [{ k: 'win', who: 'mochi', need: 2, p: 2, c: 0, s: 0 }], { luna: 4 }, { luna: 'hat' }, null, { gold: 2 }, { maple: 3 }], 'corrupt v8 retention fields are repaired, good ones kept');
  d = await load('{not json');
  ok(d.v === 8 && d.meta.firstOpen > 0 && d.lives.n === 5, 'corrupt JSON gives a fresh save stamped as a new install');
  d = await load(undefined);
  ok(d.meta.firstOpen > 0, 'a missing save is a new install');
}

// ---------------- café star pacing (sim of a player who wins every level first try) ----------------
// A first clear pays its stars (normal 1, hard 2, super 3) into the café; the hub opens at L4 with the L1-3 stars banked
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
    st += k === 'super' ? 3 : k === 'hard' ? 2 : 1;
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

if (failures) {
  console.error(`\n${failures} econ check(s) failed`);
  process.exit(1);
}
console.log('econ checks passed');
