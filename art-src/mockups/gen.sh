#!/usr/bin/env bash
# UI mockups for Long Cat Out! via GPT image (studio/bin/art.sh), sequential.
ART=/c/Users/Admin/Documents/Msjelly/studio/bin/art.sh
G="Mobile game UI mockup screenshot, portrait 9:16 phone screen (1080x1920), for a cute cat arrow tap-away puzzle game called 'Long Cat Out!' where long noodle-shaped cats lie curled on a grid and slide out when tapped. Premium hit-game polish like top 2026 casual games, big readable one-thumb buttons, clean hierarchy, no clutter."
declare -A D=(
 [a]="Art direction A: cozy pastel living room, cream and peach UI panels with soft shadows, rounded chunky buttons, warm wood accents."
 [b]="Art direction B: bold candy-bright flat vector, teal and orange, glossy pill buttons with thick dark outlines, playful sticker badges."
 [c]="Art direction C: storybook watercolor warmth, paper-card panels with stitched edges, gentle gradients, hand-lettered feel title."
)
shot(){ "$ART" "$PWD/$1.png" "$G $2 ${D[$3]}"; echo "done $1"; }
for v in a b c; do shot home-$v "SCREEN: main menu / home. Title logo 'Long Cat Out!' at top with a stretched cat in the logo, a hero long cat character, big PLAY button showing 'Level 12', smaller buttons for Cozy Room, Daily Puzzle, Settings, coin counter top right." $v; done
for v in a b c; do shot play-$v "SCREEN: gameplay. Top HUD with level number, 3 hearts, coin counter; center a rounded 7x9 puzzle board on a rug with 6 long colorful cats curled in different directions (heads clearly showing which way they face); bottom a hint button with paw icon." $v; done
for v in a b; do shot win-$v "SCREEN: level complete card over a blurred board: 3 gold stars, 'Purrfect!' header, coins reward, big Next button, small Home button, happy cat peeking." $v; done
for v in a b; do shot room-$v "SCREEN: Cozy Room collection: shelves and cushions with collected cat breeds sitting, locked silhouettes for missing breeds, progress 6/24, back button." $v; done
for v in a b; do shot fail-$v "SCREEN: out of hearts card: sad bonked cat with dizzy stars, 'Oops!' header, 'Retry' button and a 'Watch ad +1 heart' button." $v; done
echo ALLDONE
