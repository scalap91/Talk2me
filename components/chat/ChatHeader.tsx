'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CircleUserRound, Car } from 'lucide-react';

interface MeUser {
  id: string;
  talk2me_id: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
}

function initialsOf(name: string | null, fallback: string): string {
  const src = (name && name.trim()) || fallback;
  const parts = src.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function ChatHeader({ transparent = false, center }: { transparent?: boolean; center?: ReactNode }) {
  const [, setMe] = useState<MeUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setMe(data.user as MeUser);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  return (
    // safe-area en haut → le contenu descend sous la barre batterie (plus d'empiètement).
    <header className={'sticky top-0 z-50 flex h-14 items-center justify-between gap-1 px-3 pt-[env(safe-area-inset-top)] ' + (transparent ? '' : 'border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl')}>
      {/* Icône Profil (gauche). */}
      <Link
        href="/profile"
        className="shrink-0 text-white/80 hover:text-white transition-colors"
        aria-label="Mon profil"
      >
        <CircleUserRound size={32} strokeWidth={1.9} />
      </Link>

      {/* Centre : les onglets (Tout/Amis/Populaire/Shop) — plus de titre « Talk2Me ». */}
      <div className="flex-1 min-w-0 flex items-center justify-center overflow-x-auto">
        {center}
      </div>

      {/* Droite : Découvrir (recherche) + Talk N Drive. */}
      <div className="shrink-0 flex items-center gap-3">
        <Link
          href="/decouvrir"
          className="text-[14px] font-medium text-white/80 hover:text-white transition-colors active:scale-95 whitespace-nowrap"
          aria-label="Découvrir / Rechercher"
        >
          Rechercher
        </Link>
        <Link
          href="/drive"
          className="text-white/80 hover:text-white transition-colors active:scale-95"
          aria-label="Talk N Drive"
        >
          <Car size={32} strokeWidth={2.1} />
        </Link>
      </div>
    </header>
  );
}
