// Economy checks: node scripts/check-econ.mjs (lives, Purr Streak, daily tasks, login, Cat Show, IAP, ads rules, save migration)
const stored = { v: null };
globalThis.localStorage = { getItem: () => stored.v, setItem: (k, v) => { stored.v = v; } };
const { save } = await import('../src/kit/save.js');
const E = await import('../src/game/econ.js');
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
  E.showAdd(d, 2, sun);
  ok(!E.showAnyReady(d), '2 ribbons: nothing to claim');
  E.showAdd(d, 1, sun);
  ok(E.showReady(d, 0), '3 ribbons: step 1 ready');
  const out = E.showClaim(d, sun);
  eq(out.length, 1, 'one reward claimed');
  eq(E.showClaim(d, sun).length, 0, 'no double claim');
  E.showAdd(d, 50, sun);
  const before = d.coins;
  const all = E.showClaim(d, sun);
  eq(all.length, 9, 'the remaining 9 steps pay together');
  ok(d.coins > before && d.show.decor[E.themeOf(E.weekOf(sun)).id] === 1, 'the last step stores the exclusive decor');
  ok(E.earnedDecor(d).length === 1, 'decor hook lists it');
  const decorKept = E.themeOf(E.weekOf(sun)).id;
  ok(E.showRoll(d, mon), 'week change rolls the event');
  eq([d.show.ribbons, d.show.claimed.length], [0, 0], 'ribbons and claims reset on the new week');
  ok(d.show.decor[decorKept] === 1, 'earned decor survives the reset');
  E.showAdd(d, 5, mon);
  ok(!E.showRoll(d, sun) && d.show.ribbons === 5, 'clock rollback does not reset the current week');
  // the Show board: first clear pays, the judges' mark pays once more, practice after that pays nothing
  let r = E.showBoardResult(d, 4, 2);
  eq([r.ribbons, r.best, d.show.best, d.show.ch], [E.SHOW_CLEAR, true, 4, 1], 'first Show board clear pays SHOW_CLEAR');
  r = E.showBoardResult(d, 3, 2);
  eq([r.ribbons, r.best, d.show.best], [0, true, 3], 'a better score is kept, no second clear pay');
  r = E.showBoardResult(d, 2, 2);
  eq([r.ribbons, d.show.ch], [E.SHOW_MARK, 3], 'hitting the judges\' mark pays SHOW_MARK once');
  eq(E.showBoardResult(d, 2, 2).ribbons, 0, 'no double pay on practice');
  const nextMon = mon + 7;
  ok(E.showRoll(d, nextMon) && d.show.best === -1 && d.show.ch === 0, 'a new week resets the Show board');
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
  eq([d.v, d.level, d.coins, d.settings.sound], [7, 35, 120, false], 'MVP save keeps level, coins and settings');
  eq([d.lives.n, d.purr.n, d.quests.list.length, d.login.last, d.show.ribbons], [5, 0, 0, 0, 0], 'MVP save gets the new systems at defaults');
  eq(d.meta.firstOpen, 0, 'an old save never counts as a fresh install (no first-5-minutes ad block)');
  ok(d.cafe.stars === 12, 'the MVP cafe head start is still applied');
  d = await load({ v: 3, level: 9, coins: 5, cafe: { stars: 1, built: { a: 1 } }, boosters: { hint: 1, scoop: 0, undo: 0 }, ads: { removeAds: true } });
  eq([d.v, d.cafe.built.a, d.boosters.hint, d.ads.removeAds], [7, 1, 1, true], 'v3 save keeps the cafe, boosters and the ads flag');
  d = await load({ v: 4, lives: { n: 99, t: -5 }, purr: { n: -2, pend: 7 }, quests: { day: 'x', list: [1, { id: 'wins', p: 'a', c: 5 }], chest: 3 }, login: { last: 5, idx: 99 }, show: { week: 3, ribbons: -1, claimed: [1, 'z', 99, 2], decor: [] }, iap: { owned: 5, tx: [1, 'ok'] }, clock: { max: 'q' }, meta: { firstOpen: 'x', funnel: 3 } });
  eq([d.lives.n, d.lives.t, d.purr.n, d.purr.pend, d.quests.day, d.quests.chest], [5, 0, 0, 0, 0, 1], 'corrupt economy fields are repaired');
  eq(d.quests.list, [{ id: 'wins', p: 0, c: 1 }], 'task list is repaired');
  eq([d.login.idx, d.show.ribbons, d.show.claimed, d.iap.tx, d.clock.max, d.meta.firstOpen], [0, 0, [1, 2], ['ok'], 0, 0], 'login, show, iap, clock and meta are repaired');
  d = await load({ v: 5, level: 20, cafe: { stars: 2, built: { counter_counter: 1, counter_lamps: 1, counter_plant: 1, window_bookshelf: 1 } } });
  eq([d.cafe.built.counter_pastry, d.cafe.built.counter_chalkboard, d.cafe.built.window_plants, d.cafe.built.window_rug, d.cafe.stars], [1, 1, 1, undefined, 2], 'v5 save keeps its residents after they move to earlier tasks');
  d = await load('{not json');
  ok(d.v === 7 && d.meta.firstOpen > 0 && d.lives.n === 5, 'corrupt JSON gives a fresh save stamped as a new install');
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
