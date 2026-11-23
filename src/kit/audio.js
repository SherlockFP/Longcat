// Sampled sfx + a cozy music loop (CC0 files in public/sfx, see CREDITS.md). Files load lazily after the first tap;
// until a file is decoded (or if it fails) the old WebAudio synth version of that sound plays instead.
import { save } from './save.js';

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let held = false;

const MASTER = 0.5;
const MUSIC_VOL = 0.4; // relative to master; the loop is mastered ~7 LU under the sfx too
const MUSIC_LEN = 60.632; // cozy_puzzle_title_bpm95: 96 beats at 95 bpm, loops seamlessly

const BASE = (import.meta.env && import.meta.env.BASE_URL) || './';
// event -> variants (public/sfx/<name>.mp3). scripts/check-sfx.mjs reads this list.
export const SFX = {
  mrrp: ['mrrp1', 'mrrp2', 'mrrp3'],
  mew: ['mew1', 'mew2'],
  bonk: ['bonk'],
  pop: ['pop1', 'pop2', 'pop3', 'pop4'],
  tick: ['tick1', 'tick2'],
  star: ['star'],
  clack: ['clack'],
  jingle: ['jingle'],
  plink: ['plink1', 'plink2'],
  thump: ['thump1', 'thump2'],
  win: ['win'],
};
export const MUSIC = 'music';

const bufs = {}; // file name -> AudioBuffer
let loading = false;
const last = {}; // event -> last variant index (no immediate repeats)
const voices = {}; // event -> playing sources (oldest stopped past the cap)

function ensure() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = held ? 0 : MASTER;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = MUSIC_VOL;
      musicBus.connect(master);
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
  return ctx;
}

const on = () => save.data.settings.sound && ensure();

function decode(ab) {
  // the promise form is missing on old Safari: the callback form works everywhere
  return new Promise((res, rej) => {
    const p = ctx.decodeAudioData(ab, res, rej);
    if (p && p.catch) p.catch(rej);
  });
}

async function fetchBuf(name) {
  try {
    const r = await fetch(`${BASE}sfx/${name}.mp3`);
    if (!r.ok) return;
    bufs[name] = await decode(await r.arrayBuffer());
  } catch {
    // keep the synth fallback for this sound
  }
}

function load() {
  if (loading || !ctx) return;
  loading = true;
  const names = [...new Set(Object.values(SFX).flat())];
  Promise.all(names.map(fetchBuf)).then(() => fetchBuf(MUSIC)).then(() => syncMusic());
}

// One sample voice. Returns false when the file is not ready, so the caller plays the synth version.
function sample(ev, { rate = 1, vol = 1, t = 0, cap = 4 } = {}) {
  const list = SFX[ev];
  const ready = list.filter((n) => bufs[n]);
  if (!ready.length) return false;
  let i = Math.floor(Math.random() * ready.length);
  if (ready.length > 1 && i === last[ev]) i = (i + 1) % ready.length;
  last[ev] = i;
  const src = ctx.createBufferSource();
  src.buffer = bufs[ready[i]];
  src.playbackRate.value = rate * (0.97 + Math.random() * 0.06); // +-3% so repeats do not grate
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g);
  g.connect(sfxBus);
  const vs = (voices[ev] = voices[ev] || []);
  while (vs.length >= cap) {
    try { vs.shift().stop(); } catch { /* already ended */ }
  }
  vs.push(src);
  src.onended = () => { const k = vs.indexOf(src); if (k >= 0) vs.splice(k, 1); };
  src.start(ctx.currentTime + t);
  return true;
}

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
  g.connect(sfxBus);
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
const semi = (s) => Math.pow(2, s / 12);
const rung = (i, max = LADDER.length - 1) => LADDER[Math.max(0, Math.min(i, max))];

// ---- music: one looping source, restarted from where it paused ----
let mSrc = null;
let mPos = 0; // seconds into the loop when it last stopped
let mAt = 0; // ctx time the current source started at offset mPos

function musicWanted() {
  return !!(ctx && save.data.settings.music && !held && !document.hidden && bufs[MUSIC]);
}

function stopMusic() {
  if (!mSrc) return;
  mPos = (mPos + ctx.currentTime - mAt) % mSrc.loopEnd;
  try { mSrc.stop(); } catch { /* already stopped */ }
  mSrc = null;
}

function syncMusic() {
  if (!ctx) return;
  if (!musicWanted()) return stopMusic();
  if (mSrc) return;
  const b = bufs[MUSIC];
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.loop = true;
  s.loopStart = 0;
  s.loopEnd = Math.min(b.duration, MUSIC_LEN);
  s.connect(musicBus);
  // a short fade in so a resume never clicks
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
  musicBus.gain.exponentialRampToValueAtTime(MUSIC_VOL, ctx.currentTime + 0.8);
  mAt = ctx.currentTime;
  s.start(0, mPos % s.loopEnd);
  mSrc = s;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      stopMusic();
      ctx.suspend().catch(() => {});
    } else {
      ctx.resume().catch(() => {});
      syncMusic();
    }
  });
}

export const audio = {
  unlock() {
    if (!ensure()) return;
    load();
    syncMusic();
  },
  // settings changed (Sound / Music toggles)
  sync() {
    if (ctx) syncMusic();
  },
  // silence everything while an ad plays (the music pauses and resumes where it was)
  hold(on) {
    held = !!on;
    if (master) master.gain.value = held ? 0 : MASTER;
    syncMusic();
  },
  mrrp(step = 0) {
    if (!on()) return;
    if (sample('mrrp', { rate: semi(rung(step, 4)), vol: 0.75, cap: 3 })) return; // the meow climbs up to +9 semitones
    const f = hz(rung(step));
    tone({ type: 'triangle', f0: f * 0.8, f1: f * 1.25, dur: 0.1, vol: 0.32, vib: 26 });
    tone({ type: 'triangle', f0: f * 1.05, f1: f * 1.6, t: 0.09, dur: 0.14, vol: 0.28, vib: 30 });
  },
  mew() {
    if (!on()) return;
    const b = sample('bonk', { vol: 0.7, cap: 2 });
    if (sample('mew', { rate: 0.95, vol: 0.7, t: b ? 0.06 : 0, cap: 1 }) || b) return;
    tone({ type: 'sawtooth', f0: 520, f1: 250, dur: 0.38, vol: 0.2, vib: 9, lp: 900 });
  },
  pop() {
    if (!on()) return;
    if (sample('pop', { vol: 0.9 })) return;
    tone({ type: 'sine', f0: 700, f1: 180, dur: 0.12, vol: 0.3 });
  },
  tick() {
    if (!on()) return;
    if (sample('tick', { rate: 1.1, vol: 0.55, cap: 2 })) return;
    tone({ type: 'sine', f0: 880, f1: 660, dur: 0.05, vol: 0.15 });
  },
  star(i = 0) {
    if (!on()) return;
    if (sample('star', { rate: semi([0, 4, 7, 12][Math.min(i, 3)]), vol: 0.8 })) return;
    tone({ type: 'triangle', f0: hz(LADDER[i * 2 + 2]), f1: hz(LADDER[i * 2 + 2]), dur: 0.22, vol: 0.28 });
  },
  // carrier leaves: the door clacks shut, then a bell that climbs with consecutive carriers
  depart(step = 0) {
    if (!on()) return;
    const c = sample('clack', { vol: 0.7, cap: 2 });
    if (sample('jingle', { rate: semi(rung(step, 5)), vol: 0.75, t: c ? 0.08 : 0, cap: 3 }) || c) return;
    const f = hz(rung(step * 2));
    tone({ type: 'triangle', f0: f, f1: f, dur: 0.2, vol: 0.3 });
    tone({ type: 'triangle', f0: f * 1.5, f1: f * 1.5, t: 0.1, dur: 0.3, vol: 0.28 });
  },
  // a parked cat hops into its carrier during a bench chain: a glossy plink that climbs with every hop
  chain(step = 0) {
    if (!on()) return;
    if (sample('plink', { rate: semi(rung(step, 7)) * 0.85, vol: 0.7 })) return;
    const f = hz(rung(3 + step * 2));
    tone({ type: 'triangle', f0: f * 0.9, f1: f * 1.15, dur: 0.16, vol: 0.3 });
    tone({ type: 'sine', f0: f * 2, f1: f * 2, t: 0.06, dur: 0.14, vol: 0.14 });
  },
  land() {
    if (!on()) return;
    if (sample('thump', { vol: 0.65 })) return;
    tone({ type: 'sine', f0: 520, f1: 300, dur: 0.09, vol: 0.22 });
  },
  clear() {
    if (!on()) return;
    if (sample('win', { vol: 0.8, cap: 1 })) return;
    [0, 4, 7, 12, 16].forEach((s, i) => tone({ type: 'triangle', f0: hz(s), f1: hz(s), t: i * 0.09, dur: 0.28, vol: 0.28 }));
  },
};
