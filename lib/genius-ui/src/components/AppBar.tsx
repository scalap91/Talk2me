import type { GeniusAppBarProps } from '../generated/types';
import { GeniusIconButton } from './IconButton';

/** GeniusAppBar — barre supérieure. Rendu <header> collé en haut (layer nav). */
export function GeniusAppBar({ title, leadingIcon, children, onLeading }: GeniusAppBarProps) {
  return (
    <header className="gu-appbar">
      {leadingIcon && <GeniusIconButton icon={leadingIcon} label="Menu" variant="plain" size="md" onPress={() => onLeading?.()} />}
      <span className="gu-appbar-title">{title}</span>
      <span style={{ flex: 1 }} />
      {children}
    </header>
  );
}
