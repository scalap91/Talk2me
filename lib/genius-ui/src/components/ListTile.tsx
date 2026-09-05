import type { CSSProperties } from 'react';
import type { GeniusListTileProps } from '../generated/types';
import { GeniusIcon } from './Icon';
import { sp, col } from '../internal';

/** GeniusListTile — rangée de liste. Avec onTap → <button> (focus clavier) ; sinon <div>. */
export function GeniusListTile({ title, subtitle, leadingIcon, trailingIcon, disabled = false, onTap }: GeniusListTileProps) {
  const interactive = !!onTap;
  const style: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: sp('md'),
    padding: `${sp('sm')} ${sp('md')}`, width: '100%', boxSizing: 'border-box',
    background: 'transparent', border: 0, textAlign: 'left',
    cursor: interactive && !disabled ? 'pointer' : 'default', opacity: disabled ? 0.5 : 1,
    fontFamily: 'var(--gu-font)',
  };
  const body = (
    <>
      {leadingIcon && <GeniusIcon name={leadingIcon} size="md" color="inkMuted" />}
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 'var(--gu-type-body-size)', color: col('ink'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {subtitle && <span style={{ fontSize: 'var(--gu-type-caption-size)', color: col('inkMuted') }}>{subtitle}</span>}
      </span>
      {trailingIcon && <GeniusIcon name={trailingIcon} size="md" color="inkMuted" />}
    </>
  );
  return interactive
    ? <button type="button" className="gu-listtile" disabled={disabled} onClick={() => { if (!disabled) onTap?.(); }} style={style}>{body}</button>
    : <div style={style}>{body}</div>;
}
