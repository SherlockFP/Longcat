# Long Cat Out! — design (v1 MVP)

Store title: **Long Cat Out! Arrow Puzzle** (TR: **Uzun Kedi Kaçış: Ok Bulmaca**). Subtitle: "Cute cat tap away brain game".
Why: arrow "tap away" puzzles lead 2026 downloads, monetized by rewarded hints and AdMob; a cute skin is the cheapest lift (Meowdoku). See `../meetings/04-market-research.md` and `../meetings/05-sol.md`.

## Core rules
- Portrait grid board (start 5x6, grow to 9x12). Each **cat** is a snake-like path of cells (length 2–7, may bend). One end is the **head**. The head's facing = direction of the last body step.
- **Tap a cat** → if every cell from the head straight to the board edge is empty, the cat **zips out**. The body follows the path like a noodle and leaves the board. If any cell is occupied, the cat **bonks**: it stretches toward the blocker, squashes and recoils. The player loses 1 heart (3 per level).
- Win = board empty. Stars: 3 = no bonks, 2 = 1 bonk, 1 = 2 bonks. 0 hearts = fail. Retry is instant; a rewarded ad gives +1 heart.
- **Twist v1, Follow the leader:** a kitten with the same collar color as its parent sits directly behind the parent's tail. When the parent exits, the kitten trails it out automatically: one tap, two cats. Introduced in the level 3 tutorial (kitten blocks a third cat, parent frees it). Levels must use it so it matters (the kitten blocks a third cat).
- Later twists, not MVP: spring cat (hops one cell), swivel bed (rotates a linked cat 90°).

## Level generation (always solvable)
Reverse removal. Build the removal order backwards: place cats one at a time. Each new cat is removed **earlier** than all cats already placed, so its exit ray (head → edge) must be clear of every placed cat's cells, and its body must not overlap any of them. Prefer placements whose body lies inside the exit ray of an already placed cat. That creates dependencies, so the board reads as a jam.
- Seeded PRNG: `level n` gives the same board on every device. Difficulty ramps on board size, cat count, bends and dependency depth (longest chain).
- A solver/validator in tests checks that every level 1..500 is solvable, fills ≥ 55% of cells at n ≥ 10, and has dependency depth ≥ 2 at n ≥ 5.
- Level 1–3 are hand-tuned tutorials: 1 cat, then 3 cats in a pile, then a parent and kitten cascade (Sol's "feel clever in 60 seconds").

## Feel / juice
- Cat bodies are drawn procedurally: a thick rounded stroke along the path in the breed's fur colors with stripes, so stretching stays seamless. Head and tail-tip sprites come from GPT art. The head rotates to face its direction.
- Zip: ease-in, stretch, "mrrp" pitch up, tiny haptic, paw-print dust. Bonk: 120ms squash, dizzy stars, low "mew", screen nudge.
- Cascade: freeing ≥ 3 cats within 2 seconds gives "Purrfect!" text and a combo pitch ladder. Clear: cats pop confetti, then the room reveal.
- Sounds are synthesized with WebAudio, so no audio files.

## Meta (MVP-light)
- Coins per level (+bonus for 3 stars). The **Cozy Room** shows each freed breed on a shelf, and a new breed unlocks every 10 levels. Daily puzzle with a streak.
- Hints cost coins or a rewarded ad: the next free cat glows.

## Monetization (stubs in v1, no real ads in test builds)
- `ads.js` interface: `rewarded(reason) -> Promise<boolean>`, `interstitial() -> Promise<void>`. Test mode simulates a 2s ad. Interstitial: every 3rd level win after level 8, at most once per 3 minutes, never after a fail. Remove-ads IAP placeholder flag.

## Tech
- Vite + plain ES modules + Canvas2D (no three.js), portrait 375x812 baseline, DPR-aware. Capacitor comes later.
- `src/core/` pure rules and generator (no DOM, unit-tested with `node scripts/check-core.mjs`). `src/game/` renderer, input and juice. `src/ui/` DOM screens (home, level win/fail, room, settings). `src/kit/` save, audio, haptics, ads, analytics stub.
- i18n EN + TR from day one.

## First metric
Level-3 completion rate and the share of players who start level 4 in the first session. Keep/kill: ≥ 60% reach level 10 in session 1 in the playtest build.
