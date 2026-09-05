import type { GeniusScaffoldProps } from '../generated/types';
import { sp, col } from '../internal';

/** GeniusScaffold — racine d'écran. Rendu <main> (landmark SEO/a11y). */
export function GeniusScaffold({ background = 'bg', scrollable = true, padding = 'none', children }: GeniusScaffoldProps) {
  return (
    <main
      className="gu-scaffold"
      style={{
        background: col(background),
        padding: sp(padding),
        minHeight: '100%',
        boxSizing: 'border-box',
        overflowY: scrollable ? 'auto' : 'hidden',
        fontFamily: 'var(--gu-font)',
      }}
    >
      {children}
    </main>
  );
}
