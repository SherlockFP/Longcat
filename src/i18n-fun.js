// EN + TR strings for the R11 fun lane (sol-r11-3 fixes 4 + 7): the winnable Take back, the teaching rewind.
import { addStrings } from './i18n.js';

addStrings({
  en: {
    funBackN: 'Rewound {n} moves to a winnable spot',
    funBack1: 'Took back 1 move: you can still win from here',
    funBackTap: 'Back to that tap',
    funTapLine: 'Back to the tap that cost the win: try another cat first',
  },
  tr: {
    funBackN: '{n} hamle geri sarıldı, buradan kazanabilirsin',
    funBack1: '1 hamle geri alındı, buradan hâlâ kazanabilirsin',
    funBackTap: 'O hamleye dön',
    funTapLine: 'Kaybettiren hamleye döndük: önce başka bir kedi dene',
  },
});
