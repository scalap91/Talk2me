'use client';

/**
 * /rencontre/live — PASSER EN LIVE (Pascal 2026-07-15). L'hôte fixe son prix d'entrée,
 * puis diffuse via InlineCamera (mode live interne = startBroadcast, canal live:{myUserId}).
 * Les spectateurs voient le badge LIVE dans le feed → paient pour entrer (/live/[host]).
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import InlineCamera from '@/components/cards/editors/InlineCamera';
import LiveModeration from '@/components/live/LiveModeration';
import LiveEarnings from '@/components/live/LiveEarnings';
import CreateRencontreSheet from '@/components/create/CreateRencontreSheet';
import { Heart, Loader2 } from '@/lib/icons';

export default function GoLivePage() {
  const router = useRouter();
  // Le prix d'entrée est MÉMORISÉ d'une session à l'autre (plus besoin de le retaper). Pascal 2026-07-15.
  const [price, setPrice] = useState(() => {
    if (typeof window === 'undefined') return '2000';
    return window.localStorage.getItem('t2m:live_entry_price') ?? '2000';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('t2m:live_entry_price', price);
  }, [price]);
  const [started, setStarted] = useState(false);
  // Le live Rencontre est ANCRÉ au salon (pseudo, vidéos à vendre, VIP). Sans profil → pas de live.
  const [checking, setChecking] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [roomKey, setRoomKey] = useState<string | null>(null); // clé de MON annonce = identité du live anonyme
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => {
    fetch('/api/rencontre/mine', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { setHasProfile(!!d?.id); setRoomKey(d?.roomKey || null); }).catch(() => {}).finally(() => setChecking(false));
  }, []);

  const priceCents = Math.max(0, Math.round(Number((price || '').replace(/[^0-9]/g, '')) || 0));

  if (checking) {
    return <div className="min-h-[100svh] bg-[var(--t2m-paper)] grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-[#EC4899]" /></div>;
  }
  if (!hasProfile) {
    return (
      <div className="min-h-[100svh] bg-[var(--t2m-paper)] flex flex-col items-center justify-center px-8 text-center gap-4">
        <Heart className="w-9 h-9 text-[#EC4899]" />
        <h1 className="text-[20px] font-bold text-[var(--t2m-ink)]" style={{ fontFamily: "'Outfit',sans-serif" }}>Crée ton profil d’abord</h1>
        <p className="text-[13px] text-[var(--t2m-ink-2)]">Le live est rattaché à ton salon : ton pseudo, tes vidéos à vendre et tes VIP viennent de ton profil. Pas de profil, pas de live.</p>
        <button type="button" onClick={() => setCreateOpen(true)} className="mt-1 px-8 py-3 rounded-full bg-[#EC4899] text-white text-[15px] font-semibold active:scale-95">Créer mon profil</button>
        <button type="button" onClick={() => router.push('/rencontre')} className="text-[var(--t2m-ink-3)] text-[13px]">Annuler</button>
        <CreateRencontreSheet open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-[100svh] bg-[var(--t2m-paper)] flex flex-col items-center justify-center px-8 text-center gap-4">
        <span className="px-2 py-0.5 rounded-md bg-pink-600 text-white text-[11px] font-mono font-bold tracking-widest">LIVE-20</span>
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
        liveOnly
        liveRoomKey={roomKey}
        liveEntryPriceCents={priceCents}
        onCapture={() => { /* en live on ne capture pas de fichier */ }}
        onCancel={() => {
          // Sortie garantie : on coupe le direct côté serveur PUIS on quitte (fire-and-forget). Pascal 2026-07-15.
          try { fetch('/api/live/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'end' }) }).catch(() => {}); } catch { /* */ }
          router.replace('/rencontre');
        }}
        guides={
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1 pointer-events-none">
            <span className="px-2 py-0.5 rounded-md bg-pink-600 text-white text-[11px] font-mono font-bold tracking-widest border border-white">LIVE-CAM-25</span>
            <span className="px-3 py-1.5 rounded-full bg-black/55 text-white text-[12px] font-semibold">Tape le bouton LIVE pour diffuser · Entrée {priceCents ? `${priceCents.toLocaleString('fr-FR')} Ar` : 'gratuite'}</span>
          </div>
        }
      />
      {/* Compteur « en caisse » (hôte) sur l'écran du live, avec bouton masquer. */}
      <LiveEarnings />
      {/* Modération (hôte) : historique de connexion + éjecter/bannir. Apparaît dès qu'un spectateur entre. */}
      {roomKey && <LiveModeration roomKey={roomKey} />}
    </div>
  );
}
