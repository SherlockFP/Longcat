// PWA glue: service worker (production only) + the "install app" prompt the browser offers on supported browsers.
let deferred = null;
let onChange = () => {};

export const pwa = {
  canInstall: () => !!deferred,
  onChange: (fn) => { onChange = fn; },
  async install() {
    const e = deferred;
    if (!e) return false;
    deferred = null;
    onChange();
    try {
      await e.prompt();
      return (await e.userChoice).outcome === 'accepted';
    } catch {
      return false;
    }
  },
};

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    onChange();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    onChange();
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}
