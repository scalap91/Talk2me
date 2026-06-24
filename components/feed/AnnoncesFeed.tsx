'use client';

/**
 * Talk2Me — ANNONCES (Pascal 2026-06-10). Onglet "Annonces" : les ARTICLES des
 * boutiques regroupés PAR CATÉGORIE (rangées horizontales) + les SERVICES.
 * Source : /api/annonces (données réelles direct_cards + boutiques service).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Store, ChevronLeft, Plus, Tag, Pencil, Trash2, ChevronDown, Search } from 'lucide-react';
import { goBack } from '@/lib/client/go-back';
import BoutiqueSheet from './BoutiqueSheet';
import DepositAnnonceSheet, { type AnnonceDraft } from './DepositAnnonceSheet';
import AnnonceDetailSheet, { type AnnonceDetail } from './AnnonceDetailSheet';

interface DepItem { id: string; media_url: string | null; title: string; category: string; price_label: string | null; description: string | null; city: string | null; seller: string | null; shop_key: string | null; shop_name: string | null }
interface DepCategory { category: string; count: number; items: DepItem[] }
interface MyAnnonce { id: string; title: string; category: string; price_cents: number | null; city: string | null; image_url: string | null; description: string | null; shop_id: string | null; status: 'draft' | 'published' }
interface MyArticle { id: string; shop_id: string; title: string; price_cents: number; image_url: string; category: string; city: string | null; status: string }

export default function AnnoncesFeed({ onBack, embedded }: { onBack?: () => void; embedded?: boolean }) {
  const router = useRouter();
  const [deposits, setDeposits] = useState<DepCategory[]>([]);
  const [mine, setMine] = useState<MyAnnonce[]>([]);
  const [myArticles, setMyArticles] = useState<MyArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [openShop, setOpenShop] = useState<string | null>(null); // boutique ouverte (depuis une annonce)
  const [detail, setDetail] = useState<AnnonceDetail | null>(null); // annonce ouverte
  const [deposit, setDeposit] = useState<null | AnnonceDraft>(null); // sheet dépôt (objet = édition, {} = nouvelle)
  const [showMine, setShowMine] = useState(false); // « Mes annonces » repliable (ne pas bouffer l'écran)
  const [q, setQ] = useState(''); // recherche
  const [cat, setCat] = useState(''); // filtre catégorie ('' = toutes)

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
      .then((d) => { if (d?.ok) { setMine(d.annonces || []); setMyArticles(d.articles || []); } })
      .catch(() => {});
  }, []);

  useEffect(() => { loadFeed(); loadMine(); }, [loadFeed, loadMine]);

  const delMine = async (id: string) => {
    if (!window.confirm('Supprimer cette annonce ?')) return;
    try {
      const r = await fetch('/api/annonces/mine', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!r.ok) { alert('Suppression impossible, réessaie.'); return; }
    } catch { alert('Erreur réseau — suppression échouée.'); return; }
    loadMine(); loadFeed();
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#0e0e12]">
      {/* Header plein écran : retour + titre (masqué quand emboîté dans Acheter) */}
      {!embedded && (
        <header className="shrink-0 flex items-center gap-2 px-3 border-b border-white/8 bg-[#0e0e12]" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
          <button onClick={() => (onBack ? onBack() : goBack())} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/80 hover:text-white">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <Store className="w-5 h-5 text-red-300" />
          <h1 className="text-[17px] font-semibold text-white/95">Annonces</h1>
        </header>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto pt-3 pb-6">

      {/* AJOUTER UNE ANNONCE + (replié) gérer/éditer les miennes — Pascal 2026-06-23 :
          ne plus étaler « Mes annonces » qui bouffait tout l'écran. */}
      <div className="px-4 mb-3">
        <button
          onClick={() => setDeposit({})}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-600 text-white text-[14px] font-semibold active:scale-[0.99]"
        >
          <Plus className="w-4.5 h-4.5" /> Ajouter une annonce
        </button>
        {(mine.length + myArticles.length) > 0 && (
          <button
            onClick={() => setShowMine((v) => !v)}
            className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-white/60 text-[13px] font-medium active:opacity-80"
          >
            <Tag className="w-3.5 h-3.5 text-red-300" /> Mes annonces ({mine.length + myArticles.length})
            <ChevronDown className={'w-4 h-4 transition-transform ' + (showMine ? 'rotate-180' : '')} />
          </button>
        )}
      </div>

      {/* MES ANNONCES — repliable, géré/édité ici. Deux origines : annonces DÉPOSÉES
          (éditées via le formulaire) + ARTICLES de boutique badgés (édités dans la boutique). */}
      {(mine.length + myArticles.length) > 0 && showMine && (
        <section className="mb-5">
          <div className="px-4 space-y-2">
            {myArticles.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/30 shrink-0">
                  {a.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.image_url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/95 truncate">{a.title}</p>
                  <p className="text-[11px] text-white/45 truncate">{a.category}{a.city ? ` · ${a.city}` : ''} · article boutique</p>
                  <span className={`inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full ${a.status === 'published' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}`}>{a.status === 'published' ? 'En annonce' : 'Expirée'}</span>
                </div>
                <button onClick={() => router.push(`/ma-boutique/${a.shop_id}`)} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/75" aria-label="Éditer dans ma boutique"><Pencil className="w-4 h-4" /></button>
              </div>
            ))}
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

      {/* Recherche + filtres catégories */}
      <div className="px-4 mb-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une annonce…"
            className="w-full bg-white/[0.06] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-white outline-none focus:border-red-400/50" />
        </div>
        {deposits.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            <button onClick={() => setCat('')} className={'shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium ' + (cat === '' ? 'bg-red-600 text-white' : 'bg-white/[0.06] text-white/70')}>Tout</button>
            {deposits.map((c) => (
              <button key={c.category} onClick={() => setCat(c.category === cat ? '' : c.category)} className={'shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium ' + (cat === c.category ? 'bg-red-600 text-white' : 'bg-white/[0.06] text-white/70')}>{c.category}</button>
            ))}
          </div>
        )}
      </div>

      {/* Catalogue : grille 2 colonnes (style annonces) */}
      {loading ? (
        <div className="flex justify-center py-12 text-white/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (() => {
        const ql = q.trim().toLowerCase();
        const items = deposits
          .filter((c) => !cat || c.category === cat)
          .flatMap((c) => c.items)
          .filter((it) => !ql || (it.title + ' ' + (it.description || '')).toLowerCase().includes(ql));
        if (items.length === 0) {
          return <p className="text-center text-white/40 text-[13px] px-8 py-10">{q || cat ? 'Rien trouvé.' : 'Aucune annonce pour l’instant. Dépose la première 👆'}</p>;
        }
        return (
          <div className="grid grid-cols-2 gap-2.5 px-4">
            {items.map((it) => (
              <button key={it.id} type="button" onClick={() => setDetail({ id: it.id, title: it.title, media_url: it.media_url, price_label: it.price_label, category: it.category, description: it.description, city: it.city, seller: it.seller, shop_key: it.shop_key, shop_name: it.shop_name })} className="text-left active:scale-[0.98] rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03]">
                <div className="relative w-full aspect-square bg-black/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {it.media_url && <img src={it.media_url} alt={it.title} className="w-full h-full object-cover" />}
                  {it.price_label && <span className="absolute bottom-1.5 left-1.5 text-[13px] font-bold px-2 py-0.5 rounded-lg bg-black/70 text-white">{it.price_label}</span>}
                </div>
                <div className="p-2">
                  <p className="text-[13px] font-medium text-white/95 line-clamp-1">{it.title}</p>
                  {it.description && <p className="text-[11px] text-white/55 line-clamp-2 leading-snug mt-0.5">{it.description}</p>}
                  {(it.city || it.seller) && <p className="text-[10px] text-white/40 mt-1 truncate">{it.city || ''}{it.city && it.seller ? ' · ' : ''}{it.seller || ''}</p>}
                </div>
              </button>
            ))}
          </div>
        );
      })()}
      </div>

      {/* Détail d'une annonce (porte d'entrée → contacter / voir la boutique) */}
      {detail && (() => {
        // Est-ce MON annonce ? (article badgé OU annonce déposée) → fiche en mode propriétaire.
        const art = myArticles.find((a) => a.id === detail.id);
        const dep = mine.find((a) => a.id === detail.id);
        return (
          <AnnonceDetailSheet
            annonce={detail}
            onClose={() => setDetail(null)}
            onViewShop={(k) => setOpenShop(k)}
            isMine={!!art || !!dep}
            onEdit={() => {
              if (art) { router.push(`/ma-boutique/${art.shop_id}`); return; }
              if (dep) setDeposit({ id: dep.id, title: dep.title, category: dep.category, description: dep.description, price_cents: dep.price_cents, city: dep.city, image_url: dep.image_url, shop_id: dep.shop_id, status: dep.status });
            }}
          />
        );
      })()}
      {/* Boutique (ouverte depuis une annonce rattachée) */}
      {openShop && <BoutiqueSheet shopKey={openShop} onClose={() => setOpenShop(null)} />}
      {/* Formulaire de dépôt d'annonce */}
      {deposit && <DepositAnnonceSheet initial={deposit} onClose={() => setDeposit(null)} onSaved={() => { setDeposit(null); loadMine(); loadFeed(); }} />}
    </div>
  );
}

