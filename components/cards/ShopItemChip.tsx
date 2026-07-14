'use client';

/**
 * ShopItemChip — LA vignette produit/boutique unique (Pascal 2026-07-14 : « utilise la MÊME
 * vignette que celle du feed »). Utilisée à l'identique par :
 *   - le FEED (overlay boutique sur une photo, AlignedPostCard) ;
 *   - le COMPOSER (aperçu de l'élément attaché sur CAM-30 / PH-10).
 * Un seul rendu → cohérence garantie entre l'aperçu de création et le feed.
 */
import type React from 'react';

export default function ShopItemChip({
  image,
  title,
  priceLabel,
  onClick,
  showBuy = true,
  style,
}: {
  image?: string;
  title: string;
  priceLabel?: string;
  onClick?: () => void;
  showBuy?: boolean;
  style?: React.CSSProperties;
}) {
  const inner = (
    <>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" style={{ width: 52, height: 52, borderRadius: 11, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <span style={{ width: 52, height: 52, borderRadius: 11, background: 'rgba(255,255,255,.1)', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>🛍️</span>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Article'}</div>
        {priceLabel && <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t2m-primary)', marginTop: 2 }}>{priceLabel}</div>}
      </div>
      {showBuy && <span style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 11, background: 'var(--t2m-primary)', color: '#fff', fontWeight: 800, fontSize: 13 }}>Acheter</span>}
    </>
  );
  const base: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textAlign: 'left',
    padding: 8,
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,.30)',
    background: 'rgba(20,18,28,.55)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    boxShadow: '0 10px 30px rgba(0,0,0,.4)',
    ...style,
  };
  return onClick ? (
    <button type="button" onClick={onClick} style={{ ...base, cursor: 'pointer' }}>{inner}</button>
  ) : (
    <div style={base}>{inner}</div>
  );
}
