'use client';

/**
 * Talk2Me — LOYERS (loyer récurrent semi-auto, Pascal 2026-06-28).
 * Locataire : voit ses échéances, paie en 1 clic (PaPi in-app). Bailleur : crée un bail
 * (par @pseudo) et suit qui a payé. Pas de prélèvement auto (mobile money) → relance + 1 clic.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Home, CheckCircle2, Clock } from '@/lib/icons';
import { formatMoney, currencyLabel } from '@/lib/money';
import PaymentFrame from '@/components/pay/PaymentFrame';
import MobilePayAuthModal from '@/components/pay/MobilePayAuthModal';

interface Due { id: string; period: string; amount_cents: number; due_date: number; status: string }
interface Lease { id: string; role: 'landlord' | 'tenant'; title: string | null; other_name: string | null; monthly_cents: number; day_of_month: number; dues: Due[] }

export default function LoyersPage() {
  const router = useRouter();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [payIntent, setPayIntent] = useState<string | null>(null);
  const [payAuthId, setPayAuthId] = useState<string | null>(null);
  const [pendingDue, setPendingDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Création de bail (bailleur)
  const [showNew, setShowNew] = useState(false);
  const [tenant, setTenant] = useState('');
  const [title, setTitle] = useState('');
  const [monthly, setMonthly] = useState('');
  const [day, setDay] = useState('1');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/leases', { cache: 'no-store' });
      if (r.status === 401) { router.replace('/signin'); return; }
      const d = await r.json();
      if (d?.ok) setLeases(d.leases || []);
    } finally { setLoading(false); }
  }, [router]);
  useEffect(() => { load(); }, [load]);

  const payDue = async (dueId: string, authId?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await fetch('/api/leases/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_id: dueId, pay_auth_id: authId }) }).then((x) => x.json());
      if (d?.needs_mobile_auth) { setPendingDue(dueId); setPayAuthId(d.auth_id); return; }
      if (!d?.ok) { alert(d?.error === 'already_paid' ? 'Déjà payé.' : 'Paiement impossible, réessaie.'); return; }
      if (d.checkout_url) { setPayIntent(d.intent_id || null); setPayUrl(d.checkout_url); }
    } catch { alert('Erreur réseau.'); } finally { setBusy(false); }
  };
  const closePay = async () => {
    const intent = payIntent; setPayUrl(null); setPayIntent(null);
    if (intent) { try { const s = await fetch(`/api/wallet/topup/status?intent=${encodeURIComponent(intent)}`, { cache: 'no-store' }).then((r) => r.json()); if (s?.status === 'paid') alert('✅ Loyer réglé.'); } catch { /* */ } }
    load();
  };

  const createLease = async () => {
    setErr('');
    if (!tenant.trim() || !monthly.trim()) { setErr('Pseudo du locataire + montant requis.'); return; }
    setCreating(true);
    try {
      const d = await fetch('/api/leases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant: tenant.trim(), monthly: parseInt(monthly.replace(/[^0-9]/g, ''), 10) || 0, day: parseInt(day, 10) || 1, title: title.trim() || null }) }).then((x) => x.json());
      if (!d?.ok) { setErr(d?.error === 'tenant_not_found' ? 'Locataire introuvable (@pseudo).' : 'Échec de la création.'); return; }
      setShowNew(false); setTenant(''); setTitle(''); setMonthly(''); setDay('1'); load();
    } finally { setCreating(false); }
  };

  const field = 'w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2.5 text-[14px] text-white outline-none focus:border-red-400/50';

  return (
    <div className="min-h-[100svh] bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-20 flex items-center gap-2 px-3 h-14 border-b border-white/8 bg-[#0e0e12]/90 backdrop-blur">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full grid place-items-center text-white/80"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold inline-flex items-center gap-2"><Home className="w-5 h-5 text-red-300" /> Loyers</h1>
        <button onClick={() => setShowNew((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-red-600 text-white text-[13px] font-semibold"><Plus className="w-4 h-4" /> Bail</button>
      </header>

      <div className="max-w-xl mx-auto p-4 space-y-4">
        {showNew && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <p className="text-[13px] font-semibold text-white/85">Nouveau bail (vous êtes le bailleur)</p>
            <input className={field} placeholder="@pseudo du locataire" value={tenant} onChange={(e) => setTenant(e.target.value)} />
            <input className={field} placeholder="Désignation (ex : Studio Ivandry)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex gap-2">
              <input className={field} placeholder={`Loyer mensuel (${currencyLabel()})`} inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value.replace(/[^0-9]/g, ''))} />
              <input className={field + ' w-28 shrink-0'} placeholder="Jour" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
            <p className="text-[10.5px] text-white/40">Jour = date d'échéance chaque mois (1–28). Une échéance est générée chaque mois ; le locataire est relancé et paie en 1 clic.</p>
            {err && <p className="text-red-400 text-[12px]">{err}</p>}
            <button onClick={createLease} disabled={creating} className="w-full py-2.5 rounded-xl bg-red-600 text-white text-[14px] font-semibold disabled:opacity-50">{creating ? 'Création…' : 'Créer le bail'}</button>
          </div>
        )}

        {loading ? (
          <div className="grid place-items-center py-16 text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : leases.length === 0 ? (
          <p className="text-center text-white/40 text-[13.5px] py-16">Aucun bail. En tant que bailleur, crée-en un avec « + Bail ».</p>
        ) : leases.map((l) => (
          <div key={l.id} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="p-3 border-b border-white/8 flex items-center justify-between">
              <div>
                <p className="text-[14px] font-semibold">{l.title || 'Bail'}</p>
                <p className="text-[11.5px] text-white/50">{l.role === 'landlord' ? `Locataire : ${l.other_name || '—'}` : `Bailleur : ${l.other_name || '—'}`} · {formatMoney(l.monthly_cents)}/mois · le {l.day_of_month}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">{l.role === 'landlord' ? 'Bailleur' : 'Locataire'}</span>
            </div>
            <div className="divide-y divide-white/5">
              {l.dues.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[13px]">
                    {d.status === 'paid' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Clock className={`w-4 h-4 ${d.due_date < Date.now() ? 'text-amber-400' : 'text-white/40'}`} />}
                    <span className="text-white/85">{d.period}</span>
                    <span className="text-white/45">· {formatMoney(d.amount_cents)}</span>
                  </div>
                  {d.status === 'paid' ? (
                    <span className="text-[11px] text-emerald-300">Payé</span>
                  ) : l.role === 'tenant' ? (
                    <button onClick={() => payDue(d.id)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[12.5px] font-semibold disabled:opacity-50">Payer</button>
                  ) : (
                    <span className={`text-[11px] ${d.due_date < Date.now() ? 'text-amber-300' : 'text-white/40'}`}>{d.due_date < Date.now() ? 'En retard' : 'En attente'}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {payAuthId && <MobilePayAuthModal authId={payAuthId} onApproved={(id) => { setPayAuthId(null); if (pendingDue) { const p = pendingDue; setPendingDue(null); payDue(p, id); } }} onClose={() => setPayAuthId(null)} />}
      {payUrl && <PaymentFrame url={payUrl} onClose={closePay} />}
    </div>
  );
}
