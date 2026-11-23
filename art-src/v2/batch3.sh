#!/usr/bin/env bash
cd /c/Users/Admin/Documents/Msjelly/studio/long-cat-out/art-src/v2
g(){ n=$1; shift; if [ -s "$n.png" ] && [ -z "$FORCE" ]; then echo "skip $n"; return; fi; echo "gen $n"; ./gen.sh "$n" "$@" >/dev/null 2>&1; ls -la "$n.png" 2>&1 | awk '{print $5}'; }
P='Bust portrait of a cute happy cat resident character, head and shoulders, smiling, centered, square.'
g res_mochi "$P Cream colored cat with a red collar with a small golden bell."
g res_biscuit "$P Brown tabby cat wearing a small white chef hat."
g res_luna "$P Grey cat with a small yellow star hairclip."
g res_pudding "$P Fluffy orange cat wearing a bow tie."
U='Single game UI icon, chunky, centered, square.'
g ui2_coin "$U A gold coin with a paw print embossed in the center."
g ui2_star "$U A yellow five point star with a soft shine."
g ui2_heart "$U A red heart with a glossy highlight."
g ui2_hint "$U A glowing yellow lightbulb with a small paw print on the glass."
g ui2_scoop "$U A cat paw shaped scoop net with a wooden handle."
g ui2_undo "$U A curved undo arrow in teal, thick."
g ui2_chest "$U A wooden treasure chest with golden trim, closed, with a small paw lock."
g ui2_medal "$U A ribbon medal with a paw print on a round gold medallion and two red ribbon tails."
g app_icon_v2 "App icon artwork, square full bleed, flat teal background, an orange striped cat stretched very long and happy, coming out of an open grey pet carrier, bold thick navy outline, simple shapes readable at 48px, big face, no text." opaque
