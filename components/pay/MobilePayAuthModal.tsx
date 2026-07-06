'use client';

/**
 * Talk2Me — Step-up paiement DESKTOP (Pascal 2026-06-26). Quand un achat est lancé
 * depuis un ordinateur (session web), on AFFICHE ce modal AVANT la page de paiement :
 * « Valide le paiement sur ton téléphone ». On poll /api/pay-auth/status ; dès que
 * le mobile approuve → onApproved(authId) (le desktop rejoue l'achat avec l'id).
 */
import { useEffect, useRef } from 'react';
import { Smartphone, Loader2, X } from '@/lib/icons';
import T2MWordmark from '@/components/brand/T2MWordmark';

export default function MobilePayAuthModal({ authId, onApproved, onClose }: { authId: string; onApproved: (authId: string) => void; onClose: () => void }) {
  const done = useRef(false);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive || done.current) return;
      try {
        const s = await fetch(`/api/pay-auth/status?id=${encodeURIComponent(authId)}`, { cache: 'no-store' }).then((r) => r.json());
        if (s?.status === 'approved') { done.current = true; onApproved(authId); return; }
        if (s?.status === 'denied' || s?.status === 'expired' || s?.status === 'unknown') { done.current = true; onClose(); return; }
      } catch { /* on retente */ }
      if (alive) setTimeout(tick, 1800);
    };
    tick();
    return () => { alive = false; };
  }, [authId, onApproved, onClose]);

  return (
    <div className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#101015] p-6 text-center">
        <div className="mb-4"><T2MWordmark beat size={64} /></div>
        <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-400/25 grid place-items-center mx-auto mb-3"><Smartphone className="w-6 h-6 text-red-300" /></div>
        <h2 className="text-white font-semibold text-[17px]">Valide sur ton téléphone</h2>
        <p className="text-white/55 text-[13px] mt-2 leading-relaxed">
          Pour ta sécurité, tout paiement depuis un ordinateur doit être confirmé sur ton mobile Talk2Me. Ouvre l’appli sur ton téléphone et appuie sur <b className="text-white/80">Autoriser le paiement</b>.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 text-white/50 text-[12.5px]"><Loader2 className="w-4 h-4 animate-spin" /> En attente de ta validation…</div>
        <button onClick={onClose} className="mt-5 w-full h-11 rounded-full bg-white/10 text-white/85 text-[14px] font-medium inline-flex items-center justify-center gap-2">
          <X className="w-4 h-4" /> Annuler
        </button>
      </div>
    </div>
  );
}
