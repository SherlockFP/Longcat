#!/usr/bin/env bash
# usage: gen.sh name "prompt body"   -> art-src/v2/name.png
S='Style: bold flat cartoon mobile game art like the reference direction B: thick dark navy outlines (#1d2b53), saturated candy colors, soft cel shading, cute, no text, no watermark.'
KEY='Isolated on a flat solid pure magenta (#ff00ff) background with nothing else, so it can be keyed out.'
cd /c/Users/Admin/Documents/Msjelly/studio/long-cat-out/art-src/v2
if [ "$3" = "opaque" ]; then P="$2 $S"; else P="$2 $KEY $S"; fi
/c/Users/Admin/Documents/Msjelly/studio/bin/art.sh "$(pwd -W)/$1.png" "$P"
