# R11 look lane: art-src/look/*.png -> public/assets/r7/*.webp
# desktop backdrops: 16:9 crop, 2400x1350, <= 350 KB; map grounds: 640x960 like map_bg.webp
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'r7')

def save(im, name, q, cap):
    p = os.path.join(OUT, name + '.webp')
    while True:
        im.save(p, 'WEBP', quality=q, method=6)
        kb = os.path.getsize(p) / 1024
        if kb <= cap or q <= 50: break
        q -= 4
    print(f'{name}: {im.size[0]}x{im.size[1]} q{q} {kb:.0f}KB')

for f in sorted(os.listdir(HERE)):
    if not f.endswith('.png') or (len(sys.argv) > 1 and f[:-4] not in sys.argv[1:]): continue
    n = f[:-4]
    im = Image.open(os.path.join(HERE, f)).convert('RGB')
    if n.startswith('look-desk-'):
        w, h = im.size
        th = round(w * 9 / 16)
        if th <= h: im = im.crop((0, (h - th) // 2, w, (h - th) // 2 + th))
        else:
            tw = round(h * 16 / 9); im = im.crop(((w - tw) // 2, 0, (w - tw) // 2 + tw, h))
        save(im.resize((2400, 1350), Image.LANCZOS), n, 80, 350)
    elif n.startswith('look-map-'):
        if n == 'look-map-snow':  # the drawn snow is near white: a touch cooler and dimmer so the cream road still reads
            im = Image.merge('RGB', [b.point(lambda v, k=k: int(v * k)) for b, k in zip(im.split(), (0.90, 0.93, 0.97))])
        save(im.resize((640, 960), Image.LANCZOS), n, 80, 200)
