// R11 look lane: the world changes with the chapter.
// 1. The home map: every chapter (10 levels) lies on its own ground (public/assets/r7/look-map-*.webp, chapter 1 keeps
//    the spring garden map_bg). Each chapter is a mirror-tiled layer; the next chapter's layer fades in over the last
//    ~3 levels of the one below, so scrolling shows the town changing. All static CSS backgrounds, no per-frame work.
// 2. The desktop backdrop: the sides of the phone column (index.html html::before) show a painted cat street whose
//    time of day follows the chapter. Only that wide-screen rule references the image, so phones never fetch it.
import { assetUrl } from '../game/breeds.js';

const MAP = { garden: 'map_bg', autumn: 'look-map-autumn', snow: 'look-map-snow', lantern: 'look-map-lantern', beach: 'look-map-beach', bakery: 'look-map-bakery' };
// one theme per chapter stop (data/hub.js CHAPTERS), cycling after Moon Roof; neighbours never repeat
const ORDER = ['garden', 'autumn', 'snow', 'lantern', 'beach', 'bakery', 'autumn', 'garden', 'bakery', 'snow', 'beach', 'lantern'];
const DESK = ['look-desk-day', 'look-desk-sunset', 'look-desk-snow', 'look-desk-night'];
const FADE = 150; // px the next chapter's ground fades in over (each side of the boundary)

const url = (name) => `url('${assetUrl('r7/' + name + '.webp')}')`; // single quotes: it also goes inside style="..."
export const mapTheme = (c) => ORDER[(Math.max(1, c) - 1) % ORDER.length];
export const mapBg = (c) => url(MAP[mapTheme(c)]);

// the ground under the road: one layer per chapter on screen, lower chapters first (the higher one paints on top)
export function chapterGround(first, lastLv, H, pos, len, bh) {
  const chap = (lv) => Math.floor((lv - 1) / len) + 1;
  const c0 = Math.max(1, chap(Math.max(1, first - 1))), c1 = chap(lastLv + 1);
  const edge = (c) => pos(c * len + 0.5).y; // between the last level of chapter c and the first of c + 1
  const out = [];
  for (let c = c0; c <= c1; c++) {
    const top = c === c1 ? 0 : Math.max(0, edge(c) - FADE);
    const bot = c === c0 ? H : Math.min(H, edge(c - 1) + FADE);
    const h = Math.round(bot - top);
    if (h <= 0) continue;
    // mirror-tiled lawn: every other block is flipped, so the tiles meet without a seam
    const tiles = Array.from({ length: Math.ceil(h / bh) }, (_, i) => `<i class="hmbg ${i % 2 ? 'f' : ''}" style="top:${h - (i + 1) * bh}px;height:${bh}px"></i>`).join('');
    out.push(`<div class="lookch t-${mapTheme(c)}${c === c0 ? '' : ' fade'}" style="top:${Math.round(top)}px;height:${h}px;--hm-bg:${mapBg(c)}">${tiles}</div>`);
  }
  return out.join('');
}

// the desktop backdrop for the player's chapter (index.html reads --look-desk only on wide screens)
let deskC = 0;
export function deskFor(c) {
  if (c === deskC) return;
  deskC = c;
  document.documentElement.style.setProperty('--look-desk', url(DESK[(Math.max(1, c) - 1) % DESK.length]));
}
