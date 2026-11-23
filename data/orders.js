// Adoption orders (src/game/orders.js): every level is an order from a Cat Street shopkeeper who needs cats. A chapter
// of CHAPTER levels belongs to one shop, in street order, then the list starts over. Hard levels are Urgent orders (red
// tag, bonus coins), super-hard (boss) levels are VIP orders (gold tag, bigger bonus). Each first clear adopts one named
// cat into the shop's album set; a full set pays a reward. Deterministic: everything is seeded by the level number.
// Art: keeper_<shop>.webp (customer portrait), street_<shop>.webp (the shop), ord_basket / ord_vip / ord_urgent.webp.
export const CHAPTER = 10;
export const SHOP_ORDER = ['bakery', 'library', 'florist', 'tea', 'toy', 'music', 'fish', 'post', 'yarn'];
export const SET_SIZE = 5;
// a full set of adopted cats at one shop: the rewards alternate (set 1, 3, 5... and set 2, 4, 6...)
export const SET_REWARDS = [{ coins: 100 }, { coins: 60, scoop: 1 }];
// first-clear bonus on top of the hard / super-hard pay (shown on the win card as its own line)
export const BONUS = { hard: 15, boss: 40 };

// gen: the keeper's name in the TR genitive, by how it is said (Page'in, Crumb'ın); title: the keeper's job before the name; to: the shop as a destination (TR: possessive + dative, after the genitive
// name), at: where the cat lives now (TR: locative); why: one line of flavour, picked per level
export const CUSTOMERS = {
  bakery: {
    gen: "Crumb'ın", title: { en: 'Baker', tr: 'Fırıncı' }, to: { en: 'bakery', tr: 'fırınına' }, at: { en: 'the Bakery', tr: 'Fırında' },
    why: [
      { en: 'They will nap in the warm bread window.', tr: 'Sıcak ekmek vitrininde kestirecekler.' },
      { en: 'The croissants need taste-testers.', tr: 'Kruvasanları tadacak birileri lazım.' },
      { en: 'The flour sacks need guarding.', tr: 'Un çuvallarına bekçi lazım.' },
    ],
  },
  library: {
    gen: "Page'in", title: { en: 'Librarian', tr: 'Kütüphaneci' }, to: { en: 'library', tr: 'kütüphanesine' }, at: { en: 'the Library', tr: 'Kütüphanede' },
    why: [
      { en: 'Someone has to keep the books warm.', tr: 'Kitapları sıcak tutacak biri lazım.' },
      { en: 'Story time starts at noon.', tr: 'Masal saati öğlen başlıyor.' },
      { en: 'The reading nook feels empty.', tr: 'Okuma köşesi bomboş kaldı.' },
    ],
  },
  florist: {
    gen: "Petal'ın", title: { en: 'Florist', tr: 'Çiçekçi' }, to: { en: 'flower shop', tr: 'dükkânına' }, at: { en: 'the Flower Shop', tr: 'Çiçekçide' },
    why: [
      { en: 'The tulips want company.', tr: 'Laleler yalnız kalmak istemiyor.' },
      { en: 'Every flower box needs a cat.', tr: 'Her çiçek kasasına bir kedi lazım.' },
      { en: 'The rose arch needs nappers.', tr: 'Gül kemerinin altında uyuyacak kedi lazım.' },
    ],
  },
  tea: {
    gen: "Earl'ün", title: { en: 'Tea master', tr: 'Çaycı' }, to: { en: 'tea house', tr: 'çay evine' }, at: { en: 'the Tea House', tr: 'Çay Evinde' },
    why: [
      { en: 'Every cushion needs a guest.', tr: 'Her mindere bir misafir lazım.' },
      { en: 'The teapot is warm and waiting.', tr: 'Demlik sıcak, misafir bekliyor.' },
      { en: 'Afternoon tea starts soon.', tr: 'İkindi çayı birazdan başlıyor.' },
    ],
  },
  toy: {
    gen: "Bobbin'in", title: { en: 'Toymaker', tr: 'Oyuncakçı' }, to: { en: 'toy shop', tr: 'dükkânına' }, at: { en: 'the Toy Shop', tr: 'Oyuncakçıda' },
    why: [
      { en: 'The toy mice need testing.', tr: 'Oyuncak farelerin denenmesi lazım.' },
      { en: 'Yarn balls do not chase themselves.', tr: 'Yün yumakları kendi kendine kovalanmaz.' },
      { en: 'The window needs cuddly models.', tr: 'Vitrine tüylü mankenler lazım.' },
    ],
  },
  music: {
    gen: "Forte'nin", title: { en: 'Musician', tr: 'Müzisyen' }, to: { en: 'music shop', tr: 'müzik dükkânına' }, at: { en: 'the Music Shop', tr: 'Müzik Dükkânında' },
    why: [
      { en: 'The choir is missing a few voices.', tr: 'Koroda birkaç ses eksik.' },
      { en: 'Someone has to purr the bass line.', tr: 'Bas partisini mırlayacak biri lazım.' },
      { en: 'The piano bench is lonely.', tr: 'Piyano taburesi yapayalnız.' },
    ],
  },
  fish: {
    gen: "Gill'in", title: { en: 'Fishmonger', tr: 'Balıkçı' }, to: { en: 'fish market', tr: 'tezgâhına' }, at: { en: 'the Fish Market', tr: 'Balık Pazarında' },
    why: [
      { en: 'Fresh fish, hungry cats. Perfect.', tr: 'Taze balık, aç kediler. Tam isabet.' },
      { en: 'The ice counter needs supervisors.', tr: 'Buzlu tezgâha gözcü lazım.' },
      { en: 'Someone has to count the sardines.', tr: 'Sardalyaları sayacak biri lazım.' },
    ],
  },
  post: {
    gen: "Stamp'in", title: { en: 'Postmaster', tr: 'Postacı' }, to: { en: 'post office', tr: 'postanesine' }, at: { en: 'the Post Office', tr: 'Postanede' },
    why: [
      { en: 'Parcels need paw stamps.', tr: 'Kolilere pati mührü lazım.' },
      { en: 'The mailbags make great beds.', tr: 'Posta çuvalları harika yatak olur.' },
      { en: 'The letters are piling up.', tr: 'Mektuplar birikiyor.' },
    ],
  },
  yarn: {
    gen: "Purl'ün", title: { en: 'Knitter', tr: 'Örgücü' }, to: { en: 'yarn shop', tr: 'yün dükkânına' }, at: { en: 'the Yarn Shop', tr: 'Yün Dükkânında' },
    why: [
      { en: 'Every basket needs a cat inside.', tr: 'Her sepete bir kedi lazım.' },
      { en: 'Someone has to untangle this.', tr: 'Bu düğümü çözecek biri lazım.' },
      { en: 'The knitting chair is free.', tr: 'Örgü koltuğu boşta.' },
    ],
  },
};

// names of adopted cats (none of them a resident, keeper, apprentice or visitor name)
export const CAT_NAMES = [
  'Waffle', 'Pickle', 'Tofu', 'Ziggy', 'Paprika', 'Nacho', 'Olive', 'Mango', 'Peanut', 'Cinnamon',
  'Sushi', 'Pretzel', 'Bubbles', 'Cookie', 'Fig', 'Gnocchi', 'Jellybean', 'Kiwi', 'Latte', 'Marble',
  'Nutmeg', 'Poppy', 'Ravioli', 'Saffron', 'Taffy', 'Udon', 'Velvet', 'Wasabi', 'Yuzu', 'Zuzu',
  'Pistachio', 'Simit', 'Lokum', 'Fıstık', 'Pamuk', 'Boncuk', 'Tarçın', 'Dumpling', 'Sprinkles', 'Truffle',
  'Meringue', 'Hazelnut', 'Biscotti', 'Macaron', 'Churro', 'Tiramisu', 'Cupcake', 'Pancake',
];
