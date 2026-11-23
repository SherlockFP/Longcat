// Local analytics stub: console + counters in the save. Funnel = first time each milestone was reached (a timestamp, for D1/D7 style reads).
import { save } from './save.js';
import { now } from './clock.js';

export function track(name, props = {}) {
  const c = save.data.counters;
  c[name] = (c[name] || 0) + 1;
  save.commit();
  if (import.meta.env.DEV) console.log('[an]', name, JSON.stringify(props));
}

// session-1 funnel milestones: l1, l3, first_resident, l10
export function funnel(step) {
  const f = save.data.meta.funnel;
  if (f[step]) return;
  f[step] = now();
  track('funnel_' + step, { session: save.data.meta.sessions });
}

// D1 / D7 proxies: days since the first open, checked on every app open
export function retention() {
  const m = save.data.meta;
  if (!m.firstOpen) return;
  const days = Math.floor((now() - m.firstOpen) / 86400000);
  for (const [k, n] of [['d1', 1], ['d7', 7]]) {
    if (days >= n && !m.ret[k]) {
      m.ret[k] = now();
      track('retention_' + k, { days });
    }
  }
}
