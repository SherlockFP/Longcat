cd /c/Users/Admin/Documents/Msjelly/studio/long-cat-out/art-src/v2; O=../../public/assets/v2
p(){ python proc.py $1.png $O/$2.webp $3 | tail -1; }
for n in orange blue pink green purple mint yellow red orange_sleepy; do p head_$n head_$n 256; done
p carrier_open carrier_open 384; p carrier_closed carrier_closed 384; p cushion cushion 192
for n in puppy yarn ice; do p obst_$n obst_$n 256; done
p cafe_shell_counter cafe_shell_counter 1024; p cafe_shell_window cafe_shell_window 1024; p cafe_teaser_cushion cafe_teaser_cushion 1024
for n in counter pastry lamps chalkboard tables plant; do p cafe_counter_$n cafe_counter_$n 512; done
for n in seat plants bookshelf cattree rug lights; do p cafe_window_$n cafe_window_$n 512; done
for n in mochi biscuit luna pudding; do p res_$n res_$n 384; done
for n in coin star heart hint scoop undo chest medal; do p ui2_$n ui_$n 192; done
echo FIN > reproc.done
