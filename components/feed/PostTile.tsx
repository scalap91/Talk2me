'use client';

/**
 * Talk2Me — PostTile : tuile compacte UNIQUE d'un post (LOT 2 racine, Pascal 2026-06-23).
 * APERÇU = capture exacte du post tel qu'il s'affiche dans le feed (/api/card-preview, screenshot
 * de /card-render). En dessous, une compo fidèle (titre/texte/dégradé) s'affiche INSTANTANÉMENT
 * et reste si la capture n'est pas encore prête (génération async + retry).
 */
import { useState } from 'react';
import { parseCaption } from '@/lib/posts/parse-caption';

const BG_VARIANTS: Record<string, string> = {
  neutral: 'linear-gradient(135deg, #1a1a22 0%, #232330 100%)',
  purple: 'linear-gradient(135deg, #3a1418 0%, #56181f 100%)',
  blue: 'linear-gradient(135deg, #18233a 0%, #213254 100%)',
  warm: 'linear-gradient(135deg, #2a1d20 0%, #3d2530 100%)',
};

export interface PostTileItem {
  id: string; kind?: string; media_url?: string | null; caption?: string | null;
  text?: string | null; bg_variant?: string | null; post_type?: string | null; views?: number;
}

function isVideo(it: PostTileItem): boolean {
  return it.kind === 'video_card' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(it.media_url || '');
}
// 3D immersive (piece3d/pano360/lea360) retirée du feed → labo (Pascal 2026-08-14) : plus de pastille.
const BADGE: Record<string, string> = { vitrine: '🛍️' };

export default function PostTile({ item, onClick }: { item: PostTileItem; onClick?: (id: string) => void }) {
  const { title, description, hashtags } = parseCaption(item.caption || item.text || '');
  const badge = item.post_type ? BADGE[item.post_type] : undefined;
  const hasMedia = !!item.media_url;
  const [shotOk, setShotOk] = useState(false);
  const [shotSrc, setShotSrc] = useState('/api/card-preview/' + item.id);
  const [tries, setTries] = useState(0);

  return (
    <button type="button" onClick={() => onClick?.(item.id)} className="relative aspect-[3/4] bg-black overflow-hidden active:opacity-80 text-left">
      {/* COUCHE 1 (fond, instantanée) : compo fidèle au feed */}
      {hasMedia ? (
        isVideo(item)
          ? <video src={item.media_url!} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
          : <img src={item.media_url!} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0" style={{ background: BG_VARIANTS[item.bg_variant || 'neutral'] || BG_VARIANTS.neutral }} />
      )}
      {title && (
        <div className="absolute inset-x-0 top-0 px-1.5 pt-2 flex justify-center">
          <span className={'text-center font-semibold leading-tight line-clamp-2 drop-shadow text-white ' + (hasMedia ? 'text-[11px]' : 'text-[12px]')}>{title}</span>
        </div>
      )}
      {!hasMedia && !title && (
        <div className="absolute inset-0 grid place-items-center p-2">
          <span className="text-white text-[12px] font-medium text-center leading-snug line-clamp-5">{description || '…'}</span>
        </div>
      )}
      {(description || hashtags) && (hasMedia || title) && (
        <div className={'absolute inset-x-0 bottom-0 px-1.5 pb-1 pt-4 ' + (hasMedia ? 'bg-gradient-to-t from-black/80 to-transparent' : '')}>
          {description && <p className="text-white text-[10px] leading-tight line-clamp-2 drop-shadow">{description}</p>}
          {hashtags && <p className="text-red-300 text-[10px] font-medium line-clamp-1">{hashtags}</p>}
        </div>
      )}

      {/* COUCHE 2 (par-dessus) : capture EXACTE du feed, quand prête. PAS pour la vidéo (frame
          non lue = noir dans un screenshot → on garde la 1re image de la couche fidèle). */}
      {!isVideo(item) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shotSrc} alt="" aria-hidden
          className={'absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ' + (shotOk ? 'opacity-100' : 'opacity-0')}
          onLoad={() => setShotOk(true)}
          onError={() => { if (tries < 4) setTimeout(() => { setTries((t) => t + 1); setShotSrc('/api/card-preview/' + item.id + '?r=' + (tries + 1)); }, 2500); }}
        />
      )}

      {badge && <span className="absolute top-1.5 right-1.5 z-10 text-[10px] font-semibold text-white bg-black/55 rounded-full px-1.5 py-0.5">{badge}</span>}
      {typeof item.views === 'number' && item.views > 0 && (
        <span className="absolute top-1.5 left-1.5 z-10 text-[10px] font-semibold text-white drop-shadow">{item.views}👁</span>
      )}
    </button>
  );
}
