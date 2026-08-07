'use client';
/**
 * Talk2Me — Litiges (Pascal 2026-07-27). Séparation des pouvoirs : le CHEF instruit (rapport signé),
 * le VALIDATEUR tranche (remboursement + sanction). Réservé chef (rang≥3)/validateur.
 * Étape 4 : la décision du validateur EXÉCUTE l'escrow (full → remboursé acheteur, none → libéré vendeur).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2 } from '@/lib/icons';

interface Dossier {
  order?: { title: string | null; image: string | null; amount_cents: number; currency: string; escrow_status: string; order_type: string | null } | null;
  shipment?: { status: string; tracking: string; events: { type: string; at: number }[] } | null;
  casier?: { litiges: number; refunds: number; reports: number; health: string; score: number };
}
interface L { id: string; subject_name: string; opener_name: string; chef_name: string; reason: string; chef_report: string | null; dossier?: Dossier }

const HEALTH: Record<string, { label: string; cls: string }> = {
  green: { label: 'sain', cls: 'text-[#0E9F6E]' },
  orange: { label: 'à surveiller', cls: 'text-[#B45309]' },
  red: { label: 'à risque', cls: 'text-[#E24C4C]' },
};

/** Le DOSSIER factuel sous les yeux du chef (Étape 3b) : commande + colis + casier vendeur. */
function DossierView({ d }: { d: Dossier }) {
  const h = d.casier ? (HEALTH[d.casier.health] || HEALTH.green) : null;
  return (
    <div className="mb-2.5 rounded-lg border border-[#E7E3DC] bg-white px-3 py-2 text-[12.5px] text-[#4A4F57] space-y-1.5">
      <div className="text-[11px] font-bold text-[#9AA0A8] uppercase tracking-wider">Dossier</div>
      {d.order && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {d.order.image && <img src={d.order.image} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
          <span className="flex-1"><b>{d.order.title || 'Article'}</b> · {d.order.amount_cents.toLocaleString('fr')} {d.order.currency} · escrow <b>{d.order.escrow_status}</b></span>
        </div>
      )}
      {d.shipment ? (
        <div>📦 Colis <b>{d.shipment.status}</b> <span className="font-mono text-[#9AA0A8]">{d.shipment.tracking}</span>{d.shipment.events.length > 0 && <> — {d.shipment.events.map((e) => e.type).join(' → ')}</>}</div>
      ) : (
        <div className="text-[#9AA0A8]">📦 Aucun colis rattaché (retrait/numérique ou pas encore expédié)</div>
      )}
      {d.casier && h && (
        <div>👤 Casier vendeur : <b className={h.cls}>{h.label}</b> · {d.casier.litiges} litige(s) · {d.casier.refunds} remb. · {d.casier.reports} plainte(s)</div>
      )}
    </div>
  );
}

export default function LitigesPage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden'>('loading');
  const [data, setData] = useState<{ is_chef: boolean; is_validateur: boolean; open: L[]; instructed: L[] } | null>(null);
  const [reports, setReports] = useState<Record<string, string>>({});
  const [dec, setDec] = useState<Record<string, { refund: string; level: number; note: string }>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/litige', { cache: 'no-store' });
    if (r.status === 403) { setState('forbidden'); return; }
    const d = await r.json(); if (d?.ok) { setData(d); setState('ok'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const instruct = async (id: string) => {
    const report = (reports[id] || '').trim(); if (!report || busy) return;
    setBusy(id);
    try { const d = await fetch('/api/litige', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'instruct', litige_id: id, report }) }).then((r) => r.json()); if (d?.ok) await load(); else alert(d?.message || 'Échec.'); } finally { setBusy(''); }
  };
  // 3c — fil MÉDIÉ : le chef ouvre une conversation avec UNE partie (acheteur/vendeur), jamais les 2 ensemble.
  const contact = async (id: string, party: 'buyer' | 'seller') => {
    if (busy) return;
    setBusy(id);
    try {
      const d = await fetch('/api/litige', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'contact', litige_id: id, party }) }).then((r) => r.json());
      if (d?.ok && d.conv_id) router.push(`/c/${d.conv_id}`);
      else alert(d?.message || 'Impossible d’ouvrir la conversation.');
    } finally { setBusy(''); }
  };
  const decide = async (id: string) => {
    const dd = dec[id] || { refund: 'none', level: 0, note: '' }; if (busy) return;
    setBusy(id);
    try { const d = await fetch('/api/litige', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decide', litige_id: id, refund_type: dd.refund, sanction_level: dd.level || null, note: dd.note }) }).then((r) => r.json()); if (d?.ok) { alert(d.note || 'Décision signée.'); await load(); } else alert(d?.message || 'Échec.'); } finally { setBusy(''); }
  };

  if (state === 'loading') return <div className="fixed inset-0 grid place-items-center bg-[#FBFAF8] text-[#6E7480]"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (state === 'forbidden') return (
    <div className="min-h-screen bg-[#FBFAF8] px-5 py-6"><button onClick={() => smartBack(router, '/profile')} className="text-[#6E7480] text-sm mb-6">← Retour</button>
      <div className="max-w-sm mx-auto text-center pt-16"><div className="text-4xl mb-3">⚖️</div><h1 className="text-[18px] font-extrabold mb-2">Réservé à la gouvernance</h1><p className="text-[14px] text-[#6E7480]">Instruire un litige = chef de secteur ; trancher = validateur.</p></div>
    </div>
  );

  const card = 'rounded-2xl border border-[#ECEAE6] bg-white p-4 mb-3';
  const field = 'w-full border border-[#E3E6EA] rounded-lg px-3 py-2 text-[13.5px] outline-none';
  return (
    <div className="min-h-screen bg-[#FBFAF8] text-[#1A1D22] px-5 py-6 pb-24">
      <div className="max-w-[640px] mx-auto">
        <button onClick={() => smartBack(router, '/profile')} className="text-[#6E7480] text-sm mb-4">← Retour</button>
        <h1 className="text-[22px] font-extrabold tracking-tight mb-1">⚖️ Litiges</h1>
        <p className="text-[14px] text-[#6E7480] mb-5">Le chef <b>instruit</b> (rapport signé), le validateur <b>tranche</b>. On juge sur les faits. La décision <b>exécute l’escrow</b> : <b>full</b> = remboursé à l’acheteur · <b>none</b> = libéré au vendeur.</p>

        {data?.is_chef && (
          <>
            <h2 className="text-[13px] font-bold text-[#6E7480] uppercase tracking-wider mb-2">À instruire {data.open.length ? `· ${data.open.length}` : ''}</h2>
            {data.open.length === 0 && <p className="text-[13px] text-[#9AA0A8] mb-4">Aucun litige à instruire.</p>}
            {data.open.map((l) => (
              <div key={l.id} className={card}>
                <div className="text-[14px] font-bold">Contre {l.subject_name}</div>
                <div className="text-[12px] text-[#9AA0A8] mb-2">ouvert par {l.opener_name}</div>
                <div className="text-[13px] text-[#4A4F57] mb-2.5 bg-[#F5F3EF] rounded-lg px-3 py-2">{l.reason}</div>
                {l.dossier && <DossierView d={l.dossier} />}
                <div className="flex gap-2 mb-2">
                  <button onClick={() => contact(l.id, 'buyer')} disabled={busy === l.id} className="flex-1 py-2 rounded-lg border border-[#E7E3DC] bg-white text-[#4A4F57] font-semibold text-[12.5px] disabled:opacity-50">💬 Écrire à l’acheteur</button>
                  <button onClick={() => contact(l.id, 'seller')} disabled={busy === l.id} className="flex-1 py-2 rounded-lg border border-[#E7E3DC] bg-white text-[#4A4F57] font-semibold text-[12.5px] disabled:opacity-50">💬 Écrire au vendeur</button>
                </div>
                <textarea value={reports[l.id] || ''} onChange={(e) => setReports((r) => ({ ...r, [l.id]: e.target.value }))} rows={2} placeholder="Ton rapport — les faits constatés (tu réponds de ce rapport, il va à ton casier)" className={field} />
                <button onClick={() => instruct(l.id)} disabled={busy === l.id || !(reports[l.id] || '').trim()} className="mt-2 w-full py-2.5 rounded-lg bg-[#FF7F11] text-white font-semibold text-[13.5px] disabled:opacity-50">{busy === l.id ? '…' : 'Déposer mon rapport signé'}</button>
              </div>
            ))}
          </>
        )}

        {data?.is_validateur && (
          <>
            <h2 className="text-[13px] font-bold text-[#6E7480] uppercase tracking-wider mb-2 mt-6">À trancher {data.instructed.length ? `· ${data.instructed.length}` : ''}</h2>
            {data.instructed.length === 0 && <p className="text-[13px] text-[#9AA0A8]">Aucun litige instruit à trancher.</p>}
            {data.instructed.map((l) => {
              const d = dec[l.id] || { refund: 'none', level: 0, note: '' };
              const set = (patch: Partial<typeof d>) => setDec((s) => ({ ...s, [l.id]: { ...d, ...patch } }));
              return (
                <div key={l.id} className={card}>
                  <div className="text-[14px] font-bold">Contre {l.subject_name}</div>
                  <div className="text-[12px] text-[#9AA0A8] mb-2">instruit par {l.chef_name}</div>
                  <div className="text-[13px] text-[#4A4F57] mb-1 bg-[#F5F3EF] rounded-lg px-3 py-2"><b>Motif :</b> {l.reason}</div>
                  {l.chef_report && <div className="text-[13px] text-[#4A4F57] mb-2.5 bg-[#F5F3EF] rounded-lg px-3 py-2"><b>Rapport du chef :</b> {l.chef_report}</div>}
                  {l.dossier && <DossierView d={l.dossier} />}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[12.5px] text-[#6E7480]">Remboursement</span>
                    <select value={d.refund} onChange={(e) => set({ refund: e.target.value })} className="border border-[#E3E6EA] rounded-lg px-2 py-1.5 text-[13px]"><option value="none">Aucun</option><option value="partial">Partiel</option><option value="full">Total</option></select>
                    <span className="text-[12.5px] text-[#6E7480] ml-2">Sanction</span>
                    <select value={d.level} onChange={(e) => set({ level: Number(e.target.value) })} className="border border-[#E3E6EA] rounded-lg px-2 py-1.5 text-[13px]"><option value={0}>Aucune</option><option value={1}>1 Avert.</option><option value={2}>2 Restr.</option><option value={3}>3 Susp.</option><option value={4}>4 Retrait</option><option value={5}>5 Ban</option></select>
                  </div>
                  <input value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Note de décision (motive)" className={field} />
                  <button onClick={() => decide(l.id)} disabled={busy === l.id} className="mt-2 w-full py-2.5 rounded-lg bg-[#E24C4C] text-white font-semibold text-[13.5px] disabled:opacity-50">{busy === l.id ? '…' : 'Trancher (signé) — verse l’escrow'}</button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
