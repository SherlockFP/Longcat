"""R10 shop art (coin bundles, offers, play-room themes): magenta key, slice, fit, webp -> public/assets/r7/.
usage: python proc_shop.py   (reads the sheets drawn by shop.sh)"""
import os
from PIL import Image
from proc7 import key, load, slice_sheet, fit, save, HERE

for n, im in zip(['pouch', 'sack', 'chest'], slice_sheet(key(load('shop_coins')), 1, 3)):
    save(fit(im, 256, 256, 0.03, 'bottom'), 'shop_' + n)
for n, im in zip(['gift', 'crate', 'tv'], slice_sheet(key(load('shop_offers')), 1, 3)):
    save(fit(im, 256, 256, 0.03, 'bottom'), 'shop_' + n)
for n in ['night', 'blossom']:
    p = os.path.join(HERE, 'bg_room_' + n + '.png')
    if os.path.exists(p):
        save(Image.open(p).convert('RGB').resize((1024, 1536), Image.LANCZOS), 'shop_room_' + n)
print('ok')
