import sys
from PIL import Image, ImageDraw
import numpy as np
# usage: proc.py src.png dst.webp size [opaque]
src,dst,size=sys.argv[1],sys.argv[2],int(sys.argv[3]); mode=sys.argv[4] if len(sys.argv)>4 else 'key'
im=Image.open(src).convert('RGBA')
if mode=='opaque':
    im=im.convert('RGB').resize((size,size),Image.LANCZOS); im.save(dst,'WEBP',quality=85); print('ok',dst); sys.exit()
a=np.array(im)
if (a[...,3]<250).mean()<0.02:   # no real alpha: chroma-key from edges
    rgb=im.convert('RGB'); M=(1,2,3); w,h=rgb.size
    for p in [(0,0),(w-1,0),(0,h-1),(w-1,h-1),(w//2,0),(w//2,h-1),(0,h//2),(w-1,h//2)]:
        if rgb.getpixel(p)!=M: ImageDraw.floodfill(rgb,p,M,thresh=70)
    m=np.array(rgb); bg=(m[...,0]==1)&(m[...,1]==2)&(m[...,2]==3)
    # defringe: erode keep-mask by 1px where pixel is magenta-ish
    keep=~bg
    r,g,b=a[...,0].astype(int),a[...,1].astype(int),a[...,2].astype(int)
    mag=(r>170)&(b>170)&(g<110)
    edge=np.zeros_like(keep)
    for dy,dx in((1,0),(-1,0),(0,1),(0,-1)):
        edge|=np.roll(bg,(dy,dx),(0,1))
    keep&=~(edge&mag)
    keep&=~((r>225)&(b>225)&(g<70))
    a[...,3]=np.where(keep,255,0)
    im=Image.fromarray(a)
bb=im.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox()
im=im.crop(bb); w,h=im.size; s=max(w,h); pad=int(s*0.04); S=s+2*pad
c=Image.new('RGBA',(S,S),(0,0,0,0)); c.paste(im,((S-w)//2,(S-h)//2),im)
c=c.resize((size,size),Image.LANCZOS); c.save(dst,'WEBP',quality=85,method=6); c.save(dst.replace('.webp','.preview.png')) if False else None
print('ok',dst,bb)
