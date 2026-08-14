'use client';

/**
 * Talk2Me — Super-Admin : file de vérification CNI des porteurs (Brique A).
 * Affiche photos recto/verso (servies en privé, admin only) + n° CNI + tél → vérifier/refuser.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2, CheckCircle2, XCircle, ShieldCheck } from '@/lib/icons';

interface Item { user_id: string; phone: string | null; username: string | null; display_name: string | null; cni_number_full: string; modes: string[]; submitted_at: number }

export default function AdminCni() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState('');

  const load = () => fetch('/api/admin/cni?status=pending', { cache: 'no-store' }).then((r) => {
    if (r.status === 403) { setForbidden(true); return null; }
    return r.json();
  }).then((d) => { if (d?.items) setItems(d.items); }).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const act = async (user_id: string, action: 'verify' | 'reject') => {
    let reason: string | undefined;
    if (action === 'reject') { reason = window.prompt('Raison du refus ?', 'CNI illisible') || undefined; if (reason === undefined) return; }
    setBusy(user_id);
    try {
      const d = await fetch('/api/admin/cni', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id, action, reason }) }).then((x) => x.json());
      if (d?.items) setItems(d.items);
    } finally { setBusy(''); }
  };

  if (loading) return <div className="fixed inset-0 grid place-items-center bg-[#F5F6F8] text-[#6A7585]"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (forbidden) return <div className="fixed inset-0 grid place-items-center bg-[#F5F6F8] text-[#6A7585] text-sm">Réservé aux super-admins.</div>;

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#2F343A] px-4 py-6 t2m-page">
      <button onClick={() => smartBack(router, '/admin')} className="text-[#6A7585] text-sm mb-4">← Retour</button>
      <div className="flex items-center gap-2 mb-1"><ShieldCheck className="w-5 h-5 text-amber-600" /><h1 className="text-xl font-bold">Vérification CNI — porteurs</h1></div>
      <p className="text-[13px] text-[#6A7585] mb-5">{items.length} dossier(s) en attente. Contrôle que la photo correspond au numéro, puis valide.</p>

      {items.length === 0 ? (
        <p className="text-[#9DAAB7] py-10 text-center">Aucun dossier en attente. ✓</p>
      ) : (
        <div className="space-y-5">
          {items.map((it) => (
            <div key={it.user_id} className="rounded-2xl border border-[#E5E8EC] bg-white shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold text-[#2F343A]">{it.display_name || '@' + (it.username || it.user_id.slice(0, 6))}</div>
                  <div className="text-[12px] text-[#6A7585]">📞 {it.phone || '—'} · CNI <span className="font-mono text-[#2F343A]">{it.cni_number_full}</span></div>
                  <div className="text-[11px] text-[#9DAAB7] mt-0.5">{it.modes.join(', ') || 'aucun mode'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {(['front', 'back'] as const).map((side) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={side} src={`/api/admin/cni/photo?user_id=${encodeURIComponent(it.user_id)}&side=${side}`} alt={side}
                    className="w-full h-36 object-cover rounded-lg border border-[#E5E8EC] bg-[#F0F1F3]" />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => act(it.user_id, 'verify')} disabled={busy === it.user_id}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0E9F6E] text-white font-semibold text-[13px] disabled:opacity-50">
                  {busy === it.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Valider
                </button>
                <button onClick={() => act(it.user_id, 'reject')} disabled={busy === it.user_id}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-300 bg-red-50 text-red-600 font-semibold text-[13px] disabled:opacity-50">
                  <XCircle className="w-4 h-4" /> Refuser
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
