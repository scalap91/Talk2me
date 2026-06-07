/**
 * Talk2Me Calls v2 — Sons synthétisés via Web Audio API (Pascal 2026-06-05).
 *
 * Tonalité honnête (cf doctrine Pascal #418) : la tonalité côté appelant
 * n'est PAS un fake loop comme WhatsApp. Elle est jouée UNIQUEMENT lorsque
 * l'app de l'appelé envoie un ring_beat (un cycle = un beat).
 *
 * Tous les sons sont synthétisés en runtime (pas de fichier .wav embarqué)
 * → 0 ko ajouté au bundle. Validé sur /sound-test.
 *
 * IMPORTANT : Web Audio API n'est dispo qu'après une interaction user (auto-
 * play policy). Le 1er appel à `getAudioCtx()` doit avoir lieu en réponse à
 * un click/tap, sinon AudioContext démarre en 'suspended'. Les helpers gèrent
 * un .resume() best-effort.
 */

interface AudioCtxStore {
  ctx?: AudioContext;
  // Liste des nodes actifs qu'on doit pouvoir couper d'urgence (stopAll).
  active: Set<{ stop: () => void }>;
}

function store(): AudioCtxStore {
  const w = globalThis as unknown as { __ttmCallsAudio?: AudioCtxStore };
  if (!w.__ttmCallsAudio) {
    w.__ttmCallsAudio = { active: new Set() };
  }
  return w.__ttmCallsAudio;
}

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const s = store();
  if (!s.ctx) {
    try {
      s.ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (s.ctx.state === 'suspended') {
    // best-effort, peut échouer si pas d'interaction user récente
    s.ctx.resume().catch(() => {});
  }
  return s.ctx;
}

function track(node: { stop: () => void }) {
  store().active.add(node);
}

function untrack(node: { stop: () => void }) {
  store().active.delete(node);
}

/**
 * Joue UN dring de téléphone rotary vintage. ~0.4s.
 * 2 cloches mécaniques alternées (440Hz + 480Hz) modulées par battement 25Hz.
 * Validé par Pascal sur /sound-test.
 */
export function playDring(durationSec = 0.4, startAt = 0): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getAudioCtx();
    if (!ctx) {
      resolve();
      return;
    }
    const now = ctx.currentTime + startAt;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 440;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 480;

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

    const node = {
      stop: () => {
        try {
          osc1.stop();
          osc2.stop();
          lfo.stop();
        } catch {
          /* ignore */
        }
        untrack(node);
      },
    };
    track(node);

    setTimeout(() => {
      untrack(node);
      resolve();
    }, (startAt + durationSec) * 1000);
  });
}

/**
 * Joue le cycle complet "DRING DRING" : 2 sonneries collées.
 * À appeler UNE FOIS par ring_beat reçu (= 1 cycle = 1 beat).
 */
export async function playDringDringCycle(): Promise<void> {
  await playDring(0.4, 0);
  await playDring(0.4, 0.2);
}

/**
 * Démarre une boucle locale de sonnerie (utilisé côté APPELÉ pour son propre
 * son d'alerte, indépendamment du ring_beat). Retourne une fonction stop.
 *
 * Côté APPELANT, on n'utilise PAS startRingingLoop : on déclenche playDring
 * uniquement à la réception d'un ring_beat (= tonalité honnête).
 */
export function startRingingLoop(): () => void {
  let stopped = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const ctx = getAudioCtx();
  if (!ctx) return () => {};

  // Premier cycle immédiat puis répétition toutes les 3s.
  void playDringDringCycle();
  intervalId = setInterval(() => {
    if (stopped) return;
    void playDringDringCycle();
  }, 3000);

  return () => {
    stopped = true;
    if (intervalId) clearInterval(intervalId);
  };
}

/**
 * Signal "occupé" : 2 tons (480Hz + 620Hz) alternés 0.5s on / 0.5s off, en
 * boucle infinie. Retourne stop. Joué côté APPELANT quand :
 *   - pas de ring_beat depuis > 2000ms (appelé hors ligne / app éteinte)
 *   - reception de 'call:busy' (appelé a refusé / occupé)
 */
export function startBusyLoop(): () => void {
  const ctx = getAudioCtx();
  if (!ctx) return () => {};
  let stopped = false;
  let nextScheduleAt = ctx.currentTime;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const scheduleChunk = () => {
    if (stopped || !ctx) return;
    // Programme 4 cycles à l'avance pour éviter les trous si onglet en arrière-plan.
    const cycles = 4;
    let t = Math.max(nextScheduleAt, ctx.currentTime);
    for (let i = 0; i < cycles; i++) {
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 480;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 620;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.02);
      g.gain.linearRampToValueAtTime(0.32, t + 0.45);
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
    nextScheduleAt = t;
    // Re-programme avant la fin pour éviter trous.
    timerId = setTimeout(scheduleChunk, cycles * 1000 - 200);
  };
  scheduleChunk();

  const node = {
    stop: () => {
      stopped = true;
      if (timerId) clearTimeout(timerId);
      untrack(node);
    },
  };
  track(node);
  return node.stop;
}

/** Bip final descendant (raccrochage), 0.4s. */
export function playHangupBeep(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
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

/**
 * Safety net : coupe tous les sons actifs (au unmount du screen ou en cas
 * d'erreur). N'efface PAS l'AudioContext lui-même (réutilisable).
 */
export function stopAll(): void {
  const s = store();
  for (const node of s.active) {
    try {
      node.stop();
    } catch {
      /* ignore */
    }
  }
  s.active.clear();
}
