// R10 retention data (src/game/r10.js): the café photo album fed by a weekly pop-up event, the permanent Daily record,
// rotating resident jobs and friend results.

// ---- the album: 6 themed pages x 4 named postcards. Postcard i is the prize of pop-up week i (weeks cycle over 24).
// A postcard is a photo composed from game art: bg (a room or the street), mid (a shop façade, optional), fg (the cat).
// A full page unlocks its framed print (print_<n>.webp) to hang in a café room.
export const PAGES = [
  { id: 'cafe', name: { en: 'Café Days', tr: 'Kafe Günleri' }, print: 0 },
  { id: 'street', name: { en: 'Cat Street', tr: 'Kedi Sokağı' }, print: 1 },
  { id: 'visitors', name: { en: 'Visitors', tr: 'Misafirler' }, print: 2 },
  { id: 'little', name: { en: 'Little Ones', tr: 'Minikler' }, print: 5 },
  { id: 'dress', name: { en: 'Dress-up Days', tr: 'Şık Günler' }, print: 3 },
  { id: 'life', name: { en: 'Street Life', tr: 'Sokak Hayatı' }, print: 4 },
];
export const CARDS_PER_PAGE = 4;
const room = (a) => `room_${a}_bare`;
const st = 'street_bg';
// each week: the event's name, what it features (a shop or a resident), and its postcard
export const WEEKS = [
  { ev: { en: 'Counter Coffee Week', tr: 'Tezgah Kahvesi Haftası' }, card: { en: "Mochi's Morning Shift", tr: 'Mochi Sabah Mesaisinde' }, bg: room('counter'), fg: 'res7_mochi_job' },
  { ev: { en: 'Baking Week', tr: 'Hamur İşi Haftası' }, card: { en: 'Biscuit Bakes', tr: 'Biscuit Pasta Yapıyor' }, bg: room('counter'), fg: 'res7_biscuit_job' },
  { ev: { en: 'Sunny Window Week', tr: 'Güneşli Pencere Haftası' }, card: { en: 'Luna at the Window', tr: 'Luna Pencerede' }, bg: room('window'), fg: 'res7_luna_idle' },
  { ev: { en: 'Nap Week', tr: 'Şekerleme Haftası' }, card: { en: "Noodle's Long Nap", tr: 'Noodle Uzun Uykuda' }, bg: room('cushion'), fg: 'res7_noodle_idle' },
  { ev: { en: 'Bakery Bread Week', tr: 'Fırın Ekmek Haftası' }, card: { en: "Crumb's Fresh Loaves", tr: 'Crumb Taze Ekmekte' }, bg: st, mid: 'street_bakery', fg: 'keeper_bakery' },
  { ev: { en: 'Library Reading Week', tr: 'Kütüphane Okuma Haftası' }, card: { en: "Page's Reading Hour", tr: 'Page Okuma Saatinde' }, bg: st, mid: 'street_library', fg: 'keeper_library' },
  { ev: { en: 'Flower Market Week', tr: 'Çiçek Pazarı Haftası' }, card: { en: "Petal's Tulips", tr: 'Petal Lalelerle' }, bg: st, mid: 'street_florist', fg: 'keeper_florist' },
  { ev: { en: 'Tea Time Week', tr: 'Çay Saati Haftası' }, card: { en: "Earl's Tea Party", tr: 'Earl Çay Partisinde' }, bg: st, mid: 'street_tea', fg: 'keeper_tea' },
  { ev: { en: 'Lantern Week', tr: 'Fener Haftası' }, card: { en: "Maple's Lantern", tr: 'Maple Fenerle' }, bg: room('window'), fg: 'vis7_maple' },
  { ev: { en: 'Cocoa Week', tr: 'Kakao Haftası' }, card: { en: "Pip's Cocoa", tr: 'Pip Kakaoyla' }, bg: room('counter'), fg: 'vis7_pip' },
  { ev: { en: 'Blossom Week', tr: 'Çiçek Açma Haftası' }, card: { en: "Sakura's Petals", tr: 'Sakura Yapraklarla' }, bg: room('patio'), fg: 'vis7_sakura' },
  { ev: { en: 'Snowflake Week', tr: 'Kar Tanesi Haftası' }, card: { en: "Frost's Snowy Visit", tr: 'Frost Karlı Ziyarette' }, bg: room('rooftop'), fg: 'vis7_frost' },
  { ev: { en: 'Little Bakers Week', tr: 'Minik Fırıncılar Haftası' }, card: { en: "Bun's First Roll", tr: 'Bun İlk Çöreğinde' }, bg: st, mid: 'street_bakery', fg: 'appr_bakery' },
  { ev: { en: 'Story Week', tr: 'Masal Haftası' }, card: { en: 'Dewey Reads Aloud', tr: 'Dewey Sesli Okuyor' }, bg: st, mid: 'street_library', fg: 'appr_library' },
  { ev: { en: 'Garden Week', tr: 'Bahçe Haftası' }, card: { en: "Sprout's Watering Can", tr: 'Sprout Sulama Kabıyla' }, bg: st, mid: 'street_florist', fg: 'appr_florist' },
  { ev: { en: 'Drum Week', tr: 'Davul Haftası' }, card: { en: "Tempo's Drum", tr: 'Tempo Davulunda' }, bg: st, mid: 'street_music', fg: 'appr_music' },
  { ev: { en: 'Cosy Knit Week', tr: 'Sıcak Örgü Haftası' }, card: { en: "Pudding's Beanie", tr: 'Pudding Beresiyle' }, bg: room('window'), fg: 'res7_pudding_hat' },
  { ev: { en: 'Scarf Week', tr: 'Atkı Haftası' }, card: { en: "Pepper's Scarf", tr: 'Pepper Atkısıyla' }, bg: room('patio'), fg: 'res7_pepper_scarf' },
  { ev: { en: 'Royal Week', tr: 'Kraliyet Haftası' }, card: { en: "Clover's Crown", tr: 'Clover Tacıyla' }, bg: room('patio'), fg: 'res7_clover_crown' },
  { ev: { en: 'Rooftop Week', tr: 'Çatı Katı Haftası' }, card: { en: "Captain's Beanie", tr: 'Captain Beresiyle' }, bg: room('rooftop'), fg: 'res7_captain_hat' },
  { ev: { en: 'Toy Shop Week', tr: 'Oyuncakçı Haftası' }, card: { en: "Bobbin's Toy Day", tr: 'Bobbin Oyuncak Gününde' }, bg: st, mid: 'street_toy', fg: 'keeper_toy' },
  { ev: { en: 'Concert Week', tr: 'Konser Haftası' }, card: { en: "Forte's Concert", tr: 'Forte Konserde' }, bg: st, mid: 'street_music', fg: 'keeper_music' },
  { ev: { en: 'Acorn Week', tr: 'Palamut Haftası' }, card: { en: "Hazel's Acorns", tr: 'Hazel Palamutlarla' }, bg: room('patio'), fg: 'vis7_hazel' },
  { ev: { en: 'Sugar Cube Week', tr: 'Kesme Şeker Haftası' }, card: { en: "Sugar's Teacup", tr: 'Sugar Fincanında' }, bg: st, mid: 'street_tea', fg: 'appr_tea' },
];
// the pop-up: 1 stamp from each event board (the week's two Cat Show boards) and 1 from the first Daily clear that week;
// 3 stamps pay the postcard and POP_COINS while the week runs. A missed postcard can be caught up from the archive
// (both of its boards cleared), at most one a week, without the coins.
export const POP_STAMPS = 3;
export const POP_COINS = 60;

// ---- the permanent Daily record: total Daily clears (each date once), milestone rewards ----
// art: drec_frame.webp (a gold frame on the resident portraits), drec_pennant.webp + drec_clock.webp (in the café)
export const DREC = [
  { at: 7, reward: { hint: 1 } },
  { at: 14, reward: { undo: 1 } },
  { at: 30, item: 'frame', name: { en: 'Golden portrait frame', tr: 'Altın portre çerçevesi' } },
  { at: 60, item: 'pennant', name: { en: 'Café pennant', tr: 'Kafe flaması' } },
  { at: 90, item: 'clock', name: { en: 'Cat wall clock', tr: 'Kedili duvar saati' } },
];

// ---- resident jobs: 2 a day from a 14-day rotation; the first one finished pays JOB_REWARD (+1 heart to that cat) ----
// k: win | cat | carrier | tidy (the hooks the resident requests already count)
export const JOB_ROT = [
  [{ k: 'carrier', need: 6 }, { k: 'tidy', need: 1 }],
  [{ k: 'win', need: 3 }, { k: 'cat', need: 30 }],
  [{ k: 'tidy', need: 1 }, { k: 'carrier', need: 8 }],
  [{ k: 'cat', need: 24 }, { k: 'win', need: 2 }],
  [{ k: 'carrier', need: 10 }, { k: 'win', need: 3 }],
  [{ k: 'win', need: 4 }, { k: 'tidy', need: 1 }],
  [{ k: 'tidy', need: 2 }, { k: 'cat', need: 36 }],
  [{ k: 'cat', need: 30 }, { k: 'carrier', need: 6 }],
  [{ k: 'carrier', need: 8 }, { k: 'tidy', need: 1 }],
  [{ k: 'win', need: 2 }, { k: 'carrier', need: 10 }],
  [{ k: 'tidy', need: 1 }, { k: 'win', need: 3 }],
  [{ k: 'cat', need: 40 }, { k: 'tidy', need: 2 }],
  [{ k: 'carrier', need: 12 }, { k: 'cat', need: 24 }],
  [{ k: 'win', need: 5 }, { k: 'carrier', need: 6 }],
];
export const JOB_REWARD = { coins: 30, hearts: 1 };

// ---- friend results: the latest replies kept on this browser ----
export const FRIENDS_MAX = 12;
export const SENT_MAX = 30;
