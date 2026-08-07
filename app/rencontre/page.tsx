'use client';

/**
 * /rencontre — parcours dédié Rencontre (Pascal 2026-07-14). Feed des profils
 * (listing + « Écrire ») + bouton pour publier SON profil. Réutilise le lecteur
 * de listings ServiceEmploiFeed (kind='rencontre') → un seul rendu, doctrine .card.
 */
import { useState } from 'react';
import { Heart, Plus } from '@/lib/icons';
import BackButton from '@/components/system/BackButton';
import ServiceEmploiFeed from '@/components/feed/ServiceEmploiFeed';
import CreateRencontreSheet from '@/components/create/CreateRencontreSheet';

export default function RencontrePage() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="min-h-[100svh] bg-[var(--t2m-paper)]">
      <div className="sticky top-0 z-20 flex items-center gap-2 px-3 py-3 bg-[var(--t2m-paper)]/95 backdrop-blur border-b border-[var(--t2m-line)]" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
        <BackButton size={20} className="p-1 text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)] transition-colors" />
        <Heart className="w-5 h-5 text-[#EC4899]" />
        <h1 className="text-[17px] font-bold text-[var(--t2m-ink)]" style={{ fontFamily: "'Outfit',sans-serif" }}>Rencontre</h1>
        {/* pastille repérage test (temporaire) */}
        <span className="ml-1 px-1.5 py-0.5 rounded-md bg-pink-600 text-white text-[10px] font-mono font-bold tracking-widest pointer-events-none">RENC-10</span>
        {/* Le live part du SALON (le profil appelle la cam), plus de bouton Live standalone ici. Pascal 2026-07-15. */}
        <button type="button" onClick={() => setCreateOpen(true)} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-[13px] font-semibold active:scale-95" style={{ background: '#EC4899' }}>
          <Plus className="w-4 h-4" /> Profil
        </button>
      </div>

      <ServiceEmploiFeed kind="rencontre" />

      <CreateRencontreSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
