'use client';

// Sonido de jugada sin assets: un "click" corto vía Web Audio.
let _ctx: AudioContext | null = null;

export function playMoveSound(capture = false) {
  if (typeof window === 'undefined') return;
  try {
    _ctx = _ctx || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = _ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(capture ? 220 : 320, now);
    osc.frequency.exponentialRampToValueAtTime(capture ? 140 : 180, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  } catch { /* noop */ }
}
