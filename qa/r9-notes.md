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

## R10 fix round 2 (sol-r11-2: presentation, appeal, juice, fun, retention, virality)
### Presentation (win card, 375x667, EN + TR)
- Both win cards sit at the bottom and end on Next, so Next is at one height on every clear: QA measures its bottom on an adoption card, a hard-level card and a replay card (638 px in EN and TR at 375x667). Build never replaces Next any more: a ready build makes the café bar a button with "Build!".
- Time and medal are one badge (medal art, time, best / last / medal name; the next cut is its tooltip): under the title on the compact card, beside the stars on the big one. The old full-width time row is gone.
- One main reward row under the header: the cat adopted on this clear, else a ready build. Coins and stars shrink to small chips under it.
- The replay card's details sit on the thumbnail: the moment headline (else the chain / no-bench marks) is printed on the clip, the café bar moves into the column beside it, and the pay breakdown becomes the coin chip's tooltip. Only an Urgent / VIP bonus stays in words. Frames: r12-win-adopt-en/tr, r12-win-hard-en/tr, r12-win-clip-en/tr, r11-quick-adopt-en/tr.
### Appeal (orange tabby at board scale)
- The tabby (the `stripes` pattern) is drawn as one shape made of discs along the body, so bends stay round and translucent layers never double up. Its outline has shoulders just behind the head, a rounder belly between hips and shoulders, and a rump that tapers to 72%. The profile follows the body, not the cell path. Stripes are crescents wrapped to that width, thick on the spine and thin at the flanks, and every third one is a short flank mark. Baked still cats, shadows and rim light use the same silhouette.
- Tested on a long straight run, a tight zigzag and an L bend on the live renderer (`__qa.tabbyBoard()`, frame r12-tabby-board) and in the send strip (_leap-strip). Other breeds keep the round stroke until this one has been judged.
### Juice (busy moves)
- From take-off to landing, a flying cat skips the fabric composites (felt overlay, knit soft-light, dashed seams). It keeps them in the crouch, where the cat is nearly still.
- perf.mjs has a new `rapid6` scene: six sends 130 ms apart on L60. Measured at 375x812, DPR 3, GPU raster: at 6x CPU, rapid6 rAF p95 16.8 ms (max 33.4) and the x3 chain p95 33.3 ms. At 4x, everything is at p95 16.7 ms. L60run p95 16.8 ms at 6x (it was 33.3 ms in Sol's capture). qa/r10-perf-r12.json.
- Not done: no separate lower-DPR canvas for moving cats (moving cats share the board canvas with the baked still cats, and changing its DPR mid-move re-bakes every sprite), no real low-end Android, no software-raster rerun.
### Fun (curated L6, L9, L11; core/curated.js)
- L6 "last cushion": the last orange sleeps under a ladder of five cats, so freeing it needs all five seats. The orange that comes out fills its carrier, and the blues and pinks hop in as a chain of 5. The trap is a green that wakes halfway. When every seat is full and a cat the front carrier takes is free, the card says so (r12-l6-start, r12-l6-full, r12-l6-chain).
- L9 "the big pair": the obvious park (a big green mother + kitten by the thumb) is a proven loss from the moment it parks, because it takes 4 + 2 seats. Parking the small orange first wins. The pair park is named at once (r12-l9-pair), and the loss card gives the board's own tip (r12-l9-fail).
- L11 "boards now": four stacks where only the top cat can leave, and every pink is in one stack. After a lost bench, Take back leaves a winning board in 92% of random losses (r12-l11-start-tr).
- Probe (scripts/curate-probe.mjs, exhaustive): random-play wins L6 12.3% / L9 2.7% / L11 24.1% (generated L5-11: 12-26%). Fewest seats: 5 / 4 / 4. Best chain: 5 / 5 / 5. Take back recovers 38% / 3% / 92% of random losses.
- Each curated board names its idea on the first try and the way through on a retry, and the lost card uses the board's own tip. L6 and L11 are 6x7 so their one-line card never covers a row of cats at 667 px. L9 needs 8 rows, so its lines are toasts.
- Dare links: the token is now 3. A token-2 or v1 link opens the generated board it was made on (`boardOf(n, rev)`), and a reply to an old link keeps token 2. check-dare and check-core cover both. Analytics: cur_win / cur_fail with tries and moves. Not done: the fresh-player playtest of the bench rule.
### Retention (one resident's thread)
- Until three residents live in (up to L24), the hub features the next resident with the exact remaining action ("Mochi moves in after 2 more wins", or "Build the Pastry display for Mochi"). The win count accounts for hard levels paying 2 stars. The win card's café bar carries the same line with the resident's portrait and the stars toward them, and the room's build card names it too (r12-thread-hub-en/tr, r12-thread-win-en/tr).
- A newcomer always arrives with its first request on the arrival card: with two requests waiting, it takes the place of the oldest one nobody has started.
- Measuring: thread_map / thread_win (with session and wins left) and thread_done (with session and a first-two-sessions flag). The check-econ pacing puts the first three residents at L3 / L5 / L11. Not measured with players.
### Virality
- One address everywhere (`dare.publicBase()`): the shared link, the code burned into the clip and the QR all start with VITE_PUBLIC_URL when the build names one, else this page. A release build without it prints a warning. QA serves with a public-form URL, and the frames show example.github.io/long-cat-out/?c=3l13-... in the code and the QR (r12-clip-end-qr.jpg). QA asserts the link, the code and the QR share one address.
- Dare a friend stays the one-tap link. The clip button now says what its first tap does ("Make video" / "Video yap"), counts up while the video is made in real time ("Making 45%", a filling pill), then says "Send video" (r12-win-clip-en, r12-clip-making, r12-clip-ready). Without MediaRecorder it still says Share clip and sends the PNG.
- Not verified: iMessage / WhatsApp delivery, caption-stripped receipt through first move and counter-dare, scanning on a real phone.
### Checks
- `npm run build` and `npm run check` pass (core including the curated boards and the old-rev board, econ, web, sfx, dare). One check run right after perf.mjs hit the 60 ms generation limit once (L16 116.8 ms, machine load); the rerun passed (worst 47.2 ms). QA ran the touched sections: R11 + a new R12 section (`QA_FROM=999 QA_SKIP667 QA_SKIP_CONTENT QA_SKIPPERF QA_SKIPSHOP QA_NOGPU`; QA_SKIP_R12 skips the new one), 0 errors, no scroll failures. QA_STRIPS reran (leap + chain strips). perf.mjs reran (label r12). The 90s-105 hub and dare sections were not rerun. The thread goal only shows up to L24, so their saves at L27+ are untouched, but section 17 (an L5 hub) was not checked.

## R11 (sol-r11-3: six parallel lanes merged on main: juice, appeal, fun, vir, ret, pres)
Merged in that order from main d204fce. The only textual conflicts were the appended QA sections in scripts/qa.mjs (every section kept, in merge order) and the import lines in src/main.js and src/ui/ui.js (both sides kept). game.js combined cleanly: the juice split-frame routing, pres' header clamp, fun's drawUnder/drawTop hooks and appeal's render.js changes all coexist. fun's marks draw on #game, which sits over the still-board layer, so the ghosts and lines stay crisp during a split frame.
### Presentation (fix 1)
- One Play on the map: the current node is a level marker (number, pulse ring, cat; still tappable, its name in aria-label). The featured goal drops a Play-only button, so its line fits on one row. The build card's resident line wraps to 2 lines (11.5 px) instead of cutting.
- The front carrier's n/3 tag clears the LEVEL plaque by 7 px at 360x640 and 375x667, in EN and TR. This uses `PLAQUE_B = 47` in game.js layout(), and the board sits about 11 px lower at 667.
- Shared card radii (24 / 16 px) and shadows across the build card, featured goal, win café bar and adoption row. The shop balance and close button share a centre line. At 1600x900 the side panels start at one height. Frames: r11-pres-*.
### Appeal (fix 2)
- Every breed (and the mystery cat) now uses the tabby's shaped body: shoulder swell, belly and a rump tapered to 72%. Markings are clipped to the outline, sized to the local width and wrapped around bends, with a side mark per row. Zigzag width, highlights and seams follow the profile. A soft shade joins the head to the shoulders. The still-cat sprite cache already used bodyShape. Frames: r11-appeal-board, r11-appeal-late (375x812 @3x).
- Open for Sol / owner: hearts point toward the head, so they are sideways or upside down on cats facing left or down (visible in r11-juice-chain-split). Yellow's side spots read as dashes at 1x. Mystery question marks stay upright.
### Juice (fix 3)
- Split frames while cats move. The still board sits on its own crisp layer (#pf-board) and redraws only on change. Moving cats and effects draw on a 0.65x layer (#pf-fx). The belt, resting carriers and the counter ribbon are baked. The edge glow, flash and ring are DOM layers.
- Result: the x3 chain went from 83.4 to 33.4 ms p95 at 6x CPU with software raster (qa/r10-perf.md R11 table). Nothing was measured on a physical phone.
- Final-landing beat: camera punch, warm flash + gold ring, a bigger springy "Chain xN!" and a 22 ms buzz (follows haptics; off with reduced motion). The lid now slams with squash and stretch. Win coins scale 6-12 with the payout and land with ticks and a burst. Frames: r11-juice-*.
### Fun (fixes 4 + 7)
- Bench preview: holding a cat that would park shows ringed cushions with dashed lines to the carrier it waits for and a "how many ahead" badge. Ghost cushions hold the seats until the cats land. It shows on L1-20, teaching levels and dares, and not on the Daily, Show or Rush.
- Take back rewinds to the latest position the solver proves winnable (toast "Rewound {n} moves to a winnable spot"). If nothing is proven, it takes back 1 move and promises nothing.
- Teaching levels (L1-4, 6, 8, 9, 11, 12): the first loss offers "Back to that tap" / "O hamleye dön". It rewinds to the tap that made the loss certain and marks that cat ("!", lane, orange ghost cushions).
- L1-12 losses cost no life. The first-session bot (scripts/r11-fun-session.mjs, qa/r11-fun.md) found L9 a wall (18% first-try) and lives running out in 81% of runs. With the fixes, stalled runs fall from 243/300 to 13/300, but that number models player responses rather than measuring them. Frames: r11-fun-*.
### Retention (fix 5)
- After the early resident thread, the map strip becomes the nearest album reward. It shows the postcard, the page line, the exact step ("3 stamps: clear Show board A") and one button straight there (Board A/B, Daily, Claim, Get). A goal ready to claim keeps the strip. On wide screens the same card sits in the left panel under Album.
- A completed page opens its print's room with a "Hang the print" card (Hang focused, Later). From the 3rd win of a day, the win card names tomorrow ("3 wins today! Tomorrow: ...").
- Save key `save.data.ret = { wd, wn, hang }`. check-econ now asserts a concrete goal on every visit of the 120-day sim, and that the album card is the goal on 238/238 visits with a reward open. Frames: r11-ret-*.
### Virality (fix 6)
- Dare a friend shares the text + production https link at once. `.env.production` sets VITE_PUBLIC_URL=https://longcat-746.pages.dev/; the dev and QA frames still show example.github.io.
- A new round QR button beside it shares a 720x860 PNG card with a 176 px QR.
- The video now records in the background about 0.7 s after the win card opens. It uses 360x640 on weak or lagging devices. The end-card QR grew to 168 px and holds 2.8 s; the module probe at 360 px wide reads 4.1-4.3 px per module with 0 errors.
- The received path (landing, name, first move, counter-dare round 2, thread) was checked headlessly. Frames: r11-vir-*.
### Integration fixes (on main after the merges)
- The hub QA expected "27. Seviye" in the current node's text. pres moved the name to aria-label, so the assertion now reads aria-label.
- The rewind toasts fired while the fail card was still up, so they used the big modal toast: 4 lines over L9's marked bottom-row cat. They now use `ui.toast(text, 'funtoast')`: over the booster bar, wrapping to 2 lines, never over the board (r11-fun-culprit-en/tr).
- On wide screens, win coins, the win star, the juice burst and the resident coin burst flew about 500 px to the right, into the side panel. The translateZ body is the fixed elements' containing block, so positions now subtract the body rect (ui.js flyCoins/flyStar, r11-juice.js coinLand, live.js). This bug predates R11; juice's bigger coin flight made it obvious.
- The wide-screen album card cut "Next postcard · Dress-up Days 0/4" with an ellipsis. Its page line and title now wrap in the side panel.
### Checks
- `npm run build` and `npm run check` pass: core (gen worst 46.8 ms, search misses 0), econ incl. the ret additions, web, sfx and dare.
- QA ran `PORT=5193 QA_NOGPU=1 QA_FROM=106` with CONTENT, PERF, ORDERS, IQ, R11 and R12 skipped. That covers the 667 pass, shop, hub and all six R11 lane sections: 0 errors, no scroll failures. The pass was rerun after the fixes (667, shop and appeal skipped on the rerun).
- Another session committed acdabe8 (r7.css, hub resident pose) on main during integration.
### Weak / open for Sol
- Hearts orientation and pink busyness on the shaped body (appeal). Shaped bodies in flight cost more per frame and have not been measured on a low-end phone.
- The split frames add six full-screen canvases (about 5 MB each at DPR 2), with memory unmeasured. Big late boards still idle at 50-66 ms p95 at 6x software raster. In themed packs, rain and petals draw over still cats during a split.
- TR "O hamleye dön" wraps to 2 lines in the fail card's green button (readable, crowded). L7 is a third difficulty spike (54% first try) and was not retuned.
- The catch-up board is almost always offered ("2 boards: clear board A of <old week>"), which can feel like a chore. The tomorrow line is thin with no residents. The room hang card does not say how to change rooms. The ret strip is unchecked at 360x640.
- Background recording now runs on every chain or clean win card. The older r11 assertion "the win card must not record before the player asks" passes only because it reads at 350 ms, before the 760 ms start, so it should be reworded. The friend-win thumbnail says "Share clip" for about 0.7 s.
- Nothing was tested on real phones: QR scanning, iMessage / WhatsApp delivery, haptics, perf.
- The map's locked top nodes are partly under the top bar (pre-existing). The L6 teaching card covers part of the bottom row, a little more now that the board sits 11 px lower.

## R11 fix round 1 (sol-r12-1: presentation, juice, fun, retention, virality)
### Presentation
- Teaching cards get their own slot. main.js measures the whole card (`tutBox`). game.js layout() keeps the bottom row of cells above the card's tail. Before, the r7 bubble was allowed to sit 34 px into the rug. QA measures the gap between the tail and the bottom row on L4, L6 and L7, at 360x640 and 375x667, in EN and TR: 2-5 px in all twelve cases (r11-pres-l6-*, r11-pres-l7-*).
- The map keeps a safe band under the hub's top bar. `.hmscroll` fades out under it (a CSS mask), so a locked node scrolled up there fades away instead of sitting half-hidden behind the heart and coin pills (r11-pres-map-*).
### Juice (perf.js, game.js)
- Idle hold. On a slow phone (a whole-board frame is followed by a late rAF; the reading only updates on whole-board rasters) or with reduced motion, a quiet board keeps its still cats on #pf-board. That layer is redrawn only when something on it changes, so there is no 30 fps raster of every cat. The moving layer and the counter strip are cleared once and then left alone.
- A slow board is drawn the same way every time (`idleHeld`). It has no breathing, twitch, wag, look-around, arrow bob or dog breathing, and one cat at a time blinks on a 1.7 s schedule. That makes partial redraws seam-free. A change redraws only a clipped rectangle: a cat that left, an arrow that came or went, the blinking cat, a mystery or frozen cat that changed, a dog's z count, or a dog's whole zone when it leaves. Cats outside the rectangle are skipped. Most of the board, or more than 6 cats, still gets one clean whole redraw (`__perf.why` counts the reasons). Fast phones keep the old live board unchanged. The slow switch has hysteresis.
- Measured with perf.mjs, 375x812 at DPR 3, x6 CPU, software raster (qa/r10-perf-r11f1-sw.json; R11 numbers in brackets). L60 idle p95 16.8 (66.7). L60 sprint 50.1 (66.6). rapid6 66.7 (99.9). Chain x3 33.4 (33.4). Whole-board redraws in rapid6 fell to 3, with 30 partial ones. GPU raster at x6 is 16.7-16.8 everywhere (r10-perf-r11f1-gpu.json). Overlapping taps and landing timing are untouched: rules, pending events and the clock are not changed.
- Not met: rapid6 and the L60 sprint are still above 33 ms p95 under headless software raster. Measuring on a physical low-end Android (and the win card while the video encodes) is still open. The moving layer still clears its full canvas every frame (its bounds were not tightened).
### Fun
- L9: before any tap the big pair wears a tag over the kitten: "2 seats" / "2 minder", two cushions, and an orange wait badge (3 = carriers before green). Green's dot in the carrier queue gets a dashed ring with the same number. The tag is static, so the idle hold stays idle. It stays until the pair leaves the board, and the press preview takes over while a finger is down (r11-f1-pair-cost-en/tr).
- L7 is now a curated warm-up (core/curated.js): 9 cats in 3 colours. A blue and a pink sit on the last orange and a pink sits on another orange. Park them and the bench empties on its own. Probe: random play wins 72.3%, 3 seats are enough, best chain 5, Take back recovers 100% of random losses. Lines: "Free the oranges first. The bench empties by itself." / "Önce turuncuları kurtar. Minderler kendiliğinden boşalır." The rewind is unchanged as the recovery path.
- Dare links: board revision 4 = also the curated L7. A new link carries the oldest revision that plays its board (`linkRev`), so only L7 links say `4l7-...`. Every other link still says 3, and a rev-3 L7 link keeps the generated board. check-core and check-dare cover both.
### Retention
- albumNext ranks a claim first. Next comes an archived week that is one clear from its postcard or would finish a page (`promo`), then this week's postcard. Any other archived week is `old`. dayGoal puts the Daily, a resident job and a resident request ahead of an old board, and the map strip gives an old board's place to the featured goal. check-econ has a unit case, and the 120-day sim asserts an old board only leads when nothing fresher waits.
- A bridge ask: with exactly two residents in (Mochi and Biscuit) and no win request waiting, the newest one asks at once for three wins. It is named, leads the hub like a newcomer's ask, comes once per save (`req.bridge`) and pays like a normal request. check-econ covers it.
### Virality
- The QR button is "Share card" / "Kartı paylaş", printed on a small tag over its rim (also its aria-label).
- From the first frame of the win card the replay thumbnail carries a line under it: "Preparing video" / "Video hazırlanıyor" until the clip is ready, then "Send video" / "Videoyu yolla". The pill on the thumbnail fills from 0% right away. On the big card the line stays on one row and the thumbnail gives up that height, so Next stays at 638 px in EN and TR (r12 check).
- Not done (needs real phones): iMessage / WhatsApp delivery of the link, the QR image and a captionless video, through first move and counter-dare.
### Overall
- Not done: the uninterrupted fresh-player phone session (first resident build, L6-L9, first dare). The local counters for it (cur_win / cur_fail, thread_*, dare_*) are unchanged.
### Checks
- `npm run build` and `npm run check` pass (core including L7 and the rev-4 links, econ, web, sfx, dare).
- QA ran these touched sections: R11, R12, R11J (with a new idle-hold / partial-redraw check), FUN, VIR, RET and PRES. Flags: `PORT=5193 QA_NOGPU=1 QA_FROM=999` with 667, content, perf, shop, orders, iq, hub and appeal skipped. Result: 0 errors, no scroll failures.
- One R12 failure was found and fixed: the "Preparing video" line on the big card pushed TR Next to 650 px. A QA change: the Share card tag hangs over the round button's rim, so that button skips the overflow test and the tag is checked on screen instead. QA_STRIPS was not rerun because the leap and chain strips are untouched.

## R11 fix round 2 (sol-r12-2: presentation, appeal, juice, fun, retention, virality)
### Fun (high)
- L9's pair tag now has two lines: "2 seats", then the queue in words, "Green in 3 carriers" / "Yeşil 3 taşıyıcı sonra gelir" (`game.pairWait`, `fun.pairWaitText`). The two cushion icons sit at the tag's right end. A dashed line in the pair's colour runs from them along the rug's right edge to the ringed green carrier (or its queue dot), which keeps its number badge. The tag is still static, so the idle hold stays idle. On a narrow board the type shrinks so the line is never cut.
- Not done: the fallback for fresh players who still fail L9 (a recoverable early park, a tighter seat rule moved to the next pair board). It depends on watching real players, and that has not happened.
### Presentation
- Early map: the goal strip keeps "Mochi moves in after 2 more wins". The build card no longer repeats it. It says what the piece needs: "1 more ★ needed · win a level" or "Ready to build" (`small.thread.tcost`).
- L9: every curated board up to 8 rows now puts its line on the teaching card, so L9 is included (`curCard`). The old ellipsised toast is gone. The card slot is measured from the taller of the rule and the cue that can replace it mid-level ("That pair took 2 seats…" / "Every seat is full…"), so neither one covers the bottom row.
- QA PRES now covers L9 at 360x640 and 375x667, EN and TR: the whole rule on the card, no clipped toast, the card-to-bottom-row slot and the tag-to-plaque gap. It also takes the L9 fail sheet (r11-f2-pres-l9-fail-*) and checks that the build card differs from the strip.
### Appeal
- Pink hearts and the green zigzag step down over the last cell before the head. Hearts shrink to 60% and the zigzag narrows and thins. The mark colour also eases toward the fur colour (opaque blend, so overlaps never darken), and the hearts are a little smaller along the whole back (0.27 -> 0.25 w). Faces and exit arrows read first. Frames: r11-appeal-board, r11-appeal-late (L220), r11-f2-appeal-l9 (375x812 @3x).
### Juice
- On a moving frame, the moving layer (#pf-fx) clears only the union of last frame's and this frame's bounds, and draws clipped to this frame's bounds (`Perf.fxBounds`). The bounds cover each running cat from tail to head along its path (with room for paws, the airborne head, its shadow and the streaks), a hop's arc, a dog's trot and every particle. The sweep, a camera push-in or shake, an unknown animation, or more than 70% of the layer still clear it whole. A clip means a missed rectangle cuts a shape rather than leaving a ghost. QA R11J checks a mid-sprint frame: no pixel outside the bounds, the sprinting cat inside them.
- Rules, pending events, the clock, overlapping taps and paw-landing timing are unchanged.
### Retention
- Each missing album slot that can be worked on shows its exact step and one button: "3 stamps left · Board A", "1 clear left · Board B", "All 3 stamps in · Claim", "Both boards cleared · Get", or "Catch-up opens in 2d 4h" when this week's catch-up is used. `cardStep` in game/r11-ret.js builds the step with the same functions albumNext ranks (popStep / archStep), so the album and the map's strip can't disagree. check-econ asserts that they agree on every visit of the 120-day sim, plus unit cases for catch and wait.
### Virality
- The QR (Share card PNG and the clip's end card) carries the reply context on a counter-dare: `-r<target>-<answered id>` after the share id, still lower case (`dare.qrCode`, decoded by the same V2 pattern, which also accepts an optional `-<round>`). A scanned counter-dare now lands in the first sender's Friend Results like the text link. Names, the thread and the round stay in the link, so on the production address a chain or seats reply stays at QR version 4 up to 3-digit levels (check-dare asserts this). The QA address is 9 characters longer and steps up to version 5: it reads at 3.7-3.9 px a module at 360 px wide with 0 errors, against 4.1-4.3 for v4. A time-goal reply can also reach v5 in production. The printed URL on the clip keeps the short typeable core. check-dare covers the round trip, clamping, a hostile tail and capitals. QA VIR checks the counter-dare QR payload, its read at 360 px wide, and a scan landing in Friend Results (r11-f2-vir-reply-card.jpg, r11-f2-vir-qr-reply-landing).
### Overall / not done
- Not done: physical-phone perf, iMessage / WhatsApp delivery, and a fresh-player session. Nothing was run on a real phone.
### Checks
- `npm run build` and `npm run check` pass: core (search misses 0, worst gen 51.4 ms), econ (including the album/map agreement), web, sfx and dare.
- QA covered the touched sections (`PORT=5193 QA_NOGPU=1 QA_FROM=999`, with 667, content, perf, shop, orders, iq and hub skipped): R11, R12 (L9 now expects its lines on the card), R11J, APPEAL, FUN, VIR, RET and PRES. 0 errors and no scroll failures. VIR, RET and PRES were rerun after two QA fixes, both in the test code: the album check now looks up this week's slot by its week, and the reply-QR threshold now depends on the address length. A late tweak hides the pair tag and its line under the fail sheet, and PRES was rerun after it.
- New frames: r11-f1-pair-cost-en/tr, r11-pres-l9-*, r11-f2-pres-l9-fail-*, r11-pres-map-* (build card), r11-f2-appeal-l9, r11-appeal-late, r11-f2-juice-sprint-bounds, r11-f2-ret-album-en/tr, r11-f2-vir-reply-card.jpg, r11-f2-vir-qr-reply-landing.
- perf.mjs was not rerun (heavy job), so the rapid6 / sprint p95 under 6x software raster after the moving-layer bounds is unmeasured. Measure it first next round.

## R11x (four side lanes merged: sound, look, shape, boss)
### What merged
- Merged into main with --no-ff, in this order: r11x/sound (cozy UI pack, `audio.ui(kind)`, CREDITS.md), r11x/look (map ground per chapter, desktop cat-street backdrop), r11x/shape (shaped boards, folded quilts), r11x/boss (a boss every 20 levels, chests, the streak flame, the versioned schedule, the map castle).
- Conflicts were resolved keeping both sides. game.js: the closed-flap skip, the R11 partial-redraw clip and the flaps are drawn inside the dirty-rect clip. generate.js: the boss schedule `sv` plus the shape mask in drawOrder, and the boss eval budget plus the shape `evalBonus`. qa.mjs keeps every section (look, shape, boss). check-econ keeps the R11 bridge ask and the boss chest sims. curated.js, dare.js and check-dare.mjs were merged by hand (see the token digit below).
### Token digit (changed from the boss lane's plan)
- Main's R11 fix round 1 had already used token digit 4 for the curated L7 (schedule 1). Reusing 4 for the boss schedule would have sent old L7 links to the wrong board. The R11x schedule therefore takes digit 5: 2 = generated, 3 = curated L6/L9/L11, 4 = also L7 (all schedule 1), 5 = schedule 2 (bosses, shapes, quilts). `BOARD_REV` is 5.
- `linkRev(n)` is 5 from L15 on. Below L15 both schedules deal the same boards (check-dare asserts L1-14 equal on both), so those links keep 3 (4 for L7) and read as before.
- Schedule 1 now means no shaped boards and no quilts: `params(n, 1)` skips `shapeParams`, and `generate(n, 1)` skips `shapeFinish`, so it is byte for byte the pre-R11x board. check-dare: old tokens (2, 3, 4) for L16 (now the heart) and L22 (now the first quilt) open the old plain boards (sha256 of the fdbfbfd generator). New L16 / L22 links open the heart and the quilt. L34 and L20 keep the boss lane's cases.
### Wiring across lanes
- Chest opening on the UI pack: a click per wobble, `chest` on the lid burst, `rare` on the rare/epic reveal, `coin` as the shower's coins land (every third), `sparkle` when the win card's flame fills. The boss defeat keeps its synth fanfare and adds `claim`. The intro, hit and grunt stings stay synth.
- Boss showpiece shapes: `shapeKeeps` now holds a boss shape to the boss floor (4+ traps, a whole carrier from the bench, the bench run to its last spare seat, 22+ cats). Otherwise the level ships the plain big boss board. A shaped boss box is at most 9x10, so its cells are never smaller than the plain 9x11 board's. Over L20-L200 only L180 (fish) keeps its shape; generation stays under 100 ms a boss.
### Checks
- `npm run build` passes. `npm run check` passes (worst gen 53.5 ms at L360, search misses 0) after two check-core lines were moved to schedule 1, because the curated boards' old revisions keep the schedule-1 generated board.
### Fast QA (new: `npm run qa:fast`, scripts/qa-fast.mjs)
- It never plays through. It injects saves into `lco_save` and uses the `__qa` / `__qaShape` / `__boss` hooks, takes one frame per screen into qa/fast/, and asserts no console or log errors and no page scroll. It has a hard 5-minute timeout. `QA_ONLY=f02,f09` runs single steps.
- Frames: L1 home, the L37 map (castle), the L12 chapter edge, the house with two residents, the L4 teaching card, the L16 heart, the L22 quilt before and after the unfold (at a 6x clock), the L20 boss intro, HP, defeat, gold chest and rare reveal, the L5 milestone chest, the four shop tabs, the EN and TR win cards with the share row, a fresh-save dare landing (5l16 token), and the 1920x1080 map with side panels and backdrop.
- First run: 64 s. One real bug: on 375x667 at L37 the boss lane's view pulls the castle in and keeps the current node low, so the flame / chest pill sat under the album strip. Fix: `dockPill` (boss.js, called by hub.js once the view is placed) moves the pill beside the node in compact form (flame, chest, levels left) whenever the strip would cover it. Two test-setup errors were fixed: L1 is the plain home, not the map, and two residents need counter_chalkboard built. Second run: 64 s, 0 failures, 0 console errors.
- The full scripts/qa.mjs was not run, so its look, shape and boss sections have not run since the merge.
### Weak points
- Boss shapes rarely ship: 1 of 10 bosses up to L200. The shaped boss boxes hold 18-21 cats where the boss floor wants 24. A boss-specific mask (bigger floor, fewer voids) would let more of them ship.
- At 375x667 near a boss (L36-L37), the castle's top still sits under the coin bar and the Tasks "Claim!" bubble, and the current node's lower edge sits under the album strip. The docked pill shows a bare count ("4") next to the chest.
- The quilt unfold still plays `audio.clear()`, not a UI-pack sound.
- The flame chip on the win card hangs over the empty board's rug corner.
- Not done: perf.mjs after the merge (shaped and boss boards on the 6x software raster), a real phone, and a fresh-player session.
