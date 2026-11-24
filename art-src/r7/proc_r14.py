"""R14 ui lane art (drawn by batch_r14.sh): magenta key, slice, fit, webp -> public/assets/r7/.  usage: python proc_r14.py"""
from proc7 import key, load, slice_sheet, fit, save

shut, opened = slice_sheet(key(load('basket')), 1, 2)
save(fit(shut, 256, 256, 0.03, 'bottom'), 'basket')
save(fit(opened, 256, 256, 0.03, 'bottom'), 'basket_open')
save(fit(key(load('boss_muffin')), 384, 384, 0.02, 'bottom'), 'boss_muffin')
print('ok')
