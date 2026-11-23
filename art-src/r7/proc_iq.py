"""R10 "iq" lane art (records stopwatch, time medals, Cat IQ head, rank podium): magenta key, slice, fit, webp ->
public/assets/r7/.  usage: python proc_iq.py   (reads the sheet drawn by iq.sh)"""
from proc7 import key, load, slice_sheet, fit, save

NAMES = ['iq_watch', 'iq_gold', 'iq_silver', 'iq_bronze', 'iq_head', 'iq_podium']
for n, im in zip(NAMES, slice_sheet(key(load('iq_icons')), 2, 3)):
    save(fit(im, 160, 160, 0.03), n)
print('ok')
