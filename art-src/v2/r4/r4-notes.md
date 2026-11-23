# R4 cafe art notes

New files in public/assets/v2/ (source PNGs in art-src/v2/r4/, composite preview art-src/v2/r4/composite_areas.png, layout in layout.json, preview script comp.py):
- Shells (1024, transparent, 5 unique rooms, warm wallpaper + sun + wood/tile floor, dust sheet + paint cans bottom-front corner, no ladders): cafe_shell_counter, cafe_shell_window (replaced), cafe_shell_cushion, cafe_shell_patio, cafe_shell_rooftop (new).
- Residents (384, transparent, full body): res_{mochi,biscuit,luna,pudding}_sit.webp (upright) and res_{...}_loaf.webp (lounging). Portraits res_{id}.webp unchanged.

data/cafe.json changed: cushion/patio/rooftop now use their own shells, `flip` and area `hue` removed (they would mirror/tint the new art); all task x,y,w retuned to the new rooms. Decor sprites unchanged (reused ones keep per-task `hue`).

Place guests: left/top = x,y fractions of the shell image (sprite CENTER), width = w fraction (square sprite, translate(-50%,-50%)). Sit w=0.17, loaf w=0.15. Keep guests off the paint corner (bottom-left to bottom-centre of each shell).

Spots (id pose x y w):
- counter: mochi sit 0.40,0.80,0.17 | biscuit loaf 0.73,0.76,0.15
- window: luna loaf 0.42,0.68,0.15 | pudding sit 0.76,0.76,0.17
- cushion (no residents yet): mochi loaf 0.40,0.66 | alt sit 0.74,0.76
- patio: biscuit sit 0.70,0.78,0.16 | alt loaf 0.30,0.64
- rooftop: luna sit 0.36,0.74,0.16 | alt loaf 0.74,0.80
Any resident can stand on any of these floor spots; z-order: guests above decor. Idle: loaf = idle, swap to sit when tapped.

Known weak: shells are hexagon-shaped with different silhouette from old (window moved: counter room window is on the right wall, window room on the left); reused decor sprites in cushion/patio/rooftop are pink and don't match those themes; patio/rooftop/cushion have no residents in cafe.json yet; sit/loaf poses have no tap/eat variants.
