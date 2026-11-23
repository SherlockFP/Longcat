// Cat Café data + rules. Reads data/cafe.json (written by the art operator); tolerates missing fields.
import RAW from '../../data/cafe.json';
import { save } from '../kit/save.js';
import { lang } from '../i18n.js';

export const AREAS = (RAW.areas || []).filter((a) => a && Array.isArray(a.tasks));
export const TEASER = RAW.teaser || null;
export const loc = (o) => (o && typeof o === 'object' ? o[lang()] || o.en || '' : o || '');

// perk id in data -> gameplay effect (see DESIGN-V2 section 4)
export const PERKS = {
  coins_bonus: { kind: 'coins' },
  hint_discount: { kind: 'hint' },
  extra_undo: { kind: 'seat' },
  star_bonus: { kind: 'scoop' },
};
export const perkKind = (perk) => (PERKS[perk] ? PERKS[perk].kind : 'coins');

export const ALL_TASKS = AREAS.flatMap((a, ai) => a.tasks.map((t) => ({ ...t, area: ai })));
export const RESIDENTS = ALL_TASKS.filter((t) => t.resident).map((t) => ({ ...t.resident, task: t }));

const cafe = () => save.data.cafe;
export const isBuilt = (id) => !!cafe().built[id];
export const stars = () => cafe().stars;
export const pending = (ai) => (AREAS[ai] ? AREAS[ai].tasks.filter((t) => !isBuilt(t.id)) : []);
export const areaDone = (ai) => !!AREAS[ai] && pending(ai).length === 0;
export const currentArea = () => {
  const i = AREAS.findIndex((_, k) => !areaDone(k));
  return i < 0 ? AREAS.length : i; // AREAS.length = the "coming soon" teaser
};
export const canAfford = (t) => stars() >= (t.cost || 1);
export const anyAffordable = () => ALL_TASKS.some((t) => !isBuilt(t.id) && canAfford(t)) || (partyOpen() && stars() >= PARTY_COST);

// After the last area: Captain's rooftop parties, a project that never runs out. Each one costs PARTY_COST stars and
// pays PARTY_REWARD; the party count shows on the rooftop and on the task row.
export const PARTY_COST = 3;
export const PARTY_REWARD = { coins: 80, scoop: 1 };
export const partyOpen = () => ALL_TASKS.length > 0 && ALL_TASKS.every((t) => isBuilt(t.id));
export const parties = () => cafe().party || 0;
export function hostParty() {
  if (!partyOpen() || stars() < PARTY_COST) return false;
  const c = cafe();
  c.stars -= PARTY_COST;
  c.party = parties() + 1;
  save.commit();
  return true;
}
export const hasResident = (id) => RESIDENTS.some((r) => r.id === id && isBuilt(r.task.id));
export const hasPerk = (kind) => RESIDENTS.some((r) => perkKind(r.perk) === kind && isBuilt(r.task.id));
export const perkOwner = (kind) => RESIDENTS.filter((r) => perkKind(r.perk) === kind && isBuilt(r.task.id)).at(-1); // the newest one speaks
// perks stack: each moved-in resident adds its `value` (default 1) to its kind. Effects by total level (main.js):
// coins +5 per level on every win; hint: that many free Hints a day; seat: level 1 = +1 seat on a hard level's first
// try, 2+ = on every try; scoop: level 1 = a free Scoop every 5th level, 2+ = every 3rd.
export const perkValue = (r) => Math.max(1, Math.min(5, Math.round(+r.value || 1)));
export const perkLevel = (kind) => RESIDENTS.reduce((n, r) => n + (perkKind(r.perk) === kind && isBuilt(r.task.id) ? perkValue(r) : 0), 0);
export const nextResident = () => RESIDENTS.find((r) => !isBuilt(r.task.id)) || null;
// stars still to spend before this resident moves in (its area's unbuilt tasks up to and including its own)
export function starsToResident(r) {
  const area = AREAS[r.task.area];
  if (!area) return 0;
  let n = 0;
  for (const t of area.tasks) {
    if (!isBuilt(t.id)) n += t.cost || 1;
    if (t.id === r.task.id) break;
  }
  return n;
}

// idle chatter in the hub (the arrival line is said once, on the arrival card); rotates by day and area
const IDLE = {
  mochi: [
    { en: 'Purr... this spot is mine now.', tr: 'Mırr... burası artık benim yerim.' },
    { en: 'Is that a crumb? Mine!', tr: 'O bir kırıntı mı? Benim!' },
    { en: 'Nap first, then snacks.', tr: 'Önce şekerleme, sonra atıştırma.' },
    { en: 'You came back! Mrrp!', tr: 'Geri geldin! Mırr!' },
  ],
  biscuit: [
    { en: 'Leaves are for batting.', tr: 'Yapraklar pati atmak için var.' },
    { en: 'I counted the cups. Twice.', tr: 'Fincanları saydım. İki kez.' },
    { en: 'Sunbeam spotted!', tr: 'Güneş ışığı göründü!' },
    { en: 'Mew? Mew!', tr: 'Miyav? Miyav!' },
  ],
  luna: [
    { en: 'The window is my TV.', tr: 'Pencere benim televizyonum.' },
    { en: 'A bird! A BIRD!', tr: 'Kuş! Bir KUŞ!' },
    { en: 'Warm glass, warm paws.', tr: 'Sıcak cam, sıcak patiler.' },
    { en: 'Shh... I am watching.', tr: 'Şşt... izliyorum.' },
  ],
  pudding: [
    { en: 'This rug is very soft.', tr: 'Bu halı çok yumuşak.' },
    { en: 'Is it snack time yet?', tr: 'Atıştırma vakti geldi mi?' },
    { en: 'Purr... purr... zzz.', tr: 'Mırr... mırr... zzz.' },
    { en: 'Best café in town!', tr: 'Şehrin en güzel kafesi!' },
  ],
  noodle: [
    { en: 'Hammock time. Do not disturb.', tr: 'Hamak saati. Rahatsız etmeyin.' },
    { en: 'I read every book. With my paws.', tr: 'Bütün kitapları okudum. Patilerimle.' },
    { en: 'One more cushion, please.', tr: 'Bir minder daha lütfen.' },
    { en: 'Stretch... and flop.', tr: 'Gerin... ve yığıl.' },
  ],
  pepper: [
    { en: 'The fountain sings for me.', tr: 'Çeşme benim için şarkı söylüyor.' },
    { en: 'Butterflies! Catch them all!', tr: 'Kelebekler! Hepsini yakala!' },
    { en: 'Fresh air, fresh fish?', tr: 'Temiz hava, taze balık?' },
    { en: 'Garden patrol, all clear.', tr: 'Bahçe devriyesi, her şey yolunda.' },
  ],
  clover: [
    { en: 'I smell the flowers first.', tr: 'Çiçekleri ilk ben koklarım.' },
    { en: 'This umbrella is my shade.', tr: 'Bu şemsiye benim gölgem.' },
    { en: 'Lucky paws today!', tr: 'Bugün patilerim şanslı!' },
    { en: 'Psst... want a hint?', tr: 'Pst... ipucu ister misin?' },
  ],
  captain: [
    { en: 'Stars ahoy!', tr: 'Yıldızlar göründü!' },
    { en: 'I can see the whole town.', tr: 'Bütün şehri görebiliyorum.' },
    { en: 'The grill smells like treats.', tr: 'Izgara mama gibi kokuyor.' },
    { en: 'Captain on deck. Purr.', tr: 'Kaptan güvertede. Mırr.' },
  ],
};

// renovation clutter (paint, tools): fades out as the area's tasks are built and is gone once half the area is built,
// so a room that is mostly done never keeps the paint cans in the foreground. 0..1
export function clutterLevel(ai) {
  const a = AREAS[ai];
  if (!a || !a.tasks.length) return 0;
  const left = pending(ai).length / a.tasks.length;
  return left > 0.5 ? (left - 0.5) * 2 : 0;
}

// who lounges on the floor of area ai: its own moved-in residents first, then other residents visit the free spots
// (rotating by day). A spot under the next unbuilt piece stays empty so a cat never sits on a building site.
// `prefer`: a resident id that should be in the room if it can (the one with a finished request: its bubble shows)
export function guestsFor(ai, day = 0, prefer = '') {
  const area = AREAS[ai];
  if (!area || !Array.isArray(area.spots)) return [];
  const owned = RESIDENTS.filter((r) => isBuilt(r.task.id));
  const home = owned.filter((r) => r.task.area === ai);
  const away = owned.filter((r) => r.task.area !== ai);
  const k = away.length ? day % away.length : 0;
  let order = [...home, ...away.slice(k), ...away.slice(0, k)];
  const pi = order.findIndex((r) => r.id === prefer);
  if (pi > 0) order = [order[pi], ...order.slice(0, pi), ...order.slice(pi + 1)];
  const next = pending(ai)[0];
  const cl = area.clutter && clutterLevel(ai) > 0.34 ? area.clutter : null; // nobody naps in the paint while it is still a mess
  const near = (s, o) => o && Math.abs(s.x - o.x) < o.w * 0.45 && Math.abs(s.y - o.y) < o.w * 0.45;
  const blocked = (s) => near(s, next) || near(s, cl);
  const out = [];
  for (const s of area.spots) {
    if (blocked(s) || out.length >= order.length) continue;
    const r = order[out.length];
    out.push({ id: r.id, name: r.name, line: r.line, idle: IDLE[r.id] || null, spot: s, visit: r.task.area !== ai });
  }
  return out;
}

export function addStars(n) {
  cafe().stars += n;
  save.commit();
}

// pay a task with stars; returns the task (and its resident, if any) or null
export function build(id) {
  const t = ALL_TASKS.find((x) => x.id === id);
  if (!t || isBuilt(id) || !canAfford(t)) return null;
  const c = cafe();
  c.stars -= t.cost || 1;
  c.built[id] = 1;
  save.commit();
  return t;
}

// ---- affection: treats for moved-in residents (star sink that never runs out of purpose) ----
export const LOVE_COSTS = [60, 120, 200]; // coins (fish snacks) for affection level 1, 2, 3; stars stay for building only
export const loveOf = (id) => cafe().love[id] || 0;
export const love = () => RESIDENTS.reduce((n, r) => n + (isBuilt(r.task.id) ? loveOf(r.id) : 0), 0); // each level = +1 coin on every win
export const treatCost = (id) => LOVE_COSTS[loveOf(id)] ?? 0;
export function treat(id) { // -> new level, or 0 when not allowed
  const r = RESIDENTS.find((x) => x.id === id);
  if (!r || !isBuilt(r.task.id) || loveOf(id) >= LOVE_COSTS.length) return 0;
  const cost = treatCost(id);
  const c = cafe();
  if (save.data.coins < cost) return 0;
  save.data.coins -= cost;
  c.love[id] = loveOf(id) + 1;
  save.commit();
  return c.love[id];
}
