// Settings > Bigger text: the DOM UI sizes its text in px only, so every px font-size rule in the page's stylesheets is
// scaled by BIG (the originals are kept, so it turns off live). Canvas text is not touched.
// shortcut: CSS loaded after the toggle (a lazy chunk) stays unscaled until the next toggle / boot; fine while all CSS loads at boot
export const BIG = 1.15;
const orig = new Map();
export function bigText(on) {
  document.documentElement.classList.toggle('bigtext', !!on);
  if (!on && !orig.size) return;
  const k = on ? BIG : 1;
  const walk = (rules) => {
    for (const r of rules) {
      if (r.cssRules) walk(r.cssRules);
      const st = r.style;
      if (!st || !st.fontSize) continue;
      let v = orig.get(r);
      if (v == null) { if (!/^[\d.]+px$/.test(st.fontSize)) continue; v = parseFloat(st.fontSize); orig.set(r, v); }
      st.setProperty('font-size', (v * k).toFixed(1) + 'px', st.getPropertyPriority('font-size'));
    }
  };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { /* a cross-origin sheet (web fonts) */ } }
}
