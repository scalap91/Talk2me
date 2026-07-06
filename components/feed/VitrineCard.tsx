'use client';

/**
 * Talk2Me — VitrineCard (Pascal 2026-06-14).
 * Devanture d'une boutique dans le feed : on voit le MUR D'ARTICLES derrière une
 * vitrine semi-transparente (verre), le NOM de la boutique en haut, et une porte
 * « Entrer » en bas. Le mur d'articles = les photos des articles (sans prix ici).
 */

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/money';

type Author = { display_name?: string; username?: string; avatar_url?: string | null };

export default function VitrineCard({ shopId, postId, author }: { shopId: string; postId?: string; author?: Author }) {
  const [v, setV] = useState<{ name: string; kind: string; items: { image_url: string; label?: string; price_cents?: number }[] } | null>(null);
  useEffect(() => {
    if (!shopId) return;
    fetch('/api/simple-shop/' + shopId + '/vitrine', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d.ok) setV({ name: d.name, kind: d.kind || 'boutique', items: d.items || [] }); }).catch(() => {});
  }, [shopId]);
  const isPlat = v?.kind === 'plat_maison';

  const allItems = (v?.items || []).filter((it) => it.image_url);
  // TAILLE D'IMAGE FIXE (Pascal) : 1 ou 2 articles = MÊME taille. Au-delà de 2,
  // l'aperçu du feed n'en montre que 2 ; le reste se découvre DANS la boutique.
  const items = allItems.slice(0, 2);
  const extra = allItems.length - items.length;
  const basis = '46%'; // largeur de cadre constante (calée sur « 2 articles »)
  const eur = (c?: number) => (c ? formatMoney(c) : '');
  // on entre par CETTE boutique → on ressort sur CE même post (jamais ailleurs)
  const enter = () => { try { if (postId) sessionStorage.setItem('t2m_piece_return', postId); } catch { /* */ } window.location.assign('/boutique3d?b=' + shopId); };

  return (
    <div className="absolute inset-0 z-40">
      {/* MUR GALERIE (fond) : photos ENCADRÉES (cadre + passe-partout) centrées,
          comme l'intérieur de la boutique 3D — aperçu derrière la vitre. */}
      <div className="absolute inset-0 flex flex-wrap items-center justify-center content-center gap-x-4 gap-y-3 px-5"
        style={{ background: 'linear-gradient(180deg, #26262b 0%, #141417 100%)' }}>
        {items.map((it, i) => (
          <div key={i} className="flex flex-col items-center min-w-0" style={{ flexBasis: basis, maxWidth: basis }}>
            <div className="w-full rounded-[2px]" style={{ background: '#08080a', padding: 5, boxShadow: '0 10px 26px rgba(0,0,0,.55)' }}>
              <div style={{ background: '#ececed', padding: 4 }}>
                {/* ratio NATUREL de la photo (pas d'écrasement) — le cadre épouse l'image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.image_url} alt="" className="block w-full" style={{ height: 'auto', maxHeight: '42vh', objectFit: 'contain' }} />
              </div>
            </div>
            {(it.label || it.price_cents) && (
              <div className="mt-1.5 max-w-full truncate px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#ececed', color: '#141416' }}>
                {[it.label, eur(it.price_cents)].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        ))}
        {/* + d'articles à l'intérieur (non montrés dans l'aperçu) */}
        {extra > 0 && (
          <div className="flex items-center justify-center rounded-xl border border-white/25 text-white/85 text-[16px] font-bold" style={{ flexBasis: '22%', maxWidth: '22%', alignSelf: 'center', aspectRatio: '1' }}>
            +{extra}
          </div>
        )}
      </div>
      {/* VITRINE : verre semi-transparent (on voit le mur à travers) */}
      <div className="absolute inset-0 backdrop-blur-[2.5px] bg-black/30" />
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 90px rgba(0,0,0,.55)' }} />
      {/* reflet vitre */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,.10) 0%, transparent 30%, transparent 70%, rgba(255,255,255,.06) 100%)' }} />

      {/* NOM de la devanture en HAUT */}
      <div className="absolute top-0 inset-x-0 pt-16 pb-8 px-4 flex justify-center" style={{ background: 'linear-gradient(rgba(0,0,0,.65), transparent)' }}>
        <div className="px-6 py-2.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20">
          <span className="text-white text-[24px] font-extrabold tracking-wide" style={{ textShadow: '0 2px 10px rgba(0,0,0,.7)' }}>{v?.name || 'Boutique'}</span>
        </div>
      </div>

      {/* PORTE « Entrer » en bas + badge auteur (comme la salle) */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-24">
        {(() => {
          const who = author?.display_name || author?.username || '';
          return (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15">
              {author?.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={author.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                : <span className="w-9 h-9 rounded-full grid place-items-center bg-white/15 text-white text-[15px] font-bold">{(who[0] || 'B').toUpperCase()}</span>}
              <div className="text-left">
                <div className="text-white text-[14px] font-bold leading-tight">{isPlat ? 'Plat maison' : 'Visite ma boutique 3D'}</div>
                {who && <div className="text-white/70 text-[12px] leading-tight">chez {who}</div>}
              </div>
            </div>
          );
        })()}
        <button type="button" aria-label="Entrer dans la boutique" onClick={enter} className="relative active:scale-95 transition-transform" style={{ width: 116, height: 196 }}>
          {/* PORTE EN VITRE : verre dépoli plus opaque (bien visible) + reflet */}
          <span className="absolute inset-0 rounded-t-[14px] rounded-b-[4px]" style={{ border: '2px solid rgba(255,255,255,.65)', background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(7px)', boxShadow: '0 16px 40px rgba(0,0,0,.5)' }} />
          <span className="absolute rounded-t-[9px]" style={{ inset: 6, background: 'linear-gradient(115deg, rgba(255,255,255,.62) 0%, rgba(255,255,255,.40) 38%, rgba(255,255,255,.34) 70%, rgba(255,255,255,.52) 100%)', backdropFilter: 'blur(9px)', border: '1px solid rgba(255,255,255,.5)' }} />
          {/* poignée verticale (barre) */}
          <span className="absolute rounded-full" style={{ right: 14, top: '36%', width: 4, height: '28%', background: 'rgba(235,235,235,.9)' }} />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[12px] font-bold border border-white/30">Entrer</span>
        </button>
      </div>
    </div>
  );
}
