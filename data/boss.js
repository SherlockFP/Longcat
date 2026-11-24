// Boss lane (src/game/boss.js rules, src/ui/boss.js view): every 20th level is a Big Boss Cat who wants a giant order.
// 12 named bosses rotate (one per 20-level chapter); four painted portraits (public/assets/r7/boss_<art>.webp), each
// worn by three bosses with its own tint (CSS filter) and a little accessory drawn on top.
// (which levels: src/core/generate.js isBossLevel)

// art: the portrait; tint: a CSS filter over it; acc: the accessory badge (src/ui/boss.js ACC); hue: the HP bar colour
export const BOSSES = [
  { id: 'duke', art: 'duke', tint: '', acc: '', hue: '#d9443a', name: { en: 'Duke Fluffington', tr: 'Dük Pofuduk' } },
  { id: 'pirate', art: 'pirate', tint: '', acc: '', hue: '#d9443a', name: { en: 'Captain Whiskerbeard', tr: 'Kaptan Bıyıksakal' } },
  { id: 'chef', art: 'chef', tint: '', acc: '', hue: '#d9443a', name: { en: 'Chef Purrcini', tr: 'Şef Mırçini' } },
  { id: 'wizard', art: 'wizard', tint: '', acc: '', hue: '#d9443a', name: { en: 'Merlin Meowmore', tr: 'Büyücü Miyavmor' } },
  { id: 'baroness', art: 'duke', tint: 'hue-rotate(300deg) saturate(1.2)', acc: 'bow', hue: '#c2408f', name: { en: 'Baroness Biscuit', tr: 'Barones Bisküvi' } },
  { id: 'admiral', art: 'pirate', tint: 'hue-rotate(190deg) saturate(.9)', acc: 'star', hue: '#3b78c4', name: { en: 'Admiral Sardine', tr: 'Amiral Sardalya' } },
  { id: 'meringue', art: 'chef', tint: 'hue-rotate(320deg) saturate(1.3)', acc: 'bow', hue: '#d65a9a', name: { en: 'Madame Meringue', tr: 'Madam Beze' } },
  { id: 'nightpaw', art: 'wizard', tint: 'hue-rotate(200deg) brightness(.9)', acc: 'moon', hue: '#5a55c8', name: { en: 'Professor Nightpaw', tr: 'Profesör Gecepati' } },
  { id: 'chonk', art: 'duke', tint: 'hue-rotate(80deg) saturate(1.1)', acc: 'crown', hue: '#3f9a52', name: { en: 'Lord Chonkington', tr: 'Lord Tombulyan' } },
  { id: 'salty', art: 'pirate', tint: 'hue-rotate(120deg) saturate(.85)', acc: 'crown', hue: '#2f9a8c', name: { en: 'Salty Sal', tr: 'Tuzlu Sal' } },
  { id: 'crumbs', art: 'chef', tint: 'sepia(.5) hue-rotate(-10deg) saturate(1.4)', acc: 'star', hue: '#c9822c', name: { en: 'Sir Crumbsworth', tr: 'Sör Kırıntı' } },
  { id: 'moonbeam', art: 'wizard', tint: 'hue-rotate(60deg) saturate(1.2)', acc: 'crown', hue: '#b0912a', name: { en: 'Empress Moonbeam', tr: 'İmparatoriçe Ayışığı' } },
];
// R13: the first session ends on a mini boss (L10, src/game/boss.js MINI): a little chef with his own lines
// (R14: its own kitten portrait boss_muffin; L20's Duke follows right after, the big chef boss is L60)
export const MINI_BOSS = { id: 'muffin', art: 'muffin', hue: '#e8590c', name: { en: 'Little Chef Muffin', tr: 'Minik Şef Muffin' },
  taunt: { en: 'My little order is BIG!', tr: 'Minik siparişim KOCAMAN!' }, defeat: { en: 'Fine! Take my first treasure!', tr: 'Peki! İlk hazinem senin olsun!' } };

// what a boss says: on the intro card (taunt), at 75 / 50 / 25% HP (hurt), when beaten (defeat)
export const TAUNTS = [
  { en: 'Not one cat less!', tr: 'Bir kedi bile eksik olmasın!' },
  { en: 'My cushions demand cats!', tr: 'Minderlerim kedi istiyor!' },
  { en: 'You will never fill my order!', tr: 'Siparişimi asla dolduramazsın!' },
  { en: 'Bring them all. Now!', tr: 'Hepsini getir. Hemen!' },
];
export const HURT = [
  { en: 'Hmph!', tr: 'Hıh!' },
  { en: 'Ouch, my whiskers!', tr: 'Ay, bıyıklarım!' },
  { en: 'No fair!', tr: 'Bu haksızlık!' },
];
export const DEFEAT = [
  { en: 'Fine, fine! Take my treasure!', tr: 'Peki peki! Hazinem senin olsun!' },
  { en: 'I give up! Here, take the chest!', tr: 'Pes ediyorum! Al şu sandığı!' },
  { en: 'You win... this time!', tr: 'Kazandın... bu seferlik!' },
];

// map chapters past the 12 named stops (data/hub.js CHAPTERS): an adjective + a place, every pair different for 144
// chapters (1440 levels), then the list starts over; Turkish reads as adjective + noun with no suffix needed
export const CH_ADJ = [
  { en: 'Misty', tr: 'Sisli' }, { en: 'Golden', tr: 'Altın' }, { en: 'Velvet', tr: 'Kadife' }, { en: 'Whiskery', tr: 'Bıyıklı' },
  { en: 'Cosy', tr: 'Sıcacık' }, { en: 'Starlit', tr: 'Yıldızlı' }, { en: 'Honey', tr: 'Ballı' }, { en: 'Breezy', tr: 'Esintili' },
  { en: 'Purring', tr: 'Mırıltılı' }, { en: 'Sleepy', tr: 'Uykulu' }, { en: 'Copper', tr: 'Bakır' }, { en: 'Cotton', tr: 'Pamuk' },
];
export const CH_PLACE = [
  { en: 'Meadow', tr: 'Çayır' }, { en: 'Harbour', tr: 'Liman' }, { en: 'Slope', tr: 'Yokuş' }, { en: 'Bridge', tr: 'Köprü' },
  { en: 'Garden', tr: 'Bahçe' }, { en: 'Square', tr: 'Meydan' }, { en: 'Grove', tr: 'Koru' }, { en: 'Pier', tr: 'İskele' },
  { en: 'Market', tr: 'Pazar' }, { en: 'Hill', tr: 'Tepe' }, { en: 'Valley', tr: 'Vadi' }, { en: 'Bazaar', tr: 'Çarşı' },
];

// ---- chests ----
// milestone (every 5th level, not a boss level): a small wooden chest
export const WOOD = { coins: 30, step: 5, cap: 50, boosters: ['hint', 'undo', 'hint', 'scoop'] };
// boss chest: coins grow with the boss index; the tier (common / rare / epic) is fixed per boss index
export const BOSS_CHEST = { coins: 80, step: 5, cap: 150, rareCoins: 100, epicCoins: 250 };
