'use client';

/**
 * LOCAT👀 — « Mes locations » : liste de MES biens à louer + bouton « + » qui dévoile le
 * formulaire (doctrine composer : écran « Mes X » = liste + bouton +, jamais direct au form).
 * Un bien créé = shop_product rental=1 (recycle la boutique SHEIN, ZÉRO annonce). Il apparaît
 * ensuite dans la vitrine /locat via le lecteur Boutique unique.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReviewForm } from '@/components/reviews/Reviews'; // AVIS : le locataire note le bien après location

interface Item { id: string; title: string; image: string | null; price_label: string | null; category: string; rate_unit?: string | null }
interface Bk { id: string; item_id: string; title: string; start_date: string; end_date: string; days: number; total_label: string; status: string; deposit_mode?: string; caution_cents?: number; caution_label?: string }
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
  const [reviewFor, setReviewFor] = useState<Bk | null>(null); // réservation dont on écrit l'avis
  const [validating, setValidating] = useState<Bk | null>(null); // retour caution : RAS vs Dommage
  const [dmgAmount, setDmgAmount] = useState('');
  const [notice, setNotice] = useState(''); // confirmation (ex : réclamation ouverte)
  // form
  const [image, setImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [rateUnit, setRateUnit] = useState('jour');
  const [deposit, setDeposit] = useState('');
  const [depositMode, setDepositMode] = useState<'none' | 'engagement' | 'cash'>('engagement'); // défaut = engagement (anti-frein Mada)
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

  const bkAction = async (id: string, action: 'returned' | 'validate', extra?: { damage?: boolean; damageCents?: number }) => {
    const r = await fetch('/api/locat/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r?.claim_opened) setNotice('Réclamation ouverte : elle part au circuit chef → validateur, adossée à l\'identité du locataire. Aucun prélèvement automatique.');
    setValidating(null); setDmgAmount('');
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

  const reset = () => { setImage(''); setTitle(''); setCategory(''); setPrice(''); setRateUnit('jour'); setDeposit(''); setDepositMode('engagement'); setDescription(''); setErr(''); };

  const submit = async () => {
    if (!image || !title.trim() || !price) { setErr('Photo, titre et tarif sont obligatoires.'); return; }
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/locat/items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: image, title, category: category || 'Autres', price: Number(price), rate_unit: rateUnit, deposit_mode: depositMode, deposit: depositMode === 'none' ? 0 : (Number(deposit) || 0), description }),
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

            {/* Caution : 3 modes (défaut Engagement = anti-frein Mada, aucun cash bloqué) */}
            <div>
              <div className="text-[12px] font-semibold text-[var(--t2m-ink-2)] mb-1">Caution</div>
              <div className="flex gap-1.5">
                {(['none', 'engagement', 'cash'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setDepositMode(m)} className={'flex-1 py-2 rounded-lg text-[12.5px] font-semibold border ' + (depositMode === m ? 'bg-[var(--t2m-primary)] text-white border-[var(--t2m-primary)]' : 'bg-white text-[var(--t2m-ink)] border-[var(--t2m-line)]')}>
                    {m === 'none' ? 'Aucune' : m === 'engagement' ? 'Engagement' : 'Cash bloqué'}
                  </button>
                ))}
              </div>
              {depositMode !== 'none' && <input className={inputCls + ' mt-2'} type="number" inputMode="numeric" placeholder="Montant de la caution (Ar)" value={deposit} onChange={(e) => setDeposit(e.target.value)} />}
              <div className="text-[11px] text-[var(--t2m-ink-2)] mt-1 leading-snug">
                {depositMode === 'none' ? 'Pas de caution.' : depositMode === 'engagement' ? "Aucun cash bloqué : le locataire (identité vérifiée) s'engage à couvrir jusqu'à ce montant en cas de dommage. Recommandé à Mada." : 'Cash bloqué au paiement, rendu au retour (ou capté si dommage).'}
              </div>
            </div>
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
              <div key={k.id} className="rounded-xl border border-[var(--t2m-line)] bg-white p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] text-[var(--t2m-ink)] truncate">{k.title}</div>
                    <div className="text-[12px] text-[var(--t2m-ink-2)]">{k.start_date} → {k.end_date} · {k.days} j · {k.total_label}</div>
                    <div className="text-[11.5px] text-[var(--t2m-primary)] mt-0.5">{BK_STATUS[k.status] || k.status}</div>
                  </div>
                  {(k.status === 'accepted' || k.status === 'pending') && <button onClick={() => bkAction(k.id, 'returned')} className="shrink-0 px-3 py-2 rounded-lg bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[12px] font-semibold text-[var(--t2m-ink)]">Retour effectué</button>}
                  {(k.status === 'completed' || k.status === 'returned') && reviewFor?.id !== k.id && <button onClick={() => setReviewFor(k)} className="shrink-0 px-3 py-2 rounded-lg bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[12px] font-semibold text-[var(--t2m-ink)]">★ Laisser un avis</button>}
                </div>
                {reviewFor?.id === k.id && (
                  <div className="mt-2.5">
                    <ReviewForm target={`locat:${k.item_id}`} contextRef={k.id} onDone={() => setReviewFor(null)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Demandes de location reçues (côté PROPRIÉTAIRE) — valider = encaisser l'escrow */}
        {ownerBk.length > 0 && (
          <div className="mt-6">
            <div className="font-bold text-[14px] text-[var(--t2m-ink)] mb-2">📥 Demandes de location reçues</div>
            {notice && <div className="mb-2 rounded-lg bg-[var(--t2m-wash)] border border-[var(--t2m-line)] p-2.5 text-[12px] text-[var(--t2m-ink)] flex items-start justify-between gap-2"><span>⚖️ {notice}</span><button onClick={() => setNotice('')} aria-label="Fermer" className="shrink-0 text-[var(--t2m-ink-2)]">✕</button></div>}
            {ownerBk.map((k) => {
              const mode = k.deposit_mode || 'none';
              const isEng = mode === 'engagement';
              const hasCaution = (mode === 'cash' || mode === 'engagement') && (k.caution_cents || 0) > 0;
              const canValidate = k.status === 'returned' || k.status === 'accepted';
              const isValidating = validating?.id === k.id;
              return (
              <div key={k.id} className="rounded-xl border border-[var(--t2m-line)] bg-white p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] text-[var(--t2m-ink)] truncate">{k.title}</div>
                    <div className="text-[12px] text-[var(--t2m-ink-2)]">{k.start_date} → {k.end_date} · {k.days} j · {k.total_label}</div>
                    <div className="text-[11.5px] text-[var(--t2m-primary)] mt-0.5">{BK_STATUS[k.status] || k.status}{hasCaution && ` · caution ${k.caution_label}${isEng ? ' (engagement)' : ''}`}</div>
                  </div>
                  {canValidate && !isValidating && (
                    <button onClick={() => (hasCaution ? (setValidating(k), setDmgAmount('')) : bkAction(k.id, 'validate'))} className="shrink-0 px-3 py-2 rounded-lg bg-[var(--t2m-primary)] text-white text-[12px] font-semibold">Valider le retour</button>
                  )}
                </div>
                {isValidating && (
                  <div className="mt-3 pt-3 border-t border-[var(--t2m-line)]">
                    <div className="text-[12.5px] text-[var(--t2m-ink)] mb-2">
                      {isEng
                        ? <>Bien rendu en bon état&nbsp;? Aucun cash n&apos;est bloqué. En cas de dommage, ouvrez une <b>réclamation</b> (jusqu&apos;à <b>{k.caution_label}</b>)&nbsp;: le circuit chef&nbsp;→&nbsp;validateur tranchera, adossé à l&apos;identité du locataire.</>
                        : <>Bien rendu en bon état&nbsp;? La caution de <b>{k.caution_label}</b> sera rendue au locataire. En cas de dommage, indiquez le montant à retenir.</>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => bkAction(k.id, 'validate', { damage: false })} className="px-3 py-2 rounded-lg bg-[var(--t2m-primary)] text-white text-[12px] font-semibold">{isEng ? '✅ RAS · rien à signaler' : '✅ RAS · rendre la caution'}</button>
                      <div className="flex items-center gap-1">
                        <input type="number" inputMode="numeric" placeholder={isEng ? 'Montant réclamé (Ar)' : 'Montant retenu (Ar)'} value={dmgAmount} onChange={(e) => setDmgAmount(e.target.value)} className="w-40 px-2 py-2 rounded-lg border border-[var(--t2m-line)] text-[12px]" />
                        <button disabled={!(Number(dmgAmount) > 0)} onClick={() => bkAction(k.id, 'validate', { damage: true, damageCents: Math.min(k.caution_cents || 0, Math.round(Number(dmgAmount) || 0)) })} className="px-3 py-2 rounded-lg bg-red-600 text-white text-[12px] font-semibold disabled:opacity-40">{isEng ? '⚠️ Signaler · réclamation' : '⚠️ Dommage'}</button>
                      </div>
                      <button onClick={() => { setValidating(null); setDmgAmount(''); }} className="px-3 py-2 rounded-lg bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[12px] font-semibold text-[var(--t2m-ink)]">Annuler</button>
                    </div>
                    <div className="text-[11px] text-[var(--t2m-ink-2)] mt-1.5">{isEng ? 'Montant plafonné à l\'engagement. Aucun prélèvement automatique : le validateur décide.' : 'Montant retenu plafonné à la caution ; le reste est rendu au locataire.'}</div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
