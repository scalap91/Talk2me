'use client';

/**
 * BoutiqueVitrineReader — LECTEUR DE CARTE boutique (Pascal 2026-07-09).
 * « Voir la boutique » (mode photo du feed) → aperçu plein écran rendu par le MÊME composant
 * que l'aperçu du COMPOSER (<BoutiqueVitrinePreview>) en mode LECTURE SEULE (editable=false).
 * Même code = rendu PIXEL-IDENTIQUE garanti (produits 150px, format 3/4, etc.).
 *
 * Doctrine Card OS : lit UNIQUEMENT la section `items` de la SuperCard. On MAPPE ces items vers
 * la forme attendue par le composant partagé (categories groupées par rayon). Chaque article
 * reste ACHETABLE : au clic → on retrouve l'item d'origine par id → fiche détail
 * (SuperCardView variant="detail") avec action « Acheter ».
 * Rend juste le contenu (l'overlay + ✕ sont fournis par AlignedPostCard).
 */

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SuperCard } from '@/lib/cards/supercard';
import SuperCardView from '@/components/cards/SuperCardView';
import BoutiqueVitrinePreview, { type VitrineCategory, type VitrineProduct } from '@/components/boutique/BoutiqueVitrinePreview';

const fmtPrice = (p?: { amount?: number; currency?: string }): string =>
  p?.amount ? `${p.amount.toLocaleString('fr')} ${p.currency || ''}`.trim() : '';

export default function BoutiqueVitrineReader({ card }: { card: SuperCard; onClose: () => void }) {
  const [openProduct, setOpenProduct] = useState<SuperCard | null>(null);

  const coverUrl = card.images?.[0] || '';
  const name = card.title || 'Boutique';
  const description = (card.text?.body || '').replace(/\s*\[VITRINE:[^\]]+\]/g, '').trim();

  // Card OS : lit UNIQUEMENT card.items. On les groupe par rayon (specs.rayon, défaut « Boutique »)
  // et on les mappe vers la forme VitrineProduct/VitrineCategory du composant partagé.
  const { categories, byId } = useMemo(() => {
    const items = card.items || [];
    const cats: VitrineCategory[] = [];
    const byName = new Map<string, VitrineCategory>();
    const byId = new Map<string, SuperCard>();
    for (const it of items) {
      const id = it.id || `${cats.length}-${Math.random().toString(36).slice(2)}`;
      byId.set(id, it);
      const key = (it.specs?.rayon || '').trim() || 'Boutique';
      let g = byName.get(key);
      if (!g) { g = { id: 'rayon-' + key, name: key, products: [] }; byName.set(key, g); cats.push(g); }
      const prod: VitrineProduct = {
        id,
        title: it.title || '',
        price: fmtPrice(it.price),
        image_url: it.images?.[0] || '',
        sizes: typeof it.specs?.tailles === 'string' ? it.specs.tailles : '',
      };
      g.products.push(prod);
    }
    // Un rayon fourre-tout unique « Boutique » → on masque le titre (nom vide) comme le composer
    // sans rayon nommé.
    if (cats.length === 1 && cats[0].name === 'Boutique') cats[0] = { ...cats[0], name: '' };
    return { categories: cats, byId };
  }, [card]);

  const onProductClick = (product: VitrineProduct) => {
    const orig = byId.get(product.id);
    if (orig) setOpenProduct(orig);
  };

  return (
    <div className="flex flex-col text-[var(--t2m-ink)]">
      <BoutiqueVitrinePreview
        editable={false}
        coverUrl={coverUrl}
        name={name}
        description={description}
        categories={categories}
        onProductClick={onProductClick}
      />

      {/* Fiche produit + Acheter — même modale que SuperCardView. */}
      {openProduct && typeof document !== 'undefined' && createPortal(
        <div onClick={() => setOpenProduct(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483001, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, maxHeight: '88dvh', overflowY: 'auto', background: 'var(--t2m-card-bg, #fff)', borderRadius: '18px 18px 0 0', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOpenProduct(null)} className="text-[var(--t2m-ink-3)]" style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <SuperCardView card={openProduct} theme="light" variant="detail" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
