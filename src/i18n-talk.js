// EN + TR lines for the talking cats (src/ui/talk.js): board moments and café personalities. Each line <= 24 chars
// ({name} aside). The Turkish lines are written for Turkish players, not translated word for word.
import { addStrings } from './i18n.js';

addStrings({
  en: { chatter: 'Cat chatter' },
  tr: { chatter: 'Kedi sohbeti' },
});

export const TALK = {
  en: {
    bench: ['Getting crowded...', 'One seat left!', 'Scoot over!', 'Squished! Mew!', 'Careful now...'],
    chain: ['Conga line!', 'Team paws!', 'Mew mew mew!', 'All aboard!', 'Fur-tastic!'],
    bossWin: ['{name} gave up!', 'Boss? Done. Mrrp!', 'Who is boss now?', 'Treasure time!'],
    sleepy: ['Zzz... five more naps', 'Yawn... hi.', 'Warm spot. Mine.', 'Too comfy to move.'],
    greedy: ['Got snacks? Mrrp?', 'I smell tuna!', 'Food bowl: empty!', 'Treat tax, please.'],
    proud: ['Admire my whiskers.', 'I am the café star.', 'Bow to the floof.', 'Yes, I am perfect.'],
    shy: ['Oh! You saw me...', 'Mew... hi...', 'Just hiding here.', 'Pet me? Gently.'],
    playful: ['Chase me! Mrrp!', 'Is that a string?!', 'Pounce time!', 'Play with meee!'],
  },
  tr: {
    bench: ['Kalabalık oldu...', 'Tek yer kaldı!', 'Biraz kayar mısın?', 'Ezildim, miyav!', 'Aman dikkat...'],
    chain: ['Kedi treni!', 'Pati pati gidiyoruz!', 'Hep beraber!', 'Herkes binsin!', 'Mır mır mırr!'],
    bossWin: ['{name} pes etti!', 'Patron kim? Biziz!', 'Hazine bizim, miyav!', 'Bıyıklar titredi!'],
    sleepy: ['Zzz... beş dakika daha', 'Esneeek... selam.', 'Sıcak köşe benim.', 'Kalkmaya üşendim.'],
    greedy: ['Mama var mı? Mırr?', 'Ton balığı kokusu!', 'Kabım bomboş!', 'Ödül maması lütfen!'],
    proud: ['Bıyıklarıma bak!', 'Kafenin yıldızı benim.', 'Pofuduğa selam dur.', 'Evet, kusursuzum.'],
    shy: ['Ay! Gördün mü beni?', 'Miy... merhaba...', 'Saklanıyordum ben.', 'Sev ama yavaşça.'],
    playful: ['Yakala beni, mırr!', 'O ip mi?! Benim!', 'Hoplama vakti!', 'Oynayalım mı?'],
  },
};
