# Shape lane (r11x/shape): shaped boards and folded boards that grow

## What the player gets
- **Shaped boards** from L16. L16 is a heart. After that, one board in 4 up to L49 is shaped, then every other scheduled slot from L50. Breathers, "medium" boards and teaching levels stay plain. Ten shapes, scaled to the size tier and cropped to their floor: heart, cat head with ears, diamond, donut (hole in the middle), plus, hourglass, stairs, fish, paw, star. The rug follows the outline: rust felt, a cream stitched hem and a soft shadow. Gaps show the room floor. 104 of L1-600 ship shaped.
- **Folded boards** from L22. On every fifth normal board, a quilted flap (mustard quilt, diamond stitching, cream hem) covers a band along one edge or a corner block. It shows a tag such as "3 more cats" / "3 kedi daha". When that many cats have left, the flap squashes away toward the board edge. Dust and sparkles play, and the camera leans in slightly, then settles. The cats underneath join the board. Some boards from L70 have two flaps, and the second one opens later. Tapping a closed flap wiggles it and shows a toast: "It opens after N more cats leave". 77 of L1-600 ship folded.
- **Size variety past L50**: plain normal boards alternate tall 8x11 and wide 9x10. Shaped boards use a box of up to 9x10, so every shaped board keeps cells of 30 px or more on 375x667. Measured: L16 39 px, L22 39 px, L57 32 px, L84 32 px, L96 35 px. An 11-row shaped board measured 29 px, so shaped boards are capped at 10 rows.
- **One-time cards** (EN + TR) appear on the first shaped board and on the first folded board. If another card opens first, they wait for it to close.
- `shapeFor(n, kind)` is the hook for the boss lane: `kind === 'boss'` always gets a showpiece (star, cat head, paw, heart, fish).

## Rules chosen
- **A void cell is open air.** No cat, dog or yarn sits on it. A cat's way out slides straight over it. The rules, solver and search model need no new blocking rule. Only placement in the generator and the fill ratio (floor cells) know about the mask.
- **A closed flap is a wall.** Cats under it cannot be tapped or scooped. Any flap cell, with or without a cat, stops a cat whose way out crosses it. A spring cat cannot hop a flap. A swivel bed never sits under a flap and none of its four lanes crosses one. The flap opens for good once `need` cats have left the board (kittens and scoops count too). Undo folds it back.
- The same rule is implemented in `rules.js` (`gone`, `foldOpen`, `findBlocker`, `canExit`, `tap`, `scoop`, undo snapshot) and in `search.js` (`Sim.gone`, `compileFold`, `foldBlocked`). `check-core` compares the two on every free cat at every step of every folded board.
- **Generator.** A flap ships only if it keeps the line a win:
  1. `need` is at most the number of cats the line has sent off before its first tap on a folded cat, or on a cat whose lane crosses the flap.
  2. On boards with no mechanic, the solver may find a new winning line instead. That line must never use the last cushion.
  3. The decisions are then measured again. The flap ships only if the level keeps its floor: safe start, a trap, a chain, and peak <= seats - 1. Meta follows the new measurement.
- A shaped board that cannot hold the level's floor ships plain. So does a normal board that misses its band (`shapeOff` in `generate.js`).

## Checks (`node scripts/check-core.mjs`)
- New section: shapes and flaps follow the schedule. Nothing sits on a void cell (`validateBoard`). Every folded board's line wins. The solver alone finds a win on every folded board (budget 20k). Rules and search agree on every free cat. Each flap opens at exactly its count. A tap or scoop under a closed flap is refused. Undo folds the flap back. Every board fits in 9x11, and shaped boards in 10 rows.
- **Last run passed every check except the two generation-time asserts.** The PC was at 92-97% CPU from other lanes, and the plain baseline was also over budget at the same time. Earlier runs, same session:

| Run | Generation time |
|---|---|
| Earlier configuration, passed outright | avg 12.66 ms, worst 51.7 ms |
| Later runs, under load | worst 61-66 ms (L306, a shaped board that missed its band and was rebuilt plain) |
| Plain baseline (`git stash`), same load | worst 94 ms |

- Band misses: 110 of 596 (limit 119). The plain baseline had 110.
- 0 search misses.
- **Rerun the generation-time assert on a quiet machine.**

## Performance (scripts/perf.mjs, CPU x4, 375x812 @ DPR 3, GPU canvas, `PERF_ONLY=L60,shape,unfold`)
Everything new is baked:
- The shaped rug (path, shadowBlur, felt pattern, gradient) is drawn into the perf underlay once per layout.
- A flap is one cached sprite drawn with one `drawImage`. It is re-baked only when its count changes.
- The unfold draws the same sprite scaled, with globalAlpha. There is no per-frame shadowBlur, filter, gradient or string.
- Cats under a closed flap are not drawn at all.

Machine at 95% CPU from other lanes. Rows are rAF p50 / p95 ms, then game update+draw p95 ms. Final run:

| Scene | rAF p50 / p95 (ms) | game ms p95 |
|---|---|---|
| L60 idle (plain 8x11, control) | 16.7 / 16.8 | 14.4 |
| L60 sprint (control) | 16.7 / 33.3 | 18.9 |
| L84 paw idle | 16.7 / 33.3 | 19.3 |
| L84 paw sprint | 16.7 / 33.2 | 17.6 |
| **L57 unfold** (count reached inside the window) | **16.7 / 16.7** | **3.3** |
| L13 chain (control) | 16.7 / 16.7 | 9.4 |

On the shaped board, rAF p95 and game ms p95 under load match the plain control's sprint. The unfold holds 60 fps at 4x.

The first run had a bad number: the shape scene p95 was 66.7 ms. The frame showed why: the one-time card opened over the board during the measurement. `perf.mjs` now marks both cards as seen before these scenes.

Numbers: `qa/r10-perf-shape.json`.

## QA section (scripts/qa.mjs, last, `QA_SKIP_SHAPE=1` skips it; run on port 5208, 0 errors, no scroll failures)
Frames `qa/r11x-shape-*.png`:

| Frame | What it shows |
|---|---|
| `first-card` | L16 shape card |
| `first-board` | L16 heart |
| `mid-96` | heart mid-play |
| `mid-84` | paw mid-play |
| `fold-card` | L57 fold card |
| `fold-before` | flap tap: wiggle and toast, no cat leaves |
| `fold-mid` | flap squashing away |
| `fold-after` | board after the flap opened |
| `fold-card-tr` | L22 fold card in Turkish |
| `fold-l22-tr` | L22 board in Turkish |
| `desk-1600` | paw board at 1600x900 |

The run ends with the solver winning L57 after the flap opens.

## Weak spots
- The `mid-96` frame of the last run was covered by the content lane's spring-cat card, which opened late. The QA now closes cards right before that shot. This fix has not been rerun.
- Paw, star and plus read only roughly at 9x10. The toe notches mostly close up after the tidy pass. The shapes are seen best at 1600x900 (51 px cells).
- The flap tag is small on 2-column flaps (number only).
- The fold card's illustration is a simple SVG. No GPT art was made.
- Reduced motion shortens the unfold to 0.3 s and drops the camera lean. This was not captured in QA.
- Generation changed for L16+ (shapes, flaps, 9x10 boxes). An old dare link to an affected level opens the new board. Any other branch that edits `generate.js` must merge around `shapeParams` / `shapeFinish` / the `shapeOff` retry.
