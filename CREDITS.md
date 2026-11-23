# Credits

## Sound effects and music

Every sound in `public/sfx/` comes from OpenGameArt.org and is released under
**CC0 1.0** (public domain dedication, https://creativecommons.org/publicdomain/zero/1.0/).
CC0 needs no attribution, but we credit the authors anyway (also shown in Settings).
Each license was read on the asset page on 2026-11-23. The files were trimmed, faded,
loudness-matched (sfx about -16 dBFS active RMS, music -23 LUFS), downmixed to mono
(sfx only) and encoded as 96 kbps MP3. No Kenney assets are used.

| File(s) | Used for | Source | Author | License |
|---|---|---|---|---|
| mrrp1.mp3 | cat tapped (meow, pitch climbs with combo) | https://opengameart.org/content/meow (Meow.ogg) | IgnasD | CC0 |
| mrrp2.mp3 | cat tapped | https://opengameart.org/content/kitten-mew (kitten_mew-1.wav, first 0.5 s) | AntumDeluge | CC0 |
| mrrp3.mp3 | cat tapped | https://opengameart.org/content/cat-purr-meow (cat_mewfood.wav) | Kerzoven | CC0 |
| mew1.mp3 | blocked tap / loss | https://opengameart.org/content/cat-purr-meow (cat_softmew.wav) | Kerzoven | CC0 |
| mew2.mp3 | blocked tap / loss | https://opengameart.org/content/meowing-cat-made-in-labchirp (meowing_cat.mp3) | Traceletz | CC0 |
| bonk.mp3 | blocked tap (soft boing under the mew) | https://opengameart.org/node/183317 "Boings" (bung_01.mp3) | EZduzziteh | CC0 |
| pop1.mp3, pop2.mp3, pop3.mp3, pop4.mp3 | combo, dog wakes, thaw | https://opengameart.org/content/pop-sounds-0 (pop1, pop3, pop8, pop9) | EZduzziteh | CC0 |
| tick1.mp3, tick2.mp3 | UI click | https://opengameart.org/content/pop-sounds-0 (pop7, pop2) | EZduzziteh | CC0 |
| plink1.mp3, plink2.mp3 | bench cat hops into its carrier (pitch ladder) | https://opengameart.org/node/183317 "Boings" (bing_02.mp3, bing_01.mp3) | EZduzziteh | CC0 |
| thump1.mp3, thump2.mp3 | cat lands on cushion, yarn knock | https://opengameart.org/node/183321 "Silly Sound Effects" (bloop.mp3, plup.mp3) | EZduzziteh | CC0 |
| clack.mp3 | carrier door closes | https://opengameart.org/content/100-cc0-metal-and-wood-sfx (wood_close_01.ogg) | rubberduck | CC0 |
| jingle.mp3 | carrier drives off (pitch climbs per consecutive carrier) | https://opengameart.org/content/pleasing-bell-sound-effect (pleasing-bell.wav) | Spring Spring | CC0 |
| star.mp3 | star / reward ding | https://opengameart.org/content/bell-dingschimes (bell_ding2.wav) | PWL | CC0 |
| win.mp3 | level win, café build | https://opengameart.org/content/win-jingle (winjingle.zip, WinVibraphone) | Fupi | CC0 |
| music.mp3 | background loop | https://opengameart.org/content/cozy-puzzle-title (cozy_puzzle_title_bpm95.ogg) | MintoDog | CC0 |

If a file fails to load the game falls back to its built-in WebAudio synth sound.
`npm run check` (scripts/check-sfx.mjs) asserts every referenced file exists, is under
60 KB (sfx) / 1.2 MB (music) and is listed here.
