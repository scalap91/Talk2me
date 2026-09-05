import { Children, Fragment } from 'react';
import type { GeniusListProps } from '../generated/types';
import { sp } from '../internal';
import { GeniusDivider } from './Divider';

/** GeniusList — liste verticale. Rendu <div role=list>. Normalise ListView. */
export function GeniusList({ gap = 'none', divided = false, children }: GeniusListProps) {
  const items = Children.toArray(children);
  return (
    <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: divided ? 0 : sp(gap) }}>
      {items.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && divided && <GeniusDivider />}
          <div role="listitem">{c}</div>
        </Fragment>
      ))}
    </div>
  );
}
