'use client';

/**
 * LOCAT👀 — « Mes locations » : liste de MES biens à louer + bouton « + » qui dévoile le
 * formulaire (doctrine composer : écran « Mes X » = liste + bouton +, jamais direct au form).
 * Un bien créé = shop_product rental=1 (recycle la boutique SHEIN, ZÉRO annonce). Il apparaît
 * ensuite dans la vitrine /locat via le lecteur Boutique unique.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Item { id: string; title: string; image: string | null; price_label: string | null; category: string; rate_unit?: string | null }
interface Bk { id: string; title: string; start_date: string; end_date: string; days: number; total_label: string; status: string }
const BK_STATUS: Record<string, string> = { pending: 'En attente de paiement', accepted: 'Payée · en cours', returned: 'Rendu · à valider', completed: 'Terminée', cancelled: 'Annulée' };

// Catégories LOCAT — SUGGESTIONS extensibles (champ libre, tu peux taper n'importe quoi).
const CAT_SUGGESTIONS = [
  'Robe de mariée', 'Robe de soirée', 'Costume', 'Tenue traditionnelle', 'Décoration événementielle',
  'Tables & chaises', 'Tente', 'Sono', 'Matériel photo/vidéo', 'Outillage', 'BTP & bétonnière',
  'Groupe électrogène', 'Matériel agricole', 'Informatique', 'Électronique', 'Vélo', 'Véhicule',
];
const RATE_UNITS = ['heure', 'jour', 'semaine', 'week-end'];

export default function MesLocationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [renterBk, setRenterBk] = useState<Bk[]>([]);
  const [ownerBk, setOwnerBk] = useState<Bk[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  // form
  const [image, setImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [rateUnit, setRateUnit] = useState('jour');
  const [deposit, setDeposit] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/locat/items', { cache: 'no-store' });
      if (r.status === 401) { router.replace('/signin'); return; }
      const d = await r.json();
      if (d?.ok) setItems(d.items || []);
      const rb = await fetch('/api/locat/bookings', { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null));
      if (rb?.ok) { setRenterBk(rb.as_renter || []); setOwnerBk(rb.as_owner || []); }
    } catch { /* */ } finally { setLoading(false); }
  };

  const bkAction = async (id: string, action: 'returned' | 'validate') => {
    await fetch('/api/locat/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
    load();
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickPhoto = async (f: File) => {
    setUploading(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d?.url) setImage(d.url); else setErr("Échec de l'upload photo");
    } catch { setErr("Échec de l'upload photo"); } finally { setUploading(false); }
  };

  const reset = () => { setImage(''); setTitle(''); setCategory(''); setPrice(''); setRateUnit('jour'); setDeposit(''); setDescription(''); setErr(''); };

  const submit = async () => {
    if (!image || !title.trim() || !price) { setErr('Photo, titre et tarif sont obligatoires.'); return; }
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/locat/items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: image, title, category: category || 'Autres', price: Number(price), rate_unit: rateUnit, deposit: Number(deposit) || 0, description }),
      });
      const d = await r.json();
      if (d?.ok) { reset(); setOpen(false); await load(); }
      else setErr('Erreur : ' + (d?.error || 'création'));
    } catch { setErr('Erreur réseau'); } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Retirer ce bien de la location ?')) return;
    await fetch('/api/locat/items', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    load();
  };

  const inputCls = 'w-full rounded-xl border border-[var(--t2m-line)] bg-white px-3 py-2.5 text-[15px] text-[var(--t2m-ink)] outline-none focus:border-[var(--t2m-primary)]';

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--t2m-paper)] flex flex-col">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-2 h-14 px-3 border-b border-[var(--t2m-line)] bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={() => router.push('/locat')} aria-label="Retour" className="w-9 h-9 grid place-items-center text-[var(--t2m-ink)]">‹</button>
        <div className="font-extrabold text-[17px] text-[var(--t2m-ink)]" style={{ fontFamily: "'Outfit',sans-serif" }}>🔑 Mes locations</div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {/* Bouton + créer */}
        {!open && (
          <button onClick={() => setOpen(true)} className="w-full mb-3 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[var(--t2m-primary)] text-white font-bold text-[15px] active:scale-[0.99]">
            + Mettre un bien en location
          </button>
        )}

        {/* Formulaire */}
        {open && (
          <div className="mb-4 rounded-2xl border border-[var(--t2m-line)] bg-white p-3 flex flex-col gap-2.5">
            <div className="font-bold text-[15px] text-[var(--t2m-ink)]">Nouveau bien à louer</div>
            {/* Photo */}
            <button type="button" onClick={() => fileRef.current?.click()} className="relative w-full aspect-[4/3] rounded-xl border border-dashed border-[var(--t2m-line)] bg-[var(--t2m-wash)] grid place-items-center overflow-hidden">
              {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : <span className="text-[var(--t2m-ink-2)] text-sm">{uploading ? 'Envoi…' : '📷 Ajouter une photo'}</span>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); }} />

            <input className={inputCls} placeholder="Titre (ex. Robe de mariée dentelle)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />

            <input className={inputCls} list="locat-cats" placeholder="Catégorie (tape la tienne — extensible)" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />
            <datalist id="locat-cats">{CAT_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>

            <div className="flex gap-2">
              <input className={inputCls + ' flex-1'} type="number" inputMode="numeric" placeholder="Tarif (Ar)" value={price} onChange={(e) => setPrice(e.target.value)} />
              <select className={inputCls + ' w-32'} value={rateUnit} onChange={(e) => setRateUnit(e.target.value)}>
                {RATE_UNITS.map((u) => <option key={u} value={u}>/ {u}</option>)}
              </select>
            </div>

            <input className={inputCls} type="number" inputMode="numeric" placeholder="Caution (Ar) — optionnelle" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            <textarea className={inputCls} rows={3} placeholder="Description, état, conditions…" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />

            {err && <div className="text-[13px] text-red-600">{err}</div>}
            <div className="flex gap-2">
              <button onClick={() => { reset(); setOpen(false); }} className="flex-1 py-3 rounded-xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink)] font-semibold">Annuler</button>
              <button onClick={submit} disabled={saving || uploading} className="flex-1 py-3 rounded-xl bg-[var(--t2m-primary)] text-white font-bold disabled:opacity-50">{saving ? 'Publication…' : 'Publier'}</button>
            </div>
          </div>
        )}

        {/* Liste de mes biens */}
        {loading ? (
          <div className="text-center text-[var(--t2m-ink-2)] py-10">Chargement…</div>
        ) : items.length === 0 && !open ? (
          <div className="text-center text-[var(--t2m-ink-2)] py-10">Aucun bien à louer pour l'instant.<br />Tape « + » pour en ajouter un.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((it) => (
              <div key={it.id} className="rounded-2xl border border-[var(--t2m-line)] bg-white overflow-hidden">
                {it.image && <img src={it.image} alt={it.title} className="w-full aspect-[3/4] object-cover" />}
                <div className="p-2.5">
                  <div className="font-semibold text-[14px] text-[var(--t2m-ink)] line-clamp-1">{it.title}</div>
                  <div className="text-[13px] font-bold text-[var(--t2m-primary)] mt-0.5">{it.price_label}</div>
                  <div className="text-[11px] text-[var(--t2m-ink-2)] mt-0.5">{it.category}</div>
                  <button onClick={() => del(it.id)} className="mt-2 w-full py-1.5 rounded-lg bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[12px] text-red-600 font-semibold">Retirer</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mes réservations (côté LOCATAIRE) */}
        {renterBk.length > 0 && (
          <div className="mt-6">
            <div className="font-bold text-[14px] text-[var(--t2m-ink)] mb-2">🔑 Mes réservations</div>
            {renterBk.map((k) => (
              <div key={k.id} className="rounded-xl border border-[var(--t2m-line)] bg-white p-3 mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[14px] text-[var(--t2m-ink)] truncate">{k.title}</div>
                  <div className="text-[12px] text-[var(--t2m-ink-2)]">{k.start_date} → {k.end_date} · {k.days} j · {k.total_label}</div>
                  <div className="text-[11.5px] text-[var(--t2m-primary)] mt-0.5">{BK_STATUS[k.status] || k.status}</div>
                </div>
                {(k.status === 'accepted' || k.status === 'pending') && <button onClick={() => bkAction(k.id, 'returned')} className="shrink-0 px-3 py-2 rounded-lg bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[12px] font-semibold text-[var(--t2m-ink)]">Retour effectué</button>}
              </div>
            ))}
          </div>
        )}

        {/* Demandes de location reçues (côté PROPRIÉTAIRE) — valider = encaisser l'escrow */}
        {ownerBk.length > 0 && (
          <div className="mt-6">
            <div className="font-bold text-[14px] text-[var(--t2m-ink)] mb-2">📥 Demandes de location reçues</div>
            {ownerBk.map((k) => (
              <div key={k.id} className="rounded-xl border border-[var(--t2m-line)] bg-white p-3 mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[14px] text-[var(--t2m-ink)] truncate">{k.title}</div>
                  <div className="text-[12px] text-[var(--t2m-ink-2)]">{k.start_date} → {k.end_date} · {k.days} j · {k.total_label}</div>
                  <div className="text-[11.5px] text-[var(--t2m-primary)] mt-0.5">{BK_STATUS[k.status] || k.status}</div>
                </div>
                {(k.status === 'returned' || k.status === 'accepted') && <button onClick={() => bkAction(k.id, 'validate')} className="shrink-0 px-3 py-2 rounded-lg bg-[var(--t2m-primary)] text-white text-[12px] font-semibold">Valider le retour</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
