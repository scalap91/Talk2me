'use client';

/** Talk2Me — Shop › Adresse de livraison (#429). Formulaire réel, sauvegardé. */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { ChevronLeft, Check, Loader2 } from '@/lib/icons';
import ShopNav from '@/components/shop/ShopNav';

const FIELDS = [
  { k: 'full_name', label: 'Nom complet', ph: 'Pascal Dupont' },
  { k: 'line1', label: 'Adresse', ph: '12 rue des Lilas' },
  { k: 'zip', label: 'Code postal', ph: '75011' },
  { k: 'city', label: 'Ville', ph: 'Paris' },
  { k: 'country', label: 'Pays', ph: 'France' },
  { k: 'phone', label: 'Téléphone', ph: '06 12 34 56 78' },
] as const;

export default function AdressePage() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/shop/address', { cache: 'no-store' })
      .then((r) => (r.status === 401 ? router.push('/signin') : r.json()))
      .then((d) => d?.address && setForm(d.address))
      .catch(() => {});
  }, [router]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await fetch('/api/shop/address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-[100svh] bg-[var(--t2m-paper)] text-[var(--t2m-ink)] t2m-narrow pb-24 md:pb-6">
      <ShopNav />
      <header className="sticky top-0 z-10 flex items-center gap-2 h-14 px-3 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/90 backdrop-blur-xl">
        <button onClick={() => smartBack(router, '/shop')} className="p-1 text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink)]"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold">Adresse de livraison</h1>
      </header>
      <div className="p-4 space-y-3">
        {FIELDS.map((f) => (
          <div key={f.k}>
            <label className="text-[12px] text-[var(--t2m-ink-3)]">{f.label}</label>
            <input
              value={form[f.k] || ''}
              onChange={(e) => setForm((s) => ({ ...s, [f.k]: e.target.value }))}
              placeholder={f.ph}
              className="mt-1 w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[14px] text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none focus:border-[var(--t2m-primary)]"
            />
          </div>
        ))}
        <button
          onClick={save}
          disabled={saving}
          className="w-full mt-2 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saved ? 'Enregistré' : 'Enregistrer'}
        </button>
        <p className="text-[11px] text-[var(--t2m-ink-3)] text-center pt-1">
          Servira à livrer tes commandes. On ne la partage jamais.
        </p>
      </div>
    </div>
  );
}
