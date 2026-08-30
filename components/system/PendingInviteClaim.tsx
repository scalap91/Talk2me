'use client';

/**
 * PendingInviteClaim — après une invitation par fiche (/i/<key>), l'invité s'inscrit puis atterrit
 * dans l'app. Ce composant (monté globalement, invisible) relit la fiche mémorisée (localStorage
 * t2m_pending_fiche) et, si l'utilisateur est connecté, la met en FAVORI + ENREGISTRÉES via
 * /api/invite/claim, puis efface le marqueur. Best-effort, une seule fois. Pascal 2026-08-30.
 */
import { useEffect } from 'react';

export default function PendingInviteClaim() {
  useEffect(() => {
    let key: string | null = null;
    try { key = localStorage.getItem('t2m_pending_fiche'); } catch { /* */ }
    if (!key) return;
    (async () => {
      try {
        const me = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!me.ok) return;
        const j = await me.json();
        if (!j?.user) return; // pas encore connecté → on retentera à la prochaine ouverture
        await fetch('/api/invite/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
        try { localStorage.removeItem('t2m_pending_fiche'); } catch { /* */ }
      } catch { /* best-effort */ }
    })();
  }, []);
  return null;
}
