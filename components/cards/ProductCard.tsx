'use client';

/**
 * ProductCard — carousel d'objets conversationnels produit.
 *
 * Doctrine `talktome-card-vivante` (Pascal 2026-06-03) :
 *  - C'est un OBJET CONVERSATIONNEL de découverte, pas un objet commercial.
 *  - Pas de "Acheter maintenant", pas de "Ajouter au panier", pas de checkout.
 *  - 2 boutons sobres : "Voir" (ouvre source) + "Partager".
 *
 * Doctrine `talktome-embeds-only` + `content-grounding` :
 *  - Tous les champs viennent de la source (AliExpress). JAMAIS inventés.
 *  - Pas d'image dispo → fallback gradient + emoji 🛍️.
 *
 * Doctrine `retranscrire-api` :
 *  - `price_label` est affiché TEL QUEL (ex "€ 114,21"). Pas de recalcul.
 *
 * Présentation (Pascal 2026-06-07) : UN produit bien CENTRÉ pleine largeur, on
 * swipe à gauche pour les suivants, avec des DOTS de pagination. Plus de ruban
 * où les cards dépassent ("ça fait moche").
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus } from '@/lib/icons';
import type { ProductCardData } from '@/lib/chat-types';
import { useCardCreationStore } from '@/lib/card-creation-store';
import { useRouter } from 'next/navigation';

interface ProductCardProps {
  products: ProductCardData[];
  /** Talk2Me #425 — affiche "+ Créer une card" (chemin via Léa, chat only). */
  allowCreate?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ products, allowCreate = false }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // TRANSFERT DE COMPÉTENCES (Pascal 2026-07-14) : « Créer ma card » depuis un produit ouvre LE
  // composer unique /creer/texte (produit pré-attaché via le store), au lieu de la couche dormante.
  const stageProduct = useCardCreationStore((s) => s.stageProduct);
  const router = useRouter();

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setActive((cur) => {
      const next = Math.max(0, Math.min((products?.length ?? 1) - 1, i));
      return next === cur ? cur : next;
    });
  }, [products?.length]);

  const goTo = (i: number) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  if (!products || products.length === 0) return null;

  return (
    <div className="w-full">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        role="list"
        aria-label="Produits suggérés"
      >
        {products.map((product, idx) => (
          <div
            key={product.id}
            className="w-full shrink-0 snap-center px-1.5"
            role="listitem"
          >
            <ProductCardItem
              product={product}
              idx={idx}
              allowCreate={allowCreate}
              onCreate={() => { stageProduct(product); router.push('/creer/texte'); }}
            />
          </div>
        ))}
      </div>

      {/* Dots de pagination */}
      {products.length > 1 && (
        <div className="flex justify-center items-center gap-1.5 mt-2.5">
          {products.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Produit ${i + 1} sur ${products.length}`}
              className={
                'h-1.5 rounded-full transition-all duration-200 ' +
                (i === active ? 'w-5 bg-red-300/90' : 'w-1.5 bg-white/25 hover:bg-white/40')
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ProductCardItem: React.FC<{
  product: ProductCardData;
  idx: number;
  allowCreate?: boolean;
  onCreate?: () => void;
}> = ({ product, idx, allowCreate, onCreate }) => {
  const [imgError, setImgError] = useState(false);
  const showPhoto = !!product.image_url && !imgError;

  const handleShare = async () => {
    const shareData = {
      title: product.title,
      text: product.title,
      url: product.source_url,
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(product.source_url);
      }
    } catch {
      // user cancelled or share failed — silencieux (doctrine no-excuses)
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(idx, 1) * 0.05 }}
      className="w-full bg-white/[0.04] backdrop-blur-md border border-white/8 rounded-2xl overflow-hidden"
    >
      {/* Photo cover */}
      <div className="relative w-full aspect-square overflow-hidden bg-white/[0.06]">
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url!}
            alt={product.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-red-500/10 to-red-700/10 flex items-center justify-center">
            <span className="text-6xl opacity-40 font-emoji">🛍️</span>
          </div>
        )}
        {product.price_label && (
          <span className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full text-[13px] font-semibold text-white bg-black/55 backdrop-blur-sm">
            {product.price_label}
          </span>
        )}
      </div>

      {/* Corps */}
      <div className="p-3.5">
        <h3
          className="text-[14px] font-medium text-white leading-snug line-clamp-2 min-h-[2.4em]"
          title={product.title}
        >
          {product.title}
        </h3>

        <p className="text-[11px] text-white/45 mt-1.5">
          {product.source}
          {product.condition ? ` · ${product.condition}` : ''}
        </p>

        {/* Boutons : sobres, pas de "Acheter". */}
        <div className="flex gap-2 mt-3">
          <a
            href={product.source_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Voir ${product.title} sur ${product.source}`}
            className="flex-1 text-center py-2 rounded-full text-[12px] font-medium bg-red-500/15 text-red-200 border border-red-400/20 hover:bg-red-500/25 transition"
          >
            <span className="font-emoji">🔎</span> Voir
          </a>
          <button
            type="button"
            onClick={handleShare}
            aria-label={`Partager ${product.title}`}
            className="flex-1 text-center py-2 rounded-full text-[12px] font-medium bg-white/[0.06] text-white/80 border border-white/8 hover:bg-white/[0.10] transition"
          >
            <span className="font-emoji">↗</span> Partager
          </button>
        </div>

        {/* Talk2Me #425 — chemin "via Léa" : transformer ce produit en card
            (Hub + Shop). Visible uniquement dans le chat. */}
        {allowCreate && (
          <button
            type="button"
            onClick={onCreate}
            aria-label={`Créer une card avec ${product.title}`}
            className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 rounded-full text-[12px] font-semibold bg-red-500/20 text-red-100 border border-red-400/40 hover:bg-red-500/30 active:scale-[0.98] transition"
          >
            <Plus className="w-4 h-4" /> Créer une card
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default ProductCard;
