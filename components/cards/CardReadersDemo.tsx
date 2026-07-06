'use client';
/**
 * CardReadersDemo — preuve « 1 card, N lecteurs » (Card OS, Pascal 2026-06-30).
 * Même pile de SuperCards, lue par chaque lecteur (Feed/Eat/Boutique/…) via son profil.
 */
import { useState } from 'react';
import { parseCard, type SuperCard } from '@/lib/cards/supercard';
import { listReaders } from '@/lib/cards/readers';
import CardReader from '@/components/cards/CardReader';

export default function CardReadersDemo({ samples, cards: cardsProp, initial }: {
  samples?: { name: string; text: string }[]; cards?: SuperCard[]; initial?: string;
}) {
  const cards = cardsProp ?? ((samples || [])
    .map((s) => parseCard(s.text))
    .filter((r) => r.ok && r.card)
    .map((r) => r.card!) as SuperCard[]);

  const readers = listReaders();
  const [sel, setSel] = useState(initial && readers.some((r) => r.reader === initial) ? initial : readers[0].reader);
  const profile = readers.find((r) => r.reader === sel)!;

  return (
    <div className="space-y-4">
      {/* Onglets lecteurs */}
      <div className="flex flex-wrap gap-2">
        {readers.map((r) => (
          <button
            key={r.reader}
            onClick={() => setSel(r.reader)}
            className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] transition ${
              r.reader === sel
                ? 'bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-100'
                : 'bg-white/[0.04] border-white/12 text-white/70 hover:bg-white/[0.08]'
            }`}
          >
            {r.emoji} {r.name}
          </button>
        ))}
      </div>

      {/* Profil du lecteur courant */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/60">
        <b className="text-white/80">{profile.emoji} {profile.name}</b> — {profile.desc}
        <div className="mt-1 text-white/40">🎯 format : <b className="text-white/60">{profile.ref}</b> · variante <code>{profile.variant}</code> · actions [{(profile.actions || []).join(', ') || '—'}]</div>
      </div>

      {/* Le MÊME jeu de cards, lu par CE lecteur */}
      <div className="rounded-2xl border border-white/10 bg-[#0c0e14] p-4">
        {cards.length === 0 ? (
          <p className="text-white/40 text-[13px]">Aucune card.</p>
        ) : (
          <CardReader profile={profile} cards={cards} />
        )}
      </div>
      <p className="text-[11px] text-white/30">
        {cards.length} cards · le même objet, lu différemment selon le lecteur. Aucun composant de card dédié — tout via <code>SuperCardView</code>.
      </p>
    </div>
  );
}
