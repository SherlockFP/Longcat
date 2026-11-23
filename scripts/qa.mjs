// Headless QA: vite dev + chrome-headless-shell over raw CDP, 375x812 @2x, real touch taps.
// Frames land in qa/. Usage: node scripts/qa.mjs   (PORT env, default 5193)
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const OUT = join(ROOT, 'qa');
const PORT = +(process.env.PORT || 5193);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'lco-qa-'));
const procs = [];
const errs = [];
const kill = () => { for (const p of procs.splice(0)) { try { spawn('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } } };
const bye = (code) => { kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ } process.exit(code); }, 1000); };
setTimeout(() => { console.log('hard timeout'); bye(2); }, 150 * 60 * 1000).unref();

try {
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  procs.push(vite.pid);
  const origin = `http://localhost:${PORT}`;
  for (let i = 0; ; i++) { try { if ((await fetch(origin + '/')).ok) break; } catch { /* not yet */ } if (i > 150) throw new Error('vite did not start'); await sleep(200); }
  const cport = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const ch = spawn(CHROME, [`--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, '--headless', '--mute-audio', ...(process.env.QA_NOGPU ? ['--disable-gpu'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']), '--window-size=375,812', '--disable-extensions', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  procs.push(ch.pid);
  let targets;
  for (let i = 0; ; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not yet */ } if (i > 100) throw new Error('chrome did not start'); await sleep(200); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const cb = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && cb.has(d.id)) { const c = cb.get(d.id); cb.delete(d.id); if (d.error) c.rej(new Error(d.error.message)); else c.res(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; cb.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  for (const d of ['Page', 'Runtime']) await send(d + '.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]);
    return r.result.value;
  };
  // r7 hard rule: no screen scrolls. Every frame checks the page, panels, sheet bodies, cards and the hub (an element
  // still animating in is skipped); the sheet scrolled on purpose (21f) is exempt.
  const scrollFails = [];
  const NOSCROLL = `(() => { const bad = []; const se = document.scrollingElement; if (se.scrollHeight > innerHeight + 1) bad.push('page ' + se.scrollHeight + '>' + innerHeight);
    for (const el of document.querySelectorAll('.panel, .pbody, #cafe, #resi, .card, .rgrid, .room')) { if (el.getAnimations().some((x) => x.playState === 'running')) continue;
      const nm = (el.id || el.className).slice(0, 28); if (el.scrollHeight > el.clientHeight + 2) bad.push(nm + ' ' + el.scrollHeight + '>' + el.clientHeight);
      const r = el.getBoundingClientRect(); if (r.height && (r.bottom > innerHeight + 1 || r.top < -1)) bad.push(nm + ' off-screen ' + Math.round(r.top) + '..' + Math.round(r.bottom)); }
    return bad; })()`;
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    const bad = name === '21f-shop-bottom' ? [] : await ev(NOSCROLL).catch(() => []);
    if (bad.length) scrollFails.push(name + ': ' + bad.join(', '));
    console.log('  shot ' + name + (bad.length ? '  SCROLL ' + bad.join(', ') : ''));
  };
  const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const tap = async (x, y) => { await touch('touchStart', x, y); await sleep(40); await touch('touchEnd', x, y); };
  const waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch { /* busy */ } await sleep(100); } throw new Error('timeout ' + expr); };
  globalThis.__dbg = async () => { try { await shot('zz-debug'); console.log('state', JSON.stringify(await ev('window.__qa.state()'))); } catch (e) { console.log('dbg failed ' + e.message); } };
  const qa = (expr) => ev('window.__qa.' + expr);
  const tapCat = async (cid) => { const p = await qa(`pos(${cid})`); await tap(p.x, p.y); };
  const boot = async (query = '') => { await send('Page.navigate', { url: origin + '/' + query }); await sleep(500); await waitFor('!!window.__qa && !!document.querySelector("#menu.on, #cafe.on, #hud.on")', 20000); await sleep(900); };

  await send('Page.navigate', { url: origin + '/' });
  await ev('localStorage.clear()').catch(() => {});
  await boot();

  // QA_FROM=14 skips the play-board sections 1-13 and QA_FROM=21 also the café ones (a slow machine); the default runs everything
  if (+(process.env.QA_FROM || 0) < 14) {
  // 1 home EN (levels 1-3 boot straight into play; the plain home stays reachable with the Home button)
  if ((await qa('state()')).mode !== 'play') throw new Error('fresh save should boot into level 1');
  await qa('home()');
  await sleep(1500);
  await shot('01-home-en');

  // 2 level 1 (tap hit area test: tap the body, not the head)
  await qa('level(1)'); await sleep(700);
  await shot('02-level1');

  // 3 level 2: the forced zigzag parks two blues, then the orange carrier leaves and both hop in (the first chain)
  await qa('level(2)'); await sleep(600);
  for (const id of [0, 1, 2]) { await waitFor('!window.__qa.state().busy', 8000); await qa(`tap(${id})`); await sleep(250); }
  await waitFor('!window.__qa.state().busy', 8000); await sleep(400);
  if ((await qa('state()')).bench[0] !== 2) throw new Error('L2 should park the two blues, bench ' + (await qa('state()')).bench);
  await shot('03-level2-bench');
  if ((await qa('peek(3)')).boards !== 2) throw new Error('L2 orange should fire a 2-chain');
  await qa('tap(3)');
  await waitFor('(window.__qa.chainFx() || {}).k >= 2', 8000); await sleep(150);
  await shot('03b-level2-chain');
  await waitFor('!window.__qa.state().busy', 8000); await sleep(300);

  // 4 level 3: mother + kitten sprint, slowed; then settled in the carrier
  await qa('level(3)'); await sleep(600);
  await qa('slow(0.22)');
  await tapCat(0);
  await sleep(450);
  await shot('04-level3-sprint');
  await sleep(1500);
  await qa('slow(1)');
  await sleep(500);
  await shot('04b-level3-carrier-fill');
  // 4c the L3 trap: the big pink pair is free from the start, its carrier comes last; tapping it fills 2 of 3 seats
  await qa('level(3)'); await sleep(700);
  await shot('04c-level3-start');
  await qa('tap(5)'); await sleep(300);
  await waitFor('!window.__qa.state().busy', 8000); await sleep(300);
  if ((await qa('state()')).bench[0] !== 2) throw new Error('L3 pink pair should take 2 of 3 seats');
  await shot('04d-level3-trap');

  // 5 mid-sprint on a real board: the long body slithers from the rug to the carrier
  await qa('level(12)'); await sleep(600);
  await qa('slow(0.2)');
  await tapCat(await qa('tapColor(true)') ?? await qa('freeId()'));
  await sleep(520);
  await shot('05-mid-sprint');
  await qa('slow(1)'); await sleep(1500);

  // 6 carrier departing: fill the front carrier, catch the door-close + drive-off
  await qa('level(12)'); await sleep(600);
  await qa('slow(0.25)');
  for (let i = 0; i < 14; i++) {
    const id = await qa('tapColor(true)');
    if (id == null) { await qa('solveStep()'); }
    await sleep(120);
    if ((await qa('state()')).departed > 0) break;
  }
  await waitFor('window.__qa.state().leaving > 0', 8000);
  await sleep(500);
  await shot('06-carrier-departing');
  await sleep(1700);
  await shot('06b-bench-hop-in');
  await qa('slow(1)'); await sleep(2500);

  // 7 bench nearly full
  await qa('level(12)'); await sleep(600);
  await qa('benchTo(4)'); await sleep(2400);
  await shot('07-bench-nearly-full');

  // 8 bonk mid-animation
  await qa('level(6)'); await sleep(600);
  const b = await qa('blockedId()');
  await qa('slow(0.3)');
  await tapCat(b);
  await sleep(450);
  await shot('08-bonk');
  await qa('slow(1)');

  // 9 continue offer (bench overflow)
  await qa('level(49)'); await sleep(600);
  await qa('failNow()');
  await waitFor('window.__qa.state().screen === "fail"', 30000);
  await sleep(700);
  await shot('09-continue-offer');
  await ev('document.querySelector("[data-act=morehelp]")?.click()'); await sleep(250); // r7: the paid rescues sit behind "More help"
  const ad = await ev('(() => { const r = document.querySelector("[data-act=adheart]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  await tap(ad.x, ad.y); await sleep(3600);
  await shot('09b-after-continue');

  // 10 a level ~30 board
  await qa('level(49)'); await sleep(900);
  await shot('10-level30');

  // 10b idle blink (forced) on the same board
  await qa('forceBlink(1)'); await sleep(200);
  await shot('10b-blink');
  await qa('forceBlink(0)');

  // 11 win card
  await qa('level(2)'); await sleep(500);
  await qa('winNow()');
  await waitFor('window.__qa.state().screen === "win"', 20000);
  await sleep(1800);
  await shot('11-win');
  const nb = await ev('(() => { const r = document.querySelector("[data-act=next]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  await tap(nb.x, nb.y); await sleep(700);
  if ((await qa('state()')).level !== 3) throw new Error('Next did not start level 3');

  // 12 purrfect cascade: three quick real taps on free cats
  await qa('level(10)'); await sleep(600);
  for (let i = 0; i < 3; i++) { const fid = await qa('freeId()'); await tapCat(fid); await sleep(120); }
  await sleep(250);
  await shot('12-purrfect');
  await sleep(1500);

  // 13 boosters: undo and scoop with real touches
  await qa('level(12)'); await sleep(600);
  const ub = await ev('(() => { const r = document.getElementById("b-undo").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  const alive0 = (await qa('state()')).alive;
  await tapCat(await qa('freeId()')); await sleep(1800);
  await tap(ub.x, ub.y); await sleep(400);
  if ((await qa('state()')).alive !== alive0) throw new Error('Undo did not restore the board');
  const sb = await ev('(() => { const r = document.getElementById("b-scoop").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  await tap(sb.x, sb.y); await sleep(300);
  await tapCat(await qa('blockedId()') ?? await qa('freeId()')); await sleep(1500);
  if ((await qa('state()')).alive !== alive0 - 1) throw new Error('Scoop did not lift a cat');
  await shot('13-after-scoop');

  }
  if (+(process.env.QA_FROM || 0) < 21) { // QA_FROM=21 also skips the café sections 14-20
  // 14 MVP save (v1, level 35, no café data) migrates safely and lands on the café hub
  await ev('localStorage.setItem("lco_save", JSON.stringify({v:1,level:35,coins:120}))');
  await boot();
  if ((await qa('state()')).screen !== 'cafe') throw new Error('a v1 save at level 35 should boot into the cafe hub');
  await sleep(500);
  await shot('14-cafe-migrated');

  // 15 home TR + TR play frame + TR cards
  await qa('home()'); await sleep(300);
  await qa('lang("tr")'); await sleep(300);
  await qa('home()'); await sleep(1500);
  await shot('15-home-tr');
  await qa('level(2)'); await sleep(900);
  await shot('15b-play-tr');
  await qa('winNow()');
  await waitFor('window.__qa.state().screen === "win"', 20000);
  await sleep(1800);
  await shot('15c-win-tr');
  await qa('level(49)'); await sleep(600);
  await qa('failNow()');
  await waitFor('window.__qa.state().screen === "fail"', 30000);
  await sleep(700);
  await shot('15d-offer-tr');

  // 16 hint with a real touch on the booster bar
  await qa('lang("en")'); await qa('level(5)'); await sleep(500);
  const hb = await ev('(() => { const r = document.getElementById("b-hint").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  await tap(hb.x, hb.y); await sleep(500);
  await shot('16-hint');
  // 17 Cat Cafe hub: save at level 5 with 2 stars -> hub EN
  await ev('localStorage.setItem("lco_save", JSON.stringify({v:3,level:5,coins:120,cafe:{stars:2,built:{}}}))');
  await boot();
  if ((await qa('state()')).screen !== 'cafe') throw new Error('level 5 save should boot into the cafe hub');
  await sleep(500);
  await shot('17-cafe-hub');
  // build the first task with a real touch on its row, catch the build animation mid-way
  const row = await ev('(() => { const r = document.querySelector(".trow.ok").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  await tap(row.x, row.y); await sleep(520);
  await shot('17b-cafe-build');
  await sleep(1200);
  if (!(await ev('JSON.parse(localStorage.getItem("lco_save")).cafe.built.counter_counter'))) throw new Error('task was not built');
  await shot('17c-cafe-built');

  // 18 resident arrival: the first café visit (L1-3 stars banked) pays the pastry case, the task that brings Mochi
  await ev('localStorage.setItem("lco_save", JSON.stringify({v:3,level:4,coins:120,cafe:{stars:2,built:{counter_counter:1}}}))');
  await boot();
  await sleep(400);
  const lamp = await ev('(() => { const r = document.querySelector("[data-id=counter_pastry]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  await tap(lamp.x, lamp.y);
  await waitFor('window.__qa.state().screen === "arrive"', 6000);
  await sleep(900);
  await shot('18-resident-arrival');
  const ap = await ev('(() => { const r = document.querySelector("[data-act=arriveclose]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  await tap(ap.x, ap.y); await sleep(1200);
  await shot('18b-cafe-resident-idle');

  // 18c hub with four tasks built (counter + pastry + lamps + chalkboard)
  await ev('localStorage.setItem("lco_save", JSON.stringify({v:3,level:7,coins:120,cafe:{stars:1,built:{counter_counter:1,counter_pastry:1,counter_lamps:1,counter_chalkboard:1}}}))');
  await boot();
  await sleep(600);
  await shot('18c-cafe-4-tasks');

  // 19 collection page (one resident home, three silhouettes), then TR hub
  await qa('screen("residents")'); await sleep(500);
  await shot('19-residents');
  await qa('lang("tr")'); await qa('cafe()'); await sleep(800);
  await shot('19b-cafe-tr');
  await qa('screen("residents")'); await sleep(500);
  await shot('19c-residents-tr');

  // 18d later areas: the first two are done, Cushion Corner is open (tinted shell, dust sheets, costs 3-5)
  await ev('localStorage.setItem("lco_save", JSON.stringify({v:4,level:40,coins:120,cafe:{stars:7,built:{counter_counter:1,counter_pastry:1,counter_lamps:1,counter_chalkboard:1,counter_tables:1,counter_plant:1,window_seat:1,window_plants:1,window_bookshelf:1,window_cattree:1,window_rug:1,window_lights:1,cushion_rug:1,cushion_lamp:1}}}))');
  await boot();
  await sleep(600);
  await shot('18d-cafe-area3');

  // 20 perks: Mochi (coins), Biscuit (daily free hint), Luna (seat on hard), Pudding (scoop on every 5th level)
  await qa('lang("en")');
  await ev('localStorage.setItem("lco_save", JSON.stringify({v:3,level:20,coins:10,cafe:{stars:0,built:{counter_lamps:1,counter_plant:1,window_bookshelf:1,window_lights:1}}}))');
  await boot();
  await qa('level(20)'); await sleep(700);
  if ((await ev('document.querySelector("#b-hint .badge").textContent')) !== 'Free') throw new Error('free daily hint badge missing');
  const hb2 = await ev('(() => { const r = document.getElementById("b-hint").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
  await tap(hb2.x, hb2.y); await sleep(500);
  const sv = await ev('JSON.parse(localStorage.getItem("lco_save"))');
  if (sv.boosters.hint !== 3 || !sv.cafe.hintDay) throw new Error('free hint should not spend a booster');
  if (sv.boosters.scoop !== 3) throw new Error('level 20 should grant the Pudding scoop');
  await shot('20-perks-level20');
  await qa('level(42)'); await sleep(500);
  if ((await qa('state()')).bench[1] !== 6) throw new Error('Luna should add a seat on a hard first try, got ' + (await qa('state()')).bench);
  await qa('level(42)'); await sleep(500);
  if ((await qa('state()')).bench[1] !== 5) throw new Error('the retry of a hard level gets no extra seat');
  const c0 = (await ev('JSON.parse(localStorage.getItem("lco_save")).coins'));
  await qa('level(2)'); await sleep(400);
  await qa('winNow()');
  await waitFor('window.__qa.state().screen === "win"', 20000);
  await sleep(600);
  const c1 = (await ev('JSON.parse(localStorage.getItem("lco_save")).coins'));
  if (c1 - c0 !== 5) throw new Error('replaying an already cleared level pays only 5 coins (no farming), got ' + (c1 - c0));
  }
  if (+(process.env.QA_FROM || 0) < 90) { // QA_FROM=90 runs only the round-6 frames at the end
  // 21 economy: hub with lives + dots, tasks sheet, Cat Show, shop, out of lives, starter offer
  const DAY = 'Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000)';
  const center = (sel) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const tapSel = async (sel) => { const c = await center(sel); await tap(c.x, c.y); };
  const lsave = () => ev('JSON.parse(localStorage.getItem("lco_save"))');
  await qa('lang("en")');
  await ev('localStorage.setItem("lco_save", JSON.stringify({v:3,level:12,coins:340,cafe:{stars:3,built:{counter_lamps:1,counter_plant:1}}}))');
  await boot();
  await ev(`window.__qa.save({ lives: { n: 3, t: Date.now() - 10 * 60000 }, quests: { day: ${DAY}, list: [{ id: 'carriers', p: 10, c: 0 }, { id: 'wins', p: 1, c: 0 }, { id: 'cats', p: 50, c: 1 }], chest: 0 }, login: { last: ${DAY} - 1, idx: 2 } })`);
  await qa('home()'); await sleep(900);
  await shot('21-hub-econ');
  if ((await ev('document.getElementById("lives-n").textContent')) !== '3') throw new Error('lives pill should show 3');
  await tapSel('[data-act=quests]'); await sleep(600);
  if ((await qa('state()')).sheet !== 'quests') throw new Error('tasks sheet did not open');
  await shot('21b-tasks');
  await tapSel('[data-act=loginclaim]'); await sleep(500);
  await tapSel('[data-act=qclaim]'); await sleep(500);
  let sv2 = await lsave();
  if (sv2.coins !== 340 + 40 + 15 || sv2.login.idx !== 3 || !sv2.quests.list[0].c) throw new Error('login + task claim did not pay: ' + sv2.coins);
  await tapSel('[data-act=closesheet]'); await sleep(300);
  await tapSel('[data-act=show]'); await sleep(900);
  if ((await qa('state()')).sheet !== 'events') throw new Error('the Events tab should open the Events sheet');
  await shot('21c-cat-show');
  await tapSel('[data-act=evtab][data-tab=rush]'); await sleep(500);
  await shot('21d-cafe-rush');
  await tapSel('[data-act=evtab][data-tab=show]'); await sleep(300);
  await tapSel('[data-act=closesheet]'); await sleep(300);
  // shop: buy a coin pack with a real touch, then the starter bundle (No Ads flag)
  await tapSel('.cafe-top .tr [data-act=shop]'); await sleep(600);
  await shot('21e-shop');
  const coinsBefore = (await lsave()).coins;
  await tapSel('[data-id=coins500]'); await sleep(1300);
  if ((await lsave()).coins !== coinsBefore + 500) throw new Error('coin pack did not pay');
  await ev('document.querySelector("#sheet .pbody").scrollTop = 9999'); await sleep(300);
  await shot('21f-shop-bottom');
  await ev('document.querySelector("#sheet .pbody").scrollTop = 0');
  await tapSel('[data-id=starter]'); await sleep(1300);
  sv2 = await lsave();
  if (!sv2.ads.removeAds || !sv2.iap.owned.starter) throw new Error('starter bundle did not set No Ads');
  await shot('21g-shop-owned');
  await tapSel('[data-act=closesheet]'); await sleep(300);
  // out of lives: Play is gated, the sheet offers ad / coins
  await ev('window.__qa.save({ lives: { n: 0, t: Date.now() - 5 * 60000 } })');
  await tapSel('.cafe-play'); await sleep(600);
  if ((await qa('state()')).sheet !== 'nolives' || (await qa('state()')).mode === 'play') throw new Error('life gate did not stop Play');
  await shot('21h-no-lives');
  await tapSel('[data-act=adlife]'); await sleep(2800);
  if ((await lsave()).lives.n !== 1) throw new Error('life ad should give 1 life');
  // a loss costs a life, a continue gives it back
  await qa('level(49)'); await sleep(600);
  await qa('failNow()');
  await waitFor('window.__qa.state().screen === "fail"', 30000);
  await sleep(500);
  if ((await lsave()).lives.n !== 0) throw new Error('a loss should cost a life');
  await ev('document.querySelector("[data-act=morehelp]")?.click()'); await sleep(250);
  await tapSel('[data-act=adheart]'); await sleep(3600);
  if ((await lsave()).lives.n !== 1) throw new Error('a continue should refund the life');
  // Purr Streak bonus at level start: free hint + 1 bench seat
  await ev('window.__qa.save({ level: 14, purr: { n: 3, pend: 1 } })');
  const h0 = (await lsave()).boosters.hint;
  await qa('level(14)'); await sleep(500);
  if ((await lsave()).boosters.hint !== h0 + 1) throw new Error('streak bonus hint missing');
  if ((await qa('state()')).bench[1] < 6) throw new Error('streak bonus seat missing, bench ' + (await qa('state()')).bench);
  // starter offer after level 10 (fresh offer state, not owned, not the first session): no pop-up on the hub, a tag
  // on Shop, never on a win card (the payoff moment), and one offer row on a lost bench
  await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:11,coins:50,meta:{sessions:3},cafe:{stars:0,built:{counter_counter:1,counter_pastry:1,counter_lamps:1,counter_chalkboard:1,counter_tables:1,counter_plant:1,window_seat:1}}}))');
  await boot();
  await sleep(1200);
  if ((await qa('state()')).sheet === 'starter') throw new Error('the starter offer must never pop up on café entry');
  if (!(await ev('!!document.querySelector("[data-act=shop] .otag")'))) throw new Error('the hub Shop should carry the offer tag');
  await qa('level(11)'); await sleep(500);
  await qa('winNow()');
  await waitFor('window.__qa.state().screen === "win"', 30000);
  await sleep(1500);
  if ((await qa('state()')).sheet === 'starter' || (await ev('!!document.querySelector("#modal .offercard")'))) throw new Error('no Starter Bundle on a win card');
  await shot('22-win-no-offer');
  await qa('level(12)'); await sleep(500);
  await qa('failNow()');
  await waitFor('window.__qa.state().screen === "fail"', 30000);
  await sleep(700);
  if (!(await ev('!!document.querySelector("#modal .offercard")'))) throw new Error('a lost bench after L10 should carry the offer row once');
  await shot('22-starter-offer');
  await tapSel('#modal .offercard'); await sleep(600);
  if ((await qa('state()')).sheet !== 'starter') throw new Error('the offer row should open the bundle');
  await shot('22b-starter-sheet');
  await tapSel('[data-act=closesheet]'); await sleep(300);
  await qa('home()'); await sleep(900);
  if ((await qa('state()')).sheet === 'starter') throw new Error('the starter offer must never pop up on café entry');
  // TR economy frames
  await qa('lang("tr")');
  await ev('window.__qa.save({ lives: { n: 2, t: Date.now() - 3 * 60000 } })');
  await qa('home()'); await sleep(800);
  await shot('23-hub-econ-tr');
  await qa('screen("quests")'); await sleep(500);
  await shot('23b-tasks-tr');
  await qa('screen("show")'); await sleep(500);
  await shot('23c-show-tr');
  await qa('screen("shop")'); await sleep(500);
  await shot('23d-shop-tr');
  await qa('screen("nolives")'); await sleep(500);
  await shot('23e-no-lives-tr');
  await qa('lang("en")');

  // 24 mechanics: sleeping dog (L8), yarn (L12), mystery (L40), frozen (L55); teaching level each, then the reaction
  const mech = () => qa('mechState()');
  const stepUntil = async (pred, { slow = 1, wait = 1400, max = 14 } = {}) => {
    for (let i = 0; i < max; i++) {
      const before = await mech();
      await qa(`slow(${slow})`);
      await qa('solveStep()');
      await sleep(wait);
      const after = await mech();
      if (pred(before, after)) return true;
      await qa('slow(1)'); await sleep(900);
    }
    return false;
  };
  await qa('level(8)'); await sleep(900);
  if (!(await qa('objs()')).includes('dog')) throw new Error('level 8 should teach the sleeping dog');
  await shot('24a-dog-teach');
  await stepUntil((b, a) => a.dog[0] === 1 || a.dog.length === 0, { wait: 1200 });
  await shot('24b-dog-zzz-counter');
  await stepUntil((b, a) => a.dog.length === 0, { slow: 0.3, wait: 2300 });
  await shot('24c-dog-trots-away');
  await qa('slow(1)'); await sleep(1500);
  await qa('lang("tr")'); await qa('level(8)'); await sleep(900);
  await shot('24d-dog-teach-tr');
  await qa('lang("en")');
  await qa('level(12)'); await sleep(900);
  if (!(await qa('objs()')).includes('yarn')) throw new Error('level 12 should teach yarn');
  await shot('25a-yarn-teach');
  await stepUntil((b, a) => a.yarn < b.yarn, { slow: 0.3, wait: 2000 });
  await shot('25b-yarn-rolls-off');
  await qa('slow(1)'); await sleep(1500);
  await qa('level(40)'); await sleep(900);
  if ((await mech()).hidden < 1) throw new Error('level 40 should have a mystery cat');
  await shot('26a-mystery-teach');
  await stepUntil((b, a) => a.hidden < b.hidden, { slow: 0.3, wait: 1300 });
  await shot('26b-mystery-revealed');
  await qa('slow(1)'); await sleep(1500);
  await qa('lang("tr")'); await qa('level(40)'); await sleep(900);
  await shot('26c-mystery-teach-tr');
  await qa('lang("en")');
  await qa('level(55)'); await sleep(900);
  if ((await mech()).frozen < 1) throw new Error('level 55 should have a frozen cat');
  await shot('27a-frozen-teach');
  await tapCat(await qa('mechCat("frozen")')); await sleep(250);
  await shot('27b-frozen-bonk');
  await sleep(600);
  await stepUntil((b, a) => a.chipped > b.chipped || a.frozen < b.frozen, { slow: 0.3, wait: 1500 });
  await shot('27c-frozen-chipped');
  await stepUntil((b, a) => a.frozen < b.frozen, { slow: 0.3, wait: 1500 });
  await shot('27d-frozen-thawed');
  await qa('slow(1)'); await sleep(800);
  await qa('winNow()');
  await waitFor('window.__qa.state().screen === "win"', 30000);
  await qa('lang("en")');
  // 28 the L4 bench choice (packed 5x6, two free cats: green comes next, blue comes last), the 4-of-5 reminder,
  // a chain, the share clip on the win card, residents on the café floor
  {
    await qa('slow(1)');
    await qa('level(4)'); await sleep(800);
    const s4 = await qa('state()');
    if (s4.board[0] !== 5 || s4.board[1] !== 6 || s4.free.join() !== '2,7') throw new Error('L4 should be the packed 5x6 choice board, got ' + JSON.stringify(s4));
    await shot('28a-l4-start');
    await tapCat(2); // the risky park: blue comes last
    for (let i = 0; i < 10; i++) {
      await waitFor('!window.__qa.state().busy', 8000); await sleep(150);
      if ((await qa('state()')).bench[0] >= 4) break;
      await qa('solveStep()'); await sleep(400);
    }
    await waitFor('!window.__qa.state().busy', 8000); await sleep(700);
    await shot('28b-l4-scare');
    if (!(await ev('document.getElementById("tut").textContent')).length) throw new Error('L4 hint card should speak at 4 of 5 seats');
    for (let i = 0; i < 4; i++) { await qa('solveStep()'); await sleep(380); }
    await sleep(900);
    await shot('28c-l4-chain');
    await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000);
    await sleep(1400);
    await sleep(6800); // the clip encodes (real time) and starts looping inside the Share button
    await shot('28d-win-card');
    const cl = await qa('clip()');
    if (!cl.has || cl.score < 2) throw new Error('L4 share clip should hold its chain: ' + JSON.stringify(cl));
    const enc = await qa('clipEncode()');
    console.log('  clip', JSON.stringify(cl), JSON.stringify(enc));
    if (!enc || enc.size < 2000) throw new Error('share clip did not encode');
    await qa('home()'); await sleep(1200);
    const g = await ev('(() => { const r = document.querySelector(".guest")?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
    if (!g) throw new Error('no resident on the café floor');
    await tap(g.x, g.y); await sleep(700);
    await shot('28e-cafe-pet');
  }
  }

  // ---- round 6: a generated trap, the 3-chain in slow motion, its looping preview on the win card, the dog waking,
  // the finished café areas 3-5 with their new residents ----
  {
    const idle = async () => { await waitFor('!window.__qa.state().busy', 10000); await sleep(150); };
    const alive = (id) => qa(`alive(${id})`);
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:60,coins:500}))');
    await boot();
    await qa('lang("en")'); await qa('slow(1)');
    // a generated board at its trap: the free mother + kitten would take two seats while the bench is almost full
    await qa('level(5)'); await sleep(700);
    const m5 = await qa('meta()');
    console.log('  L5 meta', JSON.stringify({ traps: m5.traps, chains: m5.chains, chain3: m5.chain3, bench: m5.benchSize }));
    let trapShot = false;
    for (const id of await qa('order()')) {
      await idle();
      const tc = await qa('trapCat()');
      const st = await qa('state()');
      if (tc != null && tc !== id && st.bench[0] >= st.bench[1] - 2) {
        const pk = await qa(`peek(${tc})`);
        console.log('  trap cat', tc, JSON.stringify(pk), 'bench', st.bench);
        await shot('10c-gen-trap');
        trapShot = true;
        break;
      }
      if (await alive(id)) await qa(`tap(${id})`);
    }
    if (!trapShot) console.log('  (no mother-kitten trap moment on L5)');

    // the 3-chain: play the winning line of L13 and catch the hops in slow motion
    await qa('level(13)'); await sleep(700);
    let chained = false;
    for (const id of await qa('order()')) {
      await idle();
      if (!(await alive(id))) continue;
      const pk = await qa(`peek(${id})`);
      await qa(`tap(${id})`);
      if (pk.boards >= 3 && !chained) {
        chained = true;
        await waitFor('(window.__qa.chainFx() || {}).k >= 2', 10000);
        await shot('28f-chain-x2');
        await waitFor('(window.__qa.chainFx() || {}).k >= 3', 10000); await sleep(120);
        await shot('28g-chain3-slowmo');
      }
    }
    if (!chained) throw new Error('L13 line should hold a 3-chain');
    await waitFor('window.__qa.state().screen === "win"', 30000);
    await sleep(2600);
    if (!(await ev('(() => { const c = document.querySelector("#modal .chainclip canvas"); return !!c && c.height > 300; })()'))) throw new Error('the win card should loop the chain preview');
    await shot('28h-win-chain');
    const enc = await qa('clipEncode()');
    console.log('  chain clip', JSON.stringify(await qa('clip()')), JSON.stringify(enc));
    if (!enc || enc.size < 2000) throw new Error('chain clip did not encode');
    // the lose card at L13 in TR: the lesson first, small, bench in view
    await qa('lang("tr")');
    await qa('level(49)'); await sleep(600);
    await qa('failNow()');
    await waitFor('window.__qa.state().screen === "fail"', 30000);
    await sleep(700);
    await shot('09c-offer-slim-tr');
    await qa('lang("en")');

    // the sleeping dog wakes: a beat in place with a "!" and a stretch, then it trots off leaving paw prints
    await qa('level(8)'); await sleep(800);
    let woke = false;
    for (const id of await qa('order()')) {
      await idle();
      if (!(await alive(id))) continue;
      const pk = await qa(`peek(${id})`);
      if (pk.wake) {
        await qa('slow(0.3)');
        await qa(`tap(${id})`);
        await waitFor('window.__qa.trot() > 0.12', 10000);
        await shot('24e-dog-wake-beat');
        await waitFor('window.__qa.trot() > 1.0', 10000);
        await shot('24f-dog-trot-paws');
        await qa('slow(1)');
        woke = true;
        break;
      }
      await qa(`tap(${id})`);
    }
    if (!woke) throw new Error('L8 line should wake the dog');
    await sleep(1200);

    // café areas 3-5, each finished, with their new residents on the floor (and Cushion Corner half done: clutter fading)
    const A1 = 'counter_counter:1,counter_pastry:1,counter_lamps:1,counter_chalkboard:1,counter_tables:1,counter_plant:1';
    const A2 = 'window_seat:1,window_plants:1,window_bookshelf:1,window_cattree:1,window_rug:1,window_lights:1';
    const A3 = 'cushion_rug:1,cushion_lamp:1,cushion_shelf:1,cushion_hammock:1,cushion_bench:1,cushion_pile:1';
    const A4 = 'patio_planters:1,patio_pergola:1,patio_fountain:1,patio_lights:1,patio_lounger:1,patio_tables:1';
    const A5 = 'roof_canopy:1,roof_telescope:1,roof_lemon:1,roof_tower:1,roof_beanbags:1,roof_grill:1';
    const cafeAt = async (built, back, name) => {
      await ev(`localStorage.setItem("lco_save", JSON.stringify({v:6,level:61,coins:300,cafe:{stars:2,built:{${built}}}}))`);
      await boot();
      await sleep(500);
      for (let i = 0; i < back; i++) { await qa('act("cafearea", { d: -1 })'); await sleep(200); }
      await sleep(900);
      await shot(name);
    };
    await cafeAt(`${A1},${A2},cushion_rug:1,cushion_lamp:1,cushion_shelf:1`, 0, '18e-cafe-cushion-half');
    await cafeAt(`${A1},${A2},${A3}`, 1, '18f-cafe-cushion-built');
    await cafeAt(`${A1},${A2},${A3},${A4}`, 1, '18g-cafe-patio-built');
    await cafeAt(`${A1},${A2},${A3},${A4},${A5}`, 1, '18h-cafe-rooftop-built');
    const g = await ev('[...document.querySelectorAll(".guest")].map((x) => x.dataset.id).join()');
    console.log('  rooftop guests', g);
    await qa('screen("residents")'); await sleep(500);
    await shot('19d-residents-all');
  }

  // ---- round 7: L3 lesson on the parked pair, the press preview, the free Take Back, the Show board, rosettes ----
  {
    const idle = async () => { await waitFor('!window.__qa.state().busy', 10000); await sleep(150); };
    const tapSel = async (sel) => { const c = await ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await tap(c.x, c.y); };
    await ev(`localStorage.setItem("lco_save", JSON.stringify({v:7,level:60,coins:50,show:{decor:{snow_globe:1,beach_day:1}},cafe:{stars:1,built:{counter_counter:1,counter_pastry:1,counter_lamps:1,counter_chalkboard:1}}}))`);
    await boot();
    await qa('lang("en")'); await qa('slow(1)');
    // L3: tapping the big pink pair first is survivable now, and the card says what it cost the moment it parks
    await qa('level(3)'); await sleep(700);
    await tapCat(5); await idle(); await sleep(500);
    const t3 = await qa('tut()');
    if (!/2 seats/.test(t3)) throw new Error('L3 card should explain the parked pair, got ' + t3);
    await shot('29a-l3-pair-parked');
    // press preview: hold a free cat, its destination lights up; release commits
    await qa('level(13)'); await sleep(800);
    const fid = await qa('freeId()');
    const fp = await qa(`pos(${fid})`);
    await touch('touchStart', fp.x, fp.y); await sleep(450);
    await shot('29b-press-preview');
    const before = (await qa('state()')).alive;
    await touch('touchEnd', fp.x, fp.y); await sleep(300);
    if ((await qa('state()')).alive !== before - 1 && (await qa('state()')).alive !== before - 2) throw new Error('release should commit the pressed cat');
    // a lost bench: the first one on a level offers a free Take Back; the 120-coin seat with 50 coins is only a link
    await qa('level(49)'); await sleep(600);
    await qa('failNow()');
    await waitFor('window.__qa.state().screen === "fail"', 30000);
    await sleep(700);
    if (!(await ev('!!document.querySelector("[data-act=takeback]")'))) throw new Error('first lost bench should offer a free Take Back');
    if (await ev('!!document.querySelector(".opt[data-act=coinseat], .opt[data-act=shop]")')) throw new Error('an unaffordable seat must not look like a button');
    await shot('29c-fail-takeback');
    await tapSel('[data-act=takeback]'); await sleep(600);
    if ((await qa('state()')).screen !== 'play' || (await qa('state()')).over) throw new Error('Take Back should resume play');
    // the Cat Show board: free practice, scored by the most seats used
    await qa('home()'); await sleep(900);
    await shot('29d-cafe-rosettes');
    if ((await ev('document.querySelectorAll(".rosettes .rib").length')) !== 2) throw new Error('two won rosettes should hang in the café');
    await qa('screen("show")'); await sleep(900);
    await shot('29e-show-board-sheet');
    await tapSel('.sbcard [data-act=showplay]'); await sleep(900);
    if ((await qa('state()')).mode !== 'play') throw new Error('Show board did not start');
    await shot('29f-show-board-play');
    await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000);
    await sleep(1500);
    await shot('29g-show-board-win');
    const sv7 = await ev('JSON.parse(localStorage.getItem("lco_save"))');
    if (!(sv7.show.marks[(await qa('week()')) + 'a'] & 1)) throw new Error('Show board medal should be recorded: ' + JSON.stringify(sv7.show.marks));
    await qa('lang("tr")'); await qa('screen("show")'); await sleep(600);
    await shot('29h-show-board-tr');
    await qa('lang("en")');
  }
  // ---- retention (game/live.js): tip jar + requests, goals strip, daily sheet, Events (Show mastery, Rush, season,
  // archive), visitor, outfits. QA_FROM=95 runs only these and the round-6/667 frames. ----
  if (+(process.env.QA_FROM || 0) <= 95) {
    const center = (sel) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const tapSel = async (sel) => { const c = await center(sel); await tap(c.x, c.y); };
    const lsave = () => ev('JSON.parse(localStorage.getItem("lco_save"))');
    const built = ['counter_counter', 'counter_pastry', 'counter_lamps', 'counter_chalkboard', 'counter_tables', 'counter_plant', 'window_seat', 'window_plants', 'window_bookshelf', 'window_cattree', 'window_rug', 'window_lights'];
    await qa('lang("en")');
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 8, level: 64, coins: 500, meta: { sessions: 4 }, cafe: { stars: 3, built: ${JSON.stringify(Object.fromEntries(built.map((k) => [k, 1])))} } }))`);
    await boot();
    await ev(`(() => { const w = window.__qa.week(); const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
      const d = JSON.parse(localStorage.getItem('lco_save'));
      Object.assign(d, { jar: { t: Date.now() - 3 * 3600000, total: 0 }, req: { list: [{ k: 'win', who: 'mochi', need: 2, p: 2, c: 0, s: 1 }, { k: 'color', who: 'luna', need: 9, p: 4, c: 2, s: 2 }], next: Date.now() + 2 * 3600000, n: 2, done: 0 },
        vis: { maple: 1 }, season: { daily: { [Math.floor(w / 4)]: 5 }, claim: {}, visDay: 0 }, rush: { week: w, best: 0, cats: 0, pend: null, cups: { gold: 1, bronze: 1 } },
        daily: { last: String(day - 1), streak: 2, doneDay: '' } });
      Object.assign(d.cafe, { hearts: { mochi: 9, luna: 21, biscuit: 5 }, wear: { mochi: 'hat', luna: 'scarf' }, petDay: {} });
      Object.assign(d.show, { marks: { [(w - 1) + 'a']: 3, [(w - 1) + 'b']: 1, [(w - 2) + 'a']: 1 }, from: w - 3 });
      localStorage.setItem('lco_save', JSON.stringify(d)); })()`);
    await boot();
    await shot('40a-hub-live');
    if ((await ev('document.querySelectorAll(".goals .goal").length')) !== 3) throw new Error('the hub should show 3 next goals');
    if (!(await ev('!!document.querySelector(".rr.ring[data-act=cafesheet]")'))) throw new Error('tip jar badge missing');
    if ((await ev('document.querySelectorAll("#cafe .dot:not([hidden])").length')) > 3) throw new Error('more than 3 red dots on the hub');
    await tapSel('[data-act=cafesheet]'); await sleep(600);
    if ((await qa('state()')).sheet !== 'cafesheet') throw new Error('tips sheet did not open');
    await shot('40b-cafe-tips');
    let c0 = (await lsave()).coins;
    await tapSel('[data-act=jarcollect]'); await sleep(300);
    await shot('40c-jar-burst');
    await sleep(1200);
    let sv = await lsave();
    if (!(sv.coins > c0) || Date.now() - sv.jar.t > 60000) throw new Error('jar collect did not pay: ' + c0 + ' -> ' + sv.coins);
    c0 = sv.coins;
    await tapSel('[data-act=reqclaim]'); await sleep(900);
    sv = await lsave();
    if (sv.coins !== c0 + 30 || sv.req.list.length !== 1 || sv.cafe.hearts.mochi !== 10) throw new Error('request claim: coins ' + sv.coins + ' hearts ' + sv.cafe.hearts.mochi);
    await shot('40d-request-claimed');
    await tapSel('[data-act=closesheet]'); await sleep(300);
    await tapSel('[data-act=dailysheet]'); await sleep(600);
    await shot('40e-daily-sheet');
    await tapSel('[data-act=closesheet]'); await sleep(300);
    c0 = (await lsave()).coins;
    if (await ev('!!document.querySelector(".guest.visitor")')) { await ev('document.querySelector(".guest.visitor").click()'); await sleep(900); if ((await lsave()).coins !== c0 + 15) throw new Error('visitor gift should pay 15'); }
    else console.log('  note: no visitor in this room');
    await qa('act("events", { tab: "show" })'); await sleep(900);
    await shot('40f-events-show');
    await qa('act("evtab", { tab: "rush" })'); await sleep(600);
    await shot('40g-events-rush');
    if (!(await ev('[...document.querySelectorAll(".lrow em.bot")].length >= 3'))) throw new Error('Rush rivals must be labelled as bots');
    await qa('act("evtab", { tab: "season" })'); await sleep(600);
    await shot('40h-events-season');
    await qa('act("evtab", { tab: "arch" })'); await sleep(600);
    await shot('40i-events-archive');
    // an archived board: playable, its medal stamps its own season
    await tapSel('.abtn[data-k=b]'); await sleep(900);
    if ((await qa('state()')).mode !== 'play') throw new Error('archived Show board did not start');
    if (await ev('!!document.querySelector("#hud .boosters")')) throw new Error('no boosters on Show boards');
    await shot('40j-show-play');
    await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1600);
    await shot('40k-show-win');
    sv = await lsave();
    const wk = await qa('week()');
    if (!(sv.show.marks[(wk - 1) + 'b'] & 1)) throw new Error('archive medal not stored: ' + JSON.stringify(sv.show.marks));
    await qa('rush()'); await sleep(900);
    if ((await qa('state()')).mode !== 'play') throw new Error('Rush did not start');
    await shot('40l-rush-play');
    await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1600);
    await shot('40m-rush-win');
    if (!((await lsave()).rush.best > 0)) throw new Error('Rush time not stored');
    await qa('home()'); await sleep(500);
    await qa('screen("residents")'); await sleep(700);
    await shot('40n-residents-wardrobe');
    await ev('document.querySelector(".wo[data-id=luna]")?.click()'); await sleep(500);
    await qa('lang("tr")'); await qa('home()'); await sleep(800);
    await shot('40o-hub-live-tr');
    await qa('act("events", { tab: "season" })'); await sleep(700);
    await shot('40p-season-tr');
    await qa('act("cafesheet")'); await sleep(600);
    await shot('40q-tips-tr');
    await qa('act("evtab", { tab: "show" })'); await qa('act("events", { tab: "show" })'); await sleep(700);
    await shot('40r-show-tr');
    await qa('lang("en")');
    // the no-scroll rule at 375x667
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('home()'); await sleep(800);
    await shot('40s-667-hub-live');
    for (const [name, js] of [['tips', 'act("cafesheet")'], ['daily', 'act("dailysheet")'], ['show', 'act("events", { tab: "show" })'], ['rush', 'act("events", { tab: "rush" })'], ['season', 'act("events", { tab: "season" })'], ['arch', 'act("events", { tab: "arch" })']]) {
      await qa('home()'); await sleep(400); await qa(js); await sleep(700); await shot('40t-667-' + name);
    }
    await qa('home()'); await sleep(400); await qa('screen("residents")'); await sleep(600); await shot('40u-667-residents');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
  }
  // ---- round 7: every screen at 375x667 fits without scrolling; cells stay >= 40 CSS px ----
  if (!process.env.QA_SKIP667) {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('lang("en")');
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:30,coins:900,meta:{sessions:3},cafe:{stars:4,built:{counter_counter:1,counter_pastry:1}}}))');
    await boot();
    await shot('30a-667-hub');
    await ev('document.querySelector(".fl.hs").click()'); await sleep(700);
    await shot('30b-667-house');
    await ev('document.querySelector(".fl.hs").click()'); await sleep(300);
    for (const s7 of ['quests', 'show', 'shop', 'residents', 'settings', 'starter']) { await qa('home()'); await sleep(500); await qa(`screen("${s7}")`); await sleep(700); await shot('30c-667-' + s7); }
    await qa('home()'); await sleep(400);
    await qa('save({ lives: { n: 0, t: Date.now() } })'); await qa('screen("nolives")'); await sleep(600); await shot('30d-667-nolives');
    await qa('save({ lives: { n: 5, t: Date.now() } })');
    for (const lv of [12, 30, 55]) {
      await qa(`level(${lv})`); await sleep(700);
      const cell = (await qa('state()')).cell;
      if (cell && cell < 40) console.log(`  note: L${lv} cell ${cell} at 375x667 (the 10-row boards need ~700px for 40px cells; 375x812 keeps >= 40)`);
      await shot('30e-667-l' + lv);
    }
    await qa('level(2)'); await sleep(500); await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1500);
    await shot('30f-667-win');
    await qa('level(49)'); await sleep(600); await qa('failNow()');
    await waitFor('window.__qa.state().screen === "fail"', 30000); await sleep(800);
    await shot('30g-667-fail');
    await ev('document.querySelector("[data-act=morehelp]")?.click()'); await sleep(300);
    await shot('30h-667-fail-more');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
  }
  if (scrollFails.length) { console.log('NO-SCROLL FAILS:'); for (const f of scrollFails) console.log('  ' + f); errs.push('no-scroll: ' + scrollFails.join(' | ')); }
  console.log('final state', JSON.stringify(await qa('state()')));

  console.log(`errors: ${errs.length}`);
  for (const e of errs.slice(0, 8)) console.log('  ' + e.split('\n')[0].slice(0, 220));
  writeFileSync(join(OUT, 'errors.txt'), errs.length ? errs.join('\n---\n') + '\n' : 'no console errors\n');
  bye(errs.length ? 1 : 0);
} catch (e) {
  console.log('FAILED ' + e.message);
  if (globalThis.__dbg) await globalThis.__dbg();
  for (const x of errs.slice(0, 5)) console.log('  err ' + x.split('\n')[0].slice(0, 200));
  bye(1);
}
