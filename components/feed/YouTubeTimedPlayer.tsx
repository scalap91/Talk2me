'use client';
/**
 * YouTubeTimedPlayer — lecteur YouTube (IFrame API) qui REMONTE le temps de lecture (Pascal 2026-07-13).
 * Sert le karaoké : les paroles synchro se calent sur `currentTime`. Charge l'API une seule fois,
 * crée un YT.Player sur le div hôte, et pousse le temps dans `onTime` toutes les ~200 ms.
 * Best-effort : si l'API ne charge pas, on ne casse rien (pas de karaoké, mais la card vit).
 */
import { useEffect, useRef } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<void> | null = null;
function loadYtApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { prev?.(); } catch { /* noop */ } resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  });
  return apiPromise;
}

export default function YouTubeTimedPlayer({ videoId, onTime }: { videoId: string; onTime: (t: number) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    loadYtApi().then(() => {
      if (stopped || !hostRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId,
        playerVars: { modestbranding: 1, rel: 0, playsinline: 1 },
      });
      const tick = () => {
        try {
          const t = playerRef.current?.getCurrentTime?.();
          if (typeof t === 'number') onTime(t);
        } catch { /* player pas prêt */ }
        timer = setTimeout(tick, 200);
      };
      tick();
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      try { playerRef.current?.destroy?.(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // L'API remplace ce div par l'iframe. Il remplit le cadre 16/9 parent.
  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
