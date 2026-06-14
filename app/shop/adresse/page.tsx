'use client';

/** Talk2Me — Shop › Adresse de livraison (#429). Formulaire réel, sauvegardé. */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Check, Loader2 } from 'lucide-react';

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
    <div className="min-h-[100dvh] bg-[#0a0a0d] text-white max-w-md mx-auto">
      <header className="sticky top-0 z-10 flex items-center gap-2 h-14 px-3 border-b border-white/8 bg-[#0a0a0d]/90 backdrop-blur-xl">
        <button onClick={() => router.back()} className="p-1 text-white/60 hover:text-white"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold">Adresse de livraison</h1>
      </header>
      <div className="p-4 space-y-3">
        {FIELDS.map((f) => (
          <div key={f.k}>
            <label className="text-[12px] text-white/50">{f.label}</label>
            <input
              value={form[f.k] || ''}
              onChange={(e) => setForm((s) => ({ ...s, [f.k]: e.target.value }))}
              placeholder={f.ph}
              className="mt-1 w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[14px] text-white placeholder-white/30 outline-none focus:border-red-400/50"
            />
          </div>
        ))}
        <button
          onClick={save}
          disabled={saving}
          className="w-full mt-2 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saved ? 'Enregistré' : 'Enregistrer'}
        </button>
        <p className="text-[11px] text-white/35 text-center pt-1">
          Servira à livrer tes commandes. On ne la partage jamais.
        </p>
      </div>
    </div>
  );
}
