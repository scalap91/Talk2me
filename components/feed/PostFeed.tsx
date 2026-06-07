'use client';

/**
 * Talk2Me #423 (Pascal 2026-06-07) — PostFeed : flux de posts/cards réutilisable.
 *
 * UN seul composant pour deux pages :
 *  - Hub (/home)    → scope="all"     : tous les posts publiés (flux global)
 *  - Cercle (/cercle) → scope="friends" : seulement les posts de mes amis
 *
 * Même rendu TikTok-style 100% viewport (snap-y), même infinite scroll, même
 * sync (publish event + focus). Le scope ne change QUE l'URL de fetch et le
 * message d'état vide. Pas de duplication → [[modular-no-scattered-patches]].
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import PostCard from '@/components/feed/PostCard';
import VideoCardDisplay from '@/components/feed/VideoCardDisplay';
import ImageCardDisplay from '@/components/feed/ImageCardDisplay';
import TexteCardDisplay from '@/components/feed/TexteCardDisplay';

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
  card_kind?: 'post';
  liked_by_me?: boolean;
  is_owner?: boolean;
  user_id?: string;
}

interface DirectCardItemBase {
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
  attached_audio_json?: string | null;
}
interface VideoCardItem extends DirectCardItemBase { kind: 'video_card' }
interface ImageCardItem extends DirectCardItemBase { kind: 'image_card' }
interface TexteCardItem extends DirectCardItemBase { kind: 'texte_card' }

type FeedItem = PostItem | VideoCardItem | ImageCardItem | TexteCardItem;

const PAGE_SIZE = 20;

interface PostFeedProps {
  /** "all" = flux global · "friends" = posts de mes amis. */
  scope?: 'all' | 'friends';
  /** "recent" = par date (défaut) · "popular" = par engagement. */
  sort?: 'recent' | 'popular';
  /** Message affiché quand le flux est vide. */
  emptyText?: React.ReactNode;
}

export default function PostFeed({ scope = 'all', sort = 'recent', emptyText }: PostFeedProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);

  const scopeQ =
    (scope === 'friends' ? '&scope=friends' : '') +
    (sort === 'popular' ? '&sort=popular' : '');

  const parsePage = useCallback((data: unknown): FeedItem[] => {
    if (data && typeof data === 'object') {
      const d = data as { items?: unknown; posts?: unknown };
      if (Array.isArray(d.items)) return d.items as FeedItem[];
      if (Array.isArray(d.posts)) {
        return (d.posts as Omit<PostItem, 'kind'>[]).map((p) => ({
          kind: 'post' as const,
          ...p,
        }));
      }
    }
    return [];
  }, []);

  const reloadFromStart = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/posts?limit=${PAGE_SIZE}&offset=0${scopeQ}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch feed');
      const data = await res.json();
      const page = parsePage(data);
      setItems(page);
      offsetRef.current = page.length;
      setHasMore(page.length >= PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching feed:', err);
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [parsePage, scopeQ]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/posts?limit=${PAGE_SIZE}&offset=${offsetRef.current}${scopeQ}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to load more');
      const data = await res.json();
      const page = parsePage(data);
      if (page.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => `${p.kind}-${p.id}`));
          const fresh = page.filter((p) => !seen.has(`${p.kind}-${p.id}`));
          return [...prev, ...fresh];
        });
        offsetRef.current += page.length;
        setHasMore(page.length >= PAGE_SIZE);
      }
    } catch (err) {
      console.error('Error loading more:', err);
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [hasMore, parsePage, scopeQ]);

  const fetchItems = reloadFromStart;

  useEffect(() => {
    reloadFromStart();
  }, [reloadFromStart]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e.isIntersecting) loadMore();
      },
      { root: null, rootMargin: '300px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, items.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#card-')) return;
    if (loading || loadingRef.current) return;
    const targetEl = document.getElementById(hash.slice(1));
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (hasMore && offsetRef.current < 200) {
      loadMore();
    }
  }, [items, loading, hasMore, loadMore]);

  useEffect(() => {
    const onPublished = () => fetchItems();
    window.addEventListener('talktome:card-published', onPublished);
    return () => window.removeEventListener('talktome:card-published', onPublished);
  }, [fetchItems]);

  useEffect(() => {
    const onFocus = () => fetchItems();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchItems]);

  return (
    <main
      className="flex-1 min-h-0 overflow-y-scroll snap-y snap-mandatory overscroll-contain"
      style={{ scrollSnapStop: 'always' }}
    >
      {loading && (
        <div className="h-full flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Chargement...</p>
        </div>
      )}
      {!loading && items.length === 0 && (
        <div className="h-full flex items-center justify-center px-4 text-center">
          <p className="text-muted-foreground text-sm">
            {emptyText ?? (
              <>
                Aucun post pour l&apos;instant.<br />
                Publie ta première conversation ou crée une card directe via le bouton +
              </>
            )}
          </p>
        </div>
      )}
      {!loading &&
        items.map((item, idx) => {
          const isOwner = !!item.is_owner;
          return (
            <section
              key={`${item.kind}-${item.id}`}
              id={`card-${item.id}`}
              data-feed-index={idx}
              data-snap-card
              className="h-full w-full snap-start snap-always flex flex-col overflow-hidden"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              {item.kind === 'post' && (
                <PostCard
                  post={item}
                  cardKind="post"
                  isOwner={isOwner}
                  initialLikedByMe={!!item.liked_by_me}
                  fullScreen
                />
              )}
              {item.kind === 'video_card' && (
                <VideoCardDisplay
                  card={item}
                  cardKind="direct_card"
                  isOwner={isOwner}
                  initialLikedByMe={!!item.liked_by_me}
                  fullScreen
                />
              )}
              {item.kind === 'image_card' && (
                <ImageCardDisplay
                  card={item}
                  cardKind="direct_card"
                  isOwner={isOwner}
                  initialLikedByMe={!!item.liked_by_me}
                  fullScreen
                />
              )}
              {item.kind === 'texte_card' && (
                <TexteCardDisplay
                  card={item}
                  cardKind="direct_card"
                  isOwner={isOwner}
                  initialLikedByMe={!!item.liked_by_me}
                  fullScreen
                />
              )}
            </section>
          );
        })}
      {!loading && items.length > 0 && hasMore && (
        <div
          ref={sentinelRef}
          data-testid="feed-sentinel"
          className="h-32 w-full flex items-center justify-center text-white/40 text-xs"
        >
          {loadingMore ? 'Chargement…' : ''}
        </div>
      )}
      {!loading && items.length > 0 && !hasMore && (
        <div className="h-24 w-full flex items-center justify-center text-white/30 text-xs">
          Fin du feed
        </div>
      )}
    </main>
  );
}
