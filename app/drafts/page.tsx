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

import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import AlignedPostCard from '@/components/feed/AlignedPostCard';
import FeedMini, { type CardItem } from '@/components/feed/FeedMini';
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
import DeleteCardConfirm from '@/components/cards/DeleteCardConfirm';
import BoutiqueSheet from '@/components/feed/BoutiqueSheet';
import MusicCardTab from '@/components/cards/MusicCardTab';
import VideoCardTab from '@/components/cards/VideoCardTab';
import SavedCardsTab from '@/components/cards/SavedCardsTab';

// ----- types -----

interface DraftDto {
  id: string;
  preview_item?: unknown;
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
  /** Mosaïque Publiées (parité Brouillons) : le .card mappé en item feed → FeedMini. */
  preview_item?: unknown;
}

type TabKey = 'brouillons' | 'publiees' | 'likees' | 'music' | 'video' | 'shop' | 'boutiques' | 'enregistrees';

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
  // Talk2Me #422 — Music Card est le 1er onglet. Pascal 2026-08-29 : ouvrir Card = arriver sur
  // Music Card (le 1er onglet), aligné avec le natif.
  if (typeof window === 'undefined') return 'music';
  const h = window.location.hash.replace(/^#/, '');
  if (h === 'brouillons' || h === 'drafts') return 'brouillons';
  if (h === 'likees' || h === 'liked') return 'likees';
  if (h === 'publiees' || h === 'published') return 'publiees';
  if (h === 'shop') return 'shop';
  if (h === 'boutiques') return 'boutiques';
  if (h === 'music') return 'music';
  if (h === 'video') return 'video';
  if (h === 'enregistrees' || h === 'saved') return 'enregistrees';
  return 'music';
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

// Mini-aperçu VIVANT = le LECTEUR UNIQUE (AlignedPostCard) scalé → extrait dans le composant partagé
// components/feed/FeedMini (même aperçu pour Publiées/Likées/Boutiques/Enregistrées). Pascal 2026-08-29.


// ----- page -----

export default function MyCardsPage() {
  const router = useRouter();

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
  const [previewDraft, setPreviewDraft] = useState<DraftDto | null>(null);
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
  // Compteur de cards ENREGISTRÉES (Pascal 2026-08-29) : affiché sur l'onglet comme les autres.
  const [savedCount, setSavedCount] = useState(0);
  useEffect(() => {
    fetch('/api/cards/saved', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.cards)) setSavedCount(d.cards.length); })
      .catch(() => {});
  }, []);

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
  const [myShops, setMyShops] = useState<{ id: string; name: string; description?: string | null; kind?: string; vitrine_card_id?: string | null; boosted_until?: number | null; cover_url?: string | null; managed_for?: string | null; preview_item?: unknown }[]>([]);
  const [confirmDelShop, setConfirmDelShop] = useState<string | null>(null);
  // Aperçu boutique (clic sur une tuile de la mosaïque) : ouvre BoutiqueSheet ; le bouton Modifier
  // dedans mène à l'éditeur. Pascal 2026-08-29 (étape 2a).
  const [apercuShop, setApercuShop] = useState<string | null>(null);
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
    // Boutique : fusion étape 1 (Pascal 2026-08-30) → on ne rouvre PLUS l'ancien composer #428.
    // On envoie vers le SYSTÈME A (« Mes boutiques ») pour gérer/créer. Le vieux brouillon n'est PAS
    // supprimé (traité à la migration, étape 2).
    if (d.type === 'boutique') {
      router.push('/mes-boutiques');
      return;
    }
    router.push(`/creer/texte?draft=${d.id}`); // reprise dans TON composer (plus l'ancien /drafts/[id]/edit cadavre). Pascal 2026-08-26.
  };

  // ----- Handlers Publiées -----
  // Talk2Me #383 (Pascal 2026-06-05) — Tap aperçu → viewer dédié /mes-cards/<id>
  // où le user voit SA card sélectionnée + scroll = ses cards à lui uniquement
  // (pas le feed mixte /home). Doctrine verbatim Pascal :
  //   « je doit voir la card selevtionner et non pas atterir sur le hub ».
  const handleOpenPublished = (c: PublishedCardDto) => {
    // Talk2Me #427 — depuis l'onglet Shop, on ouvre le viewer scopé Shop (on ne
    // scrolle que les cards Shop). La pièce jointe détermine la catégorie.
    // Likées → viewer scopé LIKÉS (on scrolle tes likes, pas le Hub). Shop → scopé Shop. Pascal 2026-08-29.
    const q = tab === 'shop' ? '?cat=shop' : tab === 'likees' ? '?cat=liked' : '';
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
  const [dragX, setDragX] = useState(0); // mosaïque 2 colonnes → le drag suit le doigt en X aussi. Pascal 2026-08-29
  const dragStartY = useRef<number>(0);
  const dragStartX = useRef<number>(0);
  const dragStartIndex = useRef<number>(-1);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const startDrag = useCallback(
    (id: string) => {
      const idx = published.findIndex((p) => p.id === id);
      if (idx < 0) return;
      dragStartIndex.current = idx;
      setDraggedId(id);
      setHoverIndex(idx);
      setDragX(0);
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
    (id: string, e: React.PointerEvent<HTMLElement>) => {
      // Ignore les events sur les boutons enfant (Supprimer, etc.)
      const target = e.target as HTMLElement;
      if (target.closest('[data-no-drag]')) return;
      dragStartX.current = e.clientX;
      dragStartY.current = e.clientY;
      cancelLongPress();
      longPressTimer.current = setTimeout(() => {
        startDrag(id);
      }, LONG_PRESS_MS);
    },
    [cancelLongPress, startDrag]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!draggedId) {
        // Si on bouge avant la fin du long-press → annule (l'utilisateur scrolle). En grille 2D on
        // regarde X ET Y.
        if (longPressTimer.current) {
          const dx = Math.abs(e.clientX - dragStartX.current);
          const dy = Math.abs(e.clientY - dragStartY.current);
          if (dx > 8 || dy > 8) cancelLongPress();
        }
        return;
      }
      e.preventDefault();
      // Le fantôme suit le doigt en X ET Y (mosaïque). Pascal 2026-08-29.
      setDragX(e.clientX - dragStartX.current);
      setDragY(e.clientY - dragStartY.current);

      // hoverIndex 2D : la tuile dont le RECT contient le doigt → insérer AVANT si on est sur sa moitié
      // gauche, APRÈS sinon (ordre de lecture ligne par ligne).
      let newHover = dragStartIndex.current;
      for (let i = 0; i < published.length; i++) {
        const p = published[i];
        if (p.id === draggedId) continue;
        const el = itemRefs.current.get(p.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          newHover = e.clientX < r.left + r.width / 2 ? i : i + 1;
          break;
        }
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
    setDragX(0);
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
    setDragX(0);
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
        {/* Video Card (Pascal 2026-08-29, Phase 1) — jumeau vidéo de Music Card : films entiers gratuits YouTube (embed). */}
        <button
          role="tab"
          aria-selected={tab === 'video'}
          data-testid="tab-video"
          onClick={() => switchTab('video')}
          className={
            'flex-1 min-w-[88px] whitespace-nowrap inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors border ' +
            (tab === 'video'
              ? 'bg-[var(--t2m-ink)] border-[var(--t2m-ink)] text-white'
              : 'bg-[var(--t2m-wash)] border-[var(--t2m-line)] text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]')
          }
        >
          <VideoIcon className="w-3.5 h-3.5" />
          Video Card
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
          {savedCount > 0 && <span className="ml-1 text-[11px] text-[var(--t2m-ink-3)]">{savedCount}</span>}
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
            <div className="grid grid-cols-2 gap-2.5" data-testid="boutiques-grid">
              {myShops.map((s) => (
                <div key={s.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setApercuShop(s.id)}
                    className="block w-full text-left rounded-2xl overflow-hidden border border-[var(--t2m-line)] bg-[var(--t2m-paper)] active:opacity-90"
                  >
                    {s.preview_item
                      ? <FeedMini item={s.preview_item as CardItem} />
                      : <div className="aspect-[9/16] w-full bg-[var(--t2m-wash)] grid place-items-center text-[var(--t2m-ink-3)] overflow-hidden">
                          {s.cover_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={s.cover_url} alt="" className="w-full h-full object-cover" />
                            : (s.kind === 'plat_maison' ? <UtensilsCrossed size={30} /> : <ShoppingBag size={30} />)}
                        </div>}
                  </button>
                  {/* Nom SEULEMENT si pas encore publiée (la card vitrine porte déjà le nom → pas de doublon) */}
                  {!s.preview_item && (
                    <div className="px-1 pt-1.5"><div className="text-[13px] font-semibold text-[var(--t2m-ink)] truncate">{s.name}</div></div>
                  )}
                  {/* Badge « gérée pour X » (référent) — info absente de la card */}
                  {s.managed_for && (
                    <span className="absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/55 text-white backdrop-blur-md">de {s.managed_for}</span>
                  )}
                  {/* Overlays haut-droite : Booster (si publiée) + Supprimer */}
                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    {s.vitrine_card_id && (
                      <button type="button" aria-label="Booster ma boutique" onClick={() => setBoostTarget({ cardKind: 'direct_card', cardId: s.vitrine_card_id as string, title: s.name, boostedUntil: s.boosted_until ?? null })}
                        className={`w-8 h-8 rounded-full grid place-items-center backdrop-blur-md transition-colors ${s.boosted_until && s.boosted_until > Date.now() ? 'bg-[var(--t2m-primary)] text-white' : 'bg-black/55 text-white hover:bg-[var(--t2m-primary)]/80'}`}>
                        <Rocket className="w-4 h-4" />
                      </button>
                    )}
                    <button type="button" aria-label="Supprimer la boutique" onClick={() => setConfirmDelShop(s.id)}
                      className="w-8 h-8 rounded-full bg-black/55 text-white grid place-items-center backdrop-blur-md hover:bg-red-500/80 transition-colors"><Trash2 size={16} /></button>
                  </div>
                  {/* Confirmation suppression (overlay bas de la tuile) */}
                  {confirmDelShop === s.id && (
                    <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 bg-[var(--t2m-paper)]/95 backdrop-blur-md border border-[var(--t2m-line)] rounded-xl p-1.5 shadow-lg">
                      <button type="button" disabled={delShopBusy} onClick={() => deleteShop(s.id)} className="flex-1 h-8 rounded-lg bg-[#E86F00] text-white text-[12px] font-semibold active:scale-95 disabled:opacity-50">Supprimer</button>
                      <button type="button" onClick={() => setConfirmDelShop(null)} className="flex-1 h-8 rounded-lg border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] text-[12px] active:scale-95">Annuler</button>
                    </div>
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
              <div className="grid grid-cols-2 gap-2.5 p-3">
                {drafts.map((d) => (
                  <div key={d.id} data-testid={`draft-${d.id}`} className="relative">
                    <button type="button" data-testid={`draft-open-${d.id}`} onClick={() => setPreviewDraft(d)} className="block w-full text-left rounded-2xl overflow-hidden border border-[var(--t2m-line)] bg-[var(--t2m-paper)] active:opacity-90">
                      {d.preview_item
                        ? <FeedMini item={d.preview_item as CardItem} />
                        : <div className="aspect-[9/16] w-full bg-[var(--t2m-wash)] grid place-items-center text-[var(--t2m-ink-3)]"><TypeIcon type={d.type} /></div>}
                      <div className="px-2.5 py-2">
                        <div className="text-[13px] font-medium text-[var(--t2m-ink)] truncate">{d.title?.trim() || 'Sans titre'}</div>
                        <div className="text-[11px] text-[var(--t2m-ink-3)] mt-0.5">{formatRelative(d.updated_at)}</div>
                      </div>
                    </button>
                    <button type="button" onClick={() => handleDeleteDraft(d.id)} data-testid={`draft-delete-${d.id}`} aria-label="Supprimer le brouillon" className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white grid place-items-center backdrop-blur-md hover:bg-red-500/80 transition-colors"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
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
              <div className="grid grid-cols-2 gap-2.5 p-3" data-testid="published-list">
                {list.map((c, idx) => {
                  const isDragging = draggedId === c.id;
                  const isHovered = !!draggedId && !isDragging && hoverIndex !== null && idx === hoverIndex;
                  return (
                    <div
                      key={c.id}
                      ref={(el) => { if (el) itemRefs.current.set(c.id, el); else itemRefs.current.delete(c.id); }}
                      data-testid={`published-${c.id}`}
                      data-dragging={isDragging ? 'true' : 'false'}
                      onPointerDown={isShop ? undefined : (e) => handlePointerDown(c.id, e)}
                      onPointerMove={isShop ? undefined : handlePointerMove}
                      onPointerUp={isShop ? undefined : handlePointerUp}
                      onPointerCancel={isShop ? undefined : handlePointerCancel}
                      className={
                        'relative select-none ' +
                        (isDragging
                          ? 'z-30 touch-none'
                          : isHovered
                            ? 'touch-pan-y ring-2 ring-[var(--t2m-primary)] rounded-2xl'
                            : 'touch-pan-y')
                      }
                      style={isDragging ? { transform: `translate(${dragX}px, ${dragY}px) scale(1.04)`, transition: 'none', zIndex: 30, boxShadow: '0 12px 30px rgba(0,0,0,.25)' } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => { if (draggedId) return; handleOpenPublished(c); }}
                        data-testid={`published-open-${c.id}`}
                        className="block w-full text-left rounded-2xl overflow-hidden border border-[var(--t2m-line)] bg-[var(--t2m-paper)] active:opacity-90"
                      >
                        {/* La tuile = LE POST (rendu réel via le lecteur unique) — auteur, légende, likes,
                            vues, actions sont DÉJÀ dessus. Pas de bloc texte en dessous (doublon). Pascal 2026-08-29. */}
                        {c.preview_item
                          ? <FeedMini item={c.preview_item as CardItem} />
                          : <div className="aspect-[9/16] w-full bg-[var(--t2m-wash)] grid place-items-center text-[var(--t2m-ink-3)]"><TypeIcon type={c.type} /></div>}
                      </button>
                      {/* Overlays haut-droite : Booster + Supprimer (comme la corbeille des Brouillons) */}
                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        <button type="button" data-no-drag onClick={() => setBoostTarget({ cardKind: c.card_kind || 'direct_card', cardId: c.id, title: c.title?.trim() || c.preview_text?.trim() || 'ce post', boostedUntil: c.boosted_until ?? null })} aria-label="Booster la card" className="w-8 h-8 rounded-full bg-black/55 text-white grid place-items-center backdrop-blur-md hover:bg-[var(--t2m-primary)]/80 transition-colors"><Rocket className="w-4 h-4" /></button>
                        <button type="button" data-no-drag onClick={() => setDeleteTarget({ cardKind: c.card_kind || 'direct_card', cardId: c.id })} data-testid={`published-delete-${c.id}`} aria-label="Supprimer la card publiée" className="w-8 h-8 rounded-full bg-black/55 text-white grid place-items-center backdrop-blur-md hover:bg-red-500/80 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
              <div className="grid grid-cols-2 gap-2.5 p-3" data-testid="liked-list">
                {liked.map((c) => (
                  <button
                    key={`${c.card_kind}:${c.id}`}
                    type="button"
                    onClick={() => handleOpenPublished(c)}
                    data-testid={`liked-open-${c.id}`}
                    className="block w-full text-left rounded-2xl overflow-hidden border border-[var(--t2m-line)] bg-[var(--t2m-paper)] active:opacity-90"
                  >
                    {/* La tuile = LE POST liké (rendu réel, lecteur unique). Tap → viewer scopé LIKÉS. Pascal 2026-08-29. */}
                    {c.preview_item
                      ? <FeedMini item={c.preview_item as CardItem} />
                      : <div className="aspect-[9/16] w-full bg-[var(--t2m-wash)] grid place-items-center text-[var(--t2m-ink-3)]"><TypeIcon type={c.type} /></div>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== Tab Music Card (#422) ===== */}
        {tab === 'music' && <MusicCardTab />}

        {/* ===== Tab Video Card (Pascal 2026-08-29, Phase 1) — films entiers gratuits YouTube ===== */}
        {tab === 'video' && <VideoCardTab />}

        {/* ===== Tab Enregistrées (Pascal 2026-08-05) — déménagé du profil ===== */}
        {tab === 'enregistrees' && <SavedCardsTab />}

        {/* FAB "+" retiré sur /drafts (Pascal 2026-06-05) — création se fait
            via le bouton central + de la BottomNav. */}
      </main>

      {previewDraft && (
        <div className="fixed inset-0 z-[100] bg-[var(--t2m-feed-bg)] flex flex-col">
          <div className="flex items-center justify-between px-2.5 h-14 bg-[var(--t2m-paper)]/90 backdrop-blur-xl border-b border-[var(--t2m-line)] shrink-0">
            <button type="button" onClick={() => setPreviewDraft(null)} aria-label="Fermer" className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink)] text-[20px]">✕</button>
            <span className="text-[13px] font-medium text-[var(--t2m-ink-2)]">Aperçu du brouillon</span>
            <button type="button" data-testid="draft-edit" onClick={() => handleResumeDraft(previewDraft)} className="px-4 h-9 rounded-full bg-[var(--t2m-primary)] text-white text-[13px] font-bold inline-flex items-center gap-1.5">✏️ Modifier</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {previewDraft.preview_item
              ? <AlignedPostCard item={previewDraft.preview_item as CardItem} />
              : <div className="min-h-full grid place-items-center p-8 text-center text-[var(--t2m-ink-2)] text-[13px]">Aperçu indisponible — appuie sur « Modifier » pour continuer l&apos;édition.</div>}
          </div>
        </div>
      )}

      <BottomNav />

      {/* Aperçu boutique (clic mosaïque) = MÊME vue que le feed/partage (BoutiqueSheet). Le bouton
          « Modifier ma boutique » (owner) mène à l'éditeur. Pascal 2026-08-29 (étape 2a). */}
      {apercuShop && (
        <BoutiqueSheet
          shopId={apercuShop}
          onClose={() => setApercuShop(null)}
          onEdit={() => { const id = apercuShop; setApercuShop(null); router.push(`/ma-boutique/${id}`); }}
        />
      )}

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
          Met ton post en avant dans le Hub (et le Shop) + il est favorisé par l’IA.
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
