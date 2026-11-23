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

## UI sounds

The `ui_*.mp3` files come from **"127 FREE Cozy UI & Menu Sound Effects" by Zeno Studio**
(https://zenostudio.itch.io/127-free-cozy-ui-menu-sfx, downloaded 2026-11-24). Its license (LICENSE.txt in the pack)
allows use in commercial games and modifying the sounds; attribution is appreciated but not required. Redistributing the
sounds as standalone files is not allowed, so they ship only inside the game. Processing: mono, trimmed, loudness-matched,
96 kbps MP3.

| File(s) | Used for | Source file(s) |
|---|---|---|
| ui_click1.mp3, ui_click2.mp3, ui_click3.mp3 | button tap | UI_Click_Bubble_Pop V01, V02, V04 |
| ui_tab1.mp3, ui_tab2.mp3 | tabs, pages, toggles | UI_Click_Soft_Wood V01, V03 |
| ui_back1.mp3, ui_back2.mp3 | close / back | UI_Cancel_Back V02, V03 |
| ui_ok1.mp3, ui_ok2.mp3 | play / next / retry, wear, treat | UI_Confirm_Wooden_Double_Tap V01, V04 |
| ui_err1.mp3, ui_err2.mp3 | not enough coins or stars | UI_Error_Gentle V01, V03 |
| ui_coin1.mp3, ui_coin2.mp3 | coins collected, shop purchase | UI_Reward_Coin_Pickup V02, V03 |
| ui_chest1.mp3, ui_chest2.mp3 | chest opens | UI_Reward_Treasure_Chest V01, V03 |
| ui_rare1.mp3, ui_rare2.mp3 | rare reward, season prize | UI_Reward_Rare_Item V01, V02 |
| ui_claim1.mp3, ui_claim2.mp3 | task / request / login claim | UI_Achievement_Unlocked V01, V03 |
| ui_build1.mp3, ui_build2.mp3 | café or street piece built, print hung | UI_Save_Complete V01, V04 |
| ui_friend.mp3 | a new resident moves in | UI_Notify_New_Friend V01 |
| ui_notify1.mp3, ui_notify2.mp3 | goal ready | UI_Notify_Quest_Update V02, V04 |
| ui_sparkle1.mp3, ui_sparkle2.mp3 | postcard catch-up, small sparkle rewards | UI_Reward_Sparkle V01, V02 |

If a file fails to load the game falls back to its built-in WebAudio synth sound.
`npm run check` (scripts/check-sfx.mjs) asserts every referenced file exists, is under
60 KB (sfx) / 1.2 MB (music) and is listed here.
