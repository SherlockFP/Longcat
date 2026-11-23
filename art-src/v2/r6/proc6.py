import numpy as np, json
from PIL import Image
from numpy import array
R='art-src/v2/r6/'; A='public/assets/v2/'
def key(im):
    a=np.array(im.convert('RGBA')).astype(int)
    r,g,b=a[...,0],a[...,1],a[...,2]
    bg=(r>205)&(b>205)&(g<90)&(abs(r-b)<50)
    # soft: pinkish blends next to bg
    fg=~bg
    # edge px = fg px adjacent to bg
    edge=np.zeros_like(fg)
    for dy,dx in((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
        edge|=np.roll(bg,(dy,dx),(0,1))
    edge&=fg
    # drop magenta-tinted edge px, despill remaining edge px
    tint=(r-g>40)&(b-g>40)
    drop=edge&tint
    fg&=~drop
    edge2=np.zeros_like(fg)
    for dy,dx in((1,0),(-1,0),(0,1),(0,-1)):
        edge2|=np.roll(~fg,(dy,dx),(0,1))
    edge2&=fg
    for _ in range(1):
        ch=edge2&(((r+b)//2)-g>15)
        a[...,0]=np.where(ch,np.minimum(r,g+15),r); a[...,2]=np.where(ch,np.minimum(b,g+15),b)
    a[...,3]=np.where(fg,255,0)
    return Image.fromarray(a.astype('uint8'),'RGBA')
def segs(mask,axis,minlen=6,gap=8):
    p=mask.any(axis=axis); out=[];s=None;z=0
    for i,v in enumerate(p):
        if v:
            if s is None:s=i
            z=0;e=i
        elif s is not None:
            z+=1
            if z>gap: 
                if e-s>=minlen: out.append((s,e+1))
                s=None
    if s is not None: out.append((s,e+1))
    return out
def fit(im,size):
    bb=im.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox(); im=im.crop(bb)
    w,h=im.size; s=max(w,h); pad=int(s*0.04); S=s+2*pad
    c=Image.new('RGBA',(S,S),(0,0,0,0)); c.paste(im,((S-w)//2,(S-h)//2),im)
    return c.resize((size,size),Image.LANCZOS)
def save(im,name): im.save(A+name,'WEBP',quality=85,method=6); print(name)
def grid(src):
    im=key(Image.open(R+src+'.png')); al=np.array(im)[...,3]>0
    out=[]
    for (y0,y1) in segs(al,1,gap=20):
        row=al[y0:y1]
        for (x0,x1) in segs(row,0,gap=20): out.append(im.crop((x0,y0,x1,y1)))
    return out
def sheetrow(src):
    im=key(Image.open(R+src+'.png')); al=np.array(im)[...,3]>0
    return [im.crop((x0,0,x1,im.height)) for x0,x1 in segs(al,0,gap=20)]
for nm,k in(('cushion','cushion'),('patio','patio'),('rooftop','rooftop')):
    im=key(Image.open(R+f'shell_{nm}.png')).resize((1024,1024),Image.LANCZOS)
    save(im,f'cafe_shell_{nm}.webp')
cl=sheetrow('clutter'); assert len(cl)==3,len(cl)
for nm,c in zip(('cushion','patio','rooftop'),cl): save(fit(c,512),f'cafe_clutter_{nm}.webp')
names={'cushion':['pile','hammock','rug','lamp','shelf','bench'],'patio':['pergola','tables','planters','fountain','lights','lounger'],'rooftop':['telescope','canopy','lemon','tower','beanbags','grill']}
for a,ns in names.items():
    g=grid('decor_'+a); assert len(g)==6,(a,len(g))
    for n,c in zip(ns,g): save(fit(c,512),f'cafe_{a}_{n}.webp')
cats=['noodle','pepper','clover','captain']
for src,suf in(('res_sit','_sit'),('res_loaf','_loaf'),('res_bust','')):
    row=sheetrow(src); assert len(row)==4,(src,len(row))
    for n,c in zip(cats,row): save(fit(c,384),f'res_{n}{suf}.webp')
