'use client';

/**
 * LiveSaleVideos — vidéos à vendre DANS la salle live (Pascal 2026-07-15).
 * L'hôte a marqué des vidéos payantes de son salon « à vendre en live » (toggle salon).
 * Le spectateur voit un bouton 🎬 → une feuille listant ces vidéos : 🔒 + prix tant que non
 * achetée, ▶︎ regarder une fois débloquée. Achat = POST /api/rencontre/[shopId]/unlock
 * (rail content_unlock : escrow + commission plateforme, octroi à la confirmation PaPi).
 * Rien n'est affiché s'il n'y a aucune vidéo en vente. PII air-gap (aucun owner_id).
 */
import { useCallback, useEffect, useState } from 'react';
import { Film, Lock, Play, Loader2, X } from '@/lib/icons';

interface SaleVideo { id: string; label: string | null; priceCents: number; priceLabel: string; unlocked: boolean; url: string | null }

export default function LiveSaleVideos({ hostId, insetBottom = 90 }: { hostId: string; insetBottom?: number }) {
  const [videos, setVideos] = useState<SaleVideo[]>([]);
  const [shopId, setShopId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/live/${encodeURIComponent(hostId)}/videos`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d?.ok) { setVideos(d.videos || []); setShopId(d.shopId || null); } }).catch(() => {});
  }, [hostId]);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const buy = async (v: SaleVideo) => {
    if (!shopId || busy) return; setBusy(v.id);
    try {
      const r = await fetch(`/api/rencontre/${shopId}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: v.id }) });
      const d = await r.json();
      if (d?.checkout_url) { window.location.href = d.checkout_url; return; }
      if (d?.ok) { load(); }
    } catch { /* */ }
    setBusy(null);
  };

  if (!videos.length) return null;

  return (
    <>
      {/* Bouton d'ouverture — au-dessus des commentaires */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute left-4 z-[9] inline-flex items-center gap-2 px-4 h-11 rounded-full bg-black/60 backdrop-blur border border-white/15 text-white text-[14px] font-semibold shadow-lg active:scale-95"
        style={{ bottom: insetBottom, marginBottom: 'env(safe-area-inset-bottom,0px)' }}
      >
        <Film className="w-5 h-5" /> Vidéos · {videos.length}
      </button>

      {open && (
        <div className="absolute inset-0 z-[40] flex items-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-[440px] mx-auto bg-[#15151b] rounded-t-[24px] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Film className="w-5 h-5 text-[#EC4899]" />
              <h3 className="text-white font-bold text-[16px]">Vidéos à vendre</h3>
              <button onClick={() => setOpen(false)} className="ml-auto w-8 h-8 grid place-items-center rounded-full bg-white/10 text-white/80"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto">
              {videos.map((v) => (
                <div key={v.id} className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-black">
                  {v.unlocked && v.url ? (
                    <button onClick={() => setPlaying(v.url)} className="absolute inset-0 w-full h-full">
                      <video src={v.url} className="absolute inset-0 w-full h-full object-cover" muted playsInline preload="metadata" />
                      <span className="absolute inset-0 grid place-items-center"><span className="w-12 h-12 grid place-items-center rounded-full bg-black/50 backdrop-blur"><Play className="w-6 h-6 text-white" /></span></span>
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-emerald-500 text-white text-[9.5px] font-bold">ACHETÉ</span>
                    </button>
                  ) : (
                    <>
                      <div className="absolute inset-0 grid place-items-center" style={{ background: 'linear-gradient(135deg,#2a2a2e,#3a2030)' }}><Lock className="w-8 h-8 text-white/80" /></div>
                      {v.label && <div className="absolute top-2 left-2 right-2 text-white/90 text-[11px] font-medium line-clamp-2">{v.label}</div>}
                      <button onClick={() => buy(v)} disabled={busy === v.id} className="absolute inset-x-0 bottom-0 h-10 bg-[#EC4899] text-white text-[13px] font-bold inline-flex items-center justify-center gap-1.5 active:opacity-90 disabled:opacity-60">
                        {busy === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} {v.priceLabel}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lecteur plein écran d'une vidéo achetée */}
      {playing && (
        <div className="absolute inset-0 z-[50] bg-black flex items-center justify-center" onClick={() => setPlaying(null)}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={playing} className="max-w-full max-h-full" controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setPlaying(null)} className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-full bg-white/15 text-white"><X className="w-5 h-5" /></button>
        </div>
      )}
    </>
  );
}
