'use client';
/**
 * CardReader — UN LECTEUR (Card OS, Pascal 2026-06-30). Prend un profil + une liste de
 * SuperCards et les rend via le MOTEUR UNIQUE (SuperCardView) dans la VARIANTE du profil
 * (format connu : social/product/eat/listing/result/square/pin/bubble) + son layout.
 * Zéro logique de card ici : tout le rendu vient de SuperCardView.
 */
import type { SuperCard } from '@/lib/cards/supercard';
import { readerAccepts, type ReaderDef } from '@/lib/cards/readers';
import SuperCardView from '@/components/cards/SuperCardView';

const WIDTH: Record<string, string> = {
  social: 'w-full max-w-[440px]',
  bubble: 'w-full max-w-[380px]',
  listing: 'w-full max-w-[480px]',
  result: 'w-full max-w-[620px]',
  pin: 'w-full max-w-[460px]',
  product: 'w-[165px]',
  eat: 'w-[280px]',
  square: 'w-[150px]',
  card: 'w-full max-w-[440px]',
};

export default function CardReader({ profile, cards }: { profile: ReaderDef; cards: SuperCard[] }) {
  // Le lecteur ne LIT que les cards qui ont ses attributs (ex. Eat ignore les produits/robes).
  const readable = cards.filter((c) => readerAccepts(profile, c));
  if (readable.length === 0) {
    return <p className="text-[12.5px] text-white/40 py-6 text-center">Aucune card lisible par ce lecteur ({profile.name}).</p>;
  }

  const container =
    profile.layout === 'list' ? 'flex flex-col items-center gap-3'
    : profile.layout === 'row' ? 'flex gap-3 overflow-x-auto pb-2'
    : 'flex flex-wrap gap-3 justify-center sm:justify-start';

  const itemClass = (WIDTH[profile.variant] || WIDTH.card) + (profile.layout === 'row' ? ' shrink-0' : '');

  return (
    <div className={container}>
      {readable.map((c) => (
        <div key={c.id} className={itemClass}>
          <SuperCardView card={c} level={profile.level} actions={profile.actions} variant={profile.variant} reveal={profile.reveal} />
        </div>
      ))}
    </div>
  );
}
