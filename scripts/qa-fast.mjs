// Fast QA (R11x): at most 5 minutes. No playing through: every screen is reached by "teleporting" (a save injected
// into localStorage lco_save, then the window.__qa hooks), one frame each, console errors and page scroll asserted.
// vite dev on PORT (default 5193) + chrome-headless-shell over raw CDP, GPU off. Frames land in qa/fast/.
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
  const ch = spawn(CHROME, [`--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, '--headless', '--mute-audio', '--disable-gpu', '--window-size=375,667', '--disable-extensions', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
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
    await put(37, { extra: 'boss: { last: 36, fl: { n: 1, fail: 0, k: 3 }, q: [] }' }); await boot(); await home();
    must(await ev('!!document.querySelector(".hmn.boss[data-lv=\'40\'] .bmcastle")'), 'L40 castle node');
    must(await inView('.hmn.boss[data-lv="40"]'), 'the L40 boss castle is in view from L37');
    must(await ev(`(() => { const p = document.querySelector('.bmpill').getBoundingClientRect(); const node = document.querySelector('#cafe .hmn.cur').getBoundingClientRect(); const ov = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return ![...document.querySelectorAll('#cafe .goals')].some((g) => g.getBoundingClientRect().height && ov(p, g.getBoundingClientRect())) && !ov(p, node); })()`), 'the flame / chest pill clear of the goals strip and the current node'); // the pill takes no pointer events: rectangles, not elementFromPoint
    must(await uncovered('#cafe .hmn.cur b'), 'the current node is not under another layer');
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

  // ---- the boss: intro + HP, defeat, the gold chest, the reveal ----
  await step('f09-boss', async () => {
    await put(20, { extra: 'boss: { last: 19, fl: { n: 0, fail: 0, k: 0 }, q: [] }' }); await boot(); await qa('level(20)');
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
