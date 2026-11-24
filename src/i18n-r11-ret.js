// EN + TR strings for the R11 retention lane (src/game/r11-ret.js, src/ui/r11-ret.js): the album card on the map,
// the hang-the-print card in the room and the come-back-tomorrow line on the win card.
import { addStrings } from './i18n.js';

addStrings({
  en: {
    rtNextCard: 'Next postcard · {page} {a}/{b}',
    rtLastCard: 'Completes the {page} print!',
    rtStamp1: '1 stamp: {task}', rtStamps: '{n} stamps: {task}',
    rtBoard1: '1 board: {task}', rtBoards: '{n} boards: {task}',
    rtDoDaily: "clear today's Daily", rtDoBoard: 'clear Show board {k}', rtDoArch: 'clear board {k} of {ev}',
    rtClaimLine: '3/3 stamps: claim it now', rtCatchLine: 'Both boards cleared: add it now',
    rtGoBoard: 'Board {k}', rtGoDaily: 'Daily', rtGoHang: 'Hang',
    rtHangSmall: '{page} page complete!', rtHangTitle: 'Hang the print', rtHangWhere: 'Goes up in: {room}',
    rtHangHere: 'This room: {room}', rtHangPick: 'Arrows pick another room', rtHangBtn: 'Hang the print', rtLater: 'Later',
    rtWins: '{n} wins today!', rtTmrw: 'Tomorrow:',
    // R11 fix round 2: an empty album slot's exact step (the same as the map's strip)
    albLeft_stamp1: '1 stamp left', albLeft_stamp: '{n} stamps left', albLeft_board1: '1 clear left', albLeft_board: '{n} clears left',
    albAllStamps: 'All 3 stamps in', albBothDone: 'Both boards cleared', albWait: 'Catch-up opens in {t}',
    rtTm_chest: 'Day {n} chest', rtTm_daily: 'a fresh Daily', rtTm_week: 'new postcard: {card}', rtTm_job: 'jobs from {name}', rtTm_req: 'a resident request',
  },
  tr: {
    rtNextCard: 'Sıradaki kartpostal · {page} {a}/{b}',
    rtLastCard: '{page} tablosunu tamamlar!',
    rtStamp1: '1 damga: {task}', rtStamps: '{n} damga: {task}',
    rtBoard1: '1 tahta: {task}', rtBoards: '{n} tahta: {task}',
    rtDoDaily: 'bugünün bulmacasını çöz', rtDoBoard: 'Şov {k} tahtasını geç', rtDoArch: '{ev}: {k} tahtasını geç',
    rtClaimLine: '3/3 damga: hemen al', rtCatchLine: 'İki tahta da bitti: hemen ekle',
    rtGoBoard: '{k} tahtası', rtGoDaily: 'Günlük', rtGoHang: 'As',
    rtHangSmall: '{page} sayfası tamam!', rtHangTitle: 'Tabloyu as', rtHangWhere: 'Asılacak oda: {room}',
    rtHangHere: 'Bu oda: {room}', rtHangPick: 'Başka oda için okları kullan', rtHangBtn: 'Tabloyu as', rtLater: 'Sonra',
    rtWins: 'Bugün {n} galibiyet!', rtTmrw: 'Yarın:',
    albLeft_stamp1: '1 damga kaldı', albLeft_stamp: '{n} damga kaldı', albLeft_board1: '1 tahta kaldı', albLeft_board: '{n} tahta kaldı',
    albAllStamps: '3 damga da tamam', albBothDone: 'İki tahta da bitti', albWait: 'Telafi {t} sonra açılır',
    rtTm_chest: '{n}. gün sandığı', rtTm_daily: 'yeni Günlük bulmaca', rtTm_week: 'yeni kartpostal: {card}', rtTm_job: '{name} için işler', rtTm_req: 'bir sakin isteği',
  },
});
