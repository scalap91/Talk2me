// Talk2Me — AudioWorklet de SCRATCH RÉEL (Pascal 2026-06-09).
// Lit un AudioBuffer décodé avec un playhead flottant + un "rate" signé :
//   rate = 1   → lecture normale
//   rate < 0   → REVERSE (vrai scratch arrière)
//   |rate| ≠ 1 → varispeed (pitch suit la vitesse du doigt)
//   rate = 0   → vinyle figé (silence)
// Le doigt pilote `rate` en temps réel depuis le thread principal (AudioDeck).
class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = [];   // Float32Array par canal
    this.numCh = 0;
    this.len = 0;         // longueur en samples
    this.playhead = 0;    // position flottante (samples)
    this.rate = 0;        // avance par sample de sortie (signée)
    this.loop = true;
    this._tick = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'load') {
        this.channels = d.channels.map((b) => new Float32Array(b));
        this.numCh = this.channels.length;
        this.len = d.length;
        this.playhead = 0;
      } else if (d.type === 'rate') {
        this.rate = d.rate;
      } else if (d.type === 'seek') {
        this.playhead = d.pos;
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    if (!this.len || this.numCh === 0 || Math.abs(this.rate) < 1e-4) {
      for (let c = 0; c < out.length; c++) out[c].fill(0);
      // Position remontée même à l'arrêt (pour l'UI), throttlée.
      if ((this._tick = (this._tick + 1) % 8) === 0) {
        this.port.postMessage({ type: 'pos', pos: this.playhead, len: this.len });
      }
      return true;
    }
    const len = this.len;
    for (let i = 0; i < n; i++) {
      let p = this.playhead;
      if (this.loop) {
        p = ((p % len) + len) % len;
      } else {
        if (p < 0) p = 0;
        if (p >= len) p = len - 1;
      }
      const i0 = Math.floor(p);
      const frac = p - i0;
      const i1 = (i0 + 1) % len;
      for (let c = 0; c < out.length; c++) {
        const ch = this.channels[c < this.numCh ? c : this.numCh - 1];
        out[c][i] = ch[i0] * (1 - frac) + ch[i1] * frac;
      }
      this.playhead = p + this.rate;
    }
    if ((this._tick = (this._tick + 1) % 8) === 0) {
      this.port.postMessage({ type: 'pos', pos: this.playhead, len: this.len });
    }
    return true;
  }
}

registerProcessor('scratch-processor', ScratchProcessor);
