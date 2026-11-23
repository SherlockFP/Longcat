# Long Cat Out! — UI style guide (picked from GPT mockups)

Mockups: `art-src/mockups/{home,play,win,fail,room}-{a,b,c}.png`, plus contact sheets `_home.jpg`, `_play.jpg`, `_cards.jpg`. **Pick: direction B "Candy Teal"** for all UI and gameplay. Claude picked it and Sol agreed (`../meetings/07-sol-mockups.md`). Direction A's warm sunlit room and soft furnishings are used only inside the **Cat Café** scenes.

## Reference per screen (implement to match these)
- Home: `home-b.png`. Big logo with an orange cat wrapped around the text, a hero demo board with one long cat and an arrow at its nose (this teaches the move), a huge orange PLAY pill with "Level N" under the word, three teal secondary tiles with icons, and a coin pill top-right.
- Gameplay: `play-b.png`. Teal paw-print background, small logo at the top, a HUD row (LEVEL pill, 3 hearts, coin pill), an orange fringed rug frame around a cream grid board, and an orange HINT pill at the bottom.
- Win: `win-b.png`. A teal card with a cat peeking over the top edge, a "Purrfect!" yellow outlined title, 3 big stars, a coin reward pill, an orange Next pill and a teal Home pill.
- Fail: `fail-b.png`. A cream card, a "Oops!" navy title, a bonked cat with dizzy stars and a bandage, empty hearts, an orange Retry pill and a teal "Watch ad +1" pill.
- Collection / Café shelf: `room-b.png` layout, but the locked items are distinct cat silhouettes with small locks, as in `room-a.png`.

## Tokens
- Teal bg `#1fb5ad`, dark teal `#0e8c86`, paw-pattern overlay at 8% white.
- Orange primary `#ff7a1a` → `#ff9a2e` gradient, plus a 4px navy outline `#1d2b53` and a 3px bottom "lip" `#c4520c`.
- Teal secondary `#3fd0c4` with a navy outline. Cream panels `#fff6e5`. Yellow title fill `#ffd43b` with a navy outline.
- Text: rounded heavy display font (Google Fonts "Fredoka" 600/700) for titles and buttons; "Nunito" 700 for body.
- Radius: pills fully round, cards 28px. Shadows: hard offset `0 5px 0` darker shade, no blur on buttons.

## Cat rendering (gameplay, must read in 1 second)
- Body: a thick rounded stroke (about 70% of cell size) in a saturated breed color, a 3px navy outline and darker stripe bands across the body.
- The head sits at the **leading end**, with the muzzle projecting toward the exit direction. The tail end is round with a white tip, so the two ends never look alike.
- Paws: small white ovals at the head end.
- One distinct hue per cat on a board (orange, blue, pink, green, yellow, purple, mint, red); breeds map to hues.
- Exit arrow hint: a small yellow arrow in front of the nose on tutorial levels and when a hint is active.

## Motion
Buttons press down 3px on touch and spring back. Cards drop in with a slight overshoot. Stars pop one by one, with a pitch ladder.

## Hybrid screens (from `art-src/mockups/_hybrid.jpg`)
- **Cat Café home (main hub after level 3):** layout from `cafe-a.png`. A warm isometric café room in the top 60%, showing the half-renovated area, lounging residents and a "Next resident" bubble. Below it, a task list (icon, task name, star-cost pill), then a big Play pill reading "Level N". Use direction A's warmth inside the room art, but buttons and pills follow B tokens.
- **Resident arrival popup:** from `cafe-b.png`. The new decor pops in with sparkles, and a "Mochi moved in!" card shows the resident portrait.
- **Continue offer:** structure from `offer-a.png`: a cat peeking over the card, "One more try?", a green rewarded button "Watch ad: +1 bonk", a coin button "+1 bonk for 90 coins", and a Scoop booster card with its coin price. The bottom booster bar shows hint, undo and scoop with counts. Restyle it in B colours.
- **Shop:** structure from `shop-a.png`. A Starter Bundle hero with a "Best value" ribbon ($4.99: coins, 3 Scoops and No Ads), No Ads at $2.99, 3 coin packs and 2 Scoop packs. Restyle the purple to B teal, keep the green price buttons.
