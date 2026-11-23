// Hub lane (R10): the home level map, the resident layout in the café rooms, the wide-screen side panels and the
// keyboard shortcuts. ui.js calls hubAfter(screen, info) once a screen is mounted; main.js calls home() when the player
// comes back to the hub (the map is the first thing they see). Pure view: every tap goes through the ui.js click
// delegation (a data-act button), so the game logic stays in main.js.
import './hub.css';
import { t, lang } from '../i18n.js';
import { assetUrl } from '../game/breeds.js';
import { save } from '../kit/save.js';
import { levelKind, TEACH } from '../core/generate.js';
import { RESIDENTS, isBuilt } from '../game/cafe.js';
import { taskDone } from '../game/econ.js';
import { cardsOwned, WEEKS } from '../game/r10.js';
import { CHAPTER_LEN, CHAPTERS, PROPS } from '../../data/hub.js';
import { goalsHtml, featGoalHtml, featGoal } from './live.js';
import { retMap, retRoom, retPanel } from './r11-ret.js'; // R11 retention lane: the album card, the hang card
import { decorateMap, chapterName as bossChapter } from './boss.js'; // boss lane: castle nodes, chest markers, the chest / flame pill

const root = document.getElementById('ui');
const r7 = (name, cls = '') => `<img class="${cls}" src="${assetUrl('r7/' + name + '.webp')}" alt="" draggable="false">`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const loc = (o) => (o && typeof o === 'object' ? o[lang()] || o.en || '' : o || '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; return (x * 2246822519) >>> 0; };
const state = () => { const d = save.data; if (!d.hub || typeof d.hub !== 'object') d.hub = { seen: 0 }; return d.hub; };

document.documentElement.style.setProperty('--hm-bg', `url("${assetUrl('r7/map_bg.webp')}")`);

let mapOn = true; // the hub opens on the level map; the House tab (or any room action) shows the café rooms
let last = { screen: '', info: null };
let mapScroll = null; // { lv, top }: where the player scrolled the map, kept across hub redraws

export const chapterOf = (n) => Math.floor((n - 1) / CHAPTER_LEN) + 1;
export const chapterName = (c) => (c <= CHAPTERS.length ? loc(CHAPTERS[c - 1]) : bossChapter(c, CHAPTERS.length)); // boss lane: generated names past the named stops

// ---- entry points ----
export function home() { mapOn = true; mapScroll = null; }
export function roomMode() { mapOn = false; } // R11 ret: a completed album page sends the player to a room
export const mapShown = () => mapOn && !!document.querySelector('#cafe.on .hubmap');

export function hubAfter(screen, info) {
  last = { screen, info };
  if (screen === 'cafe') {
    tabs(info);
    if (mapOn) showMap(info); else { hideMap(); layoutResidents(); }
    retRoom(info, mapOn);
  }
  panels();
}

// actions that only make sense in the rooms leave the map first (the build card, the goals strip, the House tab)
const ROOM_ACTS = new Set(['cafeview', 'cafearea', 'build', 'streetbuild', 'reno', 'party', 'jartap', 'reqtap']);
root.addEventListener('click', (e) => {
  const h = e.target.closest('[data-hub]');
  if (h && h.dataset.hub === 'map') {
    if (!mapOn) { mapOn = true; mapScroll = null; if (last.screen === 'cafe') { tabs(last.info); showMap(last.info); } }
    return;
  }
  const a = e.target.closest('[data-act]');
  if (a && mapOn && ROOM_ACTS.has(a.dataset.act) && document.querySelector('#cafe.on')) {
    mapOn = false;
    hideMap();
  }
}, true);

// ---- tab bar: Map first, the old Home tab becomes House ----
const MAP_SVG = '<svg class="hmicon" viewBox="0 0 32 32"><path d="M3 7.5 11 4l10 3.5L29 4v20.5L21 28l-10-3.5L3 28z" fill="#fff0d3" stroke="#8e5530" stroke-width="2.2" stroke-linejoin="round"/><path d="M11 4v20.5M21 7.5V28" stroke="#d9b98a" stroke-width="1.6"/><path d="M6.5 22c3-1 3.5-5 7-6s5.5 2.5 8.5 0" fill="none" stroke="#bd582f" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.5 3.2"/><path d="M23.5 6.5a3.6 3.6 0 0 1 3.6 3.6c0 2.8-3.6 6.2-3.6 6.2s-3.6-3.4-3.6-6.2a3.6 3.6 0 0 1 3.6-3.6z" fill="#e5484d" stroke="#8e5530" stroke-width="1.4"/><circle cx="23.5" cy="10.1" r="1.3" fill="#fff6e5"/></svg>';
function tabs(info) {
  const bar = document.querySelector('#cafe .tabbar');
  if (!bar) return;
  const house = bar.querySelector('.tab[data-act="cafeview"]');
  if (house) {
    house.classList.toggle('on', !mapOn);
    const sp = house.querySelector('span');
    if (sp) sp.textContent = t('houseTab');
    house.setAttribute('aria-label', t('houseTab'));
    // something waits in the rooms (a build, a request, a full jar): a dot on House while the map is up
    const k = info && info.live && info.live.spot && info.live.spot.k;
    let dot = house.querySelector('.dot.hm');
    if (mapOn && ['build', 'req', 'jar'].includes(k)) { if (!dot) house.insertAdjacentHTML('beforeend', '<i class="dot hm"></i>'); } else if (dot) dot.remove();
  }
  let mt = bar.querySelector('.hmtab');
  if (!mt) { bar.insertAdjacentHTML('afterbegin', `<button class="tab hmtab" data-hub="map" aria-label="${t('mapTab')}">${MAP_SVG}<span>${t('mapTab')}</span></button>`); mt = bar.querySelector('.hmtab'); }
  mt.classList.toggle('on', mapOn);
  document.getElementById('cafe').classList.toggle('hm-on', mapOn);
}

// ---- the level map ----
const GAP = 104; // px between two levels on the road
const PAD_TOP = 170; // the locked levels and the "more ahead" cloud above the last node
const PAD_BOT = 150; // under the first node: the goals strip covers the room's bottom
function geometry(cur, W) {
  const first = Math.max(1, cur - 24);
  const lastLv = Math.max(cur + 3, Math.ceil(cur / 5) * 5); // boss lane: the next chest marker is always on the map
  const H = PAD_TOP + (lastLv - first) * GAP + PAD_BOT;
  const cx = W / 2 - Math.min(16, W * 0.04); // the right rail stands over the room's right edge
  const amp = Math.min(118, W * 0.25);
  const pos = (lv) => ({ x: cx + amp * Math.sin(lv * 0.82 + 0.6), y: H - PAD_BOT - (lv - first) * GAP });
  return { first, lastLv, H, pos, cx, amp };
}

// Catmull-Rom through the node points -> one smooth cubic path
function roadPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

const starRow = (n) => `<i class="hmstars">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}">&#9733;</i>`).join('')}</i>`;

function mapHtml(cur, W) {
  const G = geometry(cur, W);
  const { first, lastLv, H, pos } = G;
  const best = save.data.bestStars || {};
  // the road runs one step past both ends so it leaves the screen instead of stopping at a node
  const all = [];
  for (let lv = first - 1; lv <= lastLv + 1; lv++) all.push(pos(lv));
  const done = all.slice(0, cur - first + 2);
  const ahead = all.slice(cur - first + 1);
  // mirror-tiled lawn: every other block is flipped, so the tiles meet without a seam
  const bh = Math.round(W * 1.5);
  const bg = Array.from({ length: Math.ceil(H / bh) }, (_, i) => `<i class="hmbg ${i % 2 ? 'f' : ''}" style="top:${H - (i + 1) * bh}px;height:${bh}px"></i>`).join('');
  const items = [];
  for (let lv = first; lv <= lastLv; lv++) {
    const p = pos(lv);
    const kind = levelKind(lv);
    const tag = kind === 'boss' ? `<i class="hmtag super">${t('mapSuper')}</i>` : kind === 'hard' ? `<i class="hmtag hard">${t('mapHard')}</i>` : '';
    const nw = TEACH[lv] ? `<i class="hmnew">${t('mapNew')}</i>` : '';
    const st = `left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px`;
    if (lv < cur) items.push(`<div class="hmn done ${kind}" data-lv="${lv}" style="${st}">${r7('map_node_done', 'hmc')}<b>${lv}</b>${starRow(best[lv] || 0)}${tag}</div>`);
    else if (lv === cur) items.push(`<button class="hmn cur ${kind}" data-act="play" data-lv="${lv}" style="${st}" aria-label="${t('mapLevel', { n: lv })}">${r7('map_node_cur', 'hmc')}<b>${lv}</b>${tag}${nw}</button>`); // R11 pres: a level marker (still tappable); the bottom PLAY is the one Play
    else items.push(`<div class="hmn lock ${kind}" data-lv="${lv}" style="${st}">${r7('map_node_lock', 'hmc')}<b>${lv}</b>${tag}${nw}</div>`);
    // a chapter signpost where the road enters the next stop of the town (to the roomier side of the road)
    if ((lv - 1) % CHAPTER_LEN === 0) {
      const q = pos(lv - 0.5);
      const left = q.x > G.cx;
      const c = chapterOf(lv);
      items.push(`<div class="hmsign ${left ? 'l' : 'r'} ${lv > cur ? 'ahead' : ''}" style="top:${q.y.toFixed(1)}px">${r7('map_sign', 'hss')}<span><small>${t('mapChapter', { n: c })}</small><b>${esc(chapterName(c))}</b></span></div>`);
    } else if (hash(lv) % 3 !== 0) {
      // a garden prop on the far side of the road (never where a signpost stands)
      const q = pos(lv + 0.5);
      const side = q.x > G.cx ? 'l' : 'r';
      items.push(`<i class="hmprop ${side}" style="top:${q.y.toFixed(1)}px">${r7('map_prop_' + PROPS[hash(lv + 7) % PROPS.length])}</i>`);
    }
  }
  const pc = pos(cur);
  const end = pos(lastLv + 0.9);
  const svg = `<svg class="hmroad" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
<path d="${roadPath(all)}" class="r0"/><path d="${roadPath(all)}" class="r1"/>
<path d="${roadPath(ahead)}" class="r2"/><path d="${roadPath(done)}" class="r3"/><path d="${roadPath(all)}" class="r4"/></svg>`;
  return `<div class="hmscroll"><div class="hmpath" style="height:${H}px">${bg}${svg}
<div class="hmend" style="top:${(end.y - 40).toFixed(1)}px">${t('mapSoon')}</div>
${first === 1 ? `<div class="hmstart" style="left:${pos(1).x.toFixed(1)}px;top:${(pos(1).y + 70).toFixed(1)}px">${t('mapStart')}</div>` : ''}
${items.join('')}
<i class="hmcat" style="left:${pc.x.toFixed(1)}px;top:${pc.y.toFixed(1)}px">${r7('cat_head_orange_happy')}</i>
</div></div>`;
}

function showMap(info) {
  const room = document.querySelector('#cafe .room');
  if (!room) return;
  const cur = (info && info.level) || save.data.level;
  let m = room.querySelector('.hubmap');
  if (!m) { room.insertAdjacentHTML('beforeend', '<div class="hubmap"></div>'); m = room.querySelector('.hubmap'); }
  const W = room.clientWidth || 360;
  m.innerHTML = mapHtml(cur, W);
  retMap(true, info);
  decorateMap(m, geometry(cur, W), cur);
  m.dataset.w = W;
  const sc = m.querySelector('.hmscroll');
  const G = geometry(cur, W);
  const target = (lv) => Math.max(0, G.pos(lv).y - sc.clientHeight * 0.56);
  const st = state();
  const from = st.seen > 0 && st.seen < cur && cur - st.seen <= 3 ? st.seen : 0;
  if (mapScroll && mapScroll.lv === cur) sc.scrollTop = mapScroll.top;
  else sc.scrollTop = target(cur);
  sc.addEventListener('scroll', () => { mapScroll = { lv: cur, top: sc.scrollTop }; }, { passive: true });
  if (st.seen !== cur) { st.seen = cur; save.commit(); }
  // the level ceremony: the cat hops from the level just cleared onto the new one, and the new node pops open
  if (from && !reduced()) {
    const cat = m.querySelector('.hmcat');
    const node = m.querySelector('.hmn.cur');
    const a = G.pos(from);
    cat.style.transition = 'none';
    cat.style.left = a.x + 'px';
    cat.style.top = a.y + 'px';
    node.classList.add('wait');
    sc.scrollTop = Math.max(0, a.y - sc.clientHeight * 0.6);
    void cat.offsetWidth;
    setTimeout(() => {
      if (!cat.isConnected) return;
      const b = G.pos(cur);
      cat.style.transition = '';
      cat.classList.add('hop');
      cat.style.left = b.x + 'px';
      cat.style.top = b.y + 'px';
      sc.scrollTo({ top: target(cur), behavior: 'smooth' });
      setTimeout(() => { if (node.isConnected) { node.classList.remove('wait'); node.classList.add('pop'); } cat.classList.remove('hop'); }, 700);
    }, 450);
  }
}

function hideMap() {
  const m = document.querySelector('#cafe .hubmap');
  if (m) m.remove();
  retMap(false);
  const c = document.getElementById('cafe');
  if (c) c.classList.remove('hm-on');
  const bar = document.querySelector('#cafe .tabbar');
  if (bar) {
    const mt = bar.querySelector('.hmtab');
    if (mt) mt.classList.remove('on');
    const h = bar.querySelector('.tab[data-act="cafeview"]');
    if (h) { h.classList.add('on'); const dot = h.querySelector('.dot.hm'); if (dot) dot.remove(); }
  }
}

// ---- residents: a deterministic non-overlapping layout on the visible floor ----
// Every resident, every visitor on its nook bed (bed + cat move as one) and the visitor at the door is a box anchored
// at its feet. Each one keeps its designed spot when that is free; otherwise the nearest free spot on the visible floor
// wins (a scan sorted by distance). Nothing may touch the top bar, the rails, the goals strip, the room name, the jar
// or the next build's tag. When the floor is too small everyone shrinks a step and the scan runs again.
const FLOOR = 0.58; // feet stand at least this far down the room art (the floor, not the wall)
const hit = (a, b, m = 0) => a.l < b.r + m && b.l < a.r + m && a.t < b.b + m && b.t < a.b + m;
export function layoutResidents() {
  const room = document.querySelector('#cafe .room');
  const stage = room && room.querySelector('.stage');
  if (!stage || room.classList.contains('house')) return [];
  const R = room.getBoundingClientRect();
  const SR = stage.getBoundingClientRect();
  const S = SR.width;
  if (!R.width || !S) return [];
  room.querySelectorAll('.rqbub[hidden], .guest.g7[hidden], .nook7[hidden]').forEach((el) => { el.hidden = false; }); // a re-layout starts from everyone
  const rel = (r) => ({ l: r.left - SR.left, t: r.top - SR.top, r: r.right - SR.left, b: r.bottom - SR.top });
  const box = rel(R);
  const PAD = 4;
  const obs = [];
  const add = (el, below = 0) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return; const q = rel(r); obs.push({ l: q.l - PAD, t: q.t - PAD, r: q.r + PAD, b: q.b + PAD + below }); };
  room.querySelectorAll('.cafe-top, .fname, .goals, .tbd-tag, .sptag, .cups').forEach((el) => add(el));
  // the tip jar may still be loading (no height yet): a square jar standing on its anchor, its tag on top
  room.querySelectorAll('.jar7').forEach((el) => { const q = rel(el.getBoundingClientRect()); const w = q.r - q.l; const hw = Math.max(w, 76) / 2 + PAD; const cx = (q.l + q.r) / 2; if (w) obs.push({ l: cx - hw, r: cx + hw, t: q.b - w - 24 - PAD, b: q.b + PAD }); });
  room.querySelectorAll('.frail > *, .rrail > *').forEach((el) => add(el, el.querySelector('span') ? 14 : 0)); // a rail label hangs under its button
  let bot = box.b - PAD;
  const g = room.querySelector('.goals');
  if (g && g.getClientRects().length) bot = Math.min(bot, rel(g.getBoundingClientRect()).t - PAD); // R11: hidden on desktop (left panel)
  const pct = (v) => (parseFloat(v) || 0) / 100 * S;
  const units = [];
  const bubbleOf = (id) => room.querySelector(`.rqbub[data-who="${id}"]`);
  // residents first, then the visitors in their nooks, then the visitor at the door (dropped first if the room is full)
  room.querySelectorAll('.guest.g7:not(.visitor)').forEach((el) => {
    const bub = bubbleOf(el.dataset.id);
    units.push({ el, kind: 'g', x0: pct(el.style.left), y0: pct(el.style.top), w0: pct(el.style.width), hf: 1, bub, extra: bub ? bub.offsetHeight + 10 : 0 });
  });
  room.querySelectorAll('.nook7').forEach((bed) => {
    const cat = bed.nextElementSibling;
    if (!cat || !cat.classList.contains('visitor')) return;
    units.push({ el: bed, cat, kind: 'n', x0: pct(bed.style.left), y0: pct(bed.style.top), w0: pct(bed.style.width), hf: 0.98, extra: 0 });
  });
  room.querySelectorAll('.guest.visitor:not(.idle7)').forEach((el) => units.push({ el, kind: 'v', x0: pct(el.style.left), y0: pct(el.style.top), w0: pct(el.style.width), hf: 1, extra: 0 }));
  if (!units.length) return [];
  const width = box.r - box.l;
  const cap = Math.min(width * 0.3, (bot - box.t) * 0.42);
  const place = (s, floor) => {
    const placed = [];
    const out = [];
    for (const u of units) {
      const w = Math.min(u.w0 * s, cap);
      const h = u.hf * w + u.extra;
      const feetMin = Math.max(floor * S, box.t + PAD + h);
      const ok = (x, y) => {
        const b = { l: x - w / 2, r: x + w / 2, t: y - h, b: y };
        return b.l >= box.l + PAD && b.r <= box.r - PAD && b.t >= box.t + PAD && b.b <= bot && !obs.some((o) => hit(o, b)) && !placed.some((o) => hit(o, b, 3));
      };
      let best = null;
      if (u.y0 >= feetMin && u.y0 <= bot && ok(u.x0, u.y0)) best = { x: u.x0, y: u.y0 };
      else {
        let bc = Infinity;
        for (let y = bot; y >= feetMin; y -= 5) {
          for (let x = box.l + PAD + w / 2; x <= box.r - PAD - w / 2; x += 5) {
            const c = (x - u.x0) ** 2 + 2 * (y - u.y0) ** 2;
            if (c < bc && ok(x, y)) { bc = c; best = { x, y }; }
          }
        }
      }
      if (!best) return null;
      placed.push({ l: best.x - w / 2, r: best.x + w / 2, t: best.y - h, b: best.y });
      out.push({ u, x: best.x, y: best.y, w });
    }
    return out;
  };
  let res = null;
  for (const floor of [FLOOR, 0.45]) {
    for (let s = 1; s >= 0.4 && !res; s *= 0.88) res = place(s, floor);
    if (res) break;
  }
  if (!res) { // still no room (a tiny window): the door visitor steps out, then the nook visitors
    while (units.length > 1 && !res) {
      const u = units.pop();
      (u.cat ? [u.el, u.cat] : [u.el]).forEach((e) => { e.hidden = true; });
      for (let s = 1; s >= 0.4 && !res; s *= 0.88) res = place(s, 0.45);
    }
    if (!res) return [];
  }
  const P = (v) => `${((v / S) * 100).toFixed(3)}%`;
  for (const { u, x, y, w } of res) {
    const z = Math.round((y / S) * 100) + 1;
    if (u.kind === 'n') {
      Object.assign(u.el.style, { left: P(x), top: P(y), width: P(w), zIndex: z - 1 });
      Object.assign(u.cat.style, { left: P(x), top: P(y - w * 0.18), width: P(w * 0.8), zIndex: z });
    } else {
      Object.assign(u.el.style, { left: P(x), top: P(y), width: P(w), zIndex: z });
      const gb = u.el.querySelector('.gbub');
      if (gb) gb.className = `gbub ${x > box.l + width * 0.62 ? 'l' : x < box.l + width * 0.3 ? 'r' : ''}`;
    }
  }
  // the request bubbles: over their own cat, clear of the bars, the rails, each other and (when it fits) the other cats.
  // A Claim bubble is placed first, then a newcomer's ask, then a thank-you line.
  const cats = res.map(({ u, x, y, w }) => ({ u, b: { l: x - w / 2, r: x + w / 2, t: y - u.hf * w, b: y } }));
  const rank = (el) => (el.classList.contains('ask') ? 1 : el.classList.contains('next') ? 2 : 0);
  const bubs = [];
  for (const { u, x, y, w } of res.filter((r) => r.u.bub).sort((a, b) => rank(a.u.bub) - rank(b.u.bub))) {
    const bw = u.bub.offsetWidth;
    const bh = u.bub.offsetHeight;
    const y0 = y - w - 4;
    const fit = (bx, by, strict) => {
      const b = { l: bx - bw / 2, r: bx + bw / 2, t: by - bh, b: by + 8 };
      return b.l >= box.l + PAD && b.r <= box.r - PAD && b.t >= box.t + PAD && !obs.some((o) => hit(o, b)) && !bubs.some((o) => hit(o, b, 2)) && (!strict || !cats.some((c) => c.u !== u && hit(c.b, b)));
    };
    let pick = null;
    for (const strict of [true, false]) {
      let bc = Infinity;
      for (let by = y0; by >= box.t + PAD + bh; by -= 4) {
        for (let bx = box.l + PAD + bw / 2; bx <= box.r - PAD - bw / 2; bx += 4) {
          const c = (bx - x) ** 2 + 3 * (by - y0) ** 2;
          if (c < bc && fit(bx, by, strict)) { bc = c; pick = { bx, by }; }
        }
      }
      if (pick) break;
    }
    // no room (a small phone): a newcomer's ask or a thank-you waits in the café sheet; a Claim always shows
    if (!pick && rank(u.bub)) { u.bub.hidden = true; continue; }
    if (!pick) pick = { bx: Math.max(box.l + PAD + bw / 2, Math.min(box.r - PAD - bw / 2, x)), by: y0 };
    bubs.push({ l: pick.bx - bw / 2, r: pick.bx + bw / 2, t: pick.by - bh, b: pick.by + 8 });
    Object.assign(u.bub.style, { left: P(pick.bx), top: P(pick.by) });
  }
  return res;
}
// the web font arrives after the first layout: the bubbles and rail labels grow, so the room is laid out again
try { document.fonts.addEventListener('loadingdone', () => { if (!mapOn && document.querySelector('#cafe.on')) layoutResidents(); }); } catch { /* no font API */ }

// ---- wide screens: a bigger column with side panels ----
// index.html centres a 9:16 phone column on any screen wider than 2:3. On a desktop with room to spare the column
// grows (a bigger board) and two panels stand beside it: today (tasks, daily, events, goals, keys) on the left, the
// road, the residents and the album on the right. R11: the column keeps the one primary Play; the goals live in the
// left panel only (the featured one first), the road panel is chapter context.
let wideOn = false;
function wideFit() {
  const W = innerWidth, H = innerHeight;
  const base = Math.min(W, H * 9 / 16);
  const col = Math.floor(Math.min(H * 0.68, W - 2 * 300));
  const on = W >= 900 && W / H >= 2 / 3 && col > base;
  const de = document.documentElement;
  if (on) {
    de.classList.add('hubwide');
    de.style.setProperty('--vw', col + 'px');
    de.style.setProperty('--hs-w', Math.min(340, Math.floor((W - col) / 2 - 56)) + 'px');
  } else if (wideOn) {
    de.classList.remove('hubwide');
    de.style.removeProperty('--vw');
    de.style.removeProperty('--hs-w');
  }
  const changed = on !== wideOn;
  wideOn = on;
  if (on || changed) panels();
}

function asides() {
  let l = document.getElementById('hubL');
  if (!l) {
    document.body.insertAdjacentHTML('beforeend', '<aside class="hubside l" id="hubL"></aside><aside class="hubside r" id="hubR"></aside>');
    l = document.getElementById('hubL');
    // a panel tap replays as a hidden button inside #ui, so ui.js handles it exactly like the same tap in the column
    document.querySelectorAll('.hubside').forEach((a) => a.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !live()) return;
      const x = document.createElement('button');
      Object.assign(x.dataset, b.dataset);
      x.hidden = true;
      root.appendChild(x);
      x.click();
      x.remove();
    }));
  }
  return [l, document.getElementById('hubR')];
}
// the panels work while the hub is up with nothing over it; during a level they are a read-only summary
const live = () => !!document.querySelector('#cafe.on') && !document.getElementById('sheet') && !document.getElementById('modal') && !document.getElementById('arrival');

function panels() {
  if (!wideOn) return;
  const [L, Rr] = asides();
  const d = save.data;
  const info = last.info || {};
  const Lv = info.live;
  const cur = d.level;
  const play = last.screen === 'play';
  const tasks = d.quests.list || [];
  const tdone = tasks.filter((x) => taskDone(x)).length;
  const dailyDone = Lv ? Lv.daily.done : false;
  const row = (act, icon, title, sub, dot = false, extra = '') => `<button class="hsrow" data-act="${act}" ${extra}>${r7(icon, 'hsi')}<span><b>${title}</b><small>${sub}</small></span>${dot ? '<i class="dot"></i>' : ''}</button>`;
  const key = (k, label) => `<li>${k.map((x) => `<kbd>${x}</kbd>`).join('')}<span>${label}</span></li>`;
  const dots = (Lv && Lv.dots) || {};
  L.innerHTML = `<div class="hscard">
<h3>${play ? t('hsPlaying', { n: last.info && last.info.level ? last.info.level : cur }) : t('hsToday')}</h3>
${row('quests', 'icon_calendar', t('hsTasks'), t('hsTasksSub', { a: tdone, b: tasks.length || 3 }), dots.quests)}
${row('dailysheet', 'hud_medal', t('hsDaily'), dailyDone ? t('hsDailyDone', { n: Lv.daily.streak }) : t('hsDailyGo'), dots.daily)}
${row('show', 'icon_trophy', t('hsEvents'), t('hsEventsSub'), dots.show)}
${Lv && Lv.goals && Lv.goals.length ? `<h4>${t('hsGoals')}</h4><div class="hsgoals">${featGoalHtml(Lv.goals)}${goalsHtml(Lv.goals.filter((g) => g !== featGoal(Lv.goals)).slice(0, 2))}</div>` : ''}
<h4>${t('hsKeys')}</h4><ul class="hskeys">${key(['Space', 'Enter'], t('keyPlay'))}${key(['Z'], t('keyUndo'))}${key(['H'], t('keyHint'))}${key(['Esc'], t('keyBack'))}</ul>
</div>`;
  const c = chapterOf(cur);
  const inCh = (cur - 1) % CHAPTER_LEN;
  const owned = RESIDENTS.filter((r) => isBuilt(r.task.id));
  const cards = cardsOwned(d);
  Rr.innerHTML = `<div class="hscard">
<h3>${t('hsMap')}</h3>
<div class="hsroad"><div class="hssign">${r7('map_sign')}<span><small>${t('mapChapter', { n: c })}</small><b>${esc(chapterName(c))}</b></span></div>
<div class="hsdots">${Array.from({ length: CHAPTER_LEN }, (_, i) => `<i class="${i < inCh ? 'on' : i === inCh ? 'cur' : ''}"></i>`).join('')}</div>
<small>${t('hsChapterProg', { a: inCh, b: CHAPTER_LEN })}</small>
<small class="hsnext">${t('mapLevel', { n: cur })}</small></div>
<h4>${t('hsResidents')}</h4>
<button class="hsrow hsres" data-act="residents"><span class="hsheads">${owned.slice(0, 6).map((r) => r7('res7_' + r.id + '_idle')).join('') || r7('icon_paw', 'hsi')}</span><span><small>${t('hsResSub', { a: owned.length, b: RESIDENTS.length })}</small></span></button>
<h4>${t('hsAlbum')}</h4>
<button class="hsrow" data-act="album">${r7('album_book', 'hsi')}<span><b>${t('hsAlbumSub', { a: cards, b: WEEKS.length })}</b><i class="hsbar"><i style="width:${Math.round((cards / Math.max(1, WEEKS.length)) * 100)}%"></i></i></span></button>
</div>`;
  retPanel(L, Lv);
  const off = !live();
  L.classList.toggle('off', off);
  Rr.classList.toggle('off', off);
}

// the panels follow the column: a sheet opening or a screen change re-checks whether they can be tapped
new MutationObserver(() => {
  if (!wideOn) return;
  const off = !live();
  document.querySelectorAll('.hubside').forEach((a) => a.classList.toggle('off', off));
  if (document.querySelector('#hud.on') && last.screen !== 'play') { last = { screen: 'play', info: last.info }; panels(); }
}).observe(root, { childList: true });

// ---- keyboard ----
// Space/Enter: Play (or the card's main button: Next, Retry), Z: Undo, H: Hint, Esc: close / back
const shown = (el) => !!el && !el.disabled && !el.hidden && el.getClientRects().length > 0;
const first = (sels) => { for (const s of sels) { const el = [...document.querySelectorAll(s)].find(shown); if (el) return el; } return null; };
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const k = e.key;
  let el = null;
  const sheet = document.getElementById('sheet');
  const modal = document.getElementById('modal') || document.getElementById('arrival');
  if (k === ' ' || k === 'Enter') {
    if (e.repeat) { e.preventDefault(); return; }
    if (modal) el = first(['#modal [data-act=next]', '#modal [data-act=retry]', '#modal [data-act=dareplay]', '#modal [data-act=arriveplay]', '#arrival [data-act=arrivalclose]']);
    else if (!sheet) el = first(['#cafe.on .cafe-play', '#menu.on .btn.play']);
  } else if (k === 'z' || k === 'Z') {
    if (!modal && !sheet) el = first(['#hud.on #b-undo']);
  } else if (k === 'h' || k === 'H') {
    if (!modal && !sheet) el = first(['#hud.on #b-hint']);
  } else if (k === 'Escape') {
    if (sheet) el = first(['#sheet [data-act=closesheet]']);
    else if (modal) el = first(['#modal [data-act=close]', '#modal [data-act=arriveclose]', '#modal [data-act=dareskip]', '#arrival [data-act=arrivalclose]', '#modal [data-act=home]', '#modal [data-act=cafe]']);
    else if (document.querySelector('#cafe.on') && !mapOn) el = first(['#cafe .hmtab']);
    else el = first(['[data-act=pcclose]', '[data-act=cafeback]', '#hud.on [data-act=home]']);
  } else return;
  if (!el) return;
  e.preventDefault();
  el.click();
});

// ---- resize: the column, the map width and the resident layout follow the window ----
let rq = 0;
addEventListener('resize', () => {
  wideFit(); // before the game's own resize handler reads the column width
  cancelAnimationFrame(rq);
  rq = requestAnimationFrame(() => {
    if (last.screen !== 'cafe' || !document.querySelector('#cafe.on')) return;
    const m = document.querySelector('#cafe .hubmap');
    const room = document.querySelector('#cafe .room');
    if (m && room && +m.dataset.w !== room.clientWidth) showMap(last.info);
    layoutResidents();
  });
});
wideFit();
