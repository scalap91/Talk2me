'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ProductEnrichSheet from '@/components/boutique/ProductEnrichSheet';
import BoutiqueVitrinePreview from '@/components/boutique/BoutiqueVitrinePreview';

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

      {/* Scrollable preview — MÊME composant que le lecteur boutique (rendu identique garanti). */}
      <BoutiqueVitrinePreview
        editable
        coverUrl={coverUrl}
        coverPos={coverPos}
        name={name}
        description={description}
        categories={categories}
        coverRef={coverRef}
        onCoverPointerDown={handlePointerDown}
        onPickCover={() => fileInputRef.current?.click()}
        onClearCover={() => setCoverUrl('')}
        onCoverFile={handleCoverUpload}
        onNameChange={setName}
        onDescriptionChange={setDescription}
        onCategoryNameChange={updateCategoryName}
        onProductFile={handleProductUpload}
        onRemoveProduct={removeProduct}
        onProductFieldChange={(catId, prodId, field, v) => updateProduct(catId, prodId, field, v)}
        onToggleWholesale={toggleWholesale}
        onEnrich={setEnrich}
        onAddProduct={addProduct}
        onAddCategory={addCategory}
        onCleanAll={cleanAllPhotos}
        cleaningAll={cleaningAll}
      />
      {/* Le composer garde SON propre input file caché (déclenché par onPickCover). */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />

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
