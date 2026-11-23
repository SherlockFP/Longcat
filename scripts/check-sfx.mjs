// Sound files: every name in src/kit/audio.js (SFX + MUSIC) exists in public/sfx as an mp3, stays under the size
// limits and is listed in CREDITS.md; no stray files ship unlisted.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bad = [];
const must = (ok, msg) => { if (!ok) bad.push(msg); };
const src = readFileSync(join(ROOT, 'src/kit/audio.js'), 'utf8');
const block = src.match(/export const SFX = \{([\s\S]*?)\n\};/);
must(block, 'audio.js: SFX map not found');
const sfx = block ? [...new Set([...block[1].matchAll(/'([a-z0-9_-]+)'/g)].map((m) => m[1]))] : [];
const music = (src.match(/export const MUSIC = '([a-z0-9_-]+)'/) || [])[1];
must(music, 'audio.js: MUSIC name not found');
must(sfx.length >= 10, `audio.js: only ${sfx.length} sfx files referenced`);
const credits = existsSync(join(ROOT, 'CREDITS.md')) ? readFileSync(join(ROOT, 'CREDITS.md'), 'utf8') : '';
must(credits, 'CREDITS.md missing');
const dir = join(ROOT, 'public/sfx');
const check = (name, max) => {
  const f = join(dir, `${name}.mp3`);
  if (!existsSync(f)) return must(false, `public/sfx/${name}.mp3 missing`);
  const size = statSync(f).size;
  must(size > 500 && size <= max, `public/sfx/${name}.mp3 is ${size} B (limit ${max})`);
  const head = readFileSync(f).subarray(0, 3);
  must(head.toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), `public/sfx/${name}.mp3 is not an mp3`);
  must(credits.includes(`${name}.mp3`), `CREDITS.md does not list ${name}.mp3`);
};
for (const n of sfx) check(n, 60 * 1024);
if (music) check(music, 1200 * 1024);
if (existsSync(dir)) {
  const known = new Set([...sfx, music].map((n) => `${n}.mp3`));
  for (const f of readdirSync(dir)) must(known.has(f), `public/sfx/${f} is not referenced by audio.js`);
}
if (bad.length) {
  console.error('check-sfx FAILED:\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log(`check-sfx ok (${sfx.length} sfx + music)`);
