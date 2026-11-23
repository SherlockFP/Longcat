#!/usr/bin/env bash
# Hybrid-casual screens: Cat Café renovation + booster/continue offer (GPT image via art.sh).
ART=/c/Users/Admin/Documents/Msjelly/studio/bin/art.sh
G="Mobile game UI mockup screenshot, portrait 9:16 phone screen (1080x1920), for a cute hybrid-casual cat puzzle game 'Long Cat Out!'. Premium top-grossing 2026 casual polish, big readable one-thumb buttons, clean hierarchy."
shot(){ "$ART" "$PWD/$1.png" "$G $2"; echo "done $1"; }
shot cafe-a "SCREEN: Cat Café renovation meta (like a cozy home-decor meta): isometric cozy café interior half renovated, several cute cats lounging, a task list panel with tasks like 'Paint the counter' costing 1-3 stars, star counter, big Play button bottom center showing 'Level 14', next resident cat preview bubble. Warm pastel cream and peach."
shot cafe-b "SCREEN: Cat Café renovation meta: front view of a sunny café window area being decorated, a new decor item popping in with sparkles, a named cat resident card 'Mochi moved in!', stars counter, Play button. Bright candy teal and orange, glossy outlined buttons."
shot offer-a "SCREEN: continue offer popup over a jammed puzzle board of long cats: 'One more try?' with options 'Watch ad: +1 bonk' and '+1 bonk for 90 coins', plus a 'Scoop' booster card (paw scoop lifting a cat out) with price, close X. Cream and peach panels."
shot shop-a "SCREEN: shop with coin packs, a starter bundle (coins + 3 Scoop boosters + No Ads) with a big 'Best value' ribbon, a No Ads item, booster packs, prices in USD. Clean premium casual style, cute cat mascots."
echo ALLDONE2
