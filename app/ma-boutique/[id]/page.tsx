'use client';

/**
 * Talk2Me — Gestion d'une PETITE BOUTIQUE (photos+prix), créée dans l'espace chat.
 * (Pascal 2026-06-09) Le commerçant ajoute ses photos avec prix, la met dans sa
 * STORY (contacts), peut BOOSTER sur la home (audience élargie, payé au Wallet),
 * et a une messagerie dédiée. Façon WhatsApp Business.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Loader2, Megaphone, Rocket, Send, MessageCircle, Sparkles, Eye, MapPin } from '@/lib/icons';
import BoutiqueSheet from '@/components/feed/BoutiqueSheet';
import BoutiqueItemSheet from '@/components/feed/BoutiqueItemSheet';
import DepositAnnonceSheet from '@/components/feed/DepositAnnonceSheet';
import SuperCardView from '@/components/cards/SuperCardView';
import { parseCard, makeCard, type SuperCard } from '@/lib/cards/supercard';
import { goBack } from '@/lib/client/go-back';
import { ANNONCE_CATEGORIES } from '@/lib/annonce-categories';

interface Item {
  id: string; image_url: string; label: string | null; price_cents: number; description?: string | null;
  category?: string | null; attributes?: string | null; photos?: string | null; quantity?: number | null;
  annonce_on?: number; annonce_category?: string | null; annonce_city?: string | null;
  annonce_lat?: number | null; annonce_lng?: number | null; annonce_until?: number | null;
  dotcard?: string | null;
}

// Card OS : la tuile gestion lit le `.card` stocké de l'article ; fallback minimal.
function readItemCard(it: Item): SuperCard {
  if (typeof it.dotcard === 'string' && it.dotcard) {
    const r = parseCard(it.dotcard);
    if (r.ok && r.card) return r.card;
  }
  return makeCard({
    id: it.id, types: ['product'], channel: 'boutique', title: it.label || 'Article',
    ...(it.image_url ? { images: [it.image_url] } : {}),
    ...(it.description ? { text: { body: it.description } } : {}),
    price: { amount: it.price_cents, currency: 'MGA' },
    ...(it.category ? { categories: [it.category] } : {}),
  });
}
interface Shop { id: string; name: string; description: string | null; public_key: string; wallet_enabled: boolean; kind?: string; lat?: number | null; lng?: number | null; cover_url?: string | null; category?: string | null; address?: string | null }

/** Seuil « description complète » pour apparaître dans les Petites annonces
 *  (doit rester aligné sur MIN_ANNONCE_DESC côté serveur, lib/simple-shop.ts). */
const MIN_ANNONCE_DESC = 20;

export default function MaBoutiquePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState('');
  const [label, setLabel] = useState('');
  const [cat, setCat] = useState(''); // catégorie du nouvel article (Mode, Maison…)
  const [query, setQuery] = useState(''); // recherche dans la boutique
  const [addNew, setAddNew] = useState(false); // ouvre le formulaire annonce pour un NOUVEL article
  // Aperçu individuel d'un article (ré-éditer + (dés)activer dans les Petites annonces). Pascal 2026-06-20
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [desc, setDesc] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);
  const [descSaved, setDescSaved] = useState(false);
  const [refining, setRefining] = useState(false);
  const [descBeforeRefine, setDescBeforeRefine] = useState<string | null>(null);
  const [preview, setPreview] = useState(false); // aperçu vue client (rendu vitrine)
  const [pendingImg, setPendingImg] = useState<string | null>(null);
  // Photo brute conservée DANS L'ÉDITEUR uniquement (Pascal 2026-06-11 : le public
  // ne voit que la version nettoyée, jamais le rendu sale). Sert au « ↩ Original ».
  const [pendingOriginal, setPendingOriginal] = useState<string | null>(null);
  const [cleaningPending, setCleaningPending] = useState(false);
  const [cleaningId, setCleaningId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Nettoyage IA : détoure / recadre / éclaircit la photo (fond propre type vitrine).
  const cleanImage = useCallback(async (imageUrl: string): Promise<string | null> => {
    try {
      const r = await fetch('/api/boutique/enrich', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, cleanOnly: true }),
      });
      const d = await r.json();
      return r.ok && d.cleanedUrl ? (d.cleanedUrl as string) : null;
    } catch { return null; }
  }, []);

  // Nettoie la photo en attente (avant ajout). Garde l'originale dans l'éditeur.
  const cleanPending = useCallback(async () => {
    if (!pendingImg) return;
    setCleaningPending(true);
    const cleaned = await cleanImage(pendingImg);
    if (cleaned) { setPendingOriginal((o) => o ?? pendingImg); setPendingImg(cleaned); }
    setCleaningPending(false);
  }, [pendingImg, cleanImage]);

  // Nettoie une photo DÉJÀ ajoutée et remplace l'image de l'article.
  const cleanExisting = useCallback(async (itemId: string, imageUrl: string) => {
    setCleaningId(itemId);
    const cleaned = await cleanImage(imageUrl);
    if (cleaned) {
      await fetch(`/api/simple-shop/${id}/item`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, image_url: cleaned }),
      }).catch(() => {});
      setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, image_url: cleaned } : it));
      try { await fetch(`/api/simple-shop/${id}/publish`, { method: 'POST' }); } catch { /* best-effort */ }
    }
    setCleaningId(null);
  }, [id, cleanImage]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/simple-shop/${id}`, { cache: 'no-store' });
      if (r.status === 401) { router.replace('/signin'); return; }
      const d = await r.json();
      if (d?.ok) { setShop(d.shop); setItems(d.items || []); setDesc(d.shop?.description || ''); }
    } finally { setLoading(false); }
  }, [id, router]);

  const saveDesc = useCallback(async () => {
    setSavingDesc(true); setDescSaved(false);
    try {
      const r = await fetch(`/api/simple-shop/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc.trim() }),
      });
      if (r.ok) { setShop((s) => s ? { ...s, description: desc.trim() } : s); setDescSaved(true); setTimeout(() => setDescSaved(false), 2500); }
    } finally { setSavingDesc(false); }
  }, [id, desc]);

  // L'IA reformule proprement le texte ÉCRIT PAR LE VENDEUR, sans rien ajouter
  // ni retirer (Pascal 2026-06-11). On garde la version d'avant pour annuler.
  const refineDesc = useCallback(async () => {
    if (desc.trim().length < 10 || refining) return;
    setRefining(true);
    try {
      const r = await fetch('/api/boutique/refine-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: desc.trim() }),
      });
      const d = await r.json();
      if (r.ok && d.refined && d.changed) { setDescBeforeRefine(desc); setDesc(d.refined); }
    } finally { setRefining(false); }
  }, [desc, refining]);
  useEffect(() => { load(); }, [load]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d?.url) { setPendingImg(d.url); setPendingOriginal(null); }
    } finally { setBusy(false); }
  };

  const addItem = async () => {
    if (!pendingImg || !price) return;
    setBusy(true);
    try {
      await fetch(`/api/simple-shop/${id}/item`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: pendingImg, price: parseFloat(price), label: label.trim() || null, category: cat || null }),
      });
      setPendingImg(null); setPendingOriginal(null); setPrice(''); setLabel(''); setCat('');
      await load();
      autoPublish(); // 1er article → publie la vitrine 3D dans le Hub
    } finally { setBusy(false); }
  };

  const removeItem = async (itemId: string) => {
    await fetch(`/api/simple-shop/${id}/item`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId }) });
    await load();
    autoPublish(); // maj de la vitrine (média)
  };

  // Publication AUTO de la vitrine 3D (carte [VITRINE:] → /boutique3d) à chaque
  // changement d'article. Silencieux, best-effort. Pascal 2026-06-20.
  const autoPublish = useCallback(async () => {
    try { await fetch(`/api/simple-shop/${id}/publish`, { method: 'POST' }); } catch { /* best-effort */ }
  }, [id]);

  // Édition adaptée au TYPE : plat / service / offre d'emploi / article de boutique.
  const isPlat = shop?.kind === 'plat_maison';
  const isService = shop?.kind === 'service';
  const isEmploi = shop?.kind === 'emploi';
  const isBoutique = !isPlat && !isService && !isEmploi;
  const noun = isPlat ? 'plat' : isService ? 'service' : isEmploi ? 'offre' : 'article';
  const addLabel = isEmploi ? 'Ajouter une offre' : isService ? 'Ajouter un service' : isPlat ? 'Ajouter un plat' : 'Ajouter un article';
  const frontTitle = isPlat ? 'Mes plats maison' : isService ? 'Mon service' : isEmploi ? 'Mes offres' : 'Ma boutique';
  const [geoBusy, setGeoBusy] = useState(false);
  const setGeo = async () => {
    if (!('geolocation' in navigator)) return;
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        await fetch(`/api/simple-shop/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude }),
        });
        setShop((s) => s ? { ...s, lat: p.coords.latitude, lng: p.coords.longitude } : s);
        autoPublish();
      } finally { setGeoBusy(false); }
    }, () => setGeoBusy(false), { enableHighAccuracy: true, timeout: 8000 });
  };

  const eur = (c: number) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0 }) + ' €';

  return (
    <div className="flex flex-col h-[100svh] t2m-page bg-[var(--t2m-paper)] text-[var(--t2m-ink)] overflow-hidden">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/85 px-3 backdrop-blur-xl">
        <button onClick={() => goBack()} aria-label="Retour" className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)]"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate">{shop?.name || frontTitle}</div>
          <div className="text-[11px] text-[var(--t2m-ink-3)]">{items.length} {noun}{items.length > 1 ? 's' : ''} · {isPlat ? 'plats maison · 500 m' : isService ? 'prestations' : isEmploi ? 'offres d’emploi' : 'boutique perso'}</div>
        </div>
        {shop?.public_key && (
          <button
            onClick={() => setPreview(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-red-600 text-white text-[12.5px] font-semibold active:scale-95"
          >
            <Eye className="w-4 h-4" /> Aperçu
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-6">
        {/* SERVICE / EMPLOI : aperçu de la devanture (comme la vue client) + nom éditable.
            Pas d'édition de description ici — elle est saisie en page 1. Pascal 2026-07-05. */}
        {(isService || isEmploi) && (
          <div className="m-3 rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] overflow-hidden">
            {shop?.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.cover_url} alt="" className="w-full h-32 object-cover" />
            )}
            <div className="p-3.5">
              <div className="text-[10px] uppercase tracking-wide text-[var(--t2m-ink-3)] mb-1.5">Ta devanture — aperçu</div>
              <div className="text-[17px] font-semibold text-[var(--t2m-ink)] leading-tight">{shop?.name}</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11.5px]">
                {shop?.category && <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-200 border border-sky-400/25">{shop.category}</span>}
                {shop?.address && <span className="text-[var(--t2m-ink-3)]">📍 {shop.address}</span>}
              </div>
              {shop?.description && <p className="text-[12.5px] text-[var(--t2m-ink-3)] mt-2 leading-relaxed">{shop.description}</p>}
              <p className="text-[10.5px] text-[var(--t2m-ink-3)] mt-2.5">Le nom, le métier et la description se modifient à la création (page 1).</p>
            </div>
          </div>
        )}

        {/* DESCRIPTION (boutique / plat) — écrite par le vendeur, l'IA la remet propre. */}
        {(isBoutique || isPlat) && (
        <div className="m-3 p-3 rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)]">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[12px] text-[var(--t2m-ink-3)]">{isPlat ? 'Décris tes plats (ce que tu cuisines…)' : isService ? 'Décris ton service (ton métier, ta zone…)' : isEmploi ? 'Décris ce que tu proposes (le poste, le lieu…)' : 'Décris ta boutique (ce que tu vends, ta ville…)'}</p>
            {isBoutique && <span className={`text-[11px] ${desc.trim().length >= MIN_ANNONCE_DESC ? 'text-emerald-300/80' : 'text-[var(--t2m-ink-3)]'}`}>{desc.trim().length}/{MIN_ANNONCE_DESC}</span>}
          </div>
          <textarea
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setDescBeforeRefine(null); }}
            rows={3}
            maxLength={300}
            placeholder={isPlat ? 'Ex : Mafé, riz gras, jus de bissap — faits maison, à emporter.' : isService ? 'Ex : Plomberie à Antananarivo — dépannage, installation, rénovation. Rapide et soigné.' : isEmploi ? 'Ex : Recherche vendeur(se) boutique à Tana, temps plein, expérience appréciée.' : 'Ex : Vêtements femme tendance à Casablanca, tailles S à XL, livraison rapide.'}
            className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-[var(--t2m-primary)] resize-none leading-relaxed"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={refineDesc}
              disabled={desc.trim().length < 10 || refining}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-red-600 text-white text-[12px] font-semibold disabled:opacity-40"
            >
              {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {refining ? 'Reformulation…' : '✨ Reformuler'}
            </button>
            {descBeforeRefine !== null && (
              <button onClick={() => { setDesc(descBeforeRefine); setDescBeforeRefine(null); }} className="px-2.5 py-2 rounded-lg bg-[var(--t2m-wash)] text-[12px] text-[var(--t2m-ink-2)]">↩ Mon texte</button>
            )}
            <span className="flex-1" />
            <button
              onClick={saveDesc}
              disabled={savingDesc || desc.trim() === (shop?.description || '').trim()}
              className="px-3 py-2 rounded-lg bg-[var(--t2m-wash)] text-[12px] font-semibold disabled:opacity-40"
            >
              {savingDesc ? '…' : descSaved ? '✓ Enregistré' : 'Enregistrer'}
            </button>
          </div>
          <p className="text-[10.5px] text-[var(--t2m-ink-3)] mt-1.5 leading-snug">✨ corrige et reformule TON texte, sans rien inventer ni supprimer.</p>
          {/* Statut Petites annonces — boutiques uniquement (plats/services/emploi = autres canaux) */}
          {isBoutique && (
          <div className={`mt-2 flex items-center gap-2 text-[11.5px] rounded-lg px-2.5 py-2 border ${desc.trim().length >= MIN_ANNONCE_DESC ? 'border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-200' : 'border-amber-400/25 bg-amber-500/[0.08] text-amber-200'}`}>
            <Megaphone className="w-3.5 h-3.5 shrink-0" />
            {desc.trim().length >= MIN_ANNONCE_DESC
              ? <span>Ta boutique peut apparaître dans les <b>Petites annonces</b> {desc.trim() !== (shop?.description || '').trim() ? '— pense à enregistrer.' : '✓'}</span>
              : <span>Écris une description complète (encore {MIN_ANNONCE_DESC - desc.trim().length} caractères) pour apparaître dans les <b>Petites annonces</b>.</span>}
          </div>
          )}
        </div>
        )}

        {/* PLAT : position (obligatoire pour être visible à 500 m des voisins) */}
        {isPlat && (
          <div className="m-3 p-3 rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)]">
            <p className="text-[12px] text-[var(--t2m-ink-3)] mb-2">Position de tes plats — pour être visible par les voisins à 500 m.</p>
            <button
              onClick={setGeo} disabled={geoBusy}
              className={'w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-50 ' + (shop?.lat != null ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-400/30' : 'bg-red-600 text-white')}
            >
              {geoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {geoBusy ? 'Localisation…' : shop?.lat != null ? '✓ Position enregistrée — actualiser' : '📍 Me localiser'}
            </button>
          </div>
        )}

        {/* AJOUTER un article : pour une BOUTIQUE → le MÊME formulaire que l'annonce
            (DepositAnnonceSheet, 2 parties). Les PLATS gardent l'ajout rapide. */}
        {isPlat ? (
          <div className="m-3 p-3 rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)]">
            <p className="text-[12px] text-[var(--t2m-ink-3)] mb-2">Ajoute un plat : une photo, un prix.</p>
            <div className="flex gap-2.5">
              <button onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-xl border border-dashed border-[var(--t2m-line)] bg-[var(--t2m-wash)] grid place-items-center shrink-0 overflow-hidden">
                {pendingImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pendingImg} alt="" className="w-full h-full object-cover" />
                ) : busy ? <Loader2 className="w-5 h-5 animate-spin text-[var(--t2m-ink-3)]" /> : <Plus className="w-6 h-6 text-[var(--t2m-ink-3)]" />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
              <div className="flex-1 min-w-0 space-y-2">
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom (optionnel)" className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-[var(--t2m-primary)]" />
                <div className="flex gap-2">
                  <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" placeholder="Prix" className="flex-1 min-w-0 bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-[var(--t2m-primary)]" />
                  <button onClick={addItem} disabled={!pendingImg || !price || busy} className="shrink-0 px-3 rounded-lg bg-red-600 text-white disabled:opacity-40 text-[13px] font-semibold">Ajouter</button>
                </div>
                {pendingImg && (
                  <div className="flex items-center gap-2">
                    <button onClick={cleanPending} disabled={cleaningPending} className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-red-600 text-white text-[12px] font-semibold disabled:opacity-50">
                      {cleaningPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {cleaningPending ? 'Nettoyage…' : '✨ Nettoyer la photo'}
                    </button>
                    {pendingOriginal && (
                      <button onClick={() => { setPendingImg(pendingOriginal); setPendingOriginal(null); }} className="px-2.5 py-2 rounded-lg bg-[var(--t2m-wash)] text-[12px] text-[var(--t2m-ink-2)]">↩ Originale</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="m-3">
            <button onClick={() => setAddNew(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-600 text-white text-[14px] font-semibold active:scale-[0.99]">
              <Plus className="w-5 h-5" /> {addLabel}
            </button>
            {isBoutique && items.length < 2 && (
              <p className="mt-2 text-[11.5px] text-amber-200/80 leading-snug px-1">
                {items.length === 0
                  ? 'Ajoute tes articles. Ta boutique apparaîtra dans le feed à partir de 2 articles.'
                  : 'Encore 1 article et ta boutique monte dans le feed. (Pour l’instant, ton article est diffusé dans les Annonces.)'}
              </p>
            )}
          </div>
        )}

        {/* RECHERCHE + GRILLE classée par catégorie (la vitrine telle qu'elle apparaîtra) */}
        {loading ? (
          <div className="text-center text-[var(--t2m-ink-3)] py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-[var(--t2m-ink-3)] text-[13px] py-8 px-6">{isPlat ? 'Ajoute ton premier plat avec son prix 👆' : isService ? 'Ajoute ta première prestation (photo + prix) 👆' : isEmploi ? 'Ajoute ta première offre 👆' : 'Ajoute ta première photo avec son prix 👆'}</p>
        ) : (() => {
          const tile = (it: Item) => (
            <div key={it.id} className="relative">
              {/* Card OS : l'article EST rendu par le moteur (lecteur Boutique). */}
              <div onClick={() => setEditItem(it)} className="cursor-pointer">
                <SuperCardView card={readItemCard(it)} variant="product" reveal={['media', 'title', 'price']} theme="light" />
              </div>
              {/* Contrôles proprio en overlay (hors data card). */}
              <button onClick={() => removeItem(it.id)} className="absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-full bg-black/60 text-white/80"><Trash2 className="w-3.5 h-3.5" /></button>
              <button
                onClick={() => cleanExisting(it.id, it.image_url)}
                disabled={cleaningId === it.id}
                aria-label="Nettoyer la photo"
                className="absolute top-1 left-1 w-6 h-6 grid place-items-center rounded-full bg-red-600 text-white disabled:opacity-60"
              >
                {cleaningId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              </button>
              {it.annonce_on === 1 && (
                <span className="absolute bottom-1 right-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-600/90 text-white inline-flex items-center gap-0.5"><Megaphone className="w-2.5 h-2.5" /> Annonce</span>
              )}
            </div>
          );
          const ql = query.trim().toLowerCase();
          const filtered = items.filter((it) => !ql || ((it.label || '') + ' ' + (it.category || '') + ' ' + (it.description || '')).toLowerCase().includes(ql));
          // Recherche seulement « si beaucoup d'articles » (Pascal).
          const searchBox = items.length > 4 ? (
            <div className="px-3 pb-3">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isPlat ? 'Rechercher un plat…' : 'Rechercher dans ma boutique…'}
                className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--t2m-primary)]" />
            </div>
          ) : null;

          // Plats : pas de catégorie → grille plate. Boutique : classée par catégorie.
          if (isPlat) {
            return (
              <div>
                {searchBox}
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 px-3">{filtered.map(tile)}</div>
              </div>
            );
          }
          const groups = new Map<string, Item[]>();
          for (const it of filtered) {
            const key = it.category || it.annonce_category || 'Autres';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(it);
          }
          const order: readonly string[] = ANNONCE_CATEGORIES;
          const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
            const ia = order.indexOf(a), ib = order.indexOf(b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
          });
          return (
            <div>
              {searchBox}
              {filtered.length === 0 ? (
                <p className="text-center text-[var(--t2m-ink-3)] text-[13px] py-8">Aucun article trouvé.</p>
              ) : sortedKeys.map((k) => (
                <div key={k} className="mb-4">
                  <p className="px-3 mb-1.5 text-[12px] font-semibold text-[var(--t2m-ink-2)]">{k} <span className="text-[var(--t2m-ink-3)] font-normal">· {groups.get(k)!.length}</span></p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 px-3">{groups.get(k)!.map(tile)}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ACTIONS : story / boost / messagerie / partage interne (PAS d'URL — Pascal 2026-06-09) */}
        <div className="m-3 mt-4 space-y-2">
          <button
            onClick={async () => {
              if (!items.length) { alert('Ajoute au moins une photo avant de la mettre en story.'); return; }
              const r = await fetch('/api/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'shop', shop_id: id }) });
              alert(r.ok ? '✓ Ta boutique est dans ta story — tes contacts la voient !' : "Échec, réessaie.");
            }}
            className="w-full flex items-center gap-3 p-3 rounded-2xl border border-red-400/30 bg-red-500/10 text-left active:scale-[0.99]"
          >
            <Megaphone className="w-5 h-5 text-red-200 shrink-0" />
            <span><span className="block text-[14px] font-semibold">Mettre dans ma story</span><span className="block text-[12px] text-[var(--t2m-ink-3)]">Tes contacts voient {isPlat ? 'tes plats' : 'ta boutique'} (gratuit)</span></span>
          </button>
          <button disabled aria-disabled className="w-full flex items-center gap-3 p-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 text-left opacity-55 cursor-not-allowed">
            <Rocket className="w-5 h-5 text-amber-200 shrink-0" />
            <span className="flex-1"><span className="block text-[14px] font-semibold">Booster sur la home</span><span className="block text-[12px] text-[var(--t2m-ink-3)]">Audience élargie au-delà de tes contacts (Wallet)</span></span>
            <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/10 text-[var(--t2m-ink-2)]">Bientôt</span>
          </button>
          <button onClick={() => router.push('/shop/messages')} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] text-left active:scale-[0.99]">
            <MessageCircle className="w-5 h-5 text-[var(--t2m-ink-2)] shrink-0" />
            <span><span className="block text-[14px] font-semibold">Messagerie de la boutique</span><span className="block text-[12px] text-[var(--t2m-ink-3)]">Les clients t'écrivent ici</span></span>
          </button>
          <button disabled aria-disabled className="w-full flex items-center gap-3 p-3 rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] text-left opacity-55 cursor-not-allowed">
            <Send className="w-5 h-5 text-[var(--t2m-ink-2)] shrink-0" />
            <span className="flex-1"><span className="block text-[14px] font-semibold">Envoyer à un contact</span><span className="block text-[12px] text-[var(--t2m-ink-3)]">Dans T2M, à tes contacts — pas de lien qui sort</span></span>
            <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/10 text-[var(--t2m-ink-2)]">Bientôt</span>
          </button>
        </div>
      </main>

      {/* APERÇU = EXACTEMENT le rendu du FEED (Pascal 2026-07-09) : la boutique lue par le MÊME
          lecteur que le feed, SuperCardView variant="boutique" (cover + nom + description + grille
          d'articles prix incrusté). Aperçu composer ≡ card du feed. */}
      {preview && shop && (
        <div onClick={() => setPreview(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, maxHeight: '92dvh', overflowY: 'auto', background: 'var(--t2m-feed-bg, #fff)', borderRadius: '18px 18px 0 0', padding: '14px 14px calc(env(safe-area-inset-bottom) + 20px)' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button type="button" onClick={() => setPreview(false)} className="text-[var(--t2m-ink-2)]" style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <SuperCardView
              card={makeCard({
                id: shop.id, types: ['boutique'], channel: 'boutique', title: shop.name,
                ...(shop.cover_url ? { images: [shop.cover_url] } : {}),
                ...(shop.description ? { text: { body: shop.description } } : {}),
                items: items.map(readItemCard),
              })}
              variant="boutique"
              theme="light"
              hideMeta
            />
          </div>
        </div>
      )}

      {/* Aperçu individuel d'un article : ré-éditer + Petites annonces (Pascal 2026-06-20) */}
      {/* AJOUT d'un nouvel article (boutique) : le MÊME formulaire que l'annonce. */}
      {addNew && !isPlat && (
        <DepositAnnonceSheet
          itemSource={{ shopId: id as string }}
          initial={{ shop_id: id as string, status: 'draft' }}
          onClose={() => setAddNew(false)}
          onSaved={() => { setAddNew(false); load(); autoPublish(); }}
        />
      )}

      {/* Édition d'un article : MÊME formulaire que les annonces (Pascal 2026-06-27).
          Plats = formulaire dédié (le formulaire annonce ne s'applique pas aux plats). */}
      {editItem && (isPlat ? (
        <BoutiqueItemSheet
          shopId={id as string}
          item={editItem}
          allowAnnonce={false}
          onClose={() => setEditItem(null)}
          onSaved={() => { load(); autoPublish(); }}
        />
      ) : (
        <DepositAnnonceSheet
          itemSource={{ shopId: id as string }}
          initial={{
            id: editItem.id,
            title: editItem.label || '',
            category: editItem.category || editItem.annonce_category || '',
            description: editItem.description || '',
            price_cents: editItem.price_cents,
            city: editItem.annonce_city || '',
            image_url: editItem.image_url,
            attributes: editItem.attributes ?? null,
            photos: editItem.photos ?? null,
            quantity: editItem.quantity ?? null,
            shop_id: id as string,
            status: editItem.annonce_on === 1 ? 'published' : 'draft',
          }}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); load(); autoPublish(); }}
        />
      ))}
    </div>
  );
}
