'use client';

/**
 * LiveEarnings — compteur « en caisse » du liveur, affiché SUR l'écran du live (Pascal 2026-07-15).
 * Total gagné en temps réel (polling /api/me/earnings) + bouton 👁 pour MASQUER la somme
 * (si qqn regarde l'écran). QUI fait le gain = visible dans le fil de commentaires (achats/pourboires).
 * Chiffres réels (getEarnings). Overlay hôte, monté sur /rencontre/live.
 */
import { useEffect, useState } from 'react';
import { Coins, Eye } from '@/lib/icons';

export default function LiveEarnings() {
  const [total, setTotal] = useState<string | null>(null);
  const [show, setShow] = useState(true); // affiché par défaut (le liveur surveille), 👁 pour masquer

  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/me/earnings', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (alive && d?.ok) setTotal(d.totalLabel); }).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div
      className="absolute top-4 left-4 z-[41] inline-flex items-center gap-2 pl-2.5 pr-1.5 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 text-white"
      style={{ marginTop: 'env(safe-area-inset-top,0px)' }}
    >
      <Coins className="w-4 h-4 text-[#F5C542]" />
      <span className="text-[13px] font-bold tabular-nums">{show ? (total ?? '…') : '••••'}</span>
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Masquer' : 'Afficher'}
        className="w-7 h-7 grid place-items-center rounded-full bg-white/10 active:scale-95">
        <Eye className="w-4 h-4" />
      </button>
    </div>
  );
}
