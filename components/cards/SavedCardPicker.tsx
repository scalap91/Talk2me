'use client';

/**
 * SavedCardPicker — sélecteur de contenu À MOI à attacher (Pascal 2026-07-14).
 * Bottom-sheet façon MusicPickerSheet, source selon le type :
 *   - boutique : MES boutiques créées (GET /api/simple-shop)
 *   - article  : MES cards enregistrées de type contenu (GET /api/cards/saved)
 * Multi-sélection possible → onSelect(raws). Esprit .card : on attache des cards imbriquées.
 */
import { useEffect, useState } from 'react';
import { X, Check } from '@/lib/icons';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SavedCard = { id: string; card_kind: string; card_data: any; title: string | null };

type PickItem = { id: string; title: string; thumb: string; raw: unknown };

export default function SavedCardPicker({
  open,
  kind,
  multi = false,
  onClose,
  onSelect,
}: {
  open: boolean;
  kind: 'article' | 'boutique';
  multi?: boolean;
  onClose: () => void;
  onSelect: (raws: unknown[]) => void;
}) {
  const [items, setItems] = useState<PickItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSel([]);
    // Article = TOUS les articles de TOUTES les boutiques (catalogue global) ; Boutique = MES boutiques.
    const url = kind === 'boutique' ? '/api/simple-shop' : '/api/simple-shop/products?limit=300';
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        if (kind === 'boutique') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const shops = ((d?.shops as any[]) || []).filter((s) => (s.kind || 'boutique') === 'boutique');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setItems(shops.map((s: any) => ({ id: s.id, title: s.name || 'Ma boutique', thumb: s.coverUrl || s.cover_url || '', raw: s })));
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const products = (d?.products as any[]) || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setItems(products.map((p: any) => ({ id: p.id, title: p.price_label ? `${p.title} · ${p.price_label}` : (p.title || 'Article'), thumb: p.image_url || '', raw: p })));
        }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, kind]);

  if (!open) return null;

  const label = kind === 'boutique' ? 'Ma boutique' : 'Articles des boutiques';
  const emptyMsg =
    kind === 'boutique'
      ? 'Tu n’as pas encore de boutique. Crée-en une, puis attache-la à un post.'
      : 'Aucun article dans les boutiques pour l’instant.';

  const toggle = (it: PickItem) => {
    if (multi) {
      setSel((s) => (s.includes(it.id) ? s.filter((x) => x !== it.id) : [...s, it.id]));
    } else {
      onSelect([it.raw]);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onClose} role="dialog" aria-label={label}>
      <div className="w-full max-w-[480px] h-[80vh] bg-[var(--t2m-paper)] border-t border-[var(--t2m-line)] rounded-t-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--t2m-line)]">
          <span className="text-[var(--t2m-ink)] font-semibold text-[15px]">{label}</span>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-[var(--t2m-ink-2)]"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-center text-[var(--t2m-ink-2)] py-12 text-[13px]">Chargement…</div>
          ) : items.length === 0 ? (
            <div className="text-center text-[var(--t2m-ink-2)] py-12 text-[13px] px-6">{emptyMsg}</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {items.map((it) => {
                const on = sel.includes(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggle(it)}
                    className={'relative aspect-square rounded-xl overflow-hidden active:scale-[0.97] transition ' + (on ? 'ring-2 ring-red-500' : '')}
                  >
                    {it.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[var(--t2m-wash)] grid place-items-center text-[11px] text-[var(--t2m-ink-3)] p-1.5 text-center font-medium">{it.title}</div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pt-4 pb-1">
                      <div className="text-[10px] text-white truncate">{it.title}</div>
                    </div>
                    {multi && on && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 grid place-items-center"><Check className="w-3 h-3 text-white" /></span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {multi && (
          <div className="p-3 border-t border-[var(--t2m-line)]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
            <button
              type="button"
              disabled={sel.length === 0}
              onClick={() => { onSelect(items.filter((it) => sel.includes(it.id)).map((it) => it.raw)); onClose(); }}
              className="w-full py-3 rounded-full bg-red-600 text-white font-semibold disabled:opacity-40 active:scale-[0.99]"
            >
              Attacher{sel.length > 0 ? ` (${sel.length})` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
