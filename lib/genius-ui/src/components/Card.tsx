import type { GeniusCardProps } from '../generated/types';
import { sp } from '../internal';

/** GeniusCard — surface avec padding, arrondi, élévation. Rendu <section>. */
export function GeniusCard({ padding = 'md', radius = 'md', elevation = 'low', children }: GeniusCardProps) {
  return (
    <section className="gu-card" data-elev={elevation} style={{ padding: sp(padding), borderRadius: `var(--gu-radius-${radius})` }}>
      {children}
    </section>
  );
}
