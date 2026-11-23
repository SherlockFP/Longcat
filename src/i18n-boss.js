// EN + TR strings for the boss lane: boss levels, the HP bar, the defeat ceremony, chests, the flame streak, the map
// (src/ui/boss.js). paySuper / mapSuper are the older "super hard" words: a 3-star level is a boss level now.
import { addStrings } from './i18n.js';

addStrings({
  en: {
    paySuper: 'Boss', mapSuper: 'Boss',
    bossTag: 'BOSS', bossWants: '{name} wants {n} cats!', bossVip: 'VIP order · +{c} bonus', bossGo: 'Tap to fight!',
    bossHp: '{a}/{b} cats', bossLeft: '{n} to go!', bossGiveUp: '{name} gives up!', bossBeaten: 'Boss beaten!', bossChapter: 'Boss of chapter {n}',
    bossNext: 'Boss in {n}', bossNow: 'Boss level!',
    chWood: 'Milestone chest', chBoss: 'Boss chest', chStreak: 'Streak chest',
    chTapOpen: 'Tap to open!', chTapFaster: 'Tap! Tap!', chCollect: 'Collect', chSkip: 'Tap to skip',
    tierCommon: 'Common', tierRare: 'RARE!', tierEpic: 'EPIC!',
    chNewLook: 'New look!', chNewRoom: 'New play room!', chWear: 'Wear it', chUse: 'Use it', chWorn: 'On!',
    chNextIn: '{n} levels to the next chest', chNextOne: 'Chest on this level!', chBossIn: '{n} levels to the boss chest', chBossOne: 'Boss chest on this level!',
    flameLine: 'Win streak {a}/{b}', flameOut: 'Your win streak went out', flameFull: 'Streak chest!', flameTip: '3 wins in a row = a chest. A continue keeps the flame.',
    bossFrom: '{name} returns!',
  },
  tr: {
    paySuper: 'Boss', mapSuper: 'Boss',
    bossTag: 'BOSS', bossWants: '{name} {n} kedi istiyor!', bossVip: 'VIP sipariş · +{c} bonus', bossGo: 'Savaşmak için dokun!',
    bossHp: '{a}/{b} kedi', bossLeft: '{n} kaldı!', bossGiveUp: '{name} pes etti!', bossBeaten: 'Boss yenildi!', bossChapter: '{n}. bölümün bossu',
    bossNext: "Boss'a {n}", bossNow: 'Boss seviyesi!',
    chWood: 'Kilometre taşı sandığı', chBoss: 'Boss sandığı', chStreak: 'Seri sandığı',
    chTapOpen: 'Açmak için dokun!', chTapFaster: 'Dokun! Dokun!', chCollect: 'Topla', chSkip: 'Geçmek için dokun',
    tierCommon: 'Sıradan', tierRare: 'NADİR!', tierEpic: 'EFSANE!',
    chNewLook: 'Yeni görünüm!', chNewRoom: 'Yeni oyun odası!', chWear: 'Giy', chUse: 'Kullan', chWorn: 'Tamam!',
    chNextIn: 'Sonraki sandığa {n} seviye', chNextOne: 'Bu seviyede sandık var!', chBossIn: 'Boss sandığına {n} seviye', chBossOne: 'Bu seviyede boss sandığı!',
    flameLine: 'Galibiyet serisi {a}/{b}', flameOut: 'Galibiyet serin söndü', flameFull: 'Seri sandığı!', flameTip: 'Üst üste 3 galibiyet = bir sandık. Devam etmek alevi korur.',
    bossFrom: '{name} geri döndü!',
  },
});
