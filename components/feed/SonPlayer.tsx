'use client';

/**
 * Talk2Me — Lecteur du SON attaché à une card (image/texte) (#422, Pascal 2026-06-09).
 * Lecteur YouTube IFrame caché : joue le morceau quand la card est ACTIVE (à l'écran).
 *
 * Politique autoplay (Chrome/Samsung Browser) — RÈGLE D'OR :
 *   - L'autoplay AVEC son est INTERDIT sans geste utilisateur récent.
 *   - On démarre donc TOUJOURS muet (autoplay muet = autorisé).
 *   - Le son ne s'active QUE via un geste : la card appelle `playWithSound()`
 *     (poignée impérative) DANS le onClick → unMute()+playVideo() sont exécutés
 *     dans la fenêtre d'activation du geste → le son sort vraiment.
 *
 * Bug corrigé (Pascal "j'entends pas le son") : avant, onReady tentait un
 * autoplay unmuted (bloqué → lecteur jamais démarré) et le tap ne changeait pas
 * l'état `unmuted` (déjà true via sessionStorage) → aucun effet relancé → silence
 * permanent. Désormais le tap force toujours la lecture, en geste.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

let apiLoading = false;

export interface SonPlayerHandle {
  /** À appeler DANS un onClick (geste user) pour sortir le son. */
  playWithSound: () => void;
}

function loadYTApi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
    if (w.YT && w.YT.Player) return resolve();
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    if (!apiLoading) {
      apiLoading = true;
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
    // garde-fou si l'API était déjà prête sans event
    const poll = setInterval(() => {
      if (w.YT && w.YT.Player) { clearInterval(poll); resolve(); }
    }, 300);
    setTimeout(() => clearInterval(poll), 8000);
  });
}

const SonPlayer = forwardRef<SonPlayerHandle, { videoId: string; active: boolean; unmuted: boolean }>(
  function SonPlayer({ videoId, active, unmuted }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);
    const readyRef = useRef(false);
    // Reflète les dernières props pour les utiliser dans onReady (closure fraîche).
    const activeRef = useRef(active);
    const unmutedRef = useRef(unmuted);
    activeRef.current = active;
    unmutedRef.current = unmuted;

    // Poignée impérative : APPELÉE DANS LE GESTE → le son sort.
    useImperativeHandle(ref, () => ({
      playWithSound: () => {
        const p = playerRef.current;
        if (!p) return;
        try {
          p.unMute();
          p.setVolume(100);
          p.playVideo();
        } catch { /* ignore */ }
      },
    }), []);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        await loadYTApi();
        if (cancelled || !hostRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const YT = (window as any).YT;
        playerRef.current = new YT.Player(hostRef.current, {
          // Taille RÉELLE ≥200×200 (règle YouTube) : un lecteur 1px/opacity-0 ne
          // joue jamais. On le rend visible pour le navigateur mais caché DERRIÈRE
          // l'image de la card (z négatif + occlusion). Cf spec tailles YouTube.
          width: '200',
          height: '200',
          videoId,
          playerVars: { autoplay: 0, controls: 0, playsinline: 1, loop: 1, playlist: videoId, disablekb: 1, modestbranding: 1 },
          events: {
            onReady: () => {
              readyRef.current = true;
              try {
                // TOUJOURS muet au démarrage → autoplay autorisé. Le son viendra
                // d'un geste (playWithSound) ou de l'effet ci-dessous après scroll.
                playerRef.current.mute();
                if (activeRef.current) playerRef.current.playVideo();
                if (unmutedRef.current) {
                  // Tentative best-effort : si un geste récent (scroll) est encore
                  // dans la fenêtre d'activation, le son sort ; sinon reste muet.
                  playerRef.current.unMute();
                  playerRef.current.setVolume(100);
                }
              } catch { /* ignore */ }
            },
          },
        });
      })();
      return () => {
        cancelled = true;
        try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
        playerRef.current = null;
        readyRef.current = false;
      };
    }, [videoId]);

    // Play / pause selon card active ; (dé)mute selon le flag son.
    useEffect(() => {
      const p = playerRef.current;
      if (!p || !readyRef.current) return;
      try {
        if (active) p.playVideo();
        else p.pauseVideo();
        if (unmuted) { p.unMute(); p.setVolume(100); }
        else p.mute();
      } catch { /* ignore */ }
    }, [active, unmuted]);

    // Lecteur 200×200 RÉEL (sinon YouTube ne joue pas), mais caché DERRIÈRE la
    // card : z négatif + occlusion par l'image. Pas d'opacity-0, pas de 1px.
    return (
      <div className="pointer-events-none absolute left-0 top-0 -z-10 overflow-hidden" aria-hidden="true">
        <div ref={hostRef} style={{ width: 200, height: 200 }} />
      </div>
    );
  }
);

export default SonPlayer;
