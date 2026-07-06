'use client';

/**
 * Talk2Me — <GoLiveWatcher> (Pascal 2026-07-04).
 *
 * Monté dans le layout root (à côté de <CallsRoot>). Écoute le canal user-scoped
 * `/api/me/events` (le MÊME que les appels entrants) et affiche un toast in-app
 * « 🔴 {ami} est en direct » quand un AMI passe en direct. Tap → ouvre le live.
 *
 * N'ouvre AUCUN nouveau système : réutilise le bus + le SSE user existants.
 * Complète le web-push (envoyé côté serveur) pour les amis déjà dans l'app.
 *
 * Silencieux si l'utilisateur n'est pas connecté (SSE 401).
 */

import { useEffect, useState } from 'react';

interface GoLiveToast {
  liveId: string;
  name: string;
  url: string;
}

export default function GoLiveWatcher() {
  const [me, setMe] = useState<boolean>(false);
  const [toast, setToast] = useState<GoLiveToast | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled && j?.user?.id) setMe(true);
      } catch {
        /* pas connecté */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    const es = new EventSource('/api/me/events');
    es.addEventListener('live_start', (evt) => {
      try {
        const d = JSON.parse((evt as MessageEvent).data);
        if (!d?.liveId) return;
        const b = d.broadcaster || {};
        const name = (b.display_name && String(b.display_name).trim()) || b.username || 'Un ami';
        setToast({ liveId: d.liveId, name, url: d.url || `/live/${encodeURIComponent(d.liveId)}` });
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('live_end', (evt) => {
      try {
        const d = JSON.parse((evt as MessageEvent).data);
        setToast((prev) => (prev && d?.liveId === prev.liveId ? null : prev));
      } catch {
        /* ignore */
      }
    });
    return () => {
      es.close();
    };
  }, [me]);

  // Auto-dismiss après 8s.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const t = toast;
        setToast(null);
        if (t) window.location.assign(t.url);
      }}
      className="fixed left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 rounded-full bg-black/85 backdrop-blur border border-white/15 pl-3 pr-4 py-2 text-white shadow-2xl active:scale-95"
      style={{ top: 'calc(env(safe-area-inset-top,0px) + 12px)' }}
    >
      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
      <span className="text-[13px] font-semibold">{toast.name} est en direct</span>
      <span className="text-[12px] text-white/60">Rejoindre</span>
    </button>
  );
}
