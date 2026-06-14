'use client';

/**
 * Talk2Me — Deck audio à VRAI scratch (Pascal 2026-06-09).
 * Pour les sons QU'ON POSSÈDE (biblio CC0 same-origin + uploads user) : on décode
 * le fichier en AudioBuffer et on le lit via l'AudioWorklet `scratch-processor`,
 * dont le `rate` (signé) est piloté par le doigt → vrai scratch (reverse +
 * varispeed sur le son lui-même). Impossible sur YouTube (iframe scellée).
 */

let workletModulePromise: Promise<void> | null = null;

export class AudioDeck {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private baseRate = 1; // tempo courant (×pitch)
  private playing = false;
  private scratching = false;
  private vol = 1;
  /** Callback de position (0..1) pour l'UI (rotation du vinyle). */
  onPos: ((ratio: number) => void) | null = null;

  /** Doit être appelé dans un geste utilisateur (débloque l'AudioContext). */
  async init(): Promise<void> {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {}); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    if (!workletModulePromise) workletModulePromise = ctx.audioWorklet.addModule('/dj/scratch-processor.js');
    await workletModulePromise;
    this.node = new AudioWorkletNode(ctx, 'scratch-processor', { outputChannelCount: [2] });
    this.gain = ctx.createGain();
    this.gain.gain.value = this.vol;
    this.node.connect(this.gain).connect(ctx.destination);
    this.node.port.onmessage = (e) => {
      const d = e.data;
      if (d?.type === 'pos' && d.len > 0 && this.onPos) this.onPos((d.pos % d.len) / d.len);
    };
  }

  /** Charge et décode un fichier audio (URL same-origin / CORS). */
  async load(url: string): Promise<void> {
    await this.init();
    if (!this.ctx || !this.node) return;
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    const audio = await this.ctx.decodeAudioData(buf);
    const channels: ArrayBuffer[] = [];
    for (let c = 0; c < audio.numberOfChannels; c++) {
      // copie (les ArrayBuffers sont transférés au worklet)
      const f = new Float32Array(audio.length);
      f.set(audio.getChannelData(c));
      channels.push(f.buffer);
    }
    this.playing = false;
    this.setRate(0);
    this.node.port.postMessage({ type: 'load', channels, length: audio.length }, channels);
  }

  private setRate(r: number) {
    this.node?.port.postMessage({ type: 'rate', rate: r });
  }

  play() { this.playing = true; if (!this.scratching) this.setRate(this.baseRate); }
  pause() { this.playing = false; if (!this.scratching) this.setRate(0); }
  isPlaying() { return this.playing; }

  setTempo(rate: number) { this.baseRate = rate; if (this.playing && !this.scratching) this.setRate(rate); }
  setVolume(v: number) { this.vol = v; if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }

  // --- Scratch piloté au doigt ---
  scratchStart() { this.scratching = true; }
  /** vel = avance en samples/sample (signée). Reverse = négatif. */
  scratchMove(vel: number) { if (this.scratching) this.setRate(vel); }
  scratchEnd() { this.scratching = false; this.setRate(this.playing ? this.baseRate : 0); }

  dispose() {
    try { this.node?.disconnect(); } catch { /* ignore */ }
    try { this.gain?.disconnect(); } catch { /* ignore */ }
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
    this.node = null; this.gain = null;
  }
}
