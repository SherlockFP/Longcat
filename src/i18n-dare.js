// EN + TR strings for the share clip and friend challenges (src/kit/clip.js, src/kit/dare.js).
import { addStrings } from './i18n.js';

addStrings({
  en: {
    // the clip (captions read with sound off)
    clipChain: 'CHAIN', clipBench: '{u} of {n} seats taken!', clipOneSeat: 'Only ONE seat left!', clipCan: 'Can you beat it?', clipLink: 'Play this exact board:',
    clipClear: 'Board cleared!', clipNoBench: 'Not one cat parked!',
    // the win card
    shareClipBtn: 'Share clip', shareDareBtn: 'Dare a friend', shareNudge: 'Show a friend!', clipSavedLink: 'Clip saved and link copied: paste the link next to the clip',
    // what the share sheet says
    shareDareChain: 'Beat my chain x{c} on {board}!', shareDareChainMatch: 'Match my chain x{c} on {board}! It is the best this board allows.', shareDareSeats: 'I cleared {board} using only {c} seats. Can you?',
    shareDareNoBench: 'I cleared {board} without parking a single cat. Can you?', shareDareTime: 'Beat my {t}s on {board}!',
    // the landing card of a challenge link
    dareTitle: 'Friend challenge', dareFrom: '{name} dares you!', dareFriend: 'Your friend', dareWho: "your friend's",
    dareGoalChain: 'Beat a chain x{n}', dareGoalChainMatch: 'Match a chain x{n}', dareGoalSeats: 'Clear it using {n} seats or fewer', dareGoalNoBench: 'Clear it without parking a cat', dareGoalTime: 'Clear it faster than {t}s',
    dareBoard: '{board} · {n} seats', dareHow: 'Tap a cat to send it. Only the front carrier boards. The others wait on cushions.',
    dareTeach: 'Only the front carrier boards. The others wait on cushions.', teachBoards: 'Boards here', teachWaits: 'Waits here',
    dareLinkTitle: 'Send the dare link too', dareLinkBtn: 'Send link',
    clipSaved: 'Clip saved!', copyLinkBtn: 'Copy challenge link', linkCopied: 'Link copied!', copyHold: 'Press and hold the link to copy it',
    darePlay: 'Play', dareSkip: 'Not now', dareBack: 'Dare them back', dareContinue: 'Continue',
    // the back-and-forth (r11): both scores, the round, the thread of earlier runs, the reply share texts
    dareTieBtn: 'I matched it! Send', dareSendResult: 'Send result', dareRound: 'Round {n}', dareYourTurn: 'Your turn', dareYou: 'You',
    dareName: 'Your name', dareNameHint: 'optional, shown in your reply',
    valSeats: '{n} seats', valTime: '{t}s',
    backBeat: 'Round {r} on {board}: you got {pv}, I got {v}. Your move!', backTie: 'Round {r} on {board}: I matched your {pv}. Your move!', backMiss: 'Round {r} on {board}: you got {pv}, I got {v}. Rematch me!',
    // share moments: each featured win has its own headline
    momFirst3: 'Your first chain x{n}!', momBest: 'New best: chain x{n}!', momSweep: 'Clean sweep: no cat waited!', momDaily: "Today's Daily: cleared!", momGold: 'Gold medal!', momRush: 'Café Rush top 3!',
    // the share sheet where the browser has none of its own
    ssCopied: 'Link copied! Paste it in any chat.', ssCopy: 'Copy the link and send it to a friend.', ssSaveClip: 'Save clip', ssSaveCard: 'Save picture', ssDone: 'Done',
    // house / street share card
    shareHouse: 'Share', cardFloor: '{name} is open!', cardFloorSub: 'My Cat House has {n} floors now', cardHouseDone: 'My Cat House is done!', cardShop: '{place} opened on my Cat Street!', cardShopSub: '{n} shops open on Cat Street', cardShopSub1: 'The first shop on Cat Street',
    cardCta: 'Play free in your browser:', shareHouseText: 'Look what I built in Long Cat Out! {title}', cardSaved: 'Picture saved and link copied',
    // the result
    dare_beat_chain: 'You beat {who} chain x{n}!', dare_tie_chain: 'You matched {who} chain x{n}!', dare_miss_chain: 'So close: x{v} vs {who} x{n}',
    dare_beat_seats: 'You beat {who} {n}-seat clear!', dare_tie_seats: 'You matched {who} {n}-seat clear!', dare_miss_seats: '{v} seats used vs {who} {n}',
    dare_beat_time: 'You beat {who} {n}s!', dare_tie_time: 'You matched {who} {n}s!', dare_miss_time: '{v}s vs {who} {n}s',
  },
  tr: {
    clipChain: 'ZİNCİR', clipBench: 'Dolu minder: {u}/{n}!', clipOneSeat: 'Tek minder kaldı!', clipCan: 'Sen geçebilir misin?', clipLink: 'Aynı tahtayı oyna:',
    clipClear: 'Tahta temizlendi!', clipNoBench: 'Tek kedi bile beklemedi!',
    shareClipBtn: 'Klibi paylaş', shareDareBtn: 'Meydan oku', shareNudge: 'Arkadaşına göster!', clipSavedLink: 'Klip kaydedildi, link kopyalandı: linki klibin yanına yapıştır',
    shareDareChain: '{board}: x{c} zincirimi geçebilir misin?', shareDareChainMatch: '{board}: x{c} zincirimi yakalayabilir misin? Bu tahtada daha iyisi yok.', shareDareSeats: '{board} tahtasını sadece {c} minderle bitirdim. Sen yapabilir misin?',
    shareDareNoBench: '{board} tahtasını hiç kedi bekletmeden bitirdim. Sen yapabilir misin?', shareDareTime: '{board}: {t} sn rekorumu geçebilir misin?',
    dareTitle: 'Meydan okuma', dareFrom: '{name} sana meydan okuyor!', dareFriend: 'Arkadaşın', dareWho: 'Arkadaşının',
    dareGoalChain: 'x{n} zinciri geç', dareGoalChainMatch: 'x{n} zinciri yakala', dareGoalSeats: 'En fazla {n} minderle bitir', dareGoalNoBench: 'Hiç kedi bekletmeden bitir', dareGoalTime: '{t} saniyeden hızlı bitir',
    dareBoard: '{board} · {n} minder', dareHow: 'Bir kediye dokun. Sadece en öndeki taşıyıcıya binebilir, diğerleri minderde bekler.',
    dareTeach: 'Sadece en öndeki taşıyıcıya binilir. Diğerleri minderde bekler.', teachBoards: 'Buraya biner', teachWaits: 'Burada bekler',
    dareLinkTitle: 'Davet linkini de gönder', dareLinkBtn: 'Linki gönder',
    clipSaved: 'Klip kaydedildi!', copyLinkBtn: 'Davet linkini kopyala', linkCopied: 'Link kopyalandı!', copyHold: 'Kopyalamak için linke basılı tut',
    darePlay: 'Oyna', dareSkip: 'Şimdi değil', dareBack: 'Sen de meydan oku', dareContinue: 'Devam et',
    dareTieBtn: 'Yakaladım! Gönder', dareSendResult: 'Sonucu gönder', dareRound: '{n}. tur', dareYourTurn: 'Sıra sende', dareYou: 'Sen',
    dareName: 'Adın', dareNameHint: 'isteğe bağlı, cevabında görünür',
    valSeats: '{n} minder', valTime: '{t} sn',
    backBeat: '{board}, {r}. tur: sen {pv}, ben {v}. Sıra sende!', backTie: '{board}, {r}. tur: {pv} sonucunu yakaladım. Sıra sende!', backMiss: '{board}, {r}. tur: sen {pv}, ben {v}. Rövanş istiyorum!',
    momFirst3: 'İlk x{n} zincirin!', momBest: 'Yeni rekor: x{n} zincir!', momSweep: 'Kusursuz: hiç kedi beklemedi!', momDaily: 'Günün bulmacası bitti!', momGold: 'Altın madalya!', momRush: 'Kafe Koşusu: ilk 3!',
    ssCopied: 'Link kopyalandı! İstediğin sohbete yapıştır.', ssCopy: 'Linki kopyala, bir arkadaşına gönder.', ssSaveClip: 'Klibi kaydet', ssSaveCard: 'Resmi kaydet', ssDone: 'Tamam',
    shareHouse: 'Paylaş', cardFloor: '{name} açıldı!', cardFloorSub: 'Kedi Evim artık {n} katlı', cardHouseDone: 'Kedi Evim tamamlandı!', cardShop: 'Kedi Sokağımda {place} açıldı!', cardShopSub: 'Kedi Sokağı’nda {n} dükkan açık', cardShopSub1: 'Kedi Sokağı’nın ilk dükkanı',
    cardCta: 'Tarayıcında ücretsiz oyna:', shareHouseText: 'Long Cat Out!’ta ne yaptığıma bak! {title}', cardSaved: 'Resim kaydedildi, link kopyalandı',
    dare_beat_chain: '{who} x{n} zincirini geçtin!', dare_tie_chain: '{who} x{n} zincirini yakaladın!', dare_miss_chain: 'Az kaldı: sen x{v}, hedef x{n}',
    dare_beat_seats: '{who} {n} minderlik rekorunu geçtin!', dare_tie_seats: '{who} {n} minderlik rekorunu yakaladın!', dare_miss_seats: 'Sen {v} minder, hedef {n}',
    dare_beat_time: '{who} {n} sn süresini geçtin!', dare_tie_time: '{who} {n} sn süresini yakaladın!', dare_miss_time: 'Sen {v} sn, hedef {n} sn',
  },
});
