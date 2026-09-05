import type { GeniusBottomNavigationProps } from '../generated/types';

/** GeniusBottomNavigation — barre d'onglets. Rendu <nav> collé en bas (layer nav). Contient des GeniusNavItem. */
export function GeniusBottomNavigation({ children }: GeniusBottomNavigationProps) {
  return <nav className="gu-bottomnav" aria-label="Navigation principale">{children}</nav>;
}
