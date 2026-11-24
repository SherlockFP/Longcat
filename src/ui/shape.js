// Shape lane UI: the one-time cards for the first shaped board and the first folded board, the flap's count text, its
// toast and sound. main.js calls init() at boot and levelStart() after ui.play(). State: localStorage 'lco_shape'
// (save.js keeps only its own keys, and these two flags need nothing from it).
import { t } from '../i18n.js';
import { foldLeft } from '../core/shape.js';
import '../i18n-shape.js';

const KEY = 'lco_shape';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function seen() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' ? s : {}; } catch { return {}; }
}
function mark(k) {
  const s = seen();
  s[k] = 1;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* blocked storage: the card may show again */ }
}

let game = null;
let toastAt = 0;

export function init(o) {
  game = o.game;
  // the flap tag: "3 more cats" when the flap is three cells wide or more, else just the number
  game.foldText = (n, wide) => (wide >= 3 ? (n === 1 ? t('foldMore1') : t('foldMore', { n })) : String(n));
  game.on.flap = (k) => {
    if (game.demo || performance.now() - toastAt < 1600) return;
    toastAt = performance.now();
    const n = foldLeft(game.state, k);
    if (o.toast) o.toast(n === 1 ? t('flapToast1') : t('flapToast', { n }));
    if (o.audio) o.audio.tick();
  };
  const prev = game.on.mech;
  game.on.mech = (e) => {
    if (prev) prev(e);
    if (e.type === 'unfold' && !game.demo && o.audio) o.audio.ui('sparkle');
  };
  if (import.meta.env && import.meta.env.DEV) {
    window.__qaShape = {
      reset: () => { try { localStorage.removeItem(KEY); } catch { /* */ } },
      card: () => document.querySelector('#smodal .card')?.dataset.k || null,
      info: () => (game.board ? { shape: game.board.shape ? game.board.shape.name : null, folds: (game.board.folds || []).map((f, k) => ({ need: f.need, cats: f.cats.length, left: foldLeft(game.state, k), open: !!game.state.foldOpen[k] })), w: game.board.w, h: game.board.h, cell: game.cell } : null),
      unfolding: () => game.anims.some((a) => a.type === 'unfold'),
      flapAt: (k = 0) => { const f = game.board.folds[k]; const [x, y] = f.cells[Math.floor(f.cells.length / 2)]; return game.center(x, y); },
    };
  }
}

const HEART_SVG = `<svg viewBox="0 0 220 96" class="cpill" aria-hidden="true">
  <path d="M110 88 C60 60 52 34 64 20 C76 6 98 10 110 28 C122 10 144 6 156 20 C168 34 160 60 110 88Z" fill="#BD582F" stroke="#9a4422" stroke-width="3"/>
  <path d="M110 76 C70 54 66 34 74 25 C83 15 99 19 110 35 C121 19 137 15 146 25 C154 34 150 54 110 76Z" fill="#fff0d3" stroke="#FBE3BE" stroke-width="2" stroke-dasharray="5 4"/>
  <rect x="86" y="38" width="44" height="18" rx="9" fill="#ff8a3d" stroke="#1d2b53" stroke-width="2.5"/><circle cx="126" cy="47" r="9" fill="#ff8a3d" stroke="#1d2b53" stroke-width="2.5"/>
  <path d="M138 47 H196" stroke="#e8590c" stroke-width="3.5" stroke-dasharray="6 6" stroke-linecap="round"/><path d="M190 41 198 47 190 53" fill="none" stroke="#e8590c" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const FOLD_SVG = `<svg viewBox="0 0 220 96" class="cpill" aria-hidden="true">
  <rect x="40" y="6" width="140" height="84" rx="10" fill="#BD582F"/><rect x="50" y="14" width="120" height="68" rx="5" fill="#fff0d3"/>
  <rect x="58" y="20" width="44" height="18" rx="9" fill="#5aa9e6" stroke="#1d2b53" stroke-width="2.5"/>
  <rect x="50" y="46" width="120" height="36" rx="5" fill="#EDB043" stroke="#FFF1D6" stroke-width="2" stroke-dasharray="5 4"/>
  <path d="M50 46 L86 82 M86 46 L122 82 M122 46 L158 82 M86 46 L50 82 M122 46 L86 82 M158 46 L122 82" stroke="rgba(150,80,20,.45)" stroke-width="1.5" stroke-dasharray="3 3"/>
  <rect x="86" y="54" width="48" height="20" rx="10" fill="#1d2b53"/><text x="110" y="69" text-anchor="middle" font-size="14" font-weight="800" fill="#fff6e5" font-family="inherit">3</text>
</svg>`;

function card(k) {
  document.getElementById('smodal')?.remove();
  const root = document.getElementById('ui') || document.body;
  const el = document.createElement('div');
  el.id = 'smodal';
  el.className = 'backdrop cpkb';
  el.innerHTML = `<div class="card cpk mech" data-k="${k}"><div class="cpbadge">${esc(t('shapeNew'))}</div>
<h2 class="cpt">${esc(t(k + 'Title'))}</h2>
${k === 'shape' ? HEART_SVG : FOLD_SVG}
<p class="cpb">${esc(t(k + 'Body'))}</p>
<p class="cptip">${esc(t(k + 'Tip'))}</p>
<button class="btn green sm" type="button" data-sgo>${esc(t('shapeGo'))}</button></div>`;
  el.querySelector('[data-sgo]').addEventListener('click', () => { el.remove(); });
  root.appendChild(el);
}

let timer = 0;
// the first shaped board and the first folded board each bring a card once, after any card the level opened with
export function levelStart(n, special, board) {
  clearTimeout(timer);
  document.getElementById('smodal')?.remove();
  const s = seen();
  const k = board.shape && !s.shape ? 'shape' : board.folds && board.folds.length && !s.fold ? 'fold' : null;
  if (!k) return;
  const b0 = board;
  let tries = 0;
  const show = () => {
    if (!game || game.board !== b0) return; // the player left this board
    if (document.querySelector('#modal, #cmodal, #ordcer') && tries++ < 60) { timer = setTimeout(show, 400); return; }
    mark(k);
    card(k);
  };
  timer = setTimeout(show, 350);
}
