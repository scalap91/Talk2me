'use client';

import { useEffect, useState } from 'react';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import UnifiedCardRenderer from '@/components/embed-hub/UnifiedCardRenderer';

/**
 * Universal Embed Hub — page demo (Pascal 2026-06-05).
 *
 * Phase 2-3 : 17 plateformes représentatives (vidéo, audio, social, place,
 * article). Chaque card est produite par /api/embed-hub. Si l'embed est
 * bloqué côté plateforme (X-Frame-Options, CSP, tweet supprimé, etc.), le
 * UnifiedCardRenderer bascule sur FallbackCard (jamais d'erreur brute).
 */

const TEST_URLS: Array<{ label: string; url: string }> = [
  // ─── Vidéo ─────────────────────────────────────────────────────────────
  { label: 'YouTube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { label: 'TikTok',  url: 'https://vm.tiktok.com/ZNRv1WvPW/' },
  { label: 'Vimeo',   url: 'https://vimeo.com/76979871' },
  { label: 'Dailymotion', url: 'https://www.dailymotion.com/video/x2hwqn9' },
  { label: 'Twitch (channel)', url: 'https://www.twitch.tv/twitch' },
  { label: 'Loom',    url: 'https://www.loom.com/share/4cf73aaee29c4c91a93ea53bf7e3a85e' },
  // ─── Audio ─────────────────────────────────────────────────────────────
  { label: 'Spotify', url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b' },
  { label: 'SoundCloud', url: 'https://soundcloud.com/forss/flickermood' },
  { label: 'Apple Music', url: 'https://music.apple.com/us/album/1989-taylors-version/1713845538' },
  { label: 'Deezer',  url: 'https://www.deezer.com/track/3135556' },
  // ─── Social ────────────────────────────────────────────────────────────
  { label: 'X (Twitter)', url: 'https://twitter.com/Twitter/status/1445078208190291973' },
  { label: 'Facebook (post)', url: 'https://www.facebook.com/zuck/posts/10114974887523891' },
  { label: 'Instagram', url: 'https://www.instagram.com/p/CXJjBhPI3qf/' },
  { label: 'LinkedIn', url: 'https://www.linkedin.com/feed/update/urn:li:share:6660595489049497600' },
  { label: 'Pinterest', url: 'https://www.pinterest.com/pin/99360735500167749/' },
  { label: 'Reddit',  url: 'https://www.reddit.com/r/programming/comments/1c2x3y/example_post/' },
  // ─── Place ─────────────────────────────────────────────────────────────
  { label: 'Google Maps', url: 'https://www.google.com/maps/place/Tour+Eiffel/@48.8583701,2.2944813,17z' },
];

export default function DemoUnifiedHub() {
  const [cards, setCards] = useState<
    Array<{ label: string; url: string; card: UnifiedCard | null; latencyMs: number }>
  >([]);

  useEffect(() => {
    Promise.all(
      TEST_URLS.map(async ({ label, url }) => {
        const t0 = Date.now();
        try {
          const res = await fetch(
            `/api/embed-hub?url=${encodeURIComponent(url)}`
          );
          const j = await res.json();
          return {
            label,
            url,
            card: j.ok ? (j.card as UnifiedCard) : null,
            latencyMs: Date.now() - t0,
          };
        } catch {
          return { label, url, card: null, latencyMs: Date.now() - t0 };
        }
      })
    ).then(setCards);
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 space-y-6 max-w-4xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-white text-xl font-semibold">
          Universal Embed Hub — Phase 2-3
        </h1>
        <p className="text-white/50 text-xs">
          17 plateformes · pipeline unique URL → UnifiedCard → renderer ·
          fallback gracieux si embed bloqué (doctrine no_excuses).
        </p>
      </header>

      {cards.length === 0 && (
        <p className="text-white/50 text-sm">Loading…</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(({ label, url, card, latencyMs }, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-white/80 font-medium">
                {label}
              </span>
              <span className="text-[10px] text-white/40">
                {latencyMs}ms · {card?.source || 'error'}
                {card?.meta?.fallback ? ' · fallback' : ''}
              </span>
            </div>
            <p className="text-[10px] text-white/30 truncate font-mono">{url}</p>
            {card ? (
              <UnifiedCardRenderer card={card} />
            ) : (
              <p className="text-red-400 text-sm">Erreur fetch /api/embed-hub</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
