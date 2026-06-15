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

import { X } from 'lucide-react';
import DevOnly from '@/components/system/DevOnly';
import type { FeedItem } from './PostFeed';
import PostCard from './PostCard';
import VideoCardDisplay from './VideoCardDisplay';
import ImageCardDisplay from './ImageCardDisplay';
import TexteCardDisplay from './TexteCardDisplay';
import BoutiqueFeedCard from './BoutiqueFeedCard';
import ShopCard from './ShopCard';
import VitrineCard from './VitrineCard';
import CardActionsBar from '@/components/cards/CardActionsBar';

interface PostShellProps {
  item: FeedItem;
  idx: number;
  scope: string;
  adminMode: boolean;
  onAdminDelete: (kind: 'post' | 'direct_card', id: string, feedKey: string) => void;
}

export default function PostShell({ item, idx, scope, adminMode, onAdminDelete }: PostShellProps) {
  const isOwner = !!item.is_owner;
  const feedKey = `${item.kind}-${item.id}`;
  const delKind: 'post' | 'direct_card' | null =
    item.kind === 'post' ? 'post'
    : (item.kind === 'video_card' || item.kind === 'image_card' || item.kind === 'texte_card') ? 'direct_card'
    : null;
  const caption = (item as { caption?: string | null }).caption || '';
  const isVitrine = item.kind === 'image_card' && /\[VITRINE:[^\]]+\]/.test(caption);
  const isPiece = item.kind === 'image_card' && caption.includes('[PIECE3D]');
  const isLea = item.kind === 'image_card' && caption.includes('[LEA360]');

  return (
    <section
      id={`card-${item.id}`}
      data-feed-index={idx}
      data-snap-card
      className="relative h-full w-full snap-start snap-always flex flex-col overflow-hidden"
      style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
    >
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
        <BoutiqueFeedCard boutique={item} />
      ) : scope === 'shop' ? (
        <ShopCard item={item as unknown as { attached_product_json?: string | null; boosted_until?: number | null; author?: { username?: string } | null }} />
      ) : (
        <>
          {item.kind === 'post' && (
            <PostCard post={item} cardKind="post" isOwner={isOwner} initialLikedByMe={!!item.liked_by_me} fullScreen />
          )}
          {item.kind === 'video_card' && (
            <VideoCardDisplay card={item} cardKind="direct_card" isOwner={isOwner} initialLikedByMe={!!item.liked_by_me} fullScreen fromShop={scope === 'shop'} />
          )}
          {item.kind === 'image_card' && (
            <ImageCardDisplay card={item} cardKind="direct_card" isOwner={isOwner} initialLikedByMe={!!item.liked_by_me} fullScreen />
          )}
          {item.kind === 'texte_card' && (
            <TexteCardDisplay card={item} cardKind="direct_card" isOwner={isOwner} initialLikedByMe={!!item.liked_by_me} fullScreen />
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
