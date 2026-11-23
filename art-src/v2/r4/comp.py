import json,sys
from PIL import Image
O='../../../public/assets/v2/'
L=json.load(open('layout.json'))
areas=sys.argv[1:] or list(L)
S=700
sheet=Image.new('RGB',(S*min(3,len(areas)),S*((len(areas)+2)//3)),(255,255,255))
for i,a in enumerate(areas):
    c=Image.new('RGBA',(S,S),(255,244,230,255))
    sh=Image.open(O+L[a]['shell']).convert('RGBA').resize((S,S)); c.alpha_composite(sh)
    items=[(t[1],'cafe_'+t[0]+'.webp',t[2],t[3],t[4]) for t in L[a]['tasks']]
    for _,f,x,y,w in sorted(items,key=lambda z:z[3]):
        im=Image.open(O+f).convert('RGBA'); s=int(w*S); im=im.resize((s,s))
        c.alpha_composite(im,(int(x*S-s/2),int(y*S-s/2)))
    for r,pose,x,y,w in L[a]['guests']:
        im=Image.open(O+f'res_{r}_{pose}.webp').convert('RGBA'); s=int(w*S); im=im.resize((s,s))
        c.alpha_composite(im,(int(x*S-s/2),int(y*S-s/2)))
    sheet.paste(c.convert('RGB'),((i%3)*S,(i//3)*S))
sheet.save('composite.png')
