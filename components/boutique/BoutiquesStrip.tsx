'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface PreviewArticle {
  image_url: string;
  title: string;
  price_label: string;
}

interface Boutique {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  cover_position?: string | null;
  preview_articles?: PreviewArticle[];
  created_at: string;
}

/**
 * Miniature : affiche une PETITE CARD PRODUIT (photo + titre + prix), puis la
 * suivante (fondu). Un article après l'autre, pas de défilement continu.
 */
function BoutiqueThumb({ b }: { b: Boutique }) {
  const arts = b.preview_articles && b.preview_articles.length > 0 ? b.preview_articles : [];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (arts.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % arts.length), 2400);
    return () => clearInterval(t);
  }, [arts.length]);

  if (arts.length === 0) {
    return (
      <div className="relative w-full aspect-[3/4] overflow-hidden bg-[#15151c]">
        {b.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={b.cover_url}
            alt={b.name}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: b.cover_position || 'center center' }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/30 to-red-600/30" />
        )}
        <span className="absolute top-1 left-1 text-[9px] font-semibold text-red-200 bg-black/45 rounded px-1.5 py-0.5">
          Boutique
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[3/4] overflow-hidden bg-[#15151c]">
      {arts.map((a, i) => (
        <div
          key={i}
          className={
            'absolute inset-0 transition-opacity duration-500 ' +
            (i === idx ? 'opacity-100' : 'opacity-0')
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.image_url} alt={a.title} draggable={false} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-1.5 pt-4 pb-1.5">
            {a.title && <div className="text-[9px] leading-tight text-white line-clamp-2">{a.title}</div>}
            {a.price_label && <div className="text-[11px] font-bold text-white mt-0.5">{a.price_label}</div>}
          </div>
        </div>
      ))}
      <span className="absolute top-1 left-1 z-10 text-[9px] font-semibold text-red-200 bg-black/45 rounded px-1.5 py-0.5">
        Boutique
      </span>
    </div>
  );
}

export default function BoutiquesStrip() {
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/boutiques/shop', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setBoutiques(data.boutiques || []);
      })
      .catch(() => {
        setBoutiques([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (boutiques.length === 0) return null;

  return (
    <div className="shrink-0">
      <h3 className="text-[13px] font-semibold text-white/80 px-3 pt-2 pb-1">Boutiques</h3>
      <div className="flex gap-3 px-3 pb-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-px-3">
        {boutiques.map((b) => (
          <Link
            key={b.id}
            href={`/boutique/${b.id}`}
            className="w-[120px] shrink-0 snap-start rounded-2xl overflow-hidden border border-red-400/35 bg-[#15151c] shadow-lg shadow-black/40 ring-1 ring-white/5"
          >
            <BoutiqueThumb b={b} />
            <p className="text-[12px] font-medium text-white px-2 py-1.5 line-clamp-1">{b.name}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
