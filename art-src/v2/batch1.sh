#!/usr/bin/env bash
cd /c/Users/Admin/Documents/Msjelly/studio/long-cat-out/art-src/v2
g(){ n=$1; shift; if [ -s "$n.png" ] && [ -z "$FORCE" ]; then echo "skip $n"; return; fi; echo "gen $n"; ./gen.sh "$n" "$@" >/dev/null 2>&1; ls -la "$n.png" 2>&1 | awk '{print $5}'; }
H='Front view cute cat head, happy open smile face with big shiny eyes, ears up, same chibi style and line weight as a set of matching heads, centered, square composition, fills most of the frame.'
g head_pink "$H Pink cat with red-pink hearts pattern on forehead and cheeks, small white muzzle."
g head_green "$H Green cat with darker green zigzag stripes on forehead and cheeks, small white muzzle."
g head_purple "$H Purple cat with yellow-white stars pattern on forehead and cheeks, small white muzzle."
g head_mint "$H Mint cat with small white cloud shapes pattern on forehead and cheeks, small white muzzle."
g head_yellow "$H Yellow cat with orange-brown spots on forehead and cheeks, small white muzzle."
g head_red "$H Red cat with plain solid red fur (no pattern) and a clearly white muzzle and white cheeks."
g head_orange_sleepy "$H Orange tabby cat with dark orange stripes, small white muzzle, eyes peacefully CLOSED as happy curved sleepy lines, gentle small smile."
g carrier_open "Front view plastic pet cat carrier, light grey and white body with ventilation grille slots on the sides and a handle on top, the front door is swung OPEN to the side showing a dark empty interior, nobody inside, centered."
g carrier_closed "Front view plastic pet cat carrier, light grey and white body with ventilation grille slots on the sides and a handle on top, the front wire door is CLOSED with vertical bars, centered, same design as an open version."
g cushion "Round yellow cushion seat for a cat bench with a button in the center and a thin darker rim, seen slightly from above (top-down 3/4 view), centered."
g obst_puppy "Cute sleeping puppy curled up in a wide oval shape, brown and cream fur, closed eyes, small floppy ear, wide shape about twice as wide as tall, centered, small Zzz-free."
g obst_yarn "Pink ball of yarn with wound strands and a loose thread end, centered."
g obst_ice "Square translucent light blue ice block with white highlights and small cracks, slightly see-through, rounded corners, thick navy outline, centered."
