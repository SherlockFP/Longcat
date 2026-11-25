// R17: the CrazyGames build. node scripts/build-crazygames.mjs [--basic]
// -> dist-crazygames/ (no service worker, no install prompt, CrazyGames SDK v3, invite links instead of our own URL)
// and dist-crazygames.zip (forward-slash paths, index.html at the root) for the developer portal upload.
// --basic: Basic Launch build, the ad provider off (CrazyGames serves no ads in Basic Launch: no ad buttons at all).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist-crazygames');
const ZIP = join(ROOT, 'dist-crazygames.zip');
const basic = process.argv.includes('--basic');

process.env.VITE_PORTAL = 'crazygames';
process.env.VITE_ADS_PROVIDER = basic ? 'off' : 'crazygames';
const { build } = await import('vite');
await build({ root: ROOT, logLevel: 'warn', build: { outDir: OUT, emptyOutDir: true } });

// a plain zip writer (deflate, Node built-ins only): Windows' Compress-Archive writes backslash paths some servers reject
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else files.push(f); } };
walk(OUT);
const parts = [];
const central = [];
let off = 0;
for (const f of files) {
  const name = Buffer.from(relative(OUT, f).split(sep).join('/'));
  const raw = readFileSync(f);
  const data = deflateRawSync(raw, { level: 9 });
  const crc = crc32(raw);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
  head.writeUInt32LE(0, 10); head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22);
  head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(raw.length, 24);
  cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(off, 42);
  parts.push(head, name, data);
  central.push(cen, name);
  off += head.length + name.length + data.length;
}
const cdir = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdir.length, 12); end.writeUInt32LE(off, 16);
writeFileSync(ZIP, Buffer.concat([...parts, cdir, end]));

const total = files.reduce((t, f) => t + statSync(f).size, 0);
console.log(`dist-crazygames: ${files.length} files, ${(total / 1048576).toFixed(1)} MB -> dist-crazygames.zip ${(statSync(ZIP).size / 1048576).toFixed(1)} MB${basic ? ' (Basic Launch: ads off)' : ''}`);
// CrazyGames technical limits (docs.crazygames.com/requirements/technical): 1500 files, 250 MB total, 50 MB initial download
if (files.length > 1500 || total > 250 * 1048576) { console.error('over the CrazyGames file count / size limit'); process.exit(1); }
if (files.some((f) => f.endsWith('sw.js'))) { console.error('a service worker slipped into the portal build'); process.exit(1); }
