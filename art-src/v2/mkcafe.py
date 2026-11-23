import json
P=json.load(open('art-src/v2/place.json'))
def t(a,id,en,tr,cost,res=None):
    x_,y_,w_=P[a][id]
    d={'id':f'{a}_{id}','name':{'en':en,'tr':tr},'cost':cost,'sprite':f'cafe_{a}_{id}.webp','x':x_,'y':y_,'w':w_}
    if res: d['resident']=res
    return d
def R(id,name,en,tr,perk): return {'id':id,'name':name,'line':{'en':en,'tr':tr},'perk':perk}
data={'areas':[
 {'id':'counter','name':{'en':'Counter','tr':'Tezgah'},'shell':'cafe_shell_counter.webp','tasks':[
  t('counter','counter','Wooden counter','Ahşap tezgah',1),
  t('counter','pastry','Pastry display','Pasta vitrini',1),
  t('counter','lamps','Pendant lamps','Sarkıt lambalar',2,R('mochi','Mochi','Mrrp! This place smells like fresh pastry.','Mırr! Burası taze pasta kokuyor.','coins_bonus')),
  t('counter','chalkboard','Chalkboard menu','Tebeşir menü',2),
  t('counter','tables','Tables and stools','Masalar ve tabureler',3),
  t('counter','plant','Monstera plant','Monstera çiçeği',3,R('biscuit','Biscuit','Chef Biscuit reporting for duty!','Şef Bisküvi göreve hazır!','hint_discount')),
 ]},
 {'id':'window','name':{'en':'Sunny Window','tr':'Güneşli Pencere'},'shell':'cafe_shell_window.webp','tasks':[
  t('window','seat','Window seat','Pencere kenarı koltuğu',1),
  t('window','plants','Hanging plants','Asma bitkiler',1),
  t('window','bookshelf','Bookshelf','Kitaplık',2,R('luna','Luna','A good book and a sunny spot. Purrfect.','İyi bir kitap, güneşli bir köşe. Mükemmel.','extra_undo')),
  t('window','cattree','Cat tree','Kedi ağacı',2),
  t('window','rug','Paw rug','Pati halı',3),
  t('window','lights','String lights','Işık zinciri',3,R('pudding','Pudding','Fluffy and fancy, that is me!','Tüylü ve şık, işte benim!','star_bonus')),
 ]}],
 'teaser':{'id':'cushion','name':{'en':'Cushion Corner','tr':'Minder Köşesi'},'image':'cafe_teaser_cushion.webp'},
 'notes':'x,y = sprite center and w = sprite width, as fractions of the shell image (sprite webps are square, padded).'}
json.dump(data,open('data/cafe.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
