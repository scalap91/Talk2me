import type { GeniusSpacerProps } from '../generated/types';

/** GeniusSpacer — espace flexible dans une Row/Column. Rendu <div> vide. */
export function GeniusSpacer({ flex = 1 }: GeniusSpacerProps) {
  return <div aria-hidden="true" style={{ flexGrow: flex, flexBasis: 0 }} />;
}
