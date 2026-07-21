'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { imageHasPhoneNumber, CONTACT_LEAK_MSG } from '@/lib/client/image-guard';
import { createPortal } from 'react-dom';
import ProductEnrichSheet from '@/components/boutique/ProductEnrichSheet';

interface Product {
  id: string;
  image_url: string;
  title: string;
  price: string;
  /** Talk2Me #428 — tailles dispo (ex "S M L XL XXL" ou "4 6 8 10 12 ans").
      Champ structuré → l'user ne grave plus le texte dans la photo (cas Law). */
  sizes: string;
  /** Talk2Me #428 — vend aussi en GROS (cas Law "vente en gros aussi"). */
  wholesale: boolean;
  link: string;
  /** Photo d'origine conservée quand on applique le nettoyage IA (Pascal 2026-06-11). */
  original_url?: string;
}

interface Category {
  id: string;
  name: string;
  products: Product[];
}

interface CoverPosition {
  x: number;
  y: number;
}

export default function BoutiqueComposer({
  open,
  onClose,
  onCreated,
  draftId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (slugOrId: string) => void;
  draftId?: string;
  initial?: { name?: string; description?: string; coverUrl?: string; coverPos?: CoverPosition; categories?: Category[] };
}) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl || '');
  const [coverPos, setCoverPos] = useState<CoverPosition>(initial?.coverPos || { x: 50, y: 50 });
  const [categories, setCategories] = useState<Category[]>(initial?.categories || []);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [enrich, setEnrich] = useState<{ catId: string; prodId: string; imageUrl: string; title: string; price: string } | null>(null);
  const [cleaningAll, setCleaningAll] = useState<{ done: number; total: number } | null>(null);

  // Nettoie EN LOT toutes les photos produit (détourage+recadrage+éclaircissement),
  // garde chaque originale. Saute celles déjà nettoyées.
  const cleanAllPhotos = useCallback(async () => {
    const todo: { catId: string; prodId: string; imageUrl: string }[] = [];
    categories.forEach(cat => cat.products.forEach(p => {
      if (p.image_url && p.image_url.startsWith('/uploads/') && !p.original_url) todo.push({ catId: cat.id, prodId: p.id, imageUrl: p.image_url });
    }));
    if (!todo.length) { setError('Aucune photo à nettoyer (ou déjà nettoyées).'); return; }
    setError(''); setCleaningAll({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      const t = todo[i];
      try {
        const r = await fetch('/api/boutique/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: t.imageUrl, cleanOnly: true }) });
        const d = await r.json();
        if (r.ok && d.cleanedUrl) {
          setCategories(prev => prev.map(cat => cat.id === t.catId ? { ...cat, products: cat.products.map(p => p.id === t.prodId ? { ...p, image_url: d.cleanedUrl, original_url: t.imageUrl } : p) } : cat));
        }
      } catch { /* on continue */ }
      setCleaningAll({ done: i + 1, total: todo.length });
    }
    setCleaningAll(null);
  }, [categories]);

  const coverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Composer GLOBAL (monté en permanence) : à l'ouverture, charger le BROUILLON
  // s'il y en a un (reprise depuis Mes Cards), sinon repartir d'un formulaire vide.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name || '');
      setDescription(initial.description || '');
      setCoverUrl(initial.coverUrl || '');
      setCoverPos(initial.coverPos || { x: 50, y: 50 });
      setCategories(initial.categories || []);
    } else {
      setName(''); setDescription(''); setCoverUrl(''); setCoverPos({ x: 50, y: 50 }); setCategories([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (await imageHasPhoneNumber(file)) { alert(CONTACT_LEAK_MSG); return; } // anti-désintermédiation
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) setCoverUrl(data.url);
    } catch {
      setError("Erreur lors de l'upload de la couverture");
    }
  }, []);

  const handleProductUpload = useCallback(async (file: File, categoryId: string, productId: string) => {
    if (await imageHasPhoneNumber(file)) { alert(CONTACT_LEAK_MSG); return; } // anti-désintermédiation
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        setCategories(prev => prev.map(cat => {
          if (cat.id !== categoryId) return cat;
          return {
            ...cat,
            products: cat.products.map(p => p.id === productId ? { ...p, image_url: data.url } : p),
          };
        }));
      }
    } catch {
      setError("Erreur lors de l'upload du produit");
    }
  }, []);

  const addCategory = useCallback(() => {
    setCategories(prev => [...prev, { id: crypto.randomUUID(), name: '', products: [] }]);
  }, []);

  const addProduct = useCallback((categoryId: string) => {
    setCategories(prev => prev.map(cat => {
      if (cat.id !== categoryId) return cat;
      return {
        ...cat,
        products: [...cat.products, { id: crypto.randomUUID(), image_url: '', title: '', price: '', sizes: '', wholesale: false, link: '' }],
      };
    }));
  }, []);

  const removeProduct = useCallback((categoryId: string, productId: string) => {
    setCategories(prev => prev.map(cat => {
      if (cat.id !== categoryId) return cat;
      return { ...cat, products: cat.products.filter(p => p.id !== productId) };
    }));
  }, []);

  const updateProduct = useCallback((categoryId: string, productId: string, field: keyof Product, value: string) => {
    setCategories(prev => prev.map(cat => {
      if (cat.id !== categoryId) return cat;
      return {
        ...cat,
        products: cat.products.map(p => p.id === productId ? { ...p, [field]: value } : p),
      };
    }));
  }, []);

  const toggleWholesale = useCallback((categoryId: string, productId: string) => {
    setCategories(prev => prev.map(cat => {
      if (cat.id !== categoryId) return cat;
      return {
        ...cat,
        products: cat.products.map(p => p.id === productId ? { ...p, wholesale: !p.wholesale } : p),
      };
    }));
  }, []);

  const updateCategoryName = useCallback((categoryId: string, name: string) => {
    setCategories(prev => prev.map(cat => cat.id === categoryId ? { ...cat, name } : cat));
  }, []);

  const handlePublish = useCallback(async () => {
    if (!name.trim()) {
      setError("Le nom de la boutique est requis");
      return;
    }
    setPublishing(true);
    setError('');
    try {
      // Créer la boutique
      const boutiqueRes = await fetch('/api/boutiques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          cover_url: coverUrl,
          cover_position: `${Math.round(coverPos.x)}% ${Math.round(coverPos.y)}%`,
        }),
      });
      if (!boutiqueRes.ok) throw new Error("Erreur création boutique");
      const boutiqueData = await boutiqueRes.json();
      const boutiqueId = boutiqueData.boutique?.id;
      const boutiqueSlug = boutiqueData.boutique?.slug;

      // Créer les cards pour chaque catégorie/produit
      for (const cat of categories) {
        if (!cat.name.trim()) continue;
        for (const prod of cat.products) {
          if (!prod.title.trim() || !prod.image_url) continue;
          const cardRes = await fetch('/api/cards/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'image',
              media_url: prod.image_url,
              caption: prod.title.trim(),
              attached_product: {
                title: prod.title.trim(),
                price_label: prod.price,
                image_url: prod.image_url,
                sizes: prod.sizes.trim(),
                wholesale: prod.wholesale,
                source: '',
                source_url: prod.link || '',
              },
              boutique_id: boutiqueId,
              category: cat.name.trim(),
            }),
          });
          if (!cardRes.ok) {
            const cardData = await cardRes.json();
            console.warn("Erreur création card pour", prod.title, cardData);
          }
        }
      }

      if (draftId) await fetch(`/api/drafts/${draftId}`, { method: 'DELETE' }).catch(() => {});
      onCreated?.(boutiqueSlug || boutiqueId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la publication");
    } finally {
      setPublishing(false);
    }
  }, [name, description, coverUrl, coverPos, categories, onCreated, onClose, draftId]);

  // Enregistre l'état de la boutique comme BROUILLON (repris depuis Mes Cards).
  const handleSaveDraft = useCallback(async () => {
    if (savingDraft) return;
    if (!name.trim() && categories.length === 0 && !coverUrl) { setError('Rien à enregistrer.'); return; }
    setSavingDraft(true); setError('');
    try {
      const thumb = coverUrl || categories.flatMap(c => c.products).find(p => p.image_url)?.image_url || null;
      await fetch('/api/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draftId,
          type: 'boutique',
          title: name.trim() || 'Boutique',
          thumbnail_url: thumb,
          draft_data: { name, description, coverUrl, coverPos, categories },
        }),
      });
      onClose();
    } finally { setSavingDraft(false); }
  }, [savingDraft, name, description, coverUrl, coverPos, categories, draftId, onClose]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!coverRef.current) return;
    const rect = coverRef.current.getBoundingClientRect();
    const startX = coverPos.x;
    const startY = coverPos.y;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      const newX = Math.max(0, Math.min(100, startX - (dx / rect.width) * 100));
      const newY = Math.max(0, Math.min(100, startY - (dy / rect.height) * 100));
      setCoverPos({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [coverPos]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-[var(--t2m-paper)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--t2m-line)]">
        <button onClick={onClose} className="text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink)] transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-[var(--t2m-ink)]">Composer ma boutique</h2>
        <div className="w-6" />
      </div>

      {/* Scrollable preview */}
      <div className="flex-1 overflow-y-auto">
        {/* Cover */}
        <div className="relative w-full aspect-[16/9] overflow-hidden bg-[var(--t2m-wash)]">
          {coverUrl ? (
            <>
              <img
                src={coverUrl}
                alt="Cover"
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
                style={{ objectPosition: `${coverPos.x}% ${coverPos.y}%` }}
              />
              <div
                ref={coverRef}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
                onPointerDown={handlePointerDown}
              />
              <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                Glisse pour ajuster
              </div>
              <button
                onClick={() => setCoverUrl('')}
                className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded hover:bg-black/80"
              >
                Changer
              </button>
            </>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink-2)] transition-colors"
            >
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm">Photo de couverture (paysage)</span>
              </div>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCoverUpload}
          />
        </div>

        {/* Name & Description */}
        <div className="px-4 py-4 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de la boutique"
            className="w-full bg-transparent text-[22px] font-bold text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description courte"
            rows={2}
            className="w-full bg-transparent text-[13px] text-[var(--t2m-ink-2)] placeholder-[var(--t2m-ink-3)] outline-none resize-none"
          />
        </div>

        {/* Categories */}
        {categories.map((cat) => (
          <div key={cat.id} className="mb-4">
            <div className="px-4 mt-4 mb-2">
              <input
                value={cat.name}
                onChange={(e) => updateCategoryName(cat.id, e.target.value)}
                placeholder="Nom du rayon"
                className="w-full bg-transparent text-[15px] font-semibold text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none"
              />
            </div>
            <div className="flex gap-3 px-4 overflow-x-auto pb-2">
              {cat.products.map((prod) => (
                <div key={prod.id} className="w-[150px] flex-shrink-0">
                  <div className="relative aspect-[3/4] bg-[var(--t2m-wash)] rounded-lg overflow-hidden mb-2">
                    {prod.image_url ? (
                      <img
                        src={prod.image_url}
                        alt={prod.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) handleProductUpload(file, cat.id, prod.id);
                          };
                          input.click();
                        }}
                        className="w-full h-full flex items-center justify-center text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink-2)] transition-colors"
                      >
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => removeProduct(cat.id, prod.id)}
                      className="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/80"
                    >
                      ×
                    </button>
                    {prod.image_url && (
                      <button
                        onClick={() => setEnrich({ catId: cat.id, prodId: prod.id, imageUrl: prod.image_url, title: prod.title, price: prod.price })}
                        className="absolute bottom-1 left-1 right-1 bg-red-600/90 text-white text-[10px] font-semibold py-1 rounded-md inline-flex items-center justify-center gap-1 hover:bg-red-600"
                      >
                        ✨ Nettoyer
                      </button>
                    )}
                  </div>
                  <input
                    value={prod.title}
                    onChange={(e) => updateProduct(cat.id, prod.id, 'title', e.target.value)}
                    placeholder="Titre"
                    className="w-full bg-transparent text-xs text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none mb-1"
                  />
                  <input
                    value={prod.price}
                    onChange={(e) => updateProduct(cat.id, prod.id, 'price', e.target.value)}
                    placeholder="Prix"
                    className="w-full bg-transparent text-xs text-[var(--t2m-ink-2)] placeholder-[var(--t2m-ink-3)] outline-none mb-1"
                  />
                  <input
                    value={prod.sizes}
                    onChange={(e) => updateProduct(cat.id, prod.id, 'sizes', e.target.value)}
                    placeholder="Tailles (S M L XL…)"
                    className="w-full bg-transparent text-xs text-[var(--t2m-ink-2)] placeholder-[var(--t2m-ink-3)] outline-none mb-1"
                  />
                  <button
                    type="button"
                    onClick={() => toggleWholesale(cat.id, prod.id)}
                    className={
                      'w-full text-[11px] font-semibold py-1 rounded-md mb-1 transition-colors ' +
                      (prod.wholesale
                        ? 'bg-amber-500/25 text-amber-200 border border-amber-400/40'
                        : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-3)] border border-[var(--t2m-line)] hover:text-[var(--t2m-ink-2)]')
                    }
                  >
                    {prod.wholesale ? '✓ Vente en gros' : 'Vente en gros ?'}
                  </button>
                  <input
                    value={prod.link}
                    onChange={(e) => updateProduct(cat.id, prod.id, 'link', e.target.value)}
                    placeholder="Lien (optionnel)"
                    className="w-full bg-transparent text-xs text-[var(--t2m-ink-3)] placeholder-[var(--t2m-ink-3)] outline-none"
                  />
                </div>
              ))}
              <button
                onClick={() => addProduct(cat.id)}
                className="w-[150px] aspect-[3/4] flex-shrink-0 border-2 border-dashed border-[var(--t2m-line)] rounded-lg flex items-center justify-center text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink-2)] hover:border-[var(--t2m-line)] transition-colors"
              >
                <div className="text-center">
                  <svg className="w-6 h-6 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs">Article</span>
                </div>
              </button>
            </div>
          </div>
        ))}

        {/* Add category button */}
        <div className="px-4 pb-4">
          <button
            onClick={addCategory}
            className="w-full py-3 border-2 border-dashed border-[var(--t2m-line)] rounded-xl text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink-2)] hover:border-[var(--t2m-line)] transition-colors text-sm"
          >
            ＋ Ajouter un rayon (catégorie)
          </button>
          <button
            onClick={cleanAllPhotos}
            disabled={!!cleaningAll}
            className="w-full mt-2 py-3 rounded-xl bg-red-600/90 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-600"
          >
            {cleaningAll ? `Nettoyage… ${cleaningAll.done}/${cleaningAll.total}` : '✨ Tout nettoyer les photos'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Bottom bar */}
      <div className="px-4 py-3 border-t border-[var(--t2m-line)] flex gap-2.5">
        <button
          onClick={handleSaveDraft}
          disabled={savingDraft || publishing}
          className="flex-[0_0_auto] px-4 py-3 rounded-xl border border-[var(--t2m-line)] text-[var(--t2m-ink)] font-semibold disabled:opacity-50"
        >
          {savingDraft ? '…' : 'Brouillon'}
        </button>
        <button
          onClick={handlePublish}
          disabled={publishing || !name.trim()}
          className="flex-1 py-3 rounded-xl bg-[var(--t2m-primary)] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {publishing ? "Publication…" : "Publier la boutique"}
        </button>
      </div>

      {/* Nettoyer & enrichir un produit (3 slides, garde l'original) */}
      {enrich && (
        <ProductEnrichSheet
          imageUrl={enrich.imageUrl}
          title={enrich.title}
          price={enrich.price}
          onClose={() => setEnrich(null)}
          onApply={({ cleanedUrl, originalUrl }) => {
            if (cleanedUrl) {
              // garde l'originale : on stocke original_url, on affiche la nettoyée
              setCategories(prev => prev.map(cat => cat.id === enrich.catId ? {
                ...cat,
                products: cat.products.map(p => p.id === enrich.prodId ? { ...p, image_url: cleanedUrl, original_url: originalUrl } : p),
              } : cat));
            }
            setEnrich(null);
          }}
        />
      )}
    </div>,
    document.body
  );
}
