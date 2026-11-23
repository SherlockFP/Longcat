// WebAudio synthesized sfx. No files.
import { save } from './save.js';

let ctx = null;
let master = null;

function ensure() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

const on = () => save.data.settings.sound && ensure();

function tone({ type = 'sine', f0, f1 = f0, t = 0, dur = 0.15, vol = 0.3, vib = 0, lp = 0 }) {
  const c = ctx;
  const t0 = c.currentTime + t;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    o.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master);
  if (vib) {
    const l = c.createOscillator();
    const lg = c.createGain();
    l.frequency.value = vib;
    lg.gain.value = f0 * 0.05;
    l.connect(lg);
    lg.connect(o.frequency);
    l.start(t0);
    l.stop(t0 + dur);
  }
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// Pentatonic ladder in semitones above C5-ish.
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const hz = (semi) => 392 * Math.pow(2, semi / 12);

export const audio = {
  unlock() {
    ensure();
  },
  // silence everything while an ad plays
  hold(on) {
    if (master) master.gain.value = on ? 0 : 0.5;
  },
  mrrp(step = 0) {
    if (!on()) return;
    const f = hz(LADDER[Math.min(step, LADDER.length - 1)]);
    tone({ type: 'triangle', f0: f * 0.8, f1: f * 1.25, dur: 0.1, vol: 0.32, vib: 26 });
    tone({ type: 'triangle', f0: f * 1.05, f1: f * 1.6, t: 0.09, dur: 0.14, vol: 0.28, vib: 30 });
  },
  mew() {
    if (!on()) return;
    tone({ type: 'sawtooth', f0: 520, f1: 250, dur: 0.38, vol: 0.2, vib: 9, lp: 900 });
  },
  pop() {
    if (!on()) return;
    tone({ type: 'sine', f0: 700, f1: 180, dur: 0.12, vol: 0.3 });
  },
  tick() {
    if (!on()) return;
    tone({ type: 'sine', f0: 880, f1: 660, dur: 0.05, vol: 0.15 });
  },
  star(i = 0) {
    if (!on()) return;
    tone({ type: 'triangle', f0: hz(LADDER[i * 2 + 2]), f1: hz(LADDER[i * 2 + 2]), dur: 0.22, vol: 0.28 });
  },
  // carrier leaves: bell pair that climbs with consecutive carriers
  depart(step = 0) {
    if (!on()) return;
    const f = hz(LADDER[Math.min(step * 2, LADDER.length - 1)]);
    tone({ type: 'triangle', f0: f, f1: f, dur: 0.2, vol: 0.3 });
    tone({ type: 'triangle', f0: f * 1.5, f1: f * 1.5, t: 0.1, dur: 0.3, vol: 0.28 });
  },
  // a parked cat hops into its carrier during a bench chain: a bright note that climbs with every hop
  chain(step = 0) {
    if (!on()) return;
    const f = hz(LADDER[Math.min(3 + step * 2, LADDER.length - 1)]);
    tone({ type: 'triangle', f0: f * 0.9, f1: f * 1.15, dur: 0.16, vol: 0.3 });
    tone({ type: 'sine', f0: f * 2, f1: f * 2, t: 0.06, dur: 0.14, vol: 0.14 });
  },
  land() {
    if (!on()) return;
    tone({ type: 'sine', f0: 520, f1: 300, dur: 0.09, vol: 0.22 });
  },
  clear() {
    if (!on()) return;
    [0, 4, 7, 12, 16].forEach((s, i) => tone({ type: 'triangle', f0: hz(s), f1: hz(s), t: i * 0.09, dur: 0.28, vol: 0.28 }));
  },
};
