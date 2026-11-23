// Ads. Dev builds: a 2s fake overlay. Web release: a Google H5 Games Ads provider (adBreak/adConfig), OFF unless
// VITE_ADS_PROVIDER=h5 is set at build time (see RELEASE.md). Anything else grants nothing (fail closed).
import { save } from './save.js';
import { t } from '../i18n.js';
import { interstitialOk } from '../game/econ.js';
import { now } from './clock.js';
import { audio } from './audio.js';

// Dev/test builds only: a production build with no real ad plugin registered grants nothing (fail closed).
export const AD_TEST = !!(import.meta.env && import.meta.env.DEV);
const FAKE_MS = 2000;

// Build-time config (vite env). Default: no real provider. Portals that run their own ads load the game with ?noads=1.
const env = (import.meta.env) || {};
export const ADS_CONFIG = {
  provider: env.VITE_ADS_PROVIDER === 'h5' ? 'h5' : 'off',
  h5ClientId: env.VITE_H5_CLIENT_ID || 'ca-pub-0000000000000000', // placeholder until the owner has an AdSense publisher id
  h5Test: env.VITE_H5_TEST !== '0', // data-adbreak-test: test ads until the owner builds with VITE_H5_TEST=0
};
const urlNoAds = (() => {
  try {
    return /^(1|true)$/.test(new URLSearchParams(location.search).get('noads') || '');
  } catch {
    return false;
  }
})();

// ---- Google H5 Games Ads provider (loaded lazily, only when ADS_CONFIG.provider === 'h5') ----
let h5Ready = null;
const LOAD_TIMEOUT_MS = 4500;
function loadH5() {
  if (h5Ready) return h5Ready;
  const p = new Promise((resolve) => {
    window.adsbygoogle = window.adsbygoogle || [];
    window.adBreak = window.adConfig = (o) => window.adsbygoogle.push(o);
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ADS_CONFIG.h5ClientId);
    s.dataset.adClient = ADS_CONFIG.h5ClientId;
    if (ADS_CONFIG.h5Test) s.dataset.adbreakTest = 'on';
    s.onload = () => resolve(true);
    s.onerror = () => { if (h5Ready === p) h5Ready = null; resolve(false); }; // a failed load may be retried later
    document.head.appendChild(s);
    window.adConfig({ sound: 'on', preloadAdBreaks: 'on', onReady() {} });
  });
  h5Ready = p;
  // a stalled script request (captive portal, silent drop) never settles: give up this time, keep the load going
  return Promise.race([p, new Promise((r) => setTimeout(() => r(false), LOAD_TIMEOUT_MS))]);
}

const START_TIMEOUT_MS = 9000; // rewarded: how long to wait for the ad to start
const INTER_TIMEOUT_MS = 5000; // interstitial: same
// a started ad whose network never reports the end (no adBreakDone / afterAd): unmute and give up after this long
const PLAY_CEILING_MS = 90000;

// -> Promise<boolean> true only when the player watched the whole rewarded ad
async function h5Rewarded(reason) {
  if (!(await loadH5())) return false;
  return new Promise((resolve) => {
    let viewed = false;
    let done = false;
    let ceiling = null;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); clearTimeout(ceiling); resolve(v); } };
    const started = () => { clearTimeout(timer); clearTimeout(ceiling); ceiling = setTimeout(() => { audio.hold(false); finish(false); }, PLAY_CEILING_MS); };
    // the ad network never answered (blocked request, too soon after another ad): give up, grant nothing
    const timer = setTimeout(() => finish(false), START_TIMEOUT_MS);
    window.adBreak({
      type: 'reward',
      name: 'reward-' + reason,
      beforeAd: () => { started(); audio.hold(true); }, // a playing ad may run long: only a generous ceiling applies
      afterAd: () => audio.hold(false),
      beforeReward: (showAd) => { started(); showAd(); }, // the ad is starting: the start timeout must not latch a 'no'
      adViewed: () => { if (!done) viewed = true; },
      adBreakDone: () => finish(viewed),
    });
  });
}

// -> Promise<boolean> true when an interstitial was actually shown
async function h5Interstitial() {
  if (!(await loadH5())) return false;
  return new Promise((resolve) => {
    let done = false;
    let ceiling = null;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); clearTimeout(ceiling); resolve(v); } };
    const timer = setTimeout(() => finish(false), INTER_TIMEOUT_MS);
    window.adBreak({
      type: 'next',
      name: 'level-end',
      beforeAd: () => { clearTimeout(timer); audio.hold(true); ceiling = setTimeout(() => { audio.hold(false); finish(false); }, PLAY_CEILING_MS); },
      afterAd: () => audio.hold(false),
      adBreakDone: (info) => finish(!!info && info.breakStatus === 'viewed'),
    });
  });
}

function fakeAd(label) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'fake-ad';
    el.innerHTML = `<div class="fake-ad-box"><div class="fake-ad-tag">${t('testAd')}</div><div class="fake-ad-text">${label}</div><div class="fake-ad-bar"><i></i></div></div>`;
    document.body.appendChild(el);
    setTimeout(() => {
      el.remove();
      resolve(true);
    }, FAKE_MS);
  });
}

export const ads = {
  // false when no ad can ever be shown (production build without a provider, or a no-ads portal): hide ad buttons
  available: () => !urlNoAds && (ADS_CONFIG.provider === 'h5' || AD_TEST),
  // -> Promise<boolean> true when the reward should be granted
  rewarded(reason) {
    if (urlNoAds) return Promise.resolve(false); // no ad network is loaded in a no-ads build
    if (ADS_CONFIG.provider === 'h5') return h5Rewarded(reason);
    if (!AD_TEST) return Promise.resolve(false);
    return fakeAd(t('adPlaying') + ' (' + reason + ')');
  },
  interstitial() {
    if (urlNoAds) return Promise.resolve();
    const done = (shown) => {
      if (!shown) return;
      save.data.ads.lastInterstitial = now();
      save.commit();
    };
    if (ADS_CONFIG.provider === 'h5') return h5Interstitial().then(done);
    if (!AD_TEST) return Promise.resolve();
    return fakeAd(t('adPlaying')).then(() => done(true));
  },
  // Rules (econ.interstitialOk): after a win only, from level 8, 1 per 3 min, none in the first 5 minutes after install, never with No Ads.
  shouldShowInterstitial(level) {
    return !urlNoAds && interstitialOk(save.data, level, now());
  },
  isRemoved: () => save.data.ads.removeAds || urlNoAds,
};
