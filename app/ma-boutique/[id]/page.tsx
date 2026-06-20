'use client';

/**
 * Talk2Me — Gestion d'une PETITE BOUTIQUE (photos+prix), créée dans l'espace chat.
 * (Pascal 2026-06-09) Le commerçant ajoute ses photos avec prix, la met dans sa
 * STORY (contacts), peut BOOSTER sur la home (audience élargie, payé au Wallet),
 * et a une messagerie dédiée. Façon WhatsApp Business.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Loader2, Megaphone, Rocket, Send, MessageCircle, Sparkles, Eye, MapPin } from 'lucide-react';
import BoutiqueSheet from '@/components/feed/BoutiqueSheet';
import BoutiqueItemSheet from '@/components/feed/BoutiqueItemSheet';

interface Item {
  id: string; image_url: string; label: string | null; price_cents: number; description?: string | null;
  annonce_on?: number; annonce_category?: string | null; annonce_city?: string | null;
  annonce_lat?: number | null; annonce_lng?: number | null; annonce_until?: number | null;
}
interface Shop { id: string; name: string; description: string | null; public_key: string; wallet_enabled: boolean; kind?: string; lat?: number | null; lng?: number | null }

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
        body: JSON.stringify({ image_url: pendingImg, price: parseFloat(price), label: label.trim() || null }),
      });
      setPendingImg(null); setPendingOriginal(null); setPrice(''); setLabel('');
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

  // Édition adaptée au TYPE : un plat n'a pas le même formulaire qu'une boutique.
  const isPlat = shop?.kind === 'plat_maison';
  const noun = isPlat ? 'plat' : 'article';
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
    <div className="flex flex-col h-[100svh] w-full max-w-md mx-auto bg-[#0e0e12] text-white overflow-hidden">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-white/8 bg-[#0e0e12]/85 px-3 backdrop-blur-xl">
        <button onClick={() => router.push('/friends')} className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate">{shop?.name || (isPlat ? 'Mes plats maison' : 'Ma boutique')}</div>
          <div className="text-[11px] text-white/45">{items.length} {noun}{items.length > 1 ? 's' : ''} · {isPlat ? 'plats maison · 500 m' : 'boutique perso'}</div>
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
        {/* DESCRIPTION (écrite par le vendeur, l'IA la remet propre sans rien
            ajouter/retirer) + statut Petites annonces (Pascal 2026-06-11) */}
        <div className="m-3 p-3 rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[12px] text-white/55">{isPlat ? 'Décris tes plats (ce que tu cuisines…)' : 'Décris ta boutique (ce que tu vends, ta ville…)'}</p>
            {!isPlat && <span className={`text-[11px] ${desc.trim().length >= MIN_ANNONCE_DESC ? 'text-emerald-300/80' : 'text-white/35'}`}>{desc.trim().length}/{MIN_ANNONCE_DESC}</span>}
          </div>
          <textarea
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setDescBeforeRefine(null); }}
            rows={3}
            maxLength={300}
            placeholder={isPlat ? 'Ex : Mafé, riz gras, jus de bissap — faits maison, à emporter.' : 'Ex : Vêtements femme tendance à Casablanca, tailles S à XL, livraison rapide.'}
            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-red-400/50 resize-none leading-relaxed"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={refineDesc}
              disabled={desc.trim().length < 10 || refining}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-red-600 text-[12px] font-semibold disabled:opacity-40"
            >
              {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {refining ? 'Reformulation…' : '✨ Reformuler'}
            </button>
            {descBeforeRefine !== null && (
              <button onClick={() => { setDesc(descBeforeRefine); setDescBeforeRefine(null); }} className="px-2.5 py-2 rounded-lg bg-white/10 text-[12px] text-white/70">↩ Mon texte</button>
            )}
            <span className="flex-1" />
            <button
              onClick={saveDesc}
              disabled={savingDesc || desc.trim() === (shop?.description || '').trim()}
              className="px-3 py-2 rounded-lg bg-white/10 text-[12px] font-semibold disabled:opacity-40"
            >
              {savingDesc ? '…' : descSaved ? '✓ Enregistré' : 'Enregistrer'}
            </button>
          </div>
          <p className="text-[10.5px] text-white/40 mt-1.5 leading-snug">✨ corrige et reformule TON texte, sans rien inventer ni supprimer.</p>
          {/* Statut Petites annonces — boutiques uniquement (les plats = proximité 500 m) */}
          {!isPlat && (
          <div className={`mt-2 flex items-center gap-2 text-[11.5px] rounded-lg px-2.5 py-2 border ${desc.trim().length >= MIN_ANNONCE_DESC ? 'border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-200' : 'border-amber-400/25 bg-amber-500/[0.08] text-amber-200'}`}>
            <Megaphone className="w-3.5 h-3.5 shrink-0" />
            {desc.trim().length >= MIN_ANNONCE_DESC
              ? <span>Ta boutique peut apparaître dans les <b>Petites annonces</b> {desc.trim() !== (shop?.description || '').trim() ? '— pense à enregistrer.' : '✓'}</span>
              : <span>Écris une description complète (encore {MIN_ANNONCE_DESC - desc.trim().length} caractères) pour apparaître dans les <b>Petites annonces</b>.</span>}
          </div>
          )}
        </div>

        {/* PLAT : position (obligatoire pour être visible à 500 m des voisins) */}
        {isPlat && (
          <div className="m-3 p-3 rounded-2xl border border-white/10 bg-white/[0.03]">
            <p className="text-[12px] text-white/55 mb-2">Position de tes plats — pour être visible par les voisins à 500 m.</p>
            <button
              onClick={setGeo} disabled={geoBusy}
              className={'w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-50 ' + (shop?.lat != null ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-400/30' : 'bg-red-600 text-white')}
            >
              {geoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {geoBusy ? 'Localisation…' : shop?.lat != null ? '✓ Position enregistrée — actualiser' : '📍 Me localiser'}
            </button>
          </div>
        )}

        {/* AJOUTER une photo + prix */}
        <div className="m-3 p-3 rounded-2xl border border-white/10 bg-white/[0.03]">
          <p className="text-[12px] text-white/55 mb-2">{isPlat ? 'Ajoute un plat : une photo, un prix.' : 'Ajoute un article : une photo, un prix.'}</p>
          <div className="flex gap-2.5">
            <button onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-xl border border-dashed border-white/20 bg-white/[0.04] grid place-items-center shrink-0 overflow-hidden">
              {pendingImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pendingImg} alt="" className="w-full h-full object-cover" />
              ) : busy ? <Loader2 className="w-5 h-5 animate-spin text-white/50" /> : <Plus className="w-6 h-6 text-white/50" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
            <div className="flex-1 space-y-2">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom (optionnel)" className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-red-400/50" />
              <div className="flex gap-2">
                <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" placeholder="Prix €" className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-red-400/50" />
                <button onClick={addItem} disabled={!pendingImg || !price || busy} className="px-3 rounded-lg bg-red-600 disabled:opacity-40 text-[13px] font-semibold">Ajouter</button>
              </div>
              {pendingImg && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={cleanPending}
                    disabled={cleaningPending}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-red-600 text-[12px] font-semibold disabled:opacity-50"
                  >
                    {cleaningPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {cleaningPending ? 'Nettoyage…' : '✨ Nettoyer la photo'}
                  </button>
                  {pendingOriginal && (
                    <button
                      onClick={() => { setPendingImg(pendingOriginal); setPendingOriginal(null); }}
                      className="px-2.5 py-2 rounded-lg bg-white/10 text-[12px] text-white/70"
                    >
                      ↩ Originale
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {pendingImg && (
            <p className="text-[10.5px] text-white/40 mt-2 leading-snug">
              ✨ détoure et éclaircit la photo pour un rendu vitrine. <span className="text-white/55">La photo brute reste seulement ici, jamais montrée au public.</span>
            </p>
          )}
        </div>

        {/* GRILLE articles (la vitrine telle qu'elle apparaîtra) */}
        {loading ? (
          <div className="text-center text-white/40 py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-white/35 text-[13px] py-8 px-6">{isPlat ? 'Ajoute ton premier plat avec son prix 👆' : 'Ajoute ta première photo avec son prix 👆'}</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 px-3">
            {items.map((it) => (
              <div key={it.id} className="relative rounded-xl overflow-hidden border border-white/10 bg-white/[0.03]">
                <div className="relative w-full aspect-square">
                  {/* Clic sur la photo → aperçu individuel + ré-édition + Petites annonces */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.image_url} alt={it.label || ''} onClick={() => setEditItem(it)} className="w-full h-full object-cover cursor-pointer" />
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
                  <span className="absolute bottom-1 left-1 text-[12px] font-bold px-1.5 py-0.5 rounded bg-black/65">{eur(it.price_cents)}</span>
                </div>
                {it.label && <p className="text-[10px] text-white/70 line-clamp-1 px-1.5 py-1">{it.label}</p>}
              </div>
            ))}
          </div>
        )}

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
            <span><span className="block text-[14px] font-semibold">Mettre dans ma story</span><span className="block text-[12px] text-white/55">Tes contacts voient ta boutique (gratuit)</span></span>
          </button>
          <button onClick={() => alert('Bientôt : booster sur la home (audience élargie, payé au Wallet).')} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 text-left">
            <Rocket className="w-5 h-5 text-amber-200 shrink-0" />
            <span><span className="block text-[14px] font-semibold">Booster sur la home</span><span className="block text-[12px] text-white/55">Audience élargie au-delà de tes contacts (Wallet)</span></span>
          </button>
          <button onClick={() => alert('Bientôt : messagerie dédiée à ta boutique.')} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/12 bg-white/[0.04] text-left">
            <MessageCircle className="w-5 h-5 text-white/70 shrink-0" />
            <span><span className="block text-[14px] font-semibold">Messagerie de la boutique</span><span className="block text-[12px] text-white/55">Les clients t'écrivent ici</span></span>
          </button>
          <button onClick={() => alert('Bientôt : envoyer ta boutique à un contact, directement dans T2M (aucun lien externe).')} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/12 bg-white/[0.04] text-left">
            <Send className="w-5 h-5 text-white/70 shrink-0" />
            <span><span className="block text-[14px] font-semibold">Envoyer à un contact</span><span className="block text-[12px] text-white/55">Dans T2M, à tes contacts — pas de lien qui sort</span></span>
          </button>
        </div>
      </main>

      {/* APERÇU : la vitrine telle que la voit un client (rendu réel) */}
      {preview && shop?.public_key && (
        <BoutiqueSheet shopKey={shop.public_key} onClose={() => setPreview(false)} />
      )}

      {/* Aperçu individuel d'un article : ré-éditer + Petites annonces (Pascal 2026-06-20) */}
      {editItem && (
        <BoutiqueItemSheet
          shopId={id as string}
          item={editItem}
          allowAnnonce={!isPlat}
          onClose={() => setEditItem(null)}
          onSaved={() => { load(); autoPublish(); }}
        />
      )}
    </div>
  );
}
