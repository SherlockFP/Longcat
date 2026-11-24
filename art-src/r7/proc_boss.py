"""R11 boss lane art (drawn by boss.sh): magenta key, slice, fit, webp -> public/assets/r7/.  usage: python proc_boss.py"""
from proc7 import key, load, slice_sheet, fit, save

for n in ['duke', 'pirate', 'chef', 'wizard']:
    save(fit(key(load('boss_' + n)), 384, 384, 0.02, 'bottom'), 'boss_' + n)
for sheet in ['chest_wood', 'chest_gold']:
    shut, opened = slice_sheet(key(load(sheet)), 1, 2)
    save(fit(shut, 256, 256, 0.03, 'bottom'), sheet)
    save(fit(opened, 256, 256, 0.03, 'bottom'), sheet + '_open')
flame, castle = slice_sheet(key(load('boss_icons')), 1, 2)
save(fit(flame, 128, 128, 0.03), 'boss_flame')
save(fit(castle, 192, 192, 0.03, 'bottom'), 'map_castle')
print('ok')
