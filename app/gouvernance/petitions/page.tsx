'use client';
/**
 * /gouvernance/petitions — file des PÉTITIONS escaladées à trancher (Pascal 2026-09-16).
 * chef visé → validateur ; validateur visé → staff. Verdict : Fondée (mesure sur le mis en cause)
 * ou Calomnie (MÊME mesure commune à chaque signataire). Voir [[project_talk2me_petition_anticapture]].
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2 } from '@/lib/icons';

interface Sig { signer_id: string; signer_name: string; motif: string; created_at: number }
interface P { id: string; target_id: string; target_name: string; scope: 'chef' | 'validateur'; cohort_size: number; threshold: number; count: number; signatures: Sig[] }

const LEVELS = [{ v: 1, l: '1 Rappel' }, { v: 2, l: '2 Restriction' }, { v: 3, l: '3 Suspension' }, { v: 4, l: '4 Retrait du rôle' }, { v: 5, l: '5 Exclusion' }];

export default function PetitionsPage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden'>('loading');
  const [rows, setRows] = useState<P[]>([]);
  const [pick, setPick] = useState<Record<string, number>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/petition', { cache: 'no-store' });
    if (r.status === 401) { setState('forbidden'); return; }
    const d = await r.json().catch(() => null);
    if (d?.ok) { setRows(d.petitions || []); setState('ok'); } else setState('forbidden');
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, verdict: 'founded' | 'dismissed') => {
    if (busy) return; setBusy(id);
    try {
      const d = await fetch('/api/petition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decide', petition_id: id, verdict, sanction_level: pick[id] || 0, note: note[id] || '' }) }).then((r) => r.json());
      if (d?.ok) { alert(d.message || 'Décision enregistrée.'); await load(); } else alert(d?.message || 'Échec.');
    } finally { setBusy(''); }
  };

  if (state === 'loading') return <div className="fixed inset-0 grid place-items-center bg-[#FBFAF8] text-[#6E7480]"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const card = 'rounded-2xl border border-[#ECEAE6] bg-white p-4 mb-3';
  return (
    <div className="min-h-screen bg-[#FBFAF8] text-[#1A1D22] px-5 py-6 pb-24">
      <div className="max-w-[640px] mx-auto">
        <button onClick={() => smartBack(router, '/gouvernance')} className="text-[#6E7480] text-sm mb-4">← Retour</button>
        <h1 className="text-[22px] font-extrabold tracking-tight mb-1">⚖️ Pétitions</h1>
        <p className="text-[14px] text-[#6E7480] mb-5">Dénonciations collectives d’un supérieur (1/3 de sa cohorte). On juge sur les faits : <b>fondée</b> = mesure sur le mis en cause · <b>calomnie</b> = même mesure sur chaque signataire.</p>

        {rows.length === 0 && <p className="text-[13px] text-[#9AA0A8]">Aucune pétition à trancher.</p>}

        {rows.map((p) => (
          <div key={p.id} className={card}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[14px] font-bold">Contre {p.target_name}</span>
              <span className="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white" style={{ background: p.scope === 'validateur' ? '#7F1D1D' : '#B45309' }}>{p.scope}</span>
            </div>
            <div className="text-[12px] text-[#9AA0A8] mb-2.5">{p.count} signataire(s) · seuil {p.threshold} (cohorte {p.cohort_size})</div>

            <div className="space-y-1.5 mb-3">
              {p.signatures.map((s) => (
                <div key={s.signer_id} className="text-[13px] text-[#4A4F57] bg-[#F5F3EF] rounded-lg px-3 py-2"><b>{s.signer_name} :</b> {s.motif}</div>
              ))}
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className="text-[12.5px] text-[#6E7480]">Mesure</span>
              <select value={pick[p.id] || 0} onChange={(e) => setPick((s) => ({ ...s, [p.id]: Number(e.target.value) }))} className="border border-[#E3E6EA] rounded-lg px-2 py-1.5 text-[13px]">
                <option value={0}>Aucune</option>
                {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
              </select>
            </div>
            <input value={note[p.id] || ''} onChange={(e) => setNote((s) => ({ ...s, [p.id]: e.target.value }))} placeholder="Note de décision (motive)" className="w-full border border-[#E3E6EA] rounded-lg px-3 py-2 text-[13.5px] outline-none mb-2" />
            <div className="flex gap-2">
              <button onClick={() => decide(p.id, 'founded')} disabled={busy === p.id} className="flex-1 py-2.5 rounded-lg bg-[#E24C4C] text-white font-semibold text-[13px] disabled:opacity-50">{busy === p.id ? '…' : 'Fondée — mesure sur le mis en cause'}</button>
              <button onClick={() => decide(p.id, 'dismissed')} disabled={busy === p.id} className="flex-1 py-2.5 rounded-lg bg-[#6E7480] text-white font-semibold text-[13px] disabled:opacity-50">{busy === p.id ? '…' : 'Calomnie — mesure commune aux signataires'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
