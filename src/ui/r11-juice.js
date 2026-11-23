// R11 juice lane (Sol fix 3), the DOM half: the win card's coin flight lands with a tick and a sparkle on the counter,
// and the chain's final landing gets one short buzz. Both stay quiet with reduced motion; the buzz also follows the
// Settings haptics switch and only runs where navigator.vibrate exists (Android Chrome; iOS Safari has none).
import { save } from '../kit/save.js';
import { audio } from '../kit/audio.js';
import './r11-juice.css';

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// the chain's last cat lands: one short, firm pulse (the hop ticks stay the light ones). Returns false only where
// navigator.vibrate is missing, so the caller can fall back to the native plugin path (kit/haptics.js)
export function landBuzz() {
  try {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return false;
    if (save.data.settings.haptics && !reduced()) navigator.vibrate(22);
    return true;
  } catch { return false; }
}

// how many coins fly for a payout: 6 for a replay's few coins, up to 12 for a big first clear
export function coinCount(n) {
  return Math.max(6, Math.min(12, Math.round(4 + n / 8)));
}

// one coin reached the counter (i of n): a tick, and on the last one a gold burst around the pill
export function coinLand(pill, i, n) {
  if (i % 2 === 0 || i === n - 1) audio.tick();
  if (!pill || i !== n - 1 || reduced()) return;
  const r = pill.getBoundingClientRect();
  const o = document.body.getBoundingClientRect(); // the wide-screen body (translateZ) is the containing block
  const box = document.createElement('i');
  box.className = 'r11j-burst';
  box.style.left = r.left - o.left + r.width * 0.28 + 'px';
  box.style.top = r.top - o.top + r.height / 2 + 'px';
  for (let k = 0; k < 8; k++) {
    const s = document.createElement('b');
    s.style.setProperty('--a', (k * 45) + 'deg');
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 700);
  pill.classList.remove('r11j-glow');
  void pill.offsetWidth;
  pill.classList.add('r11j-glow');
}
