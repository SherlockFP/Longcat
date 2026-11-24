"""R13 look lane rooms: fit + webp -> public/assets/r7/. usage: python proc_r13.py (reads brd_<theme>.png from batch_r13.sh)"""
import os
from PIL import Image
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'r7')
for th in ['autumn', 'snow', 'lantern', 'beach', 'galaxy', 'candy']:
    p = os.path.join(os.path.dirname(__file__), 'brd_' + th + '.png')
    if not os.path.exists(p): print('missing', p); continue
    im = Image.open(p).convert('RGB')
    w, h = im.size  # cover-fit to 2:3 then 1024x1536 like the pack rooms
    tw = min(w, h * 2 // 3); th_ = tw * 3 // 2
    im = im.crop(((w - tw) // 2, (h - th_) // 2, (w - tw) // 2 + tw, (h - th_) // 2 + th_)).resize((1024, 1536), Image.LANCZOS)
    dst = os.path.join(OUT, 'brd_' + th + '.webp'); im.save(dst, 'WEBP', quality=80, method=6); print(dst, os.path.getsize(dst))
