'use client';

/**
 * Talk2Me #428 — Vitrine boutique à URL PROPRE : talk2me.fr/<slug>.
 * Route racine dynamique : les routes statiques de l'app (home, signin, shop…)
 * ont la priorité ; tout autre segment simple est traité comme un slug de
 * boutique. L'API /api/boutiques/<slug> résout par slug. 404 sinon.
 */

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import BoutiqueVitrine from '@/components/boutique/BoutiqueVitrine';

interface ApiResponse {
  ok: boolean;
  boutique: { name: string; description: string | null; cover_url: string | null };
  categories: Array<{
    category: string;
    products: Array<{
      id: string;
      media_url: string | null;
      caption: string | null;
      product: {
        title?: string;
        price_label?: string;
        image_url?: string;
        source?: string;
        source_url?: string;
      } | null;
      boosted?: boolean;
    }>;
  }>;
}

export default function SlugBoutiquePage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/boutiques/${encodeURIComponent(slug)}`, { cache: 'no-store' });
        if (!alive) return;
        if (!r.ok) {
          setNotFound(true);
          return;
        }
        const j = await r.json();
        if (j?.ok && j.boutique) setData(j);
        else setNotFound(true);
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-[100svh] bg-[var(--t2m-paper)] flex items-center justify-center text-[var(--t2m-ink-3)] text-sm">
        Chargement…
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-[100svh] bg-[var(--t2m-paper)] flex flex-col items-center justify-center gap-5 px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/t2m-logo-square.png" alt="Talk2Me" className="w-20 h-20 rounded-2xl" />
        <p className="text-[var(--t2m-ink)] text-[22px] font-semibold">Page introuvable</p>
        <p className="text-[var(--t2m-ink-3)] text-[14px] max-w-xs">Cette boutique ou cette page n&apos;existe pas (ou plus).</p>
        {/* Lien DUR (<a>) → retour garanti au feed, jamais coincé. */}
        <a href="/home" className="mt-1 px-6 py-3 rounded-full bg-red-600 text-white text-[15px] font-semibold active:scale-95">
          ← Retour au feed
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-[var(--t2m-paper)] overflow-y-auto">
      <BoutiqueVitrine boutique={data.boutique} categories={data.categories} />
    </div>
  );
}
