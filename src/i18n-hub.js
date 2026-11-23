// EN + TR strings for the hub lane: the home level map, the desktop side panels and the keyboard shortcuts (src/ui/hub.js).
import { addStrings } from './i18n.js';

addStrings({
  en: {
    mapTab: 'Map', houseTab: 'House',
    mapLevel: 'Level {n}', mapPlay: 'Play', mapChapter: 'Chapter {n}', mapHard: 'Hard', mapSuper: 'Super hard', mapNew: 'New!',
    mapSoon: 'More levels ahead', mapStart: 'The road starts here',
    hsToday: 'Today', hsTasks: 'Daily tasks', hsTasksSub: '{a}/{b} done', hsDaily: 'Daily puzzle', hsDailyDone: 'Done · streak {n}', hsDailyGo: 'Not played yet', hsEvents: 'Events', hsEventsSub: 'Cat Show · Café Rush', hsGoals: 'Next goals',
    hsMap: 'Your road', hsChapterProg: '{a}/{b} levels in this chapter', hsResidents: 'Residents', hsResSub: '{a}/{b} moved in', hsAlbum: 'Album', hsAlbumSub: '{a}/{b} postcards',
    hsKeys: 'Keyboard', keyPlay: 'Play / Next', keyUndo: 'Undo', keyHint: 'Hint', keyBack: 'Back', hsPlaying: 'Playing level {n}',
  },
  tr: {
    mapTab: 'Harita', houseTab: 'Ev',
    mapLevel: 'Bölüm {n}', mapPlay: 'Oyna', mapChapter: '{n}. Mahalle', mapHard: 'Zor', mapSuper: 'Çok zor', mapNew: 'Yeni!',
    mapSoon: 'Yeni bölümler yolda', mapStart: 'Yol burada başlıyor',
    hsToday: 'Bugün', hsTasks: 'Günlük görevler', hsTasksSub: '{a}/{b} tamam', hsDaily: 'Günlük bulmaca', hsDailyDone: 'Bitti · seri {n}', hsDailyGo: 'Henüz oynanmadı', hsEvents: 'Etkinlikler', hsEventsSub: 'Kedi Şovu · Kafe Yarışı', hsGoals: 'Sıradaki hedefler',
    hsMap: 'Yolun', hsChapterProg: 'Bu mahallede {a}/{b} bölüm', hsResidents: 'Sakinler', hsResSub: '{a}/{b} taşındı', hsAlbum: 'Albüm', hsAlbumSub: '{a}/{b} kartpostal',
    hsKeys: 'Klavye', keyPlay: 'Oyna / Sonraki', keyUndo: 'Geri al', keyHint: 'İpucu', keyBack: 'Geri', hsPlaying: '{n}. bölüm oynanıyor',
  },
});
