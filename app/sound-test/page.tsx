'use client';

/**
 * Talk2Me — Page démo des sons d'appel synthétisés via Web Audio API.
 * Démo pour valider le son "dring dring" rotary phone vintage avant d'intégrer
 * dans #418 (Calls v2 honnêtes).
 */

import { useRef, useState } from 'react';

function getAudioCtx(): AudioContext {
  const w = window as unknown as { _ttmAudioCtx?: AudioContext };
  if (!w._ttmAudioCtx) {
    w._ttmAudioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
  }
  return w._ttmAudioCtx;
}

/**
 * Joue UN dring de téléphone rotary vintage.
 * 2 cloches mécaniques alternées (440Hz et 480Hz) modulées par battement 25Hz.
 */
function playDring(durationSec = 0.4, startAt = 0): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getAudioCtx();
    const now = ctx.currentTime + startAt;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 440;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 480;

    // Battement mécanique 25Hz (LFO modulant le gain)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 25;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.02);
    gain.gain.linearRampToValueAtTime(0.4, now + durationSec - 0.05);
    gain.gain.linearRampToValueAtTime(0, now + durationSec);

    lfoGain.connect(gain.gain);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);
    osc1.stop(now + durationSec);
    osc2.stop(now + durationSec);
    lfo.stop(now + durationSec);

    setTimeout(resolve, (startAt + durationSec) * 1000);
  });
}

/**
 * Joue le cycle complet "DRING DRING" puis silence.
 * Comme un téléphone fixe : 2 sonneries collées puis pause ~2s.
 */
async function playDringDringCycle(): Promise<void> {
  await playDring(0.4, 0);
  await playDring(0.4, 0.2);
}

/**
 * Signal "occupé" : 2 tons (480Hz + 620Hz) alternés 0.5s on / 0.5s off.
 */
function playBusy(cycles = 4): void {
  const ctx = getAudioCtx();
  let t = ctx.currentTime;
  for (let i = 0; i < cycles; i++) {
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 480;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 620;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.02);
    g.gain.linearRampToValueAtTime(0.35, t + 0.45);
    g.gain.linearRampToValueAtTime(0, t + 0.5);
    osc1.connect(g);
    osc2.connect(g);
    g.connect(ctx.destination);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.5);
    osc2.stop(t + 0.5);
    t += 1.0;
  }
}

/** Bip final descendant (raccrochage). */
function playHangup(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.4);
}

export default function SoundTestPage() {
  const [ringing, setRinging] = useState(false);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRingLoop = () => {
    setRinging(true);
    playDringDringCycle();
    ringIntervalRef.current = setInterval(() => {
      playDringDringCycle();
    }, 3000);
  };

  const stopRingLoop = () => {
    setRinging(false);
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  };

  return (
    <div className="min-h-[100svh] flex flex-col items-center justify-center p-6 gap-4 bg-[#0e0e12] text-white">
      <h1 className="text-2xl font-bold mb-2">Talk2Me — Sons d&apos;appel</h1>
      <p className="text-white/55 text-sm text-center max-w-md mb-4">
        Démo des sons synthétisés via Web Audio API pour #418 (Calls v2).
      </p>

      <button
        onClick={() => playDringDringCycle()}
        className="w-64 h-14 rounded-full bg-red-600 text-white font-medium hover:bg-red-500 active:scale-95"
      >
        🔔 1 cycle Dring Dring
      </button>

      <button
        onClick={ringing ? stopRingLoop : startRingLoop}
        className="w-64 h-14 rounded-full bg-red-700 text-white font-medium hover:bg-red-600 active:scale-95"
      >
        {ringing ? '⏹ Arrêter la sonnerie' : '🔔 Sonnerie en boucle'}
      </button>

      <button
        onClick={() => playBusy(4)}
        className="w-64 h-14 rounded-full bg-orange-600 text-white font-medium hover:bg-orange-500 active:scale-95"
      >
        📵 Signal occupé
      </button>

      <button
        onClick={playHangup}
        className="w-64 h-14 rounded-full bg-neutral-700 text-white font-medium hover:bg-neutral-600 active:scale-95"
      >
        📞 Bip raccrochage
      </button>

      <div className="mt-8 text-xs text-white/40 text-center max-w-sm">
        Validation Pascal avant intégration dans le module appel (#418).
        <br />
        Si t&apos;aimes le rendu → on l&apos;intègre tel quel.
        <br />
        Si t&apos;aimes pas → on bascule sur des .wav samples libres de droits.
      </div>
    </div>
  );
}
