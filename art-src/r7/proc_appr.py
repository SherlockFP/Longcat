"""Cat Street apprentices (first repeat lap): magenta key, slice the 2x3 sheet, fit -> public/assets/r7/appr_<id>.webp
usage: python proc_appr.py   (reads apprentices.png drawn by street.sh)"""
from proc7 import key, load, slice_sheet, fit, save

SHOPS = ['bakery', 'library', 'florist', 'tea', 'toy', 'music']
for n, im in zip(SHOPS, slice_sheet(key(load('apprentices')), 2, 3)):
    save(fit(im, 240, 240, 0.03, 'bottom'), 'appr_' + n)
print('ok')
