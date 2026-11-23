# R10 lane "iq": clocks, Record Run, Stats + Cat IQ, Rank list

Inspired by "IQ Puzzle Master Pro": best times, speed runs, a stats page and a rank list.

## What the player gets

- **Level clock.** A small clock sits under the LEVEL plaque on campaign levels. It starts on the first cat out and stops when the board clears. It pauses while the tab is hidden. Its icon is the level's time medal so far.
- **Time medals.** Each campaign clear is timed. The best time per level is saved. Gold, silver and bronze cuts come from the board's par, which is the length of the generator's winning line:
  - gold: `par * 1.2 + 3` seconds
  - silver: `par * 2 + 6` seconds
  - bronze: `par * 3.2 + 10` seconds
  - hard boards get x1.15 and super hard boards get x1.3.
- **Win card time row.** The win card shows a "Your time" row or a "New best 0:42.3!" row. The row names the medal and the next cut to aim for.
- **Medals are an extra layer.** They pay no coins and no stars. A replay still pays the existing replay coins (5), so the star economy is unchanged and `check-econ` is not affected.
- **Records sheet.** The café's right rail has a **Records** button, which opens a sheet with 4 tabs:
  - **Levels.** A paged 5x4 grid of cleared levels, showing each level's medal and best time. Tap a level to replay it and race your time; it goes through `tryStart`, so the lives gate applies as for any replay.
  - **Run (Record Run).** Play 5 random cleared boards (from the last 40 cleared, level 4 and up) back to back on one clock.
    - The clock starts on the first cat. It stops between boards.
    - A full bench means Retry, and the clock keeps going.
    - At the end, the card shows the total, the 5 splits and the comparison with your personal best, plus Run again, Home and Share.
    - Share uses the system share sheet, or copies a line plus the game URL.
    - The run opens at level 9.
    - It is free: no lives and no rewards.
  - **Stats.** Shows levels cleared, cats freed, best chain, fastest clear (par 10+ boards only), clean sweeps, Daily streak (with the Daily total), play time and time medals.
    - **Cat IQ** (80-160) is computed from progress, medals, clean sweeps, best chain, Daily clears and the Record Run.
    - The titles run from Curious Kitten to Genius Cat (TR: Meraklı Yavru to Dahi Kedi).
  - **Rank.** Ranked by levels cleared.
    - Friends come from dare replies that reached this browser (`save.data.fr.list`). A campaign dare gives a lower bound on a friend's level. Friends known only from Daily, Show or Rush dares show "no level dare yet".
    - 6 BOT rivals are placed around your level. Their positions shift weekly from a fixed seed. Every bot row carries a **BOT** tag, and a note explains it.
    - The list shows at most 8 rows around you.

## Save keys (`save.data.iq`, created lazily by `src/game/iq.js ensure()`)

- `t: { level: best ms }`
- `p: { level: par at that time }`
- `cats`: cats freed
- `perfect`: clean sweeps of 10+ cat boards
- `clears`
- `play`: ms of active play
- `chain`: best chain
- `run: { best, split: [ms x5], n }`

## Global rank list: what the owner must do (not live)

`src/kit/rank-kv.js` is a disabled stub with the fetch shape: `submit(entry)` and `top(board, around)`. Nothing imports it. To make a real global list:

1. In the Cloudflare dashboard, open **Workers & Pages > KV > Create namespace**. Name it `lco-rank`.
2. Go to **Workers & Pages > Create > Worker**. Name it `lco-rank` and deploy the hello-world worker.
3. In the Worker, open **Settings > Bindings > Add > KV namespace**. Set the variable name to `RANK` and the namespace to `lco-rank`.
4. Replace the Worker code with a handler for two routes:
   - `POST /submit` with body `{ id, nm, lv, iq, run }`:
     - Validate it: `nm` at most 12 characters, filtered for profanity; `lv` an integer from 0 to 2000; `iq` from 80 to 160; `run` either 0 or from 20000 to 3600000.
     - Store it with `RANK.put('p:' + id, JSON.stringify(entry))`.
     - Rate-limit to 1 write per id per 30 s.
     - Return `{ ok, rank, of }`.
   - `GET /top?b=lv|iq|run&v=<value>`:
     - Return the 8 entries around `v`.
     - KV has no sorted queries. Keep one sorted snapshot key per board (`top:lv`, `top:iq`, `top:run`), rebuilt by a Cron Trigger every 10 min with `RANK.list({ prefix: 'p:' })`, and read only that key here.
   - Send CORS headers that allow the game's origin.
5. Add a **Cron Trigger** (`*/10 * * * *`) to the Worker for the snapshot rebuild.
6. In `src/kit/rank-kv.js`, set `ENDPOINT` to the Worker URL and `ENABLED = true`. Then wire it in two places:
   - In the Rank tab: fetch `top('lv', levelsCleared)`, render its rows above the local list, and keep the BOT and Friend rows labelled.
   - After a win: call `submit()` with a random per-browser id stored in `save.data.iq.kvId`.
7. Privacy:
   - Add a Settings toggle "Show me on the global list" and keep it off by default.
   - Only the nickname and the numbers leave the device.
   - No accounts and no emails.

The free Workers plan allows 1,000 KV writes and 100,000 reads a day. That is enough for a soft launch if `submit()` only fires on a new best.

## QA

The section is **"R10 iq lane"** at the end of `scripts/qa.mjs`, skippable with `QA_SKIP_IQ=1`. Its frames are `qa/r10-iq-*.png`:

- `hub`: the rail button
- `levels`, `run`, `stats`, `rank`: the sheet tabs at 375x667, checked by the no-scroll check
- `clock`: the HUD clock on a replay of level 7
- `win`: the time row on the win card
- `stats-tr`: the Stats tab in Turkish
- `run-board`, `run-mid`, `run-end`: a Record Run

## Weak spots

- The medal cuts are a formula from par, tuned by reasoning and not by playtests. Check the real clear times in analytics (`iq_time`) and retune.
- The Rank list is mostly bots until the KV list exists. Friends rank on a lower bound taken from the dares they sent.
- The Record Run boards are random, so personal bests are not strictly comparable across runs. A daily seeded run would fix that and allow a shareable `?r=` link.
- The Records entry is only on the café rail (level 4+). Players on levels 1-3 see nothing until then.
