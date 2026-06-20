'use client';

/**
 * Talk2Me — ANNONCES (Pascal 2026-06-10). Onglet "Annonces" : les ARTICLES des
 * boutiques regroupés PAR CATÉGORIE (rangées horizontales) + les SERVICES.
 * Source : /api/annonces (données réelles direct_cards + boutiques service).
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Store, ChevronLeft, Plus, Tag, Pencil, Trash2 } from 'lucide-react';
import BoutiqueSheet from './BoutiqueSheet';
import DepositAnnonceSheet, { type AnnonceDraft } from './DepositAnnonceSheet';
import AnnonceDetailSheet, { type AnnonceDetail } from './AnnonceDetailSheet';

interface DepItem { id: string; media_url: string | null; title: string; category: string; price_label: string | null; description: string | null; city: string | null; seller: string | null; shop_key: string | null; shop_name: string | null }
interface DepCategory { category: string; count: number; items: DepItem[] }
interface MyAnnonce { id: string; title: string; category: string; price_cents: number | null; city: string | null; image_url: string | null; description: string | null; shop_id: string | null; status: 'draft' | 'published' }

export default function AnnoncesFeed({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const [deposits, setDeposits] = useState<DepCategory[]>([]);
  const [mine, setMine] = useState<MyAnnonce[]>([]);
  const [loading, setLoading] = useState(true);
  const [openShop, setOpenShop] = useState<string | null>(null); // boutique ouverte (depuis une annonce)
  const [detail, setDetail] = useState<AnnonceDetail | null>(null); // annonce ouverte
  const [deposit, setDeposit] = useState<null | AnnonceDraft>(null); // sheet dépôt (objet = édition, {} = nouvelle)

  const loadFeed = useCallback(() => {
    fetch('/api/annonces', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setDeposits(d.deposits || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  const loadMine = useCallback(() => {
    fetch('/api/annonces/mine', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setMine(d.annonces || []); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadFeed(); loadMine(); }, [loadFeed, loadMine]);

  const delMine = async (id: string) => {
    await fetch('/api/annonces/mine', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
    loadMine(); loadFeed();
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#0e0e12]">
      {/* Header plein écran : retour + titre (masqué quand emboîté dans Acheter) */}
      {!embedded && (
        <header className="shrink-0 flex items-center gap-2 px-3 border-b border-white/8 bg-[#0e0e12]" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
          <button onClick={onBack} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/80 hover:text-white">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <Store className="w-5 h-5 text-red-300" />
          <h1 className="text-[17px] font-semibold text-white/95">Annonces</h1>
        </header>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto pt-3 pb-6">

      {/* DÉPOSER VOTRE ANNONCE (Pascal 2026-06-11) */}
      <div className="px-4 mb-3">
        <button
          onClick={() => setDeposit({})}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-600 text-white text-[14px] font-semibold active:scale-[0.99]"
        >
          <Plus className="w-4.5 h-4.5" /> Déposer votre annonce
        </button>
      </div>

      {/* MES ANNONCES (brouillons + publiées) */}
      {mine.length > 0 && (
        <section className="mb-5">
          <div className="px-4 mb-2 flex items-center gap-1.5">
            <Tag className="w-4 h-4 text-red-300" />
            <h2 className="text-[14px] font-semibold text-white/90">Mes annonces</h2>
          </div>
          <div className="px-4 space-y-2">
            {mine.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/30 shrink-0">
                  {a.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.image_url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/95 truncate">{a.title}</p>
                  <p className="text-[11px] text-white/45 truncate">{a.category}{a.city ? ` · ${a.city}` : ''}</p>
                  <span className={`inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full ${a.status === 'published' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}`}>{a.status === 'published' ? 'Publiée' : 'Brouillon'}</span>
                </div>
                <button onClick={() => setDeposit({ id: a.id, title: a.title, category: a.category, description: a.description, price_cents: a.price_cents, city: a.city, image_url: a.image_url, shop_id: a.shop_id, status: a.status })} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/75"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => delMine(a.id)} className="w-8 h-8 rounded-full bg-white/5 grid place-items-center text-white/40"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-white/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : deposits.length === 0 ? (
        <p className="text-center text-white/40 text-[13px] px-8 py-10">Aucune annonce déposée pour l’instant. Dépose la première 👆</p>
      ) : (
        <>
          {/* ANNONCES DÉPOSÉES (formulaire) PAR CATÉGORIE — rien d'autre (Pascal 2026-06-11 :
              plus de catalogue boutiques ni services déversés ici) */}
          {deposits.map((c) => (
            <section key={`dep-${c.category}`} className="mb-5">
              <div className="px-4 mb-2 flex items-center justify-between">
                <h2 className="text-[14px] font-semibold text-white/90 inline-flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-red-300" />{c.category}</h2>
                <span className="text-[11px] text-white/40">{c.count}</span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto px-4 scrollbar-none">
                {c.items.map((it) => (
                  <button key={it.id} type="button" onClick={() => setDetail({ id: it.id, title: it.title, media_url: it.media_url, price_label: it.price_label, category: it.category, description: it.description, city: it.city, seller: it.seller, shop_key: it.shop_key, shop_name: it.shop_name })} className="shrink-0 w-32 text-left active:scale-[0.98]">
                    <div className="relative w-32 h-32 rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03]">
                      {it.media_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.media_url} alt={it.title} className="w-full h-full object-cover" />
                      )}
                      {it.price_label && (
                        <span className="absolute bottom-1.5 left-1.5 text-[12px] font-bold px-1.5 py-0.5 rounded-lg bg-black/65 text-white">{it.price_label}</span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-white/70 line-clamp-2 px-0.5">{it.title}</p>
                    {it.seller && <p className="text-[10px] text-white/40 px-0.5">{it.seller}</p>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
      </div>

      {/* Détail d'une annonce (porte d'entrée → contacter / voir la boutique) */}
      {detail && <AnnonceDetailSheet annonce={detail} onClose={() => setDetail(null)} onViewShop={(k) => setOpenShop(k)} />}
      {/* Boutique (ouverte depuis une annonce rattachée) */}
      {openShop && <BoutiqueSheet shopKey={openShop} onClose={() => setOpenShop(null)} />}
      {/* Formulaire de dépôt d'annonce */}
      {deposit && <DepositAnnonceSheet initial={deposit} onClose={() => setDeposit(null)} onSaved={() => { setDeposit(null); loadMine(); loadFeed(); }} />}
    </div>
  );
}

