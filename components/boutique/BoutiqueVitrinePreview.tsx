'use client';

/**
 * BoutiqueVitrinePreview — APERÇU PARTAGÉ de la vitrine boutique (Pascal 2026-07-09).
 *
 * UN SEUL markup pour DEUX usages → rendu PIXEL-IDENTIQUE garanti :
 *   - COMPOSER (editable=true)  : inputs, upload cover/produit, add/remove, wholesale, enrich, drag.
 *   - LECTEUR  (editable=false) : les <input> deviennent du TEXTE statique (mêmes classes Tailwind),
 *     boutons d'édition masqués, clic produit → onProductClick(product).
 *
 * Extrait TEL QUEL de la « Scrollable preview » de BoutiqueComposer (cover 16/9 + nom 22px +
 * description 13px + rayons + produits 150px format 3/4). NE PAS diverger de ces classes :
 * elles SONT le contrat visuel commun composer ↔ lecteur.
 */

import { useRef } from 'react';

export interface VitrineProduct {
  id: string;
  image_url: string;
  title: string;
  price: string;
  sizes?: string;
  wholesale?: boolean;
  link?: string;
  original_url?: string;
}
export interface VitrineCategory {
  id: string;
  name: string;
  products: VitrineProduct[];
}
export interface CoverPosition { x: number; y: number }

export default function BoutiqueVitrinePreview(props: {
  coverUrl: string;
  coverPos?: CoverPosition;
  name: string;
  description: string;
  categories: VitrineCategory[];
  editable?: boolean;
  // Lecteur
  onProductClick?: (product: VitrineProduct) => void;
  // Composer — handlers d'édition (tous optionnels : requis seulement si editable)
  coverRef?: React.RefObject<HTMLDivElement | null>;
  onCoverPointerDown?: (e: React.PointerEvent) => void;
  onPickCover?: () => void;
  onClearCover?: () => void;
  onCoverFile?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNameChange?: (v: string) => void;
  onDescriptionChange?: (v: string) => void;
  onCategoryNameChange?: (catId: string, v: string) => void;
  onProductFile?: (file: File, catId: string, prodId: string) => void;
  onRemoveProduct?: (catId: string, prodId: string) => void;
  onProductFieldChange?: (catId: string, prodId: string, field: 'title' | 'price' | 'sizes' | 'link', v: string) => void;
  onToggleWholesale?: (catId: string, prodId: string) => void;
  onEnrich?: (arg: { catId: string; prodId: string; imageUrl: string; title: string; price: string }) => void;
  onAddProduct?: (catId: string) => void;
  onAddCategory?: () => void;
  onCleanAll?: () => void;
  cleaningAll?: { done: number; total: number } | null;
}) {
  const {
    coverUrl, coverPos = { x: 50, y: 50 }, name, description, categories,
    editable = false, onProductClick,
    coverRef, onCoverPointerDown, onPickCover, onClearCover, onCoverFile,
    onNameChange, onDescriptionChange, onCategoryNameChange, onProductFile,
    onRemoveProduct, onProductFieldChange, onToggleWholesale, onEnrich,
    onAddProduct, onAddCategory, onCleanAll, cleaningAll,
  } = props;

  const localFileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Cover */}
      <div className="relative w-full aspect-[16/9] overflow-hidden bg-[var(--t2m-wash)]">
        {coverUrl ? (
          <>
            <img
              src={coverUrl}
              alt="Cover"
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
              style={{ objectPosition: `${coverPos.x}% ${coverPos.y}%` }}
            />
            {editable && (
              <>
                <div
                  ref={coverRef}
                  className="absolute inset-0 cursor-grab active:cursor-grabbing"
                  onPointerDown={onCoverPointerDown}
                />
                <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  Glisse pour ajuster
                </div>
                <button
                  onClick={onClearCover}
                  className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded hover:bg-black/80"
                >
                  Changer
                </button>
              </>
            )}
          </>
        ) : editable ? (
          <button
            onClick={() => (onPickCover ? onPickCover() : localFileRef.current?.click())}
            className="absolute inset-0 flex items-center justify-center text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink-2)] transition-colors"
          >
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm">Photo de couverture (paysage)</span>
            </div>
          </button>
        ) : null}
        {editable && (
          <input
            ref={localFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onCoverFile}
          />
        )}
      </div>

      {/* Name & Description */}
      <div className="px-4 py-4 space-y-3">
        {editable ? (
          <input
            value={name}
            onChange={(e) => onNameChange?.(e.target.value)}
            placeholder="Nom de la boutique"
            className="w-full bg-transparent text-[22px] font-bold text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none"
          />
        ) : (
          <div className="w-full text-[22px] font-bold text-[var(--t2m-ink)]">{name}</div>
        )}
        {editable ? (
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange?.(e.target.value)}
            placeholder="Description courte"
            rows={2}
            className="w-full bg-transparent text-[13px] text-[var(--t2m-ink-2)] placeholder-[var(--t2m-ink-3)] outline-none resize-none"
          />
        ) : description ? (
          <div className="w-full text-[13px] text-[var(--t2m-ink-2)] whitespace-pre-wrap">{description}</div>
        ) : null}
      </div>

      {/* Categories */}
      {categories.map((cat) => (
        <div key={cat.id} className="mb-4">
          <div className="px-4 mt-4 mb-2">
            {editable ? (
              <input
                value={cat.name}
                onChange={(e) => onCategoryNameChange?.(cat.id, e.target.value)}
                placeholder="Nom du rayon"
                className="w-full bg-transparent text-[15px] font-semibold text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none"
              />
            ) : (
              <div className="w-full text-[15px] font-semibold text-[var(--t2m-ink)]">{cat.name}</div>
            )}
          </div>
          <div className="flex gap-3 px-4 overflow-x-auto pb-2">
            {cat.products.map((prod) => (
              <div
                key={prod.id}
                className={'w-[150px] flex-shrink-0' + (!editable ? ' cursor-pointer active:scale-95 transition' : '')}
                onClick={!editable ? () => onProductClick?.(prod) : undefined}
              >
                <div className="relative aspect-[3/4] bg-[var(--t2m-wash)] rounded-lg overflow-hidden mb-2">
                  {prod.image_url ? (
                    <img
                      src={prod.image_url}
                      alt={prod.title}
                      className="w-full h-full object-cover"
                    />
                  ) : editable ? (
                    <button
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) onProductFile?.(file, cat.id, prod.id);
                        };
                        input.click();
                      }}
                      className="w-full h-full flex items-center justify-center text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink-2)] transition-colors"
                    >
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  ) : null}
                  {editable && (
                    <>
                      <button
                        onClick={() => onRemoveProduct?.(cat.id, prod.id)}
                        className="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/80"
                      >
                        ×
                      </button>
                      {prod.image_url && (
                        <button
                          onClick={() => onEnrich?.({ catId: cat.id, prodId: prod.id, imageUrl: prod.image_url, title: prod.title, price: prod.price })}
                          className="absolute bottom-1 left-1 right-1 bg-red-600/90 text-white text-[10px] font-semibold py-1 rounded-md inline-flex items-center justify-center gap-1 hover:bg-red-600"
                        >
                          ✨ Nettoyer
                        </button>
                      )}
                    </>
                  )}
                </div>
                {editable ? (
                  <input
                    value={prod.title}
                    onChange={(e) => onProductFieldChange?.(cat.id, prod.id, 'title', e.target.value)}
                    placeholder="Titre"
                    className="w-full bg-transparent text-xs text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none mb-1"
                  />
                ) : (
                  <div className="w-full text-xs text-[var(--t2m-ink)] mb-1 truncate">{prod.title}</div>
                )}
                {editable ? (
                  <input
                    value={prod.price}
                    onChange={(e) => onProductFieldChange?.(cat.id, prod.id, 'price', e.target.value)}
                    placeholder="Prix"
                    className="w-full bg-transparent text-xs text-[var(--t2m-ink-2)] placeholder-[var(--t2m-ink-3)] outline-none mb-1"
                  />
                ) : prod.price ? (
                  <div className="w-full text-xs text-[var(--t2m-ink-2)] mb-1">{prod.price}</div>
                ) : null}
                {editable ? (
                  <input
                    value={prod.sizes || ''}
                    onChange={(e) => onProductFieldChange?.(cat.id, prod.id, 'sizes', e.target.value)}
                    placeholder="Tailles (S M L XL…)"
                    className="w-full bg-transparent text-xs text-[var(--t2m-ink-2)] placeholder-[var(--t2m-ink-3)] outline-none mb-1"
                  />
                ) : prod.sizes ? (
                  <div className="w-full text-xs text-[var(--t2m-ink-2)] mb-1">{prod.sizes}</div>
                ) : null}
                {editable && (
                  <>
                    <button
                      type="button"
                      onClick={() => onToggleWholesale?.(cat.id, prod.id)}
                      className={
                        'w-full text-[11px] font-semibold py-1 rounded-md mb-1 transition-colors ' +
                        (prod.wholesale
                          ? 'bg-amber-500/25 text-amber-200 border border-amber-400/40'
                          : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-3)] border border-[var(--t2m-line)] hover:text-[var(--t2m-ink-2)]')
                      }
                    >
                      {prod.wholesale ? '✓ Vente en gros' : 'Vente en gros ?'}
                    </button>
                    <input
                      value={prod.link || ''}
                      onChange={(e) => onProductFieldChange?.(cat.id, prod.id, 'link', e.target.value)}
                      placeholder="Lien (optionnel)"
                      className="w-full bg-transparent text-xs text-[var(--t2m-ink-3)] placeholder-[var(--t2m-ink-3)] outline-none"
                    />
                  </>
                )}
              </div>
            ))}
            {editable && (
              <button
                onClick={() => onAddProduct?.(cat.id)}
                className="w-[150px] aspect-[3/4] flex-shrink-0 border-2 border-dashed border-[var(--t2m-line)] rounded-lg flex items-center justify-center text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink-2)] hover:border-[var(--t2m-line)] transition-colors"
              >
                <div className="text-center">
                  <svg className="w-6 h-6 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs">Article</span>
                </div>
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add category button (composer uniquement) */}
      {editable && (
        <div className="px-4 pb-4">
          <button
            onClick={onAddCategory}
            className="w-full py-3 border-2 border-dashed border-[var(--t2m-line)] rounded-xl text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink-2)] hover:border-[var(--t2m-line)] transition-colors text-sm"
          >
            ＋ Ajouter un rayon (catégorie)
          </button>
          <button
            onClick={onCleanAll}
            disabled={!!cleaningAll}
            className="w-full mt-2 py-3 rounded-xl bg-red-600/90 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-600"
          >
            {cleaningAll ? `Nettoyage… ${cleaningAll.done}/${cleaningAll.total}` : '✨ Tout nettoyer les photos'}
          </button>
        </div>
      )}
    </div>
  );
}
