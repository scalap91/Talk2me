'use client';

import type { UnifiedCard } from '@/lib/embed-hub/types';

/**
 * Universal Embed Hub — fallback card visuelle.
 *
 * Affiché quand l'embed n'est pas dispo (X-Frame-Options refus, extractor
 * KO, source = 'fallback'). Toujours au moins un lien "Ouvrir".
 */

interface Props {
  card: UnifiedCard;
}

export default function FallbackCard({ card }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden w-full max-w-full mx-auto bg-white/[0.04] border border-white/8">
      {card.thumbnail_url && (
        <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.thumbnail_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      )}
      <div className="px-3 py-3 space-y-2">
        <span className="text-[10px] uppercase tracking-wider font-medium text-red-400">
          {card.source_label}
        </span>
        <h3 className="text-[14px] font-semibold text-white/95 leading-snug line-clamp-2">
          {card.title}
        </h3>
        {card.description && (
          <p className="text-[12px] text-white/65 line-clamp-2">
            {card.description}
          </p>
        )}
        <a
          href={card.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-[12px] px-3 py-1.5 rounded-full bg-red-500/15 text-red-300"
        >
          Ouvrir ↗
        </a>
      </div>
    </div>
  );
}
