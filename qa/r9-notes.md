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
