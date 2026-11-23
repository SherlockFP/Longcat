# R11 fun lane: L9 foresight, a winnable Take back, the first session

Sol review: `qa/sol-r11-3.md`, fixes 4 (Fun) and 7 (Overall). Sim: `node scripts/r11-fun-session.mjs 300` (current game) and `... 300 --fix` (with this lane's changes).

## What the player gets

- **Park preview before and after the commit.** While you hold a cat that would park, the board already rings the cushions it would take (R9 press preview). Each ringed cushion now also gets a dashed line to the carrier that cat waits for, with a count of the carriers ahead of it. When you let go, ghost cushions hold the seats until the cats land, and the lines stay for about 1.2 s. On L9, holding the big green pair shows two cushions with lines to the green carrier, three carriers away. This is on for L1–20, every teaching level and friend dares. It's off on the Daily, the Show board and Rush. With reduced motion, the dashes don't move and nothing pulses.
- **Take back finds a winnable spot.** The free Take back on a level's first lost bench no longer undoes just the losing tap. It goes back to the latest position the solver proves winnable, and a toast says *Rewound 3 moves to a winnable spot* (TR: *3 hamle geri sarıldı, buradan kazanabilirsin*). When one move is enough, it says *Took back 1 move: you can still win from here*. If the solver proves nothing within its budget, it falls back to one move and shows no promise.
- **Teaching rewind.** On a teaching level (the tutorial cards L1–4, 8 and 12, and the curated L6, L9 and L11), the free button reads **Back to that tap** (TR: *O hamleye dön*). It rewinds to just before the tap that made the loss certain and marks that cat with its lane and a "!" tag. The cushions it would take show as orange ghosts with a line to their carrier. A toast says *Back to the tap that cost the win: try another cat first*. The mark stays until the next tap or for 9 s. It is free and once per level, the same as Take back.
- **Fix 7 (a): the opening costs no life.** A lost bench on L1–12 no longer spends a heart. Lives are still switched on by the first resident (L4) and work as before from L13.
- **Fix 7 (b): L9 retries get L4's clue back.** From the third try of a curated lesson (L6, L9 and L11), the free cats again show L4's wait badges before the first tap, so the pair carries its "3".

## First-session sim (novice bot, 300 runs, L1–12 plus the first resident plus the first dare offer)

Bot model: it follows the L1–3 arrow 80% of the time. It sends a front-colour cat when it sees one, 60% of the time, and otherwise taps any free cat. It never takes a red no-seat tap while it has another choice. It takes the free Take back on a level's first loss, then retries, up to 8 losses a level. The economy is the game's: 1 star per clear, the café from L4, lives from the first resident (2 stars, so built on the L4 café visit), 5 lives that refill every 25 min.

| | L4 | L5 | L6 | L7 | L8 | L9 | L10 | L11 | L12 |
|---|---|---|---|---|---|---|---|---|---|
| first-try win, current | 83% | 81% | 66% | 54% | 84% | **18%** | 81% | 83% | 96% |
| tries per clear, current | 1.24 | 1.26 | 1.80 | 2.17 | 1.21 | **9.62** | 1.38 | 1.21 | 1.04 |
| tries per clear, with fixes | 1.21 | 1.28 | 1.49 | 2.26 | 1.18 | **3.53** | 1.26 | 1.06 | 1.00 |

- **Old Take back (undo the losing tap) leaves a winnable board in 0% of the bot's losses** on every level. Sol measured 3% with random play. The loss is almost always decided 2–5 moves earlier. **The new rewind reaches a proven-winnable spot in 100% of losses.** The level start is always on the stack and is solvable by construction. The average rewind is 2.0–2.3 moves on generated boards, 2.9 on L6 and 4.7 on L9.
- **Stalls (8 losses on one level, or out of lives): 243/300 currently, 13/300 with the fixes.** Currently, 169 of those stalls are on L9 and 39 on L7. Every current stall is the out-of-lives gate: the first resident turns lives on at L4, just before the L6, L7 and L9 stretch, so a novice spends 5 hearts before the session ends.
- **First dare offer: median L5** (the first chain ×3 or a clean sweep), and 98–100% get one by L12. This handoff is fine.
- **Rewards: residents arrive at L4 (Mochi), L5 (Biscuit) and L11 (Luna).** The L5–L11 gap contains both difficulty spikes (L7, L9). This lane did not change the cadence (retention lanes own it).

## The two worst handoffs and what changed

1. **L9 is a wall (18% first try, about 10 tries per clear for a novice). Before this round, the board explained the pair's cost only after it parked.** Changes: the preview line and ghosts before and after the commit, the teaching rewind back to the pair tap, and the wait badges again from try 3. With assumed responses (the mark is heeded 75% of the time, and the badges steer 60% of picks from try 3), tries per clear drop from 9.6 to 3.5. Those response rates are assumptions, not measurements. Watch `fun_rewind` (with teach=1, n=9) against `cur_win` tries.
2. **Lives turn on (L4) just before the hardest stretch of the opening.** The bot runs out of lives in 81% of runs, mostly on L9. Change: L1–12 losses are free. With the fixes, no run runs out of lives in the opening.

## Still weak

- **L7** (generated, kitten flavour) is the third spike: 54% first try and 2.2 tries per clear, wedged between the curated L6 and the dog intro on L8. Retuning the generator's L7 was out of scope because the solver guarantee and check-core are tied to it.
- The pre-commit line's effect isn't modelled. The bot can't show whether a human reads a dashed line plus a "3" during a 0.1 s tap. Players who tap fast only see the post-tap ghosts.
- The L9 first try stays hard by design (the lesson is the loss). The fix makes the second and third tries productive. It doesn't make the first one easier.
- Nothing here was tested with real players. The counters to read are `fun_rewind`, `free_takeback`, `cur_fail` and `cur_win`, `life_lost` (it should stay at zero for n ≤ 12), and `no_lives_gate`.
