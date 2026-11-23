// Round 7 presentation capture. Usage: PORT=5193 QA_NOGPU=1 node qa/r7-capture.mjs [WxH] -> qa/r7/*.png (390x844) or qa/r7-WxH/*.png.
// Every frame also asserts that nothing scrolls (page, panels, sheet bodies, hub).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const VP = (process.argv[2] || '390x844').split('x').map(Number);
const OUT = join(ROOT, 'qa', VP[0] === 390 && VP[1] === 844 ? 'r7' : `r7-${VP[0]}x${VP[1]}`);
const PORT = +(process.env.PORT || 5193);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'lco-r7-'));
const procs = [];
const bye = (code) => { for (const p of procs.splice(0)) { try { spawn('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } } setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ } process.exit(code); }, 1000); };
setTimeout(() => { console.log('hard timeout'); bye(2); }, 10 * 60 * 1000).unref();
try {
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  procs.push(vite.pid);
  const origin = `http://localhost:${PORT}`;
  for (let i = 0; ; i++) { try { if ((await fetch(origin + '/')).ok) break; } catch { /* not yet */ } if (i > 150) throw new Error('vite did not start'); await sleep(200); }
  const cport = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const ch = spawn(CHROME, [`--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, '--headless', '--mute-audio', ...(process.env.QA_NOGPU ? ['--disable-gpu'] : []), `--window-size=${VP[0]},${VP[1]}`, '--disable-extensions', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  procs.push(ch.pid);
  let targets;
  for (let i = 0; ; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not yet */ } if (i > 100) throw new Error('chrome did not start'); await sleep(200); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const cb = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && cb.has(d.id)) { const c = cb.get(d.id); cb.delete(d.id); if (d.error) c.rej(new Error(d.error.message)); else c.res(d.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; cb.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  for (const d of ['Page', 'Runtime']) await send(d + '.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VP[0], height: VP[1], deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]); return r.result.value; };
  const fails = [];
  const NOSCROLL = `(() => { const bad = []; const se = document.scrollingElement; if (se.scrollHeight > innerHeight + 1) bad.push('page ' + se.scrollHeight);
    for (const el of document.querySelectorAll('.panel, .pbody, #cafe, #resi, .card, .rgrid, .room')) { if (el.getAnimations().some((x) => x.playState === 'running')) continue; if (el.scrollHeight > el.clientHeight + 2) bad.push((el.id || el.className).slice(0, 30) + ' ' + el.scrollHeight + '>' + el.clientHeight); const r = el.getBoundingClientRect(); if (r.height && (r.bottom > innerHeight + 1 || r.top < -1)) bad.push((el.id || el.className).slice(0, 30) + ' off-screen ' + Math.round(r.top) + '..' + Math.round(r.bottom)); }
    return bad; })()`;
  const shot = async (name) => { writeFileSync(join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); const bad = await ev(NOSCROLL); if (bad.length) fails.push(name + ': ' + bad.join(', ')); console.log('  shot ' + name + (bad.length ? '  SCROLL ' + bad.join(', ') : '')); };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch { /* busy */ } await sleep(100); } throw new Error('timeout ' + expr); };
  const qa = (expr) => ev('window.__qa.' + expr);
  const boot = async (save) => {
    await send('Page.navigate', { url: origin + '/' }); await sleep(400);
    await ev(`localStorage.clear(); localStorage.setItem("lco_save", ${JSON.stringify(JSON.stringify(save))})`);
    await send('Page.navigate', { url: origin + '/' }); await sleep(500);
    await waitFor('!!window.__qa && !!document.querySelector("#menu.on, #cafe.on, #hud.on")', 25000);
    await sleep(1200);
  };
  // hub with a mid-game save
  await boot({ v: 3, level: 12, coins: 640, settings: { sound: false, haptics: false, lang: 'en' }, cafe: { stars: 3, built: {} } });
  await shot('01-hub');
  await qa('level(1)'); await sleep(900); await shot('02-l1');
  // L2 chain
  await qa('level(2)'); await sleep(600);
  for (const c of [0, 1, 2]) { await waitFor('!window.__qa.state().busy', 8000); await qa(`tap(${c})`); await sleep(250); }
  await waitFor('!window.__qa.state().busy', 8000); await sleep(300);
  await qa('tap(3)');
  await waitFor('(window.__qa.chainFx() || {}).k >= 2', 8000); await sleep(150);
  await shot('04-chain');
  await waitFor('!window.__qa.state().busy', 8000);
  // L12 mid-play
  await qa('level(12)'); await sleep(800);
  await qa('benchTo(2)'); await sleep(1800);
  await qa('slow(0.25)');
  const m = await qa('tapColor(true)') ?? await qa('freeId()');
  if (m != null) await qa(`tap(${m})`);
  await sleep(500); await shot('03-l12-mid');
  await qa('slow(1)'); await sleep(1500);
  // win
  await qa('level(2)'); await sleep(500); await qa('winNow()');
  await waitFor('window.__qa.state().screen === "win"', 30000); await sleep(1800); await shot('05-win');
  // fail
  await qa('level(49)'); await sleep(600); await qa('failNow()');
  await waitFor('window.__qa.state().screen === "fail"', 30000); await sleep(900); await shot('06-fail');
  // café area at a later stage
  await boot({ v: 3, level: 30, coins: 900, settings: { sound: false, haptics: false, lang: 'en' }, cafe: { stars: 1, built: {} } });
  await qa('addStars(14)'); await sleep(800);
  await shot('07-cafe');
  for (const s of ['quests', 'residents', 'shop', 'show', 'nolives', 'settings']) { await qa('home()'); await sleep(500); if (s === 'nolives') await qa('save({ lives: { n: 0, t: Date.now() } })'); await qa(`screen("${s}")`); await sleep(900); await shot('08-' + s); }
  await qa('save({ lives: { n: 5, t: Date.now() } })'); await qa('home()'); await sleep(500);
  await ev('document.querySelector("[data-act=residents]").click()'); await sleep(600); await ev('document.querySelector(".rpager .arr:last-child").click()'); await sleep(600); await shot('08-residents-p2');
  await qa('home()'); await sleep(500);
  await ev('document.querySelector(".fl.hs").click()'); await sleep(900); await shot('09-house');
  await ev('document.querySelector(".fl.hs").click()'); await sleep(300);
  // the new-floor ceremony: the counter's last piece
  await boot({ v: 6, level: 20, coins: 300, settings: { sound: false, haptics: false, lang: 'en' }, cafe: { stars: 3, built: { counter_counter: 1, counter_pastry: 1, counter_lamps: 1, counter_chalkboard: 1, counter_tables: 1 } } });
  await ev('document.querySelector(".nbcard .trow").click()'); await sleep(2600); await shot('10a-floor-zoom');
  await sleep(1000); await shot('10b-floor-drop');
  await sleep(2200); await shot('10c-floor-card');
  await ev('document.querySelector(".nfcard .btn").click()'); await sleep(1200); await shot('10d-new-room');
  await qa('lang("tr")'); await qa('home()'); await sleep(800); await shot('11-hub-tr');
  await ev('document.querySelector(".fl.hs").click()'); await sleep(800); await shot('11b-house-tr');
  console.log(fails.length ? 'NO-SCROLL FAILS: ' + fails.join(' | ') : 'no-scroll ok');
  bye(fails.length ? 1 : 0);
} catch (e) { console.log('FAILED ' + e.message); bye(1); }
