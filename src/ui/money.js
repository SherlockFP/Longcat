// R17 money lane: the explicit rewarded offers that live outside the existing cards (the win card's Double coins button,
// the Hint offer sheet). Taps go to main.js actions (adcoins, adhint). CrazyGames rule: a rewarded button says it is an
// optional ad (video icon) and its skip option has the same size.
import { t } from '../i18n.js';
import { openSheet } from './ui.js';
import '../i18n-money.js';
import './money.css';

const tv = '<svg class="adi" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3.5" fill="#ff5b6e" stroke="#1d2b53" stroke-width="2"/><path d="M10 9.2v5.6l4.8-2.8z" fill="#fff"/></svg>';

// a small secondary button under the win card's Next row (never beside Next) -> true when it was placed
export function dcOffer(n) {
  const next = document.querySelector('#modal .card.win [data-act=next]');
  if (!next) return false;
  const row = next.closest('.row') || next;
  row.insertAdjacentHTML('afterend', `<button class="dcbtn" data-act="adcoins">${tv}<b>${t('dcBtn', { n })}</b></button>`);
  return true;
}
export const dcDone = () => document.querySelector('#modal .dcbtn')?.remove();

// out of hints and coins: watch an ad for one hint, or not (both buttons the same size)
export function hintOffer(cost) {
  openSheet('hintad', 'nolives hintad', t('hintAdTitle'), `
<p class="hadsub">${t('hintAdSub', { n: cost })}</p>
<button class="btn green sm" data-act="adhint">${tv}<b>${t('hintAdBtn')}</b></button>
<button class="btn teal sm" data-act="closesheet"><b>${t('noThanks')}</b></button>`);
}
