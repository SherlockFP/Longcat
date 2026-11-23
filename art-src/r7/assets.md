# Round 7 assets (`public/assets/r7/`, webp, magenta-keyed GPT draws)

Direction: `DIRECTION.md` (chosen `mock-play-a` + `mock-hub-room`/`mock-hub-building`). Style: soft painterly 3D felt-toy cartoon, warm light from the upper right, shadows down-left, no outlines, no text. Palette: sage #689A8D, oak #BF7948 / #8E5530, ivory #FFF0D3, rust #BD582F, cream #fff6e5.
Pipeline: `batch.sh` (GPT draws one at a time via `studio/bin/art.sh`, model fixed) -> `proc7.py` (key, slice sheets, trim, fit, webp) -> `comp7.py` (preview composites `_comp_play.png`, `_comp_hub.png`, 390x844@2x). Sheets (`carriers_open.png`, `heads_*.png`...) are the raw draws.
Color order everywhere: orange, blue, pink, green, purple, mint, yellow, red. "Anchor" = where the sprite sits in its canvas.

| file | size | alpha | purpose / anchor / slice |
|---|---|---|---|
| `bg_play_room.webp` | 1024x1536 | no | gameplay backdrop, cover-fit, never tiled. Sage wall top ~15%, oak table below, centre empty. Window light upper right. |
| `table_top.webp` | 826x1024 | yes | board base (stitched rust rug). 9-slice, insets 84px on all sides; inner ivory field is empty (draw tiles over it). Draw a 10px down-left shadow rgba(60,30,10,.28) blur 14 under it in code. |
| `tile_ivory.webp` | 128x128 | no | board cell, near-flat ivory; tile it or draw per cell with 1px gap. |
| `tex_felt.webp` | 256x256 | no | seamless grey felt, overlay on cat bodies at 8% alpha (`pattern`). |
| `belt_wood.webp` | 1024x187 | yes | carrier belt with brass end rollers. Carriers sit on its top face: surface line at ~25% of height. Scale to ~92% of screen width. |
| `carrier_{color}.webp` x8 | 384x320 | yes | front carrier, door open (hinged left). Anchor bottom-centre. Tag plate on roof is blank, draw `1/3` over it at (50%, 22%). |
| `carrier_{color}_shut.webp` x8 | 384x320 | yes | full/departing, door shut, matching cat peeking. Same anchor/size as open, swap in place. |
| `bench_plank.webp` | 1024x181 | yes | oak bench with 5 recessed hollows at x = 12.7/31.4/50/68.6/87.3% (approx; measure in `comp7.py`: cushions centred at y 42%). |
| `cushion.webp` | 192x160 | yes | felt seat; place over each hollow. |
| `cat_head_{color}_{happy,sleepy,cheeky}.webp` x24 | 256x256 | yes | cat heads, face front, centred. Pick the variant per cat id. Head diameter ~1.08 x cell. |
| `cat_curl_{color}.webp` x8 | 256x192 | yes | cat waiting on the bench, anchor bottom-centre; width ~0.8 x cushion. |
| `btn_hint/scoop/undo.webp` | 256x256 | yes | round booster buttons (yellow / blue / violet); count badge = `badge_honey` bottom-right. |
| `panel_cream.webp` | 379x191 | yes | cream panel, thin oak rim. 9-slice 32px. |
| `pill_cream.webp` | 344x154 | yes | HUD counter holder. 9-slice left/right 60, top/bottom 50. |
| `plaque_wood.webp` | 335x122 | yes | LEVEL tab. 9-slice 50px. |
| `btn_play.webp` | 405x172 | yes | glossy orange PLAY pill. 9-slice 80px (text over it, no baked text). |
| `btn_green.webp` | 338x156 | yes | green build/star-cost button. 9-slice 70px. |
| `btn_round.webp` | 268x275 | yes | round cream button with oak rim (pause, rail floors, event badges). |
| `badge_honey.webp` | 274x275 | yes | honey circle, count badge / coin disc. |
| `hud_{heart,coin,star,chest,medal,rosette,fish,yarn}.webp` | 192x192 | yes | HUD/reward icons in the new style (replace v2 `ui_*`). `fish` = guest treat, `yarn` = affection/request. |
| `icon_{home,paw,shop,trophy,gift,calendar,lock,hammer}.webp` | 128x128 | yes | tab bar, event rail, floor rail (lock), renovate badge (hammer). |
| `room_{counter,cushion,window,patio,rooftop}_bare.webp` | 1024x1024 | no | hub room background (62% of hub height, cover-fit crop top-centre). Empty floor centre/left; window/light upper right. NOTE `room_counter_bare` already has 3 baked pendant lamps: do not also place `decor_counter_lamps` on it (or hide it). |
| `room_{area}_shell.webp` x5 | 1024x512 | yes | construction/unbuilt room cutaway (scaffold, bricks, dust sheet). |
| `floor_ground / floor_lit / floor_scaffold / floor_ghost.webp` | 1024x512 | yes | stackable building-view modules, identical width and flat top/bottom edges (stack vertically with 0 gap; they overlap their own grey cornice by design). ground = door+awning, lit = finished upper floor, scaffold = under construction, ghost = blueprint outline (next-next floor; draw at 60% opacity). |
| `roof_gable.webp` / `roof_terrace.webp` | 1024x576 / 1024x534 | yes | top piece: terracotta gable with chimney / flat rooftop terrace. Same width as floors. |
| `building_base.webp` | 1024x1536 | no | street backdrop with neighbouring houses at the edges; plot in the centre ~x 25%-75% width, ground line ~y 74%. Stack floors up from there. |
| `crane.webp` | 512x512 | yes | ceremony crane with hung beam; pivot at the cab (left, ~33%,32%). |
| `decor_{task_id}.webp` x30 | 512x512 | yes | restyled room decor for all 30 existing task ids (counter_*, window_*, cushion_*, patio_*, roof_*), anchor bottom-centre. NOT yet wired to `data/cafe.json`: sprite names are `decor_<taskid>` and positions need re-placement for the new bigger rooms. |
| `res7_{id}_{idle,job}.webp` x16 | 384x384 | yes | residents (mochi, biscuit, luna, pudding, noodle, pepper, clover, captain). idle = sitting; job = tray/rolling pin/nap/yarn/nap/watering/bouquet/telescope. Anchor bottom-centre. Alternate idle/job as a 2-frame loop or swap on a timer. |
| `tipjar_{0..3}.webp` | 256x256 | yes | tip jar fill stages empty / quarter / half / full. Anchor bottom-centre. |
| `guest_doorstep.webp` | 384x384 | yes | weekly guest cat with suitcase; anchor bottom-centre. |
| `vis7_{maple,hazel,pip,frost,sakura,bean}.webp` x6 | 384x384 | yes | seasonal visiting cats (data/live.js VISITORS), from `visitors.png` (3x2 sheet) via `proc_live.py`. Anchor bottom-centre. |
| `res7_{id}_{hat,scarf,crown}.webp` x24 | 384x384 | yes | resident outfits unlocked by affection hearts (data/live.js OUTFITS), from `res_hat/res_scarf/res_crown.png` (4x2 sheets, resident order) via `proc_live.py`. Same anchor as `res7_{id}_idle`. |

## Known weak spots
- Cat long bodies/tails are NOT in this set (code draws them); the composite uses flat colour polylines only to check head/board harmony. Tail tip and felt pattern still need the render.js work in DIRECTION section 4.
- Kit pieces (panel, pill, plaque, buttons) are 270-405px wide: fine up to ~200 CSS px at 2x, soft if scaled larger. Re-draw per-piece if the hub card is wider than 360 CSS px.
- `building_floors` modules are 1.3x upscaled from the draw (792x396); the ghost outline is thin at small scale.
- Window shell (`room_window_shell`) is wider than 2:1 and was fit into 1024x512 with letterboxing.
- Belt slats have faint magenta slivers between planks, visible only on zoom; pink open door has a hairline magenta tint at the bottom-left.
- Old v2 `res_*`, `cafe_*`, `head_*`, `ui_*` are unchanged and in a different (navy-outline flat) style; they clash with r7 until replaced.
