# Round 7 art direction: "The house the cats live in"

Inputs: fresh 390x844 frames in `qa/r7/` (01-hub, 02-l1, 03-l12-mid, 04-chain, 05-win, 06-fail, 07-cafe, 08-quests/residents/shop/show), captured with `qa/r7-capture.mjs`. Sol's diagnosis is in `qa/sol-presentation.md`. The GPT mockups are `art-src/r7/mock-*.png`, with a contact sheet at `art-src/r7/_mocks.jpg` and the prompts in `art-src/r7/prompts.sh`.

## 1. Diagnosis (why it does not pull you in)

1. **There is no world.** The gameplay is a flat teal paw-print wallpaper with UI parts floating on it: a carrier over a dotted strip, cushions under it, and a rug in space. The café is warm, but it is a different place. Nothing tells the player where these cats are, or why.
2. **There is no depth or light.** Nothing has a contact shadow or a light direction. The belt, bench and board share no surface. Everything sits at the same z.
3. **The composition is wasted.** On L1 and in the chain frame, about 40% of the screen is empty cream grid or teal (the band between the board and the boosters is 13% of the height). The chain payoff happens at the carrier, but the "Chain x2!" stamp covers an empty board.
4. **The cats read as tubes.** The bodies are even width, the faces repeat front-on, and there is no leap pose. The one thing the target mockup sells, a cat stretching across the room into a carrier, never shows on screen.
5. **Hierarchy is flat.** Every element has the same 3-4px navy rim and the same weight: counters, boosters, tabs, task rows. The win card gives a replay thumbnail more space than the next build. The fail card offers 6 equal choices and covers the board that explains the loss.
6. **The hub is a small, empty diorama.** The room takes about 38% of the screen and is mostly bare floor and paint cans. Three task rows and a menu row of 5 equal round icons take the rest. Nothing moves, nothing ticks, and nothing is waiting for you.
7. **Menus scroll with the browser default.** Daily Tasks, Residents, Shop and Cat Show are long lists inside `.pbody { overflow-y: auto }` / `.rgrid { overflow-y: auto }`, so they read as a web page, not a game.
8. **The meta runs out.** It has 5 areas and 67 stars, ending around L60 (day 4-5 for an engaged player, per the round-7 critic). After that only the repeatable rooftop party remains.

## 2. Chosen mockups (lead art director's pick)

- **Gameplay: `mock-play-a.png` "Sunny boarding room".**
  - It solves the "no world" problem in the same house as the café: an oak table under a bay window, sage walls, plants at the corners. Gameplay and hub become one place.
  - It has the strongest readability. The ivory board is the brightest neutral, so the 8 saturated felt cats pop and every pattern reads. The stitched rust rug edge has visible thickness. One warm light source from the upper right gives every cat a soft shadow down and to the left.
  - The leaping orange cat stretches from the board into the front carrier. That is the mechanic's signature image, and our clip and store-shot moment.
  - The carrier belt with rollers, the wooden bench with 5 recessed cushions, and 3 round boosters all sit on one table, so the hardware feels physical.
  - Rejected: `mock-play-b` (train station). It is charming, but it is a second world that does not connect to the café, and the busy town background competes with the board. Keep it as a possible Cat Show event skin. `mock-play-c` (evening quilt) is rejected because the pink and amber quilt squares fight the pink, red and yellow cats, which breaks the colour-readability rule. Keep it as a night or seasonal skin idea only.
  - Fix when we implement it: bench cats must be the real board colours, not grey or calico, and the navy moon cat is too close to blue. Use the existing 8 hues (orange, blue, pink, green, purple, mint, yellow, red); purple stays violet and blue stays sky blue.
- **Hub: `mock-hub-room.png` (default big room view) plus `mock-hub-building.png` (zoomed-out house).** The owner asked for both. The room view is the everyday hub: the room under renovation fills 62% of the screen, residents do jobs (a waiter cat carrying a tray), the next build is a glowing floor marker with its star cost, and the scaffold peeks through the ceiling. The building view is what you pinch out (or tap the floor rail) to see: floors stacked up, a construction shell with a crane on top, and the rooftop as a blueprint ghost. It is the "my house keeps growing" picture.

## 3. Hard layout rule: no page scroll anywhere

Owner: "menus and other screens scroll down, the scroll has no design, most things should not need scrolling."

- **Every screen must fit 375x667 CSS px without scrolling:** hub (both views), Daily, Tasks, Residents, Shop, Settings, Cat Show, win card, fail card, starter offer, no-lives, and the resident arrival. QA must assert `scrollHeight <= clientHeight` on `body` and on every `.panel`/`.pbody` at 375x667 and at 390x844.
- How each screen fits:
  - **Daily/Tasks sheet:** 2 tabs ("Login" | "Tasks"). The login calendar is one 7-cell row (each cell 44px wide, with a day-7 chest at double width). The tasks are 3 compact rows (56px) plus the chest row.
  - **Residents:** a paged 2x2 grid with page dots and swipe or arrow buttons. A card is 160x170: portrait, name, perk icon and floor tag.
  - **Shop:** a hero bundle card plus a 2x2 grid of offers. Further pages go behind tabs ("Coins" | "Boosters" | "Bundles").
  - **Cat Show:** a horizontal milestone carousel with 5 nodes visible, snapping to the current one. The weekly theme art goes in the header.
  - **Settings:** one card with 4 toggles in a 2x2 grid, plus a language segmented control.
  - **Win card:** at most 520px high (see section 5). **Fail card:** a bottom sheet of at most 300px, so the board and bench stay visible.
- **A list that truly must scroll** (later: album or event history) uses a themed `.scrollarea`:
  - `scrollbar-width: thin; scrollbar-color: var(--honey) transparent;`
  - WebKit: a 6px rounded honey thumb with a navy 1px border on a transparent track.
  - Top and bottom fade edges via `mask-image: linear-gradient(transparent, #000 16px, #000 calc(100% - 16px), transparent)`.
  - `overscroll-behavior: contain`.
  - Never use the default browser scrollbar. Remove the raw `overflow-y: auto` from `.rgrid` and `.pbody` once the screens are paged.

## 4. Gameplay screen spec (from mock-play-a)

**Layout** (share of the usable height after safe areas, tuned for 375x667 and still fine at 390x844):

| band | share | content |
|---|---|---|
| HUD | 7% | pause (40px round, left) · LEVEL tab (centre, wood plaque) · coin pill (right) |
| carriers + belt | 15% | front carrier 30% of the width, 2 queued at 20%, wooden belt with end rollers, `1/3` tag on the front carrier's roof |
| bench | 9% | one oak bench plank and 5 (or N) recessed cushions; an occupied cushion shows a curled cat in the real colour and pattern; the last free seat pulses |
| board | 56% | rug frame up to 94% of the width; ivory tiles; cell >= 40px (board size capped as now) |
| boosters | 11% | 3 round 64px glossy buttons (hint yellow, scoop blue, undo violet) with count badges, inside thumb reach |
| gap | 2% | spread top and bottom of the board |

- Kill the empty band between board and boosters. The tutorial line moves into a small speech bubble from the hinted cat, placed over the board edge, not in its own bar.

**Tokens** (add to `:root`; keep the B tokens for buttons and pills):
- `--wall #689A8D` (sage), `--wall-d #4F7D71`, `--oak #BF7948`, `--oak-d #8E5530`, `--tile #FFF0D3`, `--tile-line #E8D5B0`, `--rug #BD582F`, `--rug-d #8F3E1F`, `--ink #26334A`, `--honey #F2B544`, `--sun rgba(255,214,140,.35)`.
- Panels and pills move from teal to **cream on oak**: cream `#fff6e5`, with a 3px `--oak-d` rim instead of navy. Navy stays only for text and the primary PLAY/Next button outline. This breaks the "everything has the same navy rim" problem.

**Rendering:**
- Background: a static painted layer (`bg_play_room`), cover-fit, never tiled.
- The board sits on a table-top (`table_top` 9-slice) with a 10px down-left contact shadow `rgba(60,30,10,.28)` and blur 14.
- Draw every cat with a soft ellipse shadow offset (-3, +4) px at 25% alpha before the body.
- Body: taper the last cell to 80% width at the tail. Add a 1px light rim on the upper-right edge (`rgba(255,240,200,.6)`) and a subtle felt noise texture (an 8% alpha pattern from `tex_felt`).
- Faces: 3 expression variants per colour (happy, sleepy, cheeky), chosen per cat id so heads are not identical.

**Motion** (respect `prefers-reduced-motion`: replace each with a 120ms fade or instant):
- Tap: an 80ms crouch (scale 0.92 along the body). Then an elastic launch: the body stretches along a bezier from the head cell to the carrier mouth over 260ms, head first, tail last, with a tail snap. The cat lands with a squash and the counter pops `0/3 -> 1/3`.
- Carrier full: the door swings shut (120ms), the carrier hops (2 frames), and the belt advances with a 1-roller "stop-click" overshoot.
- Chain: the counter `x2`, `x3` appears **beside the front carrier**, never over the board. A 6% vignette and 150ms of slow motion (0.6x) play on the 2nd hop.
- Idle: the window light shafts drift by 3% opacity over 6s, and the plant leaves sway 2deg over 4s (background only, cheap, static layers).

## 5. Win and fail cards

- **Win:** a cream card (max height 520px at 375x667) with the resident of the current floor leaning over the top edge. The title comes from the result. Stars pop in.
  - A **star flies into the build meter** of the next floor task (icon + progress bar + "Build!" primary).
  - The chain replay goes full card width (16:9, autoplay, looping) only when a chain of 2 or more happened. Otherwise there is no replay. Share becomes a small icon button.
  - Order of actions: Build/Next (primary, orange) > Home (small secondary).
- **Fail:** a bottom sheet at most 300px high, so the bench, the queue and the cat that overflowed stay bright above it. An arrow points from that cat to the missing seat, with the line "Bench full: mint carrier is 2 away."
  - Buttons: Take back (free, primary) + Retry side by side. Ad, coin and Scoop rescues sit behind a "More help" chip that expands in place.

## 6. Café meta becomes a GROWING HOUSE

Owner: "the house interiors are tiny; I want house growth, a new house, floors."

**Structure.** The café is a narrow townhouse that grows upward. Each floor is one area; existing area ids map 1:1:

| floor | area id | tasks | star cost (sum) | resident(s) |
|---|---|---|---|---|
| 0 Ground: café counter | counter | 6 | 8 | Mochi, Biscuit |
| 1 Cushion lounge | cushion | 6 | 16 | Noodle |
| 2 Window reading room | window | 6 | 11 | Luna, Pudding |
| side Garden patio | patio | 6 | 16 | Pepper, Clover |
| 3 Rooftop | rooftop | 6 | 16 | Captain |
| 4+ new floors (data) | attic, bath-spa, greenhouse, music room, observatory... | 8 each | 30-40 each | 1 each |

- Floors 4+ are data-driven via `data/cafe.json` `areas[]` with a `floor` index, a `shell` image and a `room` image.
- The star sums in this table are today's values per area id.
- The owner's list puts the lounge on floor 1. The data order today is counter, window, cushion, patio, rooftop. Swapping window and cushion means swapping the two `areas[]` entries, and their costs and the resident pacing move with them. Re-run `check-econ`.
- If the integrator prefers not to touch the save, keep the data order and only map floors to it: floor 1 = Sunny Window, floor 2 = Cushion Lounge.

**Hub views:**
- **Room view (default, mock-hub-room):**
  - The current floor's room is a large painted scene filling **62% of the hub height edge to edge**, with no frame. Decor sprites are placed in it at the sizes of the mockup (a table is about 22% of the screen width).
  - The next build shows as a glowing floor marker + star cost bubble at its real spot.
  - Residents idle and do jobs, using 2-3 frame sprite loops: carrying a tray, napping, playing with yarn.
  - The ceiling strip shows the underside of the next floor with scaffold.
- Left rail: floor buttons (44px). Built floors get a check, the current floor glows, and locked floors show a padlock. Tap a floor to view its room (finished floors stay pretty to look at).
- Below the room: **one** next-build card (icon, floor progress as 6-8 segments, green star-cost button). Then the PLAY pill (pinned). Then a bottom tab bar: Home / Residents / Shop / Events. The current row of 5 round icons is removed.
- **Building view (mock-hub-building):** pinch out, or tap the house icon at the top of the floor rail.
  - It shows the whole townhouse in cross-section on a street. Finished floors are lit and cats wave from windows.
  - The next floor is a construction shell with a crane and its total star cost.
  - The floor after that is a translucent blueprint ghost, so players always see what comes next.
  - Event timers float as 3 round badges above PLAY.
- **"Add new floor" ceremony** when the last task of a floor is built (about 4.5s, skippable by tap; reduced motion shows a 600ms cross-fade + card):
  1. Zoom out from the room to the building (600ms ease-in-out).
  2. The scaffold rises on top (500ms), the crane swings in, the new floor shell drops with a squash (400ms), and a dust puff and confetti play.
  3. The camera pans up to the new floor (700ms). The blueprint ghost of the following floor fades in.
  4. Card: "New floor: Cushion Lounge!" with the new resident portrait. Then zoom into the new room.
- **The house never runs out:** after the last authored floor, show "Next floor arriving in N days" with a countdown (the monthly content drop) and a **Renovate** tier for finished floors (tier-2 decor, 4-5 stars each, 4 per floor) as the star sink in between. The rooftop party stays as a weekly social sink.

## 7. RETENTION: constant reasons to come back

Goal: every time the player opens the hub there is at least 1 thing ready and at least 1 timer ticking toward the next.

**Badge budget on the hub:** at most 3 red dots at once, in priority order: claimable reward > event ending < 24h > new feature. A timer ring (a circular progress border on a round badge) shows anything that is ticking. A dot never shows for something the player cannot act on.

**Hourly (2-6 h loops):**
| system | numbers | hub surface |
|---|---|---|
| Lives | 5 max, +1 per 25 min (existing) | heart pill with a mm:ss timer while < 5 |
| Café tip jar | each resident earns 6 coins/h; the jar caps at 8 h (about 48-380 coins) | a tip jar sprite on the counter visibly fills with coins in 4 stages; red dot at >= 50% |
| Resident request | 1 active request every 4 h (max 2 stored), e.g. "Mochi wants 6 orange cats delivered" or "fill 4 carriers without the bench"; reward 25 coins + 5 affection | speech bubble over that resident in the room; timer ring on its portrait |
| Free gift box | every 6 h: 15-30 coins or 1 random booster (10% Scoop) | gift icon on the right rail with a timer ring, red dot when ready |

**Daily:**
| system | numbers | hub surface |
|---|---|---|
| Daily login | 28-day calendar in 4 weeks; days 7/14/21/28 give a cat costume or a decor piece; a missed day pauses the streak (it does not reset) | calendar badge; dot until claimed |
| Daily tasks | 3/day + chest (existing: 40 coins + 1 Scoop) | Tasks tab badge `2/3` |
| Daily puzzle | 1 hand-tuned board/day (existing `dailyLevel()`), a streak flame counter, rewards 1 star + 30 coins, 7-day streak = golden paw frame | calendar badge with flame count; ends at local midnight (timer) |
| Affection | each resident takes 1 treat/day (tap them in the room): +10 affection; levels at 50/150/300 raise their perk by +1 and unlock an outfit | heart over a resident who still wants a treat today |
| Free daily Scoop | 1 rewarded ad per day (existing plan) | small ad chip on the Scoop booster |

**Weekly:**
| system | numbers | hub surface |
|---|---|---|
| Cat Show (existing) | 10 milestones / 44 ribbons; the final reward is an exclusive themed decor for the house; theme rotates weekly | Events badge with a 7-day timer ring; dot when a milestone is claimable |
| Visiting guest cat | 1 guest per week moves in temporarily; collect 20 fish treats (1 per win, 2 on hard) to adopt them permanently into the Album; otherwise they leave on Sunday | guest sits on the doorstep with a 0/20 treat bar |
| Weekend Kitten Rush | Fri 18:00 to Sun 23:59: kittens give double carrier fill + kitten tokens (5 tokens = 1 Scoop) | banner on the PLAY pill with a countdown |
| Rooftop party | 1 per week (was 18 h): 3 stars gives 80 coins + Scoop + a group photo in the Album | rooftop lights up in the building view |

**Seasonal and long-term:**
| system | numbers | hub surface |
|---|---|---|
| New floor drop | 1 authored floor per month (8 tasks, 30-40 stars, 1 resident, 1 new mechanic tie-in) | a blueprint ghost floor plus a "Next floor in N days" timer in the building view |
| Season "Paw Pass" | 4-week season, 30 tiers; season points from wins (3), daily tasks (5), the daily puzzle (5); free track = coins, boosters, 2 decor; premium ($4.99) = a seasonal room skin + costume + No-Ads-lite | season ribbon under the HUD with a tier number and a days-left timer |
| Seasonal room skin | every season re-themes one floor (e.g. Autumn Lantern Lounge, Winter Cocoa Counter); it stays forever | thumbnail on the floor rail, marked with a leaf or snowflake |
| Cat Album | 8 colours x 3 expressions + residents + guests + costumes, about 80 entries; completing a page (8) gives 1 star + a decor | paw tab badge with `N/80` |
| Renovate tiers | after a floor is finished: 4 tier-2 upgrades at 4-5 stars each | small hammer badge on finished floors |

**Pacing target:**
- An average player plays 6 levels/day and earns about 8 stars/day.
- Floors 0-3 + patio last about 8 days (as now).
- After that, each new floor takes 30-40 stars, which is 4-5 days. Renovate and seasonal rooms fill the remaining days of the month until the next floor drop.
- The meta therefore never ends before day 30, and the monthly drop + season keeps it open-ended.
- Check this in `scripts/check-econ.mjs` (simulate 6 and 15 levels/day for 60 days: there must never be more than 2 consecutive days with no buildable star sink).

## 8. Asset list for GPT (next round, one at a time via `studio/bin/art.sh`)

All assets use the soft painterly-3D cartoon look of mock-play-a/mock-hub-room, warm light from the upper right, and contain no text. Each prompt ends with: "Soft painterly 3D cartoon, warm sunlight from the upper right, crisp silhouette, no text, no logo, no watermark."

| file | size | alpha | purpose | prompt |
|---|---|---|---|---|
| `bg_play_room.png` | 1024x1536 | no | gameplay backdrop | "Cozy cat café boarding room seen from slightly above: sage green wall, honey oak table filling the lower 85%, bay window with sunlight upper right, hanging pothos top-left, wicker basket bottom-right, potted plant bottom-left, the centre of the table left EMPTY and evenly lit for a game board, soft light shafts." |
| `table_top.png` | 1024x1024 | yes | 9-slice board base | "Square stitched rust-red rug with visible thickness and a cream stitched inner border, lying flat, top-down, empty centre, soft contact shadow down-left." |
| `tile_ivory.png` | 128x128 | no | board cell | "Single ivory ceramic floor tile, very subtle bevel, top-down, seamless edges." |
| `belt_wood.png` | 1024x192 | yes | carrier belt | "Wooden toy conveyor belt with dark slats and two round brass end rollers, side-on, slight top-down view." |
| `carrier_{color}.png` x8 | 384x320 | yes | front carrier (door open) | "Plastic pet carrier in {color}, three-quarter view, door open to the left with a silver grille, dark open mouth, a small blank tag on its roof." |
| `carrier_{color}_shut.png` x8 | 384x320 | yes | full / departing | same, door closed, a happy cat face peeking through the grille |
| `bench_plank.png` | 1024x200 | yes | bench | "Long oak bench plank seen slightly from above with 5 round recessed felt seat hollows." |
| `cushion.png` | 192x160 | yes | bench seat | "Round oatmeal felt cushion with a centre button, slight top-down view." |
| `cat_head_{color}_{happy,sleepy,cheeky}.png` x24 | 256x256 | yes | cat heads | "Front-facing head of a chubby cartoon cat, felt-textured {color} fur with {pattern} markings, big eyes, two white paws under the chin, {expression}." |
| `cat_curl_{color}.png` x8 | 256x192 | yes | cat waiting on the bench | "Same cat curled asleep in a ball, {color} {pattern} fur, tail tip white." |
| `tex_felt.png` | 256x256 | no | body texture | "Seamless soft felt fabric texture, neutral grey, subtle." |
| `btn_hint/scoop/undo.png` | 256x256 | yes | boosters | "Round glossy {yellow/blue/violet} game button with a {lightbulb / butterfly net / curved undo arrow} icon, thick soft rim." |
| `room_{floor}_bare.png` x5 | 1024x1024 | no | hub room, empty | "Large cutaway interior of {room} in a narrow cat café townhouse, warm sunlight, wooden ceiling beams, EMPTY floor ready for furniture, no characters." |
| `room_{floor}_shell.png` x5 | 1024x512 | yes | building view, construction | "Cross-section of one townhouse floor under construction: wooden scaffold, bricks, dust sheet." |
| `building_base.png` | 1024x1536 | no | building view street | "Cobblestone town street at morning, blue sky, neighbouring houses at both sides, an EMPTY plot in the centre for a narrow townhouse, flower pots at the corners." |
| `crane.png` | 512x512 | yes | ceremony | "Small yellow construction crane swinging, hook hanging." |
| `decor_*` (existing task ids, 2 sizes) | 512x512 | yes | room decor | re-render the existing decor in this style at room scale (example: "honey-oak café counter with espresso machine and pastry dome, three-quarter view") |
| `resident_{id}_{idle,job}.png` x8x2 | 384x384 | yes | residents | "Chubby {breed} cat named {name} {job pose: carrying a tray / napping on a pillow / playing with yarn}, three-quarter view." |
| `tipjar_{0..3}.png` | 256x256 | yes | hourly loop | "Glass tip jar with a paw sticker, {empty / quarter / half / full} of gold paw coins." |
| `guest_doorstep.png` | 384x384 | yes | weekly guest | "Shy fluffy cat sitting on a doormat with a tiny suitcase." |

## 9. Integrator checklist (code)

1. `src/ui/ui.css`:
   - Add the section 4 tokens.
   - Panels go from teal to cream-on-oak, with rims in `--oak-d`.
   - Add a `.scrollarea` class.
   - Remove the raw `overflow-y: auto` scrolling from `.pbody`/`.rgrid` and page the content instead.
2. `src/game/render.js`:
   - Draw the painted backdrop, the `table_top` 9-slice and the per-cat shadows.
   - Add the tail taper, the felt texture and the rim light.
   - Use 3 face variants per colour and the curled bench sprites.
   - Move the chain counter next to the carrier.
3. Layout: the band shares from section 4. Keep cell >= 40px, and make QA assert it at 375x667.
4. `src/ui/ui.js`:
   - Hub: room view (62%), floor rail, one next-build card, a pinned PLAY pill, a bottom tab bar, and badges with timer rings (max 3 dots).
   - Building view and the add-floor ceremony.
   - Paged Residents and Shop screens, tabbed Daily, the Cat Show carousel.
   - The win and fail card changes.
5. `src/game/cafe.js` + `data/cafe.json`: add `floor`, `shell` and `room` fields, a renovate tier and a `nextDrop` date; the guest, tip jar, request and affection state go in the save (save version bump with migration).
6. `src/game/econ.js`: tip jar rate and cap, request cadence, 28-day login, gift box 6 h, Kitten Rush window, season points. Extend `check-econ.mjs` with the 60-day sink test.
7. Strings: every new label in EN+TR (natural Turkish), for example "Yeni kat: Minder Salonu!", "Bahşiş kavanozu", "Misafir kedi", "Sonraki kat {n} gün sonra".
8. QA:
   - Add frames at 375x667 for every screen in section 3, with a no-scroll assertion.
   - Add the add-floor ceremony at 3 points: zoom-out, crane drop and new-floor card.
