"""R10 retention art (Cat Street upgrades + new shops, Daily record keepsakes, album prints and icons): magenta key,
slice, fit, webp -> public/assets/r7/.  usage: python proc_r10.py   (reads the sheets drawn by r10.sh)"""
from proc7 import key, load, slice_sheet, width_fit, fit, save, trim

SHOPS = ['bakery', 'library', 'florist', 'tea', 'toy', 'music']
NEW = ['fish', 'post', 'yarn']

for n, im in zip(SHOPS, slice_sheet(key(load('street_up_sign')), 2, 3)):
    save(fit(im, 300, 300, 0.02, 'bottom'), 'up_' + n)
for n, im in zip(['bunting', 'planter', 'lights'], slice_sheet(key(load('street_up_shared')), 3, 1)):
    save(width_fit(trim(im), 600), 'up_' + n)
for n, im in zip(NEW, slice_sheet(key(load('street_shops_c')), 1, 3)):
    save(width_fit(trim(im), 400), 'street_' + n)
for n, im in zip(NEW, slice_sheet(key(load('keepers_c')), 1, 3)):
    save(fit(im, 320, 320, 0.03, 'bottom'), 'keeper_' + n)
for n, im in zip(['frame', 'pennant', 'clock'], slice_sheet(key(load('daily_rewards')), 1, 3)):
    save(fit(im, 256, 256, 0.02), 'drec_' + n)
for i, im in enumerate(slice_sheet(key(load('prints')), 2, 3)):
    save(fit(im, 300, 300, 0.02), f'print_{i}')
for n, im in zip(['album_book', 'pop_stamp', 'fr_letter'], slice_sheet(key(load('album_ui')), 1, 3)):
    save(fit(im, 160, 160, 0.03), n)
print('ok')
