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
const ONLY = process.env.PERF_ONLY ? process.env.PERF_ONLY.split(',') : null; // R11 juice: e.g. PERF_ONLY=chain,rapid6 skips the other scenes
const want = (k) => !ONLY || ONLY.includes(k);
const only = (k) => !!ONLY && ONLY.includes(k); // shape lane scenes run only when named (PERF_ONLY=shape,unfold)
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
    w('update'); w('draw'); const d0 = P.draw; P.draw = function (...a) { if (!this.demo) window.__G = this; return d0.apply(this, a); };
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
  let id = 0; let lastLayers = []; const tev = []; let tdone = null;
  const cb = new Map();
  const errs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'LayerTree.layerTreeDidChange' && d.params.layers) lastLayers = d.params.layers;
    if (d.method === 'Tracing.dataCollected') tev.push(...d.params.value);
    if (d.method === 'Tracing.tracingComplete') tdone && tdone();
    if (d.id && cb.has(d.id)) { const c = cb.get(d.id); cb.delete(d.id); if (d.error) c.rej(new Error(d.error.message)); else c.res(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) errs.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; cb.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  for (const d of ['Page', 'Runtime', 'LayerTree']) await send(d + '.enable');
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
  await boot(); await qa('save({ level: 30 })'); await boot();
  const RATE = +(process.env.TR_RATE || 4);
  const scenes = (process.env.TR_SCENES || 'hub,L1,L60run').split(',');
  const report = {};
  for (const sc of scenes) {
    await send('Emulation.setCPUThrottlingRate', { rate: 1 });
    if (sc === 'hub') { await qa('home()'); await sleep(1500); }
    if (sc === 'L1') { await qa('level(1)'); await sleep(1500); }
    if (sc.startsWith('play')) { await qa('level(' + (sc.slice(4) || 30) + ')'); await sleep(1500); await ev('document.querySelectorAll("#smodal, #cmodal, #modal").forEach((e) => e.remove())'); }
    if (sc === 'L60run' || sc === 'L60') { await qa('level(60)'); await sleep(1500); await ev('document.querySelectorAll("#smodal, #cmodal").forEach((e) => e.remove())'); }
    await send('DOM.enable').catch(() => {}); await send('LayerTree.disable').catch(() => {}); await send('LayerTree.enable').catch(() => {}); await ev('document.body.style.outline = "0px solid transparent"; void 0'); await sleep(600);
    if (process.env.TR_SHOT) { await ev('window.__qa.freezeAt && window.__qa.freezeAt(0)').catch(() => {}); await sleep(300); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(process.env.TR_SHOT, sc + '-' + LABEL + '.png'), Buffer.from(r.data, 'base64')); }
    const layers = lastLayers.filter((l) => l.drawsContent);
    const area = layers.reduce((s, l) => s + l.width * l.height, 0);
    const big = []; for (const l of layers.filter((l) => l.width * l.height > 375 * 812 * 0.08)) { let nm = ''; if (l.backendNodeId) { try { const d = await send('DOM.describeNode', { backendNodeId: l.backendNodeId }); nm = d.node.localName + (d.node.attributes ? '[' + d.node.attributes.filter((x, i) => i % 2 === 1).join(' ').slice(0, 50) + ']' : ''); } catch {} } big.push(`${l.width}x${l.height} ${nm}`); }
    await send('Emulation.setCPUThrottlingRate', { rate: RATE });
    tev.length = 0;
    await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,viz,gpu,blink,toplevel,benchmark', transferMode: 'ReportEvents' });
    const tapper = sc.startsWith('play') ? (async () => { for (let k = 0; k < 7; k++) { const pt = await ev('(() => { const g = window.__G; const st = window.__qa.state(); const id = (st.free || [])[0]; if (id == null || st.busy) return null; const i = g.state.grid.indexOf(id); const [x, y] = g.center(i % g.state.w, Math.floor(i / g.state.w)); const r = g.canvas.getBoundingClientRect(); return [x + r.left, y + r.top]; })()').catch(() => null); if (pt) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt[0], y: pt[1] }] }); await sleep(60); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } await sleep(330); } })() : null;
    if (sc === 'L60run') await ev('(() => { let k = 0; const go = () => { if (k++ > 6) return; window.__qa.solveStep(); setTimeout(go, 380); }; go(); })()');
    await ev('(() => { const p = window.__pf; p.d = []; p.c = []; p.on = true; })()');
    await sleep(2500); if (tapper) await tapper;
    const r = await ev('(() => { const p = window.__pf; p.on = false; return { d: p.d, c: p.c }; })()');
    await new Promise((res) => { tdone = res; send('Tracing.end'); });

    const cnt = await ev(`(async () => {
      const P = CanvasRenderingContext2D.prototype; const st = { di: 0, area: 0, shadow: 0, filt: 0, fill: 0, stroke: 0, grad: 0, text: 0, clear: 0, byCv: {} };
      const cv = (c) => (c.canvas.id || (c.canvas.isConnected ? 'dom' : 'off') ) + ':' + c.canvas.width + 'x' + c.canvas.height;
      const sw = {}; const wrap = (k, f) => { sw[k] = P[k]; P[k] = function (...a) { try { f(this, a); } catch {} return sw[k].apply(this, a); }; };
      const sh = (c) => { if (c.shadowBlur > 0 && c.shadowColor !== 'rgba(0, 0, 0, 0)') st.shadow++; if (c.filter && c.filter !== 'none') st.filt++; };
      wrap('drawImage', (c, a) => { st.di++; sh(c); const m = c.getTransform(); const w = a.length >= 5 ? a[a.length - 2] : a[0].width, h = a.length >= 5 ? a[a.length - 1] : a[0].height; const ar = Math.abs(w * h * m.a * m.d); st.area += ar; const k = cv(c); st.byCv[k] = (st.byCv[k] || 0) + ar; });
      wrap('fill', (c) => { st.fill++; sh(c); }); wrap('stroke', (c) => { st.stroke++; sh(c); const k = 'S ' + c.lineWidth.toFixed(1) + ' ' + c.strokeStyle + ' ' + c.getLineDash().join('/') + ' ' + (new Error().stack.split(String.fromCharCode(10))[3] || '').trim().split('/').pop(); st.byCv[k] = (st.byCv[k] || 0) + innerWidth * innerHeight * 4; }); wrap('fillText', (c) => { st.text++; sh(c); });
      wrap('createLinearGradient', () => st.grad++); wrap('createRadialGradient', () => st.grad++); wrap('clearRect', () => st.clear++);
      const f0 = window.__perf.drawn; await new Promise((r) => setTimeout(r, 1000)); const fr = window.__perf.drawn - f0;
      for (const k in sw) P[k] = sw[k];
      const n = Math.max(1, fr); const o = { frames: fr }; for (const k of ['di', 'shadow', 'filt', 'fill', 'stroke', 'grad', 'text', 'clear']) o[k] = +(st[k] / n).toFixed(1);
      o.screensPx = +(st.area / n / (innerWidth * innerHeight * 4)).toFixed(2); o.byCv = Object.fromEntries(Object.entries(st.byCv).map(([k, v]) => [k, +(v / n / (innerWidth * innerHeight * 4)).toFixed(2)]));
      o.canvases = [...document.querySelectorAll('canvas')].map((c) => (c.id || '?') + ' ' + c.width + 'x' + c.height + ' ' + getComputedStyle(c).display).join(', ');
      return JSON.stringify(o); })()`);
    console.log('  DRAWS/frame: ' + cnt);
    console.log('  ANIMS: ' + await ev(`(() => { const a = document.getAnimations().filter((x) => x.playState === 'running'); const m = {}; for (const x of a) { const el = x.effect && x.effect.target; const k = (x.animationName || x.constructor.name) + ' ' + (el ? el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 2).join('.') : '') + ' it=' + (x.effect.getTiming().iterations) + ' f=' + (el ? getComputedStyle(el).filter.slice(0, 30) : ''); m[k] = (m[k] || 0) + 1; } return a.length + ' ' + JSON.stringify(m); })()`));

    const names = {}; const tid2 = {};
    for (const e of tev) if (e.ph === 'M' && e.name === 'thread_name') tid2[e.pid + ':' + e.tid] = e.args.name;
    const agg = {};
    for (const e of tev) {
      if (e.ph !== 'X' || !e.dur) continue;
      const th = tid2[e.pid + ':' + e.tid] || '?';
      if (!/CrRendererMain|Compositor|CrGpuMain|Viz|RasterWorker|TileWorker/.test(th)) continue;
      const k = th.replace(/\d+$/, '') + ' | ' + e.name;
      agg[k] = (agg[k] || 0) + e.dur / 1000;
    }
    const longs = [];
    for (const e of tev) { if (e.ph === 'X' && e.name === 'RunTask' && /CrRendererMain/.test(tid2[e.pid + ':' + e.tid] || '') && e.dur > 25000) {
      const kids = {}; for (const f of tev) if (f.ph === 'X' && f.tid === e.tid && f.pid === e.pid && f.ts >= e.ts && f.ts < e.ts + e.dur && f.dur > 3000 && f !== e) { const nm = f.name + (f.args && f.args.data && (f.args.data.functionName || f.args.data.type) ? ':' + (f.args.data.functionName || f.args.data.type) + '@' + String(f.args.data.url || '').split('/').pop() + ':' + (f.args.data.lineNumber || '') : ''); kids[nm] = Math.max(kids[nm] || 0, f.dur / 1000); }
      longs.push((e.dur / 1000).toFixed(0) + 'ms ' + Object.entries(kids).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => k + '=' + v.toFixed(0)).join(', ')); } }
    console.log('  LONG TASKS (' + longs.length + '): ' + longs.slice(0, 14).join(' || '));
    const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 28).map(([k, v]) => `${v.toFixed(0).padStart(6)}ms ${k}`);
    const p = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.floor(q * s.length)].toFixed(1) : 0; };
    report[sc] = { frames: r.d.length, p50: p(r.d, .5), p95: p(r.d, .95), game95: p(r.c, .95), layers: layers.length, areaScreens: +(area / (375 * 812)).toFixed(1), big, top };
    console.log(`\n== ${sc} x${RATE}: frames ${r.d.length} rAF p50 ${report[sc].p50} p95 ${report[sc].p95} game p95 ${report[sc].game95} | layers ${layers.length}, area ${report[sc].areaScreens} screens`);
    console.log('  big: ' + big.join(' | '));
    console.log(top.map((s) => '  ' + s).join('\n'));
  }
  writeFileSync(join(ROOT, 'qa', 'trace-' + LABEL + '.json'), JSON.stringify(report, null, 1));
  bye(0);
} catch (e) {
  console.log('trace failed: ' + e.message);
  bye(1);
}
