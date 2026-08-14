'use client';

/**
 * /mes-cards/[id] — Viewer plein écran des cards de l'utilisateur courant.
 *
 * Talk2Me #383 (Pascal 2026-06-05). Doctrine verbatim Pascal :
 *   « si je clic sur lapersu je doit voir la card selevtionner et non pas
 *     atterir sur le hub […] card previcedente par odre de liste de la page
 *     card »
 *
 * Différences clés avec /home :
 *   - Source : /api/cards/mine-viewer (SEULEMENT mes cards, pas le feed mixte)
 *   - Démarre snappé sur params.id (scrollIntoView au mount)
 *   - Header "Mes cards" + bouton Retour ← qui revient à /drafts
 *   - Pas de bouton "Aller au hub" / d'infinite scroll cross-user
 *
 * Réutilise PostCard / Image / Video / Texte CardDisplay en mode `fullScreen`.
 */

import { useCallback, useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from '@/lib/icons';
import BottomNav from '@/components/chat/BottomNav';
import AlignedPostCard from '@/components/feed/AlignedPostCard';
import type { FeedItem } from '@/components/feed/PostFeed';

interface AuthorView {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

interface PostItem {
  kind: 'post';
  id: string;
  createdAt: number;
  likes: number;
  views: number;
  author?: AuthorView | null;
  user_id?: string;
  card_kind?: 'post';
  liked_by_me?: boolean;
  is_owner?: boolean;
  messages: Array<{
    id: string;
    role: 'user' | 'agent';
    content: string;
    links?: string[];
    youtube?: import('@/lib/chat-types').YouTubeCardData | null;
    timestamp?: number;
    places?: import('@/lib/chat-types').PlaceCardData[] | null;
    recipe?: import('@/lib/chat-types').RecipeCardData | null;
    requires_geoloc?: boolean;
    intent_query?: string | null;
    intent_label_fr?: string | null;
    user_lat?: number | null;
    user_lng?: number | null;
  }>;
}

interface DirectBase {
  id: string;
  type: 'video' | 'image' | 'texte';
  media_url: string | null;
  caption: string | null;
  text: string | null;
  bg_variant: string | null;
  createdAt: number;
  created_at: number;
  likes: number;
  views: number;
  card_kind?: 'direct_card';
  liked_by_me?: boolean;
  is_owner?: boolean;
  share_count?: number;
  comment_count?: number;
  author?: AuthorView | null;
}
interface VideoItem extends DirectBase { kind: 'video_card' }
interface ImageItem extends DirectBase { kind: 'image_card' }
interface TexteItem extends DirectBase { kind: 'texte_card' }

type FeedItem = PostItem | VideoItem | ImageItem | TexteItem;

export default function MesCardsViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id: targetId } = use(params);

  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const didScrollRef = useRef(false);

  // Charge SES cards uniquement.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Talk2Me #427 — depuis le Shop (?cat=shop) : on ne scrolle QUE les cards
      // Shop (la pièce jointe détermine la catégorie, pas de mélange).
      const cat =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('cat')
          : null;
      const scopeQ = cat === 'shop' ? '&scope=shop' : '';
      const r = await fetch(`/api/cards/mine-viewer?limit=200${scopeQ}`, {
        cache: 'no-store',
      });
      if (r.status === 401) {
        router.replace('/signin');
        return;
      }
      if (!r.ok) throw new Error('http ' + r.status);
      const d = await r.json();
      if (Array.isArray(d?.items)) {
        setItems(d.items as FeedItem[]);
      }
    } catch (e) {
      console.error('[mes-cards] load error', e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // Scroll vers la card cible au mount (une seule fois après load).
  useEffect(() => {
    if (loading || didScrollRef.current) return;
    if (items.length === 0) return;
    const exists = items.some((it) => it.id === targetId);
    if (!exists) {
      setNotFound(true);
      didScrollRef.current = true;
      return;
    }
    // requestAnimationFrame pour laisser le DOM se monter
    requestAnimationFrame(() => {
      const el = document.getElementById(`mes-card-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
      didScrollRef.current = true;
    });
  }, [items, loading, targetId]);

  return (
    <div className="flex flex-col h-[100svh] w-full max-w-md mx-auto bg-background overflow-hidden">
      {/* Header dédié /mes-cards (pas le ChatHeader, pas de bouton "hub") */}
      <header
        className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/85 px-3 backdrop-blur-xl"
        data-testid="mes-cards-header"
      >
        <button
          type="button"
          onClick={() => router.push('/drafts#publiees')}
          aria-label="Retour à mes cards"
          data-testid="mes-cards-back"
          className="w-9 h-9 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] flex items-center justify-center hover:bg-[var(--t2m-line)] transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[15px] font-medium tracking-tight text-[var(--t2m-ink)]">
          Mes cards
        </h1>
        <span className="ml-auto text-[11px] text-[var(--t2m-ink-3)]">
          {items.length}
        </span>
      </header>

      <main
        ref={containerRef}
        data-testid="mes-cards-scroll"
        className="flex-1 min-h-0 overflow-y-scroll snap-y snap-mandatory overscroll-contain"
        style={{ scrollSnapStop: 'always' }}
      >
        {loading && (
          <div className="h-full flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Chargement…</p>
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="h-full flex items-center justify-center px-4 text-center">
            <p className="text-muted-foreground text-sm">
              Aucune card publiée pour l’instant.<br />
              Crée ta première card via le bouton + dans Mes cards.
            </p>
          </div>
        )}
        {!loading && notFound && items.length > 0 && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-[12px] px-4 py-2 text-center">
            Card introuvable — affichage de toutes tes cards.
          </div>
        )}
        {!loading &&
          items.map((item, idx) => (
            <section
              key={`${item.kind}-${item.id}`}
              id={`mes-card-${item.id}`}
              data-feed-index={idx}
              data-snap-card
              data-testid={`mes-card-${item.id}`}
              className="h-full w-full snap-start snap-always flex flex-col overflow-hidden"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              {/* LECTEUR UNIQUE (Pascal 2026-08-14) : on ouvre une publication EXACTEMENT comme dans le
                  feed (AlignedPostCard), plus les vieux *CardDisplay. Doctrine « l'aperçu = le feed ».
                  Les items viennent de mine-viewer (getFeedFromCards → dotcard) = même forme que /api/posts. */}
              <AlignedPostCard item={item as unknown as FeedItem} />
            </section>
          ))}
      </main>

      <BottomNav />
    </div>
  );
}
