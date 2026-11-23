"""Round 10 retention art (Cat Street, shopkeepers, renovation sets, visitor nooks): magenta key, slice, fit, webp ->
public/assets/r7/.  usage: python proc_street.py   (reads the sheets drawn by street.sh)"""
import os
from PIL import Image
from proc7 import key, load, slice_sheet, width_fit, fit, save, HERE

SHOPS = ['bakery', 'library', 'florist', 'tea', 'toy', 'music']
RENO = ['lantern', 'cocoa', 'blossom']

save(load('street_bg').resize((1024, 1536), Image.LANCZOS), 'street_bg', 80)
for sheet, ids in (('street_shops_a', SHOPS[:3]), ('street_shops_b', SHOPS[3:])):
    for n, im in zip(ids, slice_sheet(key(load(sheet)), 1, 3)):
        save(width_fit(im, 400), 'street_' + n)
for n, im in zip(SHOPS, slice_sheet(key(load('keepers')), 2, 3)):
    save(fit(im, 320, 320, 0.03, 'bottom'), 'keeper_' + n)
parts = slice_sheet(key(load('reno')), 3, 2)
for i, n in enumerate(RENO):
    save(width_fit(parts[2 * i], 768), f'reno_{n}_garland')
    save(width_fit(parts[2 * i + 1], 640), f'reno_{n}_rug')
if os.path.exists(os.path.join(HERE, 'nooks.png')):
    k = key(load('nooks'))  # each bed has a loose prop beside it: crop the three groups by their x spans
    for i, (x0, x1) in enumerate([(0, 640), (645, 1470), (1475, k.size[0])]):
        save(width_fit(k.crop((x0, 0, x1, k.size[1])), 320), f'nook_{i}')
print('ok')
