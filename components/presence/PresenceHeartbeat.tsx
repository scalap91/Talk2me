'use client';

import { useEffect } from 'react';

/**
 * PresenceHeartbeat — Phase 3.
 * Ping /api/presence/heartbeat toutes les 30s tant que la page est ouverte.
 * Silencieux si user pas authentifié (401 ignoré).
 */
export default function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;
    async function ping() {
      if (cancelled) return;
      try {
        await fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'online' }),
          cache: 'no-store',
        });
      } catch {
        // offline → ignore
      }
    }
    // Premier ping immédiat
    ping();
    const id = setInterval(ping, 30_000);

    // Mark offline on unload (best-effort)
    const onUnload = () => {
      try {
        navigator.sendBeacon?.(
          '/api/presence/heartbeat',
          new Blob([JSON.stringify({ status: 'offline' })], {
            type: 'application/json',
          })
        );
      } catch {
        // ignore
      }
    };
    window.addEventListener('pagehide', onUnload);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('pagehide', onUnload);
    };
  }, []);

  return null;
}
