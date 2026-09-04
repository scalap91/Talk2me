'use client';

/**
 * Talk2Me — VALIDATEUR : dossiers de vérification d'identité (CIN), étape par étape (Pascal 2026-09-03).
 *
 * Le dossier = image CIN recto/verso + selfie + compte (numéro app + nom). Le validateur valide
 * ÉTAPE PAR ÉTAPE (checklist signée) : CIN lisible → numéro = numéro app → nom = nom opérateur
 * (en attente clés LIVE) → face-match selfie↔photo CIN. Puis Vérifier / Refuser.
 * Accès = curation_validateur (neutre, non-local) OU super-admin. Pas de chef de zone dans le
 * circuit d'identité (risque de sympathie locale). [[feedback_paiement_kyc_numero_cin]]
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2, CheckCircle2, XCircle, ShieldCheck } from '@/lib/icons';

interface Item {
  user_id: string; full_name: string | null; phone: string | null; app_phone: string | null;
  username: string | null; display_name: string | null; cni_number_full: string;
  modes: string[]; sim_attested: boolean; has_video: boolean; has_selfie: boolean; submitted_at: number;
}

// Étapes de la checklist. `live` = dépend des clés opérateur (non requise tant que MOCK).
const STEPS = [
  { key: 'lisible', label: 'CIN lisible et authentique', required: true },
  { key: 'numero', label: 'Le numéro correspond au numéro d’inscription', required: true },
  { key: 'nom', label: 'Le nom de la CIN correspond au nom du compte opérateur', required: false, live: true },
  { key: 'face', label: 'Le visage du selfie correspond à la photo de la CIN', required: true },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

const normPhone = (p: string | null) => (p || '').replace(/[\s+]/g, '').replace(/^0/, '261');

export default function AdminCni() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState('');
  // Cases cochées par dossier : { [user_id]: { lisible, numero, nom, face } }
  const [checks, setChecks] = useState<Record<string, Partial<Record<StepKey, boolean>>>>({});

  const load = () => fetch('/api/admin/cni?status=pending', { cache: 'no-store' }).then((r) => {
    if (r.status === 403) { setForbidden(true); return null; }
    return r.json();
  }).then((d) => { if (d?.items) setItems(d.items); }).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const toggle = (uid: string, k: StepKey) =>
    setChecks((c) => ({ ...c, [uid]: { ...c[uid], [k]: !c[uid]?.[k] } }));

  const canValidate = (uid: string) => STEPS.every((s) => !s.required || checks[uid]?.[s.key]);

  const act = async (user_id: string, action: 'verify' | 'reject') => {
    let reason: string | undefined;
    if (action === 'reject') { reason = window.prompt('Raison du refus ?', 'CNI illisible') || undefined; if (reason === undefined) return; }
    setBusy(user_id);
    try {
      const d = await fetch('/api/admin/cni', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id, action, reason }) }).then((x) => x.json());
      if (d?.items) setItems(d.items);
      setChecks((c) => { const n = { ...c }; delete n[user_id]; return n; });
    } finally { setBusy(''); }
  };

  if (loading) return <div className="fixed inset-0 grid place-items-center bg-[#F5F6F8] text-[#6A7585]"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (forbidden) return <div className="fixed inset-0 grid place-items-center bg-[#F5F6F8] text-[#6A7585] text-sm">Réservé aux validateurs.</div>;

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#2F343A] px-4 py-6 t2m-page">
      <button onClick={() => smartBack(router, '/admin')} className="text-[#6A7585] text-sm mb-4">← Retour</button>
      <div className="flex items-center gap-2 mb-1"><ShieldCheck className="w-5 h-5 text-amber-600" /><h1 className="text-xl font-bold">Vérification d&apos;identité</h1></div>
      <p className="text-[13px] text-[#6A7585] mb-5">{items.length} dossier(s) en attente. Valide chaque étape avant d&apos;autoriser le compte à faire du business.</p>

      {items.length === 0 ? (
        <p className="text-[#9DAAB7] py-10 text-center">Aucun dossier en attente. ✓</p>
      ) : (
        <div className="space-y-6">
          {items.map((it) => {
            const numberMatch = it.app_phone && it.phone ? normPhone(it.app_phone) === normPhone(it.phone) : null;
            return (
              <div key={it.user_id} className="rounded-2xl border border-[#E5E8EC] bg-white shadow-sm p-4">
                {/* En-tête personne */}
                <div className="mb-3">
                  <div className="font-semibold text-[#2F343A]">{it.display_name || '@' + (it.username || it.user_id.slice(0, 6))}</div>
                  <div className="text-[11px] text-[#9DAAB7] mt-0.5">{it.modes.join(', ') || 'compte standard'}</div>
                </div>

                {/* Images du dossier : recto / verso / selfie */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {([['front', 'CIN recto'], ['back', 'CIN verso'], ['selfie', 'Selfie']] as const).map(([side, lbl]) => (
                    <div key={side}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/admin/cni/photo?user_id=${encodeURIComponent(it.user_id)}&side=${side}`} alt={lbl}
                        className="w-full h-28 object-cover rounded-lg border border-[#E5E8EC] bg-[#F0F1F3]" />
                      <div className="text-[10px] text-[#9DAAB7] text-center mt-1">{lbl}{side === 'selfie' && !it.has_selfie ? ' (absent)' : ''}</div>
                    </div>
                  ))}
                </div>
                {it.has_video && (
                  <a href={`/api/admin/cni/photo?user_id=${encodeURIComponent(it.user_id)}&side=video`} target="_blank" rel="noreferrer"
                    className="inline-block text-[12px] text-blue-600 mb-3">▶ Voir la vidéo liveness</a>
                )}

                {/* Compte (numéro + nom) */}
                <div className="rounded-xl bg-[#F7F8FA] border border-[#EDEFF2] p-3 mb-3 text-[12.5px] space-y-1">
                  <div className="flex justify-between"><span className="text-[#6A7585]">Nom (CIN)</span><span className="font-medium">{it.full_name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-[#6A7585]">N° CIN</span><span className="font-mono">{it.cni_number_full || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-[#6A7585]">Numéro d&apos;inscription</span><span className="font-mono">{it.app_phone || '—'}</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6A7585]">Numéro déclaré (paiement)</span>
                    <span className="font-mono flex items-center gap-1">{it.phone || '—'}
                      {numberMatch === true && <span className="text-emerald-600">✓</span>}
                      {numberMatch === false && <span className="text-red-500">≠</span>}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-[#6A7585]">SIM déclarée à son nom</span><span className={it.sim_attested ? 'text-emerald-600 font-medium' : 'text-[#9DAAB7]'}>{it.sim_attested ? 'oui' : 'non'}</span></div>
                </div>

                {/* Checklist étape par étape */}
                <div className="space-y-1.5 mb-3">
                  {STEPS.map((s) => {
                    const disabled = !!(s as { live?: boolean }).live; // nom opérateur : en attente clés LIVE
                    const on = !!checks[it.user_id]?.[s.key];
                    return (
                      <button key={s.key} type="button" disabled={disabled} onClick={() => toggle(it.user_id, s.key)}
                        className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-xl border transition-colors ${disabled ? 'border-[#EDEFF2] bg-[#FAFBFC] opacity-60' : on ? 'border-emerald-300 bg-emerald-50' : 'border-[#E5E8EC] bg-white hover:bg-black/[0.02]'}`}>
                        <span className={`w-5 h-5 rounded-md grid place-items-center text-[12px] flex-shrink-0 ${on ? 'bg-emerald-500 text-white' : 'border border-[#CBD5E0] text-transparent'}`}>✓</span>
                        <span className="text-[12.5px] text-[#2F343A]">{s.label}{!s.required && <span className="text-[#9DAAB7]"> · en attente opérateur</span>}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Décision */}
                <div className="flex gap-2">
                  <button onClick={() => act(it.user_id, 'verify')} disabled={busy === it.user_id || !canValidate(it.user_id)}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0E9F6E] text-white font-semibold text-[13px] disabled:opacity-40">
                    {busy === it.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Vérifier
                  </button>
                  <button onClick={() => act(it.user_id, 'reject')} disabled={busy === it.user_id}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-300 bg-red-50 text-red-600 font-semibold text-[13px] disabled:opacity-50">
                    <XCircle className="w-4 h-4" /> Refuser
                  </button>
                </div>
                {!canValidate(it.user_id) && <p className="text-[11px] text-[#9DAAB7] mt-2 text-center">Coche les étapes obligatoires pour pouvoir vérifier.</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
