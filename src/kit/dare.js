// Friend challenge links: ?c=<base64url JSON> names one exact board and one goal. No accounts, no backend: the link is
// all there is, so decode() trusts nothing in it (shape, numbers, name) and clamps every field.
//   { v: 1, n: board level number, b: bench seats, k: 'l' level | 'd' daily | 's' Cat Show | 'r' Café Rush,
//     m: 'chain' | 'seats' | 'time', g: target (chain size, seats used, or tenths of a second), nm?: sender name,
//     x?: 1 = the chain goal is already the board's best (the recipient is asked to match it, not beat it),
//     i?: share id (a few base36 chars): ties the sender's handoff to the recipient's open, first move, clear and reshare }
export const MODES = ['chain', 'seats', 'time'];
const KINDS = ['l', 'd', 's', 'r'];
const MAX_LEN = 400;

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

export function encode(d) {
  const o = { v: 1, n: d.n, b: d.b, k: d.k, m: d.m, g: d.g };
  const nm = cleanName(d.nm);
  if (nm) o.nm = nm;
  if (d.x) o.x = 1;
  if (d.i && /^[a-z0-9]{1,8}$/.test(d.i)) o.i = d.i;
  return b64url(JSON.stringify(o));
}

// baseBench(n): the board's own seat count; a link may add at most two seats (the sender's perk seats), never remove any
export function decode(code, baseBench) {
  if (typeof code !== 'string' || !code || code.length > MAX_LEN || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
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
