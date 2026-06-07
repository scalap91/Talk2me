'use client';

/**
 * Talk2Me #430 — CardAttachments : habille une card du feed avec ses pièces
 * jointes (disque SON bas-gauche + aperçu PRODUIT bas-droite). Partagé par
 * VideoCardDisplay ET ImageCardDisplay → une card est habillée pareil quel que
 * soit son type (avant, seul VideoCardDisplay les montrait → cards photo "nues").
 */

import MusicVinylOverlay from '@/components/cards/MusicVinylOverlay';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import type { ProductCardData } from '@/lib/chat-types';

interface Props {
  cardId: string;
  ownerId?: string | null;
  attachedAudioJson?: string | null;
  attachedProductJson?: string | null;
  /** disque animé si le média joue (vidéo). Image → false. */
  isPlaying?: boolean;
}

export default function CardAttachments({
  ownerId,
  attachedAudioJson,
  attachedProductJson,
  isPlaying = false,
}: Props) {
  let music: UnifiedCard | null = null;
  if (attachedAudioJson) {
    try {
      music = JSON.parse(attachedAudioJson) as UnifiedCard;
    } catch {
      music = null;
    }
  }

  let product: ProductCardData | null = null;
  if (attachedProductJson) {
    try {
      product = JSON.parse(attachedProductJson) as ProductCardData;
    } catch {
      product = null;
    }
  }

  const supplierUrl = (() => {
    if (!product?.source_url) return product?.source_url;
    if (!ownerId) return product.source_url;
    try {
      const u = new URL(product.source_url);
      u.searchParams.set('t2m_ref', ownerId); // crédite l'owner depuis SON post
      return u.toString();
    } catch {
      return product.source_url;
    }
  })();

  return (
    <>
      {music && music.title && <MusicVinylOverlay music={music} isVideoPlaying={isPlaying} />}

      {product && product.title && (
        <a
          href={supplierUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          aria-label={`Voir ${product.title} sur ${product.source}`}
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-24 right-3 z-20 w-[120px] rounded-2xl overflow-hidden bg-black/55 backdrop-blur border border-white/15 active:scale-[0.97] transition"
        >
          <div className="relative w-full aspect-square bg-white/10">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="font-emoji text-2xl">🛍️</span>
              </div>
            )}
            {product.price_label && (
              <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold text-white bg-black/65">
                {product.price_label}
              </span>
            )}
          </div>
          <div className="px-2 py-1.5">
            <div className="text-[11px] text-white/95 truncate">{product.title}</div>
            <div className="text-[10px] text-violet-200/90 font-medium">🛒 Voir sur {product.source} ›</div>
          </div>
        </a>
      )}
    </>
  );
}
