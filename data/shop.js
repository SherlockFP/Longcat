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

// cosmetics: cat outfits (worn by every cat on the board), carrier skins, play-room themes. The first of each kind is free.
export const COSMETICS = [
  { id: 'hat_none', kind: 'hat', cost: 0, name: { en: 'No hat', tr: 'Şapkasız' } },
  { id: 'hat_bow', kind: 'hat', cost: 300, name: { en: 'Ribbon bow', tr: 'Kurdele fiyonk' } },
  { id: 'hat_party', kind: 'hat', cost: 450, name: { en: 'Party hat', tr: 'Parti şapkası' } },
  { id: 'hat_beret', kind: 'hat', cost: 600, name: { en: 'Painter beret', tr: 'Ressam beresi' } },
  { id: 'hat_crown', kind: 'hat', cost: 900, name: { en: 'Little crown', tr: 'Minik taç' } },
  { id: 'car_none', kind: 'car', cost: 0, name: { en: 'Classic', tr: 'Klasik' } },
  { id: 'car_bow', kind: 'car', cost: 400, name: { en: 'Gift bow', tr: 'Hediye fiyonku' } },
  { id: 'car_flowers', kind: 'car', cost: 600, name: { en: 'Flower box', tr: 'Çiçekli kutu' } },
  { id: 'car_stars', kind: 'car', cost: 750, name: { en: 'Star stickers', tr: 'Yıldız çıkartması' } },
  { id: 'room_sunny', kind: 'room', cost: 0, art: 'bg_play_room', name: { en: 'Sunny room', tr: 'Güneşli oda' } },
  { id: 'room_night', kind: 'room', cost: 1500, art: 'shop_room_night', name: { en: 'Starry night', tr: 'Yıldızlı gece' } },
  { id: 'room_blossom', kind: 'room', cost: 1500, art: 'shop_room_blossom', name: { en: 'Blossom spring', tr: 'Bahar çiçeği' } },
];
export const KINDS = ['hat', 'car', 'room'];
