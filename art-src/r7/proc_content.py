"""Content lane art (pack hosts, swivel bed, pack rooms): magenta key, slice, fit, webp -> public/assets/r7/.
usage: python proc_content.py   (reads hosts.png, swivel_bed.png, bg_<theme>.png drawn by batch_content.sh)"""
from PIL import Image
from proc7 import key, load, slice_sheet, fit, save

HOSTS = ['drizzle', 'brioche', 'fern', 'comet']  # 2x2 sheet, reading order

for n, im in zip(HOSTS, slice_sheet(key(load('hosts')), 2, 2)):
    print(save(fit(im, 384, 384, 0.03, 'bottom'), f'vis7_{n}'))
print(save(fit(key(load('swivel_bed')), 256, 256, 0.02), 'swivel_bed'))
for th in ('rainy', 'bakery', 'garden', 'starry'):
    print(save(load('bg_' + th).resize((1024, 1536), Image.LANCZOS), 'bg_' + th, 80))
