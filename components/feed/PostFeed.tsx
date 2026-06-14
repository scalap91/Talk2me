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
import { X } from 'lucide-react';
import PostCard from '@/components/feed/PostCard';
import VitrineCard from '@/components/feed/VitrineCard';
import CardActionsBar from '@/components/cards/CardActionsBar';
import VideoCardDisplay from '@/components/feed/VideoCardDisplay';
import ShopCard from '@/components/feed/ShopCard';
import { useCardCreationStore } from '@/lib/card-creation-store';
import type { ProductCardData } from '@/lib/chat-types';
import ImageCardDisplay from '@/components/feed/ImageCardDisplay';
import TexteCardDisplay from '@/components/feed/TexteCardDisplay';
import BoutiqueFeedCard from '@/components/feed/BoutiqueFeedCard';

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

type FeedItem = PostItem | VideoCardItem | ImageCardItem | TexteCardItem | BoutiqueFeedItem;

const PAGE_SIZE = 20;

interface PostFeedProps {
  /** "all" = flux global · "friends" = posts de mes amis · "shop" = commerce. */
  scope?: 'all' | 'friends' | 'shop';
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
  const setActiveShopProduct = useCardCreationStore((s) => s.setActiveShopProduct);
  const setActiveBoutique = useCardCreationStore((s) => s.setActiveBoutique);

  const scopeQ =
    (scope === 'friends' ? '&scope=friends' : scope === 'shop' ? '&scope=shop' : '') +
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

  return (
    <main
      ref={mainElRef}
      className="flex-1 min-h-0 overflow-y-scroll snap-y snap-mandatory overscroll-contain"
      style={{ scrollSnapStop: 'always' }}
    >
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
          const isOwner = !!item.is_owner;
          const feedKey = `${item.kind}-${item.id}`;
          if (deletedKeys.has(feedKey)) return null;
          const delKind: 'post' | 'direct_card' | null =
            item.kind === 'post' ? 'post'
            : (item.kind === 'video_card' || item.kind === 'image_card' || item.kind === 'texte_card') ? 'direct_card'
            : null;
          return (
            <section
              key={feedKey}
              id={`card-${item.id}`}
              data-feed-index={idx}
              data-snap-card
              className="relative h-full w-full snap-start snap-always flex flex-col overflow-hidden"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              {adminMode && delKind && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); adminDeleteItem(delKind, item.id, feedKey); }}
                  aria-label="Supprimer cette publication (admin)"
                  className="absolute right-3 top-16 z-40 w-9 h-9 rounded-full bg-red-600/95 text-white grid place-items-center shadow-lg active:scale-90"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
              {item.kind === 'boutique' ? (
                <BoutiqueFeedCard boutique={item} />
              ) : scope === 'shop' ? (
                <ShopCard item={item as unknown as { attached_product_json?: string | null; boosted_until?: number | null; author?: { username?: string } | null }} />
              ) : (
                <>
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
                      fromShop={scope === 'shop'}
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
                  {/* Carte d'invitation à une SALLE : photo de la salle (fond) + mot + porte en bas */}
                  {item.kind === 'image_card' && ((item as { caption?: string | null }).caption || '').includes('[PIECE3D]') && (() => {
                    const a = (item as { author?: { display_name?: string; username?: string; avatar_url?: string | null } }).author || {};
                    const who = a.display_name || a.username || 'cet utilisateur';
                    const enter = () => { try { sessionStorage.setItem('t2m_piece_return', item.id); } catch { /* */ } window.location.assign('/piece?u=' + ((item as { user_id?: string }).user_id || '')); };
                    return (
                      <div className="absolute inset-x-0 bottom-0 z-40 flex flex-col items-center gap-4 pb-24 pt-20" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,.55) 40%, rgba(0,0,0,.9))' }}>
                        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15">
                          {a.avatar_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={a.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                            : <span className="w-9 h-9 rounded-full grid place-items-center bg-white/15 text-white text-[15px] font-bold">{who[0]?.toUpperCase()}</span>}
                          <div className="text-left">
                            <div className="text-white text-[14px] font-bold leading-tight">Visite ma salle 3D</div>
                            <div className="text-white/70 text-[12px] leading-tight">chez {who}</div>
                          </div>
                        </div>
                        <button type="button" aria-label="Entrer dans la salle" onClick={enter} className="relative active:scale-95 transition-transform" style={{ width: 120, height: 205 }}>
                          <span className="absolute inset-0 rounded-t-[14px] rounded-b-[4px]" style={{ background: 'linear-gradient(#caa37a,#8a6a45)', boxShadow: '0 16px 44px rgba(0,0,0,.6)' }} />
                          <span className="absolute rounded-t-[10px]" style={{ inset: 7, background: 'linear-gradient(160deg,#6f4f30,#4a3320)', border: '1px solid rgba(0,0,0,.35)' }} />
                          <span className="absolute rounded-md" style={{ left: 20, right: 20, top: 18, height: 70, background: 'rgba(0,0,0,.18)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.06)' }} />
                          <span className="absolute rounded-md" style={{ left: 20, right: 20, top: 98, height: 84, background: 'rgba(0,0,0,.18)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.06)' }} />
                          <span className="absolute rounded-full" style={{ right: 20, top: 108, width: 11, height: 11, background: '#f4d58d', boxShadow: '0 0 8px rgba(244,213,141,.8)' }} />
                          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-3.5 py-1.5 rounded-full bg-black/75 text-white text-[12px] font-bold shadow-lg">Entrer</span>
                        </button>
                      </div>
                    );
                  })()}
                  {/* VITRINE boutique : devanture semi-transparente + mur d'articles + nom en haut */}
                  {item.kind === 'image_card' && /\[VITRINE:[^\]]+\]/.test((item as { caption?: string | null }).caption || '') && (
                    <VitrineCard
                      shopId={((item as { caption?: string | null }).caption || '').match(/\[VITRINE:([^\]]+)\]/)?.[1] || ''}
                      postId={item.id}
                      author={(item as { author?: { display_name?: string; username?: string; avatar_url?: string | null } }).author}
                    />
                  )}
                  {/* ICÔNES SOCIALES au-dessus des overlays vitrine/salle (sinon masquées) */}
                  {item.kind === 'image_card' && (() => {
                    const cap = (item as { caption?: string | null }).caption || '';
                    if (!/\[VITRINE:[^\]]+\]/.test(cap) && !cap.includes('[PIECE3D]')) return null;
                    return (
                      <div className="absolute inset-x-3 bottom-3 z-50 pointer-events-none">
                        <div className="pointer-events-auto">
                          <CardActionsBar
                            cardKind="direct_card"
                            cardId={item.id}
                            initialLikes={item.likes}
                            initialViews={(item as { views?: number }).views ?? 0}
                            initialCommentCount={(item as { comment_count?: number }).comment_count ?? 0}
                            initialLikedByMe={!!item.liked_by_me}
                            isOwner={isOwner}
                            variant="overlay"
                          />
                        </div>
                      </div>
                    );
                  })()}
                  {/* Post R&D : Léa 360° photoréaliste (bac à sable isolé) */}
                  {item.kind === 'image_card' && ((item as { caption?: string | null }).caption || '').includes('[LEA360]') && (
                    <button
                      type="button"
                      aria-label="Ouvrir Léa 360°"
                      onClick={() => window.location.assign('/rd/avatar')}
                      className="absolute left-1/2 bottom-28 z-40 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-white text-[14px] font-bold active:scale-95"
                    >
                      Ouvrir Léa 360°
                    </button>
                  )}
                </>
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
