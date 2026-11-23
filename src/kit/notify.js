// Notifications stub (web Notification API). Off by default; the player opts in from Settings after level 10. While
// the page is open in the background, a reminder fires when the tip jar fills, the lives are full or a new Cat Show
// week starts. (Closed-app reminders need a push service at release; nothing is scheduled outside the page.)
import { save } from './save.js';

let timers = [];
const supported = () => typeof window !== 'undefined' && 'Notification' in window;

function show(x) {
  if (!document.hidden) return; // the player is looking at the game: no system popup
  const opts = { body: x.body, tag: x.tag, icon: 'icons/icon-192.png' };
  const sw = navigator.serviceWorker;
  if (sw && sw.controller) sw.ready.then((r) => r.showNotification(x.title, opts)).catch(() => {});
  else { try { new Notification(x.title, opts); } catch { /* mobile browsers without a service worker */ } }
}

export const notify = {
  supported,
  on: () => supported() && !!save.data.settings.notify && Notification.permission === 'granted',
  // ask the browser (only from the player's own tap on the Settings toggle) -> true when allowed
  async enable() {
    if (!supported()) return false;
    let p = Notification.permission;
    if (p === 'default') { try { p = await Notification.requestPermission(); } catch { p = 'denied'; } }
    return p === 'granted';
  },
  clear() { timers.forEach(clearTimeout); timers = []; },
  // list: [{ tag, ms (from now), title, body }]
  plan(list) {
    notify.clear();
    if (!notify.on()) return;
    for (const x of list) if (x.ms > 1000 && x.ms < 2 ** 31 - 1) timers.push(setTimeout(() => show(x), x.ms));
  },
};
