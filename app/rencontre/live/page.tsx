'use client';

/**
 * /rencontre/live — PASSER EN LIVE (Pascal 2026-07-15). L'hôte fixe son prix d'entrée,
 * puis diffuse via InlineCamera (mode live interne = startBroadcast, canal live:{myUserId}).
 * Les spectateurs voient le badge LIVE dans le feed → paient pour entrer (/live/[host]).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import InlineCamera from '@/components/cards/editors/InlineCamera';
import { Heart } from '@/lib/icons';

export default function GoLivePage() {
  const router = useRouter();
  const [price, setPrice] = useState('2000');
  const [started, setStarted] = useState(false);

  const priceCents = Math.max(0, Math.round(Number((price || '').replace(/[^0-9]/g, '')) || 0));

  if (!started) {
    return (
      <div className="min-h-[100svh] bg-[var(--t2m-paper)] flex flex-col items-center justify-center px-8 text-center gap-4">
        <Heart className="w-9 h-9 text-[#EC4899]" />
        <h1 className="text-[20px] font-bold text-[var(--t2m-ink)]" style={{ fontFamily: "'Outfit',sans-serif" }}>Passer en live</h1>
        <p className="text-[13px] text-[var(--t2m-ink-2)]">Fixe le prix d’entrée dans ta salle. Les gens paient pour entrer, puis peuvent t’envoyer des pourboires.</p>
        <div className="w-full max-w-[260px]">
          <label className="text-[12px] text-[var(--t2m-ink-3)] block mb-1.5 text-left">Prix d’entrée (Ar) — 0 = gratuit</label>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric"
            className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[15px] text-[var(--t2m-ink)] outline-none text-center focus:border-[#EC4899]/50" />
        </div>
        <button type="button" onClick={() => setStarted(true)}
          className="mt-1 px-8 py-3 rounded-full bg-[#EC4899] text-white text-[15px] font-semibold active:scale-95">
          Ouvrir la caméra
        </button>
        <button type="button" onClick={() => router.push('/rencontre')} className="text-[var(--t2m-ink-3)] text-[13px]">Annuler</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black">
      <InlineCamera
        initialMode="video"
        liveEntryPriceCents={priceCents}
        onCapture={() => { /* en live on ne capture pas de fichier */ }}
        onCancel={() => router.push('/rencontre')}
        guides={
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full bg-black/55 text-white text-[12px] font-semibold pointer-events-none">
            Tape le bouton LIVE pour diffuser · Entrée {priceCents ? `${priceCents.toLocaleString('fr-FR')} Ar` : 'gratuite'}
          </div>
        }
      />
    </div>
  );
}
