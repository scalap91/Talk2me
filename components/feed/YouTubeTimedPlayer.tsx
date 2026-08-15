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

/** Force l'affichage de la piste de sous-titres EN (plusieurs tentatives, modules HTML5 + legacy). */
function forceCaptions(player: any) {
  const tryOn = () => {
    try {
      player.loadModule?.('captions');
      player.loadModule?.('cc');
      player.setOption?.('captions', 'track', { languageCode: 'en' });
      player.setOption?.('cc', 'track', { languageCode: 'en' });
      // DIAGNOSTIC : que voit l'API comme pistes de sous-titres ?
      try {
        const tl1 = player.getOption?.('captions', 'tracklist');
        const tl2 = player.getOption?.('cc', 'tracklist');
        console.log('[CC-DIAG] captions.tracklist=' + JSON.stringify(tl1) + ' cc.tracklist=' + JSON.stringify(tl2));
      } catch (e) { console.log('[CC-DIAG] getOption ERR ' + String(e)); }
    } catch { /* noop */ }
  };
  tryOn();
  [400, 1200, 2500].forEach((d) => setTimeout(tryOn, d));
}

export default function YouTubeTimedPlayer({ videoId, onTime, onDuration, captions = true, autoPlay = false }: { videoId: string; onTime: (t: number) => void; onDuration?: (d: number) => void; captions?: boolean; autoPlay?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    loadYtApi().then(() => {
      if (stopped || !hostRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId,
        // cc_load_policy:1 → force l'affichage des SOUS-TITRES NATIFS YouTube (piste de la vidéo,
        // parfaitement synchro). C'est LA source de paroles calée sur cette vidéo précise (les paroles
        // lrclib, elles, sont calées sur la version album → offset). Pascal 2026-07-13.
        // captions=true → CC natif YouTube forcé (karaoké synchro tant qu'on n'a pas calé lrclib).
        // captions=false → coupé (une fois lrclib calé via OCR, notre slide karaoké prend le relais).
        // autoplay:1 quand autoPlay (ouverture native /mes-cards?native=1) → le son démarre seul,
        // exactement comme le lecteur natif du feed. Web normal (autoPlay=false) : pas d'autoplay.
        playerVars: { modestbranding: 1, rel: 0, playsinline: 1, autoplay: autoPlay ? 1 : 0, cc_load_policy: captions ? 1 : 0, cc_lang_pref: 'en', hl: 'en' },
        events: {
          // cc_load_policy seul ne FORCE pas la piste via l'API IFrame. On l'active à l'ouverture ET
          // au démarrage de la lecture (onStateChange PLAYING) — c'est là que la piste devient dispo.
          onReady: (e: any) => { if (autoPlay) { try { e.target.playVideo?.(); } catch { /* geste requis */ } } if (captions) forceCaptions(e.target); },
          onStateChange: (e: any) => { if (captions && e?.data === 1) forceCaptions(e.target); },
        },
      });
      let durSent = false;
      const tick = () => {
        try {
          const t = playerRef.current?.getCurrentTime?.();
          if (typeof t === 'number') onTime(t);
          // Durée de la vidéo : dispo une fois la lecture amorcée. Sert au gate de complétude
          // du karaoké (on ne cale que si les fragments couvrent ~toute la chanson). Pascal 2026-07-13.
          if (!durSent && onDuration) {
            const d = playerRef.current?.getDuration?.();
            if (typeof d === 'number' && d > 1) { onDuration(d); durSent = true; }
          }
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
