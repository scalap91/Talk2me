'use client';

/**
 * UserAvatar — LA bulle de profil unique (Pascal 2026-08-30). Avant : chaque écran recopiait son <img>
 * d'avatar à la main (~15 endroits). Ici, UNE brique : rendu + fallback + CLIC → /u/<username> (le
 * Discovery). Rend un vrai <a href> (crawlable SEO) ; le clic fait une nav SPA et coupe la propagation
 * si on est dans un parent cliquable. Pas de username / IA / soi-même → non cliquable (span simple).
 * Toute nouvelle bulle DOIT passer par ce composant (source unique).
 */
import { useRouter } from 'next/navigation';
import { useHasStory, getStoryGroup } from '@/lib/use-has-story';

export interface UserAvatarProps {
  username?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  size?: number;                 // px (défaut 40)
  rounded?: 'full' | '2xl' | 'xl';
  ring?: boolean;                // anneau blanc (feed immersif / story)
  story?: boolean;               // forcer/désactiver le liseré story (sinon auto-détecté)
  className?: string;            // classes en plus (bordure, ombre…)
  style?: React.CSSProperties;   // styles en plus (marges…)
  stopParent?: boolean;          // true (défaut) si dans une card/row déjà cliquable
  disableLink?: boolean;         // IA / soi-même : pas de navigation
  ariaLabel?: string;
}

export default function UserAvatar({
  username, avatarUrl, displayName, size = 40, rounded = 'full', ring = false,
  story, className = '', style, stopParent = true, disableLink = false, ariaLabel,
}: UserAvatarProps) {
  const router = useRouter();
  // LISERÉ story : anneau chaud autour de la bulle si la personne a une story fraîche (auto-détecté,
  // 1 fetch partagé). box-shadow = pas de décalage de layout, marche sur fond clair comme sombre.
  const autoStory = useHasStory(username);
  const hasStory = story ?? (autoStory && !disableLink);
  // LISERÉ story : anneau ORANGE (couleur de marque) FIN avec un petit ESPACE avatar↔liseré (outline +
  // outline-offset → le décalage est transparent, marche sur tout fond, sans décaler le layout).
  const storyStyle: React.CSSProperties = hasStory ? { outline: '1.5px solid #FF7F11', outlineOffset: '2px' } : {};
  const initial = (displayName || username || '?').charAt(0).toUpperCase();
  const radius = rounded === 'full' ? '9999px' : rounded === '2xl' ? '1rem' : '0.75rem';

  const box: React.CSSProperties = {
    width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0,
    display: 'block', ...(avatarUrl ? null : { background: 'linear-gradient(135deg,#FF7F11,#FF3D2E)' }), ...style,
    ...storyStyle,
  };
  const inner = avatarUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={avatarUrl} alt={displayName || username || ''} className="w-full h-full object-cover" draggable={false} />
    : <span className="w-full h-full grid place-items-center font-bold text-white" style={{ fontSize: Math.max(11, Math.round(size * 0.42)) }}>{initial}</span>;

  const cls = `${ring ? 'ring-2 ring-white/80 ' : ''}${className}`.trim();
  const linkable = !disableLink && !!username && username.trim().length > 0;

  if (!linkable) return <span className={cls || undefined} style={box}>{inner}</span>;

  const href = `/u/${encodeURIComponent(username!)}`;
  return (
    <a
      href={href}
      aria-label={ariaLabel || `Profil de ${displayName || username}`}
      className={`active:opacity-90 ${cls}`.trim()}
      style={box}
      onClick={(e) => {
        if (stopParent) e.stopPropagation();
        e.preventDefault();
        // Convention Insta : liseré présent → on ouvre D'ABORD la story (host global) ; depuis la story,
        // le header mène au Discovery. Pas de liseré → Discovery direct.
        if (hasStory) {
          const g = getStoryGroup(username);
          if (g) { window.dispatchEvent(new CustomEvent('ttm:status:open', { detail: { ownerId: g.ownerId, username: g.username, name: g.name, avatar: g.avatar } })); return; }
        }
        router.push(href);
      }}
    >
      {inner}
    </a>
  );
}
