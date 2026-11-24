// Long-term retention data (src/game/live.js): seasons, visiting cats, resident requests, outfits, Café Rush bots.
// Seasons rotate every 4 weeks through this list (the street's featured restyle set, the nook each visiting cat sleeps in).
export const SEASONS = [
  { id: 'lantern', name: { en: 'Lantern Lane', tr: 'Fener Sokağı' }, color: '#d9733a', visitors: ['maple', 'hazel'] },
  { id: 'cocoa', name: { en: 'Cocoa Snow', tr: 'Kakaolu Kar' }, color: '#4f8fc0', visitors: ['pip', 'frost'] },
  { id: 'blossom', name: { en: 'Blossom Breeze', tr: 'Çiçek Esintisi' }, color: '#e07aa5', visitors: ['sakura', 'bean'] },
];

// visiting cats: portrait art public/assets/r7/vis7_<id>.webp; tapping one in the café once a day gives `gift`
export const VISITORS = {
  maple: { name: 'Maple', line: { en: 'I brought a lantern for the stairs!', tr: 'Merdivenlere bir fener getirdim!' } },
  hazel: { name: 'Hazel', line: { en: 'Acorns are fancy hats, you know.', tr: 'Palamutlar şık birer şapkadır, biliyor musun?' } },
  pip: { name: 'Pip', line: { en: 'Cocoa for everyone! Mind the foam.', tr: 'Herkese kakao! Köpüğe dikkat.' } },
  frost: { name: 'Frost', line: { en: 'Brr... your café is so warm.', tr: 'Brr... kafen ne kadar sıcak.' } },
  sakura: { name: 'Sakura', line: { en: 'The petals followed me here!', tr: 'Yapraklar beni buraya kadar takip etti!' } },
  bean: { name: 'Bean', line: { en: 'Rain or shine, I visit!', tr: 'Yağmur da olsa güneş de olsa gelirim!' } },
};
export const VISIT_GIFT = { coins: 15 };

// resident requests: one new every REQ_EVERY_H hours, at most REQ_MAX waiting
export const REQ_KINDS = [
  { k: 'win', need: 2, coins: 30, hearts: 1 },
  { k: 'color', need: 9, coins: 25, hearts: 1 },
  { k: 'carrier', need: 8, coins: 25, hearts: 1 },
  { k: 'tidy', need: 1, coins: 40, hearts: 2 },
  { k: 'daily', need: 1, coins: 35, hearts: 2 },
];
export const SNACKS = [
  { en: 'a fish snack', tr: 'balık atıştırmalığı' },
  { en: 'warm milk', tr: 'ılık süt' },
  { en: 'a catnip cookie', tr: 'kedi nanesi kurabiyesi' },
  { en: 'a new yarn ball', tr: 'yeni bir yün yumağı' },
  { en: 'a tuna tart', tr: 'ton balıklı tart' },
];

// resident outfits, unlocked by affection hearts (pets, requests, treats); art res7_<id>_<outfit>.webp
export const OUTFITS = [
  { id: 'hat', need: 8, name: { en: 'Knit beanie', tr: 'Örgü bere' } },
  { id: 'scarf', need: 20, name: { en: 'Cosy scarf', tr: 'Sıcak atkı' } },
  { id: 'crown', need: 40, name: { en: 'Best-friend crown', tr: 'Can dostu tacı' } },
];

// Café Rush practice bots: clearly bots, never shown as people. Their times are simulated per week (live.rushBots).
export const RUSH_BOTS = ['Whisk', 'Tabby', 'Biscotti', 'Sprocket', 'Pounce', 'Gizmo', 'Noodle-9', 'Toast', 'Pixel', 'Muffin', 'Bolt', 'Sesame', 'Button', 'Waffle', 'Cog', 'Dot', 'Ziggy', 'Bean-0', 'Patch'];
export const RUSH_PRIZES = [
  { coins: 150, cup: 'gold' },
  { coins: 100, cup: 'silver' },
  { coins: 80, cup: 'bronze' },
];
export const RUSH_PRIZE_TOP10 = { coins: 40 };
export const RUSH_PRIZE_REST = { coins: 20 };
