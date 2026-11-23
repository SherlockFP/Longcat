import json
from PIL import Image
d=json.load(open('data/cafe.json',encoding='utf-8')); A='public/assets/v2/'
S=700
def put(c,f,x,y,w):
    sp=Image.open(A+f).convert('RGBA'); W=int(w*S); sp=sp.resize((W,W)); c.alpha_composite(sp,(int(x*S-W/2),int(y*S-W/2)))
def render(a,built):
    c=Image.new('RGBA',(S,S),(60,60,80,255)); c.alpha_composite(Image.open(A+a['shell']).convert('RGBA').resize((S,S)))
    res=[]
    for t in a['tasks']:
        if built: put(c,t['sprite'],t['x'],t['y'],t['w'])
        if t.get('resident'): res.append(t['resident']['id'])
    if not built: put(c,a['clutter']['sprite'],a['clutter']['x'],a['clutter']['y'],a['clutter']['w'])
    else:
        for r,s in zip(res,a['spots']): put(c,f"res_{r}_{s['pose']}.webp",s['x'],s['y'],s['w']*1.15)
    return c
out=Image.new('RGBA',(S*3,S*2))
for i,a in enumerate(d['areas'][2:]):
    out.paste(render(a,True),(i*S,0)); out.paste(render(a,False),(i*S,S))
out.convert('RGB').save('art-src/v2/r6/_comp6.png')
