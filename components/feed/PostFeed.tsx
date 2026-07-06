'use client';

/**
 * Talk2Me #423 (Pascal 2026-06-07) — PostFeed : flux de posts/cards réutilisable.
 *
 * UN seul composant pour deux pages :
 *  - Hub (/home)    → scope="all"     : tous les posts publiés (flux global)
 *  - Cercle (/cercle) → scope="friends" : seulement les posts de mes amis
 *
 * Même rendu TikTok-style 100% viewport (snap-y), même infinite scroll, même
 * sync (publish event + focus). Le scope ne CHANGE QUE l'URL de fetch et le
 * message d'état vide. Pas de duplication → [[modular-no-scattered-patches]].
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PostShell from '@/components/feed/PostShell';
import AlignedPostCard, { isHalfItem } from '@/components/feed/AlignedPostCard';
import { useCardCreationStore } from '@/lib/card-creation-store';
import type { ProductCardData } from '@/lib/chat-types';

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
  /** Talk2Me #425 — produit attaché (→ aperçu Hub + Shop). */
  attached_product_json?: string | null;
  /** Card OS : le `.card` stocké (source de vérité), lu par le feed via parseCard. */
  dotcard?: string | null;
}
interface VideoCardItem extends DirectCardItemBase { kind: 'video_card' }
interface ImageCardItem extends DirectCardItemBase { kind: 'image_card' }
interface TexteCardItem extends DirectCardItemBase { kind: 'texte_card' }

interface BoutiqueFeedItem {
  kind: 'boutique';
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  cover_position?: string | null;
}

export type FeedItem = PostItem | VideoCardItem | ImageCardItem | TexteCardItem | BoutiqueFeedItem;

const PAGE_SIZE = 20;

interface PostFeedProps {
  /** "all" = flux global · "friends" = posts de mes amis · "shop" = commerce · "around" = le MÊME feed filtré aux alentours. */
  scope?: 'all' | 'friends' | 'shop' | 'around';
  /** "recent" = par date (défaut) · "popular" = par engagement. */
  sort?: 'recent' | 'popular';
  /** Position pour scope="around" (le feed filtré par proximité). */
  lat?: number | null;
  lng?: number | null;
  /** Message affiché quand le flux est vide. */
  emptyText?: React.ReactNode;
}

export default function PostFeed({ scope = 'all', sort = 'recent', lat = null, lng = null, emptyText }: PostFeedProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [boutiques, setBoutiques] = useState<BoutiqueFeedItem[]>([]);
  // Croix de modération MODE ADMIN sur CHAQUE publication du feed (Pascal 2026-06-12).
  const [adminMode, setAdminMode] = useState(false);
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());
  useEffect(() => { try { setAdminMode(localStorage.getItem('t2m_admin_mode') === '1'); } catch { /* */ } }, []);
  const adminDeleteItem = async (kind: 'post' | 'direct_card', id: string, key: string) => {
    if (!window.confirm('Supprimer cette publication du feed ?')) return;
    try {
      const r = await fetch(`/api/cards/${id}?kind=${kind}`, { method: 'DELETE' });
      if (r.ok) setDeletedKeys((s) => { const n = new Set(s); n.add(key); return n; });
      else alert('Suppression refusée.');
    } catch { /* */ }
  };
  const sentinelRef = useRef<HTMLDivElement>(null);
  const mainElRef = useRef<HTMLElement>(null);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  // Pull-to-refresh
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const deepLinkDoneRef = useRef(false);
  const setActiveShopProduct = useCardCreationStore((s) => s.setActiveShopProduct);
  const setActiveBoutique = useCardCreationStore((s) => s.setActiveBoutique);

  const scopeQ =
    (scope === 'friends' ? '&scope=friends'
      : scope === 'shop' ? '&scope=shop'
      : scope === 'around' ? `&scope=around&lat=${lat}&lng=${lng}`
      : '') +
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
      // Perf (#audit) : les 2 requêtes partent EN PARALLÈLE (plus de waterfall
      // posts → boutiques). La requête boutiques est lancée immédiatement,
      // sans attendre la réponse des posts.
      const postsP = fetch(`/api/posts?limit=${PAGE_SIZE}&offset=0${scopeQ}`, { cache: 'no-store' });
      const boutP = scope === 'shop'
        ? fetch('/api/boutiques/shop', { cache: 'no-store' })
        : null;

      const res = await postsP;
      if (!res.ok) throw new Error('Failed to fetch feed');
      const data = await res.json();
      const page = parsePage(data);
      setItems(page);
      offsetRef.current = page.length;
      setHasMore(page.length >= PAGE_SIZE);

      if (boutP) {
        try {
          const boutRes = await boutP;
          if (boutRes.ok) {
            const boutData = await boutRes.json();
            const boutArr = Array.isArray(boutData?.boutiques)
              ? boutData.boutiques
              : Array.isArray(boutData)
                ? boutData
                : [];
            const boutList: BoutiqueFeedItem[] = boutArr.map(
              (b: { id: string; name: string; description: string | null; cover_url: string | null; cover_position?: string | null }) => ({
                kind: 'boutique' as const,
                id: b.id,
                name: b.name,
                description: b.description,
                cover_url: b.cover_url,
                cover_position: b.cover_position ?? null,
              })
            );
            setBoutiques(boutList);
          }
        } catch (e) {
          console.error('Failed to fetch boutiques:', e);
        }
      } else {
        setBoutiques([]);
      }
    } catch (err) {
      console.error('Error fetching feed:', err);
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [parsePage, scopeQ, scope]);

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

  // Focus d'un post (ex: clic d'une vignette de recherche → /home).
  // Robuste (audit DeepSeek 2026-06-25) : l'id arrive par sessionStorage 't2m_feed_focus'
  // (fiable entre pages, contrairement au hash). On CHARGE les pages JUSQU'À trouver le
  // post, puis on scrolle dessus avec quelques retries (pour gagner sur le scroll-top que
  // Next applique à la navigation). → on n'atterrit JAMAIS par défaut sur le 1er post.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (deepLinkDoneRef.current) return;
    let targetId: string | null = null;
    try { targetId = sessionStorage.getItem('t2m_feed_focus'); } catch { /* */ }
    // rétro-compat : ancien deep-link par hash #card-<id>
    if (!targetId && window.location.hash.startsWith('#card-')) targetId = window.location.hash.slice('#card-'.length);
    if (!targetId) return;
    const tid = targetId;
    const el = document.getElementById(`card-${tid}`);
    if (el) {
      deepLinkDoneRef.current = true;
      try { sessionStorage.removeItem('t2m_feed_focus'); } catch { /* */ }
      let n = 0;
      const settle = () => {
        const e2 = document.getElementById(`card-${tid}`);
        if (e2) e2.scrollIntoView({ block: 'start' });
        if (++n < 5) setTimeout(settle, 80); // gagne sur le scroll-top de Next
      };
      requestAnimationFrame(settle);
      return;
    }
    // Pas encore chargé → on continue de charger (l'effet se relance à chaque items change).
    if (hasMore && offsetRef.current < 500 && !loadingRef.current) loadMore();
  }, [items, hasMore, loadMore]);

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

  // Retour de la PIÈCE 3D : on revient pile sur le post d'où l'on est entré.
  useEffect(() => {
    if (items.length === 0) return;
    let target: string | null = null;
    try { target = sessionStorage.getItem('t2m_piece_return'); } catch { /* */ }
    if (!target) return;
    let tries = 0;
    const tick = () => {
      const root = mainElRef.current;
      const elt = root?.querySelector(`#card-${CSS.escape(target!)}`) as HTMLElement | null;
      if (elt) {
        elt.scrollIntoView({ block: 'start' });
        try { sessionStorage.removeItem('t2m_piece_return'); } catch { /* */ }
        return;
      }
      if (++tries < 20) setTimeout(tick, 150); // le feed charge en async
      else { try { sessionStorage.removeItem('t2m_piece_return'); } catch { /* */ } }
    };
    tick();
  }, [items]);

  // Talk2Me #427 — Shop : suit la carte produit AFFICHÉE (scrollée) et la met
  // dans le store → le bouton + de la barre sert ce produit dans le composer.
  // Suit également les boutiques affichées.
  useEffect(() => {
    if (scope !== 'shop') {
      setActiveShopProduct(null);
      setActiveBoutique(null);
      return;
    }
    const root = mainElRef.current;
    if (!root) return;
    const productById = new Map<string, ProductCardData>();
    for (const it of items) {
      const j = (it as { attached_product_json?: string | null }).attached_product_json;
      if (j) {
        try {
          productById.set(it.id, JSON.parse(j) as ProductCardData);
        } catch {
          /* ignore */
        }
      }
    }
    // Map des boutiques par id
    const boutiqueById = new Map<string, BoutiqueFeedItem>();
    for (const b of boutiques) {
      boutiqueById.set(b.id, b);
    }
    const ratios = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).id?.replace('card-', '');
          if (id) ratios.set(id, e.intersectionRatio);
        }
        let best = 0;
        let bestId: string | null = null;
        for (const [id, r] of ratios) {
          if (r > best) {
            best = r;
            bestId = id;
          }
        }
        if (bestId) {
          const p = productById.get(bestId);
          const b = boutiqueById.get(bestId);
          if (b) {
            // C'est une boutique qui est la plus visible
            setActiveBoutique(bestId);
            setActiveShopProduct(null);
          } else if (p) {
            // C'est un produit qui est le plus visible
            setActiveShopProduct(p);
            setActiveBoutique(null);
          }
        }
      },
      { root, threshold: [0, 0.4, 0.6, 0.9] }
    );
    root.querySelectorAll('[data-snap-card]').forEach((el) => obs.observe(el));
    return () => {
      obs.disconnect();
      setActiveShopProduct(null);
      setActiveBoutique(null);
    };
  }, [scope, items, boutiques, setActiveShopProduct, setActiveBoutique]);

  // Annonce la card ACTIVE (la plus visible) → la colonne commentaires desktop la suit.
  // Émet ttm:feed:active {kind,id} au scroll ; ttm:feed:inactive au démontage du feed.
  useEffect(() => {
    const root = mainElRef.current;
    if (!root) return;
    const seen = new Map<string, { ratio: number; kind: string }>();
    let lastId = '';
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const id = el.dataset.cardId || '';
          const kind = el.dataset.cardKind || '';
          if (id) seen.set(id, { ratio: e.intersectionRatio, kind });
        }
        let best = 0, bestId = '', bestKind = '';
        for (const [id, v] of seen) {
          if (v.kind && v.ratio > best) { best = v.ratio; bestId = id; bestKind = v.kind; }
        }
        if (bestId && best > 0.5 && bestId !== lastId) {
          lastId = bestId;
          window.dispatchEvent(new CustomEvent('ttm:feed:active', { detail: { kind: bestKind, id: bestId } }));
        }
      },
      { root, threshold: [0, 0.5, 0.8] }
    );
    root.querySelectorAll('[data-snap-card]').forEach((el) => obs.observe(el));
    return () => {
      obs.disconnect();
      window.dispatchEvent(new CustomEvent('ttm:feed:inactive'));
    };
  }, [items, boutiques]);

  // Intercale les boutiques dans le flux shop : 1 boutique toutes les 3 produits
  const displayItems = useMemo(() => {
    if (scope !== 'shop' || boutiques.length === 0) return items;
    const result: FeedItem[] = [];
    let boutiqueIdx = 0;
    for (let i = 0; i < items.length; i++) {
      if (i % 3 === 0 && boutiqueIdx < boutiques.length) {
        result.push(boutiques[boutiqueIdx]);
        boutiqueIdx++;
      }
      result.push(items[i]);
    }
    // Si des boutiques restent, les ajouter à la fin
    while (boutiqueIdx < boutiques.length) {
      result.push(boutiques[boutiqueIdx]);
      boutiqueIdx++;
    }
    return result;
  }, [items, boutiques, scope]);

  // Pull-to-refresh (Pascal 2026-07-03) : tirer vers le bas EN HAUT du feed → recharge.
  const PULL_TRIGGER = 46;
  const onPullStart = (e: React.TouchEvent) => {
    const el = mainElRef.current;
    pullStartY.current = el && el.scrollTop <= 0 && !refreshing ? e.touches[0].clientY : null;
  };
  const onPullMove = (e: React.TouchEvent) => {
    if (pullStartY.current == null) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0) setPullY(Math.min(dy * 0.5, 90));
  };
  const onPullEnd = async () => {
    if (pullStartY.current == null) return;
    const go = pullY >= PULL_TRIGGER;
    pullStartY.current = null;
    if (go && !refreshing) {
      setRefreshing(true);
      setPullY(PULL_TRIGGER);
      try { await reloadFromStart(); } finally { setRefreshing(false); setPullY(0); }
    } else {
      setPullY(0);
    }
  };

  return (
    <main
      ref={mainElRef}
      data-feed-scroller
      onTouchStart={onPullStart}
      onTouchMove={onPullMove}
      onTouchEnd={onPullEnd}
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#F5F6F8] px-4 pt-[116px] pb-24"
    >
      {(pullY > 0 || refreshing) && (
        <div
          className="fixed left-1/2 z-40 flex items-center justify-center rounded-full bg-white shadow-md pointer-events-none"
          style={{ top: 100, width: 40, height: 40, transform: `translate(-50%, ${Math.min(pullY, 70)}px)`, opacity: refreshing ? 1 : Math.min(pullY / PULL_TRIGGER, 1) }}
        >
          <svg className={refreshing ? 'animate-spin' : ''} style={refreshing ? undefined : { transform: `rotate(${pullY * 3}deg)` }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF7F11" strokeWidth="2.4" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
          </svg>
        </div>
      )}
      {loading && (
        <div className="h-full flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Chargement...</p>
        </div>
      )}
      {!loading && items.length === 0 && boutiques.length === 0 && (
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
        displayItems.map((item, idx) => {
          const feedKey = `${item.kind}-${item.id}`;
          if (deletedKeys.has(feedKey)) return null;
          if (scope !== 'shop' && item.kind !== 'boutique') {
            return <AlignedPostCard key={feedKey} item={item} />;
          }
          return <PostShell key={feedKey} item={item} idx={idx} scope={scope} adminMode={adminMode} onAdminDelete={adminDeleteItem} />;
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
