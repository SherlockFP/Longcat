# Round 9 notes (for Sol)

## Juice
- Signature send: 60ms crouch, noodle stretch (head 1.6x tail speed, body thins), sideways leap arc with ground shadow, paws land first, accordion body (120ms), white-tip tail snap. ~510ms, taps overlap. Land sound/haptic/counter pop fire on paw landing. Carrier grate door swings. Legs reduced to front/back pair.
- Chain: slow-mo 0.6x for 0.25s only on 2nd+ hops; glowing trail, gold screen edge glow, rising sparkles.
- Bodies (render.js): code-made knit texture, edge stitches, inner belly shadow, soft sheen, tapered tail.

## Fun / readability
- Press preview while holding a free cat: exit lane with chevrons, speech bubble showing destination (carrier pattern badge or cushion + wait count), amber "LAST SEAT" tag (TR "SON MINDER") or red "!" if no seat. Blocked cats bonk with red lane + blocker highlight.
- Last free cushion pulses amber with "!" tag.
- L4: each free cat shows wait-count badge before first tap; tut4 text updated EN+TR.
- QA asserts L1 first carrier leaves < 10s (measured 2.6s).

## Virality
- Clip from replay (src/kit/clip.js): offscreen 720x1280 9:16 replay, skips to 2 moves before best moment (biggest chain or final clear), captions (seats taken, CHAIN xN, game strip), 2.2s end card "Can you beat it?" + link. MediaRecorder MP4 preferred, WebM fallback; PNG peak-frame fallback. L13 clip ~6.3s, ~0.75MB.
- Win card: 9:16 preview then looping video; pink "Share clip" on chain x3+ or no-park clear on 10+ cat boards; Web Share with file/text/link, else download + copy text. Challenge landing link.
- Old live-filming code removed.

## Retention
- (report pending at time of writing)

## Checks
- build, check, full QA pass (0 console errors, no scroll failures at 375x667). Nothing committed.

## Virality (r8 high finding)
- Clip (src/kit/clip.js): opens on the tight bench. Window reaches up to 4 moves back, then setup moves made with 2+ free seats are fast-forwarded, so frame 1 reads "Only ONE seat left!" (TR "Tek minder kaldı!"); caption latches through the deciding tap.
- Punch-in on the deciding tap (camera leans 1.16x on the tap, slides to the bench at 1.10x while the cushions empty, eases out before the end card). Recorded frame is a separate canvas: zoomed world, then unzoomed caption bands.
- One chain caption: the in-game "Chain x3!" stamp is off in the clip (Game.noStamp); only the top band counts CHAIN x1..x3.
- Win card: the labelled pink button is now "Dare a friend" / "Meydan oku" (text + exact-board link, live at once). "Share clip" sits on the clip preview and stays hidden until the MP4/WebM is encoded (no MediaRecorder: the captioned still is offered at once). A tap can no longer send a still by accident.
- QA: 101a asserts clip button hidden while encoding; 101b2-clip-punch frame; 101e / 101h2 assert Share clip shows once encoded.
- Not done: real iOS/Android share-sheet link survival is unverified (WhatsApp/iMessage may drop text when a file is attached; Dare a friend sends text + link only, which is the safer path).

## Retention + virality (r9, sol-r8 findings)
- Hub thread: the build card names the next resident with their portrait and the stars still to spend ("Biscuit moves in after 3 stars" / "3 yıldız sonra Biscuit taşınıyor"); a piece that brings a resident keeps "moves in". The resident row left the goals strip (no duplicate).
- Goals strip cut from 3 rows to 2. Order: claimable, a newcomer's first request, today's Daily puzzle (until played), this week's Cat Show medals (0/2, opens Events > Show), then the nearest of outfit/season/party.
- First request after arrival: live.reqArrive gives the new resident an easy ask at once (Win 2 levels, else Fill carriers; skipped if 2 requests already wait). The arrival card shows "Luna asks: Win 2 levels"; back in the hub that request leads the goals with an orange border (cleared on claim).
- Dare recipient: landing text "Tap a cat to send it. Only the front carrier boards. The others wait on cushions." (TR natural). On the challenge board the hint card says the rule, and the front carrier ("Boards here") and first cushion ("Waits here") get dashed gold rings until the first tap (static under reduced motion).
- Clipboard: shareFile returns 'saved-nolink' when the clipboard write fails; "Link copied" only after writeText resolves. Otherwise a bar at the top shows the link plus "Copy challenge link" (TR "Davet linkini kopyala"); the tap is a fresh gesture, falls back to execCommand, and if that fails too, says "Press and hold the link to copy it" with the link selected.
- QA: 90a hub thread, 90b arrival with first request, 90c hub led by that request, 90d/90e Daily + Cat Show goals (EN/TR), 91a copy bar after a refused clipboard (asserts no "copied" toast), 91b success toast + copied text carries ?c=, 91c TR bar at 375x667. 101g asserts the dare rule card + rings. 40a now expects 2 goals.
- Not done: real iOS/Android iMessage/WhatsApp link delivery still untested (needs devices). No analytics funnel for the three handoffs yet.

## Round 10 (sol-r9-3 findings: juice, virality, retention)
### Juice (high)
- Send reads at game speed: crouch is 100 ms (was 60) and deeper (head pulls back 0.28 cells, body 1.32x wide), released over the first 80 ms. Front paws shoot out on the spring, gallop (alternating) along the board, sit wide of the ears and reach 0.34 cells ahead across the gap. Hind legs kick back on take-off and tuck forward as the rear catches up in the fold. Reduced motion: no crouch/kick/tuck. Strip: qa/_leap-strip.jpg (100 ms = crouch with paws out, 160-210 ms = paws leading).
- Chain counter moved off the carrier to the strip of air under the bench (centre). It appears with the first landing and ticks per landing (x1, x2, ...), not per jump; the last landing gets the full words in gold ("Chain x3!"), a 1.3x pop, a gold sparkle burst, star sound + success haptic. The combo popup stays quiet for the counter's whole life. Strip: qa/_chain-strip.jpg; frame 103a.
### Virality (high)
- One share path: after Share clip goes out (or saves without a link) a bar offers "Send the dare link too" with a preview of what the friend gets (goal · board · seats) and one Send link button (text + link only). EN/TR, fits 375x667 (103b, 103c).
- Dares are checked on the exact board + seat count the link carries: the sender's move log is replayed on generate(n) with b seats. A run that bought a seat or used a Scoop, or that does not replay to the same result, falls back to "clear it with these seats" (always reachable).
- Match vs beat: core/search.js maxChain() searches every winning line (all boards < 1 ms). When the sender's chain is already the board's best, the link carries x=1: "Match my chain x2 on Level 2! It is the best this board allows." / landing "Match a chain x2"; the friend's tie reads "You matched ...". L13 keeps "Beat" (its best is x5).
- Funnel on one share id (link field i, random per share): dare_handoff (via clip/link), dare_open, dare_play, dare_first_move, dare_done (clear), dare_reshare (from -> to). Local counters only (kit/analytics.js stub); session-1 funnel adds first_chain and first_request next to l1/l3/l4_start/l10_reach/first_resident.
### Retention (medium)
- Newcomer loop in the room: the newcomer's first ask sits over the cat (task, progress bar, reward +coins +hearts); the Claim bubble shows its reward too; right after a claim the resident says the next reason to come back ("Next: Fill 6 carriers for Luna" or "New request in 3h. See you soon!") until the next level starts (103f-103i).
- Bug fixed: req.fresh was missing from the save defaults, so the newcomer thread was dropped on every reload.
- Cat Street first repeat lap: each shop's keeper takes a kitten apprentice (6 new sprites, appr_<id>.webp: Bun, Dewey, Sprout, Sugar, Button, Tempo). The house under construction shows the apprentice's silhouette ("An apprentice moves in"); finishing it plays the arrival with keeper + kitten ("Page's apprentice Dewey moved in!"); finished lap-2 shops show the kitten beside the keeper (103j, 103k).
### Still weak / not done
- Real iOS/Android share-sheet delivery (iMessage, WhatsApp) still untested; needs devices. The follow-up link bar is the mitigation.
- Analytics are local counters, no backend: the funnel exists but nothing is collected off-device. Phone first-session tests not run.
- The newcomer's ask also shows in the goals strip (duplicate when the resident is in the current room).
- Lap 3+ of Cat Street still repeats keepers + apprentices.

## Round 11 (sol-r10 plan, retention half)
### R1 completed rooms + Cat Street past lap 2
- "Floor complete!" is gone. A finished floor's card is the next build on the floor under construction: "✓ Ground floor done · Fluffy round rug · Next: Floor 2 · Cushion Corner · 1 more ★ needed · win a level", star pill 1/2 + Go; one tap jumps to that room. With the whole house built it leads to Cat Street; the house-done ceremony says "The house is done!" with a To Cat Street button (104a).
- Street units (src/game/street.js, data/street.js): lap 1 shops, lap 2 apprentices (as before), lap 3 = 3 visible upgrades per original shop at 2/2/3 stars (bunting garland, window planter, the shop's signature prop: bread cart, reading lamp, flower cart, tea table, pinwheel toy stand, busker stage), then 3 new shop kinds with new keepers (Fish Market/Gill, Post Office/Stamp, Yarn Shop/Purl), then endless remix laps over all 9 shops: repaint (hue/saturation), festival decoration, a guest of the lap (visitor or apprentice art), street party. Six remix laps never repeat a shop+look+guest (check-econ). Every shop shows its current look wherever it stands (street.shopLook). Upgrades/remix finish with their own arrival card. "Shops open" now counts real shops.
- In-room request dedupe: a request already shown as a bubble over its cat in the current room is dropped from the goals strip.
### R2 album, R3 pop-up week
- Residents > Album (6 pages x 4 postcards). Postcards are photos composed from game art (room/street + façade + cat), named EN/TR. Empty slots name their week and link to Events (this week) / the archive, or say when they come. A full page unlocks its framed print (6 GPT prints) with Hang in café; it hangs on a room wall (104j-104l).
- Events > Cat Show tab opens on the week's pop-up card (24 weeks of data, data/r10.js): name, postcard, 3 stamps (board A, board B, the week's first Daily clear), time left, and the one remaining action as the button (Play board B / Clear today's Daily / Claim). 3 stamps = postcard + 60 coins (104g, 104h). The boards are the existing generated Cat Show boards (generator-guaranteed solvable). Archive rows show each past week's postcard; one catch-up postcard a week once both of its boards are cleared (no coins) (104i).
### R4 Daily record, R5 resident jobs, R6 Friend Results
- Daily record: total Daily clears, each date once; 7 = Hint, 14 = Undo, 30 = golden portrait frame (on every resident portrait), 60 = café pennant, 90 = cat wall clock (ground floor). Daily win card shows "Daily record 29/30 · Next: Golden portrait frame" with the frame's silhouette; also on the Daily sheet (104p-104r). The weekly streak shield is unchanged; the record never resets.
- Resident jobs: 2 a day from a 14-day rotation (win / cat / carrier / tidy hooks), each tied to a named resident; the first one done pays 30 coins + 1 heart; then the slot shows "Tomorrow · Luna · New jobs in 5h". In Tasks and as a hub goal tile with its reward (104m-104o).
- Friend Results (Events > Friends): a dare answered and shared on is also a reply link (r = the dare's share id, pg = its target). Opening it imports the result (dedup by result id, latest 12, chain results above the board's searched maximum are rejected), the landing says it landed, and the row reads "Ana beat your ×2 · Level 13 · 5 cushions · You ×2 · Ana ×3" with Rematch on the exact board (104s-104u).
### Checks
- check-econ: R10 unit checks + the 120-day sim now asserts a resident job to claim every day from day 3 and a new collectible every week from day 15 (postcards, prints, street sights, Daily keepsakes); by day 120: 18 postcards, 4 prints, Daily record 103, 25 street units.
- New art (7 GPT sheets, art-src/r7/r10.sh + proc_r10.py): up_<shop> x6, up_bunting/planter/lights, street_+keeper_ fish/post/yarn, drec_frame/pennant/clock, print_0-5, album_book, pop_stamp, fr_letter.
### Still weak / not done
- Reply links carry no move log: the import is a plausibility check (board ceiling, clamps), not a replay.
- Virality half of the sol-r10 plan (V1-V6) not done in this round.
- The album's cycle is 24 weeks: an empty slot on a page can say "Comes in 10 weeks"; catch-up only reaches weeks since the player's first Event week.
- Remix laps reuse façades with a CSS hue turn (the windows/books shift colour too); they read as repaints, not new buildings.

## Round 11b (sol-r10 plan, virality half)
### V2 the link inside every clip
- Dare links are now a v2 token (kit/dare.js): a short typeable core `2l13-5-c3-ab12cd` (token version = generator revision, kind + board, seats, goal with an `m` for match, share id), then optional extras after a dot (base64url JSON: sender name, reply id + target, thread of the latest 3 runs, round). The core alone plays the exact board and goal; it decodes typed in capitals. Old v1 `?c=eyJ...` links still decode.
- One share id per win (main.js winDare), so the clip and the link name the same dare. The clip burns `host/?c=<core>` into the bottom band for the whole clip (frame 1 to end) and big on the end card under the goal line "Beat a chain x3 · Level 13 · 5 seats" (105a/105b/105c). The PNG fallback (peak frame) carries the band too. QA decodes the burned-in code and checks board, seats, goal and id agree with the link.
- No QR (no decoder available here to verify one scans).
### V1 one-tap share
- Dare a friend: native share sheet in one tap (text + link). No share sheet in the browser: the link is copied in the same tap and an in-game share sheet says so, previews the clip's end card (link burned in), keeps the link selectable and offers Save clip; a refused clipboard gets Copy link (fresh gesture) / select-to-copy (105d, 105f TR 667). Replaces the old copy bar.
- Share clip without Web Share files: the link is copied first, then the clip downloads, in one tap; toast "Clip saved and link copied: paste the link next to the clip" (105e).
- index.html has static link-preview text (og:title/description, icon). Per-dare preview cards need a server, so none.
### V3-V5 recipient loop
- Landing: "Deniz dares you!", goal, board · seats, the thread "Round 3 · Ana x3 -> Deniz x4 -> Your turn", the rule for new players, an optional "Your name" field (kept on this browser, shown on this player's replies), Play (105g, 105k TR 667).
- Result: both scores as chips (winner pink) + round; beat -> "Dare them back", tie -> "I matched it! Send", miss -> Retry + "Send result" (105h miss, 105i beat).
- The counter-dare carries the player's own result as the new target, the reply (their share id + target, still imported into Friend Results), the thread (latest 3 runs) and round+1, all in the URL, validated and clamped on decode. Share text: "Round 4 on Level 13: you got x2, I got x3. Your move!". The next friend lands on "Ana x2 -> Deniz x2 -> Ece x3 -> Your turn" (105j). A reply to someone else's dare no longer says "landed in your Friend Results" on the landing.
### V6 share moments
- Dare a friend is the labelled pink pill with its own headline at: the first chain x3 (plus the once-only nudge, now with room above the row), a new best chain, today's Daily first clear, Cat Show gold, Café Rush top 3, a clean sweep, any chain x3+. Ordinary wins keep Next + the round icon (105l, and an ordinary-win assert).
- New floor (floor ceremony) and new shop / upgrade / guest on Cat Street (arrival card): Share makes a 720x900 picture (the house tower over its street + the new resident, or the shop façade + keeper) with the game's link burned in (105m, 105n, 105o).
### Local share counters
- share_offer_<moment>, share_tap_<moment|clip|reply|plain|house_floor|house_street>, share_done_<shared|saved|saved-nolink|copied|nocopy|cancel>, dare_result_<beat|tie|miss>, dare_nick, plus the existing dare funnel. All in save.data.counters; nothing leaves the device.
### Checks
- check-dare: v2 core round trip, capitalised core, daily/time/match cores, full link with thread + round, hostile extras (names, ids, thread values, round, length) clamped or dropped, bad cores refused, v1 still decodes.
### Still weak
- Real iOS/Android delivery (iMessage, WhatsApp) still untested; the burned-in link is the fallback when a chat drops the caption.
- Link previews are static (one text card for every dare); no per-dare image without a server.
- No QR on the end card.
- Counter-dares are checked by replaying the sender's own run before sending (as before); an imported reply is still only a plausibility check, not a replay of the replier's moves.

## R10
- Retention half (R1-R6): completed rooms and Cat Street past lap 2, collector's album + pop-up Event week with catch-up, Daily record, resident jobs (a claim every day from day 3), Friend Results.
- Virality half (V1-V6): v2 typeable dare link burned into every clip and end card, one-tap share sheet with copy/save fallbacks, dare landing with thread + name, counter-dare result (beat/tie/miss), pink "Dare a friend" at share moments, house/street share pictures.
- Local share counters only; no backend, no QR, previews are static.

## R9 QA pass (Hermes + manual 375x667)
### Fixed
- 2-line hint cards (L4 "Only 5 seats! ...", the friend board's rule, TR texts) covered the faces of the board's bottom row. The board now lifts by the hint's extra lines (game.load tipExtra, measured from the real .tut box); 1-line hints unchanged. QA 101g asserts no cat head sits under the rule card.
- House done: "To Cat Street" re-rendered the rooftop room (the ceremony's own click listener ran before the view switch); it now opens the street. The house-done ceremony showed a scaffold + crane; it now drops in the finished rooftop. Frames 104v/104w.
- Cat Street: the floor rail covered "Your cat house" under the left house; the label now sits right of the rail (104w asserts no overlap).
- Empty album opened on page 1 (all "Comes in 7-10 weeks"); it now opens on the page with this week's postcard (104x).
- First chain headline said "Your first chain x3!" when the first chain was x4; it names the real length (EN/TR).
- TR Cat Show pay line "altın +60 altın" read as gold/gold: now "altın madalya +60 altın".
### Still weak
- Hub thread "Mochi moves in after 2 stars" counts stars to spend, while the win card says "can move in now" when the player already holds them: both true, reads contradictory.
- Third-hand dare thread labels the unnamed first sender "Your friend" though the new player never met them.
- Real iOS/Android share delivery still untested (no devices).

## R10 (six parallel lanes, merged on main: content, perf, orders, iq, shop, hub)
### What landed
- **content**: Spring cat (hops one blocker, taught L61) and Swivel bed (each neighbour that leaves opens one more exit, max 3, taught L81), in rules, solver, generator and renderer. Packs of 20 from L61: Rainy Day, Bakery Rush, Garden Party, Starry Night, then "II" laps. Each pack has its own painted room, a light ambient effect (still under reduced motion), a HUD chip, an intro card and a packs sheet. Four pack hosts move into the café (Drizzle, Brioche, Fern, Comet). Levels 1-60 are unchanged.
- **perf**: lag fix on the Canvas2D path. The room, rug, tiles and bench are baked into two underlay canvases. Still cats use sprites, the render DPR is capped at 2, an idle board draws at 30fps (12 with reduced motion), and nothing draws under the hub. Depth comes from baked shadows, a key light and rim on the cats, a vignette and a 40% parallax room. PixiJS is opt-in only (`?r=pixi` or Settings "GPU mode (beta)"), because it measured slower. Numbers are in qa/r10-perf.md.
- **orders**: every normal level is an adoption order from a Cat Street keeper (one shop per 10-level chapter). Hard levels are Urgent orders (+15) and boss levels are VIP orders (+40). There is an intro card, a keeper strip with an n/N pill at the belt's left end, and a delivery ceremony on first clears (one named cat adopted; a set of 5 pays out). The album gets an "Adopted cats" tab, and doorstep cats appear on built shops.
- **iq**: a level clock (starts on the first cat, pauses while the tab is hidden), best times, and time medals from solver par. They pay nothing. There is a time row on the win card and a Records sheet on the café rail with four tabs: Levels (replay), Record Run (5 boards on one clock), Stats with Cat IQ, and Rank. Every rival on Rank has a BOT tag; the real list needs a KV store, and `src/kit/rank-kv.js` is an unused stub.
- **shop**: a four-tab store (Offers / Coins / Boosters / Cosmetics). It has a deal of the day, a Starter pack, ad gifts (hidden without ads), booster packs including a new Extra Cushion (+1 seat on the next new level), and cosmetics shown on the real board (hats, carrier skins, Starry night / Blossom rooms). Real-money buttons are still a stub ("Coming soon" with no store backend).
- **hub**: the home screen is now a level map (road, cushion nodes, chapter signposts, cat hop after a win). The old Home tab is now "House". At ≥900px wide the column is wider and has side panels plus keys (Space/Enter, Z, H, Esc). The resident and request-bubble layout bug is fixed: no overlaps at any of the 7 sizes checked.

### Integration fixes (each its own commit on main)
- Pack rooms were invisible: perf's baked underlay always painted the sunny room. `Game.roomArt()` now picks bought shop room > pack room > sunny room. The underlay bakes it (with the pack wash) and rebuilds when the room key changes; the pack's rain/flour/petals/stars still draw live.
- The win-card time row went missing on first clears: iq added it before the adoption ceremony had shown the card. It now waits for the card (up to ~6s, idempotent).
- The level clock sat hidden behind the order keeper (both lived under the Home button). It now docks under the keeper's n/N pill, in a smaller style, clear of the bench at 375x667 and 375x812.
- On L61/L81 the order intro card stacked on top of the pack/new-piece card. It now waits until the content card closes.
- The Records rail button arrived after the hub had laid out residents, so a request bubble sat under it at 390x844 (hub QA failed). Adding the button now re-runs the resident layout.
- Turkish used two words for "level" ("Bölüm 27" on the map, "27. seviye" on Play and the HUD). All R9/R10 strings now say *seviye*, with the suffixes fixed (seviyede / seviyeden / seviyeye / seviyeler).
- A Hard/VIP tag on the locked node after the current one was hidden under the map cat. Tags on locked nodes now sit above the node.
- Shop QA frames showed a "ghost panel": the Settings card that `lang()` opens peeked out under the shop (perf's GPU row made it taller). The QA now closes it. This was not a player bug.

### Checks
- `npm run build` passes and `npm run check` passes first try: core worst generation 58.7ms, 0 search misses, econ including orders and the 120-day shop sim, web, sfx and dare.
- QA (`QA_FROM=106 QA_SKIP667=1 QA_NOGPU=1`) ran every R10 section plus the always-on basics (L5 trap, L13 chain + win card, café builds, Cat Show board): 0 errors and no scroll failures. Pixi started as pixi-webgl.

### Still weak
- Win flow is getting long on first clears: the ceremony (~2.7s, tap skips), then the win card with the time row, order bonus line, chain clip and build card. On 375x667 the card is full.
- The order intro card still covers the bench and the top board rows for ~2.5s (taps pass through). On teaching levels it competes with the tutorial line.
- Top-left HUD is crowded on narrow phones: Home, keeper door, n/N pill and the docked clock in one column. The pack chip touches the "0/3" carrier pill at 375x667.
- A bought room hides the pack room and its ambient effect (a deliberate choice: the paid item wins). Sol may prefer the pack room on its teaching levels.
- Perf: the win card is still 83-100ms per frame without a GPU (the clip recorder replays a second game). Pixi chunks (~550KB) are precached by the service worker though few players enable them. Pre-rendered cat sprites cost an estimated 15-25MB on L60 (not measured).
- Medal cuts and spring/swivel difficulty come from formulas, not playtests. Rank is mostly BOTs until a KV backend exists. Keepers order before their shop is built on the street. Past map nodes cannot be replayed (Records > Levels can). Hats and carrier skins are drawn in code, not painted.
- Coins still pile up late (shop sim leaves 8.7k-17k after 120 days): more late sinks are needed.

## R10 fix round 1 (sol-r11-1: presentation, juice, fun, retention, virality, the first-clear flow)
### Presentation
- One order row under the keeper's door: the n/N count and the level clock dock as one capsule (iq.js dock); the Urgent / VIP tag is an icon on the door. Frames r11-order-row-en/tr.
- An ordinary order's intro is a one-line bubble beside that row (no face, no reason line), so the bench and the top cats stay in view; Urgent / VIP keep the big card. QA asserts the bubble stays above the board and is not clipped (EN + TR, 375x667).
- The pack name is the level plaque's second line ("Rainy Day 6/20"), no longer touching the front carrier's 0/3 tag (r11-pack-plaque).
- Desktop: the road panel lost its PLAY (the column keeps the one primary Play); the goals live in the left panel only, the featured one first (r11-hub-desk). The resident layout ignores the hidden goals strip.
### Juice
- The win card draws the peak still about one frame after it opens and records nothing. The first Share clip tap records the clip in real time (the thumbnail plays, the button says "Making clip…"); when it is ready the button pulses and the next tap sends it. If recording fails, Share clip sends the PNG (r11-win-still, r11-clip-making, r11-clip-ready).
- Contact beats inside the existing timing: a carrier dips into the belt when a cat lands (0.32 s), and a cushion squashes and springs back as its cat launches (0.4 s). Neither runs under reduced motion (r11-chain-rebound).
- Perf proxy (QA, 4x CPU throttle, headless, no GPU) for the 3 s after a win: p50 16.7 ms; p95 was 50 ms in three runs and 66 / 133 ms in two others, depending on machine load. Not measured on a real low-end Android; rapid-tap profiling was not done.
### Fun
- Lost bench: the carrier the stuck cat needs gets a dashed pink ring (its slot, or its dot in the queue capsule) with a badge showing how many carriers must leave first (r11-fail-cue).
- After Take back: the cushion that came free gets a green ring with a check mark, and a cat that can board the front carrier right now glows with an arrow, for 3.4 s or until the next tap. Usually the bench is still full after the losing tap is undone, so the cat cue appears more often than the cushion one (r11-takeback-cue). The fresh-player test was not run.
### Retention
- The hub features ONE goal, picked in this order: one ready to claim, a newcomer's first ask, the nearest one at least half done, else the first pinned one. The tile shows its reward (coins, hearts, chest) and one route: Play for a cat, carrier or win goal, the Daily puzzle itself, Claim, or Go (r11-hub-feat-en/tr). TR "{n} taşıyıcı doldur".
- The weekly catch-up can now claim any postcard already released (its latest past week) on a page the player has started, or on this week's page, fullest page first (r10.catchWeeks). check-econ: from every start week in a 24-week cycle, the first framed print is done by event week 4 (r11-album-archive: "In the archive" slots).
### Virality
- A scannable QR (own encoder in kit/qr.js: byte mode, level M, versions 1-10) of the public https dare (VITE_PUBLIC_URL, otherwise this page's address, plus the typeable core) on the clip's end card, under the short code (still visible), and in the corner of the PNG fallback. check-dare compares two matrices, v4 and v9, with node-qrcode 1.5.4's output; 56 version/mask pairs matched in a one-off comparison. Frames r11-clip-end-qr.jpg, r11-clip-png-qr.jpg.
- Not verified: real delivery through iMessage or WhatsApp, a phone scanning the code off another screen, or a caption-stripped clip followed through first move and counter-dare.
### Overall (first-clear flow)
- The adoption ceremony now plays only for the first adoption ever, a finished set, and Urgent / VIP orders. Other first clears credit the cat immediately and name it in one row on the win card ("Nutmeg now lives at the Library · Set 1 · 2/5"), beside the clip on a replay card. Next is the one big button; a ready build rides on the café bar ("Build!"). A replay card with an adoption drops the Purr Streak line (r11-quick-adopt-en/tr).
### Checks
- `npm run build` and `npm run check` pass. QA ran only the touched sections: R10 orders, iq and hub, plus the new R11 section (QA_FROM=999 QA_SKIP667 QA_SKIP_CONTENT QA_SKIPPERF QA_SKIPSHOP QA_NOGPU). 0 errors, no scroll failures. The hub goal asserts in sections 90/104 were updated to the single featured goal but not re-run. QA_STRIPS was not re-run.
### Still weak
- The win-card time row and moment headline still make the replay card tall. The level-1-60 boards are unchanged.
- The QR has not been tested with a real phone camera.
