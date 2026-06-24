'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Découvrir (Pascal 2026-06-14, refondu 2026-06-23). RECHERCHE = MÊME RENDU QUE LE FEED :
 * les résultats sont de VRAIES cards plein écran (PostShell, snap-scroll), strictement identiques
 * à /home. Plus de grille de vignettes, plus de "clic → aller au post" (le post EST déjà affiché en
 * entier) → fini les mauvais atterrissages. Barre de recherche fixe en haut, filtre caption+text.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search } from 'lucide-react';
import PostShell from '@/components/feed/PostShell';

interface Item { id: string; kind: string; media_url?: string | null; caption?: string | null; text?: string | null; bg_variant?: string | null; post_type?: string | null; views?: number; likes?: number; }

const PAGE = 24;

export default function DecouvrirPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async (reset: boolean) => {
    if (reset) { offsetRef.current = 0; setHasMore(true); }
    const off = reset ? 0 : offsetRef.current;
    try {
      const r = await fetch(`/api/posts?scope=shop&sort=popular&limit=${PAGE}&offset=${off}`, { cache: 'no-store' });
      // scope=shop = commerce ; mais on veut tout le visuel → on prend le flux général aussi
      const r2 = await fetch(`/api/posts?sort=popular&limit=${PAGE}&offset=${off}`, { cache: 'no-store' });
      const [d1, d2] = await Promise.all([r.json().catch(() => ({})), r2.json().catch(() => ({}))]);
      const merged: Item[] = [...(d2.items || []), ...(d1.items || [])]
        // garde TOUT (image, vidéo ET texte) — on n'élimine plus les cards texte.
        .filter((it: Item) => it.kind !== 'boutique' && (!!it.media_url || it.kind === 'texte_card' || !!it.caption || !!it.text));
      // dédup par id
      const seen = new Set<string>();
      const fresh = merged.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
      offsetRef.current = off + PAGE;
      setItems((prev) => {
        if (reset) return fresh;
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...fresh.filter((f) => !ids.has(f.id))];
      });
      if ((d2.items || []).length < PAGE && (d1.items || []).length < PAGE) setHasMore(false);
    } finally { setLoading(false); setLoadingMore(false); }
  }, []);

  useEffect(() => { load(true); }, [load]);

  // scroll infini
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && hasMore && !loadingMore && !loading) { setLoadingMore(true); load(false); }
    }, { rootMargin: '600px' });
    io.observe(el); return () => io.disconnect();
  }, [hasMore, loadingMore, loading, load]);

  const ql = q.trim().toLowerCase();
  const shown = ql ? items.filter((it) => ((it.caption || '') + ' ' + (it.text || '')).toLowerCase().includes(ql)) : items;

  return (
    <main className="fixed inset-0 bg-[#0b0b0d] flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 border-b border-white/8">
        <button onClick={() => router.back()} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/85 active:scale-95"><ChevronLeft className="w-6 h-6" /></button>
        <div className="flex-1 flex items-center gap-2 bg-white/[0.07] rounded-full px-3.5 h-10 border border-white/10">
          <Search className="w-4 h-4 text-white/45" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher"
            className="flex-1 bg-transparent outline-none text-[15px] text-white placeholder-white/40"
          />
        </div>
      </header>

      {/* MÊME RENDU QUE LE FEED : les résultats sont de vraies cards plein écran (PostShell),
          snap-scroll, identiques à /home. (Avant : grille de vignettes ≠ feed.) Pascal 2026-06-23. */}
      <main className="flex-1 min-h-0 overflow-y-scroll snap-y snap-mandatory overscroll-contain" style={{ scrollSnapStop: 'always' }}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-white/40 text-sm">Chargement…</div>
        ) : shown.length === 0 ? (
          <div className="h-full grid place-items-center px-10 text-center">
            <div>
              <Search className="w-8 h-8 text-white/25 mx-auto mb-3" strokeWidth={1.6} />
              <p className="text-white/60 text-[15px] font-medium">{ql ? 'Rien trouvé' : 'Rien à découvrir pour l’instant'}</p>
              <p className="text-white/35 text-[13px] mt-1">{ql ? 'Essaie un autre mot.' : 'Publie ou attends que ça se remplisse.'}</p>
            </div>
          </div>
        ) : (
          <>
            {shown.map((it, i) => (
              <PostShell key={`${it.kind}-${it.id}`} item={it as never} idx={i} scope="" adminMode={false} onAdminDelete={() => {}} />
            ))}
            <div ref={sentinel} className="h-16 flex items-center justify-center text-white/30 text-xs">
              {loadingMore ? 'Chargement…' : hasMore ? '' : 'Fin'}
            </div>
          </>
        )}
      </main>
    </main>
  );
}
