import type { GeniusBoxProps } from '../generated/types';
import { sp, col } from '../internal';

/** GeniusBox — conteneur générique. Rendu <div>. Normalise Container/SizedBox/Padding/ColoredBox/ClipRRect. */
export function GeniusBox({ width, height, padding = 'none', background, radius = 'none', border = false, children }: GeniusBoxProps) {
  const r = radius === 'none' ? undefined : `var(--gu-radius-${radius})`;
  return (
    <div
      style={{
        width,
        height,
        padding: sp(padding),
        background: background ? col(background) : undefined,
        borderRadius: r,
        overflow: r ? 'hidden' : undefined,
        border: border ? '1px solid var(--gu-color-line)' : undefined,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}
