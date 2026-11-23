# R10 perf: phone lag ("telde çok kasıyor") + board depth

Probe: `node scripts/perf.mjs <label>` (vite on 5192, chrome-headless-shell over CDP, 375x812, **DPR 3**, mobile,
`Emulation.setCPUThrottlingRate` 4 and 6). Each scene records 3 s of rAF deltas (what the player feels) and the
main-thread cost of `Game.update + Game.draw` per rAF tick (patched on the shared prototype, so the win card's clip
renderer counts too). Scenes: café hub, L1 idle, L60 idle, L60 while 6 cats sprint, the L13 3-chain in slow motion,
the win card. `PERF_NOGPU=1` runs with software raster: a stand-in for a fill-rate-bound phone GPU (it exaggerates,
but it is the only headless way to see raster cost; with the desktop GPU the raster is free and only script shows).
`?perf=0` turns the whole lane off (old renderer, DPR 3) for A/B runs in the same session.

The other lanes were building and running QA on the same PC, so absolute numbers drift between runs; the A/B pairs
below were run back to back.

## Results

### Software raster, CPU x4 (closest to "a phone that lags"): rAF delta p50 / p95 ms

| scene | before | after |
|---|---:|---:|
| hub | 166.6 / 183.4 | **16.7 / 16.7** |
| L1 | 266.6 / 283.4 | **16.7 / 16.8** |
| L60 idle | 416.7 / 466.6 | **33.3 / 50** |
| L60 sprint | 450 / 483.2 | **49.9 / 66.7** |
| chain slow-mo | 349.9 / 449.9 | **50 / 100** |
| win card | 533.3 / 700 | **83.3 / 100** |

(`r10-perf-baseline-swraster.json`, `r10-perf-after-swraster.json`)

### GPU raster, CPU x6, back to back (`?perf=0` vs default): rAF p50/p95 ms | game ms p50/p95

| scene | before | after |
|---|---|---|
| hub | 16.7/16.8 \| 4.5/8.5 | 16.7/16.8 \| **0/0** |
| L1 | 16.7/16.7 \| 3.3/4.8 | 16.7/16.7 \| 3.4/6.2 |
| L60 idle | 16.7/33.3 \| 9.3/16.4 | **16.7/16.8** \| 2.4/10.9 |
| L60 sprint | 33.3/83.3 \| 19.2/48.1 | **16.7/33.3** \| 9.6/16.3 |
| chain slow-mo | 16.7/50 \| 9.5/14.3 | **16.7/33.4** \| 6.7/10.4 |
| win card | 16.7/49.9 \| 6.9/12.8 | **16.7/33.4** \| 6.7/10.9 |

(`r10-perf-baseline-x6b.json`, `r10-perf-after-x6b.json`)

### GPU raster, CPU x4 (quiet machine): first baseline vs after

| scene | before rAF p95 \| game ms p95 | after rAF p95 \| game ms p95 |
|---|---|---|
| hub | 16.7 \| 3.2 | 16.8 \| **0** |
| L1 | 16.8 \| 2.1 | 16.8 \| 1.5 |
| L60 idle | 16.7 \| 6.7 | 16.8 \| 3.9 |
| L60 sprint | 16.7 \| 8.5 | 16.7 \| 4.2 |
| chain | 16.7 \| 5.3 | 16.8 \| 4.5 |
| win | 16.8 \| 4.1 | 16.8 \| 3.9 |

**Target p95 <= 20 ms at 4x throttle: met in every scene with GPU raster** (it already was on this desktop GPU;
the old code missed it at x6 and under software raster). Under software raster the late boards still sit at 33-66 ms:
the remaining cost is compositing a DPR-2 full-screen board plus the DOM HUD, not our draw calls.

## What was slow (baseline)

1. **DPR 3 canvas**: 1125x2436 = 2.7 Mpx filled every frame, several times over (room, gradient, rug, tiles).
2. **Full-screen work every frame**: the room drawn cover-fit + a full-screen window-light gradient, the rug with
   `shadowBlur 14`, every ivory tile drawn one by one, the belt image with `shadowBlur 8`, the bench plank with
   `shadowBlur 8`.
3. **Every still cat re-stroked every frame**: ~15 path strokes per body incl. two non-source-over blends (`overlay`
   felt, `soft-light` knit pattern, both read the destination) and dashed seams. L60 has 20 cats: 40 dst-read blends
   per frame.
4. **The board kept drawing under the café hub** (an opaque DOM screen): 2-5 ms of script and a full raster per frame
   for nothing.
5. 60 fps forever even when only breathing and blinks move; 120 Hz phones drew 120 fps.
6. Per-frame `shadowBlur` on the chain-hop trail (6 circles per hop) and on the hinted carrier.

## What changed

- `src/game/perf.js` frame gate: no frames while an opaque `#ui` screen covers the board (MutationObserver + 500 ms
  re-check; only fully opaque, full-viewport, non-animating elements count); idle boards draw at 30 fps (reduced
  motion 12 fps); never more than 60 fps; busy = any anim/particle/popup/pending event/press/carrier moving/chain/
  sweep/look/new seat/recent touch.
- Render DPR capped at 2 (`DPR_CAP`).
- Two underlay canvases under `#game` (`#pf-far` room, `#pf-near` rug + tiles + plank + baked shadows + vignette),
  rebuilt only when the layout signature changes (size, DPR, board, cell, bench seats). `#game` is now transparent
  and only clears. The camera (shake, chain push-in) reaches the underlay as a CSS `transform` (compositor only).
- Still cats: body baked once per cat (felt, knit, seams, pattern, collar) with the soft shadow baked separately; per
  frame = shadow sprite + live tail (keeps the wag) + body sprite + live head (blinks, looks, twitches). The
  0.035 width breathing of still bodies is dropped (under a pixel at board size); heads, tails, the bench cats keep
  their idle life. Hinted (glowing) cats still draw live.
- Belt drawn from a baked shadow sprite; hinted-carrier glow and chain-hop trail glow from baked sprites.

## Depth (all baked, ~free per frame)

- Parallax room: the far layer is the room, softened a touch (depth of field), oversized 3.5%, a slow 10 s sway
  (`translate` WAAPI, compositor) and it moves at 40% of the board during shake/push-in. Static window light + a faint
  light shaft. Reduced motion: no sway.
- Wide soft ambient shadow under the rug; the belt casts a soft shadow on the wall; soft baked blobs under each
  carrier on the belt; gentle warm vignette (0.26 at the corners).
- Cats: the hard contact-shadow stroke became a soft baked blur; warm key light from the upper right (source-atop
  gradient) and a thin warm rim highlight on the lit edge, baked into the body sprite.

## WebGPU / PixiJS

`pixi.js@8.22.0` (exact pin; 8.23.0 is under two weeks old). `src/game/pixi-layer.js`, loaded only on demand (dynamic
import, its own chunk): `preference: 'webgpu'`, WebGL fallback, Canvas2D fallback if init fails. It renders the room,
the near layer and the still cat bodies + shadows as GPU sprites and re-renders only on change; Canvas2D keeps heads,
moving cats and effects. Turn on with `?r=pixi` or Settings > "GPU mode (beta)" (save key `perf.gpu`), `?r=canvas`
forces Canvas2D.

**Shipped opt-in, not default**, because:
1. Same frame? Nearly: `r10-perf-l60-pixi.png` vs `r10-perf-l60-after1.png` match except still tails are frozen at
   rest (a Pixi sprite cannot wag without per-frame re-bakes) and the room does not sway.
2. Faster? No. Headless (WebGL, WebGPU not exposed by headless-shell) x4: L60 game ms p95 6.4 vs 3.9 Canvas2D, chain
   19.6 vs 4.5, plus one more GL context and texture uploads on every level load. The board is now a handful of
   drawImage calls per frame; there is nothing left that a GPU scene graph wins on, while the extra context costs
   memory on low-end phones.
Physical-phone WebGPU timing is unmeasured.

## Still weak

- The win card: the share-clip MediaRecorder encode (kit/clip.js, another lane's feature) runs a second Game at
  full rate while the card is up; 83-100 ms frames under software raster.
- Late boards under software raster still 33-66 ms: compositor + DOM HUD at DPR 2. Next step would be measuring on a
  real low-end Android (chrome://tracing) before going further.
- Still-cat sprites cost memory: ~20 canvases per board (L60 an estimated 15-25 MB at DPR 2, not measured), released on level change.

## R11 juice lane (Sol fix 3): chain + moving cats under software raster

Probe: `scripts/perf.mjs` as above (DPR 3, 375x812), now with `PERF_ONLY=L60,rapid6,chain` to run only those scenes.
Before = HEAD `d204fce`, after = branch `r11/juice`, run back to back on the same machine (other lanes were also busy,
so absolute numbers drift; compare pairs, not runs). Files: `r11-perf-sw-before.json`, `r11-perf-sw-after.json`,
`r11-perf-gpu-before.json`, `r11-perf-gpu-after.json`.

### What the profile said

A CDP trace of the x6 software-raster chain showed that the main thread was spending its time in
`LayerTreeHost::DoUpdateLayers` (Canvas2D rasterising at commit, about 100 ms a frame), not in script (`Game.update + draw`
recorded in 5-10 ms). A `nodraw` A/B ran at 16.7 ms. A clear-only canvas took 4 ms a frame, and DPR 1.3 cut the cost in
proportion to the pixels. So the chain was raster-bound: every drawn pixel cost main-thread time. Forcing a flush around
each draw call gave this split at x6, as p50 ms per frame: carriers 14.5, bench 5.3, edge glow 4.6 (on the low-res
layer), counter 3.6 (p95 14), belt 3.4 and room clear 1.7. The first canvas version of the final-landing pulse cost 24 ms.

### What changed

- **Split frames** (`perf.js` `split()`, hooks in `Game.draw`). While something moves and the board itself holds still
  (a sprint, hops, particles, the chain window or the sweep), the still board (rug objects, still cats, kitten leashes)
  goes to `#pf-board`. That layer redraws only when its signature changes: alive cats, hint, cue, mechanics state or freed
  arrows. It follows the camera by CSS, like the rug. Moving cats and transient fx draw on `#pf-fx` at `FX_SCALE` 0.65
  of the board DPR. `#game` keeps the belt row, bench, carriers and teaching marks crisp. The chain counter sits on
  `#pf-top`, a crisp 180 px strip over the fx layer, so the gold burst stays under the words. The split never runs while
  a finger is down (the lane preview draws under the cats). It also skips a bonk, a rolling yarn ball and a board cat's
  wiggle or pop-in. The share clip's fixed Game, Pixi mode and `?split=0` (or `window.__perf.noSplit`) draw whole frames.
- **Idle life on a split frame.** A tap's look-around and a freed cat's arrow pulse keep redrawing the board at up to
  20 fps, but only while frames come fast (an EMA of frame intervals under 24 ms). A phone that is already dropping
  frames holds the board still and spends its frames on the moving cat. A bench chain always holds the board still.
- **Baked, not re-rastered.** A carrier at rest draws as one sprite that `drawCarrier7` bakes itself, once its state
  has held for 2 frames. A squash, dip, door swing, pop, lean or hint glow draws it live. The belt sits on its own baked
  layer (`#pf-belt`), with the stop-click kick as a CSS translate. The chain counter's ribbon is baked once per tick.
- **Compositor-only flashes.** The edge glow on hops 2 and later, the final landing's warm flash and its gold ring are
  DOM layers (`#pf-edge-l/r`, `#pf-flash`, `#pf-ring`). Per frame, the code changes only their opacity or transform.
- Overlapping taps and landing timing are untouched (rules, `pending` events and the clock are not touched). QA taps a
  free cat in the middle of the chain, and every landing still counts.

### Software raster (`PERF_NOGPU=1`): rAF delta p50 / p95 ms

| scene | x4 before | x4 after | x6 before | x6 after |
|---|---:|---:|---:|---:|
| L60 idle | 33.4 / 50.1 | **16.7 / 33.4** | 66.6 / 66.7 | **50 / 66.7** |
| L60 sprint | 50 / 66.7 | **16.7 / 50** | 83.3 / 100 | **33.2 / 66.6** |
| rapid6 | 33.4 / 66.7 | **16.7 / 33.4** | 116.6 / 183.3 | **33.4 / 99.9** |
| chain x3 | 50 / 50.1 | **16.7 / 16.8** | 66.7 / 83.4 | **33.3 / 33.4** |

**Target met: the chain plays at a 33.4 ms p95 at x6 with software raster.** Two earlier after-runs on a busier machine
gave 33.4 and 50.1 ms p95. Raster per frame on the chain fell from about 100 ms to about 18 ms (`DoUpdateLayers` p50 at
x6).

### GPU raster: rAF p50 / p95 | game ms p50 / p95

| scene | x6 before | x6 after |
|---|---|---|
| L60 idle | 16.7/16.8 \| 2.9/5.7 | 16.7/16.8 \| 2.6/5.6 |
| L60 sprint | 16.7/16.7 \| 5.4/7.3 | 16.7/16.7 \| 3.0/7.5 |
| rapid6 | 16.7/16.7 \| 5.2/8.6 | 16.7/16.7 \| 4.0/8.0 |
| chain x3 | 16.7/16.8 \| 2.9/4.6 | 16.7/16.8 \| 2.2/4.1 |

On this quiet run, the GPU path was already at 60 fps on both sides (Sol's R12 33.3 ms chain spike came from a busier
run). The script cost is equal or lower.

### Juice added with this pass (no measurable frame cost)

- The chain's last landing gets a camera punch (+3% scale, 0.32 s), a warm screen flash and a gold ring out of the
  counter (DOM, compositor). The counter's final pop is bigger: it settles at 1.45x and springs from about 2.3x. Each
  earlier tick pops a little bigger than the one before.
- A full carrier's lid slams shut with a squash, then a stretch (0.42 s), in place of the old small wobble.
- On the win card, 6-12 coins (scaled by the payout) spin to the counter. Every second one ticks, and the last one bursts
  gold around the pill, which glows.
- One short 22 ms `navigator.vibrate` buzz on the last landing. It follows the Settings haptics switch and stays off with
  reduced motion. Where `navigator.vibrate` is missing, the old native-plugin path runs.
- Reduced motion turns off the punch, flash, ring, overshoot, coin burst and buzz. The lid keeps the old gentle wobble.

### Still weak

- Late boards at x6 under software raster still sit at 50-66 ms when idle. That cost is the 20 baked still cats, live
  heads and the band at 30 fps, not motion. Every tap in a sprint also redraws the full still board once.
- Six full-screen canvases (far, near, belt, board, game and fx at 0.65) plus the counter strip now sit under `#ui`.
  That costs memory on low-end phones, about 5 MB per DPR-2 layer, and none of it has been measured on a device.
- In a themed pack on a split frame, the live rain and petals draw over the still cats, not under them.
- None of this has been measured on a physical low-end Android phone.
