// Tiny chiptune SFX engine. One shared AudioContext, created on first user gesture.

let ctx: AudioContext | null = null;
let muted = false;
let lastTick = 0;

export function setMuted(m: boolean) {
  muted = m;
}

function ac(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  return ctx;
}

export function unlock() {
  ac();
}

interface ToneOpts { type?: OscillatorType; vol?: number; at?: number; slideTo?: number }

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + (o.at ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
  const vol = o.vol ?? 0.06;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function tick() {
  if (muted) return;
  const a = ac();
  if (!a || a.currentTime - lastTick < 0.03) return;
  lastTick = a.currentTime;
  tone(1500 + Math.random() * 400, 0.025, { vol: 0.04 });
}

export function slider(level: number) {
  tone(180 + level * 70, 0.05, { vol: 0.03, type: level >= 8 ? 'sawtooth' : 'square' });
}

export function win() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.16, { at: i * 0.09, vol: 0.06 }));
  tone(1046.5, 0.5, { at: 0.36, type: 'triangle', vol: 0.08 });
}

export function doom() {
  tone(220, 1.5, { type: 'sawtooth', slideTo: 40, vol: 0.1 });
  tone(233, 1.5, { type: 'sawtooth', slideTo: 43, vol: 0.07 });
  tone(55, 1.8, { type: 'square', vol: 0.08, at: 0.15 });
}

export function pizza() {
  [659.25, 783.99, 880, 783.99, 659.25, 523.25, 587.33, 659.25, 1046.5].forEach((f, i) =>
    tone(f, 0.14, { at: i * 0.11, type: 'triangle', vol: 0.08 }));
}
