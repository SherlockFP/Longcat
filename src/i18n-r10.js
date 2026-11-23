// EN + TR strings for the R10 retention systems (src/game/r10.js, src/ui/r10.js, the Cat Street laps past the second).
import { addStrings } from './i18n.js';

addStrings({
  en: {
    // Cat Street past lap 2
    streetUpName: '{house} upgrades', streetMixName: '{house} · {theme}',
    upDone: '{place} done!', upDoneSub: '{name} shows off the new look.',
    guestArrive: '{name} moved in at the {place}!', guestSub: '{theme} on Cat Street',
    // the finished floor card + the house-done ceremony
    floorDoneShort: '{floor} done', nextIn: 'Next: {room}', readyBuild: 'ready to build', starsMissing: '{n} more ★ needed · win a level', goThere: 'Go',
    houseDoneTitle: 'The house is done!', streetOpensSub: 'Cat Street is next: shops, keepers and more.', toStreet: 'To Cat Street',
    // the Daily record
    drecHint: '1 free Hint', drecUndo: '1 free Undo', drecGot: 'Unlocked: {name}!', drecTotal: 'Daily record: {n} clears', drecProg: 'Daily record {n}/{at}', drecNext: 'Next: {name}', drecAll: 'Every Daily keepsake unlocked',
    // resident jobs
    jobsTitle: 'Resident jobs', jobsRule: ' · first one done pays', jobFor: 'Help {name}', jobGoal: '{name}: {task}', jobTomorrow: 'Tomorrow · {name}', jobReset: 'New jobs in {t}', jobThanks: '{name} says thanks! +{c} coins',
    jk_win: 'Win {n} levels', jk_cat: 'Free {n} cats', jk_carrier: 'Fill {n} carriers', jk_tidy: 'Win with at most 2 cushions',
    // the album
    album: 'Album', albPage: '{a}/{b} on this page', albTotal: '{a}/{b} postcards',
    albNow: 'This week · Events', albArch: 'In the archive', albLocked: 'Events open after level {n}', albSoon: 'Comes in {n} weeks', albNext: 'Comes next week',
    printReady: 'Framed print unlocked!', printHow: 'Hang it in a finished room.', printHungIn: 'Hangs in: {room}', hangCafe: 'Hang in café', hangAgain: 'Move it',
    printLocked: '{n} more for the framed print', printWhat: 'A full page unlocks a print for your café wall.', printHung: 'Your print hangs in the {room}!',
    newPostcard: 'New postcard!', pageDone: '{name} complete!', printUnlocked: 'Framed print unlocked', openAlbum: 'Open album',
    // the pop-up week
    popLine: '{n}/{m} stamps · {t} left', popDailyShort: 'Daily', popPrize: '3 stamps: postcard + {c} coins',
    popBoard: 'Play board {k}', popDaily: "Clear today's Daily", popDailyTomorrow: 'Daily stamp: tomorrow', popDone: 'Postcard won!',
    popStampLine: 'Pop-up stamp {n}/{m}', popReadyLine: 'Pop-up postcard ready!',
    catchGet: 'Get', catchRule: 'Clear both boards of a past week to get its postcard (1 a week).', catchUsed: 'Catch-up postcard taken this week.',
    // friend results
    friends: 'Friends', frSub: 'Replies to your dares on this phone ({n})', frEmpty: "Open a friend's result link to start", frEmptySub: 'Dare a friend from a win card. When they send their result back, it lands here.',
    frSeats: '{n} cushions', frSent: '{name} scored {v}', fr_beat: '{name} beat your {v}', fr_tie: '{name} matched your {v}', fr_miss: '{name} tried your {v}',
    frCushions: '{n} cushions', frYou: 'You', rematch: 'Rematch', frAdded: "{name}'s result is in your Friend Results",
  },
  tr: {
    streetUpName: '{house} süslemesi', streetMixName: '{house} · {theme}',
    upDone: '{place} tamam!', upDoneSub: '{name} yeni görünümle hava atıyor.',
    guestArrive: '{name} {place} dükkanına taşındı!', guestSub: 'Kedi Sokağı’nda {theme}',
    floorDoneShort: '{floor} bitti', nextIn: 'Sırada: {room}', readyBuild: 'yapmaya hazır', starsMissing: '{n} ★ daha lazım · bir seviye kazan', goThere: 'Git',
    houseDoneTitle: 'Ev tamamlandı!', streetOpensSub: 'Sırada Kedi Sokağı var: dükkanlar, esnaf ve dahası.', toStreet: 'Kedi Sokağı’na',
    drecHint: '1 bedava İpucu', drecUndo: '1 bedava Geri Al', drecGot: 'Açıldı: {name}!', drecTotal: 'Günlük rekor: {n} bulmaca', drecProg: 'Günlük rekor {n}/{at}', drecNext: 'Sıradaki: {name}', drecAll: 'Tüm günlük hatıralar açıldı',
    jobsTitle: 'Sakin işleri', jobsRule: ' · ilk biten ödül kazandırır', jobFor: '{name} için', jobGoal: '{name}: {task}', jobTomorrow: 'Yarın · {name}', jobReset: 'Yeni işler {t} sonra', jobThanks: '{name} teşekkür ediyor! +{c} altın',
    jk_win: '{n} seviye kazan', jk_cat: '{n} kedi çıkar', jk_carrier: '{n} taşıyıcı doldur', jk_tidy: 'En fazla 2 minderle kazan',
    album: 'Albüm', albPage: 'Bu sayfada {a}/{b}', albTotal: '{a}/{b} kartpostal',
    albNow: 'Bu hafta · Etkinlikler', albArch: 'Arşivde', albLocked: 'Etkinlikler {n}. seviyede açılır', albSoon: '{n} hafta sonra gelir', albNext: 'Gelecek hafta gelir',
    printReady: 'Çerçeveli tablo açıldı!', printHow: 'Bitmiş bir odaya as.', printHungIn: 'Asılı: {room}', hangCafe: 'Kafeye as', hangAgain: 'Yerini değiştir',
    printLocked: 'Tablo için {n} kart daha', printWhat: 'Dolu bir sayfa kafe duvarına bir tablo açar.', printHung: 'Tablon artık {room} duvarında!',
    newPostcard: 'Yeni kartpostal!', pageDone: '{name} tamam!', printUnlocked: 'Çerçeveli tablo açıldı', openAlbum: 'Albümü aç',
    popLine: '{n}/{m} damga · {t} kaldı', popDailyShort: 'Günlük', popPrize: '3 damga: kartpostal + {c} altın',
    popBoard: 'Oyna: tahta {k}', popDaily: 'Bugünün bulmacasını çöz', popDailyTomorrow: 'Günlük damga: yarın', popDone: 'Kartpostal kazanıldı!',
    popStampLine: 'Etkinlik damgası {n}/{m}', popReadyLine: 'Kartpostal hazır!',
    catchGet: 'Al', catchRule: 'Geçmiş bir haftanın iki tahtasını da bitir, kartpostalını al (haftada 1).', catchUsed: 'Bu haftanın telafi kartpostalı alındı.',
    friends: 'Arkadaşlar', frSub: 'Bu telefondaki meydan okuma cevapları ({n})', frEmpty: 'Başlamak için bir arkadaşının sonuç linkini aç', frEmptySub: 'Kazanınca bir arkadaşına meydan oku. Sonucunu geri gönderince burada görünür.',
    frSeats: '{n} minder', frSent: '{name}: {v}', fr_beat: '{name} senin {v} sonucunu geçti', fr_tie: '{name} senin {v} sonucunu yakaladı', fr_miss: '{name} senin {v} sonucunu denedi',
    frCushions: '{n} minder', frYou: 'Sen', rematch: 'Rövanş', frAdded: '{name} sonucunu gönderdi: Arkadaşlar sekmesinde',
  },
});
