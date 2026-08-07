'use client';

/**
 * Talk2Me — Gouvernance des personnes DANS Mon Parcours.
 * Bloc A : Contributeurs (échelon automatique) → ouvrir/fermer les droits du rang.
 * (Bloc B « donner des droits en cochant des cases » SUPPRIMÉ 2026-08-04 —
 *  remplacé par le parrainage relationnel : accès = lien parrain↔filleul + consentement par card.)
 * Super-admin uniquement (gate via /api/auth/me). Self-contained : ses propres appels API.
 */
import { useEffect, useState } from 'react';
import { Loader2, Check } from '@/lib/icons';

interface ContribRow { user_id: string; username: string; display_name: string | null; level_rank: number; level_name: string; expected: string[]; rights_open: boolean }

export default function GouvernanceControls() {
  const [superAdmin, setSuperAdmin] = useState(false);
  const [contribs, setContribs] = useState<ContribRow[]>([]);
  const [contribBusy, setContribBusy] = useState('');

  const loadContribs = () => fetch('/api/admin/contributors', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.ok) setContribs(d.contributors || []); }).catch(() => {});

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (!d?.user?.is_admin) return;
      setSuperAdmin(true); loadContribs();
    }).catch(() => {});
  }, []);

  const setRights = async (userId: string, action: 'open' | 'close') => {
    setContribBusy(userId);
    try {
      await fetch('/api/admin/contributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action }) });
      await loadContribs();
    } finally { setContribBusy(''); }
  };

  if (!superAdmin) return null;

  return (
    <div className="space-y-3">
      {/* Échelon automatique — ouvrir les droits du rang */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2">
        <div className="text-[13px] text-neutral-800 font-medium">Contributeurs (échelon automatique)</div>
        <p className="text-[11px] text-neutral-400 -mt-1">L&apos;échelon se gagne au mérite. Tu ouvres les droits du rang en 1 clic.</p>
        {contribs.length === 0 ? (
          <p className="text-[12px] text-neutral-400 py-2">Aucun contributeur pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {contribs.map((c) => (
              <div key={c.user_id} className="rounded-xl bg-neutral-100 border border-neutral-200 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] text-neutral-800 truncate">{c.display_name || '@' + c.username}</div>
                    <div className="text-[11px] text-amber-500/90">🏅 {c.level_name}</div>
                  </div>
                  {c.expected.length === 0 ? (
                    <span className="text-[11px] text-neutral-400 shrink-0">aucun droit à ouvrir</span>
                  ) : c.rights_open ? (
                    <button onClick={() => setRights(c.user_id, 'close')} disabled={contribBusy === c.user_id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 text-emerald-600 shrink-0 disabled:opacity-50 inline-flex items-center gap-1.5">
                      {contribBusy === c.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Droits ouverts
                    </button>
                  ) : (
                    <button onClick={() => setRights(c.user_id, 'open')} disabled={contribBusy === c.user_id} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-500 text-black font-semibold shrink-0 disabled:opacity-50 inline-flex items-center gap-1.5">
                      {contribBusy === c.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Ouvrir les droits du rang
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
