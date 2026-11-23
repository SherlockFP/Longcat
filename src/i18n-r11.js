// EN + TR strings for the R11 fix rounds (sol-r11-1, sol-r11-2): the on-demand share clip, the QR on the clip's end
// card, the curated L6 / L9 / L11 lines, the early resident thread.
import { addStrings } from './i18n.js';

addStrings({
  en: {
    clipMaking: 'Making clip…',
    clipScan: 'Scan to play this board',
    // fix 2: the clip button says what its first tap does, counts up while the video is made, then sends it
    clipMake: 'Make video',
    clipMakingP: 'Making {p}%',
    clipSend: 'Send video',
    // fix 2: curated boards (core/curated.js): the idea on the first try, the way through on a retry and the lost card
    curIdea_cushion: 'The last orange sleeps under five cats. You have five seats.',
    curIdea_pair: 'A mother and kitten take two seats when they park.',
    curIdea_now: 'Only the top cat of a stack can leave.',
    curTry_cushion: 'Park only the cats on top of the last orange: it needs all five seats.',
    curTry_pair: 'Leave the big pair for last: park the small orange first.',
    curTry_now: 'Seats full? A top cat in the front carrier’s colour boards right away.',
    curPairPark: 'That pair took 2 seats until green comes last!',
    curFull: 'Every seat is full! Send a cat the front carrier takes.',
    // fix 2: the early resident thread (map, win card, room): the exact remaining action
    thrWin: '{name} moves in after {w} more wins',
    thrWin1: '{name} moves in after 1 more win',
    thrBuild: 'Build the {task} for {name}',
  },
  tr: {
    clipMaking: 'Klip hazırlanıyor…',
    clipScan: 'Okut, aynı seviyeyi oyna',
    clipMake: 'Video yap',
    clipMakingP: 'Yapılıyor %{p}',
    clipSend: 'Videoyu yolla',
    curIdea_cushion: 'Son turuncu beş kedinin altında uyuyor. Beş minderin var.',
    curIdea_pair: 'Anne ve yavrusu park edince iki minder kaplar.',
    curIdea_now: 'Bir yığından sadece en üstteki kedi çıkabilir.',
    curTry_cushion: 'Sadece son turuncunun üstündekileri park et: beş minderin hepsi lazım.',
    curTry_pair: 'Büyük ikiliyi sona bırak: önce küçük turuncuyu park et.',
    curTry_now: 'Minderler dolu mu? Öndeki taşıyıcının renginde en üstteki kedi hemen biner.',
    curPairPark: 'Bu ikili, yeşil sırası gelene kadar 2 minder kaptı!',
    curFull: 'Bütün minderler dolu! Öndeki taşıyıcının alacağı bir kedi gönder.',
    thrWin: '{w} galibiyet daha, {name} taşınıyor',
    thrWin1: '1 galibiyet daha, {name} taşınıyor',
    thrBuild: '{name} için {task} kur',
  },
});
