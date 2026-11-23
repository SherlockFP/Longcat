// Store screenshots: 6 per language at 1080x1920 (360x640 CSS @3x) + a 1280x720 cover, via vite dev + headless Chrome (same harness as qa.mjs).
// Usage: PORT=5193 node scripts/store-shots.mjs   -> store/shots/{en,tr}-1..6.png and store/shots/cover.png
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const OUT = join(ROOT, 'store', 'shots');
const PORT = +(process.env.PORT || 5193);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'lco-store-'));
const procs = [];
const kill = () => { for (const p of procs.splice(0)) { try { spawn('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } } };
const bye = (code) => { kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ } process.exit(code); }, 1000); };
setTimeout(() => { console.log('hard timeout'); bye(2); }, 20 * 60 * 1000).unref();

try {
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  procs.push(vite.pid);
  const origin = `http://localhost:${PORT}`;
  for (let i = 0; ; i++) { try { if ((await fetch(origin + '/')).ok) break; } catch { /* not yet */ } if (i > 150) throw new Error('vite did not start'); await sleep(200); }
  const cport = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const ch = spawn(CHROME, [`--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, '--headless', '--mute-audio', ...(process.env.QA_NOGPU ? ['--disable-gpu'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']), '--window-size=360,640', '--disable-extensions', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  procs.push(ch.pid);
  let targets;
  for (let i = 0; ; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not yet */ } if (i > 100) throw new Error('chrome did not start'); await sleep(200); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const cb = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && cb.has(d.id)) { const c = cb.get(d.id); cb.delete(d.id); if (d.error) c.rej(new Error(d.error.message)); else c.res(d.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; cb.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  for (const d of ['Page', 'Runtime']) await send(d + '.enable');
  const view = (w, h, dpr, mobile) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  await view(360, 640, 3, true);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]);
    return r.result.value;
  };
  const shot = async (name) => { writeFileSync(join(OUT, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); console.log('  shot ' + name); };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch { /* busy */ } await sleep(100); } throw new Error('timeout ' + expr); };
  const qa = (expr) => ev('window.__qa.' + expr);
  const boot = async (save) => {
    await send('Page.navigate', { url: origin + '/' });
    await sleep(400);
    await ev(`localStorage.clear(); localStorage.setItem("lco_save", ${JSON.stringify(JSON.stringify(save))})`);
    await send('Page.navigate', { url: origin + '/' });
    await sleep(500);
    await waitFor('!!window.__qa && !!document.querySelector("#menu.on, #cafe.on, #hud.on")', 25000);
    await sleep(900);
  };
  const tapCat = async (cid) => {
    const p = await qa(`pos(${cid})`);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await sleep(40);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  for (const lang of ['en', 'tr']) {
    await boot({ v: 1, level: 35, coins: 840, settings: { sound: false, haptics: false, lang } });
    await qa(`lang("${lang}")`);
    await qa('level(12)'); await sleep(900); // 1 board
    await shot(`${lang}-1`);
    await qa('slow(0.2)'); // 2 mid-sprint
    await tapCat(await qa('tapColor(true)') ?? await qa('freeId()'));
    await sleep(520);
    await shot(`${lang}-2`);
    await qa('slow(1)'); await sleep(1500);
    await qa('level(12)'); await sleep(600); // 3 bench filling up
    await qa('benchTo(3)'); await sleep(2200);
    await shot(`${lang}-3`);
    await qa('level(55)'); await sleep(1000); // 4 a mechanic level (frozen cats)
    await shot(`${lang}-4`);
    await qa('level(2)'); await sleep(500); // 5 win card
    await qa('winNow()');
    await waitFor('window.__qa.state().screen === "win"', 30000);
    await sleep(1800);
    await shot(`${lang}-5`);
    await qa('cafe()'); await sleep(1200); // 6 cafe hub
    await shot(`${lang}-6`);
  }

  // cover 1280x720: teal backdrop, the logo, two phone shots, composed on a canvas in the page
  const b64 = (n) => 'data:image/png;base64,' + readFileSync(join(OUT, n + '.png')).toString('base64');
  await view(1280, 720, 1, false);
  await send('Page.navigate', { url: origin + '/privacy.html' });
  await sleep(500);
  const data = await ev(`(async () => {
    const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const [A, B, logo] = await Promise.all([load(${JSON.stringify(b64('en-2'))}), load(${JSON.stringify(b64('en-6'))}), load('/assets/logo_b.webp')]);
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1280, 720); g.addColorStop(0, '#03dbcc'); g.addColorStop(1, '#0aa9bd');
    x.fillStyle = g; x.fillRect(0, 0, 1280, 720);
    const phone = (img, px, py, w, rot) => {
      const h = w * 16 / 9; x.save(); x.translate(px + w / 2, py + h / 2); x.rotate(rot); x.translate(-w / 2, -h / 2);
      x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 30; x.shadowOffsetY = 12;
      x.fillStyle = '#1d2b53'; x.beginPath(); x.roundRect(-10, -10, w + 20, h + 20, 34); x.fill();
      x.shadowColor = 'transparent'; x.beginPath(); x.roundRect(0, 0, w, h, 26); x.clip(); x.drawImage(img, 0, 0, w, h); x.restore();
    };
    phone(B, 790, 150, 250, 0.09);
    phone(A, 930, 60, 280, -0.05);
    const lw = 560, lh = lw * logo.height / logo.width;
    x.drawImage(logo, 70, 180, lw, lh);
    x.fillStyle = '#fff6e5'; x.font = '700 38px Fredoka, system-ui, sans-serif'; x.fillText('Tap the long cats out!', 90, 180 + lh + 60);
    return c.toDataURL('image/png').split(',')[1];
  })()`);
  writeFileSync(join(OUT, 'cover.png'), Buffer.from(data, 'base64'));
  console.log('  shot cover');
  bye(0);
} catch (e) {
  console.log('FAILED ' + e.message);
  bye(1);
}
