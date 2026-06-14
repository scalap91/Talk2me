'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Boutique {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  created_at: string;
}

export default function BoutiquesList() {
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

  if (boutiques.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-white/40 text-[13px]">
        Aucune boutique pour l&apos;instant.
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-[13px] font-semibold text-white/80 px-3 pt-3 pb-1">
        Toutes les boutiques
      </h3>
      <div className="flex flex-col gap-2 px-3 pb-4">
        {boutiques.map((b) => (
          <Link
            key={b.id}
            href={`/boutique/${b.id}`}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2 active:scale-[0.99] transition-transform"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={b.cover_url || '/placeholder.svg'}
              alt={b.name}
              className="w-16 h-16 rounded-xl object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.parentElement!.classList.add(
                  'bg-gradient-to-br',
                  'from-red-500/30',
                  'to-red-600/30'
                );
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-white line-clamp-1">
                {b.name}
              </p>
              {b.description && (
                <p className="text-[12px] text-white/55 line-clamp-2 mt-0.5">
                  {b.description}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
