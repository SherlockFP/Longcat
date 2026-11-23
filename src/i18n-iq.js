// EN + TR strings for the R10 "iq" lane: level clocks + time medals, Record Run, statistics + Cat IQ, the rank list
// (src/game/iq.js, src/ui/iq.js).
import { addStrings } from './i18n.js';

addStrings({
  en: {
    iqRecords: 'Records',
    iqTabLevels: 'Levels', iqTabRun: 'Run', iqTabStats: 'Stats', iqTabRank: 'Rank',
    // the clock + the win card
    iqNewBest: 'New best {t}!', iqChipBest: 'New best!', iqFirstTime: 'Your time {t}', iqTimeVs: 'Time {t} · best {b}',
    iqMedal3: 'Gold time', iqMedal2: 'Silver time', iqMedal1: 'Bronze time', iqMedal0: 'No time medal',
    iqNextCut: '{m} under {t}', iqM3: 'Gold', iqM2: 'Silver', iqM1: 'Bronze',
    // levels tab
    iqLevelsSub: 'Tap a level you have beaten to race your best time.', iqLevelsEmpty: 'Win a level to start your records.',
    iqMedalSum: '{g} gold · {s} silver · {b} bronze', iqPage: '{a}-{b} of {n}',
    // Record Run
    iqRunTitle: 'Record Run', iqRunRule: '5 boards you have beaten, back to back, on one clock. Bench full? Retry: the clock keeps going.',
    iqRunBest: 'Personal best', iqRunNone: 'No run yet', iqRunGo: 'Start run', iqRunLocked: 'Opens after level {n}',
    iqRunLockedSub: 'Beat a few more levels: the run draws on boards you know.',
    iqRunN: 'Run {i}/{n}', iqRunBoard: 'Board {i}/{n} done', iqRunTotal: 'Total {t}', iqRunDone: 'Run complete!',
    iqRunAgain: 'Run again', iqRunCount: 'Runs finished: {n}', iqRunPrev: 'Best {t}', iqRunSlower: '+{d}s on your best',
    iqSplits: 'Best run splits', iqShare: 'Share', iqShareRun: 'I cleared 5 Long Cat Out! boards in {t}. Can you beat my Record Run?',
    iqCopied: 'Copied: paste it to a friend',
    // stats + Cat IQ
    iqTitle: 'Cat IQ', iqHow: 'Counted from your levels, time medals, clean sweeps, chains, Dailies and Record Run.',
    iqNextTitle: '{n} more for {title}', iqTop: 'Top of the class!',
    iqT0: 'Curious Kitten', iqT1: 'Clever Kitten', iqT2: 'Sharp Whiskers', iqT3: 'Puzzle Prowler', iqT4: 'Wise Tabby', iqT5: 'Master Mouser', iqT6: 'Genius Cat',
    iqStCleared: 'Levels cleared', iqStCats: 'Cats freed', iqStChain: 'Best chain', iqStFast: 'Fastest clear', iqStPerfect: 'Clean sweeps',
    iqStPerfectSub: 'no cushion used', iqStStreak: 'Daily streak', iqStStreakSub: '{n} Dailies in all', iqStPlay: 'Play time', iqStMedals: 'Time medals',
    iqHM: '{h}h {m}m', iqM: '{m}m', iqNone: '—',
    // rank list
    iqRankYou: 'You', iqBot: 'BOT', iqFriend: 'Friend', iqRankHead: 'Levels cleared', iqRankPos: 'Your place: {n} of {m}',
    iqRankSub: 'BOT = a practice rival, not a real player.', iqRankFr: 'Friends join when their dare replies reach this phone.',
    iqRankNoLv: 'no level dare yet',
  },
  tr: {
    iqRecords: 'Rekorlar',
    iqTabLevels: 'Bölümler', iqTabRun: 'Koşu', iqTabStats: 'İstatistik', iqTabRank: 'Sıralama',
    iqNewBest: 'Yeni rekor {t}!', iqChipBest: 'Yeni rekor!', iqFirstTime: 'Süren {t}', iqTimeVs: 'Süre {t} · rekor {b}',
    iqMedal3: 'Altın süre', iqMedal2: 'Gümüş süre', iqMedal1: 'Bronz süre', iqMedal0: 'Süre madalyası yok',
    iqNextCut: '{m}: {t} altı', iqM3: 'Altın', iqM2: 'Gümüş', iqM1: 'Bronz',
    iqLevelsSub: 'Rekorunu geçmek için bitirdiğin bir bölüme dokun.', iqLevelsEmpty: 'Rekorların için önce bir bölüm kazan.',
    iqMedalSum: '{g} altın · {s} gümüş · {b} bronz', iqPage: '{a}-{b} / {n}',
    iqRunTitle: 'Rekor Koşusu', iqRunRule: 'Bitirdiğin 5 tahta, art arda, tek saatle. Minderler dolarsa tekrar dene: saat durmaz.',
    iqRunBest: 'Kişisel rekor', iqRunNone: 'Henüz koşu yok', iqRunGo: 'Koşuyu başlat', iqRunLocked: '{n}. bölümden sonra açılır',
    iqRunLockedSub: 'Birkaç bölüm daha kazan: koşu bildiğin tahtalardan seçilir.',
    iqRunN: 'Koşu {i}/{n}', iqRunBoard: 'Tahta {i}/{n} tamam', iqRunTotal: 'Toplam {t}', iqRunDone: 'Koşu bitti!',
    iqRunAgain: 'Tekrar koş', iqRunCount: 'Biten koşu: {n}', iqRunPrev: 'Rekor {t}', iqRunSlower: 'Rekorundan {d} sn yavaş',
    iqSplits: 'En iyi koşunun ara süreleri', iqShare: 'Paylaş', iqShareRun: 'Long Cat Out!’ta 5 tahtayı {t} sürede bitirdim. Rekor Koşumu geçebilir misin?',
    iqCopied: 'Kopyalandı: bir arkadaşına yapıştır',
    iqTitle: 'Kedi IQ', iqHow: 'Bölümlerin, süre madalyaların, temiz bitişlerin, zincirlerin, günlük bulmacaların ve Rekor Koşun sayılır.',
    iqNextTitle: '{title} için {n} puan daha', iqTop: 'Sınıfın birincisi!',
    iqT0: 'Meraklı Yavru', iqT1: 'Zeki Yavru', iqT2: 'Keskin Bıyık', iqT3: 'Bulmaca Avcısı', iqT4: 'Bilge Tekir', iqT5: 'Usta Fareci', iqT6: 'Dahi Kedi',
    iqStCleared: 'Biten bölüm', iqStCats: 'Çıkan kedi', iqStChain: 'En iyi zincir', iqStFast: 'En hızlı bitiş', iqStPerfect: 'Temiz bitiş',
    iqStPerfectSub: 'hiç minder yok', iqStStreak: 'Günlük seri', iqStStreakSub: 'toplam {n} günlük', iqStPlay: 'Oyun süresi', iqStMedals: 'Süre madalyası',
    iqHM: '{h} sa {m} dk', iqM: '{m} dk', iqNone: '—',
    iqRankYou: 'Sen', iqBot: 'BOT', iqFriend: 'Arkadaş', iqRankHead: 'Biten bölüm', iqRankPos: 'Sıran: {m} kişide {n}.',
    iqRankSub: 'BOT = alıştırma rakibi, gerçek oyuncu değil.', iqRankFr: 'Arkadaşların, meydan okuma cevapları bu telefona gelince listeye girer.',
    iqRankNoLv: 'henüz bölüm daveti yok',
  },
});
