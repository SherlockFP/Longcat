// Content packs past L60 (src/core/content-mech.js, src/game/content.js, src/ui/content.js): 20-level themed packs, each
// with a host cat who moves into the café when the pack is cleared. The first lap brings the two new mechanics in
// gently (spring cats in Rainy Day, swivel beds in Bakery Rush); later laps reuse the four themes without new lessons.
// Art: public/assets/r7/vis7_<host>.webp (portrait), bg_<theme>.webp (the play-room background of the pack).
export const PACK_FROM = 61;
export const PACK_LEN = 20;

// mech: what each slot of the pack asks the generator for (i = 0..19 inside the pack). 'teach' = the lesson level
// (generate.js TEACH), 'solo' = only the new piece, 'pair' = the new piece plus one older one, null = the usual mix.
export const PACKS = [
  {
    id: 'rainy', theme: 'rainy', host: 'drizzle', teach: 'spring', color: '#4f86b8',
    name: { en: 'Rainy Day', tr: 'Yağmurlu Gün' },
    blurb: { en: 'Puddles, paper boats and cats who bounce.', tr: 'Su birikintileri, kâğıt kayıklar ve zıplayan kediler.' },
  },
  {
    id: 'bakery', theme: 'bakery', host: 'brioche', teach: 'swivel', color: '#d9873a',
    name: { en: 'Bakery Rush', tr: 'Fırın Telaşı' },
    blurb: { en: 'Warm bread and beds that turn.', tr: 'Sıcak ekmek ve dönen yataklar.' },
  },
  {
    id: 'garden', theme: 'garden', host: 'fern', teach: null, color: '#5aa35a',
    name: { en: 'Garden Party', tr: 'Bahçe Partisi' },
    blurb: { en: 'Springs and swivels, all on one lawn.', tr: 'Yaylar ve dönen yataklar aynı çimende.' },
  },
  {
    id: 'starry', theme: 'starry', host: 'comet', teach: null, color: '#5b5fb8',
    name: { en: 'Starry Night', tr: 'Yıldızlı Gece' },
    blurb: { en: 'Every trick you know, under the stars.', tr: 'Bildiğin her numara, yıldızların altında.' },
  },
];

// the hosts: residents who move in when their pack is cleared (shown in the café like the visiting cats)
export const HOSTS = {
  drizzle: {
    name: 'Drizzle',
    line: { en: 'Every puddle is a tiny lake. I checked them all.', tr: 'Her su birikintisi minik bir göldür. Hepsine baktım.' },
    bio: { en: 'Folds paper boats and races them down the gutter. Has never lost a race to a leaf.', tr: 'Kâğıttan kayık katlar, oluktan aşağı yarıştırır. Bir yaprağa hiç yenilmedi.' },
  },
  brioche: {
    name: 'Brioche',
    line: { en: 'Up at four to knead the dough. Napping by five past.', tr: 'Hamur yoğurmak için dörtte kalkarım. Dördü beş geçe uyurum.' },
    bio: { en: 'Bakes one croissant a day and guards it with great care. Sometimes shares the crumbs.', tr: 'Günde bir kruvasan pişirir ve onu özenle korur. Bazen kırıntıları paylaşır.' },
  },
  fern: {
    name: 'Fern',
    line: { en: 'The snails are late again. They are always late.', tr: 'Salyangozlar yine gecikti. Hep gecikirler.' },
    bio: { en: 'Throws a garden party every Sunday. The guest list is mostly snails and one shy hedgehog.', tr: 'Her pazar bahçe partisi verir. Davetlilerin çoğu salyangoz, bir de utangaç bir kirpi.' },
  },
  comet: {
    name: 'Comet',
    line: { en: 'One star, two stars... I always fall asleep at seven.', tr: 'Bir yıldız, iki yıldız... Hep yedide uyuyakalırım.' },
    bio: { en: 'Counts the stars from the rooftop every night. Keeps a little brass telescope polished just in case.', tr: 'Her gece çatıdan yıldızları sayar. Ne olur ne olmaz diye pirinç dürbününü hep parlatır.' },
  },
};

export const PACK_REWARD = { coins: 150, hint: 1 }; // a cleared pack (its last level, first clear)
export const PACK_REWARD_LAP = { coins: 100 }; // later laps: the host already lives in the café

// the pack rooms: wash = colour over the pack's painted room (stronger, `bare`, over the sunny room when the art is
// missing), fx = the ambient effect along the wall strip
export const THEMES = {
  rainy: { wash: 'rgba(70,110,150,0.10)', bare: 'rgba(70,110,150,0.18)', fx: 'rain' },
  bakery: { wash: '', bare: 'rgba(255,170,90,0.12)', fx: 'flour' },
  garden: { wash: '', bare: 'rgba(120,190,110,0.12)', fx: 'petals' },
  starry: { wash: 'rgba(30,40,90,0.16)', bare: 'rgba(30,40,90,0.26)', fx: 'stars' },
};
