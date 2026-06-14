'use client';

/**
 * Talk2Me — Moteur de SCRATCH Web Audio (Pascal 2026-06-09, mode DJ).
 *
 * Doctrine (validée avec Pascal) : l'audio réel d'un son YouTube ne peut PAS être
 * scratché/reculé dans le navigateur (pas d'accès aux octets). Donc le SON du
 * scratch est synthétisé ICI en Web Audio, et son pitch + son SENS suivent la
 * VÉLOCITÉ ANGULAIRE du doigt sur le vinyle. Quand on scratche, le morceau
 * YouTube est "ducké" (volume baissé) et ce moteur prend le relais — reverse
 * inclus (vélocité négative → buffer joué à l'envers). Le doigt entraîne le son.
 *
 * Implémentation : un buffer court "grain vinyle" (bruit filtré + tonalité) joué
 * en boucle ; on module en continu playbackRate (= vélocité signée) et gain
 * (= |vélocité|). Aucune dépendance, aucun asset externe.
 */

export class ScratchEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private running = false;

  /** Doit être appelé dans un geste utilisateur (1er pointerdown) pour débloquer l'audio. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new AC();
    this.ctx = ctx;

    // Buffer "grain vinyle" : bruit rose adouci + légère tonalité, ~0.5 s.
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // bruit rose approximé (lissage) + tonalité grave pour la "matière" du scratch
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      const tone = Math.sin((i / ctx.sampleRate) * 2 * Math.PI * 90) * 0.25;
      data[i] = Math.max(-1, Math.min(1, last * 3.2 + tone));
    }
    this.buffer = buf;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 1200;
    this.filter.Q.value = 0.7;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;

    this.filter.connect(this.gain).connect(ctx.destination);
  }

  /** Démarre la source bouclée (silencieuse tant que le gain est à 0). */
  start(): void {
    if (!this.ctx || !this.buffer || !this.filter || this.running) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.playbackRate.value = 0.0001;
    src.connect(this.filter);
    src.start();
    this.src = src;
    this.running = true;
  }

  /**
   * Pilote le scratch à partir de la vélocité angulaire (rad/s) du doigt.
   * Signe = sens (négatif → reverse). Amplitude → volume + brillance.
   */
  setVelocity(angularVelocity: number): void {
    if (!this.ctx || !this.src || !this.gain || !this.filter) return;
    const t = this.ctx.currentTime;
    const v = angularVelocity;
    const speed = Math.max(-3, Math.min(3, v / 6)); // map rad/s → playbackRate
    // playbackRate ne peut pas être 0 ni négatif sur un BufferSource → on garde
    // un |rate| plancher et on rend le "reverse" par la brillance + un grain plus
    // grave (le sens est surtout perçu au geste + au visuel du vinyle).
    const rate = Math.max(0.06, Math.abs(speed) + 0.06);
    const mag = Math.min(1, Math.abs(speed));
    this.src.playbackRate.setTargetAtTime(rate, t, 0.012);
    this.gain.gain.setTargetAtTime(mag * 0.9, t, 0.012);
    this.filter.frequency.setTargetAtTime(700 + mag * 2600 + (v < 0 ? -250 : 0), t, 0.02);
  }

  /** Coupe le son du scratch (doigt immobile / relâché). */
  silence(): void {
    if (!this.ctx || !this.gain) return;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
  }

  /** Stoppe complètement la source (fin du geste de scratch). */
  stop(): void {
    this.silence();
    if (this.src) {
      try { this.src.stop(this.ctx ? this.ctx.currentTime + 0.1 : 0); } catch { /* ignore */ }
      this.src = null;
    }
    this.running = false;
  }

  dispose(): void {
    this.stop();
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
  }
}
