'use client';

import { useEffect, useState } from 'react';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import UnifiedCardRenderer from '@/components/embed-hub/UnifiedCardRenderer';
import FallbackCard from '@/components/embed-hub/FallbackCard';

/**
 * Talk2Me #389 (Pascal 2026-06-05) — Universal Embed Hub Phase 4.
 *
 * EmbedRenderer délègue désormais au Universal Embed Hub :
 *   URL → /api/embed-hub → UnifiedCard → UnifiedCardRenderer.
 *
 * API publique identique (Phase 1-3) → MessageBubble, UnifiedBubble et
 * PostCard ne changent pas. Le variant `fullscreen-feed` est dispo pour
 * un rendu immersif (cf. /home PostCard fullScreen).
 *
 * Doctrine `feedback_talktome_no_excuses` : si le hub remonte une fallback
 * card, on rend FallbackCard ; on n'affiche jamais d'erreur brute.
 * Cache 5 min client (Map) pour éviter le refetch sur chaque re-render.
 */

interface EmbedRendererProps {
  url: string;
  variant?: 'inline-chat' | 'fullscreen-feed';
}

interface CacheEntry {
  card: UnifiedCard;
  expiresAt: number;
}

const cardCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function readCache(url: string): UnifiedCard | null {
  const c = cardCache.get(url);
  if (!c) return null;
  if (c.expiresAt <= Date.now()) {
    cardCache.delete(url);
    return null;
  }
  return c.card;
}

export default function EmbedRenderer({ url, variant = 'inline-chat' }: EmbedRendererProps) {
  const [card, setCard] = useState<UnifiedCard | null>(() => readCache(url));
  const [loading, setLoading] = useState(!card);

  useEffect(() => {
    const cached = readCache(url);
    if (cached) {
      setCard(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/embed-hub?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok && j?.card) {
          cardCache.set(url, { card: j.card, expiresAt: Date.now() + CACHE_TTL_MS });
          setCard(j.card);
        }
      })
      .catch(() => {
        /* doctrine no-excuses : silencieux */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading && !card) {
    return (
      <div
        className="rounded-2xl bg-white/[0.04] w-full max-w-full mx-auto"
        style={{ aspectRatio: '16 / 9' }}
      >
        <div className="flex items-center justify-center h-full text-white/40 text-xs">
          Chargement…
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <FallbackCard
        card={{
          source: 'fallback',
          source_label: '',
          type: 'article',
          title: url,
          external_url: url,
          actions: [{ kind: 'open', label: 'Ouvrir', url }],
        }}
      />
    );
  }

  return <UnifiedCardRenderer card={card} variant={variant} />;
}
