'use client';

/**
 * Talk2Me — PostShell (Pascal 2026-06-15).
 * COQUILLE UNIQUE DE POST : un seul composant décide comment s'affiche N'IMPORTE
 * QUEL post du feed (chat, image, vidéo, texte, boutique, vitrine, salle 3D, plat,
 * Léa 360°). Le feed (PostFeed) ne fait plus que mapper item → <PostShell/>.
 * Ajouter un type = éditer ICI (le registre), pas la cascade du feed.
 *
 * v1 (fondation) : extraction fidèle du rendu + chrome centralisé (admin, overlays,
 * barre d'actions des overlays vitrine/salle). La fusion des tables (posts +
 * direct_cards) et la migration du chrome dans la coquille suivront (P1/P2).
 */

import { X } from '@/lib/icons';
import { useFeature } from '@/lib/client/use-feature';
import DevOnly from '@/components/system/DevOnly';
import type { FeedItem } from './PostFeed';
import PostCard from './PostCard';
import ImageCardDisplay from './ImageCardDisplay';
import MusicDiscCard from '@/components/cards/MusicDiscCard';
import ShopCard from './ShopCard';
import VitrineCard from './VitrineCard';
import CardActionsBar from '@/components/cards/CardActionsBar';
import { useState } from 'react';
import SuperCardView from '@/components/cards/SuperCardView';
import CardLongPressMenu, { useLongPress } from '@/components/cards/CardLongPressMenu';
import { parseCard, type SuperCard } from '@/lib/cards/supercard';

// Card OS : le feed LIT le `.card`, POINT. Plus de reconstruction (fromFeedImageCard
// supprimé). Pas de `.card` lisible → null → on affiche « illisible », on ne bricole pas.
function readFeedCard(item: FeedItem): SuperCard | null {
  const it = item as { dotcard?: string | null };
  if (typeof it.dotcard === 'string' && it.dotcard) {
    const r = parseCard(it.dotcard);
    if (r.ok && r.card) return r.card;
  }
  return null;
}

interface PostShellProps {
  item: FeedItem;
  idx: number;
  scope: string;
  adminMode: boolean;
  onAdminDelete: (kind: 'post' | 'direct_card', id: string, feedKey: string) => void;
}

export default function PostShell({ item, idx, scope, adminMode, onAdminDelete }: PostShellProps) {
  const isOwner = !!(item as { is_owner?: boolean }).is_owner;
  const feedKey = `${item.kind}-${item.id}`;
  const delKind: 'post' | 'direct_card' | null =
    item.kind === 'post' ? 'post'
    : (item.kind === 'video_card' || item.kind === 'image_card' || item.kind === 'texte_card') ? 'direct_card'
    : null;
  const caption = (item as { caption?: string | null }).caption || '';
  // Pièces 3D sous interrupteur admin (parqué Mada / allumable international). Pascal 2026-06-21.
  const piece3dOn = useFeature('piece3d');
  // Card OS (Pascal 2026-06-30) : le contenu des image-cards passe par le MOTEUR UNIQUE
  // (SuperCardView) ; le social (likes/commentaires) + l'auteur restent au LECTEUR.
  // LOT 2 racine : sous-type lu sur la colonne post_type (robuste), fallback marqueur caption.
  const pt = (item as { post_type?: string | null }).post_type || '';
  const isVitrine = item.kind === 'image_card' && (pt === 'vitrine' || /\[VITRINE:[^\]]+\]/.test(caption));
  const isPiece = piece3dOn && item.kind === 'image_card' && (pt === 'piece3d' || caption.includes('[PIECE3D]'));
  const isLea = piece3dOn && item.kind === 'image_card' && (pt === 'lea360' || caption.includes('[LEA360]'));
  // Panorama 360° (HunyuanWorld) — LÉGER (sphère texturée), pas gaté : ok mobile Mada.
  const isPano = item.kind === 'image_card' && (pt === 'pano360' || caption.includes('[PANO360'));

  // Card OS : appui long → menu de card (dont « Inspecter la Card »). Remonté ici car le
  // feed rend désormais via SuperCardView (le long-press des ex-Display était perdu).
  const [menuOpen, setMenuOpen] = useState(false);
  const cardType: 'image' | 'video' | 'texte' | 'conv_clip' | undefined =
    item.kind === 'image_card' ? 'image'
    : item.kind === 'video_card' ? 'video'
    : item.kind === 'texte_card' ? 'texte'
    : item.kind === 'post' ? 'conv_clip' : undefined;
  const lp = useLongPress(() => { if (delKind) setMenuOpen(true); });

  // Fix TEMPORAIRE (Pascal 2026-07-03) : une card musique (image/texte + attached_audio youtube)
  // s'affiche en DISQUE dans le feed, en attendant le passage full .card. N'affecte pas les vidéos.
  const musicAudio = (() => {
    const raw = (item as { attached_audio_json?: string | null }).attached_audio_json;
    if (!raw || (item.kind !== 'image_card' && item.kind !== 'texte_card')) return null;
    try {
      const a = JSON.parse(raw) as { type?: string; title?: string; author?: { name?: string }; thumbnail_url?: string; external_url?: string; description?: string };
      if (a?.type !== 'audio') return null;
      const vid = (String(a.external_url || '').match(/[?&]v=([A-Za-z0-9_-]{6,})/) || String(a.thumbnail_url || '').match(/\/vi\/([A-Za-z0-9_-]{6,})\//) || [])[1];
      if (!vid) return null;
      return { video_id: vid, title: a.title || 'Musique', artist: a.author?.name || a.description || '', thumbnail: a.thumbnail_url || '' };
    } catch { return null; }
  })();

  return (
    <section
      id={`card-${item.id}`}
      data-feed-index={idx}
      data-snap-card
      data-card-id={item.id}
      data-card-kind={delKind || ''}
      className="relative h-full w-full snap-start snap-always flex flex-col overflow-hidden"
      style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
      {...(delKind ? lp.bind : {})}
    >
      {delKind && (
        <CardLongPressMenu
          open={menuOpen}
          payload={{ cardKind: delKind, cardId: item.id, isOwner, cardType }}
          onClose={() => setMenuOpen(false)}
          context="home"
          card={item.kind === 'boutique' ? undefined : (readFeedCard(item) ?? undefined)}
        />
      )}
      {adminMode && delKind && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAdminDelete(delKind, item.id, feedKey); }}
          aria-label="Supprimer cette publication (admin)"
          className="absolute right-3 top-16 z-40 w-9 h-9 rounded-full bg-red-600/95 text-white grid place-items-center shadow-lg active:scale-90"
        >
          <X className="w-5 h-5" />
        </button>
      )}


      {item.kind === 'boutique' ? (
        (() => {
          const c = readFeedCard(item);
          return c
            ? <div className="relative h-full w-full overflow-y-auto p-3 bg-[#0b0b0d]"><SuperCardView card={c} variant="boutique" /></div>
            : <div className="h-full w-full grid place-items-center text-red-400 text-sm">⚠️ .card illisible</div>;
        })()
      ) : scope === 'shop' ? (
        <ShopCard item={item as unknown as { attached_product_json?: string | null; boosted_until?: number | null; author?: { username?: string } | null }} />
      ) : (
        <>
          {musicAudio && (
            <div className="relative h-full w-full flex items-center justify-center bg-[#0b0b0d]">
              <MusicDiscCard videoId={musicAudio.video_id} title={musicAudio.title} artist={musicAudio.artist} thumbnail={musicAudio.thumbnail} />
            </div>
          )}
          {item.kind === 'post' && (
            <PostCard post={item} cardKind="post" isOwner={isOwner} initialLikedByMe={!!item.liked_by_me} fullScreen />
          )}
          {/* Absorption feed plein écran : image + vidéo + texte → le MÊME lecteur (SuperCardView fullscreen). */}
          {(item.kind === 'image_card' || item.kind === 'video_card' || item.kind === 'texte_card') && !musicAudio && (
            !isVitrine && !isPiece && !isLea && !isPano ? (
              // ── BRANCHÉ CARD OS : contenu via le moteur unique, social+auteur = lecteur ──
              <div className="relative h-full w-full">
                {(() => {
                  const a = (item as { author?: { display_name?: string; username?: string; avatar_url?: string | null } }).author || {};
                  const who = a.display_name || a.username || 'Utilisateur';
                  return (
                    <div className="absolute top-16 left-3 z-40 flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                      {a.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={a.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        : <span className="w-7 h-7 rounded-full grid place-items-center bg-white/15 text-white text-[12px] font-bold">{who[0]?.toUpperCase()}</span>}
                      <span className="text-white text-[12.5px] font-medium">{who}</span>
                    </div>
                  );
                })()}
                {(() => {
                  const c = readFeedCard(item);
                  return c
                    ? <SuperCardView card={c} variant="fullscreen" reveal={['media', 'title', 'text', 'actions']} />
                    : <div className="h-full w-full grid place-items-center text-red-400 text-sm">⚠️ .card illisible</div>;
                })()}
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
              </div>
            ) : (
              <ImageCardDisplay card={item} cardKind="direct_card" isOwner={isOwner} initialLikedByMe={!!item.liked_by_me} fullScreen />
            )
          )}

          {/* SALLE 3D : photo de la salle + mot + porte */}
          {isPiece && (() => {
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

          {/* VITRINE boutique */}
          {isVitrine && (
            <VitrineCard
              shopId={caption.match(/\[VITRINE:([^\]]+)\]/)?.[1] || ''}
              postId={item.id}
              author={(item as { author?: { display_name?: string; username?: string; avatar_url?: string | null } }).author}
            />
          )}

          {/* Barre d'actions au-dessus des overlays vitrine/salle (sinon masquée) */}
          {(isVitrine || isPiece) && (
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
          )}

          {/* Panorama 360° (HunyuanWorld) — bouton d'entrée dans le viewer immersif */}
          {isPano && (
            <button
              type="button"
              aria-label="Regarder en 360°"
              onClick={() => window.location.assign('/piece3d')}
              className="absolute left-1/2 bottom-28 z-40 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-full bg-black/55 backdrop-blur-md border border-white/25 text-white text-[14px] font-bold active:scale-95"
            >
              🧊 Entrer dans la pièce 3D
            </button>
          )}

          {/* Léa 360° (R&D) — masqué sur beta (pas au point), visible dev pour recherche */}
          {isLea && (
            <DevOnly>
              <button
                type="button"
                aria-label="Ouvrir Léa 360°"
                onClick={() => window.location.assign('/rd/avatar')}
                className="absolute left-1/2 bottom-28 z-40 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-white text-[14px] font-bold active:scale-95"
              >
                Ouvrir Léa 360°
              </button>
            </DevOnly>
          )}
        </>
      )}
    </section>
  );
}
