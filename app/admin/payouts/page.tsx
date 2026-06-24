'use client';

/**
 * Talk2Me — Super-Admin : REVERSEMENT manuel (Pascal 2026-06-23).
 * Liste les bénéficiaires à payer (solde wallet = sommes dues, créditées par
 * l'escrow à la livraison). L'admin envoie le mobile money à la main depuis notre
 * compte marchand, puis clique « J'ai versé » → débite le wallet + trace + Telegram.
 * Bootstrap en attendant un payout automatique. Voir [[project_talk2me_papi_payment]].
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Banknote, Send, History } from 'lucide-react';

interface Owed { user_id: string; balance_cents: number; name: string | null; phone: string | null }
interface Recent { id: string; user_id: string; amount_cents: number; msisdn: string | null; created_at: number }

const fmt = (n: number) => n.toLocaleString('fr-FR') + ' Ar';

export default function AdminPayouts() {
  const router = useRouter();
  const [owed, setOwed] = useState<Owed[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState('');
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [tel, setTel] = useState<Record<string, string>>({});

  const load = () => fetch('/api/admin/payouts', { cache: 'no-store' }).then((r) => {
    if (r.status === 403) { setForbidden(true); return null; }
    return r.json();
  }).then((d) => {
    if (d?.owed) { setOwed(d.owed); setTotal(d.total_owed_cents || 0); setRecent(d.recent || []); }
  }).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const pay = async (b: Owed) => {
    const amount = Math.round(Number(amt[b.user_id] ?? b.balance_cents));
    if (!amount || amount < 1 || amount > b.balance_cents) { alert('Montant invalide (max = solde dû).'); return; }
    const msisdn = (tel[b.user_id] ?? b.phone ?? '').trim();
    if (!window.confirm(`Confirmer : tu AS DÉJÀ envoyé ${fmt(amount)} sur ${msisdn || 'son mobile money'} ?`)) return;
    setBusy(b.user_id);
    try {
      const d = await fetch('/api/admin/payouts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: b.user_id, amount_cents: amount, msisdn, note: 'Reversement manuel admin' }),
      }).then((x) => x.json());
      if (d?.ok) await load(); else alert('Échec : ' + (d?.error || '?'));
    } finally { setBusy(''); }
  };

  if (loading) return <div className="fixed inset-0 grid place-items-center bg-[#0e0e14] text-white/60"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (forbidden) return <div className="fixed inset-0 grid place-items-center bg-[#0e0e14] text-white/60 text-sm">Réservé aux super-admins.</div>;

  return (
    <div className="min-h-screen bg-[#0e0e14] text-white px-4 py-6 max-w-2xl mx-auto">
      <button onClick={() => router.back()} className="text-white/50 text-sm mb-4">← Retour</button>
      <div className="flex items-center gap-2 mb-1"><Banknote className="w-5 h-5 text-emerald-300" /><h1 className="text-xl font-bold">Reversement manuel</h1></div>
      <p className="text-[13px] text-white/55 mb-2">{owed.length} bénéficiaire(s) · <span className="text-emerald-300 font-semibold">{fmt(total)}</span> à reverser au total.</p>
      <p className="text-[12px] text-amber-200/70 mb-5">Tu envoies le mobile money toi-même depuis notre compte marchand, PUIS tu cliques « J'ai versé » pour solder. Aucun argent n'est envoyé par l'appli.</p>

      {owed.length === 0 ? (
        <p className="text-white/40 py-10 text-center">Rien à reverser. ✓</p>
      ) : (
        <div className="space-y-3">
          {owed.map((b) => (
            <div key={b.user_id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold">{b.name || b.user_id.slice(0, 8)}</div>
                  <div className="text-[12px] text-white/55">Solde dû : <span className="text-emerald-300 font-semibold">{fmt(b.balance_cents)}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input inputMode="numeric" value={amt[b.user_id] ?? String(b.balance_cents)} onChange={(e) => setAmt((s) => ({ ...s, [b.user_id]: e.target.value.replace(/\D/g, '') }))}
                  placeholder="Montant (Ar)" className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                <input inputMode="tel" value={tel[b.user_id] ?? b.phone ?? ''} onChange={(e) => setTel((s) => ({ ...s, [b.user_id]: e.target.value }))}
                  placeholder="N° mobile money" className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={() => pay(b)} disabled={busy === b.user_id}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-black font-semibold text-[13px] disabled:opacity-50">
                {busy === b.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} J'ai versé
              </button>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3 text-white/60"><History className="w-4 h-4" /><h2 className="text-sm font-semibold">Derniers reversements</h2></div>
          <div className="space-y-1.5">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-[12px] text-white/55 border-b border-white/5 pb-1.5">
                <span>{r.user_id.slice(0, 8)}{r.msisdn ? ' · ' + r.msisdn : ''}</span>
                <span className="text-white/75">{fmt(r.amount_cents)} · {new Date(r.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
