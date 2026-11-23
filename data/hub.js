// Home level map (src/ui/hub.js): the road is cut into chapters of CHAPTER_LEN levels; each chapter is a stop of the cat
// town with its own signpost. Names cycle after the list ends (the chapter number keeps counting).
export const CHAPTER_LEN = 10;
export const CHAPTERS = [
  { en: 'Sunny Doorstep', tr: 'Güneşli Eşik' },
  { en: 'Yarn Lane', tr: 'Yumak Sokağı' },
  { en: 'Cushion Hill', tr: 'Minder Tepesi' },
  { en: 'Tea Garden', tr: 'Çay Bahçesi' },
  { en: 'Fish Market', tr: 'Balık Pazarı' },
  { en: 'Bakery Corner', tr: 'Fırın Köşesi' },
  { en: 'Library Steps', tr: 'Kütüphane Merdiveni' },
  { en: 'Flower Row', tr: 'Çiçekçiler Sırası' },
  { en: 'Toy Square', tr: 'Oyuncak Meydanı' },
  { en: 'Music Park', tr: 'Müzik Parkı' },
  { en: 'Lantern Bridge', tr: 'Fener Köprüsü' },
  { en: 'Moon Roof', tr: 'Ay Çatısı' },
];
// garden props along the road (public/assets/r7/map_prop_*.webp), picked by a hash of the level
export const PROPS = ['fern', 'basket', 'lamp', 'bush', 'bowl', 'mailbox'];
