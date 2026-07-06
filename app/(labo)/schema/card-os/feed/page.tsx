/**
 * /schema/card-os/feed — LE FEED SUR LA VRAIE BASE (Card OS, Pascal 2026-06-30).
 * Lit de VRAIES cards de la base (produits Boutique) via la façade fromStoreProduct →
 * SuperCard → moteur unique + lecteur Feed. NE TOUCHE PAS au Feed vivant (/home).
 * Preuve : le lecteur Card OS tourne sur des données réelles. Page interne (dev-only).
 */
import Link from 'next/link';
import { getStoreProductsFlat } from '@/lib/db';
import { fromStoreProduct } from '@/lib/cards/adapt';
import CardReadersDemo from '@/components/cards/CardReadersDemo';

export const dynamic = 'force-dynamic';

export default function CardOsFeedPage() {
  let cards = [] as ReturnType<typeof fromStoreProduct>[];
  let err: string | null = null;
  try {
    const products = getStoreProductsFlat(40);
    cards = products.map(fromStoreProduct);
  } catch (e) {
    err = e instanceof Error ? e.message : 'erreur_base';
  }

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema/card-os" className="text-white/55 hover:text-white/90 text-[13px]">← Card OS</Link>
          <h1 className="text-[15px] font-medium">Feed · vraie base</h1>
          <Link href="/schema/card-os/lecteurs" className="text-fuchsia-300/90 hover:text-fuchsia-200 text-[13px]">Démo →</Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-5">
        <p className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4 text-[13px] text-white/80 leading-relaxed">
          <b>Données RÉELLES.</b> Ces cards viennent de la <b>base de la Boutique</b> (pas de fichiers démo), passées
          par la façade <code>fromStoreProduct → SuperCard</code> puis rendues par le <b>moteur unique</b> et les
          <b> lecteurs</b>. Change de lecteur en haut : les mêmes vraies cards prennent chaque format.
          Le <b>Feed vivant (/home) n’est pas touché.</b>
        </p>
        {err ? (
          <p className="text-red-300 text-[13px]">Erreur base : {err}</p>
        ) : cards.length === 0 ? (
          <p className="text-white/50 text-[13px]">Aucun produit dans la base Boutique sur cet environnement. (Le mécanisme marche ; il faut juste des cards en base.)</p>
        ) : (
          <CardReadersDemo cards={cards} initial="feed" />
        )}
        <p className="text-[11px] text-white/30">Source : <code>getStoreProductsFlat()</code> (vraie base) → <code>lib/cards/adapt.ts</code> → <code>SuperCardView</code>.</p>
      </div>
    </main>
  );
}
