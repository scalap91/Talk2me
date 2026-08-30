'use client';

/**
 * StatusViewer — LE viewer plein écran d'une story (Pascal 2026-08-30). SOURCE UNIQUE : utilisé par la
 * barre de statuts (StatusBar) ET par le host global (StatusViewerHost) déclenché depuis n'importe quelle
 * bulle (convention Insta : liseré → story → profil). Présentational : tout l'état vient des props.
 * Tap fond → image suivante puis fermeture ; tap sur le nom/avatar → Discovery de la personne.
 */
import { X, Trash2 } from '@/lib/icons';
import SuperCardView from '@/components/cards/SuperCardView';
import UserAvatar from '@/components/user/UserAvatar';
import { makeCard } from '@/lib/cards/supercard';

interface ShopItem { id: string; image_url: string; label: string | null; price_cents: number }
export interface StatusItem { id: string; kind: string; media_url: string | null; caption: string | null; shop?: { id: string; name: string; public_key: string; items: ShopItem[] } | null }
export interface ViewerState { statuses: StatusItem[]; idx: number; name: string; mine: boolean; username?: string; avatar?: string | null }

export default function StatusViewer({ viewer, onNext, onClose, onDelete, onOpenProfile }: {
  viewer: ViewerState;
  onNext: () => void;
  onClose: () => void;
  onDelete?: () => void;
  onOpenProfile?: () => void;
}) {
  const s = viewer.statuses[viewer.idx];
  return (
    <div className="fixed inset-0 z-[140] bg-black flex flex-col" onClick={onNext}>
      <div className="flex items-center justify-between px-4 h-12 text-white" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="flex items-center gap-2 min-w-0 active:opacity-80" onClick={() => onOpenProfile?.()} disabled={!onOpenProfile}>
          {!viewer.mine && <UserAvatar username={viewer.username} avatarUrl={viewer.avatar} displayName={viewer.name} size={30} disableLink />}
          <span className="text-[14px] font-semibold truncate">{viewer.name}</span>
        </button>
        <div className="flex items-center gap-3">
          {viewer.mine && onDelete && <button onClick={onDelete} aria-label="Supprimer cette story"><Trash2 className="w-5 h-5 text-rose-300" /></button>}
          <button onClick={onClose} aria-label="Fermer"><X className="w-6 h-6" /></button>
        </div>
      </div>
      <div className="flex gap-1 px-4 pb-2" onClick={(e) => e.stopPropagation()}>
        {viewer.statuses.map((_, i) => <span key={i} className={'h-0.5 flex-1 rounded-full ' + (i <= viewer.idx ? 'bg-white' : 'bg-white/25')} />)}
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto">
        {(() => {
          if (s.kind === 'shop' && s.shop) {
            const shopCard = makeCard({
              id: s.shop.id,
              types: ['boutique'],
              channel: 'boutique',
              title: s.shop.name,
              items: s.shop.items.map((it) => makeCard({
                id: it.id,
                types: ['image'],
                title: it.label || '',
                ...(it.image_url ? { images: [it.image_url] } : {}),
                price: { amount: it.price_cents, currency: 'Ar' },
              })),
            });
            return (
              <div className="w-full max-w-md p-3" onClick={(e) => e.stopPropagation()}>
                <SuperCardView card={shopCard} variant="boutique" theme="light" hideMeta />
              </div>
            );
          }
          if (s.kind === 'video' && s.media_url) {
            // eslint-disable-next-line jsx-a11y/media-has-caption
            return <video src={s.media_url} autoPlay playsInline controls className="max-h-full max-w-full" />;
          }
          return s.media_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.media_url} alt="" className="max-h-full max-w-full object-contain" />
          ) : null;
        })()}
      </div>
      {s?.caption && (
        <p className="text-white text-center text-[14px] px-6 pb-6" onClick={(e) => e.stopPropagation()}>{s.caption}</p>
      )}
    </div>
  );
}
