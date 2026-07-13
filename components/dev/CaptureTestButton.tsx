'use client';
/**
 * CaptureTestButton — bouton flottant DEV+ADMIN (Pascal 2026-07-13) pour tester la récolte karaoké.
 * Tape → capture native de l'écran (PixelCopy) → OCR ML Kit → affiche l'image + le texte lu.
 * But : prouver sur le S23 que la caption YouTube est capturée (pas noir) et lisible par l'OCR,
 * AVANT de monter le pipeline de récolte complet. Visible uniquement en mode dev (admin).
 */
import { useState } from 'react';
import { useDevMode, useIsAdmin } from '@/components/dev/CardDevButton';
import { captureScreen, recognizeText, hasNativeCapture } from '@/lib/compute/ondevice-ocr';

export default function CaptureTestButton() {
  const dev = useDevMode();
  const admin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState('');
  const [ocr, setOcr] = useState('');
  const [log, setLog] = useState('');

  if (!dev || !admin) return null;

  const run = async () => {
    setBusy(true); setShot(''); setOcr(''); setLog(`captureNative=${hasNativeCapture()}`);
    try {
      const cap = await captureScreen();
      if (!cap.ok) { setLog((l) => l + ` · capture KO: ${cap.error || '?'}`); setBusy(false); return; }
      setShot(cap.dataUrl);
      setLog((l) => l + ` · OK ${Math.round(cap.dataUrl.length / 1024)}Ko`);
      const r = await recognizeText(cap.dataUrl);
      setOcr(r.text || '(vide)');
      setLog((l) => l + ` · OCR via=${r.via}`);
    } catch (e) { setLog((l) => l + ' EX ' + String(e)); }
    setBusy(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void run(); }}
        aria-label="Test capture"
        style={{ position: 'fixed', right: 12, bottom: 150, zIndex: 2147483000, width: 44, height: 44, borderRadius: 999, border: '2px solid rgba(255,255,255,.5)', background: 'rgba(255,127,17,.92)', color: '#fff', fontSize: 20, boxShadow: '0 6px 18px rgba(0,0,0,.4)' }}
      >
        📸
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483001, background: 'rgba(0,0,0,.9)', overflowY: 'auto', padding: 14, color: '#fff', fontFamily: 'Inter, sans-serif' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 15 }}>Test capture karaoké</strong>
            <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" onClick={(e) => { e.stopPropagation(); void run(); }} disabled={busy} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: busy ? '#555' : '#ff7f11', color: '#fff', fontWeight: 700 }}>{busy ? 'Capture…' : 'Recapturer'}</button>
          </div>
          <pre style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', whiteSpace: 'pre-wrap' }}>{log}</pre>
          {shot && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, margin: '8px 0 4px' }}>Image (la caption doit être lisible, pas noir) :</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shot} alt="capture" style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,.2)' }} />
            </>
          )}
          {ocr && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 4px' }}>Texte lu par l'OCR :</div>
              <pre style={{ fontSize: 13, background: 'rgba(255,255,255,.07)', padding: 10, borderRadius: 8, whiteSpace: 'pre-wrap' }}>{ocr}</pre>
            </>
          )}
        </div>
      )}
    </>
  );
}
