// Haptics: Capacitor plugin when present, navigator.vibrate otherwise.
import { save } from './save.js';

function cap() {
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
}

function buzz(pattern, style) {
  if (!save.data.settings.haptics) return;
  try {
    const h = cap();
    if (h && h.impact) {
      h.impact({ style });
      return;
    }
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export const haptics = {
  light: () => buzz(8, 'LIGHT'),
  heavy: () => buzz([25, 35, 25], 'HEAVY'),
  success: () => buzz([12, 30, 12, 30, 20], 'MEDIUM'),
};
