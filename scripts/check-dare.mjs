// Friend challenge links: round trip, and every hostile payload is refused or clamped.
import { createHash } from 'node:crypto';
import { encode, encodeV1, decode, judge, cleanName, trGenitive, shortCode } from '../src/kit/dare.js';
import { qrMatrix } from '../src/kit/qr.js';

const bad = [];
const must = (ok, msg) => { if (!ok) bad.push(msg); };
const base = () => 5;
const raw = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

const c = encodeV1({ n: 27, b: 5, k: 'l', m: 'chain', g: 4, nm: 'Ana' }); // an old v1 link keeps working
must(JSON.stringify(decode(c, base)) === JSON.stringify({ n: 27, b: 5, k: 'l', m: 'chain', g: 4, nm: 'Ana' }), 'round trip');
must(decode(encode({ n: 3, b: 5, k: 'd', m: 'seats', g: 0, nm: 'Gülşen' }), base).nm === 'Gülşen', 'unicode name');
for (const x of ['', 'x'.repeat(500), 'a+b/c=', '!!!', raw([1]), raw(null), raw({ v: 2, n: 1, m: 'chain', g: 3 }), raw({ v: 1, n: 'abc', m: 'chain', g: 3 }), raw({ v: 1, n: 5, m: 'boss', g: 3 }), raw({ v: 1, n: 5, m: 'chain', g: 'x' })])
  must(decode(x, base) === null, 'refuse ' + x.slice(0, 30));
const cl = decode(raw({ v: 1, n: 1e9, b: 99, k: 'zz', m: 'chain', g: 99, nm: '<img src=x onerror=alert(1)>Bobbybobbybobby' }), base);
must(cl && cl.n === 999 && cl.b === 7 && cl.k === 'l' && cl.g === 8, 'clamp numbers ' + JSON.stringify(cl));
must(cl && !/[<>=()]/.test(cl.nm) && cl.nm.length <= 12, 'clean name ' + (cl && cl.nm));
must(decode(raw({ v: 1, n: 5, b: 1, m: 'seats', g: 9 }), base).b === 5, 'a link never removes seats');
must(decode(raw({ v: 1, n: 5, b: 5, m: 'seats', g: 9 }), base).g === 5, 'seats goal within the bench');
must(decode(raw({ v: 1, n: 5, m: 'time', g: 1 }), base).g === 30, 'time floor');
const mx = decode(encodeV1({ n: 13, b: 5, k: 'l', m: 'chain', g: 3, x: 1, i: 'ab12cd' }), base);
must(mx && mx.x === 1 && mx.i === 'ab12cd', 'match flag + share id round trip ' + JSON.stringify(mx));
const hx = decode(raw({ v: 1, n: 5, m: 'seats', g: 2, x: 1, i: '<script>' }), base);
must(hx && !('x' in hx) && !('i' in hx), 'match flag only on chain, hostile id dropped ' + JSON.stringify(hx));
// v2: the short typeable core (what the clip burns in) + the extras (names, reply, thread, round)
const s2 = shortCode({ n: 13, b: 5, k: 'l', m: 'chain', g: 3, i: 'ab12cd' });
must(s2 === '2l13-5-c3-ab12cd', 'short code ' + s2);
must(JSON.stringify(decode(s2, base)) === JSON.stringify({ n: 13, b: 5, k: 'l', m: 'chain', g: 3, nm: '', i: 'ab12cd' }), 'core alone plays the board ' + JSON.stringify(decode(s2, base)));
must(decode(s2.toUpperCase(), base)?.i === 'ab12cd', 'a typed (capitalised) core still decodes');
must(decode('2d4-5-s0', base)?.m === 'seats' && decode('2d4-5-s0', base).g === 0 && decode('2d4-5-s0', base).k === 'd', 'daily no-park core');
must(decode('2r9-5-t123', base)?.g === 123, 'time core');
must(decode('2l2-5-c2m', base)?.x === 1, 'match flag on the core');
const full = encode({ n: 13, b: 5, k: 'l', m: 'chain', g: 4, nm: 'Deniz', i: 'qq11', r: 'ab12cd', pg: 3, th: [{ nm: 'Ana', v: 3 }], rd: 2 });
must(full.startsWith('2l13-5-c4-qq11.') && full.length < 160 && /^[A-Za-z0-9_.-]+$/.test(full), 'full v2 link ' + full);
const fd = decode(full, base);
must(fd && fd.nm === 'Deniz' && fd.r === 'ab12cd' && fd.pg === 3 && fd.rd === 2 && fd.th.length === 1 && fd.th[0].nm === 'Ana' && fd.th[0].v === 3, 'v2 round trip ' + JSON.stringify(fd));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const hostile = decode('2l13-9-c99m-ab12cd.' + b64({ nm: '<b>Mallorymallorymallory', r: 'x/y', pg: 50, th: [[1, 99], ['<i>', 'x'], ['A', 1], ['B', 2], ['C', 3], ['D', 4]], rd: 1e9, z: 'junk' }), base);
must(hostile && hostile.b === 7 && hostile.g === 8 && hostile.x === 1 && !/[<>]/.test(hostile.nm) && hostile.nm.length <= 12 && !('r' in hostile), 'v2 clamps core + drops a bad reply ' + JSON.stringify(hostile));
must(hostile && hostile.th.length <= 3 && hostile.th.every((e) => e.v >= 2 && e.v <= 8 && !/[<>]/.test(e.nm)) && hostile.rd === 99, 'thread + round clamped ' + JSON.stringify(hostile && hostile.th));
must(decode('2l13-5-c3.zzzz', base)?.n === 13, 'a mangled tail still plays the board');
must(decode('2l13-5-c3.' + b64([1, 2]), base)?.th === undefined, 'array extras ignored');
for (const x of ['2', '2x13-5-c3', '2l13-5-q3', '2l-5-c3', '2l13-5-c3-ABCDEFGHIJ', '2l1234-5-c3', 'eyJ2.Ijox', '2l13-5-c3 ', '2l13-5-c3..x' + 'y'.repeat(400)])
  must(decode(x, base) === null, 'v2 refuse ' + x.slice(0, 24));
must(decode('2l13-1-s9', base).b === 5 && decode('2l13-5-s9', base).g === 5, 'v2: never fewer seats, seats goal within the bench');
must(decode('2l13-5-t1', base).g === 30, 'v2 time floor');
must(judge('chain', 4, 5) === 'beat' && judge('chain', 4, 4) === 'tie' && judge('chain', 4, 3) === 'miss', 'judge chain');
must(judge('seats', 2, 1) === 'beat' && judge('seats', 2, 3) === 'miss', 'judge seats');
must(judge('time', 250, 249) === 'beat' && judge('time', 250, 260) === 'miss', 'judge time');
must(cleanName('  a\u0000b  ') === 'ab', 'control chars');
for (const [n, g] of [['Ana', "Ana'nın"], ['Ali', "Ali'nin"], ['Murat', "Murat'ın"], ['Gül', "Gül'ün"], ['Oğuz', "Oğuz'un"], ['Elif', "Elif'in"]]) must(trGenitive(n) === g, 'tr genitive ' + n + ' ' + trGenitive(n));

// R11: the QR on the clip's end card. Two matrices must equal a reference encoder's (node-qrcode 1.5.4, byte mode,
// level M, the same mask), hashed row by row; the auto mask, a dare link's size and the no-fit case
const qrHash = (q) => { let s = ''; for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) s += q.get(x, y) ? '1' : '0'; return createHash('sha256').update(s).digest('hex'); };
const q1 = qrMatrix('https://example.github.io/long-cat-out/?c=2l13-5-c3-ab12cd', 5);
must(q1 && q1.version === 4 && qrHash(q1) === '31bb6470e867527c6395c01af7d5b7f72048d5e581fc523ac8a70d73b7472e7c', 'qr v4 matrix');
const q2 = qrMatrix('https://example.github.io/long-cat-out/?c=' + 'q'.repeat(120), 2);
must(q2 && q2.version === 9 && qrHash(q2) === '9d42762f71b7518e66be522b0b66496ba682609b53f5f55d723abbe2d036b53b', 'qr v9 matrix (two block sizes, version bits)');
const qa = qrMatrix('https://example.github.io/long-cat-out/?c=2l13-5-c3m-ab12cd');
must(qa && qa.size <= 33, 'a dare link fits a 33-module code ' + (qa && qa.size));
must(qrMatrix('z'.repeat(300)) === null, 'qr: too long is refused');

if (bad.length) { console.error('check-dare FAILED:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('check-dare ok');
