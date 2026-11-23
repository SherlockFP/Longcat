// Image loader. A missing file resolves to null and the renderer falls back to a procedural shape.
import { assetUrl, COLOR_PAL } from './breeds.js';

// r7 head variants: one per cat id so heads on a board are never all the same face
export const FACES = ['happy', 'sleepy', 'cheeky'];

const NAMES = [
  'head_orange.webp', 'head_black.webp', 'head_white.webp', 'head_calico.webp', 'head_gray.webp', 'head_siamese.webp',
  'kitten_red.webp', 'kitten_blue.webp', 'stars.webp',
  'ui_heart.webp', 'ui_coin.webp', 'ui_hint.webp', 'ui_star.webp',
  'bg_teal.webp', 'logo_b.webp',
  'v2/obst_puppy.webp', 'v2/obst_yarn.webp', 'v2/obst_ice.webp', 'v2/carrier_open.webp', 'v2/carrier_closed.webp', 'v2/cushion.webp',
  ...COLOR_PAL.map((c) => `v2/head_${c.name}.webp`),
  // round 7: the sunny boarding room (art-src/r7/assets.md)
  ...['bg_play_room', 'table_top', 'tile_ivory', 'tex_felt', 'belt_wood', 'bench_plank', 'cushion'].map((n) => `r7/${n}.webp`),
  ...COLOR_PAL.flatMap((c) => [`r7/carrier_${c.name}.webp`, `r7/carrier_${c.name}_shut.webp`, `r7/cat_curl_${c.name}.webp`,
    ...FACES.map((f) => `r7/cat_head_${c.name}_${f}.webp`)]),
];

export const IMG = {};

// Lighter golden variant of the orange head, so ginger reads differently from tabby.
function makeGinger() {
  const src = IMG.head_orange;
  if (!src) return;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(255,236,175,0.5)';
  g.fillRect(0, 0, c.width, c.height);
  IMG.head_ginger = c;
}

export function loadAssets() {
  return Promise.all(
    NAMES.map(
      (n) =>
        new Promise((res) => {
          const im = new Image();
          im.onload = () => {
            IMG[n.replace(/\.\w+$/, '')] = im;
            res();
          };
          im.onerror = () => res();
          im.src = assetUrl(n);
        }),
    ),
  ).then(() => {
    makeGinger();
    shiftMint();
    makeMystery();
    makeCarriers();
    makeCushionAlt();
    makeMystery7();
    sampleTones();
  });
}

// draw src through a CSS filter onto a fresh canvas; null when the engine has no canvas filters
function filtered(src, filter) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  if (!('filter' in g)) return null;
  g.filter = filter;
  g.drawImage(src, 0, 0);
  return c;
}

// The mint head art sits close to green: shift it toward aqua so mint and green cats never read alike.
function shiftMint() {
  const src = IMG['v2/head_mint'];
  const c = src && filtered(src, 'hue-rotate(24deg) saturate(0.95)');
  if (c) IMG['v2/head_mint'] = c;
}

// Mystery head: the orange head in plain grey (face still readable, no hue to mistake for a colour).
function makeMystery() {
  const src = IMG['v2/head_orange'];
  if (!src) return;
  let c = filtered(src, 'grayscale(1) brightness(1.08) contrast(0.95)');
  if (!c) {
    c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(170,174,186,0.9)';
    g.fillRect(0, 0, c.width, c.height);
  }
  IMG.head_mystery = c;
}

// r7 mystery head: the happy orange head in plain grey
function makeMystery7() {
  const src = IMG['r7/cat_head_orange_happy'];
  const c = src && filtered(src, 'grayscale(1) brightness(1.12) contrast(0.9)');
  if (c) IMG.head7_mystery = c;
}

// A blue cushion for yellow cats, so a yellow cat never melts into the yellow cushion.
function makeCushionAlt() {
  const src = IMG['v2/cushion'];
  const c = src && filtered(src, 'hue-rotate(175deg) saturate(0.85) brightness(0.95)');
  if (c) IMG.cushion_alt = c;
}

// Fur and muzzle colours read off each head, so expression overlays (closed eyes, new mouths) blend in.
export const TONE = {};
function sampleTones() {
  const read = (im, x, y) => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const g = c.getContext('2d');
      g.drawImage(im, -Math.floor(x * im.width), -Math.floor(y * im.height));
      const d = g.getImageData(0, 0, 1, 1).data;
      return `rgb(${d[0]},${d[1]},${d[2]})`;
    } catch (e) { return null; }
  };
  const one = (key, im) => {
    if (!im) return;
    TONE[key] = { fur: read(im, 0.33, 0.42), muzzle: read(im, 0.5, 0.88) };
  };
  COLOR_PAL.forEach((pal, i) => one(i, IMG['v2/head_' + pal.name]));
  one(-1, IMG.head_mystery);
}

// Carrier art is white and grey: multiply it with each color so the queue reads as colors.
function makeCarriers() {
  for (const kind of ['open', 'closed']) {
    const src = IMG['v2/carrier_' + kind];
    if (!src) continue;
    COLOR_PAL.forEach((pal, i) => {
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = pal.base;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(src, 0, 0);
      IMG[`carrier_${kind}_${i}`] = c;
    });
  }
}
