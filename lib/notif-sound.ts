'use client';

/**
 * Talk2Me — son de notification (Pascal 2026-06-10). Petit « ding » deux-notes
 * synthétisé (WebAudio, aucun fichier à charger) + vibration légère. Joué quand
 * une notif arrive (message d'un autre user, alerte). Respecte la politique
 * autoplay : ne joue qu'une fois que l'user a interagi avec l'app.
 */

let ctx: AudioContext | null = null;

export function playNotifSound(): void {
  try {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    // Deux notes montantes (la → mi), douces.
    for (const [freq, at] of [[880, 0], [1175, 0.11]] as [number, number][]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0 + at); o.stop(t0 + at + 0.2);
    }
    navigator.vibrate?.(60);
  } catch { /* audio bloqué → silencieux */ }
}
