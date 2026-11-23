// Cat Street (src/game/street.js): the chapters past the cat house rooftop. Shop houses are built one after another
// in this order; past the last one the list starts a new lap ("Bakery 2", ...), a little dearer, so it never ends.
// Art: public/assets/r7/street_<id>.webp (exterior), keeper_<id>.webp (the shopkeeper who moves in), appr_<id>.webp (the
// keeper's kitten apprentice: the first repeat lap brings one per shop, so lap 2 changes what the street shows).
export const HOUSE_TASKS = 8;
// tasks 0-3 and 7 are the same for every house; 4-6 are the shop's own pieces
export const COMMON = [
  { en: 'Foundation', tr: 'Temel' },
  { en: 'Brick walls', tr: 'Tuğla duvarlar' },
  { en: 'Front door', tr: 'Ön kapı' },
  { en: 'Windows', tr: 'Pencereler' },
  null, null, null,
  { en: 'Roof and chimney', tr: 'Çatı ve baca' },
];
export const SHOPS = [
  {
    id: 'bakery', name: { en: 'Bakery', tr: 'Fırın' },
    apprentice: { name: 'Bun', line: { en: 'I kneaded this one myself! It is mostly paws.', tr: 'Bunu kendim yoğurdum! Çoğu pati izi.' } },
    keeper: { name: 'Crumb', line: { en: 'Fresh bread for every cat on the street!', tr: 'Sokaktaki her kediye taze ekmek!' } },
    own: [{ en: 'Bread oven', tr: 'Ekmek fırını' }, { en: 'Bread shelves', tr: 'Ekmek rafları' }, { en: 'Peach awning', tr: 'Şeftali rengi tente' }],
  },
  {
    id: 'library', name: { en: 'Library', tr: 'Kütüphane' },
    apprentice: { name: 'Dewey', line: { en: 'I read a whole page today. Out loud!', tr: 'Bugün koca bir sayfa okudum. Sesli!' } },
    keeper: { name: 'Page', line: { en: 'Shh... the books are napping.', tr: 'Şşt... kitaplar uyuyor.' } },
    own: [{ en: 'Bookshelves', tr: 'Kitap rafları' }, { en: 'Reading nook', tr: 'Okuma köşesi' }, { en: 'Reading lamp', tr: 'Okuma lambası' }],
  },
  {
    id: 'florist', name: { en: 'Flower Shop', tr: 'Çiçekçi' },
    apprentice: { name: 'Sprout', line: { en: 'I watered everything. Twice. Even the cat.', tr: 'Her şeyi suladım. İki kere. Kediyi bile.' } },
    keeper: { name: 'Petal', line: { en: 'A tulip for you, and one for me.', tr: 'Bir lale sana, bir lale bana.' } },
    own: [{ en: 'Flower boxes', tr: 'Çiçek kasaları' }, { en: 'Rose arch', tr: 'Gül kemeri' }, { en: 'Green awning', tr: 'Yeşil tente' }],
  },
  {
    id: 'tea', name: { en: 'Tea House', tr: 'Çay Evi' },
    apprentice: { name: 'Sugar', line: { en: 'One lump or seven?', tr: 'Bir şeker mi, yedi mi?' } },
    keeper: { name: 'Earl', line: { en: 'Milk first? Fish first!', tr: 'Önce süt mü? Önce balık!' } },
    own: [{ en: 'Paper lanterns', tr: 'Kâğıt fenerler' }, { en: 'Tea counter', tr: 'Çay tezgahı' }, { en: 'Teapot sign', tr: 'Demlik tabelası' }],
  },
  {
    id: 'toy', name: { en: 'Toy Shop', tr: 'Oyuncakçı' },
    apprentice: { name: 'Button', line: { en: 'This mouse squeaks too. I checked. A lot.', tr: 'Bu fare de ciyaklıyor. Denedim. Çok.' } },
    keeper: { name: 'Bobbin', line: { en: 'Every mouse here squeaks. I checked.', tr: 'Buradaki her fare ciyaklıyor. Denedim.' } },
    own: [{ en: 'Yarn display', tr: 'Yün yumağı vitrini' }, { en: 'Toy mouse shelf', tr: 'Oyuncak fare rafı' }, { en: 'Yellow awning', tr: 'Sarı tente' }],
  },
  {
    id: 'music', name: { en: 'Music Shop', tr: 'Müzik Dükkanı' },
    apprentice: { name: 'Tempo', line: { en: 'Ba-dum-tss... meow!', tr: 'Ba-dum-tıss... miyav!' } },
    keeper: { name: 'Forte', line: { en: 'Purr in C major, please.', tr: 'Do majörde mırla lütfen.' } },
    own: [{ en: 'Gramophone', tr: 'Gramofon' }, { en: 'Little piano', tr: 'Küçük piyano' }, { en: 'Music stand', tr: 'Nota sehpası' }],
  },
];
// stars per task: 2 (3 for the last two pieces), +1 from the 4th house on (a house is ~5 days of play then)
export const taskCost = (house, i) => 2 + (i >= HOUSE_TASKS - 2 ? 1 : 0) + Math.min(1, Math.floor(house / 3));
export const HOUSE_REWARD = { coins: 200, scoop: 1, hint: 1 };

// Renovation: a finished cat-house room can be restyled with a theme set (garland + rug), one per season.
// Art: reno_<id>_garland.webp, reno_<id>_rug.webp. The current season's set is featured.
export const RENO = [
  { id: 'lantern', name: { en: 'Autumn Lanterns', tr: 'Sonbahar Fenerleri' }, cost: 5 },
  { id: 'cocoa', name: { en: 'Cocoa Snow', tr: 'Kakaolu Kar' }, cost: 5 },
  { id: 'blossom', name: { en: 'Blossom Breeze', tr: 'Çiçek Esintisi' }, cost: 5 },
];
