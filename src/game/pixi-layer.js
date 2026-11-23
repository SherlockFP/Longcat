// PixiJS v8 underlay for the board (r10 perf lane, opt-in: '?r=pixi' or Settings > GPU renderer).
// WebGPU first, WebGL fallback. It draws what perf.js otherwise draws on the two underlay canvases (room + rug, plank,
// shadows) plus the bodies of the still cats as GPU sprites; Canvas2D on #game keeps the heads, the moving cats and
// every effect. It only re-renders when something changed (a cat left or arrived, the camera moved, a layout rebuild).
import { Application, Container, Sprite, Texture, CanvasSource, Matrix } from 'pixi.js';

const tex = (canvas, dpr) => new Texture({ source: new CanvasSource({ resource: canvas, resolution: dpr }) });

export async function createPixiLayer(g) {
  const canvas = document.createElement('canvas');
  canvas.id = 'pf-pixi';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  const app = new Application();
  await app.init({ canvas, preference: 'webgpu', backgroundAlpha: 0, antialias: false, resolution: g.dpr, width: g.W, height: g.H, autoStart: false, sharedTicker: false, autoDensity: false });
  app.ticker && app.ticker.stop();
  g.canvas.parentNode.insertBefore(canvas, g.canvas);
  const api = app.renderer.name || (app.renderer.type === 2 ? 'webgpu' : 'webgl');
  const far = new Container();
  const near = new Container();
  const shadows = new Container();
  const bodies = new Container();
  bodies.sortableChildren = true;
  near.addChild(shadows, bodies);
  app.stage.addChild(far, near);
  let farS = null, nearS = null;
  let dirty = true;
  const live = new Set();
  const drop = (e) => {
    const p = e.px;
    if (!p) return;
    for (const s of [p.sh, p.bd]) { s.destroy({ texture: true, textureSource: true }); }
    e.px = null;
    live.delete(e);
  };
  return {
    api,
    // the baked far/near canvases (rebuilt by perf.js) become two sprites
    layers(farCv, nearCv) {
      app.renderer.resize(g.W, g.H, g.dpr);
      for (const s of [farS, nearS]) if (s) s.destroy({ texture: true, textureSource: true });
      farS = new Sprite(tex(farCv, g.dpr));
      nearS = new Sprite(tex(nearCv, g.dpr));
      far.addChild(farS);
      near.addChildAt(nearS, 0);
      for (const e of [...live]) drop(e);
      dirty = true;
    },
    camera(m) {
      near.setFromMatrix(new Matrix(m[0], m[1], m[2], m[3], m[4], m[5]));
      const p = 0.4;
      far.setFromMatrix(new Matrix(1 + (m[0] - 1) * p, m[1] * p, m[2] * p, 1 + (m[3] - 1) * p, m[4] * p, m[5] * p));
      dirty = true;
    },
    // a still cat this frame: its baked shadow + body as sprites (made on first sight)
    cat(e, id, frame) {
      if (!e.px) {
        const d = g.dpr;
        const sh = new Sprite(tex(e.shadow, d));
        const bd = new Sprite(tex(e.body, d));
        sh.position.set(e.x, e.y);
        bd.position.set(e.x, e.y);
        bd.zIndex = Math.max(0, (g.order || []).indexOf(id));
        shadows.addChild(sh);
        bodies.addChild(bd);
        e.px = { sh, bd };
        live.add(e);
        dirty = true;
      }
      if (!e.px.bd.visible) { e.px.sh.visible = e.px.bd.visible = true; dirty = true; }
      e.seen = frame;
      return true;
    },
    // after the Canvas2D frame: hide cats that were not drawn still this frame (running, gone), render if anything changed
    end(frame) {
      for (const e of live) {
        if (e.seen === frame) continue;
        if (e.px.bd.visible) { e.px.sh.visible = e.px.bd.visible = false; dirty = true; }
        if (frame - e.seen > 240) drop(e);
      }
      if (!dirty) return;
      dirty = false;
      app.render();
    },
    destroy() {
      for (const e of [...live]) drop(e);
      try { app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true }); } catch { canvas.remove(); }
    },
  };
}
