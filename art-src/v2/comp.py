import json
from PIL import Image
d=json.load(open('data/cafe.json')); A='public/assets/v2/'
out=Image.new('RGB',(1600,800),(40,40,60))
for i,a in enumerate(d['areas']):
    sh=Image.open(A+a['shell']).convert('RGBA'); S=800
    c=Image.new('RGBA',(S,S),(255,255,255,255)); sh=sh.resize((S,S)); c.alpha_composite(sh)
    for t in a['tasks']:
        sp=Image.open(A+t['sprite']).convert('RGBA'); w=int(t['w']*S); sp=sp.resize((w,w))
        c.alpha_composite(sp,(int(t['x']*S-w/2),int(t['y']*S-w/2)))
    out.paste(c.convert('RGB'),(i*800,0))
out.save('art-src/v2/_comp.png')
