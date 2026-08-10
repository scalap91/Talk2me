'use client';

/**
 * Talk2Me — Programme Drive (porteur). L'IDENTITÉ (CNI) se vérifie désormais dans MON COMPTE
 * (authentification du compte, une seule fois) — Pascal 2026-08-10. Ici ne reste que ce qui est
 * SPÉCIFIQUE au transport : voir son statut porteur + valider les demandes de rattachement à une
 * agence. (Le choix des véhicules passera dans le module Drive — Phase 2 ; cet écran sera absorbé
 * par Drive — Phase 6.)
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { ShieldCheck, CheckCircle2, Clock, XCircle, Loader2 } from '@/lib/icons';

type CniStatus = 'none' | 'pending' | 'verified' | 'rejected';

export default function DevenirTransporteur() {
  const router = useRouter();
  const [status, setStatus] = useState<CniStatus>('none');
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [driverReqs, setDriverReqs] = useState<{ id: string; agency_id: string; agency_name: string }[]>([]);
  const [drvBusy, setDrvBusy] = useState(false);

  const refreshDriverReqs = async () => {
    try { const d = await fetch('/api/transport/drivers', { cache: 'no-store' }).then((r) => r.json()); if (d?.ok) setDriverReqs(d.requests || []); } catch { /* */ }
  };
  useEffect(() => {
    fetch('/api/transport/profile', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (d?.profile) { setStatus((d.profile.cni_status as CniStatus) || 'none'); setRejectReason(d.profile.reject_reason || null); }
    }).catch(() => {}).finally(() => setLoading(false));
    refreshDriverReqs();
  }, []);

  // Le chauffeur valide (ou refuse) une demande de rattachement à une agence (double consentement).
  const respondReq = async (id: string, accept: boolean) => {
    setDrvBusy(true);
    try { const d = await fetch('/api/transport/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'respond', id, accept }) }).then((r) => r.json()); if (d?.ok) setDriverReqs(d.requests || []); }
    catch { /* */ } finally { setDrvBusy(false); }
  };

  if (loading) return <div className="fixed inset-0 grid place-items-center bg-[#F5F6F8] text-[#6A7585]"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#2F343A] px-4 py-6 t2m-page">
      <button onClick={() => smartBack(router, '/profile')} className="text-[#8A8F99] text-sm mb-4">← Retour</button>
      <div className="flex items-center gap-2 mb-1"><ShieldCheck className="w-5 h-5 text-amber-600" /><h1 className="text-xl font-bold">Devenir transporteur</h1></div>
      <p className="text-[13px] text-[#6A7585] mb-5">Programme Drive — porte des colis sur tes trajets.</p>

      {status === 'verified' ? (
        <>
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 mb-5 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div><div className="font-semibold text-emerald-700">Identité vérifiée ✓</div><div className="text-[12px] text-[#6A7585]">Tu peux accepter des colis.</div></div>
          </div>
          {driverReqs.length > 0 && (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 mb-5 space-y-2">
              <div className="font-semibold text-[14px] text-emerald-700">🚚 Rattachement à une agence</div>
              {driverReqs.map((q) => (
                <div key={q.id} className="flex items-center gap-2">
                  <span className="flex-1 text-[13px] text-[#2F343A]"><b>{q.agency_name}</b> veut te rattacher comme chauffeur.</span>
                  <button onClick={() => respondReq(q.id, true)} disabled={drvBusy} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-semibold text-[12px]">Accepter</button>
                  <button onClick={() => respondReq(q.id, false)} disabled={drvBusy} className="px-2.5 py-1.5 rounded-lg bg-[#EDEFF2] text-[#4A4E57] text-[12px]">Refuser</button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-[#EAECEF] bg-white p-4">
          {status === 'pending' ? (
            <div className="flex items-center gap-3"><Clock className="w-6 h-6 text-amber-600 shrink-0" /><div><div className="font-semibold text-amber-700">Identité en vérification…</div><div className="text-[12px] text-[#6A7585]">Un validateur contrôle ta CNI (voir Mon Compte). Tu seras notifié.</div></div></div>
          ) : status === 'rejected' ? (
            <div className="flex items-center gap-3"><XCircle className="w-6 h-6 text-red-500 shrink-0" /><div><div className="font-semibold text-red-600">Identité refusée</div><div className="text-[12px] text-[#6A7585]">{rejectReason || 'Document non conforme.'} Corrige dans Mon Compte.</div></div></div>
          ) : (
            <p className="text-[13px] text-[#4A4E57]">Pour porter des colis, il faut d’abord <b>vérifier ton identité</b>. Ça se fait une seule fois dans <b>Mon Compte</b>.</p>
          )}
          <button onClick={() => router.push('/profile')} className="w-full mt-3 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-black font-semibold">
            <ShieldCheck className="w-4 h-4" /> Aller à Mon Compte
          </button>
        </div>
      )}
    </div>
  );
}
