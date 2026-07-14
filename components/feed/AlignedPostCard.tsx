'use client';

/**
 * AlignedPostCard — POSE du travail de Gemini (design « L'Éclat du Quotidien »,
 * hub-gemini.html) + actions RÉELLES branchées : like (POST/DELETE /api/cards/[id]/like),
 * commentaires (event ttm:comments:open → CommentsHost global), partage (navigator.share).
 */

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { FeedItem } from './PostFeed';
import SuperCardView from '@/components/cards/SuperCardView';
import BoutiqueSheet from '@/components/feed/BoutiqueSheet';
import MusicDiscCard from '@/components/cards/MusicDiscCard';
import PhotoTextSwiper from '@/components/feed/PhotoTextSwiper';
import { Caption } from '@/components/feed/rich-text';
import CardDevButton, { useDevMode, useIsAdmin } from '@/components/dev/CardDevButton';
import { fromYouTube, fromPlace, fromRecipe } from '@/lib/cards/adapt';
import { parseCard, type SuperCard } from '@/lib/cards/supercard';
import { Heart, ChatCircle, ShareNetwork, BookmarkSimple, Eye, Microphone } from '@phosphor-icons/react';
import YouTubeTimedPlayer from '@/components/feed/YouTubeTimedPlayer';
import KaraokeLyrics from '@/components/feed/KaraokeLyrics';
import KaraokeHarvester from '@/components/feed/KaraokeHarvester';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';

// Card OS : le feed LIT le `.card`, POINT. Plus de reconstruction (fromPost supprimé).
// Pas de `.card` lisible → null → on affiche « illisible », on ne bricole pas.
function readAlignedCard(it: { dotcard?: string | null }): SuperCard | null {
  const dc = it.dotcard;
  if (typeof dc === 'string' && dc) {
    const r = parseCard(dc);
    if (r.ok && r.card) return r.card;
  }
  return null;
}

const BADGE: Record<string, { label: string; bg: string; color: string }> = {
  post: { label: 'PHOTO', bg: 'rgba(255,127,17,0.1)', color: 'var(--t2m-primary)' },
  image_card: { label: 'PHOTO', bg: 'rgba(255,127,17,0.1)', color: 'var(--t2m-primary)' },
  video_card: { label: 'VIDÉO', bg: 'rgba(124,92,255,0.1)', color: 'var(--t2m-accent)' },
  boutique: { label: 'BOUTIQUE', bg: 'rgba(124,92,255,0.1)', color: 'var(--t2m-accent)' },
};
const actionStyle = (color: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'Inter',sans-serif", fontSize: 14, color, background: 'none', border: 'none', padding: 0, cursor: 'pointer' });

// Badge d'ORIGINE (feed unique) — mappage partagé (header Cartes + verre poli Long).
const ORIGIN_BADGE: Record<string, { l: string; bg: string; c: string }> = {
  amis: { l: 'Amis', bg: 'rgba(124,92,255,0.12)', c: 'var(--t2m-accent)' },
  autour: { l: 'Autour', bg: 'rgba(0,126,58,0.12)', c: '#007E3A' },
  tout: { l: 'Tout', bg: 'rgba(106,117,133,0.12)', c: 'var(--t2m-ink-2)' },
};
// Badge « verre poli » posé SUR la photo (mode Long immersif).
const glassBadge: React.CSSProperties = { background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', border: '1px solid rgba(255,255,255,.45)', color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.5)', fontSize: 12, fontWeight: 600, padding: '4px 8px', borderRadius: 8, alignSelf: 'flex-start' };
// Prix formaté — même rendu que SuperCardView.priceLabel (MGA, aucune conversion silencieuse).
const fmtPrice = (p?: { amount?: number; currency?: string }): string => (p?.amount ? `${p.amount.toLocaleString('fr')} ${p.currency || ''}`.trim() : '');

/** Un bloc de texte d'article : sous-titre (`h:true`) ou paragraphe (`h:false`). */
type TextBlock = { h: boolean; text: string };

/**
 * Paginateur DÉDIÉ aux articles enrichis (vidéo ET photo/Litchi). Pascal 2026-07-09. Gère les DEUX
 * structures Markdown : titre EN GRAS suivi de son paragraphe (même bloc), ET titre ISOLÉ sur sa
 * propre ligne vide (Litchi : « Généralités », « Bananes »…), y compris titres consécutifs. Règles :
 *  1) le titre-légende en tête (= la caption) est retiré ; 2) chaque titre reste COLLÉ au début de
 *  son paragraphe (jamais orphelin en fin de page) ; 3) on REMPLIT les pages jusqu'à `perPage` en
 *  packant plusieurs blocs ; 4) les longs paragraphes sont coupés par phrases. Lisible, plein.
 */
function videoTextPages(text: string, caption?: string, perPage = 340): TextBlock[][] {
  const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\s+$/, '').trim();
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
  const looksHead = (l: string) => l.length <= 46 && !/[.!?:;,]$/.test(l) && l.split(/\s+/).length <= 7;
  const whole = String(text || '').replace(/\r/g, '');
  if (!whole.trim()) return [];
  const cap = clean(String(caption || ''));
  const capN = norm(cap);

  let blocks = whole.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  // Titre-légende en tête (bloc identique à la caption) → retiré (déjà affiché ailleurs).
  if (blocks.length && capN && norm(clean(blocks[0])).startsWith(capN.slice(0, Math.min(capN.length, 24)))) blocks = blocks.slice(1);

  // Sections {titre?, corps}. Un titre ISOLÉ (bloc = 1 ligne courte) s'attache au paragraphe suivant.
  type Sec = { heading?: string; body: string };
  const secs: Sec[] = [];
  let pending: string | null = null;
  for (const raw of blocks) {
    const lines = raw.split(/\n/).map((l) => clean(l)).filter(Boolean);
    if (!lines.length) continue;
    const first = lines[0];
    if (lines.length === 1 && looksHead(first)) { if (pending) secs.push({ heading: pending, body: '' }); pending = first; continue; }
    if (lines.length > 1 && looksHead(first)) { secs.push({ heading: first, body: lines.slice(1).join(' ') }); pending = null; continue; }
    secs.push({ heading: pending || undefined, body: lines.join(' ') }); pending = null;
  }
  if (pending) secs.push({ heading: pending, body: '' });

  // Aplatir : titre-block + morceaux de paragraphe (coupés par phrases, ≤ perPage).
  const flat: TextBlock[] = [];
  for (const sec of secs) {
    if (sec.heading) flat.push({ h: true, text: sec.heading });
    let buf = '';
    for (const s of sec.body.split(/(?<=[.!?])\s+/).filter(Boolean)) {
      if (buf && buf.length + s.length + 1 > perPage) { flat.push({ h: false, text: buf.trim() }); buf = s; }
      else buf = buf ? buf + ' ' + s : s;
    }
    if (buf.trim()) flat.push({ h: false, text: buf.trim() });
  }

  // Packer : remplir chaque page jusqu'à perPage.
  const pages: TextBlock[][] = [];
  let page: TextBlock[] = [];
  let len = 0;
  for (const blk of flat) {
    const bl = blk.text.length + (blk.h ? 30 : 0);
    if (len > 0 && len + bl > perPage) { pages.push(page); page = []; len = 0; }
    page.push(blk); len += bl;
  }
  if (page.length) pages.push(page);
  // Jamais un titre SEUL en fin de page → le pousser en tête de la page suivante.
  for (let i = 0; i < pages.length - 1; i++) {
    if (pages[i].length && pages[i][pages[i].length - 1].h) {
      pages[i + 1].unshift(pages[i].pop() as TextBlock);
      if (pages[i].length === 0) { pages.splice(i, 1); i--; }
    }
  }
  return pages.length ? pages : [[{ h: false, text: clean(whole) }]];
}

/** Rend un texte avec des LIENS markdown `[label](/chemin)` cliquables (page-entité vivante : relier
 *  deux posts entre eux). Le reste = texte brut. `stopPropagation` pour ne pas déclencher le swipe. */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Liens markdown [txt](url), #hashtags (→ recherche) et @mentions (→ profil /u/pseudo) → tokens cliquables.
  // Pascal 2026-07-12 : « les hashtags ne sont pas des hashtags, ni le @ pour tagger ».
  const re = /\[([^\]]+)\]\(([^)]+)\)|(#[\p{L}\p{N}_]+)|(@[\p{L}\p{N}_]+)/gu;
  const tokStyle: React.CSSProperties = { color: '#8ab4ff', fontWeight: 600 };
  let last = 0, k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <a key={k++} href={m[2]} onClick={(e) => e.stopPropagation()}
          style={{ ...tokStyle, textDecoration: 'underline', textUnderlineOffset: 2 }}>{m[1]}</a>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <a key={k++} href={`/decouvrir?q=${encodeURIComponent(m[3])}`} onClick={(e) => e.stopPropagation()}
          style={tokStyle}>{m[3]}</a>,
      );
    } else if (m[4] !== undefined) {
      out.push(
        <a key={k++} href={`/u/${encodeURIComponent(m[4].slice(1))}`} onClick={(e) => e.stopPropagation()}
          style={tokStyle}>{m[4]}</a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Une card est-elle une DEMI-card ? (YouTube ou petite boutique ≤8). Le feed s'en sert pour composer les cadres. */
export function isHalfItem(it: { dotcard?: string | null }): boolean {
  const card = readAlignedCard(it);
  return !!card && (!!card.video?.embed || (!!card.items?.length && card.items.length <= 8));
}

/** Vidéo PLEIN ÉCRAN qui joue en boucle quand elle est en vue et se coupe au scroll (Pascal 2026-07-12). */
function AutoplayVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0.55) {
          v.muted = false;
          // Essaie AVEC le son ; si le navigateur bloque (pas encore de geste), joue en muet
          // (mieux qu'une vidéo noire) — le son revient au 1er scroll/tap. Pascal 2026-07-12.
          v.play?.().catch(() => { v.muted = true; v.play?.().catch(() => {}); });
        } else v.pause?.();
      }
    }, { threshold: [0, 0.55, 1] });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} src={src} loop playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000', display: 'block' }} />;
}

export default function AlignedPostCard({ item, forceSize, variant = 'cards' }: { item: FeedItem; forceSize?: 'full' | 'half'; variant?: 'cards' | 'long' }) {
  const it = item as unknown as {
    id: string; kind: string; caption?: string | null; text?: string | null; user_id?: string;
    media_url?: string | null; dotcard?: string | null; likes?: number; comment_count?: number; liked_by_me?: boolean;
    views?: number; is_owner?: boolean; origin?: 'amis' | 'autour' | 'tout';
    enrichment?: { snippet: string; contributors: number; path: string; article?: string };
    // Paroles synchro (karaoké) servies par /api/posts (attachLyrics) → slide « à côté » de la vidéo.
    lyrics?: { synced: { t: number; text: string }[]; calibrated?: boolean } | null;
    messages?: Array<{ id: string; role?: string; content?: string; ai_name?: string | null;
      youtube?: import('@/lib/chat-types').YouTubeCardData | null;
      places?: import('@/lib/chat-types').PlaceCardData[] | null;
      recipe?: import('@/lib/chat-types').RecipeCardData | null }>;
    author?: { display_name?: string; username?: string; avatar_url?: string | null } | null;
  };
  // POST-CONVERSATION (Léa) : messages[] avec cards → rendus par la machine claire.
  const msgs = Array.isArray(it.messages) && it.messages.length > 0 ? it.messages : null;
  const a = it.author || {};
  const who = a.display_name || a.username || 'Utilisateur';
  const rawCaption = it.caption || it.text || '';
  // SALLE 3D : la card d'invitation porte le marqueur [PIECE3D] dans sa caption.
  const isPiece = it.kind !== 'video_card' && rawCaption.includes('[PIECE3D]');
  // Les marqueurs techniques ne s'affichent JAMAIS (fix « le tag qui fuit »).
  const caption = rawCaption.replace(/\s*\[(?:PIECE3D|PANO360|LEA360)\]|\s*\[VITRINE:[^\]]*\]/g, '').trim();
  // Une VITRINE boutique porte [VITRINE:id] dans son caption → badge BOUTIQUE (pas PHOTO). (Pascal 2026-07-06)
  const isBoutiqueVitrine = rawCaption.includes('[VITRINE:');
  // b (le badge type) est calculé PLUS BAS (après topEmbed/musicAudio) pour distinguer une vidéo/son
  // d'une card générique. Pascal 2026-07-13.
  const media = it.media_url || '';
  const cardKind = it.kind === 'post' ? 'post' : 'direct_card';

  // Fix TEMPORAIRE (Pascal 2026-07-03) : une card musique (attached_audio youtube) = DISQUE
  // dans le feed clair, en attendant le passage full .card.
  const musicAudio = (() => {
    const raw = (it as { attached_audio_json?: string | null }).attached_audio_json;
    if (!raw) return null;
    try {
      const a = JSON.parse(raw) as { type?: string; title?: string; author?: { name?: string }; thumbnail_url?: string; external_url?: string; description?: string };
      if (a?.type !== 'audio') return null;
      const vid = (String(a.external_url || '').match(/[?&]v=([A-Za-z0-9_-]{6,})/) || String(a.thumbnail_url || '').match(/\/vi\/([A-Za-z0-9_-]{6,})\//) || [])[1];
      if (!vid) return null;
      return { video_id: vid, title: a.title || 'Musique', artist: a.author?.name || a.description || '', thumbnail: a.thumbnail_url || '' };
    } catch { return null; }
  })();

  // ── Mode Long immersif (image plein cadre, tout par-dessus) — choix du RENDU (Pascal 2026-07-06) ──
  // On lit le `.card` UNE fois (réutilisé par la branche par défaut) pour détecter une boutique.
  const alignedCard = readAlignedCard(it);
  const originInfo = it.origin ? ORIGIN_BADGE[it.origin] : null;
  // En mode Photo, la boutique reste IMMERSIVE (pas une carte au milieu du feed photo).
  // LECTEUR DU HAUT = embed vidéo propre OU, à défaut, le CLIP YouTube DU SON attaché (Pascal
  // 2026-07-11 : le son sert de fond sonore + image, contenu enrichi dessous).
  const videoEmbed = alignedCard?.video?.embed || '';
  const sonEmbed = musicAudio?.video_id ? `https://www.youtube.com/embed/${musicAudio.video_id}?modestbranding=1&rel=0` : '';
  const topEmbed = videoEmbed || sonEmbed;
  // KARAOKÉ : un son YouTube (pas une vraie vidéo) AVEC paroles synchro → lecteur temps-réel +
  // slide gauche « paroles qui défilent ». Pascal 2026-07-13.
  const karaokeSynced = it.lyrics?.synced || [];
  const isKaraoke = !!(sonEmbed && !videoEmbed && karaokeSynced.length && musicAudio?.video_id);
  // BADGE TYPE : une carte avec un embed vidéo OU un son YouTube = VIDÉO (pas "CARD"). Le défaut
  // "CARD" ne doit servir qu'aux cartes vraiment génériques. Pascal 2026-07-13.
  const b = isPiece
    ? { label: 'SALLE 3D', bg: 'rgba(255,127,17,0.1)', color: 'var(--t2m-primary)' }
    : isBoutiqueVitrine
    ? { label: 'BOUTIQUE', bg: 'rgba(124,92,255,0.1)', color: 'var(--t2m-accent)' }
    : (topEmbed || musicAudio)
    ? { label: 'VIDÉO', bg: 'rgba(124,92,255,0.1)', color: 'var(--t2m-accent)' }
    : (BADGE[it.kind] || { label: 'CARD', bg: 'rgba(47,52,58,0.1)', color: 'var(--t2m-ink)' });
  // Calé = un offset OCR→vidéo a été mesuré → notre slide passe en karaoké synchro + on coupe le CC
  // natif. Sinon → CC natif (karaoké de secours) + notre slide en lecture + on RÉCOLTE le calage.
  const karaokeCalibrated = !!it.lyrics?.calibrated;
  // PRÉCÉDENCE (Pascal 2026-07-11) : si la card a un LECTEUR (vidéo/son) → VIDÉO ENRICHIE, MÊME si
  // elle porte une boutique — la boutique devient alors une SLIDE dans le swiper (pas un rendu
  // boutique plein écran). isLongBoutique ne reste que pour une card boutique SANS vidéo/son.
  const isLongVideo = variant === 'long' && !msgs && !isPiece && (!!topEmbed || (it.kind === 'video_card' && !!media));
  // PHOTO + BOUTIQUE (Pascal 2026-07-14) : un post PHOTO (mon image) avec des produits/annonces
  // attachés, SANS son ni vidéo → SPLIT 50/50 : MA photo en haut, la boutique en bas. Ma photo n'est
  // PAS une devanture rognée en 16/9. Distinct d'une vraie vitrine boutique (isBoutiqueVitrine).
  const isPhotoPlusShop = variant === 'long' && !msgs && !isLongVideo && !isPiece && !musicAudio && !isBoutiqueVitrine && it.kind !== 'video_card' && !!media && !!alignedCard && !!alignedCard.items?.length;
  const isLongBoutique = variant === 'long' && !msgs && !isLongVideo && !isPhotoPlusShop && !!alignedCard && !!alignedCard.items?.length;
  const isLongPhoto = variant === 'long' && !isLongBoutique && !isPhotoPlusShop && !isLongVideo && !msgs && !isPiece && !musicAudio && !isBoutiqueVitrine && it.kind !== 'video_card' && !!media;
  const longImmersive = isLongBoutique || isLongVideo || isLongPhoto || isPhotoPlusShop;
  // Boutique : id de vitrine pour ouvrir la boutique complète (route /boutique/[id]).
  const vitrineId = (rawCaption.match(/\[VITRINE:([^\]]+)\]/) || [])[1] || '';

  // ── actions réelles ──
  const [liked, setLiked] = useState(!!it.liked_by_me);
  const [likes, setLikes] = useState(it.likes ?? 0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [views, setViews] = useState(it.views ?? 0);
  const [toast, setToast] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // #74 — Taper la carte boutique → ouvre BoutiqueSheet (aperçu + achat). (Pascal 2026-07-11)
  const [shopOpen, setShopOpen] = useState(false);
  // Boutique résolue depuis un PRODUIT attaché (post photo+boutique, pas de tag [VITRINE:]). Pascal 2026-07-14.
  const [shopIdForBuy, setShopIdForBuy] = useState<string | null>(null);
  const openProductShop = (productId?: string) => {
    if (!productId) { setShopOpen(true); return; }
    fetch(`/api/simple-shop/item-shop?id=${encodeURIComponent(productId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.shopId) { setShopIdForBuy(d.shopId as string); setShopOpen(true); } })
      .catch(() => {});
  };
  // Swiper photo↔texte (mode photo enrichi) : page active pour les dots de navigation.
  const [photoPage, setPhotoPage] = useState(0);
  const ytTimeRef = useRef(0); // temps de lecture YouTube (karaoké) — alimenté sans re-render
  const ytDurRef = useRef(0);  // durée de la vidéo (gate de complétude du scan karaoké)
  const photoPagesCount = it.enrichment?.article ? 1 + videoTextPages(it.enrichment.article, it.caption || it.text || '', 520).length : 0;
  const canSave = cardKind === 'direct_card' && !it.is_owner;

  // 🔖 Enregistrer (POST /api/cards/save) — redonné après bascule feed→machine.
  const toggleSave = useCallback(async () => {
    if (saving) return;
    if (saved) { setToast('Va dans Cards enregistrées'); setTimeout(() => setToast(null), 1600); return; }
    if (!canSave) { setToast('Enregistrement indisponible ici'); setTimeout(() => setToast(null), 1600); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/cards/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ card_kind: 'image_card', card_data: { id: it.id, kind: cardKind } }) });
      setToast(res.ok ? 'Enregistré' : 'Échec');
      if (res.ok) setSaved(true);
    } catch { setToast('Erreur réseau'); } finally { setSaving(false); setTimeout(() => setToast(null), 1600); }
  }, [saving, saved, canSave, it.id, cardKind]);

  // 👁 Vues : IntersectionObserver >2s → +1 (1×/card/session).
  useEffect(() => {
    // Le PROPRIÉTAIRE ne compte JAMAIS de vue sur son propre post (Pascal 2026-07-12 : « ce n'est pas logique »).
    if (it.is_owner) return;
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const key = `talk2me:viewed:${cardKind}:${it.id}`;
    try { if (sessionStorage.getItem(key) === '1') return; } catch { /* */ }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0.5) {
          if (timer) continue;
          timer = setTimeout(() => {
            try { sessionStorage.setItem(key, '1'); } catch { /* */ }
            fetch(`/api/cards/${encodeURIComponent(it.id)}/views?kind=${cardKind}`, { method: 'POST', credentials: 'include' }).catch(() => {});
            setViews((v) => v + 1);
          }, 2000);
        } else if (timer) { clearTimeout(timer); timer = null; }
      }
    }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => { if (timer) clearTimeout(timer); io.disconnect(); };
  }, [cardKind, it.id]);

  // Mode INSPECTEUR (dev mode + admin) → loupe orange dans la rangée sociale, à gauche de « Voir ». Pascal 2026-07-12.
  const inspectOn = useDevMode();
  const isAdmin = useIsAdmin();
  const showInspect = inspectOn && isAdmin;

  const toggleLike = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1)); // optimiste
    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(it.id)}/like?kind=${cardKind}`, { method: next ? 'POST' : 'DELETE' });
      const d = await res.json().catch(() => null);
      if (d && typeof d.likes === 'number') setLikes(d.likes);
      if (d && typeof d.liked === 'boolean') setLiked(d.liked);
    } catch {
      setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); // rollback
    } finally { setBusy(false); }
  }, [busy, liked, it.id, cardKind]);

  const openComments = useCallback(() => {
    window.dispatchEvent(new CustomEvent('ttm:comments:open', { detail: { kind: cardKind, id: it.id } }));
  }, [cardKind, it.id]);

  const share = useCallback(async () => {
    const url = `${location.origin}/home`;
    try {
      const nav = navigator as Navigator & { share?: (d: { url: string; title?: string }) => Promise<void> };
      if (nav.share) await nav.share({ url, title: caption || 'T2M' });
      else { await navigator.clipboard?.writeText(url); }
    } catch { /* annulé */ }
  }, [caption]);

  // Entrer dans la salle 3D → stream la scène /piece (retour PILE sur ce post).
  const enterRoom = useCallback(() => {
    try { sessionStorage.setItem('t2m_piece_return', it.id); } catch { /* */ }
    window.location.assign('/piece?u=' + (it.user_id || ''));
  }, [it.id, it.user_id]);

  // En mode PHOTO (plein écran) : PAS d'effet whileTap/entrée (Framer Motion scale) — le
  // rétrécissement découvrait des bandes blanches autour du post. Pascal 2026-07-08.
  return (
    <motion.div ref={cardRef}
      initial={longImmersive ? false : { opacity: 0, y: 28, scale: 0.96 }}
      whileInView={longImmersive ? undefined : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-30px' }}
      whileTap={longImmersive ? undefined : { scale: 0.98 }}
      transition={longImmersive ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={variant === 'long'
        // Style « Long » immersif : plein largeur, image bord-à-bord (padding 0 quand l'image
        // porte tout), séparé par un épais filet. Les types non-immersifs gardent leur padding.
        ? { position: 'relative', backgroundColor: 'var(--t2m-card-bg)', padding: longImmersive ? 0 : '16px 16px 20px', overflow: longImmersive ? 'hidden' : undefined, display: 'flex', flexDirection: 'column', borderBottom: 'none', scrollSnapAlign: 'start', scrollSnapStop: 'always' }
        // Style « Cartes » (actuel) : card blanche arrondie + ombre douce.
        : { position: 'relative', backgroundColor: 'var(--t2m-card-bg)', border: '1px solid var(--t2m-card-border)', borderRadius: 'var(--t2m-card-radius)', boxShadow: 'var(--t2m-card-shadow)', padding: 'var(--t2m-card-pad)', display: 'flex', flexDirection: 'column', marginBottom: 'var(--t2m-card-gap)' }}>
      {/* en-tête auteur — masqué en Long immersif (l'auteur est posé SUR l'image). */}
      {!longImmersive && (
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        {a.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={a.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', marginRight: 12, flexShrink: 0 }} />
          : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(45deg,#FF7F11,#7C5CFF)', marginRight: 12, flexShrink: 0 }} />}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 16, color: 'var(--t2m-ink)' }}>{who}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 500, fontSize: 12, padding: '4px 8px', borderRadius: 8, alignSelf: 'flex-start', backgroundColor: b.bg, color: b.color }}>{b.label}</div>
            {originInfo && <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 12, padding: '4px 8px', borderRadius: 8, alignSelf: 'flex-start', backgroundColor: originInfo.bg, color: originInfo.c }}>{originInfo.l}</div>}
          </div>
        </div>
      </div>
      )}

      {isPhotoPlusShop && alignedCard ? (
        /* ── PHOTO + BOUTIQUE (Pascal 2026-07-14) : MA photo prend TOUT l'écran ; la boutique flotte
           PAR-DESSUS en carte(s) produit (au-dessus des boutons, JAMAIS dans le menu du bas). Tap →
           BoutiqueSheet (aperçu + Acheter qui marche, boutique résolue depuis le produit). ── */
        (() => {
          const products = (alignedCard.items || []).slice(0, 4);
          return (
            <div style={{ position: 'relative', width: '100%', height: '100svh', overflow: 'hidden', background: '#000' }}>
              {/* MA PHOTO — plein écran */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media} alt={caption || 'Photo'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.30) 34%, rgba(0,0,0,0) 60%)', pointerEvents: 'none' }} />

              {/* BOUTIQUE EN OVERLAY — carte(s) produit flottantes, posées SUR la photo, AU-DESSUS du
                  bloc auteur + légende + actions (ne retombe plus sur la description). Pascal 2026-07-14. */}
              <div style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom) + 210px)', display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', zIndex: 5 }}>
                {products.map((p, i) => (
                  <button key={p.id || i} type="button" onClick={() => openProductShop(p.id)}
                    style={{ flex: products.length === 1 ? '1 1 auto' : '0 0 78%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: 8, borderRadius: 16, border: '1px solid rgba(255,255,255,.30)', background: 'rgba(20,18,28,.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 10px 30px rgba(0,0,0,.4)', cursor: 'pointer' }}>
                    {p.images?.[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.images[0]} alt="" style={{ width: 52, height: 52, borderRadius: 11, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || 'Article'}</div>
                      {fmtPrice(p.price) && <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t2m-primary)', marginTop: 2 }}>{fmtPrice(p.price)}</div>}
                    </div>
                    <span style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 11, background: 'var(--t2m-primary)', color: '#fff', fontWeight: 800, fontSize: 13 }}>Acheter</span>
                  </button>
                ))}
              </div>

              {/* AUTEUR + LÉGENDE + ACTIONS — fixes en bas, sur le dégradé */}
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 'calc(env(safe-area-inset-bottom) + 76px)', zIndex: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  {a.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={a.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />
                    : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(45deg,var(--t2m-primary),var(--t2m-accent))', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 16, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.55)' }}>{who}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      <span style={glassBadge}>PHOTO</span>
                      {originInfo && <span style={glassBadge}>{originInfo.l}</span>}
                    </div>
                  </div>
                </div>
                {caption && <Caption text={caption} collapsedLines={1} style={{ margin: '8px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#fff', lineHeight: 1.45, textShadow: '0 1px 4px rgba(0,0,0,.6)' }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
                  <button type="button" onClick={toggleLike} disabled={busy} style={actionStyle(liked ? 'var(--t2m-primary)' : '#fff')}><Heart size={22} weight={liked ? 'fill' : 'regular'} /> {likes}</button>
                  <button type="button" onClick={openComments} style={actionStyle('#fff')}><ChatCircle size={22} weight="regular" /> {it.comment_count ?? 0}</button>
                  <button type="button" onClick={share} style={actionStyle('#fff')}><ShareNetwork size={22} weight="regular" /> Partager</button>
                  <button type="button" onClick={toggleSave} disabled={saving} style={actionStyle(saved ? 'var(--t2m-primary)' : '#fff')}><BookmarkSimple size={22} weight={saved ? 'fill' : 'regular'} /></button>
                  <span style={{ ...actionStyle('rgba(255,255,255,.9)'), marginLeft: 'auto', cursor: 'default' }}><Eye size={22} weight="regular" /> {views}</span>
                </div>
              </div>
            </div>
          );
        })()
      ) : isLongBoutique && alignedCard ? (
        /* ── BOUTIQUE en Photo immersif = CONFORME ARTÉFACT : une COVER (devanture) en haut avec
           avatar + nom boutique + badge BOUTIQUE posés dessus ; puis grille produits 2 col JOINTIVE
           (nom + prix en HAUT-GAUCHE sur l'image) ; bouton « Voir la boutique » verre poli à cheval en bas. ── */
        (() => {
          const card = alignedCard;
          // EMPILÉE (Pascal 2026-07-09) : 2 articles max, empilés pleine largeur, pour remplir
          // l'écran. Devanture = taille FIXE inchangée. « Voir la boutique » pour le reste.
          // DEUX layouts SÉPARÉS selon le nb d'articles (Pascal 2026-07-09) :
          //  • ≤2 articles (Nirina) = EMPILÉE plein écran (2 articles même taille).
          //  • >2 articles = grille d'origine INCHANGÉE (2 col, rangées fixes) — pas touchée.
          const nb = (card.items || []).length;
          const deux = nb <= 2;
          const products = (card.items || []).slice(0, deux ? 2 : 4);
          const cover = card.images?.[0] || media || products[0]?.images?.[0] || '';
          const shopName = card.title || who;
          // Taper la carte boutique → APERÇU (SuperCardView boutique). Pascal VEUT cet aperçu.
          // L'« étape en trop » n'est PAS l'aperçu : c'est qu'après, Acheter ré-ouvrait une 2e
          // boutique (BoutiqueSheet). Corrigé plus bas : depuis l'aperçu, Acheter = paiement DIRECT.
          const openShop = () => setShopOpen(true);
          const overlay = (p: { title?: string; price?: { amount?: number; currency?: string } }) => (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 12px 22px', background: 'linear-gradient(to bottom, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 100%)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
              {fmtPrice(p.price) && <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{fmtPrice(p.price)}</div>}
            </div>
          );
          const rows = Math.max(1, Math.ceil(products.length / 2)); // >2 articles : nb de rangées (max 2 pour 4)
          return (
            // Un post = une page : la boutique remplit l'écran (height 100svh, flex column).
            <div style={{ position: 'relative', width: '100%', height: '100svh', overflow: 'hidden', background: '#12101c', display: 'flex', flexDirection: 'column' }}>
              {/* COVER / DEVANTURE — hauteur FIXE 190px (ne bouge JAMAIS, quel que soit le nb d'articles) */}
              <div style={{ position: 'relative', flexShrink: 0, height: 190, backgroundImage: cover ? `url(${cover})` : undefined, backgroundColor: '#1c1830', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,0) 55%)' }} />
                <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', alignItems: 'center', gap: 11 }}>
                  {a.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={a.avatar_url} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />
                    : <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(45deg,var(--t2m-primary),var(--t2m-accent))', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.55)' }}>{shopName}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={glassBadge}>BOUTIQUE</span>
                      {originInfo && <span style={glassBadge}>{originInfo.l}</span>}
                    </div>
                  </div>
                </div>
              </div>
              {deux ? (
                /* ≤2 ARTICLES = EMPILÉS pleine largeur, MÊME TAILLE (flex:1), remplissent l'écran. */
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {products.map((p, i) => (
                    <button key={p.id || i} type="button" onClick={openShop}
                      style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', backgroundImage: p.images?.[0] ? `url(${p.images[0]})` : undefined, backgroundColor: '#2a2340', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                      {overlay(p)}
                    </button>
                  ))}
                </div>
              ) : (
                /* >2 ARTICLES = lignes qui REMPLISSENT l'écran. Les articles vont par 2 ; si le dernier
                   est seul sur sa ligne (nb impair), il est PLEINE LARGEUR et s'agrandit jusqu'en bas. */
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {Array.from({ length: rows }).map((_, r) => {
                    const rowItems = products.slice(r * 2, r * 2 + 2);
                    const soloLast = rowItems.length === 1; // dernier article seul → pleine largeur, prolongé
                    return (
                      <div key={r} style={{ flex: soloLast ? 1.35 : 1, minHeight: 0, display: 'flex' }}>
                        {rowItems.map((p, i) => (
                          <button key={p.id || i} type="button" onClick={openShop}
                            style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', backgroundImage: p.images?.[0] ? `url(${p.images[0]})` : undefined, backgroundColor: '#2a2340', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                            {overlay(p)}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* bouton « Voir la boutique » verre poli : au-dessus de la nav en empilé, à cheval en bas en grille */}
              <button type="button" onClick={openShop}
                style={{ position: 'absolute', left: '50%', bottom: 'calc(env(safe-area-inset-bottom) + 92px)', transform: 'translateX(-50%)', zIndex: 4, padding: '11px 22px', borderRadius: 14, border: '1px solid rgba(255,255,255,.45)', background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff', fontWeight: 800, fontSize: 14, textShadow: '0 1px 3px rgba(0,0,0,.5)', boxShadow: '0 10px 26px rgba(0,0,0,.34)', cursor: 'pointer' }}>
                Voir la boutique →
              </button>
            </div>
          );
        })()
      ) : isLongVideo ? (
        /* ── VIDÉO en Long immersif : la VIDÉO reste FIXE EN HAUT (toujours visible) ; SEULE la zone
           TEXTE, juste SOUS la vidéo, SLIDE horizontalement (page 1 = 1er paragraphe, puis la suite).
           Auteur + actions fixes en bas. Le player ne disparaît jamais. Pascal 2026-07-09. ── */
        (() => {
          // NOS vidéos (uploadées, PAS d'embed) = PLEIN ÉCRAN immersif + autoplay quand en vue / pause
          // au scroll (comme la photo). Le 16/9 « façon YouTube » reste réservé aux EMBEDS. Pascal 2026-07-12.
          if (!topEmbed && media) {
            return (
              <div style={{ position: 'relative', width: '100%', height: '100svh' }}>
                <AutoplayVideo src={media} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.34) 26%, rgba(0,0,0,0) 54%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: 14, right: 14, bottom: 'calc(env(safe-area-inset-bottom) + 80px)', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.5))' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    {a.avatar_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.avatar_url} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />
                      : <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(45deg,var(--t2m-primary),var(--t2m-accent))', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.55)' }}>{who}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        <span style={glassBadge}>{b.label}</span>
                        {originInfo && <span style={glassBadge}>{originInfo.l}</span>}
                      </div>
                    </div>
                  </div>
                  {caption && <Caption text={caption} collapsedLines={1} style={{ margin: '10px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#fff', lineHeight: 1.45, textShadow: '0 1px 4px rgba(0,0,0,.6)' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
                    <button type="button" onClick={toggleLike} disabled={busy} style={actionStyle(liked ? 'var(--t2m-primary)' : '#fff')}><Heart size={22} weight={liked ? 'fill' : 'regular'} /> {likes}</button>
                    <button type="button" onClick={openComments} style={actionStyle('#fff')}><ChatCircle size={22} weight="regular" /> {it.comment_count ?? 0}</button>
                    <button type="button" onClick={share} style={actionStyle('#fff')}><ShareNetwork size={22} weight="regular" /> Partager</button>
                    <button type="button" onClick={toggleSave} disabled={saving} style={actionStyle(saved ? 'var(--t2m-primary)' : '#fff')}><BookmarkSimple size={22} weight={saved ? 'fill' : 'regular'} /></button>
                    {showInspect && <span style={{ marginLeft: 'auto', marginRight: 'auto', display: 'inline-flex' }}><CardDevButton cardId={it.id} icon /></span>}
                    <span style={{ ...actionStyle('rgba(255,255,255,.9)'), marginLeft: showInspect ? 0 : 'auto', cursor: 'default' }}><Eye size={22} weight="regular" /> {views}</span>
                  </div>
                </div>
              </div>
            );
          }
          // Paginateur DÉDIÉ à cette section : titres collés à leur paragraphe, coupe par phrases,
          // pages courtes qui tiennent en entier sous la vidéo (pas de rognage, pas de titre orphelin).
          // Comme la vidéo enrichie : le texte slide SOUS la vidéo. Avec un article → l'article ;
          // sinon (vidéo uploadée simple) → la LÉGENDE remplit la zone texte. Pascal 2026-07-11.
          const pages = it.enrichment?.article
            ? videoTextPages(it.enrichment.article, caption, 340)
            : (caption && caption.trim() ? videoTextPages(caption, undefined, 340) : []);
          // Slides SOUS la vidéo = pages de TEXTE + (si la card porte une boutique) une SLIDE BOUTIQUE
          // qui s'adapte à l'espace restant. Pascal 2026-07-11 : « une boutique en slide comme le texte ».
          const shopItems = (alignedCard?.items || []).filter((x) => !!x).slice(0, 6);
          const textNodes = pages.map((blocks, i) => (
            <div key={`t${i}`} style={{ position: 'absolute', inset: 0 }}>
              <div style={{ position: 'absolute', left: 22, right: 22, top: 14, bottom: 6, overflow: 'hidden' }}>
                {blocks.map((blk, j) => blk.h ? (
                  <h3 key={j} style={{ fontFamily: "'Outfit',sans-serif", fontSize: 17, fontWeight: 800, color: '#fff', margin: j === 0 ? '0 0 8px' : '18px 0 8px', letterSpacing: '-0.01em' }}>{renderInline(blk.text)}</h3>
                ) : (
                  <p key={j} style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, lineHeight: 1.65, color: 'rgba(255,255,255,.92)', margin: j === 0 ? 0 : '0 0 12px' }}>{renderInline(blk.text)}</p>
                ))}
              </div>
            </div>
          ));
          const shopNode = shopItems.length ? (
            <div key="shop" style={{ position: 'absolute', inset: 0 }}>
              <div style={{ position: 'absolute', left: 16, right: 16, top: 12, bottom: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Boutique</div>
                <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start', overflow: 'hidden' }}>
                  {shopItems.map((pr, i) => {
                    const img = pr.images?.[0] || '';
                    return (
                      <div key={pr.id || i} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#1c1830', aspectRatio: '1 / 1' }}>
                        {img && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 8px 6px', background: 'linear-gradient(to top, rgba(0,0,0,.82), rgba(0,0,0,0))' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.title}</div>
                          {fmtPrice(pr.price) && <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{fmtPrice(pr.price)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null;
          // Boutique EN PREMIER sous la vidéo (Pascal 2026-07-11 : « la boutique sous la vidéo
          // suffisait ») ; l'article auto-enrichi passe en slides suivantes (secondaire).
          // PAROLES = SLIDE GAUCHE « à côté » de la vidéo (Pascal 2026-07-13).
          // Karaoké (son YouTube synchronisable) : UNE page qui DÉFILE, ligne active surlignée
          // (KaraokeLyrics + YouTubeTimedPlayer). Sinon repli : pages lisibles (16 lignes/page).
          const lyricLines = (it.lyrics?.synced || []).map((l) => l.text).filter(Boolean);
          const lyricNodes = isKaraoke
            ? [(
                <div key="karaoke" style={{ position: 'absolute', inset: 0 }}>
                  <KaraokeLyrics synced={karaokeSynced} timeRef={ytTimeRef} mode={karaokeCalibrated ? 'karaoke' : 'read'} />
                </div>
              )]
            : (lyricLines.length
              ? Array.from({ length: Math.ceil(lyricLines.length / 16) }, (_, p) => (
                  <div key={`ly${p}`} style={{ position: 'absolute', inset: 0 }}>
                    <div style={{ position: 'absolute', left: 22, right: 22, top: 14, bottom: 6, overflow: 'hidden' }}>
                      {p === 0 && <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Paroles</div>}
                      {lyricLines.slice(p * 16, (p + 1) * 16).map((ln, j) => (
                        <p key={j} style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, lineHeight: 1.7, color: 'rgba(255,255,255,.92)', margin: 0 }}>{ln}</p>
                      ))}
                    </div>
                  </div>
                ))
              : []);
          // TA VIDÉO PERSO attachée au post (Pascal 2026-07-14) : si la card a un SON EN HAUT (topEmbed)
          // ET une vidéo perso (media), on n'affiche plus l'un OU l'autre — la vidéo perso devient une
          // SLIDE imbriquée SOUS le son, et on démarre dessus. Respecte la doctrine .card (pas de bricolage).
          // Le média perso peut être une VIDÉO ou une PHOTO : une IMAGE attachée sous un son ne doit
          // JAMAIS finir dans un <video> (sinon image cassée + post absent du feed). Pascal 2026-07-14.
          const mediaIsVideo = it.kind === 'video_card' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(media);
          // Split écran (Pascal 2026-07-14) : son EN HAUT, média perso EN BAS qui REMPLIT tout (cover,
          // jointif) + dégradé sombre en bas pour que auteur/légende/actions restent lisibles.
          const myVideoNode = (topEmbed && media) ? (
            <div key="myvid" style={{ position: 'absolute', inset: 0, background: '#000' }}>
              {mediaIsVideo ? (
                // Lecture AUTO muette + boucle : le son vient d'EN HAUT → la vidéo perso est le VISUEL du
                // bas, elle remplit (cover), sans gros bouton play natif gris ni barre de contrôle. Pascal 2026-07-14.
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={media} autoPlay muted loop playsInline preload="auto" style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000', display: 'block' }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media} alt={caption || 'Photo'} style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000', display: 'block' }} loading="lazy" />
              )}
              {/* dégradé bas : lisibilité de l'auteur/actions posés par-dessus */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.34) 22%, rgba(0,0,0,0) 46%)' }} />
            </div>
          ) : null;
          // ORDRE (Pascal 2026-07-14) : KARAOKÉ à GAUCHE, VIDÉO PERSO au MILIEU (page principale),
          // puis boutique/texte à DROITE. Le karaoké reste le 1er slide (gauche).
          const slides = [...lyricNodes, ...(myVideoNode ? [myVideoNode] : []), ...(shopNode ? [shopNode] : []), ...textNodes];
          const karaokeIndex = isKaraoke ? 0 : -1; // karaoké = 1er slide (gauche) → dot = micro
          const nbPages = slides.length;
          // PAGE PRINCIPALE : on DÉMARRE sur la VIDÉO PERSO (le milieu, juste après le karaoké gauche) ;
          // sinon convention habituelle (la DESCRIPTION).
          const mainPageIndex = myVideoNode ? lyricNodes.length : (isKaraoke && textNodes.length ? 1 + (shopNode ? 1 : 0) : 0);
          return (
            <div style={{ position: 'relative', width: '100%', height: '100svh', background: '#0d0b16', overflow: 'hidden' }}>
              {/* VIDÉO FIXE EN HAUT (sous le header, 16/9) — TOUJOURS visible */}
              <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 58px)', left: 0, right: 0, aspectRatio: '16 / 9', background: '#000', zIndex: 3 }}>
                {isKaraoke && musicAudio?.video_id ? (
                  /* Karaoké. Non calé → CC natif forcé (secours) + SCAN AUTO en fond quand ça joue :
                     le matching lrclib filtre la nav/description tout seul, seule la caption compte →
                     pas besoin d'écran propre. Le texte enrichi reste. Calé → CC coupé. */
                  <>
                    <YouTubeTimedPlayer videoId={musicAudio.video_id} onTime={(t) => { ytTimeRef.current = t; }} onDuration={(d) => { ytDurRef.current = d; }} captions={!karaokeCalibrated} />
                    <KaraokeHarvester videoId={musicAudio.video_id} timeRef={ytTimeRef} durationRef={ytDurRef} enabled={!karaokeCalibrated} />
                  </>
                ) : topEmbed ? (
                  <iframe src={topEmbed} title={caption || 'Vidéo'} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
                ) : (
                  /* Vidéo uploadée (/uploads/*.mp4) : même cadre haut fond noir, lecteur natif contenu
                     dans le 16/9 (objectFit contain → jamais dépasser l'écran). Pascal 2026-07-11. */
                  <video src={media} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }} />
                )}
              </div>

              {/* ZONE TEXTE qui SLIDE, JUSTE SOUS la vidéo (58px header + 56.25vw = hauteur 16/9) */}
              {nbPages > 0 && (
                <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 58px + 56.25vw)', left: 0, right: 0, bottom: myVideoNode ? 'calc(env(safe-area-inset-bottom) + 8px)' : 'calc(env(safe-area-inset-bottom) + 204px)', borderTop: myVideoNode ? '2px solid rgba(255,255,255,0.22)' : undefined }}>
                  <PhotoTextSwiper pages={slides} onPage={setPhotoPage} initialPage={mainPageIndex} />
                  {/* Points de navigation EN BAS DE LA VIDÉO : dans le petit interstice sous le
                      lecteur (plus posés SUR la vidéo). Le texte de la page commence à top:14 → pas
                      de chevauchement. Pascal 2026-07-13. */}
                  {nbPages > 1 && (
                    <div style={{ position: 'absolute', top: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, zIndex: 6, pointerEvents: 'none' }}>
                      {Array.from({ length: nbPages }).map((_, i) => (
                        i === karaokeIndex ? (
                          /* Slide karaoké → dot = MICRO (repère visuel des paroles). Pascal 2026-07-13. */
                          <Microphone key={i} size={14} weight={i === photoPage ? 'fill' : 'regular'} color={i === photoPage ? '#fff' : 'rgba(255,255,255,.55)'} style={{ marginTop: -4 }} />
                        ) : (
                          <span key={i} style={{ width: i === photoPage ? 18 : 6, height: 6, borderRadius: 999, background: i === photoPage ? '#fff' : 'rgba(255,255,255,.4)', transition: 'width .2s' }} />
                        )
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AUTEUR + LÉGENDE + ACTIONS — FIXES EN BAS (toujours visibles) */}
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 'calc(env(safe-area-inset-bottom) + 76px)', zIndex: 4 }}>
                {/* Pastille « fond musical » RETIRÉE (Pascal 2026-07-11) : on ne ré-affiche pas la
                    miniature/le titre YouTube dans notre UI (ToS) — le lecteur officiel en haut suffit. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  {a.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={a.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />
                    : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(45deg,var(--t2m-primary),var(--t2m-accent))', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 16, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.55)' }}>{who}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      <span style={glassBadge}>{b.label}</span>
                      {originInfo && <span style={glassBadge}>{originInfo.l}</span>}
                    </div>
                  </div>
                </div>
                {/* Légende RETIRÉE ici (Pascal 2026-07-13) : le texte est déjà « à côté » dans les
                    slides sous la vidéo (paroles / article / légende) → ne pas le répéter sur la vidéo. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
                  <button type="button" onClick={toggleLike} disabled={busy} style={actionStyle(liked ? 'var(--t2m-primary)' : '#fff')}><Heart size={22} weight={liked ? 'fill' : 'regular'} /> {likes}</button>
                  <button type="button" onClick={openComments} style={actionStyle('#fff')}><ChatCircle size={22} weight="regular" /> {it.comment_count ?? 0}</button>
                  <button type="button" onClick={share} style={actionStyle('#fff')}><ShareNetwork size={22} weight="regular" /> Partager</button>
                  <button type="button" onClick={toggleSave} disabled={saving} style={actionStyle(saved ? 'var(--t2m-primary)' : '#fff')}><BookmarkSimple size={22} weight={saved ? 'fill' : 'regular'} /></button>
                  {showInspect && <span style={{ marginLeft: 'auto', marginRight: 'auto', display: 'inline-flex' }}><CardDevButton cardId={it.id} icon /></span>}
                  <span style={{ ...actionStyle('rgba(255,255,255,.9)'), marginLeft: showInspect ? 0 : 'auto', cursor: 'default' }}><Eye size={22} weight="regular" /> {views}</span>
                </div>
              </div>
            </div>
          );
        })()
      ) : isLongPhoto ? (
        /* ── PHOTO en Long immersif : image PLEIN ÉCRAN. Post ENRICHI → swiper piloté en JS
           (PhotoTextSwiper) : PHOTO (défaut) ↔ TEXTE (swipe horizontal), le swipe VERTICAL passe au
           feed (post suivant). Sans titre. Pascal 2026-07-09. ── */
        (() => {
          const photoNode = (
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.34) 26%, rgba(0,0,0,0) 54%)' }} />
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 'calc(env(safe-area-inset-bottom) + 80px)', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.5))' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  {a.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={a.avatar_url} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />
                    : <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(45deg,var(--t2m-primary),var(--t2m-accent))', border: '2px solid rgba(255,255,255,.9)', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.55)' }}>{who}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={glassBadge}>{b.label}</span>
                      {originInfo && <span style={glassBadge}>{originInfo.l}</span>}
                    </div>
                  </div>
                </div>
                {caption && <Caption text={caption} collapsedLines={1} style={{ margin: '10px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 14, color: '#fff', lineHeight: 1.45, textShadow: '0 1px 4px rgba(0,0,0,.6)' }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
                  <button type="button" onClick={toggleLike} disabled={busy} style={actionStyle(liked ? 'var(--t2m-primary)' : '#fff')}><Heart size={22} weight={liked ? 'fill' : 'regular'} /> {likes}</button>
                  <button type="button" onClick={openComments} style={actionStyle('#fff')}><ChatCircle size={22} weight="regular" /> {it.comment_count ?? 0}</button>
                  <button type="button" onClick={share} style={actionStyle('#fff')}><ShareNetwork size={22} weight="regular" /> Partager</button>
                  <button type="button" onClick={toggleSave} disabled={saving} style={actionStyle(saved ? 'var(--t2m-primary)' : '#fff')}><BookmarkSimple size={22} weight={saved ? 'fill' : 'regular'} /></button>
                  {showInspect && <span style={{ marginLeft: 'auto', marginRight: 'auto', display: 'inline-flex' }}><CardDevButton cardId={it.id} icon /></span>}
                  <span style={{ ...actionStyle('rgba(255,255,255,.9)'), marginLeft: showInspect ? 0 : 'auto', cursor: 'default' }}><Eye size={22} weight="regular" /> {views}</span>
                </div>
              </div>
            </div>
          );
          if (!it.enrichment?.article) {
            return <div style={{ position: 'relative', width: '100%', height: '100svh' }}>{photoNode}</div>;
          }
          /* Pages TEXTE : zone bornée entre header (58px) et nav (60px), overflow hidden = ne dépasse jamais. */
          const textNodes = videoTextPages(it.enrichment.article, caption, 520).map((blocks, i) => (
            <div key={i} style={{ position: 'absolute', inset: 0, background: '#0d0b16' }}>
              <div style={{ position: 'absolute', left: 24, right: 24, top: 'calc(env(safe-area-inset-top) + 88px)', bottom: 'calc(env(safe-area-inset-bottom) + 72px)', overflow: 'hidden' }}>
                {blocks.map((blk, j) => blk.h ? (
                  <h3 key={j} style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 800, color: '#fff', margin: j === 0 ? '0 0 10px' : '22px 0 10px', letterSpacing: '-0.01em' }}>{renderInline(blk.text)}</h3>
                ) : (
                  <p key={j} style={{ fontFamily: "'Inter',sans-serif", fontSize: 15.5, lineHeight: 1.75, color: 'rgba(255,255,255,.92)', margin: j === 0 ? 0 : '0 0 14px' }}>{renderInline(blk.text)}</p>
                ))}
              </div>
            </div>
          ));
          return (
            <div style={{ position: 'relative', width: '100%', height: '100svh' }}>
              <PhotoTextSwiper pages={[photoNode, ...textNodes]} onPage={setPhotoPage} />
              {photoPagesCount > 1 && (
                <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 64px)', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, zIndex: 6, pointerEvents: 'none' }}>
                  {Array.from({ length: photoPagesCount }).map((_, i) => (
                    <span key={i} style={{ width: i === photoPage ? 20 : 7, height: 7, borderRadius: 999, background: i === photoPage ? '#fff' : 'rgba(255,255,255,.5)', boxShadow: '0 1px 3px rgba(0,0,0,.5)', transition: 'width .2s' }} />
                  ))}
                </div>
              )}
            </div>
          );
        })()
      ) : msgs ? (
        /* POST-CONVERSATION : le clip de Léa — texte + cards (youtube/lieux/recette)
           rendus par la MACHINE en CLAIR (Gemini option A). Plus de carte sombre. */
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.map((m) => {
            const isLea = !!(m.ai_name && m.ai_name.trim());
            const txt = (m.content || '').trim();
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {txt && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, lineHeight: 1.5, color: 'var(--t2m-ink)', margin: 0 }}>{isLea && <span style={{ fontWeight: 700, color: 'var(--t2m-accent)' }}>✦ {m.ai_name} · </span>}{txt}</p>}
                {m.youtube && <SuperCardView card={fromYouTube(m.youtube)} theme="light" variant="social" hideMeta />}
                {m.recipe && <SuperCardView card={fromRecipe(m.recipe)} theme="light" variant="social" hideMeta />}
                {m.places && m.places.length > 0 && m.places.map((p, i) => <SuperCardView key={i} card={fromPlace(p)} theme="light" variant="social" hideMeta />)}
              </div>
            );
          })}
        </div>
      ) : isPiece ? (
        <>
          {/* SALLE 3D en RoomCard : couverture + badge + bouton Entrer (→ stream /piece) */}
          {caption && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, lineHeight: 1.5, color: 'var(--t2m-ink)', margin: '0 0 12px' }}>{caption}</p>}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', borderRadius: 12, overflow: 'hidden', marginBottom: 12, background: '#eef1f5' }}>
            {media
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={media} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
              : <div style={{ width: '100%', height: '100%', background: 'radial-gradient(60% 60% at 50% 40%,#2a2340,#12101c)' }} />}
            <span style={{ position: 'absolute', top: 10, left: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(20,20,26,.6)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 999 }}>🚪 Salle 3D</span>
          </div>
          <button type="button" onClick={enterRoom} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginBottom: 12, padding: '13px 0', borderRadius: 14, border: 'none', background: 'var(--t2m-primary)', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15, boxShadow: '0 8px 20px rgba(255,127,17,.35)', cursor: 'pointer' }}>🚪 Entrer dans ma salle</button>
        </>
      ) : musicAudio ? (
        /* MUSIC CARD = disque (fix temporaire, en attendant le full .card) */
        <div style={{ marginBottom: 12 }}>
          <MusicDiscCard videoId={musicAudio.video_id} title={musicAudio.title} artist={musicAudio.artist} thumbnail={musicAudio.thumbnail} />
        </div>
      ) : (
        /* Card OS : le feed LIT le `.card` (readAlignedCard → parseCard), plus de fromPost. */
        <div style={{ marginBottom: 12 }}>
          {(() => {
            const card = alignedCard;
            return card
              ? <SuperCardView card={card} theme="light" variant={card.types?.includes('carousel') ? 'carousel' : card.items?.length ? 'boutique' : 'social'} hideMeta />
              : <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#c0392b' }}>⚠️ .card illisible</p>;
          })()}
        </div>
      )}

      {/* actions RÉELLES : ❤️ · 💬 · ↗ partage · 🔖 Enregistrer · 👁 Vues.
          En Long immersif elles sont posées SUR l'image (branche photo) → on masque la rangée blanche ici. */}
      {!longImmersive && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 'auto' }}>
        <button type="button" onClick={toggleLike} disabled={busy} style={actionStyle(liked ? 'var(--t2m-primary)' : 'var(--t2m-ink-2)')}><Heart size={20} weight={liked ? 'fill' : 'duotone'} /> {likes}</button>
        <button type="button" onClick={openComments} style={actionStyle('var(--t2m-ink-2)')}><ChatCircle size={20} weight="duotone" /> {it.comment_count ?? 0}</button>
        <button type="button" onClick={share} style={actionStyle('var(--t2m-ink-2)')}><ShareNetwork size={20} weight="duotone" /> Partager</button>
        <button type="button" onClick={toggleSave} disabled={saving} style={actionStyle(saved ? 'var(--t2m-primary)' : 'var(--t2m-ink-2)')}><BookmarkSimple size={20} weight={saved ? 'fill' : 'duotone'} /></button>
        <span style={{ ...actionStyle('var(--t2m-ink-3)'), marginLeft: 'auto', cursor: 'default' }}><Eye size={20} weight="duotone" /> {views}</span>
      </div>
      )}
      {toast && <div style={{ position: 'absolute', top: 10, right: 12, background: 'rgba(20,20,26,.85)', color: '#fff', fontSize: 12, padding: '5px 10px', borderRadius: 999, pointerEvents: 'none' }}>{toast}</div>}

      {/* #74 — APERÇU BOUTIQUE = LE MÊME qu'à la création (bouton « Aperçu » de /ma-boutique) et
          que /b/[clé] : BoutiqueSheet. Un seul écran, achat inclus (panier + PaPi), pas de doublon. */}
      {shopOpen && (vitrineId || shopIdForBuy) && typeof document !== 'undefined' && createPortal(
        <BoutiqueSheet shopId={vitrineId || shopIdForBuy || undefined} onClose={() => setShopOpen(false)} />,
        document.body,
      )}
    </motion.div>
  );
}
