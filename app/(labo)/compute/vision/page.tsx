'use client';
/**
 * /compute/vision — Vision ON-DEVICE (Pascal 2026-07-04).
 * L'appareil COMPREND une image en LOCAL (OCR Tesseract.js, WASM) — l'image ne quitte
 * JAMAIS le téléphone. Première brique concrète du compute mesh : au lieu d'envoyer la
 * figure d'un PDF à un serveur/une clé payante, le tel de l'user (ou d'un pair) la lit
 * lui-même. Marche sans WebGPU (S23 FE ✓). Voir [[project_talk2me_compute_mesh]].
 */
import { useState, useCallback, useRef } from 'react';

export default function ComputeVision() {
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [step, setStep] = useState('');
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [ms, setMs] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (file: File) => {
    setErr(''); setText(''); setMs(null); setBusy(true); setProg(0);
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const t0 = performance.now();
    try {
      const { createWorker } = await import('tesseract.js');
      setStep('Chargement du moteur OCR (une fois)…');
      const worker = await createWorker('fra+eng', 1, {
        logger: (m: { status?: string; progress?: number }) => {
          if (m.status) setStep(m.status === 'recognizing text' ? 'Lecture de l’image…' : m.status);
          if (typeof m.progress === 'number') setProg(Math.round(m.progress * 100));
        },
      });
      setStep('Lecture de l’image…');
      const { data } = await worker.recognize(file);
      await worker.terminate();
      setText((data.text || '').trim());
      setMs(Math.round(performance.now() - t0));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Échec OCR (moteur non chargé ?).');
    } finally { setBusy(false); }
  }, []);

  return (
    <div style={{ minHeight: '100dvh', background: '#0b0b0f', color: '#fff', padding: 20, fontFamily: "'Inter',sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>👁️ Vision on-device</h1>
      <p style={{ fontSize: 13, color: '#8b93a7', marginTop: 4 }}>Ton appareil lit le texte d’une image <b>en local</b> — l’image ne quitte jamais ton téléphone.</p>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); }} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        style={{ marginTop: 16, width: '100%', padding: '16px', borderRadius: 16, border: '2px dashed #3a3a55', background: 'rgba(255,255,255,.03)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        {busy ? 'Analyse en cours…' : '📷 Choisir une image (figure, tableau, capture…)'}
      </button>

      {busy && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: '#8b93a7' }}>{step}</div>
          <div style={{ marginTop: 6, height: 8, borderRadius: 999, background: '#22222e', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(3, prog)}%`, background: 'linear-gradient(90deg,#8B5CF6,#22d3ee)', transition: 'width .3s' }} />
          </div>
        </div>
      )}

      {imgUrl && <img src={imgUrl} alt="" style={{ marginTop: 16, maxWidth: '100%', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)' }} />}

      {err && <div style={{ marginTop: 14, padding: 12, background: '#3a1620', color: '#ffb3b3', borderRadius: 12 }}>{err}</div>}

      {text && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>
            ✅ COMPRIS SUR TON APPAREIL {ms != null && `· ${(ms / 1000).toFixed(1)} s`} · {text.length} caractères
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 12, color: '#e6e8ee' }}>{text}</pre>
        </div>
      )}
    </div>
  );
}
