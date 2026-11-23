// Phone-lag probe: vite dev + chrome-headless-shell over raw CDP, 375x812 @ DPR 3, CPU throttled 4x and 6x.
// Per scene it records rAF deltas (what the player feels) and the main-thread cost of Game.update + Game.draw
// (what the canvas code costs), then prints p50/p95 and writes qa/r10-perf-<label>.json.
// Usage: node scripts/perf.mjs [label]   env: PORT (5192), PERF_QUERY (e.g. "?r=pixi"), PERF_RATES ("4,6"), PERF_SHOTS=1
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const PORT = +(process.env.PORT || 5192);
const LABEL = process.argv[2] || 'run';
const QUERY = process.env.PERF_QUERY || '';
const RATES = (process.env.PERF_RATES || '4,6').split(',').map(Number);
const WIN_MS = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'lco-perf-'));
const procs = [];
const kill = () => { for (const p of procs.splice(0)) { try { spawn('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } } };
const bye = (code) => { kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ } process.exit(code); }, 800); };
setTimeout(() => { console.log('hard timeout'); bye(2); }, 20 * 60 * 1000).unref();

// rAF deltas + the game's own update/draw time (patched on the shared Game prototype, so the win card's clip counts too)
const PROBE = `(async () => {
  if (!window.__pf) {
    const m = await import('/src/game/game.js');
    const P = m.Game.prototype;
    const w = (k) => { const f = P[k]; P[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { window.__pf.cost += performance.now() - t; } }; };
    w('update'); w('draw');
    window.__pf = { on: false, d: [], c: [], cost: 0, last: 0 };
    const tick = (t) => { const p = window.__pf; if (p.on) { if (p.last) { p.d.push(t - p.last); p.c.push(p.cost); } } p.cost = 0; p.last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  return true;
})()`;

try {
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  procs.push(vite.pid);
  const origin = `http://localhost:${PORT}`;
  for (let i = 0; ; i++) { try { if ((await fetch(origin + '/')).ok) break; } catch { /* not yet */ } if (i > 150) throw new Error('vite did not start'); await sleep(200); }
  const cport = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const ch = spawn(CHROME, [`--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, '--headless', '--mute-audio', ...(process.env.PERF_NOGPU ? ['--disable-gpu'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']), '--window-size=375,812', '--disable-extensions', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  procs.push(ch.pid);
  let targets;
  for (let i = 0; ; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not yet */ } if (i > 100) throw new Error('chrome did not start'); await sleep(200); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const cb = new Map();
  const errs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && cb.has(d.id)) { const c = cb.get(d.id); cb.delete(d.id); if (d.error) c.rej(new Error(d.error.message)); else c.res(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) errs.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; cb.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  for (const d of ['Page', 'Runtime']) await send(d + '.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]);
    return r.result.value;
  };
  const qa = (expr) => ev('window.__qa.' + expr);
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch { /* busy */ } await sleep(100); } throw new Error('timeout ' + expr); };
  const boot = async () => { await send('Page.navigate', { url: origin + '/' + QUERY }); await sleep(500); await waitFor('!!window.__qa && !!document.querySelector("#menu.on, #cafe.on, #hud.on")', 30000); await sleep(800); await ev(PROBE); };
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const measure = async (ms = WIN_MS) => {
    await ev('(() => { const p = window.__pf; p.d = []; p.c = []; p.on = true; })()');
    await sleep(ms);
    const r = await ev('(() => { const p = window.__pf; p.on = false; return { d: p.d, c: p.c }; })()');
    const f = (a) => +a.toFixed(1);
    return { frames: r.d.length, p50: f(pct(r.d, 0.5)), p95: f(pct(r.d, 0.95)), max: f(Math.max(0, ...r.d)), cost50: f(pct(r.c, 0.5)), cost95: f(pct(r.c, 0.95)), renderer: await ev('window.__perf ? window.__perf.renderer : "canvas"'), pf: await ev('window.__perf ? JSON.stringify(window.__perf) : ""') };
  };
  const shot = async (name) => { if (!process.env.PERF_SHOTS) return; const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(ROOT, 'qa', name + '.png'), Buffer.from(r.data, 'base64')); };

  await send('Page.navigate', { url: origin + '/' });
  await waitFor('!!window.__qa', 30000);
  await ev('localStorage.clear()').catch(() => {});
  const out = {};
  for (const rate of RATES) {
    await send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await boot();
    await qa('save({ level: 30 })');
    await boot();
    await send('Emulation.setCPUThrottlingRate', { rate });
    const res = {};
    // hub: the café room (DOM) over the demo board
    await qa('home()'); await sleep(1200);
    res.hub = await measure(); await shot(`r10-perf-hub-${LABEL}`);
    // L1: the smallest board, idle (breathing, blinks)
    await qa('level(1)'); await sleep(1200);
    res.L1 = await measure(); await shot(`r10-perf-l1-${LABEL}`);
    // a big late board, idle then while cats sprint
    await qa('level(60)'); await sleep(1500);
    res.L60 = await measure(); await shot(`r10-perf-l60-${LABEL}`);
    await ev('(() => { let k = 0; const go = () => { if (k++ > 5) return; window.__qa.solveStep(); setTimeout(go, 380); }; go(); })()');
    res.L60run = await measure(2400);
    // R11 fix 2: six rapid sends (a tap every 130 ms, the way a sure player clears a run of free cats)
    await qa('level(60)'); await sleep(1500);
    await ev('(() => { let k = 0; const go = () => { if (k++ > 5) return; window.__qa.solveStep(); setTimeout(go, 130); }; go(); })()');
    res.rapid6 = await measure(2000);
    // chain slow-mo: the L13 winning line holds a 3-chain
    await qa('level(13)'); await sleep(1000);
    let chain = null;
    for (const cid of await qa('order()')) {
      await waitFor('!window.__qa.state().busy', 20000).catch(() => {});
      if (!(await ev(`window.__qa.state().free.includes(${cid}) || window.__qa.state().blocked.includes(${cid})`))) continue;
      const pk = await qa(`peek(${cid})`);
      await qa(`tap(${cid})`);
      if (pk.boards >= 3 && !chain) {
        await waitFor('(window.__qa.chainFx() || {}).k >= 1', 15000).catch(() => {});
        chain = await measure(1800); await shot(`r10-perf-chain-${LABEL}`);
      }
    }
    res.chain = chain;
    // the win card (it loops the chain clip on its own canvas)
    await waitFor('window.__qa.state().screen === "win"', 60000).catch(() => {});
    await sleep(2000);
    res.win = await measure(); await shot(`r10-perf-win-${LABEL}`);
    out['x' + rate] = res;
    console.log(`CPU x${rate}`);
    for (const [k, v] of Object.entries(res)) if (v) console.log(`  ${k.padEnd(7)} frames ${String(v.frames).padStart(4)}  rAF p50 ${v.p50}  p95 ${v.p95}  max ${v.max}  | game ms p50 ${v.cost50} p95 ${v.cost95}  [${v.renderer}]` + (process.env.PERF_DEBUG ? ' ' + v.pf : ''));
  }
  writeFileSync(join(ROOT, 'qa', `r10-perf-${LABEL}.json`), JSON.stringify({ label: LABEL, query: QUERY, dpr: 3, size: '375x812', out }, null, 1));
  console.log(`errors: ${errs.length}`); for (const e of errs.slice(0, 5)) console.log('  ' + e.split('\n')[0].slice(0, 200));
  bye(0);
} catch (e) {
  console.log('perf failed: ' + e.message);
  bye(1);
}
