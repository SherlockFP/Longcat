// R17: CrazyGames SDK v3 glue, only in a build made with VITE_PORTAL=crazygames (npm run build:crazygames, RELEASE.md).
// Docs: https://docs.crazygames.com/sdk/intro/ (init), /sdk/game/ (loading, gameplay, happytime, invite links),
// /sdk/video-ads/ (requestAd). Every call is a no-op in other builds and while the SDK is missing (blocked, offline).
import { audio } from './audio.js';

export const PORTAL = import.meta.env && import.meta.env.VITE_PORTAL === 'crazygames' ? 'crazygames' : '';
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
let sdk = null;
let adOn = false;
// the portal's own mute setting wins over the game's toggles; an ad playing silences everything too
const mute = () => audio.hold(adOn || !!(sdk && sdk.game.settings && sdk.game.settings.muteAudio));
const call = (fn) => { try { if (sdk) fn(sdk); } catch { /* 'disabled' environment: SDK calls throw */ } };

// -> Promise<boolean> the SDK is ready (never rejects; gives up after 8 s so the game still starts)
export function initPortal() {
  if (!PORTAL) return Promise.resolve(false);
  const load = new Promise((res) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.onload = () => res(true);
    s.onerror = () => res(false);
    document.head.appendChild(s);
  }).then(async (ok) => {
    if (!ok || !window.CrazyGames) return false;
    await window.CrazyGames.SDK.init();
    sdk = window.CrazyGames.SDK;
    call((k) => k.game.addSettingsChangeListener(mute));
    mute();
    return true;
  }).catch(() => false);
  return Promise.race([load, new Promise((r) => setTimeout(() => r(false), 8000))]);
}
export const ready = () => !!sdk;

export const loading = (on) => call((k) => (on ? k.game.loadingStart() : k.game.loadingStop()));
let playing = false;
// main.js calls this every 250 ms with "a board is in play and nothing covers it": only a change reaches the SDK
export function gameplay(on) {
  if (!sdk || on === playing) return;
  playing = on;
  call((k) => (on ? k.game.gameplayStart() : k.game.gameplayStop()));
}
export const happytime = () => call((k) => k.game.happytime());
// the portal's own share link (no external links in a portal build): a dare code rides on it as the 'c' invite param
export function inviteUrl(code) {
  let u = '';
  call((k) => { u = k.game.inviteLink(code ? { c: code } : {}) || ''; });
  return u;
}
export function inviteParam(key) {
  let v = null;
  call((k) => { v = k.game.getInviteParam(key); });
  return v;
}

// ads were refused for this session (Basic Launch, kids mode, ad blocker): ad buttons hide (ads.available)
let adsOff = false;
export const adsUsable = () => !!sdk && !adsOff;
export function checkAdblock() {
  call((k) => k.ad.hasAdblock().then((b) => { if (b) adsOff = true; }).catch(() => {}));
}
const CEILING_MS = 90000; // an ad that never reports back: unmute and give up
// -> Promise<{ ok, code }>: ok only on adFinished; audio is muted from adStarted (not from the request) to the end
export function requestAd(type) {
  return new Promise((resolve) => {
    if (!adsUsable()) return resolve({ ok: false, code: 'off' });
    let done = false;
    const fin = (ok, code = '') => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      adOn = false;
      mute();
      if (code === 'adsDisabled' || code === 'adblock') adsOff = true;
      resolve({ ok, code });
    };
    const timer = setTimeout(() => fin(false, 'timeout'), CEILING_MS);
    try {
      sdk.ad.requestAd(type, {
        adStarted: () => { adOn = true; mute(); },
        adFinished: () => fin(true),
        adError: (e) => fin(false, (e && e.code) || 'other'),
      });
    } catch { fin(false, 'other'); }
  });
}
