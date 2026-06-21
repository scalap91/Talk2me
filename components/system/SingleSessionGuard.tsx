'use client';

/**
 * SingleSessionGuard — une seule fenêtre Talk2Me active par navigateur (façon
 * WhatsApp Web). Pascal 2026-06-20.
 *
 * Sur un même navigateur, si un 2ᵉ onglet/fenêtre s'ouvre, il affiche
 * « Talk2Me est ouvert dans une autre fenêtre — [Utiliser ici] » et NE MONTE PAS
 * l'appli (children) → ça coupe SSE/sonneries/présence sur les onglets passifs.
 * « Utiliser ici » prend la main : l'onglet précédemment actif passe en pause.
 *
 * Mécanique : BroadcastChannel 'ttm-session' (même origine, multi-onglets).
 * Pas de blocage cross-appareil (le mobile/APK reste indépendant). SSR-safe :
 * si BroadcastChannel indispo, on n'active pas le garde (rend children normalement).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export default function SingleSessionGuard({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const tabId = useRef<string>(Math.random().toString(36).slice(2));
  const bcRef = useRef<BroadcastChannel | null>(null);
  const activeRef = useRef<boolean>(true);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return; // SSR / vieux navigateur → pas de garde
    // Le verrou « une seule fenêtre » est DESKTOP-ONLY (Pascal 2026-06-21) :
    //  - JAMAIS sur l'APK natif (Capacitor) : c'est l'app principale.
    //  - JAMAIS sur mobile (navigateur téléphone) : pas de multi-fenêtres gênant.
    //  → il ne s'active QUE sur ordinateur.
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const isNativeApp = !!cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
    const isMobile = /Android|iPhone|iPad|iPod|Mobile|Mobi|Silk|Kindle/i.test(navigator.userAgent || '');
    if (isNativeApp || isMobile) { activeRef.current = true; setBlocked(false); return; }
    const bc = new BroadcastChannel('ttm-session');
    bcRef.current = bc;
    let decided = false;

    const becomeActive = () => { activeRef.current = true; setBlocked(false); };
    const becomeInactive = () => { activeRef.current = false; setBlocked(true); };

    bc.onmessage = (e: MessageEvent) => {
      const m = e.data as { type?: string; from?: string } | null;
      if (!m || m.from === tabId.current) return;
      if (m.type === 'ping') {
        // Quelqu'un démarre : si JE suis l'onglet actif, je réponds que la place est prise.
        if (activeRef.current) bc.postMessage({ type: 'pong', from: tabId.current });
      } else if (m.type === 'pong') {
        decided = true; becomeInactive(); // un autre onglet est déjà actif
      } else if (m.type === 'takeover') {
        becomeInactive(); // un autre onglet a pris la main
      }
    };

    // Au démarrage : je demande si un onglet est déjà actif.
    bc.postMessage({ type: 'ping', from: tabId.current });
    const t = setTimeout(() => { if (!decided) becomeActive(); }, 250);
    return () => { clearTimeout(t); bc.close(); bcRef.current = null; };
  }, []);

  const useHere = useCallback(() => {
    activeRef.current = true;
    setBlocked(false);
    try { bcRef.current?.postMessage({ type: 'takeover', from: tabId.current }); } catch { /* */ }
  }, []);

  if (blocked) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-[#0a0a0c] text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-red-600/15 border border-red-400/30 grid place-items-center text-3xl">💬</div>
        <div>
          <h1 className="text-white text-[18px] font-semibold mb-1">Talk2Me est ouvert ailleurs</h1>
          <p className="text-white/55 text-[13.5px] leading-relaxed max-w-xs">
            Talk2Me est déjà ouvert dans une autre fenêtre de ce navigateur. Pour éviter les
            doublons (sonneries, notifications), une seule fenêtre reste active.
          </p>
        </div>
        <button
          onClick={useHere}
          className="px-6 h-11 rounded-full bg-red-600 text-white text-[14px] font-semibold active:scale-95"
        >
          Utiliser ici
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
