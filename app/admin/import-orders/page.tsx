'use client';

/**
 * Console ADMIN — Commandes d'import (mandataire SHEIN/TEMU → Madagascar). Pascal 2026-06-28.
 * Pour chaque commande : QUOI acheter sur SHEIN/TEMU, l'ADRESSE FRANCE du transporteur où
 * faire livrer, et le NOM/CODE du client final à mettre sur le colis (pour que le transporteur
 * route vers le bon client à Mada), + suivi statut/tracking.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Copy, ExternalLink, Package } from '@/lib/icons';
import BackButton from '@/components/system/BackButton';

const FLOW = ['to_order', 'ordered', 'received_fr', 'shipped_mg', 'delivered'] as const;
const LABEL: Record<string, string> = { to_order: 'À commander', ordered: 'Commandé→FR', received_fr: 'Reçu FR', shipped_mg: 'Expédié Mada', delivered: 'Livré', cancelled: 'Annulé' };

interface Order {
  id: string; code: string; client_name: string; mada_address: string; mada_phone: string | null;
  source: string; product_title: string; product_url: string | null; product_image: string | null;
  variant: string | null; qty: number; status: string; fr_tracking: string | null; mg_tracking: string | null; created_at: number;
}

export default function AdminImportOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [frAddress, setFrAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/import-orders', { cache: 'no-store' });
      if (r.status === 403) { setForbidden(true); return; }
      const d = await r.json();
      if (d?.ok) { setOrders(d.orders || []); setFrAddress(d.fr_address || ''); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    try {
      await fetch('/api/admin/import-orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
      await load();
    } finally { setBusy(null); }
  };
  const copy = (t: string) => { try { navigator.clipboard.writeText(t); } catch { /* */ } };

  if (forbidden) return <div className="min-h-[100svh] bg-[#0e0e12] text-white grid place-items-center p-8 text-center text-white/60">Accès réservé à l’administrateur.</div>;

  return (
    <div className="min-h-[100svh] bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-20 flex items-center gap-2 px-3 h-14 border-b border-white/8 bg-[#0e0e12]/90 backdrop-blur">
        <BackButton size={24} className="w-9 h-9 rounded-full grid place-items-center text-white/80 hover:text-white transition-colors" />
        <h1 className="text-[16px] font-semibold inline-flex items-center gap-2"><Package className="w-5 h-5 text-red-300" /> Commandes d’import</h1>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Adresse France du transporteur — c'est là qu'on fait livrer SHEIN/TEMU */}
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-3">
          <p className="text-[12px] text-amber-200/90 font-semibold mb-1">📦 Adresse de livraison à utiliser sur SHEIN/TEMU (transporteur France)</p>
          <div className="flex items-start gap-2">
            <p className="text-[13px] text-white/90 whitespace-pre-wrap flex-1">{frAddress}</p>
            <button onClick={() => copy(frAddress)} className="shrink-0 px-2 py-1 rounded-lg bg-white/10 text-white/80 text-[11px] inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Copier</button>
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : orders.length === 0 ? (
          <p className="text-center text-white/40 text-[13.5px] py-16">Aucune commande d’import pour l’instant.</p>
        ) : orders.map((o) => {
          const recipient = `${o.code} · ${o.client_name}`;
          const idx = FLOW.indexOf(o.status as typeof FLOW[number]);
          const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
          return (
            <div key={o.id} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="p-3 flex gap-3">
                {o.product_image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.product_image} alt="" className="w-16 h-16 rounded-lg object-cover border border-white/10 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold line-clamp-2">{o.product_title}</p>
                  <p className="text-[11.5px] text-white/50">{o.source}{o.variant ? ` · ${o.variant}` : ''} · ×{o.qty}</p>
                  {o.product_url && <a href={o.product_url} target="_blank" rel="noreferrer" className="text-[11.5px] text-red-300/80 inline-flex items-center gap-1 mt-0.5">Ouvrir la fiche <ExternalLink className="w-3 h-3" /></a>}
                </div>
                <span className="shrink-0 text-[10px] h-fit px-2 py-1 rounded-full bg-white/10 text-white/70">{LABEL[o.status] || o.status}</span>
              </div>

              {/* Le NOM/CODE à mettre comme destinataire sur le colis (pour le transporteur) */}
              <div className="px-3 pb-2 space-y-1.5 text-[12px]">
                <div className="flex items-center justify-between gap-2 bg-white/[0.04] rounded-lg px-2.5 py-1.5">
                  <span className="text-white/55">Destinataire à mettre sur SHEIN</span>
                  <span className="flex items-center gap-2"><b className="text-white">{recipient}</b><button onClick={() => copy(recipient)} className="text-white/50"><Copy className="w-3.5 h-3.5" /></button></span>
                </div>
                <div className="text-white/55">Client final : <span className="text-white/85">{o.client_name}</span>{o.mada_phone ? ` · ${o.mada_phone}` : ''}</div>
                <div className="text-white/55">Livraison Mada : <span className="text-white/85">{o.mada_address}</span></div>
                {(o.fr_tracking || o.mg_tracking) && <div className="text-white/45">Suivi FR: {o.fr_tracking || '—'} · MG: {o.mg_tracking || '—'}</div>}
              </div>

              {/* Suivi : avancer le statut + numéros de suivi */}
              <div className="p-3 pt-1 flex flex-wrap gap-2 items-center">
                {next && (
                  <button onClick={() => patch(o.id, { status: next })} disabled={busy === o.id} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[12.5px] font-semibold disabled:opacity-50">
                    {busy === o.id ? '…' : `→ ${LABEL[next]}`}
                  </button>
                )}
                <button onClick={() => { const t = prompt('N° de suivi (France / SHEIN→transporteur)'); if (t != null) patch(o.id, { fr_tracking: t }); }} className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white/80 text-[12px]">Suivi FR</button>
                <button onClick={() => { const t = prompt('N° de suivi (transporteur → Mada)'); if (t != null) patch(o.id, { mg_tracking: t }); }} className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white/80 text-[12px]">Suivi Mada</button>
                {o.status !== 'cancelled' && o.status !== 'delivered' && <button onClick={() => { if (confirm('Annuler cette commande ?')) patch(o.id, { status: 'cancelled' }); }} className="px-2.5 py-1.5 rounded-lg bg-white/5 text-white/40 text-[12px] ml-auto">Annuler</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
