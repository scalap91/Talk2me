'use client';
/**
 * RattachSheet — RATTACHEMENTS agence dans Drive (Phase 6b). Rapatrie la seule fonction vive
 * restante de l'ancien écran `/devenir-transporteur` : le chauffeur ACCEPTE ou REFUSE la demande
 * d'une agence qui veut le rattacher (double consentement). La CNI se vérifie dans Mon Compte
 * (une seule fois) — ici on ne fait que répondre aux demandes. Endpoint inchangé : /api/transport/drivers.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, CheckCircle2 } from '@/lib/icons';

type CniStatus = 'none' | 'pending' | 'verified' | 'rejected';

export default function RattachSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<CniStatus>('none');
  const [loading, setLoading] = useState(true);
  const [reqs, setReqs] = useState<{ id: string; agency_id: string; agency_name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [pr, dr] = await Promise.all([
      fetch('/api/transport/profile', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/transport/drivers', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]);
    if (pr?.profile) setStatus((pr.profile.cni_status as CniStatus) || 'none');
    if (dr?.ok) setReqs(dr.requests || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Le chauffeur valide (ou refuse) une demande de rattachement (double consentement).
  const respond = async (id: string, accept: boolean) => {
    setBusy(true);
    try { const d = await fetch('/api/transport/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'respond', id, accept }) }).then((r) => r.json()); if (d?.ok) setReqs(d.requests || []); }
    catch { /* */ } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-[#F5F6F8] flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-3 border-b border-[#EAECEF]" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onClose} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-[#4A4E57]"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold text-[#2F343A]">Rattachements</h1>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-4">
        {loading ? (
          <div className="grid place-items-center py-20 text-[#6A7585]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : status !== 'verified' ? (
          <div className="rounded-2xl border border-[#EAECEF] bg-white p-4 text-center">
            <p className="text-[14px] text-[#4A4E57] mb-1">Vérifie ton identité d’abord.</p>
            <p className="text-[12px] text-[#8A8F99] mb-3">Une agence ne peut te rattacher que si ton identité est vérifiée. Ça se fait une seule fois dans <b>Mon Compte</b>.</p>
            <button onClick={() => router.push('/profile')} className="w-full py-3 rounded-xl bg-amber-500 text-black font-semibold">Aller à Mon Compte</button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 mb-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div><div className="font-semibold text-emerald-700">Identité vérifiée ✓</div><div className="text-[12px] text-[#6A7585]">Une agence peut te rattacher comme chauffeur.</div></div>
            </div>

            <p className="text-[13px] font-semibold text-[#2F343A] mb-2 px-1">Demandes de rattachement</p>
            {reqs.length === 0 ? (
              <p className="text-center text-[#8A8F99] text-[13px] py-6">Aucune demande pour l’instant. Quand une agence t’invite, elle apparaît ici.</p>
            ) : (
              <div className="space-y-2">
                {reqs.map((q) => (
                  <div key={q.id} className="rounded-2xl border border-[#EAECEF] bg-white p-3 flex items-center gap-2">
                    <span className="flex-1 text-[13px] text-[#2F343A]"><b>{q.agency_name}</b> veut te rattacher comme chauffeur.</span>
                    <button onClick={() => respond(q.id, true)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-semibold text-[12px] disabled:opacity-50">Accepter</button>
                    <button onClick={() => respond(q.id, false)} disabled={busy} className="px-2.5 py-1.5 rounded-lg bg-[#EDEFF2] text-[#4A4E57] text-[12px] disabled:opacity-50">Refuser</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
