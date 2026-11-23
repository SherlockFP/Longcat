import json
P='data/cafe.json'
d=json.load(open(P,encoding='utf-8'))
def T(id,en,tr,cost,sprite,x,y,w,res=None):
    t={'id':id,'name':{'en':en,'tr':tr},'cost':cost,'sprite':sprite,'x':x,'y':y,'w':w}
    if res: t['resident']=res
    return t
def R(id,name,en,tr,perk): return {'id':id,'name':name,'line':{'en':en,'tr':tr},'perk':perk,'value':2}
noodle=R('noodle','Noodle','Stretching out is my whole personality.','Uzanıp gerinmek benim tüm kişiliğim.','extra_undo')
pepper=R('pepper','Pepper','My tomatoes are almost ready. Almost.','Domateslerim neredeyse hazır. Neredeyse.','coins_bonus')
clover=R('clover','Clover','Every petal has a story to tell.','Her taçyaprağının anlatacak bir hikâyesi var.','hint_discount')
captain=R('captain','Captain','Cleared for landing, right on this bean bag.','İnişe izin verildi, tam şu pufun üstüne.','star_bonus')
a=d['areas']
def area(i,tasks,spots,clutter):
    a[i]['tasks']=tasks; a[i]['spots']=spots; a[i]['clutter']=clutter
area(2,[
 T('cushion_rug','Fluffy round rug','Yuvarlak tüylü halı',2,'cafe_cushion_rug.webp',0.52,0.72,0.36),
 T('cushion_lamp','Fabric floor lamp','Kumaş abajurlu lamba',3,'cafe_cushion_lamp.webp',0.5,0.45,0.15),
 T('cushion_shelf','Cubby bookshelf','Kedi yuvalı kitaplık',3,'cafe_cushion_shelf.webp',0.77,0.5,0.26,noodle),
 T('cushion_hammock','Cat hammock','Kedi hamağı',2,'cafe_cushion_hammock.webp',0.76,0.7,0.26),
 T('cushion_bench','Window bench','Cam kenarı bankı',3,'cafe_cushion_bench.webp',0.25,0.5,0.28),
 T('cushion_pile','Giant cushion pile','Dev minder yığını',3,'cafe_cushion_pile.webp',0.3,0.71,0.2),
],[{'pose':'loaf','x':0.5,'y':0.72,'w':0.15},{'pose':'sit','x':0.5,'y':0.82,'w':0.16}],
 {'sprite':'cafe_clutter_cushion.webp','x':0.5,'y':0.86,'w':0.24})
area(3,[
 T('patio_planters','Flower planters','Çiçek saksılıkları',2,'cafe_patio_planters.webp',0.22,0.52,0.26),
 T('patio_pergola','Vine pergola','Sarmaşıklı çardak',3,'cafe_patio_pergola.webp',0.5,0.46,0.34),
 T('patio_fountain','Little fountain','Küçük çeşme',3,'cafe_patio_fountain.webp',0.26,0.73,0.22,pepper),
 T('patio_lights','String-light post','Işık zincirli direk',2,'cafe_patio_lights.webp',0.82,0.5,0.22),
 T('patio_lounger','Sun lounger','Güneşlenme şezlongu',3,'cafe_patio_lounger.webp',0.78,0.74,0.26),
 T('patio_tables','Umbrella table set','Şemsiyeli masa takımı',3,'cafe_patio_tables.webp',0.52,0.74,0.26,clover),
],[{'pose':'sit','x':0.37,'y':0.6,'w':0.15},{'pose':'loaf','x':0.66,'y':0.88,'w':0.15}],
 {'sprite':'cafe_clutter_patio.webp','x':0.5,'y':0.86,'w':0.24})
area(4,[
 T('roof_canopy','Fairy-light canopy','Peri ışıklı gölgelik',2,'cafe_rooftop_canopy.webp',0.5,0.5,0.36),
 T('roof_telescope','Telescope','Teleskop',3,'cafe_rooftop_telescope.webp',0.22,0.56,0.18),
 T('roof_lemon','Potted lemon tree','Saksıda limon ağacı',3,'cafe_rooftop_lemon.webp',0.85,0.52,0.2,None),
 T('roof_tower','Cat climbing tower','Kedi tırmanma kulesi',2,'cafe_rooftop_tower.webp',0.8,0.72,0.24),
 T('roof_beanbags','Bean bags','Pufler',3,'cafe_rooftop_beanbags.webp',0.3,0.74,0.24),
 T('roof_grill','Snack grill cart','Atıştırmalık mangal arabası',3,'cafe_rooftop_grill.webp',0.55,0.7,0.2,captain),
],[{'pose':'sit','x':0.5,'y':0.6,'w':0.15},{'pose':'loaf','x':0.62,'y':0.86,'w':0.15}],
 {'sprite':'cafe_clutter_rooftop.webp','x':0.5,'y':0.86,'w':0.24})
d['notes']+=' clutter = per-area renovation sprite (x,y,w like a task); show it only while the area has unbuilt tasks and fade it out as tasks complete. value on a resident = perk strength (default 1).'
json.dump(d,open(P,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
