// Friend challenge links: round trip, and every hostile payload is refused or clamped.
import { encode, decode, judge, cleanName, trGenitive } from '../src/kit/dare.js';

const bad = [];
const must = (ok, msg) => { if (!ok) bad.push(msg); };
const base = () => 5;
const raw = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

const c = encode({ n: 27, b: 5, k: 'l', m: 'chain', g: 4, nm: 'Ana' });
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
const mx = decode(encode({ n: 13, b: 5, k: 'l', m: 'chain', g: 3, x: 1, i: 'ab12cd' }), base);
must(mx && mx.x === 1 && mx.i === 'ab12cd', 'match flag + share id round trip ' + JSON.stringify(mx));
const hx = decode(raw({ v: 1, n: 5, m: 'seats', g: 2, x: 1, i: '<script>' }), base);
must(hx && !('x' in hx) && !('i' in hx), 'match flag only on chain, hostile id dropped ' + JSON.stringify(hx));
must(judge('chain', 4, 5) === 'beat' && judge('chain', 4, 4) === 'tie' && judge('chain', 4, 3) === 'miss', 'judge chain');
must(judge('seats', 2, 1) === 'beat' && judge('seats', 2, 3) === 'miss', 'judge seats');
must(judge('time', 250, 249) === 'beat' && judge('time', 250, 260) === 'miss', 'judge time');
must(cleanName('  a\u0000b  ') === 'ab', 'control chars');
for (const [n, g] of [['Ana', "Ana'nın"], ['Ali', "Ali'nin"], ['Murat', "Murat'ın"], ['Gül', "Gül'ün"], ['Oğuz', "Oğuz'un"], ['Elif', "Elif'in"]]) must(trGenitive(n) === g, 'tr genitive ' + n + ' ' + trGenitive(n));

if (bad.length) { console.error('check-dare FAILED:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('check-dare ok');
