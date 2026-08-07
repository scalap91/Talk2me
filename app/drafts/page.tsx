'use client';

/**
 * Talk2Me #334 + #336 (Pascal 2026-06-04) — /drafts : "Mes cards"
 * (Brouillons + Publiées).
 *
 * Doctrine [[talk2me-card-editor-ia]] :
 *  - L'utilisateur peut quitter et reprendre l'édition (onglet Brouillons).
 *  - Les cards publiées par l'utilisateur sont visibles dans son espace
 *    (onglet Publiées), au même endroit, pour qu'il garde la main sur tout
 *    ce qu'il a posé sur Talk2Me.
 *
 * Tab actif persisté dans l'URL hash (#brouillons / #publiees) afin que les
 * navigations back/forward et les liens partagés tombent sur le bon onglet.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Type,
  Trash2,
  Plus,
  Layers,
  Heart,
  Eye,
  MessageSquare,
  Music,
  Rocket,
  ShoppingBag,
  GraduationCap,
  UtensilsCrossed,
  Store,
  Bookmark,
} from '@/lib/icons';
import BottomNav from '@/components/chat/BottomNav';
import { formatMoney } from '@/lib/money';
import { useCardCreationStore } from '@/lib/card-creation-store';
import DeleteCardConfirm from '@/components/cards/DeleteCardConfirm';
import MusicCardTab from '@/components/cards/MusicCardTab';
import SavedCardsTab from '@/components/cards/SavedCardsTab';

// ----- types -----

interface DraftDto {
  id: string;
  type: 'image' | 'video' | 'texte' | 'gabarit' | 'plat_maison' | 'resto' | 'boutique';
  draft_data: any;
  thumbnail_url: string | null;
  title: string | null;
  created_at: number;
  updated_at: number;
}

interface PublishedCardDto {
  id: string;
  /** Lot A — discriminant pour DELETE/archive */
  card_kind: 'direct_card' | 'post';
  type: 'image' | 'video' | 'texte' | 'conv_clip' | 'boutique' | 'formation';
  thumbnail_url: string | null;
  title: string | null;
  preview_text: string | null;
  published_at: number;
  like_count: number;
  view_count: number;
  boosted_until?: number | null;
  has_product?: boolean;
  has_audio?: boolean;
  product?: { title?: string; image_url?: string | null; price_label?: string | null; source?: string } | null;
}

type TabKey = 'brouillons' | 'publiees' | 'likees' | 'music' | 'shop' | 'boutiques' | 'enregistrees';

// ----- utils -----

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'à l’instant';
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tabFromHash(): TabKey {
  // Talk2Me #391 (Pascal 2026-06-05) — Onglet Publiées par défaut.
  // Pascal verbatim : "inverse les onglets brouillons et publié publié passe
  // en premier dans l'ordre".
  // Talk2Me #422 (Pascal 2026-06-06) — Music Card est le premier onglet.
  // Pascal 2026-07-13 : onglet PAR DÉFAUT = « Publiées » (l'user voit SES cards en
  // ouvrant Card, pas une playlist d'artistes tiers — meilleure clarté + review stores).
  if (typeof window === 'undefined') return 'publiees';
  const h = window.location.hash.replace(/^#/, '');
  if (h === 'brouillons' || h === 'drafts') return 'brouillons';
  if (h === 'likees' || h === 'liked') return 'likees';
  if (h === 'publiees' || h === 'published') return 'publiees';
  if (h === 'shop') return 'shop';
  if (h === 'boutiques') return 'boutiques';
  if (h === 'music') return 'music';
  if (h === 'enregistrees' || h === 'saved') return 'enregistrees';
  return 'publiees';
}

function writeTabToHash(tab: TabKey) {
  if (typeof window === 'undefined') return;
  const next = `#${tab}`;
  if (window.location.hash !== next) {
    history.replaceState(null, '', next);
  }
}

// ----- composants -----

function TypeIcon({ type }: { type: DraftDto['type'] | PublishedCardDto['type'] }) {
  const cls = 'w-4 h-4';
  if (type === 'image') return <ImageIcon className={cls} />;
  if (type === 'video') return <VideoIcon className={cls} />;
  if (type === 'gabarit') return <VideoIcon className={cls} />;
  if (type === 'plat_maison') return <UtensilsCrossed className={cls} />;
  if (type === 'resto') return <Store className={cls} />;
  if (type === 'boutique') return <ShoppingBag className={cls} />;
  if (type === 'formation') return <GraduationCap className={cls} />;
  if (type === 'conv_clip') return <MessageSquare className={cls} />;
  return <Type className={cls} />;
}

function typeLabel(type: DraftDto['type'] | PublishedCardDto['type']): string {
  if (type === 'image') return 'Photo';
  if (type === 'video') return 'Vidéo';
  if (type === 'gabarit') return 'Compo';
  if (type === 'plat_maison') return 'Plat maison';
  if (type === 'resto') return 'Restaurant';
  if (type === 'boutique') return 'Boutique';
  if (type === 'formation') return 'Formation';
  if (type === 'conv_clip') return 'Conv';
  return 'Texte';
}

function DraftThumb({ d }: { d: DraftDto }) {
  if (d.thumbnail_url) {
    if (d.type === 'video') {
      return (
        <video
          src={d.thumbnail_url}
          muted
          playsInline
          preload="metadata"
          className="w-16 h-16 object-cover rounded-xl border border-[var(--t2m-line)] bg-[var(--t2m-wash)]"
        />
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={d.thumbnail_url}
        alt={d.title || 'Brouillon'}
        className="w-16 h-16 object-cover rounded-xl border border-[var(--t2m-line)] bg-[var(--t2m-wash)]"
      />
    );
  }
  const bg =
    d.type === 'texte'
      ? 'linear-gradient(135deg, #1a1a22 0%, #232330 100%)'
      : 'linear-gradient(135deg, #3a1418 0%, #56181f 100%)';
  return (
    <div
      className="w-16 h-16 rounded-xl border border-[var(--t2m-line)] flex items-center justify-center text-[var(--t2m-ink-2)]"
      style={{ background: bg }}
    >
      <TypeIcon type={d.type} />
    </div>
  );
}

function PublishedThumb({ c }: { c: PublishedCardDto }) {
  if (c.thumbnail_url) {
    if (c.type === 'video') {
      return (
        <video
          src={c.thumbnail_url}
          muted
          playsInline
          preload="metadata"
          className="w-16 h-16 object-cover rounded-xl border border-[var(--t2m-line)] bg-[var(--t2m-wash)]"
        />
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={c.thumbnail_url}
        alt={c.title || 'Card publiée'}
        className="w-16 h-16 object-cover rounded-xl border border-[var(--t2m-line)] bg-[var(--t2m-wash)]"
      />
    );
  }
  const bg =
    c.type === 'texte'
      ? 'linear-gradient(135deg, #1a1a22 0%, #232330 100%)'
      : c.type === 'conv_clip'
        ? 'linear-gradient(135deg, #18233a 0%, #213254 100%)'
        : 'linear-gradient(135deg, #3a1418 0%, #56181f 100%)';
  return (
    <div
      className="w-16 h-16 rounded-xl border border-[var(--t2m-line)] flex items-center justify-center text-[var(--t2m-ink-2)]"
      style={{ background: bg }}
    >
      <TypeIcon type={c.type} />
    </div>
  );
}

// ----- page -----

export default function MyCardsPage() {
  const router = useRouter();
  const openSheet = useCardCreationStore((s) => s.openSheet);

  // Pascal 2026-07-13 — onglet par défaut = « Publiées » (l'user voit SES cards à l'ouverture).
  const [tab, setTab] = useState<TabKey>('publiees');

  // Init tab depuis le hash + écoute changements (back/forward, lien partagé).
  useEffect(() => {
    setTab(tabFromHash());
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const switchTab = useCallback((next: TabKey) => {
    setTab(next);
    writeTabToHash(next);
  }, []);

  // ----- Brouillons -----
  const [drafts, setDrafts] = useState<DraftDto[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const r = await fetch('/api/drafts', { cache: 'no-store' });
      if (r.status === 401) {
        router.replace('/signin');
        return;
      }
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d?.drafts)) setDrafts(d.drafts);
      }
    } finally {
      setDraftsLoading(false);
    }
  }, [router]);

  // ----- Publiées -----
  const [published, setPublished] = useState<PublishedCardDto[]>([]);
  const [publishedLoading, setPublishedLoading] = useState(true);

  const loadPublished = useCallback(async () => {
    setPublishedLoading(true);
    try {
      const r = await fetch('/api/cards/mine', { cache: 'no-store' });
      if (r.status === 401) {
        router.replace('/signin');
        return;
      }
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d?.cards)) setPublished(d.cards);
      }
    } catch {
      /* ignore */
    } finally {
      setPublishedLoading(false);
    }
  }, [router]);

  // Talk2Me #411 — Cards likées par le user
  const [liked, setLiked] = useState<PublishedCardDto[]>([]);
  const [likedLoading, setLikedLoading] = useState(true);

  const loadLiked = useCallback(async () => {
    setLikedLoading(true);
    try {
      const r = await fetch('/api/cards/liked', { cache: 'no-store' });
      if (r.status === 401) {
        router.replace('/signin');
        return;
      }
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d?.cards)) setLiked(d.cards);
      }
    } finally {
      setLikedLoading(false);
    }
  }, [router]);

  // ----- Mes boutiques (déplacé depuis le panneau Discussions, Pascal 2026-07) -----
  // Les boutiques/plats/restos créés par l'utilisateur vivent ici, sur la page
  // Card, pour qu'il les retrouve et les gère (« j'ai créé une boutique je ne la
  // vois pas »). Source : GET /api/simple-shop → { shops: [...] }.
  const [myShops, setMyShops] = useState<{ id: string; name: string; description?: string | null; kind?: string; vitrine_card_id?: string | null; boosted_until?: number | null }[]>([]);
  const [confirmDelShop, setConfirmDelShop] = useState<string | null>(null);
  const [delShopBusy, setDelShopBusy] = useState(false);
  const [swipeShop, setSwipeShop] = useState<{ id: string; dx: number } | null>(null);
  const swipeStart = useRef<{ id: string; x: number; moved: boolean } | null>(null);
  const suppressShopClick = useRef(false);

  const loadShops = useCallback(async () => {
    try {
      const r = await fetch('/api/simple-shop', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d?.shops)) setMyShops(d.shops);
      }
    } catch {
      // ignore
    }
  }, []);

  // Suppression d'une boutique / plat / resto du propriétaire (confirmation inline).
  const deleteShop = async (id: string) => {
    if (delShopBusy) return;
    setDelShopBusy(true);
    try {
      const res = await fetch('/api/simple-shop', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      if (res.ok) { setMyShops((prev) => prev.filter((x) => x.id !== id)); setConfirmDelShop(null); }
    } finally { setDelShopBusy(false); }
  };

  useEffect(() => {
    loadDrafts();
    loadPublished();
    loadLiked();
    loadShops();
  }, [loadDrafts, loadPublished, loadLiked, loadShops]);

  // Refetch publiées quand une nouvelle card vient d'être publiée
  useEffect(() => {
    const onPublished = () => {
      loadPublished();
    };
    window.addEventListener('talktome:card-published', onPublished);
    return () => window.removeEventListener('talktome:card-published', onPublished);
  }, [loadPublished]);

  // ----- Handlers Brouillons -----
  const handleDeleteDraft = async (id: string) => {
    if (!confirm('Supprimer ce brouillon ?')) return;
    try {
      const r = await fetch(`/api/drafts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (r.ok) setDrafts((prev) => prev.filter((x) => x.id !== id));
    } catch {
      // ignore
    }
  };

  const handleResumeDraft = (d: DraftDto) => {
    // Plat maison / Resto : reprise dans leur propre feuille (pas l'éditeur de card).
    if (d.type === 'plat_maison' || d.type === 'resto') {
      try { sessionStorage.setItem('t2m_open_draft', JSON.stringify({ type: d.type, id: d.id })); } catch { /* */ }
      router.push(d.type === 'plat_maison' ? '/friends' : '/home');
      return;
    }
    // Boutique : composer global → on l'ouvre par événement (pas de navigation).
    if (d.type === 'boutique') {
      fetch(`/api/drafts/${d.id}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((res) => { if (res?.draft) window.dispatchEvent(new CustomEvent('ttm:resume-boutique', { detail: { id: d.id, initial: res.draft.draft_data } })); })
        .catch(() => {});
      return;
    }
    router.push(`/drafts/${d.id}/edit`);
  };

  // ----- Handlers Publiées -----
  // Talk2Me #383 (Pascal 2026-06-05) — Tap aperçu → viewer dédié /mes-cards/<id>
  // où le user voit SA card sélectionnée + scroll = ses cards à lui uniquement
  // (pas le feed mixte /home). Doctrine verbatim Pascal :
  //   « je doit voir la card selevtionner et non pas atterir sur le hub ».
  const handleOpenPublished = (c: PublishedCardDto) => {
    // Talk2Me #427 — depuis l'onglet Shop, on ouvre le viewer scopé Shop (on ne
    // scrolle que les cards Shop). La pièce jointe détermine la catégorie.
    const q = tab === 'shop' ? '?cat=shop' : '';
    router.push(`/mes-cards/${c.id}${q}`);
  };

  // ===== Talk2Me #383 — Drag & drop reorder =====
  // Doctrine Pascal : « posibilte de changer lordre de la liste avec un simple
  // capuyait gisset » → long-press 500ms + glisser + drop.
  //
  // Implémentation manuelle (pas de lib) :
  //   - draggedId : id de la card en cours de drag
  //   - dragY : translateY courant pour le visuel
  //   - hoverIndex : index où on dropperait si on relâchait maintenant
  //
  // POST batch sur /api/cards/reorder à la fin pour persister 0..N-1.
  const LONG_PRESS_MS = 500;
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number>(0);
  const dragStartIndex = useRef<number>(-1);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const startDrag = useCallback(
    (id: string, startY: number) => {
      const idx = published.findIndex((p) => p.id === id);
      if (idx < 0) return;
      dragStartY.current = startY;
      dragStartIndex.current = idx;
      setDraggedId(id);
      setHoverIndex(idx);
      setDragY(0);
      // Haptic feedback léger sur mobile (silencieux si non supporté).
      try {
        navigator?.vibrate?.(15);
      } catch {
        /* noop */
      }
    },
    [published]
  );

  const handlePointerDown = useCallback(
    (id: string, e: React.PointerEvent<HTMLLIElement>) => {
      // Ignore les events sur les boutons enfant (Supprimer, etc.)
      const target = e.target as HTMLElement;
      if (target.closest('[data-no-drag]')) return;
      const startY = e.clientY;
      cancelLongPress();
      longPressTimer.current = setTimeout(() => {
        startDrag(id, startY);
      }, LONG_PRESS_MS);
    },
    [cancelLongPress, startDrag]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLLIElement>) => {
      if (!draggedId) {
        // Si on bouge avant la fin du long-press → annule le long-press
        // (l'utilisateur scrolle).
        if (longPressTimer.current) {
          const dy = Math.abs(e.clientY - (dragStartY.current || e.clientY));
          if (dy > 8) cancelLongPress();
        }
        return;
      }
      e.preventDefault();
      const dy = e.clientY - dragStartY.current;
      setDragY(dy);

      // Calcule hoverIndex en regardant le rect de chaque <li> non draggée
      let newHover = dragStartIndex.current;
      for (let i = 0; i < published.length; i++) {
        const p = published[i];
        if (p.id === draggedId) continue;
        const el = itemRefs.current.get(p.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if (e.clientY < mid) {
          newHover = i;
          break;
        }
        newHover = i + 1;
      }
      // Ajuste si on franchit l'élément draggé
      if (newHover > dragStartIndex.current) newHover -= 1;
      if (newHover < 0) newHover = 0;
      if (newHover >= published.length) newHover = published.length - 1;
      if (newHover !== hoverIndex) setHoverIndex(newHover);
    },
    [draggedId, published, hoverIndex, cancelLongPress]
  );

  const commitReorder = useCallback(
    async (next: PublishedCardDto[]) => {
      const items = next.map((c, i) => ({
        id: c.id,
        kind: c.card_kind,
        position: i,
      }));
      try {
        await fetch('/api/cards/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        });
      } catch (e) {
        console.error('[drafts] reorder POST failed', e);
      }
    },
    []
  );

  const handlePointerUp = useCallback(() => {
    cancelLongPress();
    if (!draggedId) return;
    const fromIdx = dragStartIndex.current;
    const toIdx = hoverIndex ?? fromIdx;
    setDraggedId(null);
    setHoverIndex(null);
    setDragY(0);
    if (fromIdx === toIdx || toIdx < 0) return;
    setPublished((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      // Fire & forget : on persiste en arrière-plan, l'UI a déjà bougé.
      void commitReorder(arr);
      return arr;
    });
  }, [draggedId, hoverIndex, commitReorder, cancelLongPress]);

  const handlePointerCancel = useCallback(() => {
    cancelLongPress();
    setDraggedId(null);
    setHoverIndex(null);
    setDragY(0);
  }, [cancelLongPress]);

  // Lot A — Modal de confirmation suppression d'une card publiée.
  const [deleteTarget, setDeleteTarget] = useState<{
    cardKind: 'direct_card' | 'post';
    cardId: string;
  } | null>(null);

  // Talk2Me #427 — Boost : cible + état.
  const [boostTarget, setBoostTarget] = useState<{
    cardKind: 'direct_card' | 'post';
    cardId: string;
    title: string;
    boostedUntil: number | null;
  } | null>(null);

  return (
    <div className="flex flex-col h-[100svh] t2m-page bg-[var(--t2m-wash)] overflow-hidden">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/85 px-4 backdrop-blur-xl">
        <h1 className="text-[17px] font-medium tracking-tight text-[var(--t2m-ink)]">
          Mes cards
        </h1>
        <span className="text-[11px] text-[var(--t2m-ink-3)]">
          {tab === 'brouillons'
            ? drafts.length
            : tab === 'likees'
              ? liked.length
              : tab === 'music'
                ? '🎵'
                : tab === 'enregistrees'
                  ? '🔖'
                  : published.length}
        </span>
      </header>

      {/* Onglets */}
      <div
        role="tablist"
        aria-label="Mes cards"
        className="sticky top-14 z-30 flex items-center gap-1 px-4 pt-2 pb-2 bg-[var(--t2m-paper)]/85 backdrop-blur-xl border-b border-[var(--t2m-line)] overflow-x-auto"
      >
        {/* Talk2Me #422 (Pascal 2026-06-06) — "Music Card est le premier
            onglet" : la bibliothèque music-hub en tête + active par défaut. */}
        <button
          role="tab"
          aria-selected={tab === 'music'}
          data-testid="tab-music"
          onClick={() => switchTab('music')}
          className={
            'flex-1 min-w-[88px] whitespace-nowrap inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors border ' +
            (tab === 'music'
              ? 'bg-[var(--t2m-ink)] border-[var(--t2m-ink)] text-white'
              : 'bg-[var(--t2m-wash)] border-[var(--t2m-line)] text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]')
          }
        >
          <Music className="w-3.5 h-3.5" />
          Music Card
        </button>
        {/* Onglet Boutiques (Pascal 2026-07-08) — la liste des boutiques du user, déplacée du panneau Discussions. */}
        <button
          role="tab"
          aria-selected={tab === 'boutiques'}
          data-testid="tab-boutiques"
          onClick={() => switchTab('boutiques')}
          className={
            'flex-1 min-w-[92px] whitespace-nowrap inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors border ' +
            (tab === 'boutiques'
              ? 'bg-[var(--t2m-ink)] border-[var(--t2m-ink)] text-white'
              : 'bg-[var(--t2m-wash)] border-[var(--t2m-line)] text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]')
          }
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          Boutiques
          {myShops.length > 0 && <span className="ml-1 text-[11px] text-[var(--t2m-ink-3)]">{myShops.length}</span>}
        </button>
        {/* Talk2Me #391 (Pascal 2026-06-05) — Ordre : Publiées avant Brouillons. */}
        <button
          role="tab"
          aria-selected={tab === 'publiees'}
          data-testid="tab-publiees"
          onClick={() => switchTab('publiees')}
          className={
            'flex-1 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors border ' +
            (tab === 'publiees'
              ? 'bg-[var(--t2m-ink)] border-[var(--t2m-ink)] text-white'
              : 'bg-[var(--t2m-wash)] border-[var(--t2m-line)] text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]')
          }
        >
          Publiées
          <span className="ml-1.5 text-[11px] text-[var(--t2m-ink-3)]">{published.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'shop'}
          data-testid="tab-shop"
          onClick={() => switchTab('shop')}
          className={
            'flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors border ' +
            (tab === 'shop'
              ? 'bg-[var(--t2m-ink)] border-[var(--t2m-ink)] text-white'
              : 'bg-[var(--t2m-wash)] border-[var(--t2m-line)] text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]')
          }
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          Shop
          <span className="ml-1 text-[11px] text-[var(--t2m-ink-3)]">
            {published.filter((c) => c.has_product).length}
          </span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'likees'}
          data-testid="tab-likees"
          onClick={() => switchTab('likees')}
          className={
            'flex-1 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors border ' +
            (tab === 'likees'
              ? 'bg-[var(--t2m-ink)] border-[var(--t2m-ink)] text-white'
              : 'bg-[var(--t2m-wash)] border-[var(--t2m-line)] text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]')
          }
        >
          Likées
          <span className="ml-1.5 text-[11px] text-[var(--t2m-ink-3)]">{liked.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'brouillons'}
          data-testid="tab-brouillons"
          onClick={() => switchTab('brouillons')}
          className={
            'flex-1 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors border ' +
            (tab === 'brouillons'
              ? 'bg-[var(--t2m-ink)] border-[var(--t2m-ink)] text-white'
              : 'bg-[var(--t2m-wash)] border-[var(--t2m-line)] text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]')
          }
        >
          Brouillons
          <span className="ml-1.5 text-[11px] text-[var(--t2m-ink-3)]">{drafts.length}</span>
        </button>
        {/* Onglet Enregistrées (Pascal 2026-08-05) — les cards mises de côté, déménagées
            du profil (section Mon Compte) vers le hub Card, avec Music Card / Brouillons. */}
        <button
          role="tab"
          aria-selected={tab === 'enregistrees'}
          data-testid="tab-enregistrees"
          onClick={() => switchTab('enregistrees')}
          className={
            'flex-1 min-w-[104px] whitespace-nowrap inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors border ' +
            (tab === 'enregistrees'
              ? 'bg-[var(--t2m-ink)] border-[var(--t2m-ink)] text-white'
              : 'bg-[var(--t2m-wash)] border-[var(--t2m-line)] text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]')
          }
        >
          <Bookmark className="w-3.5 h-3.5" />
          Enregistrées
        </button>
      </div>

      <main className="flex-1 overflow-y-auto pb-28 relative">
        {/* ===== Onglet Boutiques : liste des boutiques du user (Pascal 2026-07-08) ===== */}
        {tab === 'boutiques' && (
          <section className="px-4 pt-3 pb-1">
            {myShops.length === 0 ? (
              <p className="text-center text-[var(--t2m-ink-3)] text-[13px] py-16">Aucune boutique pour l&apos;instant.<br />Crée-en une depuis le bouton + « Créer ».</p>
            ) : (
            <>
            <p className="text-[12px] text-[var(--t2m-ink-3)] uppercase tracking-wide mb-1.5">Mes boutiques</p>
            <div className="space-y-1.5">
              {myShops.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center rounded-2xl border border-[var(--t2m-line)] bg-[var(--t2m-paper)]"
                  onTouchStart={(e) => { swipeStart.current = { id: s.id, x: e.touches[0].clientX, moved: false }; }}
                  onTouchMove={(e) => {
                    if (swipeStart.current?.id !== s.id) return;
                    const dx = e.touches[0].clientX - swipeStart.current.x;
                    if (Math.abs(dx) > 6) swipeStart.current.moved = true;
                    if (dx < 0) setSwipeShop({ id: s.id, dx: Math.max(dx, -88) });
                  }}
                  onTouchEnd={() => {
                    const open = swipeShop?.id === s.id && swipeShop.dx <= -56;
                    if (swipeStart.current?.moved) suppressShopClick.current = true;
                    setSwipeShop(null); swipeStart.current = null;
                    if (open) setConfirmDelShop(s.id);
                  }}
                  style={{
                    transform: swipeShop?.id === s.id ? `translateX(${swipeShop.dx}px)` : undefined,
                    transition: swipeShop?.id === s.id ? 'none' : 'transform .18s ease',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { if (suppressShopClick.current) { suppressShopClick.current = false; return; } router.push(`/ma-boutique/${s.id}`); }}
                    className="flex-1 min-w-0 flex items-center gap-3 p-2.5 text-left rounded-l-2xl hover:bg-[var(--t2m-wash)] active:scale-[0.99]"
                  >
                    <span className="w-9 h-9 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] grid place-items-center text-[var(--t2m-ink-2)] shrink-0">{s.kind === 'plat_maison' ? <UtensilsCrossed size={18} /> : <ShoppingBag size={18} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-[var(--t2m-ink)] truncate">{s.name}</span>
                      {s.description ? <span className="block text-[12px] text-[var(--t2m-ink-2)] truncate">{s.description}</span> : <span className="block text-[12px] text-[var(--t2m-ink-2)]">{s.kind === 'plat_maison' ? 'Plats maison · ouvrir' : 'Ouvrir / gérer'}</span>}
                    </span>
                  </button>
                  {confirmDelShop === s.id ? (
                    <span className="flex items-center gap-1.5 pr-2 shrink-0">
                      <button type="button" disabled={delShopBusy} onClick={() => deleteShop(s.id)} className="px-2.5 h-8 rounded-full bg-[#E86F00] text-white text-[12px] font-semibold active:scale-95 disabled:opacity-50">Supprimer</button>
                      <button type="button" onClick={() => setConfirmDelShop(null)} className="px-2.5 h-8 rounded-full border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] text-[12px] active:scale-95">Annuler</button>
                    </span>
                  ) : (
                    <>
                      {/* #74 — Booster : met la card vitrine de la boutique en avant dans le feed (débit Wallet).
                          Visible seulement si la boutique est publiée (elle a une card vitrine à booster). */}
                      {s.vitrine_card_id && (
                        <button
                          type="button"
                          aria-label="Booster ma boutique"
                          title="Mettre ma boutique en avant dans le feed"
                          onClick={() => setBoostTarget({ cardKind: 'direct_card', cardId: s.vitrine_card_id as string, title: s.name, boostedUntil: s.boosted_until ?? null })}
                          className={`h-8 mr-1 px-2.5 rounded-full inline-flex items-center gap-1 text-[12px] font-semibold active:scale-95 shrink-0 border ${s.boosted_until && s.boosted_until > Date.now() ? 'bg-[var(--t2m-primary)] text-white border-[var(--t2m-primary)]' : 'border-[var(--t2m-primary)] text-[var(--t2m-primary-deep)]'}`}
                        >
                          <Rocket size={14} weight="fill" />
                          {s.boosted_until && s.boosted_until > Date.now() ? 'Boosté' : 'Booster'}
                        </button>
                      )}
                      <button type="button" aria-label="Supprimer la boutique" onClick={() => setConfirmDelShop(s.id)} className="w-10 h-10 mr-1 rounded-full grid place-items-center text-[var(--t2m-ink-3)] hover:text-[#FF7F11] hover:bg-[rgba(255,127,17,0.10)] shrink-0"><Trash2 size={16} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
            </>
            )}
          </section>
        )}

        {/* ===== Tab Brouillons ===== */}
        {tab === 'brouillons' && (
          <div data-testid="panel-brouillons">
            {draftsLoading && (
              <div className="text-center text-[var(--t2m-ink-2)] text-[13px] py-12">
                Chargement…
              </div>
            )}

            {!draftsLoading && drafts.length === 0 && (
              <div className="flex flex-col items-center text-center pt-20 px-6 gap-3">
                <div className="w-16 h-16 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] flex items-center justify-center mb-1">
                  <Layers className="text-[var(--t2m-ink-3)]" size={24} />
                </div>
                <div className="text-[14.5px] font-medium text-[var(--t2m-ink)]">
                  Aucun brouillon
                </div>
                <p className="text-[12.5px] text-[var(--t2m-ink-2)] leading-relaxed max-w-xs">
                  Tape sur{' '}
                  <span className="text-[var(--t2m-ink)] font-medium">➕</span> en bas pour
                  créer une nouvelle card. Tes éditions en cours apparaîtront ici.
                </p>
              </div>
            )}

            {!draftsLoading && drafts.length > 0 && (
              <ul className="divide-y divide-[var(--t2m-line)]">
                {drafts.map((d) => (
                  <li
                    key={d.id}
                    data-testid={`draft-${d.id}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleResumeDraft(d)}
                      data-testid={`draft-resume-${d.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-90 active:opacity-80"
                    >
                      <DraftThumb d={d} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] inline-flex items-center gap-1">
                            <TypeIcon type={d.type} />
                            {typeLabel(d.type)}
                          </span>
                        </div>
                        <div className="text-[14px] font-medium text-[var(--t2m-ink)] truncate mt-1">
                          {d.title?.trim() || 'Sans titre'}
                        </div>
                        <div className="text-[11.5px] text-[var(--t2m-ink-3)] mt-0.5">
                          {formatRelative(d.updated_at)}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(d.id)}
                      data-testid={`draft-delete-${d.id}`}
                      aria-label="Supprimer le brouillon"
                      className="w-9 h-9 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-red-500 flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ===== Tab Publiées + Shop (même rendu, Shop = filtré produit) ===== */}
        {(tab === 'publiees' || tab === 'shop') && (() => {
          const isShop = tab === 'shop';
          const list = isShop ? published.filter((c) => c.has_product) : published;
          return (
          <div data-testid={isShop ? 'panel-shop' : 'panel-publiees'}>
            {publishedLoading && (
              <div className="text-center text-[var(--t2m-ink-2)] text-[13px] py-12">
                Chargement…
              </div>
            )}

            {!publishedLoading && list.length === 0 && (
              <div className="flex flex-col items-center text-center pt-20 px-6 gap-3">
                <div className="w-16 h-16 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] flex items-center justify-center mb-1">
                  {isShop ? <ShoppingBag className="text-[var(--t2m-ink-3)]" size={24} /> : <Layers className="text-[var(--t2m-ink-3)]" size={24} />}
                </div>
                <div className="text-[14.5px] font-medium text-[var(--t2m-ink)]">
                  {isShop ? 'Aucun post shop' : 'Aucune card publiée'}
                </div>
                <p className="text-[12.5px] text-[var(--t2m-ink-2)] leading-relaxed max-w-xs">
                  {isShop
                    ? 'Tes posts avec un produit attaché apparaîtront ici. Crée-en un via le gabarit (zone Produit) ou depuis le Shop.'
                    : 'Tes cards publiées (depuis l’éditeur direct ou depuis une conversation) apparaîtront ici.'}
                </p>
              </div>
            )}

            {!publishedLoading && list.length > 0 && (
              <ul className="divide-y divide-[var(--t2m-line)]" data-testid="published-list">
                {list.map((c, idx) => {
                  const isDragging = draggedId === c.id;
                  const isHovered =
                    !!draggedId &&
                    !isDragging &&
                    hoverIndex !== null &&
                    idx === hoverIndex;
                  return (
                    <li
                      key={c.id}
                      ref={(el) => {
                        if (el) itemRefs.current.set(c.id, el);
                        else itemRefs.current.delete(c.id);
                      }}
                      data-testid={`published-${c.id}`}
                      data-dragging={isDragging ? 'true' : 'false'}
                      onPointerDown={isShop ? undefined : (e) => handlePointerDown(c.id, e)}
                      onPointerMove={isShop ? undefined : handlePointerMove}
                      onPointerUp={isShop ? undefined : handlePointerUp}
                      onPointerCancel={isShop ? undefined : handlePointerCancel}
                      className={
                        // Talk2Me #391 (Pascal 2026-06-05) — scroll Publiées :
                        // `touch-none` bloquait le scroll vertical natif sur
                        // mobile. On ne le force que SUR l'item en cours de drag
                        // (sinon `touch-pan-y` laisse passer le scroll vertical).
                        'flex items-center gap-3 px-4 py-3 select-none transition-shadow ' +
                        (isDragging
                          ? 'touch-none relative z-30 ring-2 ring-[var(--t2m-primary)] rounded-xl scale-[1.03] shadow-2xl bg-[var(--t2m-paper)]'
                          : isHovered
                            ? 'touch-pan-y bg-[var(--t2m-wash)] border-t-2 border-[var(--t2m-primary)]/40'
                            : 'touch-pan-y')
                      }
                      style={
                        isDragging
                          ? {
                              transform: `translateY(${dragY}px) scale(1.03)`,
                              transition: 'none',
                            }
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          // Si on est en cours de drag, ne pas ouvrir.
                          if (draggedId) return;
                          handleOpenPublished(c);
                        }}
                        data-testid={`published-open-${c.id}`}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-90 active:opacity-80"
                      >
                        <PublishedThumb c={c} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] inline-flex items-center gap-1">
                              <TypeIcon type={c.type} />
                              {typeLabel(c.type)}
                            </span>
                          </div>
                          <div className="text-[14px] font-medium text-[var(--t2m-ink)] truncate mt-1">
                            {c.title?.trim() || c.preview_text?.trim() || 'Sans titre'}
                          </div>
                          <div className="flex items-center gap-3 text-[11.5px] text-[var(--t2m-ink-3)] mt-0.5">
                            <span>{formatRelative(c.published_at)}</span>
                            <span className="inline-flex items-center gap-1">
                              <Heart className="w-3 h-3" />
                              {c.like_count}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {c.view_count}
                            </span>
                          </div>
                          {/* Talk2Me #427 — pièces JOINTES (ce qui fait la carte
                              shop) : produit attaché + son. */}
                          {(c.product || c.has_audio) && (
                            <div className="flex items-center gap-2 mt-1.5">
                              {c.product && (
                                <span className="inline-flex items-center gap-1.5 max-w-[200px] pl-1 pr-2 py-0.5 rounded-full bg-[var(--t2m-primary)]/10 border border-[var(--t2m-primary)]/30">
                                  {c.product.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={c.product.image_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                                  ) : (
                                    <ShoppingBag className="w-3.5 h-3.5 text-[var(--t2m-primary-deep)]" />
                                  )}
                                  <span className="text-[11px] text-[var(--t2m-primary-deep)] truncate">
                                    {c.product.price_label || c.product.title || 'Produit'}
                                  </span>
                                </span>
                              )}
                              {c.has_audio && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[11px] text-[var(--t2m-ink-2)]">
                                  <Music className="w-3 h-3" /> son
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                      {/* Talk2Me #427 — Booster (payant, débité du Wallet) */}
                      <button
                        type="button"
                        data-no-drag
                        onClick={() =>
                          setBoostTarget({
                            cardKind: c.card_kind || 'direct_card',
                            cardId: c.id,
                            title: c.title?.trim() || c.preview_text?.trim() || 'ce post',
                            boostedUntil: c.boosted_until ?? null,
                          })
                        }
                        aria-label="Booster la card"
                        className="w-9 h-9 rounded-full bg-[var(--t2m-primary)]/12 border border-[var(--t2m-primary)]/30 text-[var(--t2m-primary-deep)] flex items-center justify-center hover:bg-[var(--t2m-primary)]/20 transition-colors"
                      >
                        <Rocket className="w-4 h-4" />
                      </button>
                      {/* Lot A — Bouton Supprimer (soft-delete vers /trash) */}
                      <button
                        type="button"
                        data-no-drag
                        onClick={() =>
                          setDeleteTarget({
                            cardKind: c.card_kind || 'direct_card',
                            cardId: c.id,
                          })
                        }
                        data-testid={`published-delete-${c.id}`}
                        aria-label="Supprimer la card publiée"
                        className="w-9 h-9 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-red-500 flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          );
        })()}

        {/* ===== Tab Likées (#411) ===== */}
        {tab === 'likees' && (
          <div data-testid="panel-likees">
            {likedLoading && (
              <div className="text-center text-[var(--t2m-ink-2)] text-[13px] py-12">
                Chargement…
              </div>
            )}

            {!likedLoading && liked.length === 0 && (
              <div className="flex flex-col items-center text-center pt-20 px-6 gap-3">
                <div className="w-16 h-16 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] flex items-center justify-center mb-1">
                  <Heart className="text-[var(--t2m-ink-3)]" size={24} />
                </div>
                <div className="text-[14.5px] font-medium text-[var(--t2m-ink)]">
                  Aucune card likée
                </div>
                <p className="text-[12.5px] text-[var(--t2m-ink-2)] leading-relaxed max-w-xs">
                  Tape sur le cœur d'une card sur la page Accueil pour
                  l'ajouter ici.
                </p>
              </div>
            )}

            {!likedLoading && liked.length > 0 && (
              <ul className="divide-y divide-[var(--t2m-line)]" data-testid="liked-list">
                {liked.map((c) => (
                  <li
                    key={`${c.card_kind}:${c.id}`}
                    data-testid={`liked-${c.id}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenPublished(c)}
                      data-testid={`liked-open-${c.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-90 active:opacity-80"
                    >
                      <PublishedThumb c={c} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] inline-flex items-center gap-1">
                            <TypeIcon type={c.type} />
                            {typeLabel(c.type)}
                          </span>
                        </div>
                        <div className="text-[14px] font-medium text-[var(--t2m-ink)] truncate mt-1">
                          {c.title?.trim() || c.preview_text?.trim() || 'Sans titre'}
                        </div>
                        <div className="flex items-center gap-3 text-[11.5px] text-[var(--t2m-ink-3)] mt-0.5">
                          <span>{formatRelative(c.published_at)}</span>
                          <span className="inline-flex items-center gap-1">
                            <Heart className="w-3 h-3 text-red-400/70" />
                            {c.like_count}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {c.view_count}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ===== Tab Music Card (#422) ===== */}
        {tab === 'music' && <MusicCardTab />}

        {/* ===== Tab Enregistrées (Pascal 2026-08-05) — déménagé du profil ===== */}
        {tab === 'enregistrees' && <SavedCardsTab />}

        {/* FAB "+" retiré sur /drafts (Pascal 2026-06-05) — création se fait
            via le bouton central + de la BottomNav. */}
      </main>

      <BottomNav />

      {deleteTarget && (
        <DeleteCardConfirm
          cardKind={deleteTarget.cardKind}
          cardId={deleteTarget.cardId}
          onCancel={() => setDeleteTarget(null)}
          onDeleted={() => {
            setPublished((prev) => prev.filter((x) => x.id !== deleteTarget.cardId));
            setDeleteTarget(null);
          }}
        />
      )}

      {boostTarget && (
        <BoostSheet
          target={boostTarget}
          onClose={() => setBoostTarget(null)}
          onBoosted={(until) => {
            setPublished((prev) =>
              prev.map((x) => (x.id === boostTarget.cardId ? { ...x, boosted_until: until } : x))
            );
            // #74 — reflète le boost sur la boutique (bouton → « Boosté ») : la cible est la card vitrine.
            setMyShops((prev) =>
              prev.map((x) => (x.vitrine_card_id === boostTarget.cardId ? { ...x, boosted_until: until } : x))
            );
            setBoostTarget(null);
          }}
        />
      )}
    </div>
  );
}

// Talk2Me #427 — Feuille de boost : choix du pack, débit Wallet.
function BoostSheet({
  target,
  onClose,
  onBoosted,
}: {
  target: { cardKind: 'direct_card' | 'post'; cardId: string; title: string; boostedUntil: number | null };
  onClose: () => void;
  onBoosted: (until: number) => void;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/wallet', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setBalance(typeof j?.balance_cents === 'number' ? j.balance_cents : 0))
      .catch(() => setBalance(0));
  }, []);

  const PACKS = [
    { key: '24h', label: '24 heures', cents: 200 },
    { key: '3j', label: '3 jours', cents: 500 },
    { key: '7j', label: '7 jours', cents: 1000 },
  ];

  const boost = async (pack: string) => {
    setBusy(pack);
    setError(null);
    try {
      const r = await fetch('/api/wallet/boost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_kind: target.cardKind, card_id: target.cardId, pack }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(
          j?.error === 'insufficient_funds'
            ? 'Solde insuffisant — recharge ton Wallet.'
            : 'Boost impossible.'
        );
        return;
      }
      onBoosted(j.boosted_until as number);
    } catch {
      setError('Erreur réseau.');
    } finally {
      setBusy(null);
    }
  };

  const active = target.boostedUntil && target.boostedUntil > Date.now();

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-[var(--t2m-paper)] rounded-t-2xl border-t border-[var(--t2m-line)] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <Rocket className="w-5 h-5 text-[var(--t2m-primary)]" />
          <span className="text-[15px] font-semibold text-[var(--t2m-ink)]">Booster « {target.title} »</span>
        </div>
        <p className="text-[12px] text-[var(--t2m-ink-2)] mb-1">
          Met ton post en avant dans le Hub (et le Shop) + il est favorisé par Léa.
        </p>
        <p className="text-[12px] text-[var(--t2m-ink-2)] mb-4">
          Solde : {balance === null ? '…' : formatMoney(balance)}
          {active ? ' · déjà boosté (le temps s’ajoute)' : ''}
        </p>
        <div className="space-y-2">
          {PACKS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => boost(p.key)}
              disabled={!!busy}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--t2m-primary)]/12 border border-[var(--t2m-primary)]/30 text-[var(--t2m-primary-deep)] active:scale-[0.98] transition disabled:opacity-50"
            >
              <span className="text-[14px] font-medium">{p.label}</span>
              <span className="text-[14px] font-semibold">
                {busy === p.key ? '…' : formatMoney(p.cents)}
              </span>
            </button>
          ))}
        </div>
        {error && <p className="text-[12px] text-red-500 mt-3">{error}</p>}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 py-2.5 rounded-xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] text-[13px]"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
