'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Phone, Video, MessageCircle, CircleUserRound } from 'lucide-react';

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

export default function ChatHeader() {
  const [me, setMe] = useState<MeUser | null>(null);

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
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/8 bg-[#0e0e12]/85 px-4 backdrop-blur-xl">
      {/* Talk2Me (Pascal 2026-06-07) — icône Profil (remplace la bulle photo). */}
      <Link
        href="/profile"
        className="text-white/70 hover:text-white transition-colors"
        aria-label="Mon profil"
      >
        <CircleUserRound size={26} strokeWidth={1.75} />
      </Link>

      <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-medium tracking-tight text-white/95">
        Talk2Me
      </h1>

      <div className="flex items-center gap-3">
        <button className="text-white/55 hover:text-white/90 transition-colors" aria-label="Phone">
          <Phone size={20} />
        </button>
        <button className="text-white/55 hover:text-white/90 transition-colors" aria-label="Video">
          <Video size={20} />
        </button>
        <Link
          href="/messages"
          className="text-white/55 hover:text-white/90 transition-colors"
          aria-label="Messages"
        >
          <MessageCircle size={20} />
        </Link>
      </div>
    </header>
  );
}
