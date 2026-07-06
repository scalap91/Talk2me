'use client';

/**
 * Talk2Me — Créateur d'avatar IN-APP (Pascal 2026-06-13).
 * Embarque le créateur Ready Player Me (iframe, WebView-friendly) : l'utilisateur
 * fabrique sa Léa RÉALISTE dans l'app → on capte le GLB exporté (frameApi /
 * postMessage) → on l'envoie à /api/avatar-rpm (download + USDZ) → on file en AR.
 * Pas besoin de sortir de l'app. (Sous-domaine démo le temps d'avoir le nôtre.)
 */

import { useEffect, useState } from 'react';

const SUBDOMAIN = 'demo'; // remplacer par notre sous-domaine RPM quand on l'aura

export default function AvatarCreatorPage() {
  const [status, setStatus] = useState('Crée ta Léa réaliste…');

  useEffect(() => {
    const iframe = document.getElementById('rpm-frame') as HTMLIFrameElement | null;
    const subscribe = () => {
      iframe?.contentWindow?.postMessage(
        JSON.stringify({ target: 'readyplayerme', type: 'subscribe', eventName: 'v1.**' }),
        '*',
      );
    };
    iframe?.addEventListener('load', subscribe);

    const onMsg = async (e: MessageEvent) => {
      let json: any;
      try { json = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (!json || json.source !== 'readyplayerme') return;
      if (json.eventName === 'v1.frame.ready') subscribe();
      if (json.eventName === 'v1.avatar.exported') {
        const glbUrl = json.data?.url as string;
        if (!glbUrl) return;
        setStatus('Avatar reçu — préparation pour l’AR…');
        try {
          const r = await fetch('/api/avatar-rpm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ glb_url: glbUrl }),
          });
          const d = await r.json();
          if (d.ok && d.glb) {
            const q = new URLSearchParams({ glb: d.glb, ...(d.usdz ? { usdz: d.usdz } : {}) });
            window.location.assign('/ar?' + q.toString());
          } else {
            setStatus('Erreur préparation: ' + (d.error || 'inconnue') + ' — on garde le GLB RPM direct.');
            window.location.assign('/ar?' + new URLSearchParams({ glb: glbUrl }).toString());
          }
        } catch {
          window.location.assign('/ar?' + new URLSearchParams({ glb: glbUrl }).toString());
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => { window.removeEventListener('message', onMsg); iframe?.removeEventListener('load', subscribe); };
  }, []);

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#0e0e14' }}>
      <iframe
        id="rpm-frame"
        title="Créateur d'avatar"
        allow="camera *; microphone *; clipboard-write"
        src={`https://${SUBDOMAIN}.readyplayer.me/avatar?frameApi&bodyType=fullbody&clearCache`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
      <div style={{ position: 'fixed', top: 10, left: 10, right: 10, padding: '8px 12px', background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 10, fontFamily: 'system-ui', fontSize: 13, zIndex: 5, pointerEvents: 'none' }}>
        <b>Créateur Léa 3D</b> — {status}
      </div>
    </main>
  );
}
