import type { GeniusAspectRatioProps } from '../generated/types';

/** GeniusAspectRatio — force un ratio l/h. Rendu <div> aspect-ratio. */
export function GeniusAspectRatio({ ratio = 1, children }: GeniusAspectRatioProps) {
  return <div style={{ aspectRatio: String(ratio), width: '100%' }}>{children}</div>;
}
