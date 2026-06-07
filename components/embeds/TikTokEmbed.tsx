'use client';

import { useEffect, useId, useState, type FC } from 'react';
import { audioChannel } from '@/lib/audio-channel';

interface TikTokEmbedProps {
  videoId?: string;
  user?: string;
  originalUrl: string;
}

/**
 * Talk2Me — TikTokEmbed (Pascal 2026-06-04).
 *
 * Le script officiel `tiktok.com/embed.js` exige un `data-video-id`
 * NUMÉRIQUE (ex: `7234567890123456789`). Si on lui passe un shortcode
 * (`ZNRv1WvPW` extrait de `vm.tiktok.com/...`), il n'embed RIEN.
 *
 * Logique :
 *  - videoId est numérique → on render direct.
 *  - sinon → on fetch `/api/tiktok-resolve?url=<originalUrl>` qui suit le
 *    redirect TikTok et nous rend le vrai `video_id` + `user`.
 *  - resolve KO → fallback "Voir sur TikTok".
 */

function isNumericId(s?: string): boolean {
  return !!s && /^\d+$/.test(s);
}

const TikTokEmbed: FC<TikTokEmbedProps> = ({
  videoId,
  user,
  originalUrl,
}) => {
  const [resolvedVideoId, setResolvedVideoId] = useState<string | undefined>(
    isNumericId(videoId) ? videoId : undefined
  );
  const [resolvedUser, setResolvedUser] = useState<string | undefined>(user);
  const [resolving, setResolving] = useState<boolean>(!isNumericId(videoId));
  const [error, setError] = useState<boolean>(false);

  // Talk2Me #373 (Pascal 2026-06-05) — Audio exclusif TikTok.
  // Iframe TikTok player/v1 cross-origin → pas d'API postMessage publique.
  // Workaround Spotify-style : remount iframe (key change) pour couper la lecture.
  const uid = useId();
  const participantId = `tiktok-${uid}-${resolvedVideoId ?? 'pending'}`;
  const [reloadKey, setReloadKey] = useState(0);
  const pauseSelf = () => setReloadKey((k) => k + 1);
  const handleInteract = () => {
    audioChannel.request({ id: participantId, pause: pauseSelf });
  };
  useEffect(() => {
    return () => {
      audioChannel.release(participantId);
    };
  }, [participantId]);

  // 1) Résolution shortcode → video_id numérique (si nécessaire).
  useEffect(() => {
    if (isNumericId(videoId)) {
      setResolvedVideoId(videoId);
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolving(true);
    setError(false);
    fetch(`/api/tiktok-resolve?url=${encodeURIComponent(originalUrl)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok && j?.data?.video_id) {
          setResolvedVideoId(j.data.video_id);
          if (j.data.user) setResolvedUser(j.data.user);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, originalUrl]);

  // Talk2Me #371 (Pascal 2026-06-05) : on n'utilise PLUS le blockquote + embed.js
  // (qui ne re-process pas les blockquotes ajoutés dynamiquement en SPA Next.js).
  // On utilise directement l'iframe officielle player v1 : pas de script externe,
  // pas de timing à gérer, le contenu vidéo se charge immédiatement.

  if (resolving) {
    return (
      <div className="glass rounded-2xl border border-white/10 overflow-hidden w-full max-w-full mx-auto aspect-[9/16] flex items-center justify-center text-white/40 text-sm">
        Chargement TikTok…
      </div>
    );
  }

  if (error || !resolvedVideoId) {
    return (
      <div className="glass rounded-2xl border border-white/10 overflow-hidden w-full max-w-full mx-auto">
        <div className="p-4">
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-400 hover:text-red-300 underline"
          >
            Voir sur TikTok
          </a>
        </div>
        <div className="border-t border-white/10 px-4 py-2 text-xs text-white/60">
          TikTok
        </div>
      </div>
    );
  }

  return (
    <div
      onPointerDown={handleInteract}
      className="rounded-2xl overflow-hidden w-full max-w-full mx-auto bg-black"
    >
      <div className="relative w-full" style={{ aspectRatio: '9 / 16' }}>
        <iframe
          key={reloadKey}
          src={`https://www.tiktok.com/player/v1/${resolvedVideoId}?music_info=1&description=1`}
          allow="fullscreen; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
          title={`TikTok @${resolvedUser || 'video'}`}
        />
      </div>
    </div>
  );
};

export default TikTokEmbed;
