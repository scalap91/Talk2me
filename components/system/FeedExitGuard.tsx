'use client';

/**
 * RÈGLE D'OR (Pascal 2026-06-29) : « On arrive par le feed, on sort par le feed. »
 * Le feed (/home) est la racine de l'app. Tous les retours y mènent (goBack), et
 * DEPUIS le feed, le bouton retour (flèche app OU bouton Android, qui fait un
 * history.back dans la WebView) demande UNE 2e confirmation avant de quitter —
 * façon TikTok. 1er retour → toast « Appuie encore pour quitter » ; 2e dans les
 * 2 s → on laisse sortir (la WebView quitte l'appli ; en navigateur, retour réel).
 *
 * Monté UNIQUEMENT sur le feed → n'interfère JAMAIS avec les retours des autres
 * pages (qui reviennent normalement au feed).
 */
import { useEffect, useState } from 'react';

export default function FeedExitGuard() {
  const [toast, setToast] = useState(false);

  useEffect(() => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Entrée « sentinelle » : sans elle, le 1er retour sortirait direct de l'appli.
    try { window.history.pushState({ t2mFeedGuard: 1 }, ''); } catch { /* */ }

    const onPop = () => {
      // Sécurité : on ne garde QUE le feed.
      if (window.location.pathname !== '/home') return;
      if (armed) {
        // 2e retour → on laisse réellement sortir (WebView Android quitte l'appli).
        armed = false;
        window.removeEventListener('popstate', onPop);
        try { window.history.back(); } catch { /* */ }
        return;
      }
      // 1er retour → on ré-arme la sentinelle et on prévient.
      armed = true;
      try { window.history.pushState({ t2mFeedGuard: 1 }, ''); } catch { /* */ }
      setToast(true);
      timer = setTimeout(() => { armed = false; setToast(false); }, 2000);
    };

    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[120] px-4 py-2.5 rounded-full bg-black/85 text-white text-[13px] font-medium pointer-events-none shadow-lg">
      Appuie encore pour quitter
    </div>
  );
}
