'use client';

/**
 * LiveModeration — panneau HÔTE de modération d'un live (Pascal 2026-07-15).
 * Historique de connexion (qui est entré) + boutons ÉJECTER / BANNIR / DÉBANNIR.
 * `roomKey` = clé de MA salle (annonce ou user). Réservé à l'hôte (l'API vérifie owner === me).
 *  - GET  /api/live/[roomKey]/viewers → liste { viewer_id, name, ts, banned }.
 *  - POST /api/live/[roomKey]/viewers { action:'kick'|'ban'|'unban', viewer_id }.
 * Le viewer_id n'est jamais montré (juste le pseudo) ; il sert aux actions serveur.
 */
import { useCallback, useEffect, useState } from 'react';
import { Users, Ban, X, Loader2, Shield } from '@/lib/icons';

interface Viewer { viewer_id: string; name: string | null; ts: number; banned: boolean }

export default function LiveModeration({ roomKey }: { roomKey: string }) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/live/${encodeURIComponent(roomKey)}/viewers`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d?.ok) setViewers(d.viewers || []); }).catch(() => {});
  }, [roomKey]);
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);

  const act = async (v: Viewer, action: 'kick' | 'ban' | 'unban') => {
    if (busy) return; setBusy(v.viewer_id + action);
    try {
      await fetch(`/api/live/${encodeURIComponent(roomKey)}/viewers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, viewer_id: v.viewer_id }),
      });
      await load();
    } finally { setBusy(null); }
  };

  if (!viewers.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute top-4 right-4 z-[41] inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 text-white text-[13px] font-semibold active:scale-95"
        style={{ marginTop: 'env(safe-area-inset-top,0px)' }}
      >
        <Users className="w-4 h-4" /> {viewers.length}
      </button>

      {open && (
        <div className="absolute inset-0 z-[45] flex items-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-[440px] mx-auto bg-[#15151b] rounded-t-[24px] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-[#EC4899]" />
              <h3 className="text-white font-bold text-[16px]">Spectateurs</h3>
              <button onClick={() => setOpen(false)} className="ml-auto w-8 h-8 grid place-items-center rounded-full bg-white/10 text-white/80"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
              {viewers.map((v) => (
                <div key={v.viewer_id} className="flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[13.5px] font-medium truncate">{v.name || 'Spectateur'}</div>
                    {v.banned && <div className="text-red-400 text-[11px] font-semibold">Banni</div>}
                  </div>
                  {v.banned ? (
                    <button onClick={() => act(v, 'unban')} disabled={busy === v.viewer_id + 'unban'} className="px-3 h-8 rounded-full bg-white/10 text-white text-[12px] font-semibold active:scale-95 disabled:opacity-50">
                      {busy === v.viewer_id + 'unban' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Débannir'}
                    </button>
                  ) : (
                    <>
                      <button onClick={() => act(v, 'kick')} disabled={busy === v.viewer_id + 'kick'} className="px-3 h-8 rounded-full bg-white/10 text-white text-[12px] font-semibold active:scale-95 disabled:opacity-50">
                        {busy === v.viewer_id + 'kick' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Éjecter'}
                      </button>
                      <button onClick={() => act(v, 'ban')} disabled={busy === v.viewer_id + 'ban'} className="inline-flex items-center gap-1 px-3 h-8 rounded-full bg-red-500/90 text-white text-[12px] font-bold active:scale-95 disabled:opacity-50">
                        {busy === v.viewer_id + 'ban' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Ban className="w-3.5 h-3.5" /> Bannir</>}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
