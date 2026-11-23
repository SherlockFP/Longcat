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
