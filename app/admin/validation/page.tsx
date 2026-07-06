'use client';

/**
 * Talk2Me — FILE DE VALIDATION CURATION (Pascal 2026-06-10).
 * Validateur/admin : voit les sélections proposées par les regardeurs (fiches
 * propres) → Valide (publie au nom du regardeur) ou Refuse. Réservé droit
 * curation_validateur (API 403 sinon).
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Check, X } from '@/lib/icons';

interface Sub { id: string; name: string | null; submitter_name: string | null; count: number; items: { pid: string; name: string; image: string }[]; created_at: number }

export default function ValidationPage({ onBack }: { onBack?: () => void } = {}) {
  const router = useRouter();
  const [rows, setRows] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/curation/queue', { cache: 'no-store' });
      if (r.status === 403) { setForbidden(true); return; }
      const d = await r.json();
      if (d?.ok) setRows(d.pending || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, decision: 'validated' | 'rejected') => {
    if (busy) return;
    setBusy(id + decision);
    try {
      const r = await fetch('/api/curation/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, decision }) }).then((x) => x.json());
      if (r?.ok) setRows((p) => p.filter((s) => s.id !== id));
    } finally { setBusy(''); }
  };

  if (forbidden) return <div className="min-h-[100svh] bg-[#0a0a14] text-white grid place-items-center p-6"><p className="text-white/70">Accès validateur requis.</p></div>;

  return (
    <div className="min-h-[100svh] bg-[#0a0a14] text-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-4 h-14 border-b border-white/8 bg-[#0a0a14]/90 backdrop-blur">
        <button onClick={() => (onBack ? onBack() : router.push('/profile'))} className="w-9 h-9 rounded-full grid place-items-center text-white/80"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[17px] font-semibold">À valider</h1>
        {rows.length > 0 && <span className="ml-1 text-[12px] text-amber-300">{rows.length}</span>}
      </header>

      <div className="p-3 space-y-3 pb-10">
        {loading ? (
          <div className="flex justify-center py-10 text-white/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-white/40 text-[13px] py-10">Aucune fiche en attente. 👌</p>
        ) : rows.map((s) => (
          <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-white/95 truncate">{s.name}</p>
                <p className="text-[12px] text-white/50">par @{s.submitter_name || '?'} · {s.count} fiche{s.count > 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {s.items.slice(0, 8).map((it) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={it.pid} src={it.image} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => decide(s.id, 'rejected')} disabled={!!busy} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] border border-white/12 text-white/80 text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40">
                {busy === s.id + 'rejected' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Refuser
              </button>
              <button onClick={() => decide(s.id, 'validated')} disabled={!!busy} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40">
                {busy === s.id + 'validated' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Valider & publier
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
