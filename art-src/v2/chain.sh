#!/usr/bin/env bash
cd /c/Users/Admin/Documents/Msjelly/studio/long-cat-out/art-src/v2
while ! grep -q obst_ice batch1.out || [ "$(tail -1 batch1.out | grep -c '^[0-9]*$\|No such')" = 0 ]; do sleep 20; done
./batch2.sh > batch2.out 2>&1
./batch3.sh > batch3.out 2>&1
echo ALLDONE > chain.done
