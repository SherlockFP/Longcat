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

// ---- R10: Cat Street past the second lap (src/game/street.js unit()) ----
// Lap 3: no new houses. Each of the six shops gets 3 visible upgrades on its façade (2, 2 and 3 stars): a bunting
// garland, a window planter, then the shop's own signature piece beside the door (art: up_bunting.webp, up_planter.webp,
// up_<shop>.webp). Then three new shop kinds open with new keepers (street_<id>.webp, keeper_<id>.webp). After that every
// lap is a remix: each of the nine shops is repainted (a colour variant), dressed for a festival and gets a guest who
// moves in for the lap, so a lap never repeats the one before it.
export const UP_SHARED = [
  { id: 'bunting', name: { en: 'Bunting garland', tr: 'Flama süsü' }, cost: 2 },
  { id: 'planter', name: { en: 'Window planter', tr: 'Pencere saksısı' }, cost: 2 },
];
export const UP_SIGN = {
  bakery: { en: 'Bread cart', tr: 'Ekmek arabası' },
  library: { en: 'Reading lamp', tr: 'Okuma lambası' },
  florist: { en: 'Flower cart', tr: 'Çiçek arabası' },
  tea: { en: 'Garden tea table', tr: 'Bahçe çay masası' },
  toy: { en: 'Pinwheel toy stand', tr: 'Fırıldaklı oyuncak tezgahı' },
  music: { en: 'Busker stage', tr: 'Sokak sahnesi' },
};
export const UP_SIGN_COST = 3;
export const UP_REWARD = { coins: 120, hint: 1 };
export const SHOPS_NEW = [
  {
    id: 'fish', name: { en: 'Fish Market', tr: 'Balık Pazarı' },
    keeper: { name: 'Gill', line: { en: 'Fresh this morning. Mostly.', tr: 'Bu sabah tutuldu. Çoğu yani.' } },
    own: [{ en: 'Fish crates', tr: 'Balık kasaları' }, { en: 'Ice counter', tr: 'Buzlu tezgah' }, { en: 'Striped awning', tr: 'Çizgili tente' }],
  },
  {
    id: 'post', name: { en: 'Post Office', tr: 'Postane' },
    keeper: { name: 'Stamp', line: { en: 'Every letter gets there. Every paw print too.', tr: 'Her mektup yerine ulaşır. Her pati izi de.' } },
    own: [{ en: 'Red mailbox', tr: 'Kırmızı posta kutusu' }, { en: 'Parcel shelves', tr: 'Koli rafları' }, { en: 'Clock over the door', tr: 'Kapı üstü saat' }],
  },
  {
    id: 'yarn', name: { en: 'Yarn Shop', tr: 'Yün Dükkanı' },
    keeper: { name: 'Purl', line: { en: 'Knit one, nap two.', tr: 'Bir ilmek ör, iki kere uyu.' } },
    own: [{ en: 'Yarn baskets', tr: 'Yün sepetleri' }, { en: 'Knitting chair', tr: 'Örgü koltuğu' }, { en: 'Knitted bunting', tr: 'Örgü flamalar' }],
  },
];
export const NEW_REWARD = { coins: 200, scoop: 1, hint: 1 };
// remix laps: a festival look (CSS hue turn of the façade + one decoration) and a guest of the lap (a visitor or an
// apprentice art already in the game). Nine shops x these themes; the guest list is offset per lap so pairs rotate.
export const REMIX = [
  { id: 'lights', name: { en: 'Evening Lights', tr: 'Akşam Işıkları' }, hue: 0, sat: 1.1, deco: 'lights' },
  { id: 'mint', name: { en: 'Mint Paint', tr: 'Nane Boyası' }, hue: 120, sat: 1, deco: 'bunting' },
  { id: 'lantern', name: { en: 'Lantern Fair', tr: 'Fener Panayırı' }, hue: -25, sat: 1.15, deco: 'reno_lantern_garland' },
  { id: 'snow', name: { en: 'Snow Day', tr: 'Kar Günü' }, hue: 190, sat: 0.75, deco: 'reno_cocoa_garland' },
  { id: 'blossom', name: { en: 'Blossom Week', tr: 'Çiçek Haftası' }, hue: 300, sat: 0.95, deco: 'reno_blossom_garland' },
  { id: 'sunny', name: { en: 'Sunny Paint', tr: 'Güneş Boyası' }, hue: 40, sat: 1.2, deco: 'planter' },
];
export const REMIX_TASKS = [
  { en: 'Fresh paint', tr: 'Taze boya' },
  { en: 'Festival decorations', tr: 'Şenlik süsleri' },
  { en: 'Guest room', tr: 'Misafir odası' },
  { en: 'Street party', tr: 'Sokak şenliği' },
];
export const REMIX_COST = 3;
export const REMIX_REWARD = { coins: 150, scoop: 1 };
// guests of a remix lap: visiting cats (vis7_<id>) and apprentices (appr_<id>)
export const REMIX_GUESTS = [
  { art: 'vis7_maple', name: 'Maple' }, { art: 'appr_bakery', name: 'Bun' }, { art: 'vis7_pip', name: 'Pip' },
  { art: 'appr_library', name: 'Dewey' }, { art: 'vis7_sakura', name: 'Sakura' }, { art: 'appr_florist', name: 'Sprout' },
  { art: 'vis7_hazel', name: 'Hazel' }, { art: 'appr_tea', name: 'Sugar' }, { art: 'vis7_frost', name: 'Frost' },
  { art: 'appr_toy', name: 'Button' }, { art: 'vis7_bean', name: 'Bean' }, { art: 'appr_music', name: 'Tempo' },
];
