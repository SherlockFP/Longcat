"""Round 7 processing: magenta key, slice sheets, trim/pad, webp -> public/assets/r7/.
usage: python proc7.py [group ...]   (no args = all)"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'public', 'assets', 'r7'))
os.makedirs(OUT, exist_ok=True)
COLORS = ['orange', 'blue', 'pink', 'green', 'purple', 'mint', 'yellow', 'red']


def load(n):
    return Image.open(os.path.join(HERE, n + '.png')).convert('RGB')


BORDER_ONLY = False


def key(im):
    """magenta -> alpha with soft edge + despill. returns RGBA"""
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # magenta-ness: how far min(r,b) sits above g
    mg = np.minimum(r, b) - g
    d = np.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2)
    alpha = np.clip((d - 70) / 70.0, 0, 1)
    # items that are legitimately pink keep alpha 1 because d is large when g is high
    alpha = np.where(mg < 40, 1.0, alpha)
    # keep keying only for magenta connected to the image border (interior slivers stay opaque)
    from PIL import ImageDraw
    cand = Image.fromarray(((alpha < 1) * 255).astype(np.uint8)).convert('RGB')
    hh, ww = alpha.shape
    seeds = [(x, 0) for x in range(0, ww, 40)] + [(x, hh - 1) for x in range(0, ww, 40)] + [(0, y) for y in range(0, hh, 40)] + [(ww - 1, y) for y in range(0, hh, 40)]
    for sd in (seeds if BORDER_ONLY else []):
        if cand.getpixel(sd) == (255, 255, 255):
            ImageDraw.floodfill(cand, sd, (128, 128, 128))
    conn = np.asarray(cand)[..., 0] == 128
    conn = np.asarray(Image.fromarray(conn.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
    if BORDER_ONLY:
        alpha = np.where(conn, alpha, 1.0)
    A = (alpha * 255).astype(np.uint8)
    # flood only the border-connected background: remove isolated interior magenta-like pixels from keying
    # (cheap approach: require pixel to be near an alpha<1 neighbour or itself transparent)
    al_im = Image.fromarray(A)
    # edge band = pixels within 2px of fully transparent
    tr = Image.fromarray((A < 20).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
    band = (np.asarray(tr) > 0) & (A > 0)
    out = a.copy()
    avg = (r + b) / 2
    spill = band & (avg > g)
    new = g + (avg - g) * 0.25
    out[..., 0] = np.where(spill, np.minimum(r, new), r)
    out[..., 2] = np.where(spill, np.minimum(b, new), b)
    # shrink alpha by ~0.5px on band to kill the last fringe
    A2 = np.where(band, np.clip(A.astype(np.int32) - 40, 0, 255), A).astype(np.uint8)
    rgba = np.dstack([np.clip(out, 0, 255).astype(np.uint8), A2])
    return Image.fromarray(rgba, 'RGBA')


def fill_slivers(rgba, size=9, color=(70, 38, 20)):
    a = rgba.getchannel('A')
    closed = a.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
    arr = np.asarray(rgba).copy()
    new = (np.asarray(closed) > 200) & (arr[..., 3] < 200)
    arr[..., :3][new] = color
    arr[..., 3][new] = 255
    return Image.fromarray(arr, 'RGBA')


def runs(profile, mingap=10, minlen=20):
    on = profile > 0
    rs, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        if not v and start is not None:
            rs.append([start, i]); start = None
    if start is not None:
        rs.append([start, len(on)])
    merged = []
    for s, e in rs:
        if merged and s - merged[-1][1] < mingap:
            merged[-1][1] = e
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged if e - s >= minlen]


def slice_sheet(rgba, rows, cols):
    A = np.asarray(rgba)[..., 3] > 30
    rr = runs(A.sum(1), 10, 30)
    res = []
    if len(rr) != rows:
        print('  WARN rows found', len(rr), 'expected', rows, rr)
        # fall back to equal bands
        h = A.shape[0]; rr = [(int(i * h / rows), int((i + 1) * h / rows)) for i in range(rows)]
    for ri, (y0, y1) in enumerate(rr):
        cr = runs(A[y0:y1].sum(0), 10, 30)
        cols_n = cols[ri] if isinstance(cols, (list, tuple)) else cols
        if len(cr) != cols_n:
            print('  WARN cols found', len(cr), 'expected', cols_n, cr)
            w = A.shape[1]; cr = [(int(i * w / cols_n), int((i + 1) * w / cols_n)) for i in range(cols_n)]
        for (x0, x1) in cr:
            res.append(rgba.crop((x0, y0, x1, y1)))
    return res


def trim(im, thr=20):
    bb = im.getchannel('A').point(lambda v: 255 if v > thr else 0).getbbox()
    return im.crop(bb) if bb else im


def fit(im, W, H, pad=0.04, anchor='center'):
    """trim, scale to fit WxH canvas with pad, anchor center|bottom"""
    im = trim(im)
    w, h = im.size
    s = min(W * (1 - 2 * pad) / w, H * (1 - 2 * pad) / h)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    x = (W - im.size[0]) // 2
    y = (H - im.size[1]) // 2 if anchor == 'center' else H - im.size[1] - round(H * pad)
    c.paste(im, (x, y), im)
    return c


def save(im, name, q=86):
    p = os.path.join(OUT, name + '.webp')
    im.save(p, 'WEBP', quality=q, method=6)
    return p


def width_fit(im, W):
    im = trim(im); w, h = im.size
    return im.resize((W, max(1, round(h * W / w))), Image.LANCZOS)


GROUPS = {}


def group(f):
    GROUPS[f.__name__] = f
    return f


@group
def backgrounds():
    save(load('bg_play_room').resize((1024, 1536), Image.LANCZOS), 'bg_play_room', 80)
    if os.path.exists(os.path.join(HERE,'building_base.png')): save(load('building_base').resize((1024, 1536), Image.LANCZOS), 'building_base', 80)
    for a in ['counter', 'cushion', 'window', 'patio', 'rooftop']:
        if os.path.exists(os.path.join(HERE, f'room_{a}_bare.png')):
            save(load(f'room_{a}_bare').resize((1024, 1024), Image.LANCZOS), f'room_{a}_bare', 80)
    save(load('tile_ivory').resize((128, 128), Image.LANCZOS), 'tile_ivory', 90)
    f = load('tex_felt').resize((256, 256), Image.LANCZOS)
    # make seamless: blend with half-offset copy through a cosine window
    a = np.asarray(f).astype(np.float32)
    h, w, _ = a.shape
    wy = (0.5 - 0.5 * np.cos(2 * np.pi * (np.arange(h) + 0.5) / h))[:, None, None]
    wx = (0.5 - 0.5 * np.cos(2 * np.pi * (np.arange(w) + 0.5) / w))[None, :, None]
    sh = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    wgt = wy * wx
    seam = a * wgt + sh * (1 - wgt)
    save(Image.fromarray(seam.clip(0, 255).astype(np.uint8)), 'tex_felt', 85)


@group
def board():
    t = trim(key(load('table_top')))
    t.thumbnail((1024, 1024), Image.LANCZOS)
    save(t, 'table_top', 88)
    print('  table_top', t.size)
    save(width_fit(fill_slivers(key(load('belt_wood'))), 1024), 'belt_wood')
    save(width_fit(key(load('bench_plank')), 1024), 'bench_plank')
    save(fit(key(load('cushion')), 192, 160), 'cushion')


@group
def carriers():
    for sheet, suf in (('carriers_open', ''), ('carriers_shut', '_shut')):
        for c, im in zip(COLORS, slice_sheet(key(load(sheet)), 2, 4)):
            save(fit(im, 384, 320, 0.03, 'bottom'), f'carrier_{c}{suf}')


@group
def cats():
    for e in ('happy', 'sleepy', 'cheeky'):
        for c, im in zip(COLORS, slice_sheet(key(load('heads_' + e)), 2, 4)):
            save(fit(im, 256, 256, 0.03), f'cat_head_{c}_{e}')
    for c, im in zip(COLORS, slice_sheet(key(load('curls')), 2, 4)):
        save(fit(im, 256, 192, 0.03, 'bottom'), f'cat_curl_{c}')


@group
def ui():
    for n, im in zip(['btn_hint', 'btn_scoop', 'btn_undo'], slice_sheet(key(load('btns')), 1, 3)):
        save(fit(im, 256, 256, 0.02), n)
    names = ['panel_cream', 'plaque_wood', 'pill_cream', 'btn_play', 'btn_green', 'btn_round', 'badge_honey']
    parts = slice_sheet(key(load('ui_kit')), 2, [4, 3])
    for n, im in zip(names, parts):
        im = trim(im)
        im.thumbnail((768, 384), Image.LANCZOS)
        save(im, n, 90)
        print('  ', n, im.size)
    if os.path.exists(os.path.join(HERE, 'hud_icons.png')):
        for n, im in zip(['hud_heart', 'hud_coin', 'hud_star', 'hud_chest', 'hud_medal', 'hud_rosette', 'hud_fish', 'hud_yarn'], slice_sheet(key(load('hud_icons')), 2, 4)):
            save(fit(im, 192, 192, 0.03), n)
    icons = ['icon_home', 'icon_paw', 'icon_shop', 'icon_trophy', 'icon_gift', 'icon_calendar', 'icon_lock', 'icon_hammer']
    for n, im in zip(icons, slice_sheet(key(load('tab_icons')), 2, 4)):
        save(fit(im, 128, 128, 0.03), n)


@group
def house():
    for a in ['counter', 'cushion', 'window', 'patio', 'rooftop']:
        p = os.path.join(HERE, f'room_{a}_shell.png')
        if os.path.exists(p):
            k = key(load(f'room_{a}_shell'))
            cr = runs((np.asarray(k)[..., 3] > 30).sum(0), 40, 60)
            x0, x1 = max(cr, key=lambda r: r[1] - r[0])
            save(fit(k.crop((x0, 0, x1, k.size[1])), 1024, 512, 0.02), f'room_{a}_shell')
    names = ['floor_ground', 'floor_lit', 'floor_scaffold', 'floor_ghost']
    parts = slice_sheet(key(load('building_floors')), 2, 2)
    for n, im in zip(names, parts):
        im = trim(im)
        print('  ', n, im.size)
        save(im.resize((1024, 512), Image.LANCZOS), n)
    for n, im in zip(['roof_gable', 'roof_terrace'], slice_sheet(key(load('building_roof')), 1, 2)):
        im = trim(im); print('  ', n, im.size)
        save(width_fit(im, 1024), n)
    save(fit(key(load('crane')), 512, 512), 'crane')
    for i, im in enumerate(slice_sheet(key(load('tipjars')), 1, 4)):
        save(fit(im, 256, 256, 0.03, 'bottom'), f'tipjar_{i}')
    save(fit(key(load('guest')), 384, 384, 0.03, 'bottom'), 'guest_doorstep')


DECOR = {
    'counter': ['counter_counter', 'counter_pastry', 'counter_lamps', 'counter_chalkboard', 'counter_tables', 'counter_plant'],
    'window': ['window_seat', 'window_plants', 'window_bookshelf', 'window_cattree', 'window_rug', 'window_lights'],
    'cushion': ['cushion_rug', 'cushion_lamp', 'cushion_shelf', 'cushion_hammock', 'cushion_bench', 'cushion_pile'],
    'patio': ['patio_planters', 'patio_pergola', 'patio_fountain', 'patio_lights', 'patio_lounger', 'patio_tables'],
    'rooftop': ['roof_canopy', 'roof_telescope', 'roof_lemon', 'roof_tower', 'roof_beanbags', 'roof_grill'],
}
RES = ['mochi', 'biscuit', 'luna', 'pudding', 'noodle', 'pepper', 'clover', 'captain']


@group
def decor():
    for a, ids in DECOR.items():
        if not os.path.exists(os.path.join(HERE, f'decor_{a}.png')):
            continue
        for n, im in zip(ids, slice_sheet(key(load('decor_' + a)), 2, 3)):
            save(fit(im, 512, 512, 0.03, 'bottom'), 'decor_' + n)


@group
def residents():
    for suf in ('idle', 'job'):
        for n, im in zip(RES, slice_sheet(key(load('res_' + suf)), 2, 4)):
            save(fit(im, 384, 384, 0.03, 'bottom'), f'res7_{n}_{suf}')


if __name__ == '__main__':
    todo = sys.argv[1:] or list(GROUPS)
    for g in todo:
        try:
            print('==', g); GROUPS[g]()
        except FileNotFoundError as e:
            print('  missing', e)
