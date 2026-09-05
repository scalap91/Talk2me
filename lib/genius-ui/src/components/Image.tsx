import type { GeniusImageProps } from '../generated/types';

/** GeniusImage — image distante. Rendu <img loading=lazy>. Normalise Image.network. */
export function GeniusImage({ src, alt, fit = 'cover', radius = 'none', width, height }: GeniusImageProps) {
  const r = radius === 'none' ? undefined : `var(--gu-radius-${radius})`;
  return <img src={src} alt={alt || ''} loading="lazy" style={{ objectFit: fit, borderRadius: r, width, height, display: 'block' }} />;
}
