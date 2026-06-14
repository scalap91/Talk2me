'use client';

/**
 * Talk2Me — VitrineCard (Pascal 2026-06-14).
 * Devanture d'une boutique dans le feed : on voit le MUR D'ARTICLES derrière une
 * vitrine semi-transparente (verre), le NOM de la boutique en haut, et une porte
 * « Entrer » en bas. Le mur d'articles = les photos des articles (sans prix ici).
 */

import { useEffect, useState } from 'react';

type Author = { display_name?: string; username?: string; avatar_url?: string | null };

export default function VitrineCard({ shopId, postId, author }: { shopId: string; postId?: string; author?: Author }) {
  const [v, setV] = useState<{ name: string; items: { image_url: string }[] } | null>(null);
  useEffect(() => {
    if (!shopId) return;
    fetch('/api/simple-shop/' + shopId + '/vitrine', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d.ok) setV({ name: d.name, items: d.items || [] }); }).catch(() => {});
  }, [shopId]);

  const imgs = (v?.items || []).map((it) => it.image_url).filter(Boolean);
  const n = imgs.length;
  // 1 article → plein cadre ; plusieurs → on divise la place (jamais de répétition)
  const cols = n <= 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : 3;
  // on entre par CETTE boutique → on ressort sur CE même post (jamais ailleurs)
  const enter = () => { try { if (postId) sessionStorage.setItem('t2m_piece_return', postId); } catch { /* */ } window.location.assign('/boutique3d?b=' + shopId); };

  return (
    <div className="absolute inset-0 z-40">
      {/* MUR D'ARTICLES (fond) : 1 article = plein cadre, plusieurs = on divise */}
      <div className="absolute inset-0 grid gap-1 p-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr' }}>
        {imgs.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={u} alt="" className="w-full h-full object-cover rounded-md" />
        ))}
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
                <div className="text-white text-[14px] font-bold leading-tight">Visite ma boutique 3D</div>
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
