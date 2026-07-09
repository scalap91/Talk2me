'use client';

/**
 * BoutiqueVitrineReader — LECTEUR DE CARTE boutique (Pascal 2026-07-09).
 * « Voir la boutique » (mode photo du feed) → aperçu plein écran qui a EXACTEMENT le
 * MÊME rendu que l'aperçu du COMPOSER de boutique (BoutiqueComposer, section preview) :
 *   cover 16/9 · nom 22px gras · description 13px · articles au format 3/4 (titre + prix dessous).
 *
 * Doctrine Card OS : ce lecteur lit UNIQUEMENT la section `items` (les articles) de la
 * SuperCard de la boutique. Chaque article reste ACHETABLE : au clic, on ouvre la MÊME
 * modale produit que SuperCardView (variant boutique) → <SuperCardView variant="product">.
 *
 * Ce composant rend JUSTE le contenu (pas d'overlay, pas de header/✕) : l'overlay et le
 * bouton ✕ sont fournis par AlignedPostCard pour éviter tout double affichage.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { SuperCard } from '@/lib/cards/supercard';
import SuperCardView from '@/components/cards/SuperCardView';

const fmtPrice = (p?: { amount?: number; currency?: string }): string =>
  p?.amount ? `${p.amount.toLocaleString('fr')} ${p.currency || ''}`.trim() : '';

export default function BoutiqueVitrineReader({ card }: { card: SuperCard; onClose: () => void }) {
  // Article « ouvert » → même flux d'achat que SuperCardView (modale produit + Achetez Maintenant).
  const [openProduct, setOpenProduct] = useState<SuperCard | null>(null);

  const cover = card.images?.[0];
  const name = card.title || 'Boutique';
  // Description : retire le marqueur [VITRINE:…] s'il traîne dans le body.
  const description = (card.text?.body || '').replace(/\s*\[VITRINE:[^\]]+\]/g, '').trim();
  const items = card.items || [];

  // Regroupe les articles par RAYON (specs.rayon, porté à la publication) → une rangée
  // horizontale scrollable par rayon, comme le composer. Articles sans rayon → « Boutique ».
  // Ordre des rayons = 1re apparition (stable), on ne réinvente aucune catégorie.
  const rayons: { name: string; products: SuperCard[] }[] = [];
  const byName = new Map<string, { name: string; products: SuperCard[] }>();
  for (const it of items) {
    const key = (it.specs?.rayon || '').trim() || 'Boutique';
    let grp = byName.get(key);
    if (!grp) { grp = { name: key, products: [] }; byName.set(key, grp); rayons.push(grp); }
    grp.products.push(it);
  }

  return (
    <div>
      {/* Cover 16/9 — comme le composer */}
      {cover && (
        <div className="w-full aspect-[16/9] overflow-hidden rounded-xl" style={{ background: '#15161c' }}>
          <img src={cover} alt={name} className="w-full h-full object-cover" draggable={false} />
        </div>
      )}

      {/* Nom + description — comme le composer (22px gras · 13px) */}
      <div style={{ padding: '16px 4px 4px' }}>
        <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 22, color: '#fff', lineHeight: 1.2 }}>{name}</div>
        {description && (
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'var(--t2m-ink-2)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{description}</div>
        )}
      </div>

      {/* Articles PAR RAYON — exactement comme le composer : nom du rayon (15px semibold) puis
          une rangée horizontale scrollable de cards 150px format 3/4 (image · titre · prix). */}
      <div style={{ padding: 'calc(4px) 0 calc(env(safe-area-inset-bottom) + 8px)' }}>
        {rayons.map((rayon, ri) => (
          <div key={rayon.name + ri} style={{ marginBottom: 16 }}>
            {/* Nom du rayon (masqué si rayon fourre-tout unique « Boutique ») */}
            {!(rayons.length === 1 && rayon.name === 'Boutique') && (
              <div style={{ padding: '8px 4px 8px', fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 600, color: '#fff' }}>{rayon.name}</div>
            )}
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ padding: '0 4px' }}>
              {rayon.products.map((it, i) => {
                const img = it.images?.[0];
                const price = fmtPrice(it.price);
                return (
                  <button
                    key={it.id || i}
                    type="button"
                    onClick={() => setOpenProduct(it)}
                    className="text-left active:scale-95 transition"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: 150, flexShrink: 0 }}
                  >
                    <div className="relative aspect-[3/4] rounded-lg overflow-hidden mb-2" style={{ background: '#15161c' }}>
                      {img && <img src={img} alt={it.title || ''} className="w-full h-full object-cover" draggable={false} />}
                    </div>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: '#fff', lineHeight: 1.3 }} className="truncate">{it.title || ''}</div>
                    {price && <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'var(--t2m-ink-2)', marginTop: 2 }}>{price}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* « Entrer dans » un article : détail + Achetez Maintenant — même modale que SuperCardView. */}
      {openProduct && typeof document !== 'undefined' && createPortal(
        <div onClick={() => setOpenProduct(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483001, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, maxHeight: '88dvh', overflowY: 'auto', background: '#0b0c10', borderRadius: '18px 18px 0 0', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOpenProduct(null)} style={{ background: 'transparent', border: 'none', fontSize: 22, color: '#8b93a7', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <SuperCardView card={openProduct} theme="dark" variant="detail" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
