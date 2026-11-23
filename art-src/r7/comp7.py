"""Composite previews approximating target screens from the r7 pieces (390x844 @2x)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
R = '../../public/assets/r7/'
W, H = 780, 1688


def L(n):
    return Image.open(R + n + '.webp').convert('RGBA')


def put(cv, im, cx, cy, w=None, h=None, anchor='c'):
    if w and not h:
        h = round(im.size[1] * w / im.size[0])
    if h and not w:
        w = round(im.size[0] * h / im.size[1])
    if w:
        im = im.resize((w, h), Image.LANCZOS)
    x = round(cx - im.size[0] / 2)
    y = round(cy - im.size[1] / 2) if anchor == 'c' else round(cy - im.size[1])
    cv.alpha_composite(im, (x, y))
    return im


def F(s):
    return ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', s)


def text(cv, t, cx, cy, s, fill=(255, 246, 229), sh=(90, 50, 25)):
    d = ImageDraw.Draw(cv)
    f = F(s)
    d.text((cx + 2, cy + 3), t, font=f, fill=sh, anchor='mm')
    d.text((cx, cy), t, font=f, fill=fill, anchor='mm')


DK = (60, 35, 20)
CR = (255, 240, 211)


def gameplay():
    cv = Image.open(R + 'bg_play_room.webp').convert('RGBA').resize((W, H), Image.LANCZOS)
    put(cv, L('btn_round'), 62, 74, 70)
    d = ImageDraw.Draw(cv)
    d.rectangle([48, 62, 58, 86], fill=(142, 85, 48))
    d.rectangle([66, 62, 76, 86], fill=(142, 85, 48))
    put(cv, L('plaque_wood'), W / 2, 74, 260)
    text(cv, 'LEVEL 27', W / 2, 74, 34)
    put(cv, L('pill_cream'), 668, 74, 190)
    put(cv, L('badge_honey'), 600, 74, 52)
    text(cv, '240', 690, 74, 32, DK, CR)
    put(cv, L('belt_wood'), W / 2, 330, 740, anchor='b')
    put(cv, L('carrier_blue'), 440, 262, 150, anchor='b')
    put(cv, L('carrier_pink'), 600, 262, 150, anchor='b')
    put(cv, L('carrier_orange'), 215, 270, 270, anchor='b')
    put(cv, L('badge_honey'), 255, 176, 66)
    text(cv, '1/3', 255, 176, 24, DK, CR)
    bp = L('bench_plank')
    bw = 740
    bh = round(bp.size[1] * bw / bp.size[0])
    by = 470
    put(cv, bp, W / 2, by + bh / 2, bw)
    xs = [130, 260, 390, 520, 650]
    for x in xs:
        put(cv, L('cushion'), x, by + bh * 0.42, 110)
    put(cv, L('cat_curl_pink'), xs[1], by + bh * 0.38, 105)
    put(cv, L('cat_curl_mint'), xs[3], by + bh * 0.38, 105)
    t = L('table_top')
    tw = 734
    th = round(t.size[1] * tw / t.size[0])
    ty = 540
    put(cv, t, W / 2, ty + th / 2, tw)
    gx0 = (W - tw) / 2
    m = tw * 0.115
    bx0 = gx0 + m
    bw2 = tw - 2 * m
    cell = bw2 / 7
    by0 = ty + th * 0.085
    tile = L('tile_ivory')
    for r in range(9):
        for c in range(7):
            cv.alpha_composite(tile.resize((round(cell) - 2, round(cell) - 2)), (round(bx0 + c * cell + 1), round(by0 + r * cell + 1)))
    cats = {
        'green': [(0, 0), (0, 1), (0, 2), (0, 3), (1, 3), (2, 3)],
        'blue': [(2, 0), (3, 0), (4, 0), (4, 1), (5, 1)],
        'pink': [(6, 0), (6, 1), (6, 2), (6, 3), (5, 3), (4, 3)],
        'purple': [(3, 2), (3, 3), (3, 4), (4, 4), (4, 5)],
        'mint': [(0, 5), (0, 6), (1, 6), (2, 6), (2, 5)],
        'yellow': [(6, 5), (6, 6), (5, 6), (5, 7), (6, 7)],
        'red': [(0, 8), (1, 8), (2, 8), (3, 8), (3, 7), (4, 7)],
    }
    col = {'green': (140, 205, 50), 'blue': (70, 170, 235), 'pink': (240, 120, 170), 'purple': (150, 90, 215), 'mint': (80, 205, 180), 'yellow': (250, 200, 40), 'red': (225, 80, 60), 'orange': (245, 140, 40)}

    def pts(path):
        return [(bx0 + (c + .5) * cell, by0 + (r + .5) * cell) for c, r in path]
    wdt = int(cell * 0.78)
    shd = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shd)
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    for k, p in cats.items():
        P = pts(p)
        sd.line([(x - 5, y + 9) for x, y in P], fill=(60, 30, 10, 90), width=wdt, joint='curve')
        for x, y in P:
            sd.ellipse([x - 5 - wdt / 2, y + 9 - wdt / 2, x - 5 + wdt / 2, y + 9 + wdt / 2], fill=(60, 30, 10, 90))
    cv.alpha_composite(shd.filter(ImageFilter.GaussianBlur(5)))
    for k, p in cats.items():
        P = pts(p)
        c = col[k]
        od.line(P, fill=c + (255,), width=wdt, joint='curve')
        for x, y in P:
            od.ellipse([x - wdt / 2, y - wdt / 2, x + wdt / 2, y + wdt / 2], fill=c + (255,))
        x, y = P[-1]
        od.ellipse([x - 12, y - 12, x + 12, y + 12], fill=(255, 250, 240, 255))
        dk = tuple(int(v * .78) for v in c)
        for x, y in P[1:-1]:
            od.ellipse([x - 8, y - 8, x + 8, y + 8], fill=dk + (255,))
    cv.alpha_composite(ov)
    for k, p in cats.items():
        x, y = pts(p)[0]
        put(cv, L('cat_head_%s_happy' % k), x, y - 4, int(cell * 1.08))
    ov2 = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    o2 = ImageDraw.Draw(ov2)
    lp = [(bx0 + 1.5 * cell, by0 + 1.2 * cell), (bx0 + 1.8 * cell, by0 + .2 * cell), (bx0 + 1.4 * cell, ty - 50), (bx0 + 1.6 * cell, 330)]
    for i in range(len(lp) - 1):
        o2.line([lp[i], lp[i + 1]], fill=col['orange'] + (255,), width=int(cell * 0.7))
    for x, y in lp:
        o2.ellipse([x - cell * .35, y - cell * .35, x + cell * .35, y + cell * .35], fill=col['orange'] + (255,))
    cv.alpha_composite(ov2)
    put(cv, L('cat_head_orange_happy'), lp[-1][0], lp[-1][1] - 10, int(cell * 1.1))
    for n, x, cnt in (('btn_hint', 200, '3'), ('btn_scoop', 390, '2'), ('btn_undo', 580, '1')):
        put(cv, L(n), x, 1590, 150)
        put(cv, L('badge_honey'), x + 52, 1640, 46)
        text(cv, cnt, x + 52, 1640, 26, DK, CR)
    return cv


def hub():
    bg = Image.open(R + 'room_counter_bare.webp').convert('RGBA').resize((W, round(H * 0.62) + 30), Image.LANCZOS)
    cv = Image.new('RGBA', (W, H), (191, 121, 72, 255))
    cv.alpha_composite(bg, (0, 0))
    for n, x, y, w in (('counter_counter', 260, 640, 330), ('counter_pastry', 560, 640, 250), ('counter_lamps', 400, 330, 330), ('counter_plant', 80, 740, 150),
                       ('counter_tables', 640, 930, 280), ('counter_chalkboard', 120, 880, 140)):
        put(cv, L('decor_' + n), x, y, w, anchor='b')
    put(cv, L('res7_mochi_job'), 400, 900, 250, anchor='b')
    put(cv, L('res7_pudding_idle'), 560, 770, 150, anchor='b')
    put(cv, L('tipjar_2'), 340, 650, 70, anchor='b')
    for i, (ic, t) in enumerate((('badge_honey', '5'), ('badge_honey', '1280'), ('icon_trophy', '7'))):
        put(cv, L('pill_cream'), 130 + i * 260, 54, 200)
        put(cv, L(ic), 60 + i * 260, 54, 52)
        text(cv, t, 150 + i * 260, 54, 30, DK, CR)
    for i, ic in enumerate(('icon_lock', 'icon_lock', 'icon_home')):
        put(cv, L('btn_round'), 50, 250 + i * 110, 78)
        put(cv, L(ic), 50, 250 + i * 110, 48)
    for i, ic in enumerate(('icon_gift', 'icon_trophy', 'icon_calendar')):
        put(cv, L('btn_round'), 730, 250 + i * 110, 78)
        put(cv, L(ic), 730, 250 + i * 110, 48)
    put(cv, L('panel_cream'), W / 2, 1130, 720, 190)
    put(cv, L('decor_window_seat'), 150, 1205, 150, anchor='b')
    d = ImageDraw.Draw(cv)
    for i in range(5):
        d.rounded_rectangle([290 + i * 70, 1118, 350 + i * 70, 1142], 12, fill=(242, 181, 68) if i < 3 else (225, 205, 170))
    put(cv, L('btn_green'), 650, 1130, 150)
    text(cv, '3', 665, 1130, 38)
    d.rectangle([0, 1250, W, H], fill=(142, 85, 48))
    put(cv, L('btn_play'), W / 2, 1370, 520)
    text(cv, 'PLAY', W / 2, 1352, 74)
    text(cv, 'LEVEL 12', W / 2, 1404, 28)
    d.rectangle([0, 1570, W, H], fill=(255, 246, 229))
    for i, ic in enumerate(('icon_home', 'icon_paw', 'icon_shop', 'icon_trophy')):
        put(cv, L(ic), 98 + i * 195, 1630, 84)
    return cv


if __name__ == '__main__':
    gameplay().convert('RGB').save('_comp_play.png')
    hub().convert('RGB').save('_comp_hub.png')
