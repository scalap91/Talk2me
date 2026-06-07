'use client';

/**
 * ProductCard — carousel d'objets conversationnels produit.
 *
 * Doctrine `talktome-card-vivante` (Pascal 2026-06-03) :
 *  - C'est un OBJET CONVERSATIONNEL de découverte, pas un objet commercial.
 *  - Pas de "Acheter maintenant", pas de "Ajouter au panier", pas de checkout.
 *  - Pas d'affiliation visible au MVP.
 *  - 2 boutons sobres : "Voir" (ouvre source dans nouvel onglet) + "Partager".
 *
 * Doctrine `talktome-embeds-only` + `content-grounding` :
 *  - Tous les champs viennent de la source (AliExpress). JAMAIS inventés.
 *  - Pas d'image dispo → fallback gradient + emoji 🛍️.
 *
 * Doctrine `retranscrire-api` :
 *  - `price_label` est affiché TEL QUEL (ex "€ 114,21"). Pas de recalcul.
 *
 * Layout : ruban horizontal scroll-snap identique au PlaceCard carousel.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { ProductCardData } from '@/lib/chat-types';

interface ProductCardProps {
  products: ProductCardData[];
}

const ProductCard: React.FC<ProductCardProps> = ({ products }) => {
  if (!products || products.length === 0) return null;

  return (
    <div className="w-full overflow-x-hidden">
      <div
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 px-1"
        role="list"
        aria-label="Produits suggérés"
      >
        {products.map((product, idx) => (
          <ProductCardItem key={product.id} product={product} idx={idx} />
        ))}
      </div>
    </div>
  );
};

const ProductCardItem: React.FC<{ product: ProductCardData; idx: number }> = ({
  product,
  idx,
}) => {
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
      transition={{ duration: 0.4, delay: idx * 0.06 }}
      className="min-w-[78%] max-w-[78%] shrink-0 snap-start bg-white/[0.04] backdrop-blur-md border border-white/8 rounded-2xl overflow-hidden"
    >
      {/* Photo cover */}
      <div className="relative w-full h-[160px] overflow-hidden bg-white/[0.06]">
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
      </div>

      {/* Corps */}
      <div className="p-3.5">
        <h3
          className="text-[14px] font-medium text-white leading-snug line-clamp-2"
          title={product.title}
        >
          {product.title}
        </h3>

        {product.price_label && (
          <p className="text-[15px] font-semibold text-red-300/90 mt-2">
            {product.price_label}
          </p>
        )}

        <p className="text-[11px] text-white/45 mt-1">
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
            className="flex-1 text-center py-2 rounded-full text-[11px] font-medium bg-red-500/15 text-red-200 border border-red-400/20 hover:bg-red-500/25 transition"
          >
            <span className="font-emoji">🔎</span> Voir
          </a>
          <button
            type="button"
            onClick={handleShare}
            aria-label={`Partager ${product.title}`}
            className="flex-1 text-center py-2 rounded-full text-[11px] font-medium bg-white/[0.06] text-white/80 border border-white/8 hover:bg-white/[0.10] transition"
          >
            <span className="font-emoji">↗</span> Partager
          </button>
        </div>

        {/* Footer source */}
        <p className="text-[10px] text-white/35 text-center mt-3">
          via {product.source}
        </p>
      </div>
    </motion.div>
  );
};

export default ProductCard;
