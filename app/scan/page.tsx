'use client';
/**
 * /scan — SCANNER QR intégré dans l'app (Pascal 2026-07-22).
 *
 * Le geste multicaméra, tel que décidé : cam 1 (dans le tournage) affiche un QR ; cam 2 ouvre CE
 * scanner, vise le QR, et est RAMENÉE DIRECTEMENT dans le live (aucun scanner externe, aucun code,
 * aucun lien à copier). Décodage 100% local (jsQR) → marche dans le WebView natif Android ET iPhone.
 * Sécurité : on ne suit QUE les URL de NOTRE origine (jamais une redirection arbitraire d'un QR piégé).
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/system/BackButton';
import jsQR from 'jsqr';

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState('Vise le QR de la caméra principale');
  const doneRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Ne suit QUE notre origine : /tournage/... (le live) ou toute page interne. Jamais un lien externe.
    const go = (text: string) => {
      if (doneRef.current) return;
      let path = '';
      try {
        const u = new URL(text, window.location.origin);
        if (u.origin !== window.location.origin) { setHint('QR non reconnu (lien externe ignoré)'); return; }
        path = u.pathname + u.search;
      } catch { setHint('QR non reconnu'); return; }
      if (!path.startsWith('/')) return;
      doneRef.current = true;
      setHint('✅ Caméra reconnue — on rejoint le live…');
      if (stream) stream.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(raf);
      router.replace(path);
    };

    const tick = () => {
      const v = videoRef.current;
      if (v && v.readyState === v.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = v.videoWidth; canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        try {
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) { go(code.data); return; }
        } catch { /* frame pas prête */ }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        raf = requestAnimationFrame(tick);
      } catch {
        setErr("Impossible d'ouvrir la caméra. Autorise l'accès caméra puis réessaie.");
      }
    })();

    return () => { cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [router]);

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {/* Viseur */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <div style={{ width: 'min(70vw, 260px)', aspectRatio: '1', border: '3px solid #FF7F11', borderRadius: 18, boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)' }} />
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackButton size={20} className="w-10 h-10 rounded-full bg-black/50 text-white grid place-items-center" />
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, textShadow: '0 1px 3px #000' }}>Rejoindre un tournage</div>
      </div>
      <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', padding: '0 20px' }}>
        <span style={{ display: 'inline-block', color: '#fff', fontSize: 14, fontWeight: 700, background: 'rgba(0,0,0,0.55)', padding: '8px 14px', borderRadius: 20 }}>{err || hint}</span>
      </div>
    </main>
  );
}
