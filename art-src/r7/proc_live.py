"""Retention art (visiting cats, resident outfits): magenta key, slice, fit, webp -> public/assets/r7/.
usage: python proc_live.py   (reads visitors.png, res_hat.png, res_scarf.png, res_crown.png drawn by studio/bin/art.sh)"""
from proc7 import key, load, slice_sheet, fit, save, RES

VIS = ['maple', 'hazel', 'pip', 'frost', 'sakura', 'bean']

for n, im in zip(VIS, slice_sheet(key(load('visitors')), 2, 3)):
    save(fit(im, 384, 384, 0.03, 'bottom'), f'vis7_{n}')
for suf in ('hat', 'scarf', 'crown'):
    for n, im in zip(RES, slice_sheet(key(load('res_' + suf)), 2, 4)):
        save(fit(im, 384, 384, 0.03, 'bottom'), f'res7_{n}_{suf}')
