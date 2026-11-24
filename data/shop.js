// R10 shop catalogue (src/game/shop.js rules, src/ui/shop.js view). Every price here is in coins: real-money items stay
// in src/kit/iap.js (a stub until a store backend is registered).

// booster unit prices in coins: the same as paying for one in a level (main.js HINT_COST / UNDO_COST / SCOOP_COST);
// the cushion is a pre-level seat, a bit dearer than the first paid seat of a lost bench (econ.SEAT_COSTS[0])
export const UNIT = { hint: 60, undo: 90, scoop: 150, cushion: 180 };
export const BOOSTERS = ['hint', 'undo', 'scoop', 'cushion'];
// shop packs: a small and a big one per booster, the big one cheaper per piece
export const PACKS = [
  { n: 3, off: 10 },
  { n: 10, off: 25 },
];

// deal of the day: one bundle a day (deterministic by day number), bought once, never the same as yesterday's
export const DEALS = [
  { id: 'd_think', items: { hint: 3, undo: 2 }, off: 40 },
  { id: 'd_lift', items: { scoop: 2, cushion: 1 }, off: 40 },
  { id: 'd_hints', items: { hint: 5 }, off: 30 },
  { id: 'd_rewind', items: { undo: 3, scoop: 1 }, off: 35 },
  { id: 'd_comfy', items: { cushion: 2, hint: 2 }, off: 45 },
  { id: 'd_scoops', items: { scoop: 3 }, off: 30 },
  { id: 'd_party', items: { hint: 2, undo: 2, scoop: 1, cushion: 1 }, off: 50 },
];

// free gifts for a rewarded ad (only where ads.available()): per day
export const AD_GIFTS = [
  { id: 'coins', give: { coins: 30 }, per: 3 },
  { id: 'hint', give: { hint: 1 }, per: 1 },
];

// R13 board looks: the room art behind the board plus rug / stitch / tile / bench-plank tints, baked once in the perf
// underlay. 'room_sunny' (Chapter look) picks one per chapter from the map ground (src/ui/look-world.js mapTheme).
export const LOOKS = {
  garden: { room: 'bg_play_room', rug: '#C24312', stitch: '#FBE3BE', tile: null, wash: null, plank: null },
  autumn: { room: 'brd_autumn', rug: '#A34828', stitch: '#FFE8BA', tile: 'rgba(239,179,86,0.12)', wash: 'rgba(221,133,51,0.15)', plank: null },
  snow: { room: 'brd_snow', rug: '#4F83B2', stitch: '#FFFFFF', tile: 'rgba(111,176,226,0.16)', wash: 'rgba(131,188,238,0.22)', plank: '#E2C9A4' },
  lantern: { room: 'brd_lantern', rug: '#743356', stitch: '#FFD583', tile: 'rgba(230,157,92,0.12)', wash: 'rgba(162,81,130,0.20)', plank: '#6F4534' },
  beach: { room: 'brd_beach', rug: '#248C8B', stitch: '#FFF1D3', tile: 'rgba(237,199,127,0.15)', wash: 'rgba(81,195,191,0.15)', plank: '#AF9981' },
  bakery: { room: 'bg_bakery', rug: '#B85D72', stitch: '#FFFFFF', tile: 'rgba(246,214,146,0.14)', wash: 'rgba(235,154,168,0.14)', plank: '#C68A42' },
  galaxy: { room: 'brd_galaxy', rug: '#443978', stitch: '#FFD583', tile: 'rgba(172,151,231,0.14)', wash: 'rgba(105,90,186,0.23)', plank: null },
  candy: { room: 'brd_candy', rug: '#D85D9B', stitch: '#FFFFFF', tile: 'rgba(242,152,198,0.12)', wash: 'rgba(242,142,197,0.19)', plank: null },
  night: { room: 'shop_room_night', rug: '#293F69', stitch: '#FFD583', tile: null, wash: 'rgba(96,123,183,0.19)', plank: null },
  blossom: { room: 'shop_room_blossom', rug: '#BC5875', stitch: '#FFFFFF', tile: null, wash: 'rgba(236,156,180,0.17)', plank: null },
  garden_party: { room: 'bg_garden', rug: '#508348', stitch: '#FBE3BE', tile: null, wash: 'rgba(132,184,105,0.17)', plank: null },
};

// cosmetics: cat outfits and fur skins (worn by every cat on the board), carrier skins, board themes. The first free item
// of each kind is the default; `iap` items are bought only through src/kit/iap.js (cost 0, never from chests).
export const COSMETICS = [
  { id: 'hat_none', kind: 'hat', cost: 0, name: { en: 'No hat', tr: 'Şapkasız' } },
  { id: 'hat_bow', kind: 'hat', cost: 300, name: { en: 'Ribbon bow', tr: 'Kurdele fiyonk' } },
  { id: 'hat_party', kind: 'hat', cost: 450, name: { en: 'Party hat', tr: 'Parti şapkası' } },
  { id: 'hat_beret', kind: 'hat', cost: 600, name: { en: 'Painter beret', tr: 'Ressam beresi' } },
  { id: 'hat_crown', kind: 'hat', cost: 900, name: { en: 'Little crown', tr: 'Minik taç' } },
  { id: 'skin_none', kind: 'skin', cost: 0, name: { en: 'Natural fur', tr: 'Doğal tüy' } },
  { id: 'skin_candy', kind: 'skin', cost: 700, name: { en: 'Candy swirl', tr: 'Şeker çizgisi' } },
  { id: 'skin_galaxy', kind: 'skin', cost: 1100, name: { en: 'Galaxy', tr: 'Galaksi' } },
  { id: 'skin_golden', kind: 'skin', cost: 0, iap: 'skin_golden', name: { en: 'Golden glow', tr: 'Altın parıltı' } },
  { id: 'car_none', kind: 'car', cost: 0, name: { en: 'Classic', tr: 'Klasik' } },
  { id: 'car_bow', kind: 'car', cost: 400, name: { en: 'Gift bow', tr: 'Hediye fiyonku' } },
  { id: 'car_flowers', kind: 'car', cost: 600, name: { en: 'Flower box', tr: 'Çiçekli kutu' } },
  { id: 'car_stars', kind: 'car', cost: 750, name: { en: 'Star stickers', tr: 'Yıldız çıkartması' } },
  { id: 'car_hearts', kind: 'car', cost: 500, name: { en: 'Heart stickers', tr: 'Kalp çıkartması' } },
  { id: 'car_gold', kind: 'car', cost: 1300, name: { en: 'Golden trim', tr: 'Altın şerit' } },
  { id: 'room_sunny', kind: 'room', cost: 0, look: 'garden', name: { en: 'Chapter look', tr: 'Bölüm teması' } },
  { id: 'room_garden', kind: 'room', cost: 800, look: 'garden_party', name: { en: 'Garden party', tr: 'Bahçe partisi' } },
  { id: 'room_autumn', kind: 'room', cost: 1000, look: 'autumn', name: { en: 'Autumn afternoon', tr: 'Sonbahar' } },
  { id: 'room_snow', kind: 'room', cost: 1000, look: 'snow', name: { en: 'Snowy morning', tr: 'Kar sabahı' } },
  { id: 'room_lantern', kind: 'room', cost: 1200, look: 'lantern', name: { en: 'Lantern night', tr: 'Fener gecesi' } },
  { id: 'room_beach', kind: 'room', cost: 1200, look: 'beach', name: { en: 'Beach house', tr: 'Sahil evi' } },
  { id: 'room_bakery', kind: 'room', cost: 1000, look: 'bakery', name: { en: 'Bakery morning', tr: 'Fırın sabahı' } },
  { id: 'room_night', kind: 'room', cost: 1500, look: 'night', name: { en: 'Starry night', tr: 'Yıldızlı gece' } },
  { id: 'room_blossom', kind: 'room', cost: 1500, look: 'blossom', name: { en: 'Blossom spring', tr: 'Bahar çiçeği' } },
  { id: 'room_galaxy', kind: 'room', cost: 0, iap: 'look_galaxy', look: 'galaxy', name: { en: 'Galaxy observatory', tr: 'Galaksi gözlemevi' } },
  { id: 'room_candy', kind: 'room', cost: 0, iap: 'look_candy', look: 'candy', name: { en: 'Candy shop', tr: 'Şeker dükkânı' } },
];
export const KINDS = ['hat', 'skin', 'car', 'room'];
