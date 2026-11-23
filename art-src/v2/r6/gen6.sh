#!/usr/bin/env bash
# usage: gen6.sh name "prompt"  -> r6/name.png (skips if exists unless FORCE)
cd /c/Users/Admin/Documents/Msjelly/studio/long-cat-out/art-src/v2/r6
n=$1; shift
if [ -s "$n.png" ] && [ -z "$FORCE" ]; then echo skip $n; exit 0; fi
S='Style: bold flat cartoon mobile game art, thick dark navy outlines (#1d2b53), saturated warm candy colors, soft cel shading, cute, isometric matching the room, no text, no watermark.'
KEY='Every object sits on a flat solid pure magenta (#ff00ff) background with nothing else in the picture, so it can be keyed out (transparent background).'
s=$(date +%s)
timeout 600 /c/Users/Admin/Documents/Msjelly/studio/bin/art.sh "$(pwd -W)/$n.png" "$* $KEY $S" >/dev/null 2>&1
echo "$n $(( $(date +%s)-s ))s $(ls -la $n.png 2>/dev/null | awk '{print $5}')"
