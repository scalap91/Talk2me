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
  // 3D immersive (Pièce 3D / Léa 360° / Panorama 360°) RETIRÉE du feed → vit au LABO (Pascal
  // 2026-08-14). Plus d'affichage dans le fil, plus de toggle admin ; les routes /piece3d, /piece,
  // /rd/avatar restent branchées au labo pour la R&D (accès via Espace admin → bouton Labo).
  // Card OS (Pascal 2026-06-30) : le contenu des image-cards passe par le MOTEUR UNIQUE
  // (SuperCardView) ; le social (likes/commentaires) + l'auteur restent au LECTEUR.
  // LOT 2 racine : sous-type lu sur la colonne post_type (robuste), fallback marqueur caption.
  const pt = (item as { post_type?: string | null }).post_type || '';
  const isVitrine = item.kind === 'image_card' && (pt === 'vitrine' || /\[VITRINE:[^\]]+\]/.test(caption));

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
            !isVitrine ? (
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

          {/* VITRINE boutique */}
          {isVitrine && (
            <VitrineCard
              shopId={caption.match(/\[VITRINE:([^\]]+)\]/)?.[1] || ''}
              postId={item.id}
              author={(item as { author?: { display_name?: string; username?: string; avatar_url?: string | null } }).author}
            />
          )}

          {/* Barre d'actions au-dessus de l'overlay vitrine (sinon masquée) */}
          {isVitrine && (
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

          {/* 3D immersive (Pièce 3D / Panorama 360° / Léa 360°) retirée du feed → labo (Pascal 2026-08-14). */}
        </>
      )}
    </section>
  );
}
