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
  // R11 fix 2: frames show the public address form (link, typed code and QR share it); QA_LOCAL_URL=1 keeps localhost
  if (!process.env.VITE_PUBLIC_URL && !process.env.QA_LOCAL_URL) process.env.VITE_PUBLIC_URL = 'https://example.github.io/long-cat-out/';
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', env: process.env });
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

  // ---- juice strips: the signature send (crouch, noodle stretch, leap, paws-first landing, fold, tail flick) and a
  // bench chain, frame by frame on a stepped clock. QA_STRIPS=1 runs only these. ----
  const strips = async () => {
    const save = (name, url) => writeFileSync(join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
    await qa('lang("en")');
    await qa('level(1)'); await sleep(900);
    const mid = await qa('matchId()');
    if (mid == null) throw new Error('L1 should start with a free cat of the front colour');
    let r = await qa(`strip(${mid}, [0.04, 0.1, 0.16, 0.21, 0.26, 0.31, 0.37, 'end'], 4)`);
    save('_leap-strip.jpg', r.url);
    console.log('  strip _leap-strip.jpg ' + r.times.map((x) => Math.round(x * 1000)).join(','));
    await waitFor('!window.__qa.state().busy', 8000);
    // L2: park the two blues, then the orange carrier's cat sets off the 2-chain
    await qa('level(2)'); await sleep(700);
    for (const id of [0, 1, 2]) { await waitFor('!window.__qa.state().busy', 8000); await qa(`tap(${id})`); await sleep(250); }
    await waitFor('!window.__qa.state().busy', 8000); await sleep(400);
    r = await qa('strip(3, [0.35, 0.7, 0.95, 1.12, 1.3, 1.5, 1.7, 1.95, 2.3], 3, true)');
    save('_chain-strip.jpg', r.url);
    console.log('  strip _chain-strip.jpg');
    await waitFor('!window.__qa.state().busy', 8000);
  };
  if (process.env.QA_STRIPS) { await strips(); console.log(`errors: ${errs.length}`); for (const e of errs.slice(0, 8)) console.log('  ' + e.split(String.fromCharCode(10))[0].slice(0, 220)); bye(errs.length ? 1 : 0); await new Promise(() => {}); }

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
  // home opens on the map since R10: the room's build button sits under it, so tap the goal card's row
  const lamp = await ev('(() => { const r = document.querySelector(".trow[data-id=counter_pastry]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
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
  await qa('level(52)'); await sleep(500);
  if ((await qa('state()')).bench[1] !== 6) throw new Error('Luna should add a seat on a hard first try, got ' + (await qa('state()')).bench);
  await qa('level(52)'); await sleep(500);
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
  await tapSel('[data-act=stab4][data-tab=coins]'); await sleep(300); // R10 shop: bundles live on the Coins tab
  await tapSel('[data-id=coins500]'); await sleep(1300);
  if ((await lsave()).coins !== coinsBefore + 500) throw new Error('coin pack did not pay');
  await ev('document.querySelector("#sheet .pbody").scrollTop = 9999'); await sleep(300);
  await shot('21f-shop-bottom');
  await ev('document.querySelector("#sheet .pbody").scrollTop = 0');
  await tapSel('[data-act=stab4][data-tab=offers]'); await sleep(300); // R10 shop: the Starter pack is on the Offers tab
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

  // 24 mechanics: sleeping dog (L8), yarn (L12), mystery (L41, L40 is a boss), frozen (L55); teaching level each, then the reaction
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
  await qa('level(41)'); await sleep(900);
  if ((await mech()).hidden < 1) throw new Error('level 41 should have a mystery cat');
  await shot('26a-mystery-teach');
  await stepUntil((b, a) => a.hidden < b.hidden, { slow: 0.3, wait: 1300 });
  await shot('26b-mystery-revealed');
  await qa('slow(1)'); await sleep(1500);
  await qa('lang("tr")'); await qa('level(41)'); await sleep(900);
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
    if (!cl.has || !cl.plan || cl.plan.n < 2) throw new Error('L4 share clip should hold its chain: ' + JSON.stringify(cl));
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
    if ((await ev('document.querySelectorAll(".goals .goal.feat").length')) !== 1) throw new Error('the hub should feature exactly one goal (R11; the next resident sits on the build card)');
    if (!(await ev('!!document.querySelector(".rr.ring[data-act=jartap], .jar7")'))) throw new Error('tip jar missing (rail or counter)');
    if ((await ev('document.querySelectorAll("#cafe .dot:not([hidden])").length')) > 3) throw new Error('more than 3 red dots on the hub');
    await qa('act("cafesheet")'); await sleep(600);
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
  // ---- round 10 retention: hub spotlight, tip jar on the counter, request bubble, house view with the next floor,
  // Cat Street with house 2, renovation, visitor arrival + nook, Pip preview. QA_FROM=96 runs these and later. ----
  if (+(process.env.QA_FROM || 0) <= 96) {
    const lsave = () => ev('JSON.parse(localStorage.getItem("lco_save"))');
    const ground = ['counter_counter', 'counter_pastry', 'counter_lamps', 'counter_chalkboard', 'counter_tables', 'counter_plant', 'window_seat', 'window_plants', 'window_bookshelf', 'window_cattree', 'window_rug', 'window_lights'];
    const upper = ['cushion_rug', 'cushion_lamp', 'cushion_shelf', 'cushion_hammock', 'cushion_bench', 'cushion_pile', 'patio_planters', 'patio_pergola', 'patio_fountain', 'patio_lights', 'patio_lounger', 'patio_tables', 'roof_canopy', 'roof_telescope', 'roof_lemon', 'roof_tower', 'roof_beanbags', 'roof_grill'];
    const edit = (js) => ev(`(() => { const d = JSON.parse(localStorage.getItem('lco_save')); const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000); ${js}; localStorage.setItem('lco_save', JSON.stringify(d)); })()`);
    // nothing else claimable (tasks, calendar, daily done), so the spotlight shows what the seed sets up
    const calm = `Object.assign(d, { quests: { day, list: [], chest: 1 }, login: { last: day, idx: 1 }, daily: { last: String(day), streak: 1, doneDay: String(day) } })`;
    const seed = async (extra) => {
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 8, level: 40, coins: 400, meta: { sessions: 4 }, cafe: { stars: 0, built: ${JSON.stringify(Object.fromEntries(ground.map((k) => [k, 1])))} } }))`);
      await boot();
      await edit(calm + '; ' + extra);
      await boot();
    };
    const fits = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].every((e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1)`);
    const ground0 = async () => { await qa('act("cafearea", { d: -9 })'); await sleep(900); };
    await qa('lang("en")');
    // a finished request: Mochi's bubble in the ground floor room is the one spotlight
    await seed(`d.req = { list: [{ k: 'win', who: 'mochi', need: 2, p: 2, c: 0, s: 1 }], next: Date.now() + 3600000, n: 1, done: 0 }; d.jar = { t: Date.now() - 600000, total: 0 }; d.cafe.hearts = { mochi: 5 }`);
    await ground0();
    await shot('70a-request-bubble');
    if (!(await ev('!!document.querySelector(".rqbub.spot")'))) throw new Error('the ready request should be a spotlit bubble over its resident');
    if ((await ev('document.querySelectorAll("#cafe .spot").length')) !== 1) throw new Error('exactly one spotlight on the hub');
    if ((await ev('document.querySelectorAll(".rrail .rr").length')) > 4) throw new Error('the right rail keeps at most 4 icons');
    let c0 = (await lsave()).coins;
    await ev('document.querySelector(".rqbub").click()'); await sleep(1700);
    if ((await lsave()).coins !== c0 + 30) throw new Error('the bubble should claim the request');
    // a full tip jar on the counter is the spotlight
    await seed(`d.jar = { t: Date.now() - 5 * 3600000, total: 0 }`);
    await ground0();
    await shot('70b-jar-on-counter');
    if (!(await ev('!!document.querySelector(".jar7.full.spot")'))) throw new Error('a full jar should sit spotlit on the counter');
    c0 = (await lsave()).coins;
    await ev('document.querySelector(".jar7").click()'); await sleep(350);
    await shot('70c-jar-collect');
    await sleep(1500);
    if (!((await lsave()).coins > c0)) throw new Error('tapping the counter jar should collect');
    // nothing claimable: the affordable next build is the spotlight
    await seed(`d.cafe.stars = 5; d.jar = { t: Date.now() - 600000, total: 0 }`);
    await shot('70d-hub-spotlight-build');
    if (!(await ev('!!document.querySelector(".nbcard .trow.spot")'))) throw new Error('the affordable next build should be the spotlight');
    if (!(await fits('.goal .gt b'))) throw new Error('a goal label overflows');
    // house view: the next floor shows early with what it unlocks, and the sign to Cat Street
    await ev('document.querySelector(".fl.hs").click()'); await sleep(800);
    await shot('70e-house-next-floor');
    if (!(await ev('!!document.querySelector(".hnext")'))) throw new Error('the next floor preview is missing');
    if (!(await ev('!!document.querySelector(".streetbtn")'))) throw new Error('the Cat Street sign is missing');
    await ev('document.querySelector(".fl.hs").click()'); await sleep(300);
    // Cat Street: the Bakery done (Crumb in front), the Library under construction, the Florist as a silhouette
    await edit(`for (const k of ${JSON.stringify(upper)}) d.cafe.built[k] = 1; d.cafe.street = 11; d.cafe.stars = 4; d.level = 90; d.vis = { maple: 1, hazel: 2 }; d.jar = { t: Date.now() - 600000, total: 0 }`);
    await boot();
    await shot('70f-street-house2');
    if (!(await ev('!!document.querySelector(".vstreet .sh.sc") && !!document.querySelector(".sh .keeper")'))) throw new Error('street view with house 2 missing');
    const s0 = (await lsave()).cafe.street;
    await ev('document.querySelector("[data-act=streetbuild]").click()'); await sleep(1200);
    if ((await lsave()).cafe.street !== s0 + 1) throw new Error('the street build did not add a piece');
    await shot('70g-street-built');
    // a finished room: a renovation set restyles it; the visitors live on their nooks there
    await edit('d.cafe.stars = 9');
    await boot(); await ground0();
    await ev('document.querySelector("[data-act=reno]").click()'); await sleep(1300);
    await shot('70h-reno-nooks');
    if (!(await ev('!!document.querySelector(".reno-g") && !!document.querySelector(".nook7")'))) throw new Error('renovation set or visitor nook missing');
    if (!(await lsave()).cafe.style.counter) throw new Error('renovation style not stored');
    // the season: what inviting the next visitor changes, then the arrival scene
    await edit(`const s = Math.floor(window.__qa.week() / 4); d.vis = {}; d.season = { daily: { [s]: 5 }, claim: {}, visDay: 0 }`);
    await boot();
    await qa('act("events", { tab: "season" })'); await sleep(800);
    await shot('70i-season-preview');
    if (!(await ev('!!document.querySelector(".vprev")'))) throw new Error('visitor preview card missing');
    await edit(`const s = Math.floor(window.__qa.week() / 4); d.season.daily[s] = 9`);
    await boot();
    await qa('act("seasonclaim")'); await sleep(650);
    await shot('70j-visitor-arrival-walk');
    await sleep(1700);
    await shot('70k-visitor-arrival-card');
    if (!(await ev('!!document.querySelector("#arrival .arcard")'))) throw new Error('visitor arrival scene missing');
    await ev('document.querySelector("#arrival .arcard [data-act=arrivalclose]").click()'); await sleep(900);
    await shot('70l-visitor-nook');
    if (!(await ev('!!document.querySelector(".guest.visitor.idle7")'))) throw new Error('the new visitor should idle on its nook');
    // Turkish: the labels fit
    await qa('lang("tr")'); await qa('home()'); await sleep(800);
    await shot('70m-street-tr');
    await ground0();
    await shot('70n-room-tr');
    if (!(await fits('.goal .gt b, .nbcard .tname b, .rqbub b'))) throw new Error('a Turkish hub label overflows');
    await qa('lang("en")');
    // 375x667: the street and the season sheet fit (the no-scroll check runs on every shot)
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('home()'); await sleep(800);
    await shot('70o-667-street');
    await qa('act("events", { tab: "season" })'); await sleep(700);
    await shot('70p-667-season');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
  }
  // ---- round 9 juice: send/chain strips, board-clear sweep, compact win card, hearts drop at once on a lost life ----
  if (+(process.env.QA_FROM || 0) <= 99) {
    await strips();
    await qa('lang("en")');
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:30,coins:900,meta:{sessions:3},cafe:{stars:0,built:{counter_counter:1,counter_pastry:1}}}))');
    await boot();
    // an ordinary first clear (no chain replay, normal level): the first such board from L30 on
    let lvc = 30;
    for (; lvc < 40; lvc++) {
      await ev(`(() => { const d = JSON.parse(localStorage.getItem('lco_save')); d.level = ${lvc}; localStorage.setItem('lco_save', JSON.stringify(d)); })()`);
      await boot();
      await qa(`level(${lvc})`); await sleep(600);
      await qa('winNow()');
      await waitFor('window.__qa.sweep()', 30000); await sleep(330);
      if (lvc === 30) await shot('50a-board-sweep');
      await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1400);
      if (await ev('!!document.querySelector("#modal .card.win.compact")')) break;
    }
    if (lvc >= 40) throw new Error('no ordinary clear in L30-39 showed the compact win card');
    console.log('  compact win on L' + lvc);
    const nb = await ev('(() => { const b = document.querySelector("#modal .card.win.compact .nextrow [data-act=next]").getBoundingClientRect(); return b.top > innerHeight * 0.6 && b.height >= 48; })()');
    if (!nb) throw new Error('compact win: the one action should sit low (thumb) and be >= 48px tall');
    await shot('50b-win-compact');
    await qa('lang("tr")');
    await ev(`(() => { const d = JSON.parse(localStorage.getItem('lco_save')); d.level = ${lvc}; localStorage.setItem('lco_save', JSON.stringify(d)); })()`);
    await qa(`level(${lvc})`); await sleep(600); await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1400);
    const clip = await ev('[...document.querySelectorAll("#modal .card.win *")].filter((e) => e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim()).slice(0, 4)');
    if (clip.length) throw new Error('compact win TR text clipped: ' + clip.join(' | '));
    await shot('50c-win-compact-tr');
    await qa('lang("en")');
    // a lost life: the HUD hearts count drops the moment the bench overflows
    await qa('save({ lives: { n: 5, t: Date.now() } })');
    await qa('level(49)'); await sleep(700);
    const h0 = +(await ev('document.querySelector("#hud-lives b")?.textContent || -1'));
    await qa('failNow()');
    await waitFor('window.__qa.state().screen === "fail"', 30000); await sleep(500);
    const h1 = +(await ev('document.querySelector("#hud-lives b")?.textContent || -1'));
    if (!(h0 === 5 && h1 === 4)) throw new Error('HUD hearts should drop 5 -> 4 on a lost life, got ' + h0 + ' -> ' + h1);
    await shot('50d-fail-hearts');
    await qa('save({ lives: { n: 5, t: Date.now() } })');
    await qa('home()'); await sleep(400);
  }
  // ---- round 9 (fun + readability): L1 pace, the L4 clue, the press preview (lane, destination, LAST SEAT), the Show
  // goal pill, the daily shield and free retry, one shared lane on L12. QA_FROM=100 runs only these and the 667 frames.
  if (+(process.env.QA_FROM || 0) <= 100) {
    await qa('lang("en")');
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:4,coins:300,meta:{sessions:3}}))');
    await boot();
    const idle = () => waitFor('!window.__qa.state().busy', 10000);
    // L1: the first carrier departs well inside 10 s of the board opening (three prompt taps)
    await qa('level(1)');
    const t1 = Date.now();
    await sleep(900); // a first look at the board
    for (let k = 0; k < 3; k++) { await waitFor(`window.__qa.state().alive === ${3 - k} && window.__qa.state().free.length > 0`, 8000); const f = (await qa('state()')).free[0]; await tapCat(f); await sleep(350); }
    await waitFor('window.__qa.state().departed >= 1', 10000);
    const dep = (Date.now() - t1) / 1000;
    console.log('  L1 first departure ' + dep.toFixed(1) + 's');
    if (dep > 10) throw new Error('L1 first carrier departure took ' + dep.toFixed(1) + 's (> 10s)');
    // L4: before the first tap each free cat shows how many carriers it would wait on a cushion (green 1, blue 3)
    await qa('level(4)'); await sleep(900);
    if (!(await qa('waitTags()'))) throw new Error('L4 should show its wait clue before the first tap');
    await shot('60a-l4-clue');
    const pb = await qa('pos(2)');
    await touch('touchStart', pb.x, pb.y); await sleep(450);
    const pi = await qa('pressInfo()');
    if (!pi || pi.dest[0] !== 'seat:3') throw new Error('L4 press on blue should preview a cushion, wait 3: ' + JSON.stringify(pi));
    await shot('60b-l4-press-blue');
    await touch('touchMove', pb.x, pb.y - 260); await sleep(60); await touch('touchEnd', pb.x, pb.y - 260); await sleep(250);
    if (await qa('pressInfo()')) throw new Error('sliding off a pressed cat should cancel it');
    if ((await qa('state()')).bench[0] !== 0) throw new Error('a cancelled press must not park the cat');
    // press preview on a crowded board: park seat-bound cats until a tap would take the LAST free cushion, then hold it
    let lid = null;
    for (const lv of [6, 9, 13, 16]) {
      await qa(`level(${lv})`); await sleep(800);
      for (let k = 0; k < 8; k++) {
        await idle();
        lid = await qa('pressFind("last")');
        if (lid != null) break;
        const sid = await qa('pressFind("seat")');
        if (sid == null) break;
        await qa(`tap(${sid})`); await sleep(200);
      }
      if (lid != null) { console.log('  last-cushion press on L' + lv); break; }
    }
    if (lid == null) throw new Error('no board reached a last-cushion press');
    await idle(); await sleep(500);
    await shot('60c-last-cushion');
    const pl = await qa(`pos(${lid})`);
    await touch('touchStart', pl.x, pl.y); await sleep(450);
    if (!(await qa('pressInfo()'))?.last) throw new Error('holding that cat should flag LAST SEAT');
    await shot('60d-press-last-seat');
    await touch('touchMove', pl.x, 40); await sleep(60); await touch('touchEnd', pl.x, 40); await sleep(250);
    // the press preview on a cat headed for its carrier: the lane out plus the carrier's pattern in the bubble
    const cid = await qa('pressFind("carrier")');
    if (cid != null) {
      const pc = await qa(`pos(${cid})`);
      await touch('touchStart', pc.x, pc.y); await sleep(450);
      await shot('60e-press-carrier');
      await touch('touchMove', pc.x, 40); await sleep(60); await touch('touchEnd', pc.x, 40); await sleep(250);
    }
    // L12: a status toast while the hint card is up never stacks on it (one shared lane)
    await qa('level(12)'); await sleep(900);
    await qa('toast("Bench: 5 seats")'); await sleep(250);
    const lap = await ev(`(() => { const a = document.getElementById('tut'), b = document.querySelector('.toast.inplay'); if (!a || a.hidden || getComputedStyle(a).visibility === 'hidden' || !b) return false;
      const r = a.getBoundingClientRect(), q = b.getBoundingClientRect(); return !(r.right < q.left || q.right < r.left || r.bottom < q.top || q.bottom < r.top); })()`);
    if (lap) throw new Error('L12: the toast overlaps the hint card');
    await shot('60f-l12-lane');
    await sleep(1500);
    // Cat Show: the gold goal pill in the HUD (seat limit board A, chain board B), live as the bench fills
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:30,coins:900,meta:{sessions:3},cafe:{stars:0,built:{counter_counter:1,counter_pastry:1}}}))');
    await boot();
    await qa('showBoard("a")'); await sleep(900);
    const gp = await ev('(() => { const g = document.getElementById("goalpill"); return g && !g.hidden ? g.textContent : null; })()');
    if (!gp || !gp.includes('/')) throw new Error('Show board A should show its goal pill, got ' + gp);
    await qa('benchTo(2)'); await sleep(1800); await idle();
    await shot('60g-show-pill');
    await qa('lang("tr")');
    await qa('showBoard("b")'); await sleep(900);
    const gclip = await ev('(() => { const g = document.getElementById("goalpill"); return !g || g.hidden ? "missing" : g.scrollWidth > g.clientWidth + 1 || g.getBoundingClientRect().right > innerWidth ? "clipped" : ""; })()');
    if (gclip) throw new Error('Show goal pill (TR) ' + gclip);
    await shot('60h-show-pill-tr');
    await qa('lang("en")');
    // daily: a two-day gap is covered by the weekly shield (streak 4 survives); the sheet says so
    const today = await qa('today()');
    await qa(`save({ daily: { last: String(${today - 2}), streak: 4, doneDay: '', shieldW: -1 } })`);
    await qa('home()'); await sleep(500);
    await qa('act("dailysheet")'); await sleep(700);
    const sh = await ev('(() => { const c = document.querySelector(".shieldchip.on"); const b = document.querySelector(".streakhead b"); return c && b ? b.textContent : null; })()');
    if (!sh || !sh.includes('4')) throw new Error('daily sheet should show the ready shield and the kept streak 4, got ' + sh);
    await shot('60i-daily-shield');
    await qa('lang("tr")'); await qa('home()'); await sleep(400); await qa('act("dailysheet")'); await sleep(700);
    const sclip = await ev('[...document.querySelectorAll(".streakhead *")].filter((e) => e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim())');
    if (sclip.length) throw new Error('daily sheet TR clipped: ' + sclip.join(' | '));
    await shot('60j-daily-shield-tr');
    await qa('lang("en")');
    // daily: a lost bench costs no life (free retry)
    await qa('save({ lives: { n: 5, t: Date.now() } })');
    await qa('daily()'); await sleep(800);
    const l0 = await qa('lives()');
    await qa('failNow()');
    await waitFor('window.__qa.state().screen === "fail"', 30000); await sleep(600);
    const l1 = await qa('lives()');
    if (l0 !== l1) throw new Error('a lost daily should cost no life: ' + l0 + ' -> ' + l1);
    await shot('60k-daily-fail-free');
    await qa('home()'); await sleep(400);
  }
  // ---- share clip + friend challenge: the Share clip card at the first chain x3, three frames of the offscreen 9:16
  // clip (setup, peak, end card), the encode, the challenge landing on a fresh save, the board, the result, the normal
  // flow after it, a hostile link. QA_FROM=101 runs only these and the 667 frames. ----
  if (+(process.env.QA_FROM || 0) <= 101) {
    const saveImg = (name, url) => writeFileSync(join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
    const idle = async () => { await waitFor('!window.__qa.state().busy', 10000); await sleep(150); };
    const playLine = async () => { for (const id of await qa('order()')) { await idle(); if (await qa(`alive(${id})`)) await qa(`tap(${id})`); } };
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:60,coins:500,meta:{sessions:3}}))');
    await boot();
    await qa('lang("en")'); await qa('slow(1)');
    await qa('level(13)'); await sleep(700);
    await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1200);
    const cl = await qa('clip()');
    console.log('  clip', JSON.stringify(cl));
    if (!cl.has || !cl.plan || cl.plan.kind !== 'chain' || cl.plan.n < 3) throw new Error('L13 share clip should hold its 3-chain: ' + JSON.stringify(cl));
    if (!(await ev('!!document.querySelector("#modal .sharebtn .nudge")'))) throw new Error('the first chain x3 should show the Share clip nudge');
    // R9 QA: the first-chain headline names the chain actually made (an x4 first chain read "Your first chain x3!")
    const fch = await ev('document.querySelector("#modal").innerText');
    const fm = /first chain x(\d)/.exec(fch); const fb = /Best chain x(\d)/.exec(fch);
    if (!fm || (fb && fm[1] !== fb[1])) throw new Error('the first-chain headline should name the chain made: ' + fch.replace(/\n+/g, ' | ').slice(0, 160));
    // Dare a friend is live at once; Share clip stays hidden until the video is encoded (never a still by accident)
    if (!(await ev('!!document.querySelector("#modal .sharebtn")'))) throw new Error('Dare a friend should show at once');
    if (cl.canRecord && cl.encoding && !(await ev('document.querySelector("#modal [data-act=shareclip]").hidden'))) throw new Error('Share clip should wait for the encoded video');
    await shot('101a-share-card');
    const fr = await qa('clipFrames([0.3, "tap", "peak", "end"])');
    if (!fr || fr.length !== 4) throw new Error('clip frames missing');
    saveImg('101b-clip-setup.jpg', fr[0].url); saveImg('101b2-clip-punch.jpg', fr[1].url); saveImg('101c-clip-peak.jpg', fr[2].url); saveImg('101d-clip-end.jpg', fr[3].url);
    console.log('  clip frames at ' + fr.map((f) => f.at).join(', ') + ' s');
    const enc = await qa('clipEncode()');
    console.log('  clip encode', JSON.stringify(enc));
    if (!enc || enc.size < 2000) throw new Error('share clip did not encode');
    await sleep(600);
    if (!(await ev('!document.querySelector("#modal [data-act=shareclip]").hidden'))) throw new Error('Share clip should show once the video is ready');
    await shot('101e-share-card-video');
    console.log('  preview is now ' + (await ev('document.querySelector("#modal .chainclip video") ? "the encoded video" : "the canvas"')));
    const dl = await qa('dareLink()');
    console.log('  dare', JSON.stringify(dl));
    if (dl.d.m !== 'chain' || dl.d.g < 3 || !/Beat my chain x\d on Level 13!/.test(dl.text) || !/\?c=[A-Za-z0-9_-]+$/.test(dl.url)) throw new Error('dare link/text wrong: ' + JSON.stringify(dl));
    // a long board: the replay of every move before the moment stays cheap (it runs on the win card)
    await qa('level(45)'); await sleep(600); await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 60000); await sleep(400);
    const perf = await ev('(() => { const t0 = performance.now(); const f = window.__qa.clipFrames(["peak"]); return { ms: Math.round(performance.now() - t0), ok: !!(f && f[0]), plan: window.__qa.clip().plan }; })()');
    console.log('  L45 clip seek-to-peak', JSON.stringify(perf));
    if (perf.plan && perf.ms > 1500) throw new Error('clip replay too slow: ' + perf.ms + ' ms');
    // a later chain x3 never nudges again
    await qa('level(13)'); await sleep(700); await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(900);
    if (await ev('!!document.querySelector("#modal .sharebtn .nudge")')) throw new Error('the share nudge should show only once');
    if (!(await ev('!!document.querySelector("#modal .sharebtn")'))) throw new Error('chain x3 should still offer Share clip');
    // the challenge link on a fresh save: one intro card, then the exact board with its goal
    const code = await qa(`dareCode({ n: 13, b: ${dl.d.b}, k: 'l', m: 'chain', g: 2, nm: 'Ana' })`);
    await ev('localStorage.clear()');
    await boot('?c=' + code);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
    if ((await ev('location.search')).includes('c=')) throw new Error('the challenge code should leave the address bar');
    const land = await ev('document.querySelector("#modal .card.dare").textContent');
    if (!/Ana dares you!/.test(land) || !/Beat a chain x2/.test(land) || !/Tap a cat/.test(land)) throw new Error('landing text: ' + land);
    await shot('101f-dare-landing');
    await qa('lang("tr")');
    await boot('?c=' + code);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
    await shot('101f2-dare-landing-tr');
    await qa('lang("en")');
    await boot('?c=' + code);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(400);
    await ev('document.querySelector("[data-act=dareplay]").click()'); await sleep(900);
    const ds = await qa('state()');
    if (ds.mode !== 'play' || ds.level !== 13) throw new Error('Play should open the challenge board: ' + JSON.stringify(ds));
    if (await ev('document.getElementById("goalpill").hidden')) throw new Error('the challenge board should show its goal pill');
    if (!/Only the front carrier boards/.test(await ev('document.getElementById("tut").textContent')) || !(await qa('teach()'))) throw new Error('the challenge board should teach the front carrier + cushion');
    // R9 QA: the 2-line rule card must not cover the board's bottom row (it hid the faces of the last row's cats)
    const hid = await ev('(() => { const t = document.getElementById("tut").getBoundingClientRect(); const s = window.__qa.state(); return Array.from({ length: s.alive }, (_, i) => i).map((i) => window.__qa.pos(i)).filter((p) => p.y + s.cell * 0.25 > t.top).length; })()');
    if (hid) throw new Error(`the rule card covers ${hid} cat head(s) on the challenge board`);
    await shot('101g-dare-board');
    await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1500);
    const res = await ev('document.querySelector("#modal .dres")?.textContent || ""');
    if (!/You beat Ana's chain x2!/.test(res)) throw new Error('challenge result line: ' + res);
    await shot('101h-dare-result');
    // the big card: Share clip appears on the preview once the clip is encoded
    await qa('clipEncode()'); await sleep(700);
    if ((await qa('clip()')).canRecord && (await ev('document.querySelector("#modal [data-act=shareclip]")?.hidden !== false'))) throw new Error('big card: Share clip should show once encoded');
    await shot('101h2-dare-result-clip-ready');
    await qa('lang("tr")');
    await boot('?c=' + code);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000);
    await ev('document.querySelector("[data-act=dareplay]").click()'); await sleep(700);
    await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1500);
    const resTr = await ev('document.querySelector("#modal .dres")?.textContent || ""');
    if (!/Ana'nın x2 zincirini geçtin!/.test(resTr)) throw new Error('TR challenge result line: ' + resTr);
    const cut = await ev('[...document.querySelectorAll("#modal .card *")].filter((e) => e.children.length === 0 && e.textContent.trim() && (e.scrollWidth > e.clientWidth + 1)).map((e) => e.textContent.trim()).slice(0, 4)');
    if (cut.length) throw new Error('TR result text clipped: ' + cut.join(' | '));
    await shot('101i-dare-result-tr');
    // Continue: a new player goes on into level 1
    await ev('document.querySelector("#modal [data-act=next]").click()'); await sleep(900);
    const after = await qa('state()');
    if (after.mode !== 'play' || after.level !== 1) throw new Error('after the challenge a new player should start level 1: ' + JSON.stringify(after));
    await shot('101j-after-dare-l1');
    await qa('lang("en")'); await ev('document.querySelector("#modal")?.remove()');
    // a hostile link is ignored: normal boot, no card
    await ev('localStorage.clear()');
    await boot('?c=PGltZyBzcmM9eCBvbmVycm9yPWFsZXJ0KDEpPg');
    if (await ev('!!document.querySelector("#modal .card.dare")')) throw new Error('a bad challenge code should be ignored');
    // 375x667: the landing and the share card fit without scrolling
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('lang("tr")');
    await boot('?c=' + code);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
    await shot('101k-667-dare-landing-tr');
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:60,coins:500,meta:{sessions:3}}))');
    await boot(); await qa('lang("tr")');
    await qa('level(13)'); await sleep(700); await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1500);
    await shot('101l-667-share-card-tr');
    const fitBad = await ev('(() => { const c = document.querySelector("#modal .card").getBoundingClientRect(); return [...document.querySelectorAll("#modal .r7row > *, #modal .nudge")].filter((e) => { const r = e.getBoundingClientRect(); return r.right > c.right - 2 || r.left < c.left + 2 || e.scrollWidth > e.clientWidth + 1; }).map((e) => e.className); })()');
    if (fitBad.length) throw new Error('TR share card buttons overflow: ' + fitBad.join(', '));
    await qa('lang("en")');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
  }
  // ---- r9 retention + virality: the next resident as the hub's thread, a newcomer's first request, Daily and the
  // weekly Cat Show pinned in the goals, the challenge link copied only on a real clipboard write. QA_FROM=102. ----
  if (+(process.env.QA_FROM || 0) <= 102) {
    const lsave = () => ev('JSON.parse(localStorage.getItem("lco_save"))');
    await qa('lang("en")');
    // the hub thread: the next piece has no resident, so the card names who moves in next and the stars to go
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:8,coins:120,meta:{sessions:3},cafe:{stars:1,built:{counter_counter:1,counter_pastry:1}}}))');
    await boot(); await sleep(500);
    const th = await ev('document.querySelector(".nbcard .thread")?.textContent || ""');
    if (!/moves in after \d+ stars/.test(th)) throw new Error('build card thread: ' + th);
    await shot('90a-hub-thread');
    // the arrival: the next resident moves in and asks for something at once; back in the hub that request leads the goals
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:8,coins:120,meta:{sessions:3},cafe:{stars:9,built:{counter_counter:1,counter_pastry:1,counter_lamps:1,counter_chalkboard:1,counter_tables:1,counter_plant:1,window_seat:1}}}))');
    await boot(); await sleep(400);
    let guard = 0;
    while ((await qa('state()')).screen !== 'arrive' && guard++ < 6) {
      const bid = await ev('document.querySelector(".nbcard .trow[data-act=build]")?.dataset.id || ""');
      if (!bid) throw new Error('no build card to reach the next resident');
      await qa(`act("build", { id: "${bid}" })`); await sleep(1600);
    }
    await waitFor('window.__qa.state().screen === "arrive"', 6000); await sleep(900);
    const ask = await ev('document.querySelector(".firstreq")?.textContent || ""');
    if (!/asks: /.test(ask)) throw new Error('the arrival card should carry the first request: ' + ask);
    await shot('90b-arrive-first-request');
    await ev('document.querySelector("[data-act=arriveclose]").click()'); await sleep(1200);
    // R10: the newcomer's first request shows exactly once: over the cat in its room, else leading the goals strip
    if ((await ev('document.querySelectorAll(".goals .goal.fresh, .rqbub.ask").length')) !== 1) throw new Error("the newcomer's first request should show exactly once (bubble or goal)");
    if ((await lsave()).req.list.length < 1) throw new Error('first request not stored');
    await shot('90c-hub-first-request');
    // a new day with Events open: today's puzzle and this week's Cat Show medals are the two goals
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:8,level:64,coins:300,meta:{sessions:5},cafe:{stars:0,built:{}}}))');
    await boot();
    await ev(`(() => { const d = JSON.parse(localStorage.getItem('lco_save')); const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
      Object.assign(d, { daily: { last: String(day - 1), streak: 3, doneDay: '' }, quests: { day, list: [], chest: 1 }, login: { last: day, idx: 1 } });
      localStorage.setItem('lco_save', JSON.stringify(d)); })()`);
    await boot(); await sleep(400);
    const gl = await ev('[...document.querySelectorAll(".goals .goal")].map((g) => g.dataset.act + ":" + (g.dataset.tab || ""))');
    if (gl.length !== 1 || gl[0] !== 'daily:') throw new Error('the featured goal should be the Daily, playable in one tap (R11): ' + gl.join(','));
    await shot('90d-hub-daily-show');
    await qa('lang("tr")'); await qa('home()'); await sleep(700);
    await shot('90e-hub-daily-show-tr');
    await qa('lang("en")');
    // the challenge link: with no share sheet and a refused clipboard, no "Link copied" toast; a bar offers the copy
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:60,coins:500,meta:{sessions:3}}))');
    await boot(); await qa('lang("en")');
    await qa('level(2)'); await sleep(500); await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1200);
    await ev(`(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch {}
      window.__clipOk = false; window.__clipText = '';
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: (x) => window.__clipOk ? (window.__clipText = x, Promise.resolve()) : Promise.reject(new Error('denied')) }, configurable: true });
      document.execCommand = () => false; })()`);
    if (!(await ev('!!document.querySelector("#modal [data-act=share]")'))) throw new Error('win card should offer Share');
    await ev('document.querySelector("#modal [data-act=share]").click()'); await sleep(400);
    if (await ev('[...document.querySelectorAll(".toast")].some((t) => /copied/i.test(t.textContent))')) throw new Error('"Link copied" shown although the clipboard write failed');
    if (!(await ev('!!document.querySelector("#linkbar input") && /\\?c=/.test(document.querySelector("#linkbar input").value)'))) throw new Error('the copy-link bar should show the challenge link');
    await shot('91a-copy-link-bar');
    if (!(await ev('(() => { const b = document.querySelector("#linkbar [data-copy]"); const r = b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()'))) throw new Error('a real tap on #linkbar [data-copy] should reach it, not the sheet behind');
    await ev('window.__clipOk = true; document.querySelector("#linkbar [data-copy]").click()'); await sleep(250);
    if (!(await ev('[...document.querySelectorAll(".toast")].some((t) => /Link copied/.test(t.textContent))')) || (await ev('!!document.getElementById("linkbar")'))) throw new Error('a successful copy should toast Link copied and close the bar');
    if (!/\?c=/.test(await ev('window.__clipText'))) throw new Error('the copied text should carry the link');
    await shot('91b-link-copied');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('lang("tr")'); await qa('level(2)'); await sleep(500); await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1200);
    await ev('window.__clipOk = false; document.querySelector("#modal [data-act=share]").click()'); await sleep(400);
    const lbFit = await ev('(() => { const b = document.querySelector("#linkbar [data-copy]"); const r = document.getElementById("linkbar").getBoundingClientRect(); return b.scrollWidth <= b.clientWidth + 1 && r.right <= innerWidth && r.left >= 0; })()');
    if (!lbFit) throw new Error('TR copy-link bar does not fit');
    await shot('91c-667-copy-link-bar-tr');
    await ev('document.getElementById("linkbar")?.remove()');
    await qa('lang("en")');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
  }
  // ---- r10 juice + virality + retention: the chain counter under the bench (ticks per landing, gold on the last), the
  // dare checked against the exact board (match vs beat, fallback), the dare link after a clip, the share funnel, the
  // newcomer's ask over the cat with its reward, the "come back" note after a claim, Cat Street's apprentices.
  // QA_FROM=103 runs only these and the 667 frames. ----
  if (+(process.env.QA_FROM || 0) <= 103) {
    const lsave = () => ev('JSON.parse(localStorage.getItem("lco_save"))');
    const idle = async () => { await waitFor('!window.__qa.state().busy', 10000); await sleep(150); };
    const playLine = async () => { for (const id of await qa('order()')) { await idle(); if (await qa(`alive(${id})`)) await qa(`tap(${id})`); } };
    const mockShare = 'window.__shared = []; navigator.canShare = () => true; navigator.share = async (o) => { window.__shared.push({ text: o.text || "", url: o.url || "", files: (o.files || []).length }); };';
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:60,coins:500,meta:{sessions:3}}))');
    await boot();
    await qa('lang("en")'); await qa('slow(1)');
    // juice: L2's chain, the counter beside the bench on the last landing
    await qa('level(2)'); await sleep(600);
    for (const id of [0, 1, 2]) { await idle(); await qa(`tap(${id})`); await sleep(250); }
    await idle(); await sleep(300);
    await qa('tap(3)');
    await waitFor('(window.__qa.chainFx() || {}).land >= 1', 8000);
    const mid = await qa('chainFx()');
    await waitFor('(() => { const f = window.__qa.chainFx() || {}; return f.land && f.land === f.n; })()', 8000); await sleep(120);
    await shot('103a-chain-counter-last');
    console.log('  chain counter', JSON.stringify(mid), JSON.stringify(await qa('chainFx()')));
    await playLine();
    await waitFor('window.__qa.state().screen === "win"', 20000); await sleep(900);
    // virality: L2's x2 is the best that board allows: the dare asks to match it
    let dl = await qa('dareLink()');
    console.log('  L2 dare', JSON.stringify(dl.d), dl.text);
    if (dl.d.m !== 'chain' || dl.d.x !== 1 || !/Match my chain x2/.test(dl.text)) throw new Error('L2 x2 should be a "match" dare: ' + JSON.stringify(dl));
    // a run that bought a seat cannot be promised on the link's seats: it falls back to clearing the board
    await qa('level(13)'); await sleep(700); await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(600);
    await qa('logSeat()');
    dl = await qa('dareLink()');
    if (dl.d.m !== 'seats' || dl.d.g !== dl.d.b) throw new Error('a seat bought mid-run should fall back to a plain clear dare: ' + JSON.stringify(dl.d));
    // a clean L13 run keeps its chain dare; after Share clip, the link follows as its own message
    await qa('level(13)'); await sleep(700); await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1200);
    dl = await qa('dareLink()');
    if (dl.d.m !== 'chain' || dl.d.x) throw new Error('L13 x3 should be a "beat" dare (the board allows more): ' + JSON.stringify(dl.d));
    await qa('clipEncode()'); await sleep(700);
    await ev(mockShare);
    const c0 = await qa('counters()');
    await ev('document.querySelector("#modal [data-act=shareclip]").click()'); await sleep(700);
    if (!(await ev('!!document.querySelector("#linkbar.dlink")'))) throw new Error('after a clip share the dare link should be offered on its own');
    await shot('103b-dare-link-after-clip');
    const dlFit = await ev('(() => { const r = document.getElementById("linkbar").getBoundingClientRect(); const b = document.querySelector("#linkbar [data-send]"); return r.left >= 0 && r.right <= innerWidth && b.scrollWidth <= b.clientWidth + 1; })()');
    if (!dlFit) throw new Error('dare link bar does not fit');
    if (!(await ev('(() => { const b = document.querySelector("#linkbar [data-send]"); const r = b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()'))) throw new Error('a real tap on #linkbar [data-send] should reach it, not the sheet behind');
    await ev('document.querySelector("#linkbar [data-send]").click()'); await sleep(500);
    const sh = await ev('window.__shared');
    if (sh.length !== 2 || !sh[0].files || sh[1].files || !/\?c=[A-Za-z0-9_-]+$/.test(sh[1].url)) throw new Error('clip then link expected: ' + JSON.stringify(sh));
    const c1 = await qa('counters()');
    if ((c1.dare_handoff || 0) - (c0.dare_handoff || 0) !== 2) throw new Error('two handoffs (clip + link) should be tracked');
    // TR bar at 375x667
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('lang("tr")'); await ev('document.getElementById("linkbar")?.remove()');
    await qa('level(13)'); await sleep(700); await playLine(); // lang() opens Settings over the card: win the board again in TR
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1200);
    await qa('clipEncode()'); await sleep(700);
    await ev(mockShare);
    await ev('(() => { const b = document.querySelector("#modal [data-act=shareclip]"); if (b) { b.hidden = false; b.click(); } })()'); await sleep(700); // the 667 resize redraws the card
    if (!(await ev('!!document.querySelector("#linkbar.dlink")'))) throw new Error('TR: the dare link should follow the clip');
    {
      const ok = await ev('(() => { const r = document.getElementById("linkbar").getBoundingClientRect(); return [...document.querySelectorAll("#linkbar b, #linkbar small, #linkbar .btn")].every((e) => e.scrollWidth <= e.clientWidth + 1) && r.right <= innerWidth; })()');
      if (!ok) throw new Error('TR dare link bar clipped');
      await shot('103c-667-dare-link-tr');
    }
    await ev('document.getElementById("linkbar")?.remove()');
    await qa('lang("en")');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    // the recipient: a "match" link, the funnel (open, first move, clear, reshare) on one share id
    const code = await qa(`dareCode({ n: 2, b: 5, k: 'l', m: 'chain', g: 2, nm: 'Ana', x: 1, i: 'qa1234' })`);
    await ev('localStorage.clear()');
    await boot('?c=' + code);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
    if (!/Match a chain x2/.test(await ev('document.querySelector("#modal .card.dare").textContent'))) throw new Error('match landing text');
    await shot('103d-dare-landing-match');
    await ev('document.querySelector("[data-act=dareplay]").click()'); await sleep(900);
    await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1200);
    const res = await ev('document.querySelector("#modal .dres")?.textContent || ""');
    if (!/You matched Ana's chain x2!/.test(res)) throw new Error('match result: ' + res);
    await ev(mockShare);
    await ev('document.querySelector("#modal [data-act=share]")?.click()'); await sleep(500);
    await shot('103e-dare-matched');
    const fc = await qa('counters()');
    for (const k of ['dare_open', 'dare_play', 'dare_first_move', 'dare_done', 'dare_reshare']) if (!fc[k]) throw new Error('funnel step not tracked: ' + k + ' ' + JSON.stringify(fc));
    // retention: the newcomer's first ask over the cat, the reward on the claim, the "come back" note
    const ground = ['counter_counter', 'counter_pastry', 'counter_lamps', 'counter_chalkboard', 'counter_tables', 'counter_plant', 'window_seat', 'window_plants', 'window_bookshelf', 'window_cattree', 'window_rug', 'window_lights'];
    const edit = (js) => ev(`(() => { const d = JSON.parse(localStorage.getItem('lco_save')); const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000); ${js}; localStorage.setItem('lco_save', JSON.stringify(d)); })()`);
    const calm = `Object.assign(d, { quests: { day, list: [], chest: 1 }, login: { last: day, idx: 1 }, daily: { last: String(day), streak: 1, doneDay: String(day) } })`;
    const seed = async (extra) => {
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 8, level: 40, coins: 400, meta: { sessions: 4 }, cafe: { stars: 0, built: ${JSON.stringify(Object.fromEntries(ground.map((k) => [k, 1])))} } }))`);
      await boot();
      await edit(calm + '; ' + extra);
      await boot();
      await qa('act("cafearea", { d: -9 })'); await sleep(900);
    };
    await seed(`d.req = { list: [{ k: 'win', who: 'mochi', need: 2, p: 1, c: 0, s: 1 }], next: Date.now() + 3 * 3600000, n: 1, done: 0, fresh: 'mochi' }; d.jar = { t: Date.now() - 600000, total: 0 }`);
    if (!(await ev('!!document.querySelector(".rqbub.ask .rqrw")'))) throw new Error("the newcomer's ask should show over the cat with its reward");
    await shot('103f-room-newcomer-ask');
    await seed(`d.req = { list: [{ k: 'win', who: 'mochi', need: 2, p: 2, c: 0, s: 1 }], next: Date.now() + 3 * 3600000, n: 1, done: 0, fresh: 'mochi' }; d.jar = { t: Date.now() - 600000, total: 0 }; d.cafe.hearts = { mochi: 5 }`);
    if (!(await ev('!!document.querySelector(".rqbub.spot .rqrw")'))) throw new Error('the Claim bubble should show its reward');
    await shot('103g-room-claim-reward');
    await ev('document.querySelector(".rqbub").click()'); await sleep(1800);
    const nx = await ev('document.querySelector(".rqbub.next")?.textContent || ""');
    if (!/New request in/.test(nx)) throw new Error('after a claim the resident should name the next return: ' + nx);
    await shot('103h-room-next-goal');
    if (!(await lsave()).meta.funnel.first_request) throw new Error('first request claim should be a funnel step');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('lang("tr")');
    await seed(`d.req = { list: [{ k: 'carrier', who: 'mochi', need: 6, p: 2, c: 0, s: 1 }], next: Date.now() + 3 * 3600000, n: 1, done: 0, fresh: 'mochi' }; d.jar = { t: Date.now() - 600000, total: 0 }`);
    const askFit = await ev('(() => { const b = document.querySelector(".rqbub.ask"); if (!b) return false; const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && [...b.querySelectorAll("b, small, .rqrw")].every((e) => e.scrollWidth <= e.clientWidth + 1); })()');
    if (!askFit) throw new Error('TR ask bubble does not fit at 375x667');
    await shot('103i-667-room-ask-tr');
    await qa('lang("en")');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    // Cat Street, first repeat lap: Bakery 2 done (Crumb + apprentice Bun), Library 2 building with its apprentice
    // silhouette; finishing it brings the apprentice's arrival scene
    const upper = ['cushion_rug', 'cushion_lamp', 'cushion_shelf', 'cushion_hammock', 'cushion_bench', 'cushion_pile', 'patio_planters', 'patio_pergola', 'patio_fountain', 'patio_lights', 'patio_lounger', 'patio_tables', 'roof_canopy', 'roof_telescope', 'roof_lemon', 'roof_tower', 'roof_beanbags', 'roof_grill'];
    await seed(`for (const k of ${JSON.stringify(upper)}) d.cafe.built[k] = 1; d.cafe.street = 7 * 8 + 7; d.cafe.stars = 9; d.level = 200; d.jar = { t: Date.now() - 600000, total: 0 }`);
    await qa('home()'); await sleep(900);
    if (!(await ev('!!document.querySelector(".sh.sl .appr") && !!document.querySelector(".sh.sc .apnext")'))) throw new Error('street lap 2 should show the apprentice and the next one');
    await shot('103j-street-apprentice');
    await ev('document.querySelector("[data-act=streetbuild]").click()'); await sleep(2900);
    if (!(await ev('!!document.querySelector("#arrival .arkit")'))) throw new Error('a lap-2 house should bring its apprentice');
    await shot('103k-apprentice-arrival');
    await ev('document.querySelector("#arrival [data-act=arrivalclose]")?.click()'); await sleep(500);
  }
  // ---- R10 retention: a finished floor leads to the next build, Cat Street lap 3 upgrades / new shops / remix laps, the
  // pop-up week + postcard + album + framed print, resident jobs, the Daily record, Friend Results. QA_FROM=104. ----
  if (+(process.env.QA_FROM || 0) <= 104) {
    const lsave = () => ev('JSON.parse(localStorage.getItem("lco_save"))');
    const ground = ['counter_counter', 'counter_pastry', 'counter_lamps', 'counter_chalkboard', 'counter_tables', 'counter_plant', 'window_seat', 'window_plants', 'window_bookshelf', 'window_cattree', 'window_rug', 'window_lights'];
    const upper = ['cushion_rug', 'cushion_lamp', 'cushion_shelf', 'cushion_hammock', 'cushion_bench', 'cushion_pile', 'patio_planters', 'patio_pergola', 'patio_fountain', 'patio_lights', 'patio_lounger', 'patio_tables', 'roof_canopy', 'roof_telescope', 'roof_lemon', 'roof_tower', 'roof_beanbags', 'roof_grill'];
    const all = JSON.stringify(Object.fromEntries([...ground, ...upper].map((k) => [k, 1])));
    const edit = (js) => ev(`(() => { const d = JSON.parse(localStorage.getItem('lco_save')); const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000); ${js}; localStorage.setItem('lco_save', JSON.stringify(d)); })()`);
    const calm = `Object.assign(d, { quests: { day, list: [], chest: 1 }, login: { last: day, idx: 1 }, daily: { last: String(day), streak: 1, doneDay: String(day) } })`;
    const seed = async (built, extra, level = 40) => {
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: ${level}, coins: 400, meta: { sessions: 4 }, cafe: { stars: 0, built: ${built} } }))`);
      await boot();
      await edit(calm + '; d.jar = { t: Date.now() - 600000, total: 0 }; ' + extra);
      await boot();
    };
    const fits = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].every((e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1)`);
    const visible = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 1; })()`);
    await qa('lang("en")');
    // R1: the finished ground floor names the next build upstairs, the star still missing and Go, above Play
    await seed(JSON.stringify(Object.fromEntries(ground.map((k) => [k, 1]))), 'd.cafe.stars = 1');
    await qa('act("cafearea", { d: -9 })'); await sleep(900);
    const nf = await ev('document.querySelector(".nbcard .trow.nextfloor")?.textContent || ""');
    if (!/Floor 2/.test(nf) || !/more ★ needed/.test(nf) || !/Go/.test(nf)) throw new Error('finished floor card should name the next build, its floor and the missing star: ' + nf);
    if (await ev('[...document.querySelectorAll(".nbcard")].some((e) => /Floor complete/.test(e.textContent))')) throw new Error('the passive Floor complete card is back');
    if (!(await visible('.cafe-play'))) throw new Error('Play must stay visible');
    await shot('104a-floor-done-next');
    await ev('document.querySelector(".nbcard .trow.nextfloor").click()'); await sleep(900);
    if (!/Cushion Corner/.test(await ev('document.querySelector(".fname").textContent'))) throw new Error('Go should jump to the floor under construction');
    // R9 QA: the last piece of the house: the ceremony shows the finished rooftop (no scaffold, no crane) and
    // To Cat Street opens the street (it used to re-render the rooftop room)
    await seed(JSON.stringify(Object.fromEntries([...ground, ...upper.slice(0, -1)].map((k) => [k, 1]))), 'd.cafe.stars = 6', 80);
    await ev('document.querySelector(".trow[data-act=build]").click()'); await sleep(3500);
    await ev('document.querySelector("[data-act=arriveclose]")?.click()');
    await waitFor('!!document.querySelector(".floorfx [data-act=floordone]")', 12000); await sleep(2800);
    if (await ev('!!document.querySelector(".floorfx .fxcrane") || [...document.querySelectorAll(".floorfx img")].some((i) => /floor_scaffold/.test(i.src))')) throw new Error('the house-done ceremony should show the finished rooftop, not a scaffold');
    await shot('104v-house-done');
    await ev('document.querySelector(".floorfx [data-act=floordone]").click()'); await sleep(1200);
    if (!(await ev('!!document.querySelector(".vstreet")'))) throw new Error('To Cat Street should open the street view');
    if (!(await ev('(() => { const s = document.querySelector(".sh.sl > span").getBoundingClientRect(); return [...document.querySelectorAll(".frail > *")].every((b) => { const r = b.getBoundingClientRect(); return r.right <= s.left || r.bottom <= s.top || r.top >= s.bottom; }); })()'))) throw new Error('the floor rail covers the street house label');
    await shot('104w-house-done-street');
    // R9 QA: an empty album opens on the page holding this week's postcard, not a page of "Comes in 10 weeks"
    await qa('act("album")'); await sleep(800);
    if (!(await ev('!!document.querySelector(".album .pcgo")'))) throw new Error('an empty album should open on the page with this week\'s postcard');
    await shot('104x-album-this-week');
    await qa('act("closesheet")'); await sleep(300);
    // R1: Cat Street lap 3: the Library has its bunting + planter; the reading lamp is the glowing next upgrade
    const libUp = 96 + 3 + 2; // unitStart(13) + 2
    await seed(all, `d.cafe.street = ${libUp}; d.cafe.stars = 9`, 220);
    await qa('home()'); await sleep(900);
    if (!(await ev('!!document.querySelector(".sh.sc.up .ov-bunting") && !!document.querySelector(".sh.sc.up .ov-sign.gh")'))) throw new Error('lap-3 upgrade view: owned overlays + the next one ghosted');
    if (!/Reading lamp/.test(await ev('document.querySelector(".nbcard").textContent'))) throw new Error('the build card should offer the reading lamp');
    await shot('104b-street-lamp-before');
    await ev('document.querySelector("[data-act=streetbuild]").click()'); await sleep(2900);
    if (!(await ev('!!document.querySelector("#arrival")'))) throw new Error('finishing the upgrades should play the keeper scene');
    await shot('104c-street-upgrades-done');
    await ev('document.querySelector("#arrival [data-act=arrivalclose]")?.click()'); await sleep(600);
    if (!(await ev('!!document.querySelector(".sh.sl .ov-sign:not(.gh)")'))) throw new Error('the lamp should stand lit beside the Library');
    await shot('104d-street-lamp-after');
    // the new shop kinds (lap 4) and a remix lap (lap 5+): a new façade + keeper, then a repaint, festival dressing and a guest
    await seed(all, `d.cafe.street = ${114 + 8 + 3}; d.cafe.stars = 9`, 260);
    await qa('home()'); await sleep(900);
    if (!(await ev('!!document.querySelector(".sh.sl img[src*=street_fish]") && !!document.querySelector(".sh.sl img[src*=keeper_fish]")'))) throw new Error('the Fish Market and its keeper should stand on the street');
    await shot('104e-street-new-shop');
    await seed(all, `d.cafe.street = ${138 + 4 * 10 + 2}; d.cafe.stars = 9`, 320);
    await qa('home()'); await sleep(900);
    if (!(await ev('!!document.querySelector(".sh.sc.mix .ov-deco") && !!document.querySelector(".sh.sc.mix .sguest")'))) throw new Error('remix lap: festival decoration + guest');
    const mixName = await ev('document.querySelector(".sh.sc.mix > span").textContent');
    await shot('104f-street-remix');
    await seed(all, `d.cafe.street = ${138 + 4 * 19 + 2}; d.cafe.stars = 9`, 360);
    await qa('home()'); await sleep(700);
    if (mixName === (await ev('document.querySelector(".sh.sc.mix > span").textContent'))) throw new Error('the next remix lap of the same shop should look different');
    // R3: the pop-up week: board A + the week's Daily stamped, board B left; it leads the Cat Show tab
    await seed(all, `const w = window.__qa.week(); d.show = { week: w, decor: {}, marks: { [w + 'a']: 1 }, goals: {}, from: w - 3 }; d.pop = { daily: { [w]: 1 }, paid: {}, cu: -1 }`, 120);
    await qa('act("events", { tab: "show" })'); await sleep(800);
    const pt = await ev('document.querySelector(".popcard")?.textContent || ""');
    if (!/2\/3 stamps/.test(pt) || !/Play board B/.test(pt) || !/left/.test(pt)) throw new Error('pop-up card: ' + pt);
    await shot('104g-events-popup');
    // the third stamp (board B) -> Claim -> the postcard
    await edit(`const w = window.__qa.week(); d.show.marks[w + 'b'] = 1`);
    await boot();
    await qa('act("events", { tab: "show" })'); await sleep(700);
    const c0 = (await lsave()).coins;
    await ev('document.querySelector(".popcard [data-act=popclaim]").click()'); await sleep(1300);
    if ((await lsave()).coins !== c0 + 60 || !(await ev('!!document.querySelector("#pcard .pc.big")'))) throw new Error('the claim should pay 60 coins and show the postcard');
    await shot('104h-postcard-new');
    await ev('document.querySelector("#pcard [data-act=pcclose]").click()'); await sleep(300);
    // the archive: an old week with both boards cleared gives its postcard (one catch-up a week)
    await edit(`const w = window.__qa.week(); d.show.marks[(w - 2) + 'a'] = 1; d.show.marks[(w - 2) + 'b'] = 3`);
    await boot();
    await qa('act("events", { tab: "arch" })'); await sleep(700);
    if (!(await ev('!!document.querySelector(".apc.get")'))) throw new Error('archive should offer the catch-up postcard');
    await shot('104i-archive-catchup');
    // R2: the album: a 3/4 page (three photos + the missing card and where to get it), then 4/4 with Hang in café
    const w0 = await qa('week()');
    const pi = (x) => ((x % 24) + 24) % 24;
    const page = Math.floor(pi(w0 + 1) / 4); // next week's card is missing on its page
    const cards = [0, 1, 2, 3].map((j) => page * 4 + j).filter((i) => i !== pi(w0 + 1));
    await seed(all, `d.album = { cards: { ${cards.map((i) => `${i}: 1`).join(', ')} }, hung: {} }`, 120);
    await qa('screen("residents")'); await sleep(600);
    if (!(await ev('!!document.querySelector(".albbtn")'))) throw new Error('Residents should open the Album');
    await ev('document.querySelector(".albbtn").click()'); await sleep(700);
    await qa(`act("albpage", { p: ${page} })`); await sleep(500);
    if ((await ev('document.querySelectorAll(".albgrid .pc:not(.empty)").length')) !== 3 || !(await ev('/Comes next week|This week|archive|clears? left|stamps? left|Catch-up opens/.test(document.querySelector(".albgrid .pc.empty").textContent)'))) throw new Error('3/4 album page: three photos and how to get the fourth');
    await shot('104j-album-3of4');
    await edit(`d.album.cards[${pi(w0 + 1)}] = 1`);
    await boot();
    await qa('screen("residents")'); await sleep(500);
    await ev('document.querySelector(".albbtn").click()'); await sleep(600);
    await qa(`act("albpage", { p: ${page} })`); await sleep(500);
    if (!(await ev('!!document.querySelector(".albprint.done [data-act=hang]")'))) throw new Error('4/4: the framed print and Hang in café');
    await shot('104k-album-4of4');
    await ev('document.querySelector(".albprint [data-act=hang]").click()'); await sleep(1400);
    if (!(await ev('!!document.querySelector(".stage .print7")'))) throw new Error('the print should hang on the room wall');
    await shot('104l-room-print');
    // R5: today's resident jobs in Tasks (4/6, Claim, then Tomorrow) and on the hub strip
    await seed(all, `d.daily.doneDay = ''; d.daily.last = String(day - 1)`, 120);
    const jl = await ev('window.__qa.live().goals.map((g) => g.k).join(",")');
    if (!/job/.test(jl)) throw new Error('the hub should carry a resident job: ' + jl);
    if (!(await ev('!!document.querySelector(".goals .goal.feat .gcta") && !!document.querySelector(".goals .goal.feat .lchip")'))) throw new Error('the featured goal shows its reward and its route (R11)');
    if (!(await visible('.cafe-play'))) throw new Error('Play visible with the job tile');
    await shot('104m-hub-job');
    await edit(`d.jobs = { day, p: [4, 0], paid: 0 }`); await boot();
    await qa('screen("quests")'); await sleep(700);
    if (!/\d+\/\d+/.test(await ev('document.querySelector(".jobs").textContent'))) throw new Error('job progress n/m');
    await shot('104n-tasks-jobs');
    await edit(`d.jobs = { day, p: [99, 0], paid: 0 }`); await boot();
    await qa('screen("quests")'); await sleep(700);
    const jc = (await lsave()).coins;
    await ev('document.querySelector(".jobs [data-act=jobclaim]").click()'); await sleep(700);
    if ((await lsave()).coins !== jc + 30 || !/Tomorrow/.test(await ev('document.querySelector(".jobs").textContent'))) throw new Error('job claim pays 30 and names tomorrow');
    await shot('104o-tasks-job-tomorrow');
    // R4: the Daily record: a win at 29 clears shows 29/30 beside the frame's silhouette; at 30 the frame is on the portraits
    await seed(all, `d.daily = { last: String(day - 1), streak: 3, doneDay: '' }; d.drec = { n: 28, last: day - 1, got: 3 }`, 120);
    await qa('daily()'); await sleep(700); await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1400);
    if (!/Daily record 29\/30/.test(await ev('document.querySelector(".drecrow")?.textContent || ""')) || !(await ev('!!document.querySelector(".drecrow .drart.sil")'))) throw new Error('daily win should show 29/30 with the frame silhouette');
    await shot('104p-daily-record-29');
    await qa('home()'); await sleep(500);
    await qa('act("dailysheet")'); await sleep(600);
    await shot('104q-daily-sheet-record');
    await edit(`d.drec = { n: 30, last: day, got: 7 }`); await boot();
    await qa('screen("residents")'); await sleep(600);
    if (!(await ev('!!document.querySelector(".rp.framed .rframe")'))) throw new Error('the 30-clear frame should be on the resident portraits');
    await shot('104r-residents-frame');
    // R6: Friend Results: empty, then a reply to my dare (imported once), Rematch
    await seed(all, `d.fr = { list: [], sent: ['abc123'] }`, 120);
    await qa('act("events", { tab: "friends" })'); await sleep(700);
    if (!/Open a friend's result link to start/.test(await ev('document.querySelector("#sheet").textContent'))) throw new Error('empty Friend Results text');
    await shot('104s-friends-empty');
    const reply = await qa(`dareCode({ n: 13, b: 5, k: 'l', m: 'chain', g: 3, nm: 'Ana', i: 'rep001', r: 'abc123', pg: 2 })`);
    for (let k = 0; k < 2; k++) { await boot('?c=' + reply); await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(400); }
    if (!/Friend Results/.test(await ev('document.querySelector("#modal .card.dare").textContent'))) throw new Error('the landing should say the reply landed in Friend Results');
    await shot('104t-reply-landing');
    if ((await lsave()).fr.list.length !== 1) throw new Error('reopening the same reply should keep one entry');
    await ev('document.querySelector("[data-act=dareskip]")?.click()'); await sleep(600);
    await qa('act("events", { tab: "friends" })'); await sleep(700);
    const fr = await ev('document.querySelector(".frrow")?.textContent || ""');
    if (!/Ana beat your ×2/.test(fr) || !/Rematch/.test(fr) || !/Level 13/.test(fr)) throw new Error('friend result row: ' + fr);
    await shot('104u-friends-result');
    await ev('document.querySelector(".frrow [data-act=rematch]").click()'); await sleep(900);
    if ((await qa('state()')).screen !== 'play') throw new Error('Rematch should open the board');
    // 375x667 TR: pop-up card, album, jobs, friends fit
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('lang("tr")');
    await seed(all, `const w = window.__qa.week(); d.show = { week: w, decor: {}, marks: { [w + 'a']: 1 }, goals: {}, from: w - 3 }; d.pop = { daily: {}, paid: {}, cu: -1 }; d.album = { cards: { 0: 1, 1: 1, 2: 1 }, hung: {} }; d.jobs = { day, p: [2, 0], paid: 0 }; d.fr = { list: [{ id: 'q1', nm: 'Deniz', n: 13, b: 5, k: 'l', m: 'chain', g: 3, pg: 3, mine: true, t: 1 }], sent: [] }; d.settings.lang = 'tr'`, 120);
    if (!(await visible('.cafe-play'))) throw new Error('TR 667 hub: Play hidden');
    await shot('104v-667-hub-tr');
    await qa('act("cafearea", { d: -9 })'); await sleep(500);
    await qa('act("events", { tab: "show" })'); await sleep(700);
    if (!(await fits('.popt b, .popt small, .popact .btn'))) throw new Error('TR pop-up card overflows');
    await shot('104w-667-popup-tr');
    await qa('act("album", { p: 0 })'); await sleep(700);
    if (!(await fits('.albhead b, .albprint b'))) throw new Error('TR album overflows');
    await shot('104x-667-album-tr');
    await qa('screen("quests")'); await sleep(700);
    await shot('104y-667-tasks-jobs-tr');
    await qa('act("events", { tab: "friends" })'); await sleep(700);
    if (!(await fits('.frt b, .frrow .btn'))) throw new Error('TR friends row overflows');
    await shot('104z-667-friends-tr');
    await qa('lang("en")');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
  }
  // ---- r11 virality: the dare's short link burned into the clip (whole clip + end card) and agreeing with the dare, the
  // share sheet where the browser has none (link copied in the same tap, the end card as preview, Save clip), clip
  // fallback = copy + download in one tap, the back-and-forth (thread, round, both scores, Dare them back, the counter-dare
  // link), share moments (Daily first clear), the house / street share card, local share counters. QA_FROM=105. ----
  if (+(process.env.QA_FROM || 0) <= 105) {
    const lsave = () => ev('JSON.parse(localStorage.getItem("lco_save"))');
    const saveImg = (name, url) => writeFileSync(join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
    const idle = async () => { await waitFor('!window.__qa.state().busy', 10000); await sleep(150); };
    const playLine = async () => { for (const id of await qa('order()')) { await idle(); if (await qa(`alive(${id})`)) await qa(`tap(${id})`); } };
    const mockShare = 'window.__shared = []; navigator.canShare = () => true; navigator.share = async (o) => { window.__shared.push({ text: o.text || "", url: o.url || "", files: (o.files || []).length }); };';
    const noShare = `(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); } catch {}
      window.__clipText = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: (x) => (window.__clipText = x, Promise.resolve()) }, configurable: true }); })()`;
    const fitsIn = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].every((e) => { const r = e.getBoundingClientRect(); return e.scrollWidth <= e.clientWidth + 1 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; })`);
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:60,coins:500,meta:{sessions:3}}))');
    await boot();
    await qa('lang("en")'); await qa('slow(1)');
    // the clip carries the dare's short link from its first frame to the end card, and it names the same dare as the link
    await qa('level(13)'); await sleep(700); await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1200);
    const dl = await qa('dareLink()');
    const cl = await qa('clip()');
    console.log('  dare', JSON.stringify(dl.d), dl.short, '| clip url', cl.url, '|', cl.goal);
    if (!cl.url || cl.url !== dl.short || !/\?c=3l13-5-c3-[a-z0-9]{6}$/.test(cl.url)) throw new Error('the clip should burn in the short link of this dare: ' + cl.url + ' vs ' + dl.short);
    const dec = await qa(`dareDecode(${JSON.stringify(cl.url.split('?c=')[1])})`);
    if (!dec || dec.n !== 13 || dec.b !== dl.d.b || dec.m !== dl.d.m || dec.g !== dl.d.g || dec.i !== dl.d.i) throw new Error('the burned-in code should decode to the same board, seats and goal: ' + JSON.stringify(dec));
    if (!/Beat a chain x3 · Level 13 · 5 seats/.test(cl.goal)) throw new Error('clip end card goal line: ' + cl.goal);
    if (!dl.url.endsWith(dl.short.split('?c=')[1])) throw new Error('the link and the clip should carry the same code (no extras here): ' + dl.url);
    if (!(await ev('!!document.querySelector("#modal .moment")')) && !(await ev('!!document.querySelector("#modal .sharebtn")'))) throw new Error('chain x3: a featured share');
    const fr = await qa('clipFrames([0.2, "peak", "end"])');
    saveImg('105a-clip-open-link.jpg', fr[0].url); saveImg('105b-clip-peak-link.jpg', fr[1].url); saveImg('105c-clip-end-link.jpg', fr[2].url);
    // no share sheet in this browser: Dare a friend copies the link in the same tap and the sheet shows the end card
    await ev(noShare);
    const c0 = await qa('counters()');
    await ev('document.querySelector("#modal [data-act=share]").click()'); await sleep(900);
    if (!(await ev('!!document.querySelector("#linkbar.sharesheet .ssst.ok")'))) throw new Error('the sheet should say the link was copied');
    if (!/\?c=3l13-/.test(await ev('window.__clipText'))) throw new Error('the copied text should carry the dare link: ' + (await ev('window.__clipText')));
    if (!(await ev('!!document.querySelector("#linkbar .ssimg") && !!document.querySelector("#linkbar [data-save]")'))) throw new Error('the sheet should preview the end card and offer Save clip');
    if (!(await fitsIn('#linkbar .sscard, #linkbar .btn, #linkbar .sst'))) throw new Error('share sheet does not fit');
    await shot('105d-share-sheet');
    const c1 = await qa('counters()');
    for (const k of ['share_tap_first3', 'share_done_copied', 'share_offer_first3']) if (!c1[k]) throw new Error('local share counter missing: ' + k + ' ' + JSON.stringify(c1));
    if ((c1.dare_handoff || 0) <= (c0.dare_handoff || 0)) throw new Error('handoff not counted');
    await ev('document.querySelector("#linkbar .lbx").click()'); await sleep(200);
    // Share clip without a share sheet: the link copied and the clip saved in one tap, a toast says both
    await qa('clipEncode()'); await sleep(700);
    await ev('window.__clipText = ""; const b = document.querySelector("#modal [data-act=shareclip]"); b.hidden = false; b.click()'); await sleep(900);
    if (!(await ev('[...document.querySelectorAll(".toast")].some((t) => /Clip saved and link copied/.test(t.textContent))'))) throw new Error('clip fallback should toast "Clip saved and link copied"');
    if (!/\?c=3l13-/.test(await ev('window.__clipText'))) throw new Error('clip fallback should copy the link');
    await shot('105e-clip-saved-link-copied');
    // TR share sheet at 375x667
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('lang("tr")');
    await qa('level(13)'); await sleep(700); await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1200);
    await ev(noShare);
    await ev('document.querySelector("#modal [data-act=share]").click()'); await sleep(900);
    if (!(await fitsIn('#linkbar .sscard, #linkbar .btn, #linkbar .sst, #linkbar .ssgoal'))) throw new Error('TR share sheet does not fit at 375x667');
    await shot('105f-667-share-sheet-tr');
    await ev('document.getElementById("linkbar")?.remove()');
    await qa('lang("en")');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    // the back-and-forth: a third player lands on "Ana x3 -> Deniz x4 -> Your turn", round 3, on a fresh save
    const th = await qa(`dareCode({ n: 13, b: 5, k: 'l', m: 'chain', g: 4, nm: 'Deniz', i: 'dz0001', r: 'an0001', pg: 3, th: [{ nm: 'Ana', v: 3 }], rd: 3 })`);
    await ev('localStorage.clear()');
    await boot('?c=' + th);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
    const land = await ev('document.querySelector("#modal .card.dare").textContent');
    if (!/Deniz dares you!/.test(land) || !/Ana x3/.test(land) || !/Deniz x4/.test(land) || !/Your turn/.test(land) || !/Round 3/.test(land) || !/Beat a chain x4/.test(land)) throw new Error('thread landing: ' + land);
    if (!(await ev('!!document.getElementById("darename")'))) throw new Error('the landing should offer an optional name for the reply');
    await shot('105g-dare-landing-thread');
    // a below-target clear: both scores, Try again + Send result
    await ev('document.getElementById("darename").value = "Ece"; document.querySelector("[data-act=dareplay]").click()'); await sleep(900);
    if ((await lsave()).meta.nick !== 'Ece') throw new Error('the name should be kept for the reply');
    await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1500);
    const miss = await ev('document.querySelector("#modal .dres")?.textContent || ""');
    if (!/Deniz x4You x3/.test(miss) || !/Round 4/.test(miss) || !(await ev('!!document.querySelector("#modal [data-act=retry]") && !!document.querySelector("#modal .dsend")'))) throw new Error('miss result: both scores, Try again + Send result: ' + miss);
    await shot('105h-counter-miss');
    // a beat: "You beat Deniz's chain x2!", both scores, Dare them back -> a counter-dare that carries the thread
    const th2 = await qa(`dareCode({ n: 13, b: 5, k: 'l', m: 'chain', g: 2, nm: 'Deniz', i: 'dz0002', r: 'an0002', pg: 2, th: [{ nm: 'Ana', v: 2 }], rd: 3 })`);
    await boot('?c=' + th2);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(400);
    if ((await ev('document.getElementById("darename").value')) !== 'Ece') throw new Error('the saved name should fill the field');
    await ev('document.querySelector("[data-act=dareplay]").click()'); await sleep(900);
    await playLine();
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1500);
    const beat = await ev('document.querySelector("#modal .dres")?.textContent || ""');
    if (!/You beat Deniz's chain x2!/.test(beat) || !/Deniz x2You x3/.test(beat) || !(await ev('/Dare them back/.test(document.querySelector("#modal .dback")?.textContent || "")'))) throw new Error('beat result: ' + beat);
    await shot('105i-counter-dare-result');
    await ev(mockShare);
    await ev('document.querySelector("#modal .dback").click()'); await sleep(600);
    const sent = (await ev('window.__shared'))[0];
    console.log('  counter-dare', JSON.stringify(sent));
    if (!sent || !/Round 4 on Level 13: you got x2, I got x3/.test(sent.text)) throw new Error('counter-dare text: ' + JSON.stringify(sent));
    const back = await qa(`dareDecode(${JSON.stringify(sent.url.split('?c=')[1])})`);
    if (!back || back.g !== 3 || back.r !== 'dz0002' || back.pg !== 2 || back.rd !== 4 || back.nm !== 'Ece' || !back.th || back.th.map((e) => e.nm + e.v).join(',') !== 'Ana2,Deniz2') throw new Error('counter-dare payload: ' + JSON.stringify(back));
    // the next friend sees the whole thread and the round
    await ev('localStorage.clear()');
    await boot('?c=' + sent.url.split('?c=')[1]);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
    const land2 = await ev('document.querySelector("#modal .card.dare .dthread").textContent');
    if (!/Ana x2.*Deniz x2.*Ece x3.*Your turn/.test(land2) || !/Round 4/.test(land2)) throw new Error('counter-dare landing thread: ' + land2);
    await shot('105j-counter-dare-landing');
    // TR at 375x667: the thread landing fits with Play visible
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('lang("tr")');
    await boot('?c=' + th);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
    if (!/Sıra sende/.test(await ev('document.querySelector("#modal .card.dare").textContent'))) throw new Error('TR thread');
    if (!(await fitsIn('#modal .card.dare, #modal [data-act=dareplay], #modal .dthread, #modal .dname'))) throw new Error('TR thread landing does not fit at 375x667');
    await shot('105k-667-landing-thread-tr');
    await qa('lang("en")');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    // a share moment: the first clear of today's Daily gets its headline and Dare a friend; an ordinary win keeps Next
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:6,level:60,coins:500,meta:{sessions:3,shareNudge:1,bestChain:8}}))');
    await boot(); await qa('lang("en")');
    await qa('daily()'); await sleep(700); await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1400);
    if (!/Today's Daily: cleared!/.test(await ev('document.querySelector("#modal .moment")?.textContent || ""')) || !(await ev('!!document.querySelector("#modal .sharebtn")'))) throw new Error('Daily first clear should be a share moment');
    await shot('105l-daily-share-moment');
    await qa('level(2)'); await sleep(500); await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(900);
    if ((await ev('!!document.querySelector("#modal .moment") || !!document.querySelector("#modal .sharebtn")')) || !(await ev('!!document.querySelector("#modal [data-act=next]")'))) throw new Error('an ordinary win keeps Next and no featured share');
    // the house / street card: a picture with the link, from the floor ceremony and a new shop's arrival
    await ev(mockShare);
    await qa('act("sharehouse", { k: "floor", to: 1 })'); await sleep(800);
    let hc = await qa('houseCard()');
    if (!hc || (await ev('window.__shared')).at(-1)?.files !== 1) throw new Error('house share should hand over the card picture');
    saveImg('105m-house-card.jpg', hc);
    await qa('act("sharehouse", { k: "street", id: "library" })'); await sleep(800);
    hc = await qa('houseCard()');
    saveImg('105n-street-card.jpg', hc);
    if (!/Library|Kütüphane/.test((await ev('window.__shared')).at(-1)?.text || '')) throw new Error('street card text: ' + JSON.stringify((await ev('window.__shared')).at(-1)));
    // the arrival of a new shop on Cat Street offers Share
    const ground = ['counter_counter', 'counter_pastry', 'counter_lamps', 'counter_chalkboard', 'counter_tables', 'counter_plant', 'window_seat', 'window_plants', 'window_bookshelf', 'window_cattree', 'window_rug', 'window_lights'];
    const upper = ['cushion_rug', 'cushion_lamp', 'cushion_shelf', 'cushion_hammock', 'cushion_bench', 'cushion_pile', 'patio_planters', 'patio_pergola', 'patio_fountain', 'patio_lights', 'patio_lounger', 'patio_tables', 'roof_canopy', 'roof_telescope', 'roof_lemon', 'roof_tower', 'roof_beanbags', 'roof_grill'];
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 200, coins: 400, meta: { sessions: 4 }, cafe: { stars: 9, street: 7, built: ${JSON.stringify(Object.fromEntries([...ground, ...upper].map((k) => [k, 1])))} } }))`);
    await boot();
    await ev(`(() => { const d = JSON.parse(localStorage.getItem('lco_save')); const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000); Object.assign(d, { quests: { day, list: [], chest: 1 }, login: { last: day, idx: 1 }, daily: { last: String(day), streak: 1, doneDay: String(day) }, jar: { t: Date.now() - 600000, total: 0 } }); localStorage.setItem('lco_save', JSON.stringify(d)); })()`);
    await boot(); await qa('home()'); await sleep(900);
    await ev('document.querySelector("[data-act=streetbuild]").click()'); await sleep(2900);
    if (!(await ev('!!document.querySelector("#arrival .arcard [data-act=sharehouse]")'))) throw new Error('a new shop arrival should offer Share');
    await shot('105o-arrival-share');
    await ev(mockShare);
    await ev('document.querySelector("#arrival [data-act=sharehouse]").click()'); await sleep(900);
    if ((await ev('window.__shared')).at(-1)?.files !== 1) throw new Error('arrival Share should send the street card');
    await ev('document.querySelector("#arrival [data-act=arrivalclose]")?.click()'); await sleep(400);
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
    // TR settings: the toggles (and a fourth reminders toggle) stay inside the card; ON/OFF words never sit under the knob
    await qa('lang("tr")'); await qa('home()'); await sleep(400); await qa('screen("settings")'); await sleep(900);
    const setFit = await ev('(() => { const c = document.querySelector(".card.settings").getBoundingClientRect(); return [...document.querySelectorAll(".setgrid .setrow")].every((r) => { const a = r.getBoundingClientRect(); const b = r.querySelector(".toggle b"); const k = r.querySelector(".toggle i").getBoundingClientRect(); const w = b.getBoundingClientRect(); return a.left >= c.left && a.right <= c.right && b.scrollWidth <= b.clientWidth + 1 && (w.right <= k.left || w.left >= k.right); }); })()');
    if (!setFit) throw new Error('TR settings: a toggle row overflows the card or its word sits under the knob');
    await shot('30c-667-settings-tr');
    await qa('lang("en")');
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
  // ---- R10 content lane: spring cats, swivel beds, themed packs past L60 (intro, one-time cards, ceremony, sheet) ----
  if (!process.env.QA_SKIP_CONTENT) {
    console.log('content lane');
    const cards = () => ev('window.__qaContent.cards()');
    const go = async () => { await ev('document.querySelector("#cmodal [data-cgo]")?.click()'); await sleep(450); };
    for (const [w, h, tag] of [[375, 812, ''], [375, 667, '-667']]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await ev('localStorage.setItem("lco_save", JSON.stringify({v:9,level:61,coins:500,meta:{sessions:3,shareNudge:1}}))');
      await boot(); await qa(tag ? 'lang("tr")' : 'lang("en")');
      await qa('level(61)'); await sleep(900);
      if (JSON.stringify(await cards()) !== '["intro"]') throw new Error('L61 should open the Rainy Day intro, got ' + JSON.stringify(await cards()));
      await shot('r10-content-intro' + tag);
      await go();
      if (JSON.stringify(await cards()) !== '["mech"]') throw new Error('then the spring card, got ' + JSON.stringify(await cards()));
      await shot('r10-content-spring-card' + tag);
      await go();
      if ((await ev('window.__qaContent.mechs().filter((m) => m.mech === "spring").length')) < 1) throw new Error('L61 has no spring cat');
      if (!(await ev('!!document.querySelector("#hud .cpchip")'))) throw new Error('pack chip missing on the HUD');
      await shot('r10-content-l61' + tag);
      // seen once: a retry shows no card
      await qa('level(61)'); await sleep(700);
      if ((await cards()).length) throw new Error('the cards should show only once');
    }
    await qa('lang("en")');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    // the spring level wins on the hint line (springs hop on the real board)
    await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 40000); await sleep(1200);
    // finishing a pack: the host moves in and the next level opens with the ceremony, the new pack and the swivel card
    await ev('window.__qaContent.finish(80)'); await sleep(300);
    if (!(await ev('window.__qaContent.state().hosts.drizzle > 0'))) throw new Error('Drizzle should move in after L80');
    await qa('level(81)'); await sleep(900);
    if (JSON.stringify(await cards()) !== '["done"]') throw new Error('L81 should open with the Rainy Day ceremony, got ' + JSON.stringify(await cards()));
    await shot('r10-content-done');
    await go();
    if (JSON.stringify(await cards()) !== '["intro"]') throw new Error('then the Bakery Rush intro');
    await go();
    if (JSON.stringify(await cards()) !== '["mech"]') throw new Error('then the swivel card');
    await shot('r10-content-swivel-card');
    await go();
    if ((await ev('window.__qaContent.mechs().filter((m) => m.mech === "swivel").length')) < 1) throw new Error('L81 has no swivel bed');
    await shot('r10-content-l81');
    await ev('window.__qaContent.sheet()'); await sleep(500);
    await shot('r10-content-packs');
    await go();
    // the host lives in the café with the visiting cats
    await qa('home()'); await sleep(900);
    if (!(await ev('!!document.querySelector(\'[data-act=visitor][data-id=drizzle]\')'))) console.log('  note: Drizzle not in view in this room');
    await shot('r10-content-cafe');
  }
  // ---- r10 perf: DPR capped at 2, baked underlay under the board, frame gate on the hub, opt-in PixiJS renderer ----
  if (!process.env.QA_SKIPPERF) {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
    await qa('lang("en")'); await boot(); await qa('level(60)'); await sleep(900);
    const pf = await ev('(() => { const c = document.getElementById("game"); return { ratio: c.width / c.clientWidth, far: !!document.getElementById("pf-far"), near: !!document.getElementById("pf-near"), r: window.__perf.renderer }; })()');
    if (pf.ratio > 2.01) throw new Error('perf: the board canvas should render at DPR <= 2, got ' + pf.ratio);
    if (!pf.far || !pf.near || pf.r !== 'canvas') throw new Error('perf: the baked underlay should be on: ' + JSON.stringify(pf));
    await shot('r10-perf-l60');
    await qa('home()'); await sleep(900);
    const d0 = await ev('window.__perf.drawn'); await sleep(1000);
    if (await ev('window.__perf.covered') && (await ev('window.__perf.drawn')) - d0 > 2) throw new Error('perf: the board should not draw under the café hub');
    await qa('screen("settings")'); await sleep(600);
    if (!(await ev('!!document.querySelector("[data-act=perfgpu]")'))) throw new Error('perf: Settings should offer the GPU mode toggle');
    await shot('r10-perf-settings');
    await send('Page.navigate', { url: origin + '/?r=pixi' }); await sleep(500);
    await waitFor('!!window.__qa && !!document.querySelector("#menu.on, #cafe.on, #hud.on")', 20000);
    await qa('level(13)'); await sleep(1500);
    const pr = await ev('window.__perf.renderer');
    console.log('  pixi renderer: ' + pr);
    if (!/^pixi-|canvas \(pixi failed\)/.test(pr)) throw new Error('perf: ?r=pixi should start the Pixi layer or fall back, got ' + pr);
    await shot('r10-perf-pixi-l13');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await boot();
  }
  // ---- R10 adoption orders: intro card + keeper strip, the count ticking as carriers reach the shop, the worried keeper,
  // the delivery ceremony before the win card, the Urgent bonus line, the album's Adopted cats tab (EN + TR), doorstep
  // cats on Cat Street, the 1600x900 column. L15 is the first hard level (an Urgent order from the Library). ----
  if (!process.env.QA_SKIP_ORDERS) {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await qa('lang("en")');
    await ev('localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 15, coins: 500, meta: { sessions: 3 }, cafe: { stars: 4, built: { counter_counter: 1 } } }))');
    await boot();
    await qa('level(15)'); await sleep(700);
    const oIntro = await ev('document.querySelector(".ordintro")?.textContent || ""');
    if (!/Librarian Page's library needs \d+ cats!/.test(oIntro) || !/URGENT/.test(oIntro)) throw new Error('orders intro: ' + oIntro);
    if (!(await ev('!!document.querySelector("#ordstrip:not([hidden]) .osface")'))) throw new Error('orders: the keeper strip is missing');
    await shot('r10-orders-intro');
    await sleep(2700);
    if (await ev('!!document.querySelector(".ordintro")')) throw new Error('orders: the intro card should fly into the strip');
    const oCount = 'document.querySelector("#ordstrip .oscount span")?.textContent || ""';
    for (let i = 0; i < 40 && !/^[1-9]/.test(await ev(oCount)); i++) { await qa('solveStep()'); await sleep(450); }
    if (!/^[1-9]\d*\/\d+$/.test(await ev(oCount))) throw new Error('orders: the strip count should tick when a carrier reaches the shop: ' + (await ev(oCount)));
    await shot('r10-orders-strip');
    // one seat from a full bench: the keeper worries
    await qa('level(16)'); await sleep(700);
    const oSeats = (await qa('state()')).bench[1];
    await qa(`benchTo(${oSeats - 1})`);
    await waitFor('document.querySelector("#ordstrip")?.dataset.mood === "worried"', 12000).catch(() => console.log('  note: orders worried mood not reached'));
    await shot('r10-orders-worried');
    // the first clear: cats hop into the Library, Page says thanks, one named cat joins the Library set; tap skips
    await qa('level(15)'); await sleep(600); await qa('winNow()');
    await waitFor('!!document.querySelector("#ordcer")', 30000); await sleep(1500);
    const oCer = await ev('document.querySelector("#ordcer").textContent');
    if (!/now lives at the Library/.test(oCer) || !/Just in time!/.test(oCer) || !/Set 1 · 1\/5/.test(oCer)) throw new Error('orders ceremony: ' + oCer);
    await shot('r10-orders-ceremony');
    await tap(187, 600);
    await waitFor('window.__qa.state().screen === "win"', 5000); await sleep(1000);
    if (!/Urgent order \+15/.test(await ev('document.querySelector("#modal")?.textContent || ""'))) throw new Error('orders: the win card should list the Urgent order bonus');
    if ((await ev('JSON.parse(localStorage.getItem("lco_save")).orders.shops.library.named')) !== 1) throw new Error('orders: the adopted cat should be saved');
    await shot('r10-orders-win');
    // the album: Postcards | Adopted cats
    await qa('home()'); await sleep(700);
    await qa('act("album", {})'); await sleep(700);
    if (!(await ev('!!document.querySelector("#sheet .album .ordtabs [data-ord=adopt]")'))) throw new Error('orders: the album should have the Adopted cats tab');
    await ev('document.querySelector("#sheet [data-ord=adopt]").click()'); await sleep(700);
    const oAlb = await ev('document.querySelector("#sheet .adopt")?.textContent || ""');
    if (!/Library/.test(oAlb) || !/Set 1 · 1\/5/.test(oAlb)) throw new Error('orders album: ' + oAlb);
    await shot('r10-orders-album');
    await qa('lang("tr")'); await qa('home()'); await sleep(500);
    await qa('act("album", {})'); await sleep(500);
    await ev('document.querySelector("#sheet [data-ord=adopt]").click()'); await sleep(700);
    if (!/Sahiplenilenler/.test(await ev('document.querySelector("#sheet .adopt")?.textContent || ""'))) throw new Error('orders: TR album tab');
    await shot('r10-orders-album-tr');
    await qa('level(17)'); await sleep(700);
    const oTr = await ev('document.querySelector(".ordintro")?.textContent || ""');
    if (!/Kütüphaneci Page'in kütüphanesine \d+ kedi lazım!/.test(oTr)) throw new Error('orders TR intro: ' + oTr);
    await shot('r10-orders-intro-tr');
    await qa('lang("en")');
    // Cat Street: a shop that took orders gets cats on its doorstep
    const oBuilt = ['counter_counter', 'counter_pastry', 'counter_lamps', 'counter_chalkboard', 'counter_tables', 'counter_plant', 'window_seat', 'window_plants', 'window_bookshelf', 'window_cattree', 'window_rug', 'window_lights', 'cushion_rug', 'cushion_lamp', 'cushion_shelf', 'cushion_hammock', 'cushion_bench', 'cushion_pile', 'patio_planters', 'patio_pergola', 'patio_fountain', 'patio_lights', 'patio_lounger', 'patio_tables', 'roof_canopy', 'roof_telescope', 'roof_lemon', 'roof_tower', 'roof_beanbags', 'roof_grill'];
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 30, coins: 400, meta: { sessions: 4 }, cafe: { stars: 2, street: 16, built: ${JSON.stringify(Object.fromEntries(oBuilt.map((k) => [k, 1])))} }, orders: { last: 29, shops: { library: { cats: 120, named: 10, sets: 2, cur: [], done: [[16, 3, 1], [17, 8, 2], [18, 12, 4], [19, 20, 5], [20, 30, 6]] } } } }))`);
    await boot(); await qa('home()'); await sleep(900);
    if (!(await ev('!!document.querySelector(".street .ordstep")'))) console.log('  note: orders: no doorstep cats on the street view');
    await shot('r10-orders-street');
    // wide screens: the strip follows the centred phone column
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await qa('level(31)'); await sleep(900);
    await shot('r10-orders-desktop');
  }
  // ---- R10 iq lane: level clock + time medals, replay from the Records sheet, Record Run, Stats (Cat IQ), Rank list ----
  if (!process.env.QA_SKIP_IQ) {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await ev('localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 24, coins: 300, meta: { sessions: 3, bestChain: 3 }, cafe: { stars: 4, built: { counter_counter: 1, counter_pastry: 1 } }, iq: { t: { 4: 9000, 5: 30000, 6: 61000, 12: 14000 }, p: { 4: 5, 5: 12, 6: 14, 12: 16 }, cats: 210, perfect: 3, clears: 30, play: 2400000 } }))');
    await boot(); await qa('lang("en")'); await qa('home()'); await sleep(500);
    // the café rail carries Records; the sheet's four tabs fit 375x667 without scrolling
    if (!(await ev('!!document.querySelector("#cafe .rrail .iqrr")'))) throw new Error('iq: the Records button is missing from the café rail');
    await shot('r10-iq-hub');
    for (const k of ['levels', 'run', 'stats', 'rank']) { await ev(`window.__iq.open("${k}")`); await sleep(500); await shot('r10-iq-' + k); }
    await ev('window.__iq.open("stats")'); await sleep(300);
    const iqv = await ev('+document.querySelector(".iqhero .iqnum").textContent');
    if (!(iqv >= 80 && iqv <= 160)) throw new Error('iq: Cat IQ out of range ' + iqv);
    await ev('window.__iq.open("rank")'); await sleep(300);
    if (!(await ev('[...document.querySelectorAll(".iqrow.bot")].every((r) => /BOT/.test(r.textContent))'))) throw new Error('iq: every bot row must say BOT');
    // a level replayed from the Levels grid runs the clock; the win card names the time and the medal
    await ev('window.__iq.open("levels")'); await sleep(300); await qa('act("iqpage", { p: 0 })'); await sleep(300);
    await ev('document.querySelector(".iqlv[data-n=\\"7\\"]").click()'); await sleep(700);
    if ((await qa('state()')).level !== 7) throw new Error('iq: tapping level 7 should replay it');
    if (!(await ev('!!document.getElementById("iqclk")'))) throw new Error('iq: the HUD clock is missing');
    await shot('r10-iq-clock');
    await qa('winNow()'); await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1200);
    if (!(await ev(`!!document.querySelector("#modal .iqwin, #modal .iqchip")`))) throw new Error("iq: the win card has no time row");
    if (!(await ev('window.__iq.state().data.t[7] > 0'))) throw new Error('iq: level 7 best time not saved');
    await shot('r10-iq-win');
    // a second, faster clear of the same level is a new best (the compact card or the chip beside the stars says so)
    await qa('act("retry")'); await sleep(700); await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1200);
    if (!(await ev('!!document.querySelector("#modal .iqwin, #modal .iqchip")'))) throw new Error('iq: the replay win card has no time');
    await shot('r10-iq-win2');
    await qa('lang("tr")'); await ev('window.__iq.open("stats")'); await sleep(400); await shot('r10-iq-stats-tr');
    await qa('lang("en")'); await qa('home()'); await sleep(500);
    // Record Run: 5 boards on one clock, then the result card with splits and a saved personal best
    await ev('window.__iq.run()'); await sleep(800);
    if (!(await ev('!!document.getElementById("iqrunclk")'))) throw new Error('iq: the run clock is missing');
    await shot('r10-iq-run-board');
    for (let i = 0; i < 5; i++) {
      await waitFor('window.__qa.state().mode === "play" && !!window.__iq.state().run', 15000);
      await ev('window.__iq.runWin(15000 + ' + i + ' * 1000)');
      if (i === 0) { await sleep(300); await shot('r10-iq-run-mid'); }
      await sleep(1700);
    }
    await waitFor('!!document.querySelector("#modal .iqrunend")', 10000); await sleep(600);
    if (!(await ev('window.__iq.state().data.run.best === 85000'))) throw new Error('iq: run best should be 85000, got ' + JSON.stringify(await ev('window.__iq.state().data.run')));
    await shot('r10-iq-run-end');
    await qa('home()'); await sleep(400);
  }
  // ---- R10 shop: four tabs at 375x667 (no page scroll, nothing cut), the deal of the day, a booster pack, a cosmetic
  // bought from its preview and worn on the board, the Extra Cushion seat, TR, desktop ----
  if (!process.env.QA_SKIPSHOP) {
    const lsave = () => ev('JSON.parse(localStorage.getItem("lco_save"))');
    const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
    const tabTo = async (tab) => { await click(`[data-act=stab4][data-tab=${tab}]`); await sleep(450); };
    // every label, price and name inside the shop stays in its box (no clipped TR words)
    const shopFits = () => ev(`[...document.querySelectorAll('#sheet .shop4 .stab, #sheet .shop4 .s4h, #sheet .shop4 .s4nm, #sheet .shop4 .s4buy, #sheet .shop4 .s4pk, #sheet .shop4 .s4cat, #sheet .shop4 .s4soon, #sheet .shop4 .s4watch, #sheet .shop4 .s4tmr')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map((e) => e.className + ': ' + e.textContent.trim().slice(0, 30))`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await ev('localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 30, coins: 5000, meta: { sessions: 3 }, cafe: { stars: 4, built: { counter_counter: 1, counter_pastry: 1 } } }))');
    await boot(); await qa('lang("en")');
    await ev('document.querySelector("#modal .settings [data-act=close]")?.click()'); await sleep(200); // lang() opens Settings: close it, or it peeks out under the shop
    await qa('screen("shop")'); await sleep(700);
    for (const tab of ['offers', 'coins', 'boosters', 'style']) {
      await tabTo(tab);
      const bad = await shopFits();
      if (bad.length) throw new Error(`shop ${tab}: text overflows ${bad.join(' | ')}`);
      await shot('r10-shop-' + tab);
    }
    // the deal of the day: bought once, then it shows the next deal's timer
    await tabTo('offers');
    let sv = await lsave();
    const c0 = sv.coins;
    await click('[data-act=shopdeal]'); await sleep(600);
    sv = await lsave();
    if (!(sv.coins < c0 && sv.shop.deal.got === 1) || (await ev('!!document.querySelector("[data-act=shopdeal]")'))) throw new Error('deal of the day did not sell once');
    await shot('r10-shop-deal-bought');
    // a booster pack: 3 Extra Cushions
    await tabTo('boosters');
    const cush0 = sv.shop.cush || 0;
    await click('[data-act=shoppack][data-k=cushion][data-i="0"]'); await sleep(600);
    sv = await lsave();
    if (sv.shop.cush !== cush0 + 3) throw new Error('cushion pack did not pay: ' + JSON.stringify(sv.shop));
    // cosmetics: preview, buy and wear a party hat, a gift-bow carrier and the starry room
    await tabTo('style');
    for (const id of ['hat_party', 'car_bow', 'room_night']) {
      await click(`[data-act=shopcat][data-k=${id.split('_')[0]}]`); await sleep(300);
      await click(`[data-act=shopsel][data-id=${id}]`); await sleep(350);
      if (!(await ev(`document.querySelector('.s4item.sel')?.dataset.id === '${id}'`))) throw new Error('preview did not select ' + id);
      await click('[data-act=shopcos]'); await sleep(500);
    }
    sv = await lsave();
    if (sv.shop.eq.hat !== 'hat_party' || sv.shop.eq.car !== 'car_bow' || sv.shop.eq.room !== 'room_night') throw new Error('cosmetics not worn: ' + JSON.stringify(sv.shop.eq));
    await sleep(500);
    await shot('r10-shop-style-bought');
    // on the board: the outfit, the carrier skin, the room theme and the extra cushion seat
    await click('[data-act=closesheet]'); await sleep(300);
    await qa('level(30)'); await sleep(1500);
    const st = await qa('state()');
    sv = await lsave();
    if (sv.shop.cushLv !== 30 || sv.shop.cush !== cush0 + 2) throw new Error('the Extra Cushion was not used on the next level: ' + JSON.stringify(sv.shop));
    await shot('r10-shop-board');
    console.log('  shop board bench ' + JSON.stringify(st.bench));
    // TR: every tab fits
    await qa('home()'); await sleep(500); await qa('lang("tr")');
    await ev('document.querySelector("#modal .settings [data-act=close]")?.click()'); await sleep(200);
    await qa('screen("shop")'); await sleep(600);
    for (const tab of ['offers', 'coins', 'boosters', 'style']) {
      await tabTo(tab);
      const bad = await shopFits();
      if (bad.length) throw new Error(`TR shop ${tab}: text overflows ${bad.join(' | ')}`);
      if (tab === 'offers' || tab === 'style') await shot('r10-shop-tr-' + tab);
    }
    await qa('lang("en")');
    // desktop: the shop sits in the phone column
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await qa('home()'); await sleep(500); await qa('screen("shop")'); await sleep(600);
    await tabTo('coins');
    await shot('r10-shop-desktop');
    await click('[data-act=closesheet]'); await sleep(300);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
  }
  // ---- hub lane (R10): the home level map, resident layout at 7 sizes, wide-screen panels + keyboard ----
  if (!process.env.QA_SKIP_HUB) {
    const hday = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
    // 2 floors open, so the visitors share the ground floor with the residents and today's visitor may stand at the door
    const nVis = [4, 5, 3, 6].find((n) => (hday % n) % 2 === 1) || 4;
    const vis = Object.fromEntries(['bean', 'frost', 'hazel', 'maple', 'pip', 'sakura'].slice(0, nVis).map((id) => [id, 1]));
    const built = Object.fromEntries(['counter_counter', 'counter_pastry', 'counter_lamps', 'counter_chalkboard', 'counter_tables', 'counter_plant', 'window_seat'].map((id) => [id, 1]));
    const hubSave = (lv, extra = {}) => JSON.stringify({ v: 9, level: lv, coins: 900, meta: { sessions: 5 }, bestStars: { [lv - 1]: 3, [lv - 2]: 2, [lv - 3]: 1 }, cafe: { stars: 2, built }, vis,
      req: { list: [{ k: 'win', who: 'biscuit', need: 2, p: 2, c: 0, s: 1 }, { k: 'carrier', who: 'mochi', need: 8, p: 3, c: 0, s: 2 }], next: Date.now() + 3600000, n: 2, done: 0, fresh: 'mochi' }, ...extra });
    // the map: N. Seviye on the current node, Play always in view, the cat on the current level
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await ev(`localStorage.setItem("lco_save", ${JSON.stringify(hubSave(27, { settings: { lang: 'tr', sound: false, music: false, haptics: false } }))})`);
    await boot(); await sleep(600);
    const mapOk = await ev(`(() => { const c = document.querySelector('#cafe.hm-on .hubmap .hmn.cur'); const room = document.querySelector('#cafe .room').getBoundingClientRect(); const top = document.querySelector('#cafe .cafe-top').getBoundingClientRect(); const p = document.querySelector('#cafe .cafe-play').getBoundingClientRect();
      if (!c) return 'no current node'; const r = c.getBoundingClientRect(); if (!(c.getAttribute('aria-label') || '').includes('27. Seviye')) return 'label ' + c.getAttribute('aria-label'); // R11 pres: the node is a level marker, its name in aria-label
      if (r.top < top.bottom || r.bottom > room.bottom - 40) return 'current node off view ' + Math.round(r.top) + '..' + Math.round(r.bottom);
      if (p.bottom > innerHeight || p.top < room.bottom) return 'Play hidden'; if (!document.querySelector('.tabbar .hmtab.on')) return 'map tab';
      if (document.querySelectorAll('.hmn.lock').length !== 3) return 'locked nodes ' + document.querySelectorAll('.hmn.lock').length; return ''; })()`);
    if (mapOk) throw new Error('hub map: ' + mapOk);
    await shot('r10-hub-map-375-tr');
    await ev('document.querySelector(".hmn.cur").click()');
    await waitFor('window.__qa.state().screen === "play"', 10000);
    await qa('home()'); await sleep(600);
    if (!(await ev('!!document.querySelector("#cafe.hm-on .hubmap")'))) throw new Error('hub map: home should open on the map');
    // residents: no two touch, none under the top bar, the rails, the goals strip or the room name, at every size
    const RES = `(() => { const R = (e) => e.getBoundingClientRect(); const room = document.querySelector('#cafe .room'); const rr = R(room);
      const res = [...room.querySelectorAll('.guest.g7')].filter((e) => !e.hidden).map(R);
      const blk = [...room.querySelectorAll('.cafe-top, .frail > *, .rrail > *, .goals, .fname, .jar7')].map(R).filter((r) => r.width && r.height);
      const ov = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; const bad = [];
      res.forEach((a, i) => { if (a.left < rr.left - 1 || a.right > rr.right + 1 || a.top < rr.top - 1 || a.bottom > rr.bottom + 1) bad.push('out' + i);
        res.forEach((b, j) => { if (j > i && ov(a, b)) bad.push('overlap' + i + '/' + j); }); blk.forEach((b, k) => { if (ov(a, b)) bad.push('hud' + i + '/' + k); }); });
      const bub = [...room.querySelectorAll('.rqbub:not([hidden])')].map(R); // request bubbles: apart, clear of the bars and rails
      bub.forEach((a, i) => { if (blk.some((b) => ov(a, b)) || a.left < rr.left - 1 || a.right > rr.right + 1) bad.push('bubble' + i); bub.forEach((b, j) => { if (j > i && ov(a, b)) bad.push('bubbles' + i + '/' + j); }); });
      return { n: res.length, bad }; })()`;
    for (const [w, h] of [[360, 640], [375, 667], [390, 844], [430, 932], [768, 1024], [1600, 900], [1920, 1080]]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w > 800 ? 1 : 2, mobile: w < 768 });
      await ev(`localStorage.setItem("lco_save", ${JSON.stringify(hubSave(27))})`);
      await boot(); await sleep(400);
      await ev('document.querySelector("#cafe .tab[data-act=cafeview]").click()'); await sleep(300);
      await ev('document.querySelector(".frail .fl[data-d=\'-1\']")?.click()'); await sleep(700);
      const r = await ev(RES);
      if (r.n < 4) throw new Error(`hub residents ${w}x${h}: only ${r.n} cats in the ground floor`);
      if (r.bad.length) throw new Error(`hub residents ${w}x${h}: ${r.bad.join(' ')}`);
      console.log(`  hub residents ${w}x${h}: ${r.n} placed, no overlap`);
      await shot(`r10-hub-res-${w}x${h}`);
    }
    // wide screens: a bigger column, panels both sides inside the window, keys
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(`localStorage.setItem("lco_save", ${JSON.stringify(hubSave(27))})`);
    await boot(); await sleep(500);
    const wide = await ev(`(() => { const b = document.body.getBoundingClientRect(); const L = document.getElementById('hubL'); const R = document.getElementById('hubR');
      if (!document.documentElement.classList.contains('hubwide')) return 'not wide'; if (b.width <= 900 * 9 / 16 + 1) return 'column not bigger ' + b.width;
      if (!L || !R) return 'no panels'; const l = L.getBoundingClientRect(), r = R.getBoundingClientRect();
      if (l.left < 0 || l.right > b.left || r.left < b.right || r.right > innerWidth || l.top < 0 || l.bottom > innerHeight || r.bottom > innerHeight) return 'panels off ' + [l.left, l.right, r.left, r.right, l.bottom, r.bottom].map(Math.round);
      return ''; })()`);
    if (wide) throw new Error('hub wide: ' + wide);
    await shot('r10-hub-desk-1600');
    await ev('document.querySelector("#hubR [data-act=residents]").click()'); await sleep(500);
    if ((await qa('state()')).screen !== 'residents') console.log('  note: the Residents panel row did not open the residents screen');
    await qa('home()'); await sleep(500);
    await ev('document.querySelector("#cafe .tab[data-act=cafeview]").click()'); await sleep(400);
    await ev('dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))'); await sleep(300);
    if (!(await ev('!!document.querySelector("#cafe.hm-on .hubmap")'))) throw new Error('hub keys: Esc in the rooms should go back to the map');
    await ev('dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))');
    await waitFor('window.__qa.state().screen === "play"', 10000); await sleep(900);
    await shot('r10-hub-desk-1600-play');
    await ev('dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))'); await sleep(600);
    if (!(await ev('!!document.querySelector("#cafe.on")'))) throw new Error('hub keys: Esc in a level should go home');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save")');
  }
  // ---- R11 fix round 1 (sol-r11-1): the order row + tucked intro, the pack in the plaque, the on-demand clip with its
  // QR, carrier dip / cushion rebound, the quick adoption on the win card, the lost-bench and Take back cues, the
  // featured hub goal, the archive covering released postcards, one Play on desktop. ----
  if (!process.env.QA_SKIP_R11) {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    const R = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; })()`);
    const saveImg = (name, url) => writeFileSync(join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
    const lib = (named) => ({ last: 14 + named, shops: { library: { cats: 15 * named, named, sets: 0, cur: Array.from({ length: named }, (_, i) => [15 + i, 3 + i, i % 8]), done: [] } } });
    // presentation: one order row (door, then count + clock as one capsule) and an ordinary intro as a bubble beside it
    for (const [lg, n] of [['en', 7], ['tr', 8]]) {
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: ${n}, coins: 300, meta: { sessions: 3 }, cafe: { stars: 1, built: { counter_counter: 1 } }, settings: { lang: '${lg}', sound: false, music: false, haptics: false } }))`);
      await boot(); await qa(`level(${n})`); await sleep(900);
      const L = await qa('layout()');
      const bub = await R('.ordintro.tuck');
      const pill = await R('#ordstrip .oscount');
      const clk = await R('#iqclk.dock');
      const txt = await ev('document.querySelector(".ordintro.tuck")?.textContent || ""');
      if (!bub) throw new Error(`r11 ${lg}: an ordinary order should open with the tucked bubble`);
      if (!(lg === 'en' ? /needs \d+ cats!/ : /\d+ kedi lazım!/).test(txt)) throw new Error(`r11 ${lg} bubble text: ${txt}`);
      if (bub.b > L.oy - 2) throw new Error(`r11 ${lg}: the bubble reaches the board (${Math.round(bub.b)} > ${Math.round(L.oy)})`);
      if (bub.r > 375 + 1) throw new Error(`r11 ${lg}: the bubble runs off the screen`);
      if (!(await ev('(() => { const b = document.querySelector(".ordintro.tuck b"); return b.scrollWidth <= b.clientWidth + 1; })()'))) throw new Error(`r11 ${lg}: the bubble text is clipped`);
      if (!pill || !clk || Math.abs((pill.t + pill.b) / 2 - (clk.t + clk.b) / 2) > 2 || clk.l < pill.r - 3) throw new Error(`r11 ${lg}: the clock should sit on the order row's right end ${JSON.stringify({ pill, clk })}`);
      if (clk.b > L.benchY - L.bw * 0.35) console.log(`  note: r11 ${lg} order row bottom ${Math.round(clk.b)} vs cushion top ${Math.round(L.benchY - L.bw * 0.35)}`);
      await shot(`r11-order-row-${lg}`);
      await sleep(2400);
      if (await ev('!!document.querySelector(".ordintro")')) throw new Error(`r11 ${lg}: the bubble should fly into the strip`);
      await shot(`r11-order-row-${lg}-after`);
    }
    // the pack name is the plaque's second line, inside the plaque
    await qa('lang("en")'); await qa('level(66)'); await sleep(900);
    const plq = await R('#hud .lvl-pill.pk');
    const chp = await R('#hud .lvl-pill .cpchip');
    if (!plq || !chp || chp.t < plq.t - 1 || chp.b > plq.b + 1) throw new Error('r11: the pack chip should sit inside the level plaque ' + JSON.stringify({ plq, chp }));
    await ev('document.getElementById("cmodal")?.remove()'); await sleep(200);
    await shot('r11-pack-plaque');
    // juice + virality: the L13 chain; cushions rebound as cats launch; the win card shows the still at once and records
    // only on Share clip; the end card and the PNG carry a QR of the public dare link
    const idle = async () => { await waitFor('!window.__qa.state().busy', 10000); await sleep(150); };
    await ev('localStorage.setItem("lco_save", JSON.stringify({v:9,level:60,coins:500,meta:{sessions:3,shareNudge:1,bestChain:5}}))');
    await boot(); await qa('lang("en")'); await qa('slow(1)');
    await qa('level(13)'); await sleep(700);
    let rebound = false;
    for (const id of await qa('order()')) {
      await idle();
      if (!(await qa(`alive(${id})`))) continue;
      await qa(`tap(${id})`);
      if (!rebound) {
        for (let k = 0; k < 20 && !(await ev('(window.__qa.chainFx() || {}).k >= 2')); k++) await sleep(60);
        if (await ev('(window.__qa.chainFx() || {}).k >= 2')) { await sleep(60); await shot('r11-chain-rebound'); rebound = (await qa('benchOut()')) > 0; }
      }
    }
    if (!rebound) throw new Error('r11: a chain should spring its cushions back (benchOut)');
    await waitFor('window.__qa.state().screen === "win"', 30000);
    await sleep(350);
    const w0 = await qa('clip()');
    if (w0.encoding || w0.ready) throw new Error('r11: the win card must not record before the player asks ' + JSON.stringify(w0));
    if (!(await ev('(() => { const c = document.querySelector("#modal .chainclip canvas"); return !!c && c.height === 320; })()'))) throw new Error('r11: the peak still should be on the win card at once');
    if (await ev('document.querySelector("#modal [data-act=shareclip]").hidden')) throw new Error('r11: Share clip should be offered at once');
    if (!/^https?:\/\/.+\?c=3l13-\d+-c\d+m?-[a-z0-9]+$/.test(w0.qr || '')) throw new Error('r11: QR link ' + w0.qr);
    await shot('r11-win-still');
    await ev('document.querySelector("#modal [data-act=shareclip]").click()'); await sleep(300);
    const w1 = await qa('clip()');
    if (w1.canRecord) {
      if (!w1.encoding || !(await ev('document.querySelector("#modal [data-act=shareclip]").classList.contains("making")'))) throw new Error('r11: the first Share clip tap should start the recording');
      await shot('r11-clip-making');
      await waitFor('window.__qa.clip().ready', 20000); await sleep(400);
      if (!(await ev('document.querySelector("#modal [data-act=shareclip]").classList.contains("ready")'))) throw new Error('r11: Share clip should say it is ready');
      await shot('r11-clip-ready');
    } else console.log('  note: r11 no MediaRecorder here: Share clip sends the PNG');
    const qf = await qa('clipFrames(["end", "png"])');
    saveImg('r11-clip-end-qr.jpg', qf[0].url); saveImg('r11-clip-png-qr.jpg', qf[1].url);
    // perf proxy: the win transition and the card's first seconds at 4x CPU (a slow phone), frame deltas
    await send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await qa('level(13)'); await sleep(600); await qa('winNow()');
    const ft = await ev('new Promise((res) => { const d = []; let last = performance.now(); const t0 = last; const f = (now) => { d.push(now - last); last = now; if (now - t0 < 3000) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); })');
    await send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const fs = ft.slice().sort((a, b) => a - b);
    console.log(`  r11 perf 4x CPU win transition: ${ft.length} frames, p50 ${fs[Math.floor(fs.length * 0.5)].toFixed(1)} ms, p95 ${fs[Math.floor(fs.length * 0.95)].toFixed(1)} ms, max ${fs.at(-1).toFixed(1)} ms`);
    await waitFor('window.__qa.state().screen === "win"', 30000);
    // overall: an ordinary first clear (not the first adoption) credits the cat on the win card, Next is the one route
    for (const [lg, n] of [['en', 16], ['tr', 17]]) {
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: ${n}, coins: 500, meta: { sessions: 3 }, cafe: { stars: 4, built: { counter_counter: 1 } }, orders: ${JSON.stringify(lib(n - 15))}, settings: { lang: '${lg}', sound: false, music: false, haptics: false } }))`);
      await boot(); await qa(`level(${n})`); await sleep(600); await qa('winNow()');
      await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1300);
      if (await ev('!!document.querySelector("#ordcer")')) throw new Error(`r11 ${lg}: an ordinary first clear should skip the ceremony`);
      const ow = await ev('document.querySelector("#modal .ordwin")?.textContent || ""');
      if (!(lg === 'en' ? /now lives at the Library/ : /yaşıyor/).test(ow)) throw new Error(`r11 ${lg}: the win card should name the adopted cat: ${ow}`);
      if (!(await ev('!!document.querySelector("#modal [data-act=next]")'))) throw new Error(`r11 ${lg}: Next should be the main route`);
      if (await ev('!!document.querySelector("#modal .btn[data-act=cafe]")')) throw new Error(`r11 ${lg}: Build should ride on the café bar, not replace Next`);
      const named = await ev('JSON.parse(localStorage.getItem("lco_save")).orders.shops.library.named');
      if (named !== n - 14) throw new Error(`r11 ${lg}: the adoption should be saved at once (${named})`);
      await shot(`r11-quick-adopt-${lg}`);
    }
    // fun: a lost bench marks the carrier it needed; Take back marks the cushion that came free / a cat that boards now
    await ev('localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 20, coins: 300, meta: { sessions: 3 }, settings: { lang: "en", sound: false, music: false, haptics: false } }))');
    await boot(); await qa('level(13)'); await sleep(600); await qa('failNow()');
    await waitFor('window.__qa.state().screen === "fail"', 30000); await sleep(900);
    const cf = await qa('cue()');
    if (!cf || cf.need == null) throw new Error('r11: the lost bench should mark the carrier it needs ' + JSON.stringify(cf));
    await shot('r11-fail-cue');
    if (await ev('!!document.querySelector("#modal [data-act=takeback]")')) {
      await ev('document.querySelector("#modal [data-act=takeback]").click()'); await sleep(500);
      const cb = await qa('cue()');
      console.log('  r11 take back cue', JSON.stringify(cb));
      if (!cb || cb.need != null || (cb.seat < 0 && cb.cat < 0)) console.log('  note: r11 take back left nothing to point at (bench full, no matching cat)');
      await shot('r11-takeback-cue');
    } else console.log('  note: r11 no free Take back on this loss');
    // retention: one featured goal with its reward and route; the archive offers released postcards of a started page
    const hday = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
    const hw = Math.floor((hday + 3) / 7);
    const hubS = (lg) => JSON.stringify({ v: 9, level: 27, coins: 900, meta: { sessions: 5 }, cafe: { stars: 0, built: { counter_counter: 1, counter_pastry: 1, counter_lamps: 1, counter_chalkboard: 1, counter_tables: 1, counter_plant: 1, window_seat: 1 } },
      req: { list: [{ k: 'carrier', who: 'mochi', need: 8, p: 6, c: 0, s: 2 }], next: Date.now() + 3600000, n: 2, done: 0, fresh: '' }, show: { marks: {}, from: hw }, album: { cards: { [((hw % 24) + 24) % 24]: 1 }, hung: {} },
      daily: { last: String(hday - 1), streak: 1, doneDay: '' }, settings: { lang: lg, sound: false, music: false, haptics: false } });
    for (const lg of ['en', 'tr']) {
      await ev(`localStorage.setItem("lco_save", ${JSON.stringify(hubS(lg))})`);
      await boot(); await sleep(500);
      const fg = await ev('[...document.querySelectorAll("#cafe .goals .goal")].map((g) => g.className + "|" + g.dataset.act + "|" + g.textContent)');
      if (fg.length !== 1 || !/feat/.test(fg[0])) throw new Error(`r11 ${lg}: the hub should feature one goal: ` + fg.join(' / '));
      if (!(await ev('!!document.querySelector("#cafe .goal.feat .gcta") && !!document.querySelector("#cafe .goal.feat .lchip")'))) throw new Error(`r11 ${lg}: the featured goal needs its reward and route`);
      if (!(await ev('[...document.querySelectorAll("#cafe .goal.feat .gt b, #cafe .goal.feat .gcta")].every((e) => e.scrollWidth <= e.clientWidth + 1)'))) throw new Error(`r11 ${lg}: featured goal text clipped`);
      console.log(`  r11 featured goal ${lg}: ${fg[0].split('|').slice(1).join(' | ')}`);
      await shot(`r11-hub-feat-${lg}`);
    }
    await qa('lang("en")');
    await qa('act("album", {})'); await sleep(700);
    const alb = await ev('document.querySelector("#sheet")?.textContent || ""');
    // R11 fix round 2: an archived postcard the catch-up can take names its exact step ("2 clears left" + Board A)
    if (!/In the archive|clears? left/.test(alb)) throw new Error('r11: the started page should offer released postcards from the archive: ' + alb.slice(0, 200));
    await shot('r11-album-archive');
    // desktop: one primary Play (the column's), the goals in the left panel only
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(`localStorage.setItem("lco_save", ${JSON.stringify(hubS('en'))})`);
    await boot(); await sleep(600);
    if (await ev('!!document.querySelector("#hubR [data-act=play]")')) throw new Error('r11 desktop: the road panel should not repeat Play');
    if (!(await ev('!!document.querySelector("#hubL .goal.feat")'))) throw new Error('r11 desktop: the featured goal belongs in the left panel');
    if (await ev('(() => { const g = document.querySelector("#cafe .goals"); return !!g && g.getClientRects().length > 0; })()')) throw new Error('r11 desktop: the column should not repeat the goals');
    await shot('r11-hub-desk');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save")');
  }
  // ---- R11 fix round 2 (sol-r11-2): Next at one height on every win card (375x667, EN + TR), one time badge, the main
  // reward row, the replay details on the thumbnail, Make video, one public address for link / code / QR, the curated
  // L6 / L9 / L11, the early resident thread, the shaped tabby. QA_SKIP_R12=1 skips it. ----
  if (!process.env.QA_SKIP_R12) {
    const lib2 = (named) => ({ last: 14 + named, shops: { library: { cats: 15 * named, named, sets: 0, cur: Array.from({ length: named }, (_, i) => [15 + i, 3 + i, i % 8]), done: [] } } });
    const idle2 = async () => { await waitFor('!window.__qa.state().busy', 10000); await sleep(150); };
    const cfg = (lg) => `settings: { lang: '${lg}', sound: false, music: false, haptics: false }`;
    const saveImg2 = (name, url) => writeFileSync(join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
    // the adoption ceremony (first adoption, Urgent / VIP) plays before the card: wait for the card itself
    const winCard = async () => { await waitFor('window.__qa.state().screen === "win"', 30000); await waitFor('!!document.querySelector("#modal .card.win")', 15000); await sleep(1000); };
    const nextAt = () => ev('(() => { const b = document.querySelector("#modal .card.win [data-act=next], #modal .card.win > [data-act=retry]"); if (!b) return null; const r = b.getBoundingClientRect(); return Math.round(r.bottom); })()');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    for (const lg of ['en', 'tr']) {
      const at = {};
      // a compact first clear with an adoption: the adopted cat is the main reward row, coins shrink under it
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 16, coins: 500, meta: { sessions: 3 }, cafe: { stars: 4, built: { counter_counter: 1 } }, orders: ${JSON.stringify(lib2(1))}, ${cfg(lg)} }))`);
      await boot(); await qa('level(16)'); await sleep(600); await qa('winNow()');
      await winCard();
      if (!(await ev('!!document.querySelector("#modal .card.win .mainrew .ordwin")'))) throw new Error(`r12 ${lg}: the adoption should be the main reward row`);
      if ((await ev('document.querySelectorAll("#modal .iqwin").length')) > 0) throw new Error(`r12 ${lg}: time and medal should be one badge, not a row`);
      at.adopt = await nextAt();
      await shot(`r12-win-adopt-${lg}`);
      // a hard level (big card, no replay)
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 15, coins: 500, meta: { sessions: 3 }, orders: ${JSON.stringify(lib2(1))}, ${cfg(lg)} }))`);
      await boot(); await qa('level(15)'); await sleep(600); await qa('winNow()');
      await winCard();
      at.hard = await nextAt();
      await shot(`r12-win-hard-${lg}`);
      // the chain replay card: the details ride on the thumbnail, the clip button says what it does
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 60, coins: 500, meta: { sessions: 3, shareNudge: 1, bestChain: 5 }, ${cfg(lg)} }))`);
      await boot(); await qa('slow(1)'); await qa('level(13)'); await sleep(700);
      for (const id of await qa('order()')) { await idle2(); if (await qa(`alive(${id})`)) await qa(`tap(${id})`); }
      await winCard();
      if (await ev('!!document.querySelector("#modal .card.win .chainclip")')) {
        if (await ev('!!document.querySelector("#modal .hcol .ach, #modal .hcol .paybd")')) throw new Error(`r12 ${lg}: the replay details belong on the thumbnail`);
        const lab = await ev('document.querySelector("#modal [data-act=shareclip]")?.getAttribute("aria-label") || ""');
        const cr = (await qa('clip()')).canRecord;
        // R11 fix round 1: the video starts on its own, so the thumbnail says it is being prepared from the first frame
        const cap = await ev('document.querySelector("#modal .clipcap")?.textContent || ""');
        if (cr && !(cap === (lg === 'en' ? 'Preparing video' : 'Video hazırlanıyor') || cap === (lg === 'en' ? 'Send video' : 'Videoyu yolla'))) throw new Error(`r12 ${lg}: the thumbnail should say the video is being prepared: ${cap} / ${lab}`);
        if (!(await ev('[...document.querySelectorAll("#modal .clipdet i, #modal [data-act=shareclip] span")].every((e) => e.getBoundingClientRect().right <= e.closest(".chainclip").getBoundingClientRect().right + 1)'))) console.log(`  note: r12 ${lg} a thumbnail label runs past the thumbnail`);
        at.clip = await nextAt();
        await shot(`r12-win-clip-${lg}`);
        if (cr && lg === 'en') {
          await ev('document.querySelector("#modal [data-act=shareclip]").click()'); await sleep(900);
          const mk = await ev('document.querySelector("#modal [data-act=shareclip]")?.getAttribute("aria-label") || ""');
          if (!/^(Making|Video) \d+%$/.test(mk) && mk !== 'Send video') throw new Error('r12: the clip button should count up while the video is made: ' + mk);
          await shot('r12-clip-making');
          await waitFor('window.__qa.clip().ready', 20000); await sleep(300);
          const rd = await ev('document.querySelector("#modal [data-act=shareclip]")?.getAttribute("aria-label") || ""');
          if (rd !== 'Send video') throw new Error('r12: a made video should say Send video: ' + rd);
          await shot('r12-clip-ready');
        }
        const c = await qa('clip()');
        const dl = await qa('dareLink()');
        const base = (u) => u.split('?c=')[0].replace(/^https?:\/\//, '');
        if (base(c.qr) !== base(dl.url) || base(dl.short) !== base(dl.url)) throw new Error(`r12 ${lg}: link, code and QR should share one address: ${dl.url} | ${dl.short} | ${c.qr}`);
        if (process.env.VITE_PUBLIC_URL && !c.qr.startsWith(process.env.VITE_PUBLIC_URL)) throw new Error('r12: the QR should use VITE_PUBLIC_URL: ' + c.qr);
        console.log(`  r12 share address ${lg}: ${dl.short}`);
        if (lg === 'en') { const qf = await qa('clipFrames(["end"])'); saveImg2('r12-clip-end-qr.jpg', qf[0].url); }
      } else console.log(`  note: r12 ${lg} L13 line gave no replay`);
      const vals = Object.values(at).filter((v) => v != null);
      console.log(`  r12 Next bottom ${lg}: ${JSON.stringify(at)}`);
      if (vals.length < 2 || Math.max(...vals) - Math.min(...vals) > 3) throw new Error(`r12 ${lg}: Next should sit at one height on every win card: ${JSON.stringify(at)}`);
    }
    // the early resident thread: the hub features the next resident with the exact wins, the win card carries it, the
    // room's build card names it
    for (const lg of ['en', 'tr']) {
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 6, coins: 100, meta: { sessions: 2 }, cafe: { stars: 0, built: {} }, ${cfg(lg)} }))`);
      await boot(); await qa('home()'); await sleep(800);
      const fg = await ev('document.querySelector("#cafe .goal.feat")?.textContent || ""');
      if (!(lg === 'en' ? /moves in after \d+ more win/ : /galibiyet daha, .+ taşınıyor/).test(fg)) throw new Error(`r12 ${lg}: the hub should feature the resident thread: ${fg}`);
      if (!(await ev('[...document.querySelectorAll("#cafe .goal.feat .gt b, #cafe .goal.feat .gcta")].every((e) => e.scrollWidth <= e.clientWidth + 1)'))) throw new Error(`r12 ${lg}: thread goal text clipped`);
      await shot(`r12-thread-hub-${lg}`);
      await qa('level(6)'); await sleep(600); await qa('winNow()');
      await winCard();
      const cb = await ev('document.querySelector("#modal .cafebar.thr")?.textContent || ""');
      if (!(lg === 'en' ? /moves in after|Build the/ : /taşınıyor| için /).test(cb)) throw new Error(`r12 ${lg}: the win card should carry the thread: ${cb}`);
      await shot(`r12-thread-win-${lg}`);
    }
    // curated boards: L6 needs every seat and pays a chain; L9's pair park is named the moment it happens; L11 stacks
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 6, coins: 100, meta: { sessions: 3 }, cafe: { stars: 0, built: {} }, ${cfg('en')} }))`);
    await boot(); await qa('slow(1)'); await qa('level(6)'); await sleep(700);
    if ((await qa('meta()')).cur !== 'cushion') throw new Error('r12: L6 should play the curated board');
    if (!/five cats/.test(await qa('tut()'))) throw new Error('r12: L6 should name its idea: ' + (await qa('tut()')));
    await shot('r12-l6-start');
    let full = false, chain = 0;
    for (const id of await qa('order()')) {
      await idle2();
      if (!(await qa(`alive(${id})`))) continue;
      if (id === 2) { await sleep(400); full = /Every seat is full/.test(await qa('tut()')); await shot('r12-l6-full'); }
      await qa(`tap(${id})`);
      if (id === 2) { for (let k = 0; k < 80 && (((await qa('chainFx()')) || {}).k || 0) < 4; k++) await sleep(50); await sleep(250); chain = ((await qa('chainFx()')) || {}).k || 0; await shot('r12-l6-chain'); }
    }
    if (!full) throw new Error('r12: the full bench on L6 should say a cat the front carrier takes is the way');
    console.log(`  r12 L6 chain ${chain}`);
    await waitFor('window.__qa.state().screen === "win"', 30000);
    await qa('level(9)'); await sleep(700);
    // R11 fix round 2: L9's lines sit on the teaching card too (its measured slot keeps the bottom row clear); R12: after the order
    for (let k = 0; k < 40 && !/mother and kitten/.test(await qa('tut()')); k++) await sleep(100);
    if (!/mother and kitten/.test(await qa('tut()'))) throw new Error('r12: L9 should name its rule on the card: ' + (await qa('tut()')));
    for (const id of [5, 6]) { await idle2(); await qa(`tap(${id})`); }
    await idle2(); await qa('tap(9)');
    let pairT = '';
    for (let k = 0; k < 30 && !/took 2 seats/.test(pairT); k++) { await sleep(100); pairT = await qa('tut()'); }
    if (!/took 2 seats/.test(pairT)) throw new Error('r12: L9 should name the pair park at once: ' + pairT);
    await shot('r12-l9-pair');
    await qa('failNow()');
    await waitFor('window.__qa.state().screen === "fail"', 30000); await sleep(900);
    if (!/big pair for last/.test(await ev('document.querySelector("#modal .tip")?.textContent || ""'))) throw new Error('r12: the L9 loss should give its own tip');
    await shot('r12-l9-fail');
    await qa('lang("tr")');
    await qa('level(11)'); await sleep(700);
    if (!/en üstteki/.test(await qa('tut()'))) throw new Error('r12: L11 should name its idea (TR): ' + (await qa('tut()')));
    await shot('r12-l11-start-tr');
    // the shaped tabby on the live board: a long straight run, a tight zigzag, an L bend
    await qa('lang("en")');
    await qa('level(5)'); await sleep(500);
    await qa('tabbyBoard()'); await sleep(700);
    await shot('r12-tabby-board');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save")');
  }
  // ---- R11 juice (Sol fix 3): split frames on the L13 3-chain (still board on #pf-board, moving cats + fx on the
  // low-res #pf-fx, the counter on #pf-top), the same frozen frame drawn whole for comparison, a tap overlapping the
  // chain keeps every landing, the final landing's screen pulse + buzz (none with reduced motion), the lid slam, the
  // win card's coin flight, and a 1600x900 frame. QA_SKIP_R11J=1 skips it. ----
  if (!process.env.QA_SKIP_R11J) {
    const playChain = async (onChain) => {
      await qa('level(13)'); await sleep(900);
      let hit = false;
      for (const cid of await qa('order()')) {
        await waitFor('!window.__qa.state().busy', 20000).catch(() => {});
        if (!(await qa(`alive(${cid})`))) continue;
        if (!(await ev(`window.__qa.state().free.includes(${cid}) || window.__qa.state().blocked.includes(${cid})`))) continue;
        const pk = await qa(`peek(${cid})`);
        await qa(`tap(${cid})`);
        if (pk.boards >= 3 && !hit) { hit = true; await onChain(pk.boards); }
      }
      if (!hit) throw new Error('r11 juice: the L13 line should hold a 3-chain');
      await waitFor('window.__qa.state().screen === "win"', 60000);
    };
    const toLast = async () => { for (let i = 0; i < 120; i++) { const f = await qa('chainFx()'); if (f && f.land === f.n) return true; await qa('freezeAt(0.02)'); } return false; };
    const stubVib = '(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; }; })()';
    const opa = (id) => ev(`+(document.getElementById("${id}") || {}).style?.opacity || 0`);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 20, coins: 100, meta: { sessions: 3 }, settings: { lang: 'en', sound: false, music: false, haptics: true } }))`);
    await boot();
    await ev(stubVib);
    await playChain(async (n) => {
      await waitFor('(window.__qa.chainFx() || {}).k >= 2', 15000);
      await qa('freezeAt(0.1)'); await sleep(250);
      const pf = await ev('(() => { const b = document.getElementById("game"), f = document.getElementById("pf-fx"); return { split: window.__perf.split, board: !!document.getElementById("pf-board"), top: !!document.getElementById("pf-top"), belt: !!document.getElementById("pf-belt"), ratio: f.width / b.width }; })()');
      if (!pf.split || !pf.board || !pf.top || !pf.belt) throw new Error('r11 juice: the chain should draw split frames: ' + JSON.stringify(pf));
      if (pf.ratio > 0.76 || pf.ratio < 0.59) throw new Error('r11 juice: the moving layer should be 0.6-0.75 of the board resolution, got ' + pf.ratio);
      await shot('r11-juice-chain-split');
      await ev('window.__perf.noSplit = true'); await sleep(250);
      await shot('r11-juice-chain-whole');
      await ev('window.__perf.noSplit = false');
      // a tap that overlaps the chain: the rules take it at once, the chain still lands every cat
      const free = (await qa('state()')).free;
      await qa('slow(1)');
      if (free.length) { await qa(`tap(${free[0]})`); console.log(`  r11 juice: tapped ${free[0]} during the chain`); }
      await waitFor('(window.__qa.chainFx() || {}).k >= 3', 15000);
      await qa('freezeAt(0)');
      if (!(await toLast())) throw new Error('r11 juice: the chain should land all its cats');
      await qa('freezeAt(0.08)'); await sleep(250);
      const fl = await opa('pf-flash'), rg = await opa('pf-ring');
      console.log(`  r11 juice: final landing flash ${fl} ring ${rg} vib ${JSON.stringify(await ev('window.__vib'))}`);
      if (!(fl > 0.3) || !(rg > 0.2)) throw new Error('r11 juice: the last landing should pulse the screen');
      if (!(await ev('window.__vib.includes(22)'))) throw new Error('r11 juice: the last landing should buzz once (haptics on)');
      await shot('r11-juice-chain-final');
      await qa('freezeAt(0.18)'); await sleep(200);
      await shot('r11-juice-lid-slam');
      await qa('slow(1)');
    });
    await waitFor('!!document.querySelector("#modal .card.win")', 15000); await sleep(1100);
    const coins = await ev('document.querySelectorAll(".flycoin:not(.flystar)").length');
    console.log(`  r11 juice: ${coins} coins in flight`);
    await shot('r11-juice-win-coins');
    // reduced motion: no pulse, no buzz (the chain still plays and pays)
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await boot();
    await ev(stubVib);
    await playChain(async () => {
      await waitFor('(window.__qa.chainFx() || {}).k >= 1', 15000);
      await qa('freezeAt(0)');
      await toLast();
      await qa('freezeAt(0.08)'); await sleep(250);
      if ((await opa('pf-flash')) > 0 || (await ev('window.__vib.includes(22)'))) throw new Error('r11 juice: reduced motion should keep the pulse and the buzz off');
      await shot('r11-juice-final-calm');
      await qa('slow(1)');
    });
    await send('Emulation.setEmulatedMedia', { features: [] });
    // R11 fix round 1 (sol-r12-1 juice): on a slow phone an idle board holds its still cats on #pf-board (no whole-board
    // raster at 30 fps) and a tap redraws only the corner it changed. Forced here: headless frames come fast
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 60, coins: 100, meta: { sessions: 3 }, settings: { lang: 'en', sound: false, music: false, haptics: false } }))`);
    await boot(); await qa('level(60)'); await sleep(900);
    await ev('window.__perf.forceSlow = true'); await sleep(1500);
    const hs = () => ev('({ hold: window.__perf.hold || 0, full: window.__perf.boardDraws || 0, part: window.__perf.boardParts || 0 })');
    const h0 = await hs(); await sleep(1500);
    const h1 = await hs();
    console.log(`  r11 f1 idle hold: ${JSON.stringify(h0)} -> ${JSON.stringify(h1)}`);
    if (!(h1.hold > h0.hold + 20) || h1.full - h0.full > 1) throw new Error('r11 f1: a slow idle board should hold its still cats on their layer: ' + JSON.stringify([h0, h1]));
    await shot('r11-f1-idle-hold');
    const fr = (await qa('state()')).free;
    if (fr.length) {
      await qa(`tap(${fr[0]})`); await sleep(1400);
      const h2 = await hs();
      console.log(`  r11 f1 after a tap: ${JSON.stringify(h2)}`);
      if (!(h2.part > h1.part)) throw new Error('r11 f1: a tap on a slow board should redraw only its corner: ' + JSON.stringify([h1, h2]));
      await shot('r11-f1-after-tap');
      // R11 fix round 2 (sol-r12-2 juice): mid-sprint the moving layer clears only its old + new bounds, and nothing sits
      // outside this frame's bounds (no ghost left by a missed rectangle); the sprinting cat itself is inside them
      const fr2 = (await qa('state()')).free;
      if (fr2.length) {
        await qa('slow(0.3)'); await qa(`tap(${fr2[0]})`); await sleep(260);
        const fxs = await ev('(() => { const f = document.getElementById("pf-fx"); const d = f.getContext("2d").getImageData(0, 0, f.width, f.height).data; const r = window.__perf.fxRect; let inn = 0, out = 0; for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) { if (!d[(y * f.width + x) * 4 + 3]) continue; if (r && x >= r[0] - 3 && x <= r[2] + 3 && y >= r[1] - 3 && y <= r[3] + 3) inn++; else out++; } return { parts: window.__perf.fxParts || 0, rect: r && r.map(Math.round), inn, out }; })()');
        await qa('slow(1)');
        console.log(`  r11 f2 moving layer mid-sprint: ${JSON.stringify(fxs)}`);
        if (!fxs.parts || !fxs.rect || !fxs.inn || fxs.out) throw new Error('r11 f2: the moving layer should clear and draw by bounds: ' + JSON.stringify(fxs));
        await shot('r11-f2-juice-sprint-bounds');
      }
    }
    await ev('window.__perf.forceSlow = false');
    // wide screen: the layers stay inside the centred phone column (shot once the push-in has eased out: the R10
    // underlay, scaled by the camera, pokes past the column's bottom while it is in)
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await boot();
    await playChain(async () => { await waitFor('(window.__qa.chainFx() || {}).k >= 1', 15000); await qa('freezeAt(0)'); await toLast(); await qa('freezeAt(0.75)'); await sleep(250); await shot('r11-juice-chain-wide'); await qa('slow(1)'); });
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save")');
    await boot();
  }
  // ---- R11 appeal (sol-r11-3 fix 2): every breed gets the tabby's shaped body (shoulder, belly, tapered rump, head
  // shade on the shoulders) with markings wrapped to the width, on a crowded showcase board and a late board at real
  // phone size (375x812 @3x). QA_SKIP_APPEAL=1 skips it. ----
  if (!process.env.QA_SKIP_APPEAL) {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 220, coins: 500, meta: { sessions: 5 }, settings: { lang: 'en', sound: false, music: false, haptics: false } }))`);
    await boot();
    const unshaped = await ev('import("/src/game/breeds.js").then(async (b) => { const r = await import("/src/game/render.js"); return [...b.COLOR_PAL, b.MYSTERY_PAL].filter((p) => !r.shaped(p)).map((p) => p.name); })');
    if (unshaped.length) throw new Error('appeal: every breed should have the shaped body: ' + unshaped.join(', '));
    await qa('level(60)'); await sleep(800);
    if ((await qa('appealBoard()')) !== 12) throw new Error('appeal: the showcase board should hold 12 cats');
    await sleep(1200);
    await shot('r11-appeal-board');
    await qa('level(220)'); await sleep(1400);
    for (let k = 0; k < 3; k++) { await ev('(() => { const b = document.querySelector("[data-cgo]"); if (b) b.click(); })()'); await sleep(600); }
    await shot('r11-appeal-late');
    await qa('level(9)'); await sleep(1200);
    await shot('r11-f2-appeal-l9'); // R11 fix round 2: calmer hearts / zigzag near the shoulders; exit arrows at phone size
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save")');
  }
  // ---- R11 fun lane (sol-r11-3 fixes 4 + 7): L9's pair park previewed before it commits (press rings + the line to its
  // carrier) and after (ghost cushions), the teaching rewind back to the tap that cost the win, the winnable Take back
  // on a generated board, a free opening (L1-12 losses cost no life), EN + TR at 375x667. QA_SKIP_FUN=1 skips it. ----
  if (!process.env.QA_SKIP_FUN) {
    const lsaveF = () => ev('JSON.parse(localStorage.getItem("lco_save"))');
    const idleF = async () => { await waitFor('!window.__qa.state().busy', 10000); await sleep(150); };
    const toasts = () => ev('[...document.querySelectorAll(".toast")].map((e) => e.textContent).join(" | ")');
    const saveF = (lg, lives) => `localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 13, coins: 100, meta: { sessions: 3 }, lives: { n: ${lives}, t: Date.now() }, cafe: { stars: 0, built: { counter_counter: 1, counter_pastry: 1 } }, settings: { lang: '${lg}', sound: false, music: false, haptics: false } }))`;
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    for (const lg of ['en', 'tr']) {
      await ev(saveF(lg, 5));
      await boot(); await qa('slow(1)'); await qa('level(10)'); await sleep(700); // R12: the pair trap moved from L9 to L10
      if ((await qa('meta()')).cur !== 'pair') throw new Error('r11 fun: L9 should play the curated pair board');
      await waitFor('/two|iki/.test(document.getElementById("tut")?.textContent || "")', 5000); // R12: the order sits on the card first
      // R12: the pair tag (seat cost + queue line) is L9's only now; qa-fast f19 checks it there. L10's whole rule on the card
      const tutL9 = await ev('(() => { const t = document.getElementById("tut"); return t && !t.hidden ? { txt: t.textContent, clip: t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1 } : null; })()');
      if (!tutL9 || tutL9.clip || tutL9.txt !== (lg === 'en' ? 'A parked mom + kitten takes 2 seats.' : 'Park eden anne + yavru 2 minder kaplar.')) throw new Error(`r11 fun ${lg}: L9's rule should sit whole on the teaching card: ${JSON.stringify(tutL9)}`);
      await shot(`r11-f1-pair-cost-${lg}`);
      if (!(await qa('fun()')).ghost) throw new Error('r11 fun: L9 should preview its parks');
      for (const id of [5, 6]) { await idleF(); await qa(`tap(${id})`); }
      await idleF();
      // hold the big pair: two cushion rings + the line to the green carrier, nothing committed yet
      const pp = await qa('pos(9)');
      await touch('touchStart', pp.x, pp.y); await sleep(450);
      if ((await qa('fun()')).press < 2) throw new Error('r11 fun: holding the pair should preview two seats');
      await shot(`r11-fun-press-pair-${lg}`);
      await touch('touchEnd', pp.x, pp.y); await sleep(160);
      if ((await qa('fun()')).park !== 2) throw new Error('r11 fun: the pair park should leave two ghost cushions: ' + JSON.stringify(await qa('fun()')));
      await shot(`r11-fun-park-ghost-${lg}`);
      // the pair park is a proven loss: play it out with real taps (the hint's cheapest seat, then any cat) until the bench overflows
      for (let k = 0; k < 30 && (await qa('state()')).screen !== 'fail'; k++) { await idleF(); const f = await qa('freeId()'); if (f == null) break; await qa(`tap(${f})`); await sleep(100); }
      await waitFor('window.__qa.state().screen === "fail"', 30000); await sleep(900);
      if ((await lsaveF()).lives.n !== 5) throw new Error('r11 fun: a lost bench in the opening should cost no life');
      const lbl = await ev('document.querySelector("#modal [data-act=takeback] b")?.textContent || ""');
      if (lbl !== (lg === 'en' ? 'Back to that tap' : 'O hamleye dön')) throw new Error(`r11 fun ${lg}: the teaching rewind label: ${lbl}`);
      if (!(await ev('[...document.querySelectorAll("#modal .frow *")].every((e) => e.scrollWidth <= e.clientWidth + 1)'))) throw new Error(`r11 fun ${lg}: fail row text clipped`);
      await shot(`r11-fun-fail-l9-${lg}`);
      await ev('document.querySelector("#modal [data-act=takeback]").click()'); await sleep(700);
      const fc = await qa('fun()');
      if (fc.culprit !== 9) throw new Error('r11 fun: the teaching rewind should go back to the pair park (cat 9): ' + JSON.stringify(fc));
      const tl = await toasts();
      if (!(lg === 'en' ? /cost the win/ : /Kaybettiren/).test(tl)) throw new Error(`r11 fun ${lg}: the rewind toast: ${tl}`);
      console.log(`  r11 fun ${lg}: rewound to cat ${fc.culprit}, toast "${tl}"`);
      await shot(`r11-fun-culprit-${lg}`);
    }
    // a generated board past the opening: a loss costs a life, Take back rewinds to a spot the solver proves winnable
    await ev(saveF('en', 5));
    await boot(); await qa('level(13)'); await sleep(600);
    for (let i = 0; i < 2; i++) { await idleF(); const f = await qa('freeId()'); if (f != null) await qa(`tap(${f})`); }
    await idleF(); await qa('failNow()');
    await waitFor('window.__qa.state().screen === "fail"', 30000); await sleep(900);
    if ((await lsaveF()).lives.n !== 4) throw new Error('r11 fun: a loss past the opening should still cost a life');
    if (await ev('!!document.querySelector("#modal [data-act=takeback]")')) {
      await ev('document.querySelector("#modal [data-act=takeback]").click()'); await sleep(600);
      console.log('  r11 fun take back L13: ' + (await toasts()));
      await shot('r11-fun-takeback-l13');
    } else console.log('  note: r11 fun no free Take back on the L13 loss');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save")');
  }
  // ---- R11 vir (Sol fix 6): the production https dare link is the primary share (one tap, text + link, no file), the
  // captioned QR card beside it (a picture at once), the video as the third share recording in the background from the
  // moment the win card opens; the QR legible at 360 px wide (card, clip end card at 360x640 and 720x1280); the received
  // path on fresh saves: open the link, first move, finish, counter-dare, open that on another fresh save.
  // QA_SKIP_VIR=1 skips it. ----
  if (!process.env.QA_SKIP_VIR) {
    const idleV = async () => { await waitFor('!window.__qa.state().busy', 10000); await sleep(150); };
    const playV = async () => { for (const id of await qa('order()')) { await idleV(); if (await qa(`alive(${id})`)) await qa(`tap(${id})`); } };
    const mockV = 'window.__shared = []; navigator.canShare = () => true; navigator.share = async (o) => { window.__shared.push({ at: performance.now() - (window.__tapAt || 0), text: o.text || "", url: o.url || "", files: (o.files || []).map((f) => f.type).join(",") }); };';
    const tapV = (sel) => ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; window.__tapAt = performance.now(); b.click(); return true; })()`);
    const saveV = (name, url) => writeFileSync(join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
    const cfgV = (lg) => `settings: { lang: '${lg}', sound: false, music: false, haptics: false }`;
    const pub = process.env.QA_LOCAL_URL ? origin + '/' : process.env.VITE_PUBLIC_URL;
    const inView = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].length > 0 && [...document.querySelectorAll(${JSON.stringify(sel)})].every((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (e.classList.contains('vircard') || e.scrollWidth <= e.clientWidth + 1) && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; })`);
    const winV = async () => { await waitFor('window.__qa.state().screen === "win"', 30000); await waitFor('!!document.querySelector("#modal .card.win")', 15000); };
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    // 1 the sender (Ana) clears L13 with a chain x3: Dare a friend, Share QR card and the video on one win card
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 60, coins: 500, meta: { sessions: 3, nick: 'Ana' }, ${cfgV('en')} }))`);
    await boot();
    await qa('level(13)'); await sleep(700); await playV();
    await winV(); await sleep(400);
    if (!(await inView('#modal [data-act=share], #modal [data-act=sharecard], #modal [data-act=next]'))) throw new Error('vir: Dare a friend, Share QR card and Next should all sit on screen at 375x667');
    // R11 fix round 1: the picture share is named on its button, and the thumbnail says the video is on its way
    if ((await ev('document.querySelector("#modal [data-act=sharecard] .vcap")?.textContent || ""')) !== 'Share card') throw new Error('vir: the QR button should be labelled Share card');
    if (!(await inView('#modal [data-act=sharecard] .vcap'))) throw new Error('vir: the Share card tag should sit on screen'); // (the tag hangs over the round button's rim, so the button itself skips the overflow test)
    if ((await qa('clip()')).canRecord && !/^(Preparing video|Send video)$/.test(await ev('document.querySelector("#modal .clipcap")?.textContent || ""'))) throw new Error('vir: the thumbnail should say Preparing video until the clip is ready');
    const v0 = await qa('clip()');
    if (v0.canRecord) {
      await waitFor('window.__qa.clip().encoding || window.__qa.clip().ready', 4000); // nobody tapped: the win card started it
      await sleep(400);
      if (!(await ev('/Video \\d+%/.test(document.querySelector("#modal [data-act=shareclip]")?.getAttribute("aria-label") || "") || window.__qa.clip().ready'))) throw new Error('vir: the background video should count up on its button');
    } else console.log('  note: vir no MediaRecorder here: the video button sends the PNG');
    await shot('r11-vir-win-bg');
    // Dare a friend: one tap, the share sheet gets the text and the production link at once, no file
    await ev(mockV);
    await tapV('#modal [data-act=share]'); await sleep(400);
    let sh = await ev('window.__shared');
    const link = sh[0];
    console.log('  vir dare', JSON.stringify(link));
    if (!link || link.files || !/Beat my chain x3 on Level 13!/.test(link.text) || !link.url.startsWith(pub + '?c=3l13-') || link.at > 250) throw new Error('vir: Dare a friend should share text + the public link in the tap: ' + JSON.stringify(sh));
    // Share QR card: one tap, a PNG with the same link as text
    await tapV('#modal [data-act=sharecard]'); await sleep(600);
    sh = await ev('window.__shared');
    if (!sh[1] || sh[1].files !== 'image/png' || !sh[1].text.endsWith(' ' + link.url) || sh[1].at > 400) throw new Error('vir: Share QR card should hand over the PNG with the link at once: ' + JSON.stringify(sh[1]));
    const vc = await qa('virCard()');
    if (!vc || vc.type !== 'image/png' || vc.size < 20000 || !vc.still || !vc.url.startsWith(pub + '?c=3l13-')) throw new Error('vir: QR card ' + JSON.stringify(vc));
    saveV('r11-vir-card.jpg', await qa('virCardShot()'));
    // the QR read back from a 360 px wide copy (smoothing + JPEG): card, end card recorded at 360x640 and at 720x1280
    const pr = await qa('virQrProbe()');
    console.log('  vir QR at 360px', JSON.stringify(pr));
    for (const k of ['card', 'end1', 'end2']) if (!pr[k] || pr[k].mod < 4 || pr[k].err > 0.02) throw new Error(`vir: the ${k} QR should read at 360 px wide: ` + JSON.stringify(pr[k]));
    const ef = await qa('clipFrames(["end"])');
    saveV('r11-vir-clip-end.jpg', ef[0].url);
    // the video: ready without a tap, then one tap sends it (and the link follows as its own message)
    if (v0.canRecord) {
      await waitFor('window.__qa.clip().ready', 25000); await sleep(300);
      if (!(await ev('document.querySelector("#modal [data-act=shareclip]").classList.contains("ready")'))) throw new Error('vir: the video button should say it is ready');
      await shot('r11-vir-video-ready');
      await tapV('#modal [data-act=shareclip]'); await sleep(600);
      sh = await ev('window.__shared');
      if (!sh[2] || !/^video\//.test(sh[2].files) || !sh[2].text.endsWith(' ' + link.url)) throw new Error('vir: the video share ' + JSON.stringify(sh[2]));
      if (!(await ev('!!document.querySelector("#linkbar.dlink")'))) throw new Error('vir: the link should follow the video');
      await ev('document.getElementById("linkbar")?.remove()');
    }
    const cs = await qa('counters()');
    if (!cs.share_tap_card || (v0.canRecord && !cs.clip_bg)) throw new Error('vir: counters ' + JSON.stringify(cs));
    const code = link.url.split('?c=')[1];
    // 2 a friend opens the link on a fresh save: the landing, the first move, the finish
    await ev('localStorage.clear()');
    await boot('?c=' + code);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
    const landV = await ev('document.querySelector("#modal .card.dare").textContent');
    if (!/Ana dares you!/.test(landV) || !/Beat a chain x3/.test(landV)) throw new Error('vir: landing ' + landV);
    if (!(await inView('#modal [data-act=dareplay]'))) throw new Error('vir: Play should be on screen on the landing at 375x667');
    if ((await qa('counters()')).dare_open !== 1) throw new Error('vir: the open should be counted once');
    await shot('r11-vir-recv-landing');
    await ev('document.getElementById("darename").value = "Ece"; document.querySelector("[data-act=dareplay]").click()'); await sleep(900);
    if ((await qa('state()')).mode !== 'play') throw new Error('vir: Play should start the dared board');
    const first = (await qa('order()'))[0];
    await idleV(); await qa(`tap(${first})`); await sleep(300);
    if ((await qa('counters()')).dare_first_move !== 1) throw new Error('vir: the first move should be counted');
    await shot('r11-vir-recv-first-move');
    await playV();
    await winV(); await sleep(600);
    const resV = await ev('document.querySelector("#modal .dres")?.textContent || ""');
    if (!/Ana/.test(resV) || (await qa('counters()')).dare_done !== 1) throw new Error('vir: the friend result ' + resV);
    if (!(await inView('#modal .dback, #modal [data-act=sharecard]'))) throw new Error('vir: the counter-dare and the QR card should be on screen');
    await shot('r11-vir-recv-win');
    // 3 the counter-dare: one tap, the round and both results, the production link carrying the thread
    await ev(mockV);
    await tapV('#modal .dback'); await sleep(400);
    const cd = (await ev('window.__shared'))[0];
    console.log('  vir counter-dare', JSON.stringify(cd));
    if (!cd || cd.files || !/Round 2 on Level 13/.test(cd.text) || !cd.url.startsWith(pub + '?c=3l13-') || cd.at > 250) throw new Error('vir: counter-dare share ' + JSON.stringify(cd));
    const back = await qa(`dareDecode(${JSON.stringify(cd.url.split('?c=')[1])})`);
    const sent = await qa(`dareDecode(${JSON.stringify(code)})`);
    if (!back || back.nm !== 'Ece' || back.r !== sent.i || back.pg !== 3 || back.rd !== 2 || !back.th || back.th[0].nm !== 'Ana') throw new Error('vir: counter-dare payload ' + JSON.stringify(back));
    if (!(await qa('counters()')).dare_reshare) throw new Error('vir: the reshare should be counted');
    // R11 fix round 2 (sol-r12-2 virality): the counter-dare's QR carries the reply context too, still readable at 360 px;
    // scanned on the first sender's phone it lands in Friend Results like the text link
    const vqr = await qa('virCard()');
    const qcode = vqr && vqr.url.split('?c=')[1];
    const qb = qcode && await qa(`dareDecode(${JSON.stringify(qcode)})`);
    console.log('  vir counter-dare QR', qcode);
    if (!qb || qb.r !== sent.i || qb.pg !== 3 || qb.i !== back.i) throw new Error('vir: the counter-dare QR should carry the reply: ' + JSON.stringify(qb));
    const prq = await qa('virQrProbe()');
    console.log('  vir counter-dare QR probe', JSON.stringify(prq));
    // the QA build's address is 9 characters longer than production's (longcat-746.pages.dev, check-dare keeps reply
    // codes there at QR version 4): a longer address may step up to version 5, read here at >= 3.6 px a module
    const qmin = vqr.url.length <= 62 ? 4 : 3.6;
    for (const k of ['card', 'end1', 'end2']) if (prq[k] && (prq[k].mod < qmin || prq[k].err > 0.02)) throw new Error(`vir: the counter-dare ${k} QR should read at 360 px wide: ` + JSON.stringify(prq[k]));
    saveV('r11-f2-vir-reply-card.jpg', await qa('virCardShot()'));
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 20, coins: 100, meta: { sessions: 4 }, fr: { list: [], sent: [${JSON.stringify(sent.i)}] }, ${cfgV('en')} }))`);
    await boot('?c=' + qcode);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(400);
    const frq = await ev('JSON.parse(localStorage.getItem("lco_save")).fr.list[0] || null');
    if (!frq || frq.id !== qb.i || frq.pg !== 3 || !frq.mine) throw new Error('vir: a scanned counter-dare should land in Friend Results: ' + JSON.stringify(frq));
    await shot('r11-f2-vir-qr-reply-landing');
    // 4 the counter-dare opened on another fresh save: Ece dares, the thread and the round
    await ev('localStorage.clear()');
    await boot('?c=' + cd.url.split('?c=')[1]);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
    const land2V = await ev('document.querySelector("#modal .card.dare").textContent');
    if (!/Ece dares you!/.test(land2V) || !/Ana x3/.test(land2V) || !/Round 2/.test(land2V)) throw new Error('vir: counter-dare landing ' + land2V);
    if (!(await inView('#modal [data-act=dareplay]'))) throw new Error('vir: Play on the counter-dare landing');
    await shot('r11-vir-recv2-landing');
    // 5 TR win card at 375x667 and the desktop win card
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 60, coins: 500, meta: { sessions: 3 }, ${cfgV('tr')} }))`);
    await boot();
    await qa('level(13)'); await sleep(700); await playV();
    await winV(); await sleep(900);
    if (!(await inView('#modal [data-act=share], #modal [data-act=sharecard], #modal [data-act=next]'))) throw new Error('vir TR: the share row should fit at 375x667');
    await shot('r11-vir-win-tr');
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 2, mobile: true }); await sleep(900);
    if (!(await inView('#modal [data-act=share], #modal [data-act=sharecard], #modal [data-act=next]'))) throw new Error('vir TR: the share row should fit at 360x640');
    await shot('r11-vir-win-tr-360');
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await qa('level(13)'); await sleep(700); await playV();
    await winV(); await sleep(900);
    if (!(await inView('#modal [data-act=share], #modal [data-act=sharecard]'))) throw new Error('vir desktop: the share row');
    await shot('r11-vir-win-desk');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save")');
  }
  // ---- R11 ret (sol-r11-3 fix 5): past the early resident thread the map's strip is the nearest album reward (the
  // postcard, the exact stamp / board left, a button straight to it); a completed page opens the room with Hang
  // pre-selected; from the 3rd win of a day the win card names tomorrow. QA_SKIP_RET=1 skips it. ----
  if (!process.env.QA_SKIP_RET) {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    const cfgR = (lg) => `settings: { lang: '${lg}', sound: false, music: false, haptics: false }`;
    // today's day / week numbers as the game counts them (local midnight, weeks from Monday)
    const DAYX = '(Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000))';
    const day = await ev(DAYX);
    const wk = Math.floor((day + 3) / 7);
    const ci = ((wk % 24) + 24) % 24;
    const page = Math.floor(ci / 4);
    const others = Array.from({ length: 4 }, (_, j) => page * 4 + j).filter((i) => i !== ci);
    const noClip = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].every((e) => e.scrollWidth <= e.clientWidth + 1)`);
    for (const lg of ['en', 'tr']) {
      // 1. a fresh event week: the card names this week's postcard and "3 stamps: clear Show board A", button = Board A
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 30, coins: 300, meta: { sessions: 6 }, cafe: { stars: 0, built: {} }, ${cfgR(lg)} }))`);
      await boot(); await qa('home()'); await sleep(900);
      const c1 = await ev('(() => { const b = document.querySelector("#cafe .room .rtalb .rtcard"); return b ? { act: b.dataset.act, k: b.dataset.k || "", txt: b.textContent } : null; })()');
      if (!c1 || c1.act !== 'showplay' || c1.k !== 'a') throw new Error(`r11-ret ${lg}: the map should show the album card with Board A: ${JSON.stringify(c1)}`);
      if (!(lg === 'en' ? /3 stamps: clear Show board A/ : /3 damga: Şov A tahtasını geç/).test(c1.txt)) throw new Error(`r11-ret ${lg}: the card should name the exact step: ${c1.txt}`);
      if (!(await noClip('#cafe .rtcard .gt b, #cafe .rtcard .gcta'))) throw new Error(`r11-ret ${lg}: album card text clipped`);
      if (await ev('getComputedStyle(document.querySelector("#cafe .room > .goals:not(.rtalb)") || document.body).display !== "none" && !!document.querySelector("#cafe .room > .goals:not(.rtalb)")')) throw new Error(`r11-ret ${lg}: the album card should take the strip's place, not stack on it`);
      await shot(`r11-ret-map-${lg}`);
      // R11 fix round 2 (sol-r12-2 retention): the album's empty slot for that postcard names the same step and button
      await qa('act("album")'); await sleep(800);
      const sl = await ev(`(() => { const s = document.querySelector(".album .pc.empty.step .pcgo[data-w='${wk}']")?.closest(".pc"); if (!s) return null; const b = s.querySelector(".pcgo"); return { txt: s.querySelector(".pcstep small").textContent, act: b && b.dataset.act, k: b && b.dataset.k }; })()`);
      if (!sl || sl.act !== 'showplay' || sl.k !== 'a' || sl.txt !== (lg === 'en' ? '3 stamps left' : '3 damga kaldı')) throw new Error(`r11-ret ${lg}: the album slot should name the map's step: ${JSON.stringify(sl)}`);
      if (!(await noClip('.album .pc.empty.step .pcstep small, .album .pc.empty.step .pcgo'))) throw new Error(`r11-ret ${lg}: album slot step clipped`);
      await shot(`r11-f2-ret-album-${lg}`);
      // 2. the last card of a page, all three stamps in: Claim -> the room with Hang pre-selected, the postcard over it
      const cards = Object.fromEntries(others.map((i) => [i, 1]));
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 30, coins: 300, meta: { sessions: 6 }, cafe: { stars: 0, built: {} }, show: { week: ${wk}, decor: {}, marks: { "${wk}a": 1, "${wk}b": 1 }, goals: {}, from: ${wk - 2} }, pop: { daily: { "${wk}": 1 }, paid: {}, cu: -1 }, album: { cards: ${JSON.stringify(cards)}, hung: {} }, ${cfgR(lg)} }))`);
      await boot(); await qa('home()'); await sleep(900);
      const c2 = await ev('document.querySelector("#cafe .rtalb .rtcard")?.dataset.act || ""');
      if (c2 !== 'popclaim') throw new Error(`r11-ret ${lg}: three stamps: the card should claim (${c2})`);
      if (!(lg === 'en' ? /Completes the .+ print!/ : /tablosunu tamamlar!/).test(await ev('document.querySelector("#cafe .rtalb .rtcard").textContent'))) throw new Error(`r11-ret ${lg}: the last card of a page should say it completes the print`);
      await shot(`r11-ret-claim-${lg}`);
      await ev('document.querySelector("#cafe .rtalb .rtcard").click()');
      await waitFor('!!document.getElementById("pcard")', 8000); await sleep(700);
      if (!(await ev('!!document.querySelector("#cafe.vroom .nbcard .rthang .rtsel") && !document.querySelector("#cafe .hubmap")'))) throw new Error(`r11-ret ${lg}: a completed page should open the room with the hang card`);
      await shot(`r11-ret-pagedone-${lg}`);
      await ev('document.querySelector("#pcard [data-act=pcclose]").click()'); await sleep(500);
      if (!(await ev('document.activeElement && document.activeElement.classList.contains("rtsel")'))) throw new Error(`r11-ret ${lg}: Hang should be pre-selected`);
      if (!(await noClip('#cafe .nbcard .rthang .tname b'))) throw new Error(`r11-ret ${lg}: hang card text clipped`);
      await shot(`r11-ret-hang-${lg}`);
      await ev('document.querySelector("#cafe .nbcard .rtsel").click()'); await sleep(700);
      const hung = await ev('Object.values(JSON.parse(localStorage.getItem("lco_save")).album.hung)');
      if (!hung.includes(page)) throw new Error(`r11-ret ${lg}: Hang should hang page ${page}: ${JSON.stringify(hung)}`);
      if (await ev('!!document.querySelector("#cafe .nbcard .rthang")')) throw new Error(`r11-ret ${lg}: the hang card should leave once the print is up`);
      // 3. the 3rd win of the day: the win card names tomorrow
      await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 30, coins: 300, meta: { sessions: 6 }, cafe: { stars: 0, built: {} }, ret: { wd: ${await ev(DAYX)}, wn: 2, hang: -1 }, ${cfgR(lg)} }))`);
      await boot(); await qa('level(30)'); await sleep(600); await qa('winNow()');
      await waitFor('window.__qa.state().screen === "win"', 30000); await waitFor('!!document.querySelector("#modal .card.win")', 15000); await sleep(1000);
      const tm = await ev('document.querySelector("#modal .card.win .rttm")?.textContent || ""');
      if (!(lg === 'en' ? /3 wins today! Tomorrow:/ : /Bugün 3 galibiyet! Yarın:/).test(tm)) throw new Error(`r11-ret ${lg}: the 3rd win should name tomorrow: ${tm}`);
      await shot(`r11-ret-win-${lg}`);
    }
    // the wide screen: the same album card in the left panel
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 30, coins: 300, meta: { sessions: 6 }, cafe: { stars: 0, built: {} }, ${cfgR('en')} }))`);
    await boot(); await qa('home()'); await sleep(1200);
    if (!(await ev('!!document.querySelector("#hubL .rtside .rtcard")'))) throw new Error('r11-ret: the wide left panel should carry the album card');
    await shot('r11-ret-wide');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save")');
  }
  // ---- R11 pres (sol-r11-3 fix 1): one Play on the mobile map (the node is a level marker), the resident line in full
  // on the build card, the front carrier's n/3 tag clear of the LEVEL plaque, the win card, at 360x640 and 375x667 in
  // EN + TR, and the 1600x900 hub. QA_SKIP_PRES=1 skips it. ----
  if (!process.env.QA_SKIP_PRES) {
    const cfgP = (lg) => `settings: { lang: '${lg}', sound: false, music: false, haptics: false }`;
    const presSave = (lg) => `localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: 6, coins: 100, meta: { sessions: 2 }, cafe: { stars: 0, built: {} }, ${cfgP(lg)} }))`;
    // visible buttons that read Play / Oyna on their own: the big bottom PLAY must be the only one
    const PLAYS = `[...document.querySelectorAll('#cafe *')].filter((e) => e.children.length === 0 && /^(play|oyna)$/i.test((e.textContent || '').trim()) && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').length`;
    const TAGGAP = `(() => { const L = window.__qa.layout(); const p = document.querySelector('#hud .lvl-pill').getBoundingClientRect(); return Math.round((L.beltY + 2 - 1.1724 * L.cs - p.bottom) * 10) / 10; })()`;
    for (const [w, h] of [[360, 640], [375, 667]]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      for (const lg of ['en', 'tr']) {
        await ev(presSave(lg));
        await boot(); await qa('home()'); await sleep(800);
        if (await ev('!!document.querySelector(".hmplay")')) throw new Error(`pres ${w} ${lg}: the map node should not carry its own Play pill`);
        if (!(await ev('document.querySelector("#cafe .hmn.cur")?.dataset.act === "play"'))) throw new Error(`pres ${w} ${lg}: the current node should still start the level`);
        const plays = await ev(PLAYS);
        if (plays !== 1) throw new Error(`pres ${w} ${lg}: the map should show one Play, saw ${plays}`);
        const thr = await ev('(() => { const s = document.querySelector("#cafe .nbcard small.thread"); if (!s) return null; const r = s.getBoundingClientRect(), c = s.closest(".nbcard").getBoundingClientRect(); return { txt: s.textContent, clip: s.scrollWidth > s.clientWidth + 1, out: r.bottom > c.bottom - 2 || r.right > c.right }; })()');
        if (thr && (thr.clip || thr.out)) throw new Error(`pres ${w} ${lg}: the resident line on the build card is clipped: ${JSON.stringify(thr)}`);
        if (!(await ev('[...document.querySelectorAll("#cafe .goal.feat .gt b")].every((e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1)'))) throw new Error(`pres ${w} ${lg}: featured goal text clipped`);
        // R11 fix round 1: the map fades out under the top bar, so no node sits half-hidden behind a pill
        if (await ev('getComputedStyle(document.querySelector("#cafe .hmscroll")).maskImage === "none" && getComputedStyle(document.querySelector("#cafe .hmscroll")).webkitMaskImage === "none"')) throw new Error(`pres ${w} ${lg}: the map should keep a safe band under the top bar`);
        // R11 fix round 2 (sol-r12-2 presentation): the goal strip keeps Mochi's wins, the build card says what the piece needs
        const dup = await ev('(() => { const a = document.querySelector("#cafe .goal.feat .gt b")?.textContent || "", b = document.querySelector("#cafe .nbcard small.thread")?.textContent || ""; return { a, b, cost: !!document.querySelector("#cafe .nbcard small.tcost") }; })()');
        if (!dup.cost || dup.a === dup.b) throw new Error(`pres ${w} ${lg}: the build card should name the piece's cost, not repeat the goal strip: ${JSON.stringify(dup)}`);
        await shot(`r11-pres-map-${w}-${lg}`);
        // the teaching boards: the n/3 tag on the front carrier stays clear of the plaque
        for (const lv of [4, 6, 7, 9]) {
          await qa(`level(${lv})`); await sleep(900);
          if (lv === 7 && (await qa('meta()')).cur !== 'warm') throw new Error(`pres ${w} ${lg}: L7 should play the curated warm-up board`);
          // R11 fix round 1: the teaching card has its own slot: its tail stays below the bottom row of cells
          const slot = await ev('(() => { const t = document.getElementById("tut"); if (!t || t.hidden || !t.textContent) return null; return Math.round(t.getBoundingClientRect().top - 10 - window.__qa.layout().cellsB); })()');
          console.log(`  pres ${w}x${h} ${lg} L${lv} card slot ${slot}px`);
          if (slot != null && slot < 0) throw new Error(`pres ${w} ${lg} L${lv}: the teaching card covers the bottom row (${slot}px)`);
          const gap = await ev(TAGGAP);
          console.log(`  pres ${w}x${h} ${lg} L${lv} tag-plaque gap ${gap}px`);
          if (gap < 3) throw new Error(`pres ${w} ${lg} L${lv}: the n/3 tag crowds the LEVEL plaque (${gap}px)`);
          if (lv === 6 || lv === 9 || lg === 'en') await shot(`r11-pres-l${lv}-${w}-${lg}`);
          if (lv === 9) { // R11 fix round 2: L9's rule on the card (not an ellipsised toast), then its fail sheet
            if (!(await ev('(() => { const t = document.getElementById("tut"); return !!t && !t.hidden && t.textContent.length > 20 && t.scrollWidth <= t.clientWidth + 1 && t.scrollHeight <= t.clientHeight + 1; })()'))) throw new Error(`pres ${w} ${lg} L9: the rule should sit whole on the teaching card`);
            if (await ev('[...document.querySelectorAll(".toast")].some((e) => e.scrollWidth > e.clientWidth + 1)')) throw new Error(`pres ${w} ${lg} L9: a clipped toast`);
            await qa('failNow()');
            await waitFor('window.__qa.state().screen === "fail"', 30000); await sleep(900);
            if (!(await ev('[...document.querySelectorAll("#modal .card *")].filter((e) => e.children.length === 0).every((e) => e.scrollWidth <= e.clientWidth + 1)'))) throw new Error(`pres ${w} ${lg} L9: fail sheet text clipped`);
            await shot(`r11-f2-pres-l9-fail-${w}-${lg}`);
            await qa('level(9)'); await sleep(900);
          }
        }
        await qa('winNow()');
        await waitFor('window.__qa.state().screen === "win"', 30000); await waitFor('!!document.querySelector("#modal .card.win")', 15000); await sleep(1100);
        const nb = await ev('(() => { const b = document.querySelector("#modal .card.win [data-act=next], #modal .card.win > [data-act=retry]"); return b ? Math.round(b.getBoundingClientRect().bottom) : -1; })()');
        if (nb < 0 || nb > h) throw new Error(`pres ${w} ${lg}: Next should be on screen on the win card (${nb})`);
        await shot(`r11-pres-win-${w}-${lg}`);
      }
    }
    // the shop header: the balance pill and the close button on one centre line
    await qa('home()'); await sleep(600); await qa('screen("shop")'); await sleep(900);
    const hd = await ev('(() => { const a = document.querySelector(".s4bal")?.getBoundingClientRect(), b = document.querySelector(".phead .round.x")?.getBoundingClientRect(); return a && b ? Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) : -1; })()');
    if (hd < 0 || hd > 2) throw new Error(`pres: the shop balance and close button should share a centre line (${hd})`);
    await shot('r11-pres-shop-375');
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(presSave('en'));
    await boot(); await sleep(800);
    await shot('r11-pres-desk-1600');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save")');
  }
  // ---- R11 look: the map ground changes per chapter (the next chapter's layer fades in over the boundary, the props
  // take the theme), the right panel's road card uses the chapter ground, and the desktop sides show the painted cat
  // street (only on a wide screen: a phone never fetches it). Frames r11x-look-*. QA_SKIP_LOOK=1 skips it. ----
  if (!process.env.QA_SKIP_LOOK) {
    const lookSave = (lv) => `localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: ${lv}, coins: 100, meta: { sessions: 3 }, cafe: { stars: 0, built: {} }, settings: { lang: 'en', sound: false, music: false, haptics: false } }))`;
    const DESKREQ = `performance.getEntriesByType('resource').filter((e) => /look-desk/.test(e.name)).length`;
    const LAYERS = `[...document.querySelectorAll('#cafe .hubmap .lookch')].map((e) => e.className.replace('lookch ', ''))`;
    // scroll the map so the chapter 1|2 boundary (the fading layer's bottom edge minus the fade) sits mid-screen
    const TOEDGE = `(() => { const sc = document.querySelector('#cafe .hmscroll'); const f = [...document.querySelectorAll('#cafe .lookch.fade')].pop(); if (!sc || !f) return -1; sc.scrollTop = f.offsetTop + f.offsetHeight - 150 - sc.clientHeight / 2; return Math.round(sc.scrollTop); })()`;
    const lookMaps = async (tag) => {
      await ev(lookSave(5)); await boot(); await qa('home()'); await sleep(1200);
      const l1 = await ev(LAYERS);
      if (!l1.length || !l1[0].includes('t-garden')) throw new Error(`look ${tag}: chapter 1 should stand on the garden: ${JSON.stringify(l1)}`);
      await shot(`r11x-look-map-ch1-${tag}`);
      await ev(lookSave(12)); await boot(); await qa('home()'); await sleep(1200);
      const l2 = await ev(LAYERS);
      if (!l2.some((c) => c.includes('t-garden')) || !l2.some((c) => c.includes('t-autumn') && c.includes('fade'))) throw new Error(`look ${tag}: L12 should show the garden fading into the autumn park: ${JSON.stringify(l2)}`);
      if (!(await ev('!!document.querySelector("#cafe .hmprop.t-autumn, #cafe .hmprop.t-garden")'))) throw new Error(`look ${tag}: the road props should carry their chapter theme`);
      if ((await ev(TOEDGE)) < 0) throw new Error(`look ${tag}: no chapter boundary to scroll to`);
      await sleep(500);
      await shot(`r11x-look-map-edge-${tag}`);
    };
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await lookMaps('375');
    if ((await ev(DESKREQ)) !== 0) throw new Error('look: a phone should never download the desktop backdrop');
    for (const [w, h] of [[1920, 1080], [1366, 768]]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await lookMaps(String(w));
      await waitFor(`${DESKREQ} > 0`, 8000); await sleep(400);
      const bg = await ev('getComputedStyle(document.documentElement, "::before").backgroundImage');
      if (!/look-desk-/.test(bg)) throw new Error(`look ${w}: the sides should show the cat street: ${bg.slice(0, 120)}`);
      if (!(await ev('/look-map-autumn/.test(document.querySelector("#hubR .hsroad")?.getAttribute("style") || "")'))) throw new Error(`look ${w}: the road card should use chapter 2's ground`);
      await shot(`r11x-look-desk-${w}`);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save")');
  }
  // ---- shape lane (r11x): shaped boards and folded quilts that open mid-level. 375x667: the first shaped board (L16
  // heart) with its one-time card, heart (L96) and paw (L84) boards mid-play, the first folded board's card (L57), a tap
  // on the flap (nothing leaves), the unfold before / during / after; the TR fold card; 1600x900. Cells stay >= 30 px.
  // QA_SKIP_SHAPE=1 skips it. ----
  if (!process.env.QA_SKIP_SHAPE) {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    const cfgS = (lg) => `settings: { lang: '${lg}', sound: false, music: false, haptics: false }`;
    const saveS = (lg, lv) => `localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: ${lv}, coins: 100, meta: { sessions: 3 }, cafe: { stars: 0, built: {} }, ${cfgS(lg)} })); localStorage.removeItem("lco_shape")`;
    const sinfo = () => ev('window.__qaShape.info()');
    const closeCards = async () => { for (const sel of ['#smodal [data-sgo]', '#cmodal [data-cgo]']) await ev(`document.querySelector(${JSON.stringify(sel)})?.click()`); await sleep(300); };
    const cellOk = async (tag) => { const i = await sinfo(); console.log(`  shape ${tag}: ${i.shape || '-'} ${i.w}x${i.h} cell ${i.cell}px folds ${JSON.stringify(i.folds)}`); if (i.cell < 30) throw new Error(`shape ${tag}: cells ${i.cell}px < 30`); return i; };
    await ev(saveS('en', 16));
    await boot();
    // 1. the first shaped board and its card (once)
    await qa('level(16)');
    await waitFor('window.__qaShape.card() === "shape"', 10000); await sleep(700);
    if ((await cellOk('L16')).shape !== 'heart') throw new Error('shape: L16 should be the heart');
    await shot('r11x-shape-first-card');
    await closeCards(); await sleep(400);
    await shot('r11x-shape-first-board');
    await qa('level(16)'); await sleep(1600);
    if (await ev('window.__qaShape.card()')) throw new Error('shape: the shaped-board card should show once');
    // 2. heart and paw boards mid-play (three solver taps each)
    for (const n of [96, 84]) {
      await qa(`level(${n})`); await sleep(900); await closeCards();
      for (let k = 0; k < 3; k++) { await waitFor('!window.__qa.state().busy', 10000); await qa('solveStep()'); await sleep(420); }
      await waitFor('!window.__qa.state().busy', 10000); await sleep(300); await closeCards(); // a pack's new-piece card can open late
      await cellOk('L' + n);
      await shot(`r11x-shape-mid-${n}`);
    }
    // 3. the first folded board: its card, a tap on the flap (a wiggle and a toast, no cat leaves), then the unfold
    await qa('level(57)');
    await waitFor('window.__qaShape.card() === "fold"', 10000); await sleep(700);
    await shot('r11x-shape-fold-card');
    await closeCards(); await sleep(300);
    let fi = await cellOk('L57');
    if (!fi.folds.length || fi.folds[0].open) throw new Error('shape: L57 should start with a closed flap');
    const alive0 = (await qa('state()')).alive;
    const fp = await ev('window.__qaShape.flapAt(0)');
    await tap(fp[0], fp[1]); await sleep(500);
    if ((await qa('state()')).alive !== alive0) throw new Error('shape: a tap on the flap must not send a cat');
    await shot('r11x-shape-fold-before');
    for (let k = 0; k < 24 && !(await sinfo()).folds[0].open; k++) { await waitFor('!window.__qa.state().busy', 10000); await qa('solveStep()'); await sleep(380); }
    if (!(await sinfo()).folds[0].open) throw new Error('shape: the flap should open once its count is reached');
    await waitFor('window.__qaShape.unfolding()', 6000); await sleep(260);
    await shot('r11x-shape-fold-mid');
    await waitFor('!window.__qa.state().busy', 10000); await sleep(500);
    await shot('r11x-shape-fold-after');
    // the solver still finds the win after the flap opened
    for (let k = 0; k < 40 && (await qa('state()')).screen !== 'win'; k++) { await waitFor('!window.__qa.state().busy', 10000).catch(() => {}); if ((await qa('solveStep()')) == null) await sleep(300); await sleep(300); }
    await waitFor('window.__qa.state().screen === "win"', 30000);
    // 4. TR: the fold card on the first folded board in Turkish
    await ev(saveS('tr', 22));
    await boot(); await qa('level(22)');
    await waitFor('window.__qaShape.card() === "fold"', 10000); await sleep(700);
    if (!(await ev('[...document.querySelectorAll("#smodal .card *")].every((e) => e.scrollWidth <= e.clientWidth + 1)'))) throw new Error('shape: TR fold card text clipped');
    await shot('r11x-shape-fold-card-tr');
    await closeCards(); await cellOk('L22');
    await shot('r11x-shape-fold-l22-tr');
    // 5. the wide screen: the paw board in the phone column
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(saveS('en', 84) + '; localStorage.setItem("lco_shape", JSON.stringify({ shape: 1, fold: 1 }))');
    await boot(); await qa('level(84)'); await sleep(1200); await closeCards();
    await cellOk('L84 1600');
    await shot('r11x-shape-desk-1600');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
    await ev('localStorage.removeItem("lco_save"); localStorage.removeItem("lco_shape")');
  }
  // ---- R11 boss lane: L19 -> L20 boss intro + nameplate + frame, HP mid-level, the defeat ceremony and the boss chest
  // (rare reveal), the L5 milestone chest, the streak chest, the flame going out, the map's castle / chest nodes and pill
  // (EN + TR, 1600x900), a waiting chest, reduced motion. Body: scripts/qa-boss.mjs. QA_SKIP_BOSS=1 skips it. ----
  if (!process.env.QA_SKIP_BOSS) await (await import('./qa-boss.mjs')).bossQA({ send, ev, qa, shot, boot, sleep, waitFor });
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
