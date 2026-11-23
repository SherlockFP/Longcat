# ASSETS-V2 manifest

Sources: `art-src/v2/*.png` (magenta #FF00FF keyed, GPT-drawn). Processed: `public/assets/v2/` via `art-src/v2/proc.py` (chroma-key, trim, 4% pad, square, webp q85 alpha). Cafe placement: `art-src/v2/place.json` -> `art-src/v2/mkcafe.py` -> `data/cafe.json`.

| Group | Files | Size |
|---|---|---|
| Cat heads (happy) | head_orange, head_blue, head_pink, head_green, head_purple, head_mint, head_yellow, head_red `.webp` | 256 |
| Orange sleepy | head_orange_sleepy.webp | 256 |
| Carrier | carrier_open.webp, carrier_closed.webp (grey/white body, yellow handle, blue grille) | 384 |
| Cushion | cushion.webp | 192 |
| Obstacles | obst_puppy, obst_yarn, obst_ice `.webp` | 256 |
| Cafe shells | cafe_shell_{counter,window,cushion,patio,rooftop} `.webp` (R4: warm hexagon rooms, transparent) | 1024 |
| Counter decor | cafe_counter_{counter,pastry,lamps,chalkboard,tables,plant}.webp | 512 |
| Window decor | cafe_window_{seat,plants,bookshelf,cattree,rug,lights}.webp | 512 |
| Teaser | cafe_teaser_cushion.webp (show blurred) | 1024 |
| Residents | res_{mochi,biscuit,luna,pudding}.webp portraits; res_*_sit.webp and res_*_loaf.webp full-body (R4) | 384 |
| UI icons | ui_coin, ui_star, ui_heart, ui_hint, ui_scoop, ui_undo, ui_chest, ui_medal `.webp` | 192 |
| App icon | app_icon_1024.png, app_icon_512.png (opaque, teal bg) | 1024/512 |

data/cafe.json: x,y = sprite CENTER, w = sprite width, all fractions of the shell image (sprite webps are square incl. padding). 3rd and 6th task per area carry a resident (perks: coins_bonus, hint_discount, extra_undo, star_bonus).

Known flaws: purple head iris highlights lost slightly to the key (teal shows through in pupils on dark bg); shell edges may show faint light fringe on white backgrounds; ice block is opaque-ish blue (alpha tint in code); cafe shell counter has a small porthole mirror on the right wall; puppy sprite is wide/short (2 cells).


R4: see art-src/v2/r4/r4-notes.md (new shells, resident full-body sprites, floor spots).

## R6 cafe content (areas 3-5)
- Clean shells (no baked plants/lamps/clutter): cafe_shell_{cushion,patio,rooftop}.webp (1024, magenta-keyed from GPT).
- Unique decor 512: cafe_cushion_{rug,lamp,shelf,hammock,bench,pile}, cafe_patio_{planters,pergola,fountain,lights,lounger,tables}, cafe_rooftop_{canopy,telescope,lemon,tower,beanbags,grill} .webp. Old hue-rotated recolours are gone from cafe.json.
- Renovation clutter (unbuilt state only): cafe_clutter_{cushion,patio,rooftop}.webp, referenced as areas[i].clutter {sprite,x,y,w}.
- Residents (384): res_{noodle,pepper,clover,captain}.webp portrait + _sit / _loaf full body. Noodle=cushion t3 (extra_undo), Pepper=patio t3 (coins_bonus), Clover=patio t6 (hint_discount), Captain=rooftop t6 (star_bonus); each has value:2.
- Pipeline: art-src/v2/r6/{batch.sh,proc6.py,mkcafe6.py,comp6.py}; preview art-src/v2/r6/_comp6.png.
