// EN + TR strings for the adoption orders (src/game/orders.js, src/ui/orders.js). Shop and keeper words live in
// data/orders.js (TR needs the dative / locative forms per shop).
import { addStrings } from './i18n.js';

addStrings({
  en: {
    // the order: intro card + strip
    ordNeeds: '{who} {shop} needs {n} cats!', ordUrgent: 'URGENT', ordVip: 'VIP', ordUrgentLine: 'Urgent order · +{c} bonus', ordVipLine: 'VIP order · +{c} bonus',
    ordStrip: '{a} of {b} cats delivered',
    payUrgent: 'Urgent order', payVip: 'VIP order',
    // the delivery ceremony
    ordThanks: 'Thank you! {n} cats have a new home.', ordThanksUrgent: 'Just in time! {n} cats delivered.', ordThanksVip: 'A VIP welcome for all {n} cats!',
    ordAdopted: '{name} now lives at {at}', ordSet: 'Set {k} · {a}/{b}', ordSetDone: 'Set complete!', ordTap: 'Tap to continue',
    // the album tab
    albCards: 'Postcards', albAdopt: 'Adopted cats', adHead: '{n} cats delivered', adTotal: '{n} cats adopted', adTotal1: '1 cat adopted',
    adSetReward: 'Full set: {r}', adSets: 'Sets done: {n}', adNext: 'Next order', adNone: 'Win a level to deliver your first order.', adMore: 'More shops order as you play.', adOrdering: 'Ordering now',
    coat_0: 'Orange stripes', coat_1: 'Blue dots', coat_2: 'Pink hearts', coat_3: 'Green zigzag', coat_4: 'Purple stars', coat_5: 'Mint clouds', coat_6: 'Yellow spots', coat_7: 'Plain red',
  },
  tr: {
    ordNeeds: '{who} {shop} {n} kedi lazım!', ordUrgent: 'ACİL', ordVip: 'VIP', ordUrgentLine: 'Acil sipariş · +{c} bonus', ordVipLine: 'VIP sipariş · +{c} bonus',
    ordStrip: '{b} kediden {a} tanesi teslim edildi',
    payUrgent: 'Acil sipariş', payVip: 'VIP sipariş',
    ordThanks: 'Teşekkürler! {n} kedi yeni yuvasına kavuştu.', ordThanksUrgent: 'Tam zamanında! {n} kedi teslim edildi.', ordThanksVip: '{n} kedinin hepsine VIP karşılama!',
    ordAdopted: '{name} artık {at} yaşıyor', ordSet: '{k}. set · {a}/{b}', ordSetDone: 'Set tamamlandı!', ordTap: 'Devam etmek için dokun',
    albCards: 'Kartpostallar', albAdopt: 'Sahiplenilenler', adHead: '{n} kedi teslim edildi', adTotal: '{n} kedi sahiplenildi', adTotal1: '1 kedi sahiplenildi',
    adSetReward: 'Tam set: {r}', adSets: 'Biten set: {n}', adNext: 'Sıradaki sipariş', adNone: 'İlk siparişi teslim etmek için bir seviye kazan.', adMore: 'Oynadıkça başka dükkânlar da sipariş verecek.', adOrdering: 'Şu an sipariş veriyor',
    coat_0: 'Turuncu çizgili', coat_1: 'Mavi puantiyeli', coat_2: 'Pembe kalpli', coat_3: 'Yeşil zikzaklı', coat_4: 'Mor yıldızlı', coat_5: 'Nane bulutlu', coat_6: 'Sarı benekli', coat_7: 'Düz kırmızı',
  },
});
