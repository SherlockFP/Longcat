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

if (bad.length) {
  console.error('check-web FAILED:\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log('check-web ok');
