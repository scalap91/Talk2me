import type { GeniusAvatarProps } from '../generated/types';
import { col } from '../internal';

const D = { sm: 28, md: 40, lg: 56, xl: 80 } as const;

/** GeniusAvatar — vignette ronde. Photo si src, sinon initiales. Normalise CircleAvatar/T2mAvatar. */
export function GeniusAvatar({ src, initials, size = 'md' }: GeniusAvatarProps) {
  const d = D[size];
  return (
    <span
      style={{
        width: d, height: d, borderRadius: '50%', overflow: 'hidden', flex: 'none',
        display: 'inline-grid', placeItems: 'center',
        background: col('surfaceMuted'), color: col('inkMuted'),
        fontFamily: 'var(--gu-font)', fontWeight: 600, fontSize: Math.round(d * 0.4),
      }}
    >
      {src
        ? <img src={src} alt={initials || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (initials || '')}
    </span>
  );
}
