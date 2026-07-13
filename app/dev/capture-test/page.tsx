'use client';
/**
 * /dev/capture-test — TEST DE FAISABILITÉ de la récolte karaoké (Pascal 2026-07-13).
 * Vidéo YouTube (CC natif forcé) + bouton : capture native (PixelCopy) → affiche l'image + OCR.
 * But : vérifier sur le S23 que la capture attrape la CAPTION (pas un écran NOIR = surface sécurisée)
 * et que l'OCR ML Kit lit bien le texte. Si oui → on monte le pipeline de récolte complet.
 */
import { useState } from 'react';
import { captureScreen, recognizeText, hasNativeCapture, hasNativeVision } from '@/lib/compute/ondevice-ocr';

const VIDEO = 'i5LUMfJjW3Q'; // Lil Durk - My Beyoncé (a une piste de paroles synchro)

export default function CaptureTestPage() {
  const [shot, setShot] = useState<string>('');
  const [ocr, setOcr] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>('');

  const run = async () => {
    setBusy(true); setOcr(''); setShot('');
    setLog(`captureNative=${hasNativeCapture()} · visionNative=${hasNativeVision()}`);
    try {
      const cap = await captureScreen();
      if (!cap.ok) { setLog((l) => l + ` · capture KO: ${cap.error || '?'}`); setBusy(false); return; }
      setShot(cap.dataUrl);
      setLog((l) => l + ` · capture OK (${Math.round(cap.dataUrl.length / 1024)} Ko)`);
      const r = await recognizeText(cap.dataUrl);
      setOcr(r.text || '(vide)');
      setLog((l) => l + ` · OCR via=${r.via}`);
    } catch (e) { setLog((l) => l + ' · EX ' + String(e)); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#0d0b16', color: '#fff', padding: '14px', fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 10px' }}>Test capture karaoké</h1>

      {/* Lecteur avec sous-titres natifs forcés (cc_load_policy=1) */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
        <iframe
          src={`https://www.youtube.com/embed/${VIDEO}?cc_load_policy=1&cc_lang_pref=en&modestbranding=1&rel=0&playsinline=1`}
          title="test"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>

      <p style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', margin: '10px 0' }}>
        1) Lance la vidéo, attends que la caption « ♪ … ♪ » s'affiche. 2) Tape Capturer.
      </p>

      <button
        type="button"
        onClick={run}
        disabled={busy}
        style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: busy ? '#555' : 'var(--t2m-primary, #ff7f11)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
      >
        {busy ? 'Capture…' : 'Capturer + OCR'}
      </button>

      {log && <pre style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', whiteSpace: 'pre-wrap', margin: '10px 0' }}>{log}</pre>}

      {shot && (
        <div style={{ margin: '10px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.7)', marginBottom: 6 }}>Image capturée (la caption doit être lisible, pas noir) :</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="capture" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)' }} />
        </div>
      )}

      {ocr && (
        <div style={{ margin: '10px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.7)', marginBottom: 6 }}>Texte lu par l'OCR :</div>
          <pre style={{ fontSize: 13, background: 'rgba(255,255,255,.06)', padding: 10, borderRadius: 10, whiteSpace: 'pre-wrap' }}>{ocr}</pre>
        </div>
      )}
    </div>
  );
}
