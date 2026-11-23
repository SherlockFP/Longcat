# Long Cat Out! assets

Source (GPT, full-size, in `art-src/`): `head_*.png`, `kitten_*.png`, `tail_orange.png`, `stars.png`, `ui_*.png`, `bg_room.png`, `app_icon.png` (`app_icon_v1.png` = rejected first try, cropped by edge).
Processed into `public/assets/`. Heads/tail/stars/icons were trimmed to the silhouette, padded 4%, resized to 256x256; stray fringe pixels and floating specks were removed.

## Orientation contract
- Heads and kitten heads: face points to the TOP of the image (up = facing north). Draw rotated by `angle = facing_radians - (-PI/2)`. Ears sit at top. Collar bell is at the bottom (neck side). Art is a front-on cute face, not strictly top-down; it still rotates fine.
- `tail_orange`: tail base at the BOTTOM (attach to body end), fluffy tip at the TOP, slight curve. Rotate so the tip points away from the body. Other breeds tint it procedurally (multiply with the breed `base` over a luminance-preserving draw).

## Files (all in public/assets/)
| file | size | note |
|---|---|---|
| head_orange.webp, head_black.webp, head_white.webp, head_calico.webp, head_gray.webp, head_siamese.webp | 256x256 | RGBA, q85 |
| kitten_red.webp, kitten_blue.webp | 256x256 | RGBA, collar color = twist color |
| tail_orange.webp | 256x256 | RGBA |
| stars.webp | 256x256 | dizzy stars cluster, RGBA |
| ui_heart / ui_coin / ui_hint / ui_star (.webp and .png) | 256x256 | RGBA |
| bg_room.jpg | 1080x1920 | JPEG q82, cover crop of 9:16 art |
| icon-1024.png, icon-512.png | 1024 / 512 | opaque, solid teal (#03eed4 approx) |

## Palette for the procedural body
`base` = main fur, `stripe` = stripes/patches, `belly` = light underside highlight. Calico and siamese carry an extra `accent`.
```json
{
  "orange":  {"base": "#f89529", "stripe": "#cf4508", "belly": "#f6d0b3"},
  "black":   {"base": "#2e2125", "stripe": "#453336", "belly": "#58474b"},
  "white":   {"base": "#f2e8e8", "stripe": "#d4c2c6", "belly": "#fffaf8"},
  "calico":  {"base": "#f8e9de", "stripe": "#f0861f", "belly": "#fff6ee", "accent": "#3d2924"},
  "gray":    {"base": "#86747b", "stripe": "#67555a", "belly": "#e1cab8"},
  "siamese": {"base": "#f2d3b5", "stripe": "#8a4833", "belly": "#fbe8d4", "accent": "#5c2c1c"},
  "kitten_red":  {"base": "#fcc17b", "stripe": "#cfa272", "belly": "#fadbbc"},
  "kitten_blue": {"base": "#e3b887", "stripe": "#ee9b43", "belly": "#f7ddbf"}
}
```
Collar colors: red `#e53935`, blue `#1e88e5`.

## Known caveats
- Heads are glossy front-on faces with soft 3D lighting; baked highlights come from the top-left, so they rotate with the sprite (minor).
- Background rug is a flat beige oval with decent contrast against the floor; if board UI needs more calm, overlay a 15% cream scrim in CSS.
