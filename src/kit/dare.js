// Friend challenge links: ?c=<code> names one exact board and one goal. No accounts, no backend: the link is all there
// is, so decode() trusts nothing in it (shape, numbers, names) and clamps every field.
// v2 (current): a short, typeable core, then optional extras after a dot:
//   2<k><n>-<b>-<m><g>[m][-<i>][.<base64url JSON extras>]      e.g. 2l13-5-c3-ab12cd
//   the leading 2 is the token version and pins the board generator revision (bump it when generate() changes);
//   k: l level | d daily | s Cat Show | r Café Rush; m: c chain | s seats | t time (tenths of a second); a trailing m on
//   the goal = match (the chain is already the board's best); i: share id. The core alone plays the exact board and goal
//   (it is what the clip burns in, so a friend can type it); the extras carry the names and the reply thread:
//   { nm: sender name, r: the share id this run answered, pg: that dare's target, th: [[name, value], ...] the latest
//     earlier runs on this board (oldest first, at most 3), rd: round of the back-and-forth (1 = the first dare) }
// v1 (still decoded): base64url JSON { v: 1, n, b, k, m: 'chain'|'seats'|'time', g, nm?, x?, i?, r?, pg? }.
export const MODES = ['chain', 'seats', 'time'];
const KINDS = ['l', 'd', 's', 'r'];
const MAX_LEN = 400;
const MCH = { chain: 'c', seats: 's', time: 't' };
const CHM = { c: 'chain', s: 'seats', t: 'time' };
const ID = /^[a-z0-9]{1,8}$/;
const THREAD = 3;

const int = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : null);

// letters, digits, spaces and a few name marks only; at most 12 characters
export function cleanName(s) {
  if (typeof s !== 'string') return '';
  return s.normalize('NFC').replace(/[^\p{L}\p{N} '.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();
}

function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeV1(d) {
  const o = { v: 1, n: d.n, b: d.b, k: d.k, m: d.m, g: d.g };
  const nm = cleanName(d.nm);
  if (nm) o.nm = nm;
  if (d.x) o.x = 1;
  if (d.i && /^[a-z0-9]{1,8}$/.test(d.i)) o.i = d.i;
  if (d.r && /^[a-z0-9]{1,8}$/.test(d.r) && Number.isFinite(d.pg)) { o.r = d.r; o.pg = d.pg; }
  return b64url(JSON.stringify(o));
}

// the typeable part: board, seats, goal, share id (lower case; what the clip shows)
export function shortCode(d) {
  return `2${KINDS.includes(d.k) ? d.k : 'l'}${d.n}-${d.b}-${MCH[d.m]}${d.g}${d.m === 'chain' && d.x ? 'm' : ''}${d.i && ID.test(d.i) ? '-' + d.i : ''}`;
}
export function encode(d) {
  const ex = {};
  const nm = cleanName(d.nm);
  if (nm) ex.nm = nm;
  if (d.r && ID.test(d.r) && Number.isFinite(d.pg)) { ex.r = d.r; ex.pg = d.pg; }
  const th = (Array.isArray(d.th) ? d.th : []).slice(-THREAD).map((e) => [cleanName(e.nm), Math.round(+e.v) || 0]);
  if (th.length) ex.th = th;
  if (Number.isFinite(d.rd) && d.rd > 1) ex.rd = Math.min(99, Math.round(d.rd));
  return shortCode(d) + (Object.keys(ex).length ? '.' + b64url(JSON.stringify(ex)) : '');
}
const V2 = /^2([ldsr])(\d{1,3})-(\d{1,2})-([cst])(\d{1,4})(m?)(?:-([a-z0-9]{1,8}))?$/;
const goalRange = (m, b) => (m === 'chain' ? [2, 8] : m === 'seats' ? [0, b] : [30, 9000]); // time: 3 s .. 15 min, in tenths
function decodeV2(code, baseBench) {
  const dot = code.indexOf('.');
  const core = (dot < 0 ? code : code.slice(0, dot)).toLowerCase(); // typed from a video: the phone may capitalise it
  const mm = V2.exec(core);
  if (!mm) return null;
  const n = int(mm[2], 1, 999);
  const m = CHM[mm[4]];
  const base = baseBench(n);
  const b = int(mm[3], base, base + 2) ?? base;
  const g = int(mm[5], ...goalRange(m, b));
  const out = { n, b, k: mm[1], m, g, nm: '' };
  if (m === 'chain' && mm[6]) out.x = 1;
  if (mm[7]) out.i = mm[7];
  if (dot < 0) return out;
  let ex;
  try { ex = JSON.parse(unb64url(code.slice(dot + 1))); } catch { return out; } // a mangled tail still plays the board
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return out;
  out.nm = cleanName(ex.nm);
  if (typeof ex.r === 'string' && ID.test(ex.r)) {
    const pg = int(ex.pg, ...goalRange(m, b));
    if (pg != null) { out.r = ex.r; out.pg = pg; }
  }
  if (Array.isArray(ex.th)) {
    const th = ex.th.slice(-THREAD).filter((e) => Array.isArray(e)).map((e) => ({ nm: cleanName(e[0]), v: int(e[1], ...goalRange(m, b)) })).filter((e) => e.v != null);
    if (th.length) out.th = th;
  }
  const rd = int(ex.rd, 1, 99);
  if (rd && rd > 1) out.rd = rd;
  return out;
}

// baseBench(n): the board's own seat count; a link may add at most two seats (the sender's perk seats), never remove any
export function decode(code, baseBench) {
  if (typeof code !== 'string' || !code || code.length > MAX_LEN || !/^[A-Za-z0-9_.-]+$/.test(code)) return null;
  if (code[0] === '2') return decodeV2(code, baseBench);
  if (code.includes('.')) return null;
  let o;
  try { o = JSON.parse(unb64url(code)); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 1) return null;
  const n = int(o.n, 1, 999);
  const m = MODES.includes(o.m) ? o.m : null;
  if (n == null || !m) return null;
  const k = KINDS.includes(o.k) ? o.k : 'l';
  const base = baseBench(n);
  const b = int(o.b, base, base + 2) ?? base;
  let g;
  if (m === 'chain') g = int(o.g, 2, 8);
  else if (m === 'seats') g = int(o.g, 0, b);
  else g = int(o.g, 30, 9000); // 3 s .. 15 min, in tenths
  if (g == null) return null;
  const out = { n, b, k, m, g, nm: cleanName(o.nm) };
  if (m === 'chain' && o.x === 1) out.x = 1;
  if (typeof o.i === 'string' && /^[a-z0-9]{1,8}$/.test(o.i)) out.i = o.i;
  if (typeof o.r === 'string' && /^[a-z0-9]{1,8}$/.test(o.r)) {
    const pg = m === 'chain' ? int(o.pg, 2, 8) : m === 'seats' ? int(o.pg, 0, b) : int(o.pg, 30, 9000);
    if (pg != null) { out.r = o.r; out.pg = pg; }
  }
  return out;
}

// a fresh share id for the funnel (not a user id: random, per share)
export const shareId = () => Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');

// how the run went against the goal: 'beat' | 'tie' | 'miss' (v = the player's own chain / seats / tenths)
export function judge(m, g, v) {
  if (m === 'chain') return v > g ? 'beat' : v === g ? 'tie' : 'miss';
  if (m === 'seats') return v < g ? 'beat' : v === g ? 'tie' : 'miss';
  return v < g ? 'beat' : v === g ? 'tie' : 'miss';
}

// Turkish genitive of a name with an apostrophe (Ana'nın, Ali'nin, Murat'ın, Gül'ün): last vowel harmony, -n- after a vowel
export function trGenitive(name) {
  const vow = 'aıoueiöüAIOUEİÖÜ';
  const low = name.toLocaleLowerCase('tr');
  let last = '';
  for (const c of low) if (vow.toLocaleLowerCase('tr').includes(c)) last = c;
  const suf = { a: 'ın', ı: 'ın', o: 'un', u: 'un', e: 'in', i: 'in', ö: 'ün', ü: 'ün' }[last] || 'in';
  const endsVowel = vow.toLocaleLowerCase('tr').includes(low.at(-1) || '');
  return `${name}'${endsVowel ? 'n' : ''}${suf}`;
}
