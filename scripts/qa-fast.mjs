// Fast QA (R11x): at most 5 minutes. No playing through: every screen is reached by "teleporting" (a save injected
// into localStorage lco_save, then the window.__qa hooks), one frame each, console errors and page scroll asserted.
// vite dev on PORT (default 5193) + chrome-headless-shell over raw CDP on the GPU (QA_NOGPU=1: software raster, CPU-heavy). Frames land in qa/fast/.
// Usage: npm run qa:fast
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const OUT = join(ROOT, 'qa', 'fast');
const PORT = +(process.env.PORT || 5193);
const LIMIT = 5 * 60 * 1000;
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'lco-qaf-'));
const procs = [];
const errs = [];
const fails = [];
const kill = () => { for (const p of procs.splice(0)) { try { spawn('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } } };
const bye = (code) => { kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ } process.exit(code); }, 800); };
setTimeout(() => { console.log(`HARD TIMEOUT after ${LIMIT / 1000}s`); bye(2); }, LIMIT).unref();

try {
  if (!process.env.VITE_PUBLIC_URL && !process.env.QA_LOCAL_URL) process.env.VITE_PUBLIC_URL = 'https://example.github.io/long-cat-out/';
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', env: process.env });
  procs.push(vite.pid);
  const origin = `http://localhost:${PORT}`;
  for (let i = 0; ; i++) { try { if ((await fetch(origin + '/')).ok) break; } catch { /* not yet */ } if (i > 150) throw new Error('vite did not start'); await sleep(200); }
  const cport = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const ch = spawn(CHROME, [`--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, '--headless', '--mute-audio', ...(process.env.QA_NOGPU ? ['--disable-gpu'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']), '--window-size=375,667', '--disable-extensions', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  procs.push(ch.pid);
  let targets;
  for (let i = 0; ; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not yet */ } if (i > 100) throw new Error('chrome did not start'); await sleep(200); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const cb = new Map();
  let frame = '(boot)';
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && cb.has(d.id)) { const c = cb.get(d.id); cb.delete(d.id); if (d.error) c.rej(new Error(d.error.message)); else c.res(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errs.push(frame + ': ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push(frame + ': ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errs.push(frame + ': ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; cb.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  for (const d of ['Page', 'Runtime', 'Log']) await send(d + '.enable');
  const size = (width, height, dpr = 2, mobile = true) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  await size(375, 667);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]);
    return r.result.value;
  };
  const qa = (expr) => ev('window.__qa.' + expr);
  const waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch { /* busy */ } await sleep(80); } throw new Error('timeout ' + expr); };
  const inView = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1; })()`);
  // r7 hard rule: no screen scrolls (the page, panels, sheet bodies, cards, the hub; an element still animating is skipped)
  const NOSCROLL = `(() => { const bad = []; const se = document.scrollingElement; if (se.scrollHeight > innerHeight + 1) bad.push('page ' + se.scrollHeight + '>' + innerHeight);
    for (const el of document.querySelectorAll('.panel, .pbody, #cafe, #resi, .card, .rgrid, .room')) { if (el.getAnimations().some((x) => x.playState === 'running')) continue;
      const nm = (el.id || el.className).slice(0, 28); if (el.scrollHeight > el.clientHeight + 2) bad.push(nm + ' ' + el.scrollHeight + '>' + el.clientHeight);
      const r = el.getBoundingClientRect(); if (r.height && (r.bottom > innerHeight + 1 || r.top < -1)) bad.push(nm + ' off-screen ' + Math.round(r.top) + '..' + Math.round(r.bottom)); }
    return bad; })()`;
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    const bad = await ev(NOSCROLL).catch(() => []);
    if (bad.length) fails.push(`${name}: scroll ${bad.join(', ')}`);
    console.log(`  ${((Date.now() - T0) / 1000).toFixed(0).padStart(3)}s ${name}${bad.length ? '  SCROLL ' + bad.join(', ') : ''}`);
  };
  // nothing drawn over the middle of el (another layer covering it, e.g. the goals strip over a map marker)
  const uncovered = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (e === h || e.contains(h)); })()`);
  const must = (ok, msg) => { if (!ok) { fails.push(frame + ': ' + msg); console.log('  FAIL ' + msg); } };
  // a step: its own frame name for the error log; a thrown step is a failure, the run goes on
  const step = async (name, fn) => { if (process.env.QA_ONLY && !process.env.QA_ONLY.split(',').some((x) => name.startsWith(x))) return; frame = name; try { await fn(); } catch (e) { fails.push(`${name}: ${e.message}`); console.log(`  FAIL ${name}: ${e.message}`); } };
  const boot = async (query = '') => { await send('Page.navigate', { url: origin + '/' + query }); await sleep(300); await waitFor('!!window.__qa && !!document.querySelector("#menu.on, #cafe.on, #hud.on")', 20000); await sleep(500); };
  const cfg = (lg) => `settings: { lang: '${lg}', sound: false, music: false, haptics: false }`;
  const put = (lv, { lg = 'en', extra = '', shape = true } = {}) => ev(`localStorage.clear(); localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: ${lv}, coins: 400, meta: { sessions: 4 }, cafe: { stars: 0, built: {} }, ${cfg(lg)}${extra ? ', ' + extra : ''} }))${shape ? '; localStorage.setItem("lco_shape", JSON.stringify({ shape: 1, fold: 1 }))' : ''}`);
  const winCard = async () => { await waitFor('window.__qa.state().screen === "win"', 30000); await waitFor('!!document.querySelector("#modal .card.win")', 10000); await sleep(900); };
  const closeCards = async () => { for (const sel of ['#smodal [data-sgo]', '#cmodal [data-cgo]']) await ev(`document.querySelector(${JSON.stringify(sel)})?.click()`); await sleep(250); };
  const home = async () => { await qa('home()'); await sleep(700); };

  await send('Page.navigate', { url: origin + '/' });
  await sleep(300);

  // ---- the map ----
  await step('f01-map-l1', async () => {
    await put(1); await boot(); await home();
    must(await ev('!!document.querySelector("#menu.on")') && /Level 1/.test(await ev('document.querySelector("#menu").textContent')), 'L1: the plain home (the café and its map open at L4) with Play level 1');
    await shot('f01-map-l1');
  });
  await step('f02-map-l37', async () => {
    await put(37, { extra: 'boss: { last: 36, q: [] }' }); await boot(); await home();
    must(await ev('!!document.querySelector(".hmn.boss[data-lv=\'40\'] .bmcastle")'), 'L40 castle node');
    must(await inView('.hmn.boss[data-lv="40"]'), 'the L40 boss castle is in view from L37');
    must(await ev(`(() => { const p = document.querySelector('.bmpill').getBoundingClientRect(); const node = document.querySelector('#cafe .hmn.cur').getBoundingClientRect(); const ov = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return ![...document.querySelectorAll('#cafe .goals')].some((g) => g.getBoundingClientRect().height && ov(p, g.getBoundingClientRect())) && !ov(p, node); })()`), 'the chest pill clear of the goals strip and the current node'); // the pill takes no pointer events: rectangles, not elementFromPoint
    must(await uncovered('#cafe .hmn.cur b'), 'the current node is not under another layer');
    must(await ev('!document.querySelector("[data-tab=season], .bmflame")'), 'no Season badge, no flame meter on the map');
    await shot('f02-map-l37');
  });
  await step('f03-map-chapter-edge', async () => {
    await put(12); await boot(); await home();
    const layers = await ev(`[...document.querySelectorAll('#cafe .hubmap .lookch')].map((e) => e.className)`);
    must(layers.some((c) => c.includes('t-garden')) && layers.some((c) => c.includes('t-autumn') && c.includes('fade')), 'L12: the garden fades into the autumn park ' + JSON.stringify(layers));
    const top = await ev(`(() => { const sc = document.querySelector('#cafe .hmscroll'); const f = [...document.querySelectorAll('#cafe .lookch.fade')].pop(); if (!sc || !f) return -1; sc.scrollTop = f.offsetTop + f.offsetHeight - 150 - sc.clientHeight / 2; return Math.round(sc.scrollTop); })()`);
    must(top >= 0, 'a chapter boundary to scroll to');
    await sleep(400);
    await shot('f03-map-chapter-edge');
  });

  // ---- the house: two residents, no two poses on top of each other ----
  await step('f04-house-2res', async () => {
    await put(15, { extra: 'cafe: { stars: 2, built: { counter_counter: 1, counter_pastry: 1, counter_lamps: 1, counter_chalkboard: 1 } }' }); await boot();
    await ev('document.querySelector("#cafe .tab[data-act=cafeview]")?.click()'); await sleep(900);
    const r = await ev(`(() => { const R = (e) => e.getBoundingClientRect(); const room = document.querySelector('#cafe .room'); if (!room) return { n: -1, bad: ['no room'] };
      const vis = (e) => !e.hidden && getComputedStyle(e).display !== 'none' && +getComputedStyle(e).opacity > 0.05 && R(e).width > 0;
      const res = [...room.querySelectorAll('.guest.g7')].filter(vis); const bad = [];
      const ov = (a, b) => a.left < b.right - 4 && b.left < a.right - 4 && a.top < b.bottom - 4 && b.top < a.bottom - 4;
      res.forEach((a, i) => { const ra = R(a); res.forEach((b, j) => { if (j > i && ov(ra, R(b))) bad.push('overlap ' + i + '/' + j); });
        const poses = [...a.querySelectorAll('.gimg')].filter((p) => vis(p)); if (poses.length > 1 && poses.filter((p) => +getComputedStyle(p).opacity > 0.5).length > 1) bad.push('two poses on cat ' + i); });
      return { n: res.length, bad }; })()`);
    must(r.n >= 2, `two residents in the room (${r.n})`);
    must(!r.bad.length, 'residents: ' + r.bad.join(' '));
    await shot('f04-house-2res');
  });

  // ---- play boards ----
  await step('f05-l4-teach', async () => {
    await put(4); await boot(); await qa('level(4)'); await sleep(900);
    must((await qa('tut()')).length > 4, 'L4 teaching card text');
    must(await inView('#tut'), 'L4 teaching card on screen');
    await shot('f05-l4-teach');
  });
  await step('f06-l16-heart', async () => {
    await put(16, { shape: false }); await boot(); await qa('level(16)');
    await waitFor('window.__qaShape.card() === "shape"', 8000); await sleep(500);
    await closeCards(); await sleep(400);
    const i = await ev('window.__qaShape.info()');
    must(i.shape === 'heart', 'L16 is the heart: ' + i.shape);
    must(i.cell >= 30, `L16 cells ${i.cell}px >= 30`);
    await shot('f06-l16-heart');
  });
  await step('f07-l22-quilt', async () => {
    await put(22); await boot(); await qa('level(22)'); await sleep(900); await closeCards();
    let i = await ev('window.__qaShape.info()');
    must(i.folds.length && !i.folds[0].open, 'L22 starts with a closed flap');
    await shot('f07-l22-quilt-before');
    // fast-forward: the game clock at 6x, the solver's line until the flap's count is reached
    await qa('slow(6)');
    for (let k = 0; k < 30 && !(await ev('window.__qaShape.info()')).folds[0].open; k++) { await waitFor('!window.__qa.state().busy', 8000); await qa('solveStep()'); await sleep(60); }
    i = await ev('window.__qaShape.info()');
    must(i.folds[0].open, 'the flap opened');
    await waitFor('!window.__qaShape.unfolding() && !window.__qa.state().busy', 8000); await qa('slow(1)'); await sleep(400);
    must((await ev('window.__qaShape.info()')).cell >= 30, 'L22 cells >= 30 after the unfold');
    await shot('f08-l22-quilt-after');
  });

  // ---- R13 opening: the late hint (L1), the heart (L3), the forced x3 (L5), the quilt (L7), the L10 mini boss ----
  await step('r13-l1-hint', async () => {
    await put(1); await boot(); await qa('level(1)'); await sleep(1000);
    must((await qa('hintId()')) == null, 'L1: no arrow before the player hesitates');
    await sleep(2700);
    must((await qa('hintId()')) != null, 'L1: the arrow after a 3 s hesitation');
    await shot('r13-l1-hint');
    // R14: a slow phone keeps the board held (baked) while the hint shows; only its arrow moves
    await ev('window.__perf.forceSlow = true'); await sleep(600);
    const h0 = await ev('window.__perf.hold || 0'); await sleep(500);
    must((await ev('window.__perf.hold || 0')) > h0 && (await qa('hintId()')) != null, 'L1: the board stays held while the hint shows');
    await shot('r14-l1-hint-held');
    await ev('window.__perf.forceSlow = false');
  });
  await step('r13-l3-heart', async () => {
    await put(3, { shape: false }); await boot(); await qa('level(3)'); await sleep(1200);
    must(!(await ev('!!document.getElementById("smodal")')), 'L3: no shape modal, one line instead');
    const tut = await qa('tut()');
    must(/heart/i.test(tut), 'L3 one-line card: ' + tut);
    const i = await ev('window.__qaShape.info()');
    must(i.shape === 'heart' && i.cell >= 30, 'L3 heart board, cells ' + i.cell);
    await shot('r13-l3-heart');
  });
  await step('r13-l5-x3', async () => {
    await put(5); await boot(); await qa('level(5)'); await sleep(900);
    must(/blue/i.test(await qa('tut()')), 'L5 one-line card');
    for (const id of [0, 1, 3, 4, 6]) { await qa(`tap(${id})`); await sleep(150); await waitFor('!window.__qa.state().busy', 8000); }
    must(JSON.stringify((await qa('state()')).bench) === '[3,5]', 'L5: the three blues parked ' + JSON.stringify((await qa('state()')).bench));
    await qa('tap(7)');
    await waitFor('(window.__qa.chainFx() || {}).n >= 3', 8000); await sleep(450);
    await shot('r13-l5-x3');
  });
  await step('r13-l7-quilt', async () => {
    await put(7, { shape: false }); await boot(); await qa('level(7)'); await sleep(1200);
    must(!(await ev('!!document.getElementById("smodal")')), 'L7: no quilt modal, one line instead');
    must(/quilt/i.test(await qa('tut()')), 'L7 one-line card');
    const i = await ev('window.__qaShape.info()');
    must(i.folds.length === 1 && !i.folds[0].open && i.folds[0].need === 3, 'L7 starts with a closed quilt: ' + JSON.stringify(i.folds));
    await shot('r13-l7-quilt');
  });
  await step('r13-l10-mini', async () => {
    await put(10, { extra: 'boss: { last: 9, q: [] }' }); await boot(); await qa('level(10)');
    await waitFor('!!document.getElementById("bossintro")', 8000); await sleep(800);
    must(await inView('#bossintro') && await inView('#bossbar'), 'mini boss intro + nameplate on screen');
    const st = await qa('state()');
    must(st.cell >= 30 && st.board.join('x') === '7x7', 'L10 mini boss board ' + st.board + ' cells ' + st.cell);
    await shot('r13-l10-intro');
    await waitFor('!document.getElementById("bossintro")', 6000); await sleep(300);
    await shot('r13-l10-board');
    await qa('slow(5)'); await qa('winNow()');
    await waitFor('!!document.getElementById("bossdefeat")', 20000); await qa('slow(1)'); await sleep(1300);
    await shot('r13-l10-defeat');
    await winCard();
    must(await ev('!!document.querySelector("#modal .bxchest.gold")'), 'the L10 win card holds the gold chest');
    await ev('document.querySelector("#modal .bxchest").click()');
    await waitFor('!!document.getElementById("chestfx")', 4000);
    for (let k = 0; k < 6; k++) { await ev('document.getElementById("chestfx")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))'); await sleep(120); }
    await waitFor('!!document.getElementById("cxreveal")', 12000); await sleep(800);
    must(/RARE!/.test(await ev('document.getElementById("cxreveal").textContent')), 'the mini boss chest is rare');
    await shot('r13-l10-chest');
  });

  // ---- the boss: intro + HP, defeat, the gold chest, the reveal ----
  await step('f09-boss', async () => {
    await put(20, { extra: 'boss: { last: 19, q: [] }' }); await boot(); await qa('level(20)');
    await waitFor('!!document.getElementById("bossintro")', 8000); await sleep(800);
    must(await inView('#bossintro') && await inView('#bossbar'), 'boss intro + nameplate on screen');
    const st = await qa('state()');
    must(st.cell >= 30, `L20 boss cells ${st.cell}px >= 30 (${st.board})`);
    await shot('f09-l20-boss-intro');
    await qa('slow(5)');
    const order = await qa('order()');
    for (const cid of order.slice(0, Math.ceil(order.length * 0.5))) { await qa(`tap(${cid})`); await sleep(70); }
    await waitFor('!window.__qa.state().busy', 10000); await qa('slow(1)'); await sleep(700);
    const hp = await ev('window.__boss.cur()');
    must(hp && hp.shown > 0 && hp.shown < hp.total, 'the HP drops as cats land ' + JSON.stringify(hp));
    await shot('f10-l20-boss-hp');
    await qa('slow(5)'); await qa('winNow()');
    await waitFor('!!document.getElementById("bossdefeat")', 20000); await qa('slow(1)'); await sleep(1300);
    await shot('f11-boss-defeat');
    await winCard();
    must(await ev('!!document.querySelector("#modal .bxchest.gold")'), 'the win card holds the gold chest');
    await ev('document.querySelector("#modal .bxchest").click()');
    await waitFor('!!document.getElementById("chestfx")', 4000); await sleep(700);
    await shot('f12-boss-chest-opening');
    for (let k = 0; k < 6; k++) { await ev('document.getElementById("chestfx")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))'); await sleep(120); } // taps speed it up / skip
    await waitFor('!!document.getElementById("cxreveal")', 12000); await sleep(800);
    must(/RARE!/.test(await ev('document.getElementById("cxreveal").textContent')), 'the first boss chest is rare');
    await shot('f13-boss-chest-reveal');
  });
  await step('f14-l5-chest', async () => {
    await put(5); await boot(); await qa('level(5)'); await sleep(500); await qa('slow(5)'); await qa('winNow()');
    await winCard(); await qa('slow(1)');
    must(await inView('#modal .bxchest'), 'the L5 milestone chest on the win card');
    await ev('document.querySelector("#modal .bxchest").click()');
    await waitFor('!!document.getElementById("chestfx")', 4000);
    for (let k = 0; k < 6; k++) { await ev('document.getElementById("chestfx")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))'); await sleep(120); }
    await waitFor('!document.querySelector("#chestfx .cxgo").hidden', 12000); await sleep(500);
    await shot('f14-l5-chest');
  });

  // ---- shop tabs ----
  await step('f15-shop', async () => {
    await put(30, { extra: 'coins: 900' }); await boot(); await home();
    await qa('screen("shop")'); await sleep(600);
    for (const tab of ['offers', 'coins', 'boosters', 'style']) {
      await ev(`document.querySelector('[data-act=stab4][data-tab=${tab}]').click()`); await sleep(400);
      const over = await ev(`[...document.querySelectorAll('#sheet .shop4 .stab, #sheet .shop4 .s4h, #sheet .shop4 .s4nm, #sheet .shop4 .s4buy')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).length`);
      must(!over, `shop ${tab}: text overflows`);
      await shot('f15-shop-' + tab);
    }
  });

  // ---- the win card with its share row (EN, and the TR frame) ----
  for (const lg of ['en', 'tr']) {
    await step('f16-win-' + lg, async () => {
      await put(60, { lg }); await boot(); await qa('level(13)'); await sleep(600); await qa('slow(5)'); await qa('winNow()');
      await winCard(); await qa('slow(1)'); await sleep(400);
      must(await inView('#modal [data-act=share], #modal [data-act=sharecard]'), 'the share row fits');
      must(await inView('#modal [data-act=next]'), 'Next fits');
      await shot('f16-win-share-' + lg);
    });
  }

  // ---- a dare link on a fresh save ----
  await step('f17-dare-landing', async () => {
    const code = await qa(`dareCode({ n: 16, b: 5, k: 'l', m: 'chain', g: 2, nm: 'Ana', rev: 5 })`);
    must(code.startsWith('5l16-'), 'a new L16 dare says 5: ' + code);
    await ev('localStorage.clear()');
    await boot('?c=' + code);
    await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
    must(/Ana dares you!/.test(await ev('document.querySelector("#modal .card.dare").textContent')), 'landing names Ana');
    must(await inView('#modal [data-act=dareplay]'), 'Play on the landing');
    await shot('f17-dare-landing');
  });

  // ---- R12 (sol-r12-3 fix 5): pin an album page with no postcard yet: every slot names its board, the map follows it ----
  for (const lg of ['en', 'tr']) {
    await step('f19-album-pin-' + lg, async () => {
      await put(30, { lg }); await boot(); await home();
      const pp = (Math.floor((((await qa('week()')) % 24) + 24) % 24 / 4) + 2) % 6; // two pages past this week's
      await qa(`act('album', { p: ${pp} })`); await sleep(500);
      must(await ev('!!document.querySelector("#sheet .albprint [data-act=albpin]")'), 'an unfinished page offers Set as goal');
      await qa(`act('albpin', { p: '${pp}' })`); await sleep(600);
      must(!(await ev('!!document.querySelector("#sheet .albprint [data-act=albpin]")')) && (await ev('document.querySelector("#sheet .albprint small").textContent')).length > 10, 'pinned: the button turns into the goal line');
      must(await ev('document.querySelectorAll("#sheet .album .pc.empty.step .pcgo").length') === 4, 'all four released postcards name their board');
      must(await inView('#sheet .albprint'), 'the print row fits');
      await shot('f19-album-pin-' + lg);
      await qa(`act('closesheet')`); await sleep(400);
      const pg = await ev(`JSON.parse(localStorage.getItem('lco_save')).album.pin`);
      must(pg === pp, 'the pin is saved ' + pg);
      must(await ev('(() => { const b = document.querySelector("#cafe .room .rtalb .rtcard"); return !!b && b.dataset.act === "showplay" && +b.dataset.w < window.__qa.week(); })()'), 'the map strip is a past week board of the pinned page');
      await shot('f19-map-pinned-' + lg);
    });
  }

  // ---- R12 (sol-r12-3 fix 6): the code printed on a clip, typed into Friend Results, imports the reply like the QR ----
  for (const lg of ['en', 'tr']) {
    await step('f20-friend-code-' + lg, async () => {
      await put(30, { lg, extra: "fr: { sent: ['ab12cd'], list: [] }" }); await boot(); await home();
      await qa(`act('events', { tab: 'friends' })`); await sleep(500);
      must(await inView('#sheet #frcode') && await inView('#sheet [data-act=frcode]'), 'the code box fits');
      await shot('f20-friend-code-' + lg);
      await ev(`document.getElementById('frcode').value = 'not a code'; document.querySelector('[data-act=frcode]').click()`); await sleep(400);
      must(!(await ev('!!document.querySelector("#modal .card.dare")')) && await ev('!!document.querySelector("#sheet #frcode")'), 'a bad code stays on the tab');
      await ev(`document.getElementById('frcode').value = ' Example.github.io/long-cat-out/?c=3L13-5-C2-ZZ9K01-R3-AB12CD '; document.querySelector('[data-act=frcode]').click()`);
      await waitFor('!!document.querySelector("#modal .card.dare")', 8000); await sleep(500);
      must(await inView('#modal [data-act=dareplay]'), 'the landing plays the counter-dare');
      await shot('f20-friend-code-landing-' + lg);
      await ev('document.querySelector("#modal [data-act=dareskip]")?.click()'); await sleep(600);
      await qa(`act('events', { tab: 'friends' })`); await sleep(500);
      must(await ev('document.querySelectorAll("#sheet .frrow").length') === 1, 'the reply is in Friend Results');
      await shot('f20-friend-code-list-' + lg);
    });
    // the Events sheet: Daily, this week's one event, Friends
    await step('f24-events-' + lg, async () => {
      await put(30, { lg }); await boot(); await home();
      await qa(`act('events')`); await sleep(500);
      must(await ev('document.querySelectorAll("#sheet .stabs .stab").length') === 3, 'three tabs: Daily, the event, Friends');
      await shot('f24-events-' + lg);
      await qa(`act('evtab', { tab: 'daily' })`); await sleep(400);
      must(await inView('#sheet .sdays'), 'the Daily tab shows the streak days');
      await shot('f24-events-daily-' + lg);
    });
  }

  // ---- desktop 1920x1080: the map in the column, side panels, the painted backdrop ----
  await step('f18-desk-1920', async () => {
    await size(1920, 1080, 1, false);
    await put(12); await boot(); await home();
    await waitFor(`performance.getEntriesByType('resource').some((e) => /look-desk/.test(e.name))`, 8000); await sleep(500);
    must(/look-desk-/.test(await ev('getComputedStyle(document.documentElement, "::before").backgroundImage')), 'the sides show the cat street');
    must(await inView('#hubL') && await inView('#hubR'), 'both side panels in the window');
    await shot('f18-desk-1920-map');
    await size(375, 667);
  });

  // ---- R12 L9 (sol-r12-3 fixes 1 + 2) at 360x640: the order on the teaching card (no bubble), then the seat rule; the
  // pair's tag and route clear of cats and exit arrows; parked first, the pair still wins (EN). L10: the old L9 ----
  for (const lg of ['en', 'tr']) {
    await step('f19-l9-pair-' + lg, async () => {
      await size(360, 640);
      await put(9, { lg }); await boot(); await qa('level(9)'); await sleep(600); await closeCards();
      const rule = lg === 'en' ? 'A parked mom + kitten takes 2 seats.' : 'Park eden anne + yavru 2 minder kaplar.';
      const card = () => ev('(() => { const t = document.getElementById("tut"); return t && !t.hidden ? { txt: t.textContent, clip: t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1, gap: Math.round(t.getBoundingClientRect().top - 10 - window.__qa.layout().cellsB) } : null; })()');
      let c = await card();
      must(!(await ev('!!document.querySelector(".ordintro")')), 'no order bubble on L9');
      must(c && /12/.test(c.txt) && !c.clip && c.gap >= 0, 'the order sits whole on the teaching card first: ' + JSON.stringify(c));
      await shot('f19-l9-order-' + lg);
      await waitFor(`document.getElementById("tut")?.textContent === ${JSON.stringify(rule)}`, 5000);
      c = await card();
      must(!c.clip && c.gap >= 0, 'the seat rule sits whole on the card: ' + JSON.stringify(c));
      const fn = await qa('fun()');
      must(fn.pairCost === (lg === 'en' ? '2 seats' : '2 minder') && fn.pairWait === (lg === 'en' ? 'Green in 3 carriers' : 'Yeşil 3 taşıyıcı sonra gelir'), 'the pair tag: ' + JSON.stringify(fn));
      const clash = await qa('pairClash()');
      must(Array.isArray(clash) && !clash.length, 'the pair tag and its route clear of cats and exit arrows: ' + JSON.stringify(clash));
      await shot('f19-l9-rule-' + lg);
      if (lg === 'en') {
        await qa('slow(6)');
        // R14 (rev 8): the last blue waits on the little green, which parks beside the pair until the end
        for (const id of [9, 5, 6, 11, 4]) { await waitFor('!window.__qa.state().busy', 8000); await qa(`tap(${id})`); await sleep(60); }
        await waitFor('!window.__qa.state().busy', 8000); await sleep(300);
        must(/took 2 seats/.test(await qa('tut()')), 'the pair park is named on the card');
        must((await qa('state()')).screen === 'play', 'five seats hold the pair and the little green');
        await shot('f19-l9-pair-parked');
        for (const id of [1, 2, 3, 7, 0, 8]) { await waitFor('!window.__qa.state().busy', 8000); await qa(`tap(${id})`); await sleep(60); }
        await winCard(); await qa('slow(1)');
        // R13: L10 is the mini boss now (the old L9 stays on a token 6 link): the r13-l10-* steps cover it
      }
      await size(375, 667);
    });
  }
  // ---- R12 appeal (sol-r12-3 fix 4): calmer markings on the crowded showcase board and a crowded late board, 375x812 ----
  await step('f19-marks', async () => {
    await size(375, 812, 3);
    await put(220); await boot();
    await qa('level(60)'); await sleep(600);
    must((await qa('appealBoard()')) === 12, 'the showcase board holds 12 cats');
    await sleep(900);
    await shot('f19-marks-showcase');
    await qa('level(218)'); await sleep(1200); // a crowded late board (220 is a boss: its intro covers the board)
    for (let k = 0; k < 3; k++) { await ev('document.querySelector("[data-cgo]")?.click()'); await sleep(500); }
    await shot('f19-marks-late');
    await size(375, 667);
  });

  // ---- R13: timed baskets, the start gifts, accessibility ----
  // icon-only buttons with no name, and tap targets under 44px (hit-tested: 21px out from the centre each way still lands
  // on the button, so a grown hit area counts), in the given root; buttons in a scrolled-away part are skipped
  const A11Y = (root) => `[...document.querySelectorAll(${JSON.stringify(root)})].flatMap((r) => [...r.querySelectorAll('button, [role=button], a[href]')]).filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden').map((b) => { const r = b.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; for (let p = b.parentElement; p; p = p.parentElement) { if (getComputedStyle(p).overflowY === 'visible') continue; const q = p.getBoundingClientRect(); if (r.top - 6 < q.top || r.bottom + 6 > q.bottom) return ''; } // at / past the edge of its scrolling list
    const at = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && h.closest('button, [role=button], a[href]') === b; }; if (!at(cx, cy)) return '';
    const nm = (b.getAttribute('aria-label') || b.textContent || '').trim(); const bad = []; if (!nm) bad.push('no-name');
    if (![[cx - 21, cy], [cx + 21, cy], [cx, cy - 21], [cx, cy + 21]].every(([x, y]) => at(x, y))) bad.push(Math.round(r.width) + 'x' + Math.round(r.height));
    return bad.length ? (b.className || b.tagName).toString().slice(0, 30) + ' ' + (b.dataset.act || '') + ' ' + bad.join(',') : ''; }).filter(Boolean)`;
  await step('f21-baskets', async () => {
    const tn = Date.now();
    await put(30, { extra: `bask: { s: [{ r: 'common', end: 1 }, { r: 'rare', end: ${tn + 40 * 60000} }, { r: 'epic', end: 0 }], k: 0, g: 5, w: 1 }` }); await boot(); await home();
    must((await ev('document.querySelectorAll("#cafe .bkrail button.bkslot").length')) === 3, 'three baskets on the map rail');
    must(await inView('#cafe .bkslot.s-wake') && await uncovered('#cafe .bkslot.s-ready b'), 'the rail is in view and on top');
    must(/\d+m/.test(await ev('document.querySelector("#cafe .bkslot.s-wake b").textContent')), 'a waking basket shows its time left as text');
    await shot('f21-baskets-map');
    await ev('document.querySelector("#cafe .bkslot.s-wake").click()'); await sleep(400);
    must(+(await ev('document.querySelector("#sheet .bkprice")?.textContent')) === 60, 'the 40-minute wake costs 60 coins');
    await shot('f21-baskets-sheet');
    await ev('document.querySelector("#sheet [data-bk=coins]").click()');
    await waitFor('!!document.getElementById("chestfx")', 4000);
    for (let k = 0; k < 6; k++) { await ev('document.getElementById("chestfx")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))'); await sleep(120); }
    await waitFor('!document.querySelector("#chestfx .cxgo").hidden', 12000); await sleep(400);
    await shot('f21-baskets-open');
    await ev('document.querySelector("#chestfx .cxgo").click()'); await sleep(900);
    must((await ev('document.querySelectorAll("#cafe .bkrail button.bkslot").length')) === 2 && (await ev('window.__bask.st().k')) === 1, 'the bought basket opened and left the rail');
  });
  await step('f22-gift-l1', async () => {
    await put(1, { shape: true }); await ev('localStorage.setItem("lco_save", localStorage.getItem("lco_save").replace(\'"coins":400\', \'"coins":50\'))'); await boot();
    await qa('level(1)'); await sleep(500); await qa('slow(5)'); await qa('winNow()');
    await winCard(); await qa('slow(1)');
    await waitFor('!!document.getElementById("chestfx")', 4000);
    must(/gift/i.test(await ev('document.querySelector("#chestfx .cxhead").textContent')), 'the first win opens a gift');
    await waitFor('!document.querySelector("#chestfx .cxgo").hidden', 12000); await sleep(500);
    await shot('f22-gift-l1');
    await put(6, { extra: `bask: { s: [], k: 0, g: 5, w: 1 }` }); await boot(); // L6 drops a rare basket (basket.js roll)
    await qa('level(6)'); await sleep(500); await qa('slow(5)'); await qa('winNow()');
    await winCard(); await qa('slow(1)');
    must(await inView('#modal .bknote') && /Rare basket/.test(await ev('document.querySelector("#modal .bknote").textContent')), 'the win card says a rare basket dropped');
    must(await ev(`(() => { const a = document.querySelector('#modal .bknote').getBoundingClientRect(); return [...document.querySelectorAll('#modal .bxchest')].every((e) => { const b = e.getBoundingClientRect(); return !(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom); }); })()`), 'the note clears the chest');
    await shot('f22-win-drop');
  });
  await step('f23-a11y', async () => {
    await put(30, { lg: 'tr', extra: `bask: { s: [{ r: 'rare', end: 0 }], k: 0, g: 5, w: 1 }, settings: { lang: 'tr', sound: false, music: false, haptics: false, big: true }` }); await boot(); await home();
    must(await ev('document.documentElement.classList.contains("bigtext")'), 'Bigger text is on after a reload');
    const map = await ev(A11Y('#cafe'));
    must(!map.length, 'map: every button named and >= 44px: ' + JSON.stringify(map));
    await shot('f23-a11y-map-big');
    await qa('screen("shop")'); await sleep(600);
    const shop = await ev(A11Y('#sheet'));
    must(!shop.length, 'shop: every button named and >= 44px: ' + JSON.stringify(shop));
    await shot('f23-a11y-shop-big');
    await ev('document.querySelector("#sheet [data-act=closesheet]").click()'); await sleep(300);
    await qa('screen("settings")'); await sleep(400);
    await shot('f23-a11y-settings-big');
  });
  await step('looks-board', async () => {
    await put(25, { extra: "shop: { eq: { room: 'room_sunny', skin: 'skin_galaxy' }, own: { skin_galaxy: 1 } }" }); await boot();
    await qa('level(25)'); await closeCards(); await sleep(700);
    must((await qa('state()')).level === 25 && await inView('#pf-near'), 'level 25 renders the chapter board');
    must(await ev('window.__qa.state().level === 25 && JSON.parse(localStorage.getItem("lco_save")).shop.eq.skin === "skin_galaxy"'), 'galaxy fur stays on');
    await shot('looks-board');
  });
  await step('looks-shop', async () => {
    await put(25); await boot();
    await qa('screen("shop")'); await qa('act("stab4", {tab:"style"})');
    await qa('act("shopcat", {k:"skin"})'); await qa('act("shopsel", {id:"skin_galaxy"})'); await sleep(450);
    must(await inView('.k-skin .s4item.sel[data-id="skin_galaxy"]'), 'Galaxy fur is selected and visible');
    must(await inView('.s4cat[data-k="room"]'), 'all four categories fit on screen');
    await shot('looks-shop');
  });
  // R14: Fast paws is offered only while a basket waits
  await step('r14-paws', async () => {
    for (const [s, want] of [['[]', false], [`[{ r: 'common', end: 1 }]`, false], [`[{ r: 'rare', end: 0 }]`, true]]) {
      await put(30, { extra: `bask: { s: ${s}, k: 0, g: 5, w: 1 }` }); await boot();
      await qa('screen("shop")'); await sleep(500);
      must((await ev('!!document.querySelector("#sheet .s4paws")')) === want, `Fast paws ${want ? 'shown' : 'hidden'} with baskets ${s}`);
    }
  });
  // R14: one board per chapter theme (room_sunny follows the chapter) and the two premium rooms, each with a fur skin
  for (const [th, lv, skin, room] of [['garden', 7, 'skin_golden'], ['autumn', 15, ''], ['snow', 25, 'skin_golden'], ['lantern', 35, 'skin_golden'],
    ['beach', 45, 'skin_candy'], ['bakery', 55, 'skin_galaxy'], ['galaxy', 25, 'skin_galaxy', 'room_galaxy'], ['candy', 25, 'skin_candy', 'room_candy']]) {
    await step('r14-theme-' + th, async () => {
      await put(lv, { extra: `shop: { eq: { room: '${room || 'room_sunny'}', skin: '${skin}' }, own: { ${skin ? skin + ': 1, ' : ''}${room ? room + ': 1' : ''} } }, boss: { last: ${lv - 1}, q: [] }` }); await boot();
      await qa(`level(${lv})`); await sleep(400); await closeCards();
      await ev('document.getElementById("bossintro")?.click()'); await waitFor('!document.querySelector(".ordintro:not(.tuck)")', 5000); await sleep(500);
      must((await qa('state()')).level === lv && await inView('#pf-near'), `L${lv} renders the ${th} board`);
      await shot('r14-theme-' + th);
    });
  }
  // ---- R13 (schedule 3): the three new pieces, each on its lesson board: the one-time card, the board, then the solver's
  // line until the piece's moment (the padlock opens, the gate drops, the twins run) ----
  for (const [name, lv, k, moment] of [
    ['f21-lock', 101, 'lock', `(() => { const id = window.__qa.mechCat('lock'); return id != null && !window.__qa.mechState().locked.includes(id); })()`],
    ['f22-gate', 121, 'gate', `window.__qa.mechState().gates === 0`],
    ['f23-twin', 141, 'twin', `window.__qa.mechState().twins === 0`],
  ]) {
    await step(name, async () => {
      await put(lv); await boot(); await qa(`level(${lv})`); await sleep(900);
      const cards = [];
      for (let i = 0; i < 3; i++) { // the pack intro may come first, then the piece's card
        const c = await ev(`document.querySelector('#cmodal .card')?.dataset.k || ''`);
        if (!c) break;
        const t = await ev(`document.querySelector('#cmodal .card .cpt')?.textContent || ''`);
        cards.push(c + ':' + t);
        if (c === 'mech') await shot(name + '-card');
        await ev(`document.querySelector('#cmodal [data-cgo]')?.click()`); await sleep(450);
      }
      must(cards.some((c) => c.startsWith('mech:')), `L${lv}: the one-time card for the ${k} ` + JSON.stringify(cards));
      must((await qa('tut()')).length > 10, `L${lv}: the lesson line`);
      must((k === 'gate' ? (await qa('objs()')).includes('gate') : (await qa(`mechCat('${k}')`)) != null), `L${lv} carries a ${k}`);
      const inf = await ev("window.__qaShape.info()");
      must(inf.cell >= 30, `L${lv} cells ${inf.cell}px (${inf.w}x${inf.h})`);
      // R14: the order bubble keeps off the queue capsule (a colour gate's carrier may wait there)
      const clash = await ev(`(async () => { for (let i = 0; i < 25; i++) { const b = document.querySelector('.ordintro'); const q = window.__qa.layout().queue; if (b && q) { const r = b.getBoundingClientRect(), c = document.getElementById('game').getBoundingClientRect(); return r.right > c.left + q.x0 && r.left < c.left + q.x1 && r.bottom > c.top + q.y0 && r.top < c.top + q.y1 ? 'over' : 'clear'; } await new Promise((f) => setTimeout(f, 80)); } return 'none'; })()`);
      must(clash !== 'over', `L${lv}: the order bubble covers the queue capsule`);
      await sleep(300);
      await shot(name + '-board');
      await qa('slow(6)');
      let gateSeen = null;
      for (let i = 0; i < 30 && !(await ev(moment)); i++) {
        await waitFor('!window.__qa.state().busy', 8000); await qa('solveStep()');
        if (k === 'gate') for (let j = 0; j < 120 && gateSeen == null; j++) { // R14: the gate drops on screen as its carrier drives off
          const m = await ev('(() => { const s = window.__qa.mechState(), q = window.__qa.state(); return { shown: s.gatesShown, open: s.gates === 0, leaving: q.leaving, busy: q.busy }; })()');
          if (!m.shown) { gateSeen = m.leaving; break; }
          if (!m.open && !m.busy) break;
          await sleep(25);
        }
        await sleep(60);
      }
      must(await ev(moment), `L${lv}: the ${k} moment happened on the solver's line`);
      if (k === 'gate') must(gateSeen > 0, `L${lv}: the gate opened on screen with ${gateSeen} carrier(s) driving off`);
      if (k === 'lock') { const b = (await qa('state()')).bench; must(b[0] <= 3, `L${lv}: the padlock opened with ${b[0]} of ${b[1]} seats taken (3 at most)`); }
      await waitFor('!window.__qa.state().busy', 8000); await qa('slow(1)'); await sleep(500);
      await shot(name + '-after');
    });
  }

  // ---- R16 talking cats: one bubble on the board (forced via __qaTalk), the boss answer, a café guest's line, the toggle ----
  const talkIn = async () => { const b = await ev('window.__qaTalk.box()'); return b.r > b.l && b.l >= 0 && b.t >= 0 && b.r <= 376 && b.b <= 668; };
  for (const [kind, lg] of [['bonk', 'en'], ['bench', 'tr'], ['chain', 'en'], ['last', 'tr']]) {
    await step('r16-talk-' + kind, async () => {
      await put(12, { lg }); await boot(); await qa('level(12)'); await sleep(900); await closeCards();
      must(await ev(`window.__qaTalk.say('${kind}')`), `L12: a ${kind} bubble shows`);
      await sleep(250);
      const s = await ev('window.__qaTalk.text()');
      must(s.length > 1 && s.length <= 24, `the ${kind} line is short: "${s}"`);
      must(await talkIn(), `the ${kind} bubble sits inside the screen`);
      must((await ev('document.querySelectorAll("#talk").length')) === 1, 'one bubble element');
      await shot('r16-talk-' + kind);
    });
  }
  await step('r16-talk-boss', async () => {
    await put(20); await boot(); await qa('level(20)'); await sleep(700); await closeCards();
    must(!(await ev('window.__qaTalk.text()')), 'no bubble while the boss intro is up');
    await ev('document.getElementById("bossintro")?.click()'); await waitFor('!document.getElementById("bossintro")', 6000);
    await waitFor('!!window.__qaTalk.text()', 6000).catch(() => must(false, 'a cat answers the boss after the intro'));
    await shot('r16-talk-boss');
  });
  await step('r16-talk-quiet-l2', async () => {
    await put(2); await boot(); await qa('level(2)'); await sleep(900);
    await qa('tap(0)'); await sleep(400);
    must(!(await ev('window.__qaTalk.text()')), 'L2: no chatter in the opening');
  });
  await step('r16-talk-cafe', async () => {
    await put(15, { lg: 'tr', extra: 'cafe: { stars: 2, built: { counter_counter: 1, counter_pastry: 1, counter_lamps: 1, counter_chalkboard: 1 } }' }); await boot();
    await ev('document.querySelector("#cafe .tab[data-act=cafeview]")?.click()'); await sleep(900);
    const s = await ev('window.__qaTalk.hub()');
    must(s.length > 1, `a tapped guest speaks: "${s}"`);
    await sleep(500);
    await shot('r16-talk-cafe');
  });
  await step('r16-talk-settings', async () => {
    await put(12); await boot(); await qa('screen("settings")'); await sleep(500);
    must(await ev('!!document.querySelector("#modal [data-k=chatter].on")'), 'Settings: Cat chatter, on by default');
    await shot('r16-talk-settings');
    await ev('document.querySelector("#modal [data-k=chatter]").click()'); await sleep(300);
    await qa('level(12)'); await sleep(900); await closeCards();
    must(!(await ev(`window.__qaTalk.say('free')`)), 'chatter off: no bubble');
  });

  const secs = ((Date.now() - T0) / 1000).toFixed(1);
  console.log(`\nqa-fast: ${secs}s, ${fails.length} failure(s), ${errs.length} console error(s)`);
  for (const f of fails) console.log('  FAIL ' + f);
  for (const e of errs.slice(0, 12)) console.log('  ERR ' + e.split('\n')[0].slice(0, 240));
  bye(fails.length || errs.length ? 1 : 0);
} catch (e) {
  console.log('qa-fast crashed: ' + (e.stack || e.message));
  for (const e2 of errs.slice(0, 8)) console.log('  ERR ' + e2.split('\n')[0].slice(0, 240));
  bye(1);
}
