'use client';

/**
 * BoutiqueVitrineReader — LECTEUR DE CARTE boutique (Pascal 2026-07-09).
 * « Voir la boutique » (mode photo du feed) → aperçu plein écran, rendu au PIXEL PRÈS comme
 * l'aperçu du COMPOSER (BoutiqueComposer, section « Scrollable preview ») : MÊMES classes,
 * mêmes tokens, même thème CLAIR. Version LECTURE SEULE (les inputs du composer → textes).
 *
 * Doctrine Card OS : lit UNIQUEMENT la section `items` de la SuperCard. Chaque article reste
 * ACHETABLE : au clic → fiche détail (SuperCardView variant="detail") avec action « Acheter ».
 * Rend juste le contenu (l'overlay + ✕ sont fournis par AlignedPostCard).
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { SuperCard } from '@/lib/cards/supercard';
import SuperCardView from '@/components/cards/SuperCardView';

const fmtPrice = (p?: { amount?: number; currency?: string }): string =>
  p?.amount ? `${p.amount.toLocaleString('fr')} ${p.currency || ''}`.trim() : '';

export default function BoutiqueVitrineReader({ card }: { card: SuperCard; onClose: () => void }) {
  const [openProduct, setOpenProduct] = useState<SuperCard | null>(null);

  const cover = card.images?.[0];
  const name = card.title || 'Boutique';
  const description = (card.text?.body || '').replace(/\s*\[VITRINE:[^\]]+\]/g, '').trim();
  const items = card.items || [];

  // Regroupe par RAYON (specs.rayon, porté à la publication) — comme les catégories du composer.
  const cats: { name: string; products: SuperCard[] }[] = [];
  const byName = new Map<string, { name: string; products: SuperCard[] }>();
  for (const it of items) {
    const key = (it.specs?.rayon || '').trim() || 'Boutique';
    let g = byName.get(key);
    if (!g) { g = { name: key, products: [] }; byName.set(key, g); cats.push(g); }
    g.products.push(it);
  }
  const soloDefault = cats.length === 1 && cats[0].name === 'Boutique';

  return (
    <div className="text-[var(--t2m-ink)]">
      {/* Cover — MÊME code que le composer */}
      <div className="relative w-full aspect-[16/9] overflow-hidden bg-[var(--t2m-wash)]">
        {cover && <img src={cover} alt={name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />}
      </div>

      {/* Name & Description — MÊME code que le composer */}
      <div className="px-4 py-4 space-y-3">
        <div className="w-full text-[22px] font-bold text-[var(--t2m-ink)]">{name}</div>
        {description && <div className="w-full text-[13px] text-[var(--t2m-ink-2)] whitespace-pre-wrap">{description}</div>}
      </div>

      {/* Categories — MÊME code que le composer (nom rayon + rangée horizontale de cards 150px 3/4) */}
      {cats.map((cat, ci) => (
        <div key={cat.name + ci} className="mb-4">
          {!soloDefault && (
            <div className="px-4 mt-4 mb-2">
              <span className="text-[15px] font-semibold text-[var(--t2m-ink)]">{cat.name}</span>
            </div>
          )}
          <div className="flex gap-3 px-4 overflow-x-auto pb-2">
            {cat.products.map((prod, i) => {
              const img = prod.images?.[0];
              const price = fmtPrice(prod.price);
              const sizes = typeof prod.specs?.tailles === 'string' ? prod.specs.tailles : '';
              return (
                <button
                  key={prod.id || i}
                  type="button"
                  onClick={() => setOpenProduct(prod)}
                  className="w-[150px] flex-shrink-0 text-left active:scale-95 transition"
                >
                  <div className="relative aspect-[3/4] bg-[var(--t2m-wash)] rounded-lg overflow-hidden mb-2">
                    {img && <img src={img} alt={prod.title} className="w-full h-full object-cover" draggable={false} />}
                  </div>
                  <div className="w-full text-xs text-[var(--t2m-ink)] mb-1 truncate">{prod.title || ''}</div>
                  {price && <div className="w-full text-xs text-[var(--t2m-ink-2)] mb-1">{price}</div>}
                  {sizes && <div className="w-full text-xs text-[var(--t2m-ink-3)]">{sizes}</div>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

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
