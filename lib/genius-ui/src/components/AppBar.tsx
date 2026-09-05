import type { GeniusAppBarProps } from '../generated/types';
import { GeniusIconButton } from './IconButton';

/** GeniusAppBar — barre supérieure. solid = <header> collé ; transparent = surimpression sur feed plein écran. */
export function GeniusAppBar({ title, variant = 'solid', leadingIcon, children, onLeading }: GeniusAppBarProps) {
  return (
    <header className="gu-appbar" data-variant={variant}>
      {leadingIcon && <GeniusIconButton icon={leadingIcon} label="Menu" variant="plain" size="md" onPress={() => onLeading?.()} />}
      <span className="gu-appbar-title">{title}</span>
      <span style={{ flex: 1 }} />
      {children}
    </header>
  );
}
