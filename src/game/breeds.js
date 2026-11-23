// Breed palettes (ASSETS.md) and sprite mapping.
export const HEAD_OF = {
  tabby: 'orange', ginger: 'ginger', tuxedo: 'black', calico: 'calico',
  siamese: 'siamese', gray: 'gray', black: 'black', cream: 'white',
};

// style: stripes | faint | patches | points | tux | plain
export const PALETTE = {
  tabby:   { base: '#f89529', stripe: '#cf4508', belly: '#f6d0b3', style: 'stripes' },
  ginger:  { base: '#ffb54a', stripe: '#f08a1c', belly: '#ffe3bd', style: 'faint' },
  tuxedo:  { base: '#2e2125', stripe: '#453336', belly: '#fffaf8', style: 'tux' },
  calico:  { base: '#f8e9de', stripe: '#f0861f', belly: '#fff6ee', accent: '#3d2924', style: 'patches' },
  siamese: { base: '#f2d3b5', stripe: '#8a4833', belly: '#fbe8d4', accent: '#5c2c1c', style: 'points' },
  gray:    { base: '#86747b', stripe: '#67555a', belly: '#e1cab8', style: 'stripes' },
  black:   { base: '#2e2125', stripe: '#453336', belly: '#58474b', style: 'plain' },
  cream:   { base: '#f3deb8', stripe: '#d9bb86', belly: '#fff3de', style: 'faint' },
  kitten_red:  { base: '#fcc17b', stripe: '#cfa272', belly: '#fadbbc', style: 'faint' },
  kitten_blue: { base: '#e3b887', stripe: '#ee9b43', belly: '#f7ddbf', style: 'faint' },
};

export const COLLARS = ['red', 'blue', 'green', 'purple'];
export const COLLAR = { red: '#e53935', blue: '#1e88e5', green: '#43a047', purple: '#8e44ad' };
// absolute in the browser: a relative url() set in a CSS custom property resolves against the built stylesheet
// in /assets/ (gave /assets/assets/... and missing art on the deployed build)
export const assetUrl = (name) =>
  typeof document !== 'undefined' ? new URL(`assets/${name}`, document.baseURI).href : `assets/${name}`;

// v2: one fur color per carrier color (index = COLORS in core/board.js). pat: stripes | zigzag | dots | hearts | stars | clouds | spots | plain
export const COLOR_PAL = [
  { name: 'orange', base: '#ff8a1f', mark: '#b8460a', light: '#ffc27a', pat: 'stripes' },
  { name: 'blue', base: '#1d8ef5', mark: '#ffffff', light: '#8fcfff', pat: 'dots' }, // sky blue: far from the magenta-violet purple
  { name: 'pink', base: '#ff7fb0', mark: '#b0104a', light: '#ffc0d8', pat: 'hearts' },
  { name: 'green', base: '#72cf14', mark: '#2a6e04', light: '#b5f07c', pat: 'zigzag' }, // lime, warm side of green
  { name: 'purple', base: '#b84cf0', mark: '#ffe45c', light: '#e2a9ff', pat: 'stars' }, // matches the head art's magenta-violet
  { name: 'mint', base: '#36d6cc', mark: '#ffffff', light: '#a6f4ee', pat: 'clouds' }, // aqua (head art is hue-shifted to match), cool side of green
  { name: 'yellow', base: '#ffd51f', mark: '#d9560a', light: '#fff09a', pat: 'spots' },
  { name: 'red', base: '#f0383c', mark: '#ffffff', light: '#ff8f8f', pat: 'plain' },
];
// mystery cat: a neutral grey cat with dark question marks until a neighbour leaves (no hue, never reads as a colour)
export const MYSTERY_PAL = { name: 'mystery', base: '#a9aebb', mark: '#454c60', light: '#dfe2ea', pat: 'qmark' };
export const NAVY = '#1d2b53';
