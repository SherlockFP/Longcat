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
    // a new deploy's worker takes over: reload once so the phone runs it now, not on some later open
    const had = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((r) => r.update()).catch(() => {});
    });
  }
  // phones: fullscreen on the first tap (browsers allow it only from a gesture; iPhone Safari has no API, it no-ops)
  if (matchMedia('(pointer: coarse)').matches) {
    const go = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    };
    window.addEventListener('pointerup', go, { once: true });
  }
}
