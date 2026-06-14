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
      <div className="min-h-[100dvh] bg-[#0a0a0d] flex items-center justify-center text-white/60 text-sm">
        Chargement…
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0d] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-white/80 text-[15px]">Cette page n&apos;existe pas.</p>
        <Link href="/home" className="px-4 py-2 rounded-full bg-white/[0.06] border border-white/10 text-white text-[13px]">
          Aller sur Talk2Me
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0d] overflow-y-auto">
      <BoutiqueVitrine boutique={data.boutique} categories={data.categories} />
    </div>
  );
}
