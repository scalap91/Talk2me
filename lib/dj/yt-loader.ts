'use client';

/**
 * Talk2Me — Loader singleton de l'API YouTube IFrame, partagé par les platines DJ.
 * Même mécanisme que MusicPlayerFeed (mono-player persistant) : on charge le
 * script une seule fois pour toute la session, puis on instancie autant de
 * lecteurs qu'on veut (1 par platine).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ytApiPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadYouTubeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT); };
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script');
      s.id = 'yt-iframe-api';
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
    // Garde-fou si l'API était déjà prête sans event.
    const poll = setInterval(() => {
      if (w.YT && w.YT.Player) { clearInterval(poll); resolve(w.YT); }
    }, 250);
    setTimeout(() => clearInterval(poll), 8000);
  });
  return ytApiPromise;
}
