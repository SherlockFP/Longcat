# Long Cat Out! v2: the full game (supersedes the core rules in DESIGN.md; meta from DESIGN-HYBRID.md, refined here)

Why v2: in the MVP critique the feel critic scored it 4/10 and Sol gave virality 4/10 and retention 5/10. The owner found it boring. His goal is fun, surprising, and played for months, not for 10 days. Visuals must match `STYLE.md` (direction B) and the GPT mockups, especially `art-src/mockups/play2-b.png` (gameplay) and `cafe-a.png` (hub).

## 1. Core loop: tap-away + carrier Jam
- Board: a grid with **color-coded long cats** in 8 colors (orange, blue, pink, green, purple, mint, yellow, red). Each color has its own body pattern so color-blind players can read it: stripes, polka dots, stars, hearts, clouds, zigzag, spots, plain. The head sits at the leading end, a chevron sits in front of the nose, and the tail is round with a white tip.
- **Tap a cat**: if its exit lane (head to board edge) is clear, it sprints out on little legs, runs to the top and **leaps into a carrier**. If the lane is blocked it **bonks**: a red lane shows the blocker, the blocker wiggles. A bonk costs nothing; failure comes from the bench.
- **Carriers**: a conveyor at the top shows a queue (the front carrier plus 2 previews). The front carrier takes 3 cats of its color. When full, its door closes, it drives off with a happy jingle, and the next carrier rolls in.
- **Bench**: an exiting cat whose color does not match the front carrier sits on one of **5 bench cushions**. When a new carrier arrives, matching bench cats hop in automatically (chain reactions are the clip moment).
- **Lose**: a cat needs a seat and the bench is full. This opens the continue offer: +1 bench seat via rewarded ad or coins, or a Scoop.
- **Win**: board empty and all carriers gone. A win always pays **1 star** (hard: 2, super hard: 3) plus coins, with a bonus for empty bench seats.
- **Kittens**: same color as their mother, trail her out (one tap = 2 cats, great for filling carriers).
- **Undo** booster: undo the last tap (coins/IAP). **Scoop**: lift any cat directly into the bench or a matching carrier, ignoring blockers. **Hint**: highlights the best next tap.

## 2. Level generation (always solvable, never boring)
Per Sol, round 8: build a candidate board with the reverse-removal arrow generator, find a legal tap order, then assign colors and the carrier order **together** so that this order wins with bench ≤ 4 after resolving boardings. It should include a few deliberate bench detours, and on harder levels a tempting legal move that costs bench space, with a visible clue. Each color's count must be a multiple of 3. The solver simulates the real rules after every tap: boarding from the bench, consecutive departures, resolving before checking for a loss.
- Sawtooth difficulty: a hard level every 7–10 levels from L15 (red "Hard" badge, 2 stars), super hard every ~30 levels (3 stars). Easier levels follow hard ones.
- Board sizes 5x6 up to 9x11. Cell ≥ 40 CSS px on a 375-wide phone; bigger boards scroll-free by limiting the size.

## 3. New mechanics ramp (the main fix for "10 days and quit")
One new mechanic per chapter, each introduced in a teaching level with a one-line hint:
- L1–3 tutorial (tap → carrier, bench, kittens), L6 kittens in generated levels
- L15 **Sleeping dog**: occupies 2 cells, wakes up and trots away after 3 cats exit nearby (watch the Zzz counter)
- L25 **Yarn ball**: blocks a cell; a cat exiting past an adjacent yarn knocks it rolling off the board (chain clip)
- L40 **Mystery cat**: color hidden ("?") until a neighbor leaves (borrowed from the Jam games' hidden blocks)
- L55 **Frozen cat**: ice-covered; thaws after 2 neighbors leave
- L70+ combos of the above; more mechanics later (spring cat, swivel bed) via data

## 4. Meta: Cat Café (the reason to come back)
- The **Café hub is the home screen** from level 4 (before that, the Play screen only). Layout from `cafe-a.png`: an isometric café area at the top, a task list (task name, star-cost pill), a "Next resident" bubble, and a big Play pill "Level N".
- **Areas**: Counter (6 tasks) → Sunny Window (6) → Cushion Corner → Garden Patio → Rooftop. This build ships the first 2 areas with art. Later areas show "Coming soon" with a teaser image.
- Each task places a decor sprite with a build animation (dust puff, sparkle, bounce). The 3rd and 6th task of each area bring a **named resident** (portrait card "Mochi moved in!", name and a one-line personality). Residents then idle in the café.
- **Resident perks** (power progression): each resident gives a small permanent perk, such as +2 coins per win, a free Hint every day, +1 bench seat on the first try of hard levels, or starting with a Scoop every 5th level. The perks are shown on the resident card.

## 5. Economy and long-term systems
- **Lives**: 5, refill 1 per 25 min. A loss costs 1 life. The life gate only starts after the first resident (about L4).
- **Purr Streak**: 3 first-try wins in a row → the next level starts with 1 free Hint + 1 bench seat. 5 in a row → + a Scoop. A loss resets it.
- **Daily tasks**: 3 per day from a pool (fill 10 carriers, win 3 levels, use a booster, clear a hard level, free 50 cats), with a small chest. **7-day login calendar**.
- **Weekly event "Cat Show"**: our own structure, not a copy. Wins drop paw ribbons, and a 10-step milestone track pays coins, boosters and an exclusive café decor. The theme rotates weekly from data (Spring Picnic, Pajama Party, Beach Day...), and the track resets weekly.
- **Coins**: earned from wins, tasks, events and perks. Spent on Undo/Scoop/Hint, continues and decor speed-ups (none for now).
- **Monetization** (release): rewarded ads for continue +1 seat, double coins, and a free daily Scoop. Interstitials only after a win, from L8, at most 1 per 3 min, none in the first 5 minutes of the first session. IAP: No Ads $2.99, Starter Bundle $4.99 (shown once after L10), coin packs $0.99/$2.99/$6.99, Scoop packs $1.99/$4.99. These are stubs now (`src/kit/iap.js` and `ads.js`); the real plugins come at release.

## 6. Feel (the critic's must-fixes)
- The tap is instant: a 60ms squash anticipation, then a fast ease-out sprint with speed lines. Cats run on visible little legs to the carrier, then leap with an arc and a squash on landing. When a carrier departs: door snap, wiggle, drive-off, confetti puff, rising "boop" pitch ladder for consecutive carriers.
- Idle life: blinks, ear twitches, tail wag at the tail tip, and an occasional yawn. Cats look toward a tapped neighbor.
- Combo text above the board only: "Purrfect!", "Cat-tastic!", "Meow-velous!". The win card title depends on the result. The coin count-up flies coins to the HUD.
- The cats must look like the mockup: chunky bodies with a navy outline, patterned fur, paws at the head end and a curled tail tip. No flat tubes.

## 7. Analytics (local stub now)
Session-1 funnel (L1, L3, first resident, L10), level start/win/lose/quit, bench-full losses, continue taken, booster use, task completion, daily task completion, D1/D7 proxies via saved timestamps.
