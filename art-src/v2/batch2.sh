#!/usr/bin/env bash
cd /c/Users/Admin/Documents/Msjelly/studio/long-cat-out/art-src/v2
g(){ n=$1; shift; if [ -s "$n.png" ] && [ -z "$FORCE" ]; then echo "skip $n"; return; fi; echo "gen $n"; ./gen.sh "$n" "$@" >/dev/null 2>&1; ls -la "$n.png" 2>&1 | awk '{print $5}'; }
I='Isometric 3/4 view from above, camera looking from the front-right corner, warm cozy cat cafe style with thick navy outlines, soft warm peach and wood tones, centered.'
g cafe_shell_counter "$I A cozy cat cafe corner room diorama, EMPTY shell only: two plain cream plaster back walls, a wooden plank floor, thick wooden floor edge, a small round wall window blank. No furniture, no decor, no props, no cats. The diorama floats on the background."
g cafe_counter_counter "$I A wooden cafe service counter with a pink espresso machine on top, jars, a cup, single object only."
g cafe_counter_pastry "$I A glass pastry display case on a wooden base with croissants and cakes, single object only."
g cafe_counter_lamps "$I A pair of pendant lamps with warm orange shades hanging from black cords, glowing, single object only."
g cafe_counter_chalkboard "$I A wall chalkboard menu in a wooden frame with a small cat face and coffee cup doodle drawn in chalk, no readable text, single object only."
g cafe_counter_tables "$I Two small round wooden cafe tables each with two pink round stools, single group only."
g cafe_counter_plant "$I A large potted monstera plant in a speckled cream pot, single object only."
g cafe_shell_window "$I A cozy cat cafe corner room diorama, EMPTY shell only: two plain cream plaster back walls with a big arched window with wooden frame showing a bright sunny garden on the left wall, wooden plank floor, thick wooden floor edge. No furniture, no decor, no props, no cats. The diorama floats on the background."
g cafe_window_seat "$I A cushioned window seat bench in pink with two pillows, single object only."
g cafe_window_plants "$I Two hanging potted trailing plants on ropes, single object only."
g cafe_window_bookshelf "$I A wooden bookshelf with colorful books and a small cat figurine, single object only."
g cafe_window_cattree "$I A tall cat tree tower with sisal posts, perches and a cozy bed, single object only."
g cafe_window_rug "$I A round cream and pink rug with paw print pattern lying flat on the floor, single object only."
g cafe_window_lights "$I A string of warm glowing fairy lights draped in a swag, single object only."
g cafe_teaser_cushion "$I A finished cozy cushion corner of a cat cafe room diorama: soft round cushions, plush beds, blankets, warm lamp, plants, floating on the background, full of detail."
