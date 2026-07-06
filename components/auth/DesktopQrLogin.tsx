'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Déverrouillage WEB par QR (Pascal 2026-06-26), façon WhatsApp Web.
 * Affiché sur DESKTOP à côté du formulaire téléphone. Le PC génère un QR, le
 * mobile DÉJÀ connecté le scanne → /link → approuve → le PC entre dans l'app.
 * Sur mobile ce bloc est masqué (on s'y connecte directement par SMS).
 */
import { useEffect, useRef, useState } from 'react';
import { Smartphone, RefreshCw, Loader2 } from '@/lib/icons';
import T2MWordmark from '@/components/brand/T2MWordmark';

export default function DesktopQrLogin() {
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'waiting' | 'expired' | 'approved'>('loading');
  const tokenRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const start = async () => {
    stopPoll();
    setState('loading'); setQr(null);
    try {
      const d = await fetch('/api/auth/qr/start', { method: 'POST' }).then((r) => r.json());
      if (!d?.ok) { setState('expired'); return; }
      tokenRef.current = d.token; setQr(d.qr); setState('waiting');
      const exp = typeof d.expires_at === 'number' ? d.expires_at : Date.now() + 120000;
      pollRef.current = setInterval(async () => {
        if (Date.now() > exp) { stopPoll(); setState('expired'); return; }
        try {
          const s = await fetch(`/api/auth/qr/status?t=${encodeURIComponent(tokenRef.current || '')}`, { cache: 'no-store' }).then((r) => r.json());
          if (s?.status === 'approved') { stopPoll(); setState('approved'); window.location.replace('/home'); }
          else if (s?.status === 'expired' || s?.status === 'unknown') { stopPoll(); setState('expired'); }
        } catch { /* on retente au tick suivant */ }
      }, 2000);
    } catch { setState('expired'); }
  };

  useEffect(() => { start(); return stopPoll; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 text-center shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      {/* Logo Talk2Me EN TOUTES LETTRES, encadré rouge (sans l'oreille — bannie), cœur battant. */}
      <T2MWordmark beat size={32} />
      <h2 className="mt-3 text-[15px] font-semibold text-white/95 inline-flex items-center gap-2 justify-center"><Smartphone className="w-4.5 h-4.5 text-white/70" /> Connexion par QR code</h2>
      <p className="text-[12.5px] text-white/55 mt-1.5 leading-relaxed">Scanne ce code avec l’appareil photo de ton téléphone.</p>

      <div className="mt-4 mx-auto w-[240px] h-[240px] rounded-2xl bg-white grid place-items-center overflow-hidden">
        {state === 'loading' && <Loader2 className="w-7 h-7 text-black/40 animate-spin" />}
        {state === 'waiting' && qr && <img src={qr} alt="QR de connexion" className="w-full h-full object-contain" />}
        {state === 'approved' && <Loader2 className="w-7 h-7 text-black/40 animate-spin" />}
        {state === 'expired' && (
          <button onClick={start} className="flex flex-col items-center gap-2 text-black/60 text-[13px] font-medium">
            <RefreshCw className="w-7 h-7" /> QR expiré — régénérer
          </button>
        )}
      </div>

      <p className="text-[11px] text-white/40 mt-3">
        {state === 'waiting' ? 'En attente du scan…' : state === 'approved' ? 'Connecté ! Ouverture…' : state === 'expired' ? 'QR expiré.' : ''}
      </p>
    </div>
  );
}
