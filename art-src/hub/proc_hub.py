"""Hub lane art (the home level map): magenta key, slice, fit, webp -> public/assets/r7/.  usage: python proc_hub.py"""
import os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'r7'))
from proc7 import key, slice_sheet, fit, save, width_fit, trim  # noqa: E402


def load(n):
    return Image.open(os.path.join(HERE, n + '.png')).convert('RGB')


bg = load('map_bg').resize((640, 960), Image.LANCZOS)
save(bg.convert('RGBA'), 'map_bg', q=80)
for n, im in zip(['sign', 'node_done', 'node_cur', 'node_lock'], slice_sheet(key(load('map_nodes')), 2, 2)):
    save(fit(im, 220, 220 if n != 'sign' else 180, 0.02, 'bottom' if n == 'sign' else 'center'), 'map_' + n)
for n, im in zip(['fern', 'basket', 'lamp', 'bush', 'bowl', 'mailbox'], slice_sheet(key(load('map_props')), 2, 3)):
    save(fit(im, 160, 160, 0.03, 'bottom'), 'map_prop_' + n)
print('ok')
