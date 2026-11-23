# Long Cat Out! — hybrid-casual layer (full game, phase 2)

The owner said the MVP spec (`DESIGN.md`) was puzzle-casual, not hybrid-casual. We kept the proven core and added a meta loop that draws on 2026 hits, using their systems only and never their names, art or UI. Claude and Sol agreed on this in round 6 (`../meetings/06-sol.md`).

## The loop
**Puzzle → rescue → visible café upgrade → next rescue.** Each cleared level rescues a cat. Stars pay for renovation tasks in the **Cat Café**, and every finished task brings a named cat resident who moves in and hangs out there. Players always see the next resident and what their arrival unlocks.

## Build order (most D1/D7 lift first)
1. **Progression and difficulty.** Teach kitten-follow through play in session 1 and make escort order matter. Then introduce one modifier (spring cat first; swivel bed later). Use a sawtooth curve: an easier board follows every hard one. Flag hard levels with a bigger reward, every 7–10 levels from about level 15. The solvability check and difficulty metrics run in tests.
2. **Cat Café renovation.** Areas: Counter → Sunny Window → Cushion Corner → Garden Patio → Rooftop, each with 5–8 tasks that cost 1–3 stars. Each task places a GPT-made decor sprite with a little build animation. Residents get names and a one-line personality, and the first resident arrives in session 1 (by level 3–4). The 5-life gate comes only after the first resident.
3. **Fail recovery and a coin sink.**
   - **Scoop** booster: lift any cat straight out, ignoring blockers. It is earnable with coins, 1 free to try, and the tutorial shows it.
   - **Continue**: when the 3rd bonk would fail the level, a rewarded ad or coins restores one bonk.
   - **Lives**: 5, regenerating 1 per 20 minutes. A lost level costs a life only after the first resident.
   - Coins come from wins, 3-star bonus and café milestones. They buy Scoop and continues.
4. **First-try win streak ("Purr Streak").** After 3 first-try wins in a row, the next level starts with a free assist (one auto-hint glow plus one Scoop). A loss resets the streak. It unlocks after the café loop is established, about level 10.

## Deferred (not in this build)
Races and leagues, Fish Jar piggy bank, card album, season pass, daily calendar and daily puzzle, pull-the-pin side levels. We may revisit competition later with a structure of our own, with simulated opponents clearly labelled. Copying Lava Quest's 7-win / 99-bot / split-pot recipe is too close to a clone (Apple guideline 4.1).

## Monetization (release build)
- **Rewarded:** continue (+1 bonk), double coins on win, free Scoop once per day.
- **Interstitials:** after a win only, from level 8, at most one per 3 minutes, never after a fail, and none in the first session's first 5 minutes.
- **IAP:** no-ads ($2.99), coin packs, starter bundle (coins + 3 Scoops + no-ads) shown once after level 10.
- AdMob via `@capacitor-community/admob` with test unit IDs until the owner supplies real ones.

## Metrics to instrument (local analytics stub now, real SDK later)
D1/D7 proxies, level start/win/fail/quit, retries per level, booster use, continue offers taken, first café upgrade time, and the session-1 funnel (L1, L3, first resident, L10).
