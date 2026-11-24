// Talking cats (R16): one short speech bubble at a time, at a few meaningful board moments (a freed cat, a bumped cat,
// the bench almost full, a bench chain, the last cat, a boss level), and a personality line from a café guest when it is
// tapped plus one idle line every 20-30 s. The board bubble is one reusable DOM element placed once per show (no
// per-frame work); the café reuses each guest's own .gbub bubble, so nothing new sits on the room.
// main.js: init({ game, audio, cur: () => S, pet: (id) => ui.pet(id) }) once at boot. Settings > Cat chatter
// (save.data.settings.chatter) turns it all off.
import { lang } from '../i18n.js';
import { save } from '../kit/save.js';
import { bossOf } from '../game/boss.js';
import { TALK } from '../i18n-talk.js';
import './talk.css';

// the café residents' personalities; a visitor or a new resident gets one from its id
const MOOD = { mochi: 'sleepy', pudding: 'greedy', noodle: 'proud', captain: 'proud', luna: 'shy', clover: 'shy', biscuit: 'playful', pepper: 'playful' };
const MOODS = ['sleepy', 'greedy', 'proud', 'shy', 'playful'];
export const moodOf = (id) => MOOD[id] || MOODS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % MOODS.length];
// anything open over the board: a card, a sheet, the boss intro / defeat, a chest, the hint card
const BLOCK = '#modal, #sheet, #cmodal, #smodal, #ordcer, #bossintro, #bossdefeat, #pcard, #chestfx, #cxreveal, #arrival, #tut:not([hidden])';
const GAP = 2500; // ms between two ordinary bubbles
const SHOW = 1600;

let G = null;
let o = null;
let el = null;
let sr = null;
let hideT = 0;
let lastAt = -1e9;
let voiceAt = -1e9;
let benchSaid = false;
let boss = null; // the boss on this board, or null
let lv = 0; // the level number; 0 for a Daily / Show / friend board

const on = () => save.data.settings.chatter !== false;
const now = () => performance.now();
const pick = (k) => { const p = (TALK[lang()] || TALK.en)[k]; const s = p[Math.floor(Math.random() * p.length)]; return s.replace('{name}', boss ? boss.name[lang()] || boss.name.en : ''); };
const voice = (step) => { if (now() - voiceAt < 1500) return; voiceAt = now(); o.audio.mrrp(step); };
const head = (id) => { const p = G.cellPos(id); return [p.x, p.y - G.cell * 0.35]; };
const aliveCat = () => { const c = G.board.cats.find((x) => G.state.alive[x.id]); return c ? c.id : 0; };
const announce = (s) => { sr.textContent = ''; sr.textContent = s; };

// kind: a TALK pool; x, y: canvas px of the cat; force: past the gap (the rarer moments), 'qa': past every gate
function say(kind, x, y, force = false) {
  if (!on() || !G.board || G.demo) return false;
  if (force !== 'qa') {
    if (!document.querySelector('#hud.on') || document.querySelector(BLOCK)) return false;
    if (lv && lv <= 3 && kind !== 'last') return false; // the opening stays clean: only the last cat speaks
    if (!force && now() - lastAt < GAP) return false;
  }
  lastAt = now();
  const text = pick(kind);
  const r = G.canvas.getBoundingClientRect();
  place(text, r.left + x, r.top + y);
  announce(text);
  return true;
}

// one layout read per show: the bubble's size, then it is clamped inside the screen with its tail still on the cat
function place(text, px, py) {
  clearTimeout(hideT);
  el.firstChild.textContent = text;
  el.className = '';
  el.hidden = false;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const left = Math.max(8 + w / 2, Math.min(innerWidth - 8 - w / 2, px));
  const down = py - h - 12 < 8; // no room above (the top row): the bubble hangs under the cat
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(down ? py + G.cell * 0.7 : py) + 'px';
  el.style.setProperty('--tx', Math.round(Math.max(-(w / 2 - 16), Math.min(w / 2 - 16, px - left))) + 'px');
  void el.offsetWidth; // restart the pop
  el.className = 'on' + (down ? ' dn' : '') + (G.calm ? ' calm' : '');
  hideT = setTimeout(() => { el.hidden = true; }, SHOW);
}

const hide = () => { clearTimeout(hideT); if (el) el.hidden = true; };

// ---- the café: a tapped guest says a personality line in its own bubble (a guest with a request keeps that one) ----
function line(g) {
  const id = g.dataset.id;
  const b = g.querySelector('.gbub');
  if (!on() || !b || document.querySelector(`.rqbub[data-who="${id}"]`)) return false;
  b.textContent = pick(moodOf(id));
  announce(b.textContent);
  return true;
}

function idle() {
  if (!on() || !document.querySelector('#cafe.on') || document.querySelector('#sheet, #modal, #arrival, .guest.petted')) return false;
  const gs = [...document.querySelectorAll('#cafe.on .guest.g7')].filter((g) => g.offsetParent && !document.querySelector(`.rqbub[data-who="${g.dataset.id}"]`));
  const g = gs[Math.floor(Math.random() * gs.length)];
  if (!g || !line(g)) return false;
  o.pet(g.dataset.id); // the guest's own hop + bubble (ui.pet), no reward: that stays on a real tap
  voice(2);
  return true;
}
const idleLoop = () => setTimeout(() => { idle(); idleLoop(); }, 20000 + Math.random() * 10000);

export function init(opts) {
  o = opts;
  G = o.game;
  el = document.createElement('div');
  el.id = 'talk';
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  el.appendChild(document.createElement('b'));
  sr = document.createElement('span');
  sr.className = 'talksr';
  sr.setAttribute('aria-live', 'polite');
  const ui = document.getElementById('ui');
  document.body.insertBefore(el, ui); // under #ui: a card that opens covers the bubble
  document.body.appendChild(sr);

  const wrap = (k, fn) => { const prev = G.on[k]; G.on[k] = (...a) => { const r = prev ? prev(...a) : undefined; fn(...a); return r; }; };
  const load0 = G.load.bind(G);
  G.load = (...a) => {
    const r = load0(...a);
    hide();
    benchSaid = false;
    const S = o.cur();
    lv = S.daily || S.show ? 0 : S.n;
    boss = lv && G.board.meta && G.board.meta.kind === 'boss' ? bossOf(lv) : null;
    if (boss && !G.demo) { // a cat answers the boss once its intro card is gone
      const b0 = G.board;
      let n = 0;
      const tryBoss = () => { if (G.board !== b0 || n++ > 20) return; if (!say('boss', ...head(aliveCat()), true)) setTimeout(tryBoss, 500); };
      setTimeout(tryBoss, 900);
    }
    return r;
  };
  wrap('free', ({ ids }) => {
    if (G.demo || !ids.length) return;
    const id = ids[ids.length - 1];
    if (G.state.aliveCount === 0) say(boss ? 'bossWin' : 'last', ...head(id), true);
    else if (Math.random() < 1 / 3) say('free', ...head(id));
  });
  wrap('bonk', (r) => {
    if (G.demo || Math.random() < 0.5) return;
    say('bonk', ...head(r.blockerId != null && r.blockerId >= 0 ? r.blockerId : r.who != null ? r.who : r.id)); // the bumped cat complains
  });
  wrap('land', (e) => {
    const st = G.state;
    if (G.demo || benchSaid || !e || e.kind !== 'bench' || st.benchUsed < st.benchSize - 1) return;
    const seat = st.bench.findLastIndex((c) => c >= 0);
    const p = G.benchPos(Math.max(0, seat));
    if ((benchSaid = say('bench', p.x, p.y - p.bw * 0.5, true))) voice(4);
  });
  wrap('chain', () => {
    if (G.demo) return;
    const p = G.carrierMouth();
    say('chain', p.x, p.y - G.cs * 0.3, true);
  });

  document.addEventListener('click', (e) => { const g = e.target.closest && e.target.closest('#cafe.on .guest'); if (g) line(g); }, true); // before ui.pet shows the bubble
  idleLoop();

  if (import.meta.env && import.meta.env.DEV) {
    window.__qaTalk = {
      say: (kind = 'free') => {
        if (kind === 'bench') { const p = G.benchPos(G.state.benchSize - 2); return say(kind, p.x, p.y - p.bw * 0.5, 'qa'); } // the seat the real moment uses
        if (kind === 'chain') { const p = G.carrierMouth(); return say(kind, p.x, p.y - G.cs * 0.3, 'qa'); }
        return say(kind, ...head(aliveCat()), 'qa');
      },
      text: () => (el.hidden ? '' : el.textContent),
      box: () => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; },
      hub: () => { const g = document.querySelector('#cafe.on .guest.g7'); if (!g) return ''; g.click(); return g.querySelector('.gbub')?.textContent || ''; },
      idle,
      mood: moodOf,
    };
  }
}
