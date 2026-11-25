// Web release sanity: manifest, icons, privacy page, listing, ads OFF by default, relative base.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bad = [];
const must = (ok, msg) => { if (!ok) bad.push(msg); };
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const m = JSON.parse(read('public/manifest.webmanifest'));
must(m.name === 'Long Cat Out!', 'manifest name');
must(m.display === 'fullscreen' && m.orientation === 'portrait', 'manifest display/orientation');
must(m.start_url === './' && m.scope === './', 'manifest start_url/scope must be relative');
for (const [sz, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
  const i = m.icons.find((x) => x.sizes === sz && x.purpose === purpose);
  must(i && existsSync(join(ROOT, 'public', i.src)), `manifest icon ${sz} ${purpose}`);
}
must(existsSync(join(ROOT, 'public/privacy.html')), 'public/privacy.html');
must(existsSync(join(ROOT, 'store/listing.md')), 'store/listing.md');
must(existsSync(join(ROOT, 'RELEASE.md')), 'RELEASE.md');
must(/base:\s*'\.\/'/.test(read('vite.config.js')), "vite base must be './'");
const html = read('index.html');
must(html.includes('rel="manifest"') && !/(href|src)="\/(?!src\/)/.test(html), 'index.html: manifest link, no root-absolute paths');
const ads = read('src/kit/ads.js');
must(/provider:\s*env\.VITE_ADS_PROVIDER === 'h5' \? 'h5' : 'off'/.test(ads), 'ads provider must default to off');
// R17: the owner's credit, in every language (one literal, never translated) and in the page meta
must(html.includes('<meta name="author" content="Sher"'), 'index.html: meta author Sher');
must(/class="madeby"[^>]*>Made by Sher</.test(read('src/ui/ui.js')), 'Settings: "Made by Sher" under the credits');
// R17 perf: a send's progress saves once after the burst; any commit() flushes it
{
  const st = {};
  globalThis.localStorage = { getItem: () => null, setItem: (k, v) => { st.v = v; st.n = (st.n || 0) + 1; } };
  const { save } = await import('../src/kit/save.js');
  st.n = 0;
  save.commitSoon(); save.commitSoon(); save.commitSoon();
  must(st.n === 0 && !!save.soon, 'commitSoon waits');
  save.commit();
  must(st.n === 1 && !save.soon, 'commit flushes a pending commitSoon once');
  save.commitSoon();
  await new Promise((r) => setTimeout(r, 1600));
  must(st.n === 2 && !save.soon, 'commitSoon writes once after the burst');
}

if (bad.length) {
  console.error('check-web FAILED:\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log('check-web ok');
