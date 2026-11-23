# R6 cafe art notes
New files (public/assets/v2): 3 clean shells, 18 decor sprites (cafe_<area>_<item>.webp), 3 clutter sprites (cafe_clutter_<area>.webp), 12 resident files (res_noodle/pepper/clover/captain + _sit/_loaf). Sources + GPT sheets in art-src/v2/r6/.
data/cafe.json: areas 3-5 rewritten (no hue), each has `clutter` {sprite,x,y,w}, `spots`, 6 tasks. Residents carry `value` (2) next to an existing perk id.
Clean shells: areas 3-5 had plants/lamps/paint baked in, so all three were regenerated empty. Areas 1-2 shells (counter, window) still have baked paint cans/dust sheet/plants: regenerate them the same way if wanted.

Code must change:
1. Render area.clutter under decor, only while the area has unbuilt tasks; fade opacity ~ pending/total as tasks complete (gone when area done). Areas 1-2 have no clutter field yet (still baked).
2. IDLE chatter in src/game/cafe.js has no entries for noodle/pepper/clover/captain (idle is null now): add lines.
3. Resident `value` (2) is not read anywhere; hasPerk is boolean per kind, so duplicates of one kind do not stack. Either use value or ignore.
4. cafe_teaser_cushion.webp now shows an area that exists; refresh teaser if the 'more corners' card is still wanted after area 5.
5. Draw order = task order; keep rug first in cushion.
Weak: cushion pile sits partly on the rug fringe; rooftop/patio cat spots overlap decor slightly; busts have flat bottom edge.
