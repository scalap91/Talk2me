'use client';

/**
 * E2EE Phase 0 — publie la clé publique de l'user au démarrage (si connecté).
 * Génère la paire ECDH sur l'appareil (clé privée non-extractible en IndexedDB) et monte
 * la clé publique au serveur. Idempotent. Ne fait rien pour un visiteur anonyme.
 */
import { useEffect } from 'react';
import { registerMyKey } from '@/lib/e2ee-client';

export default function E2eeKeyRegister() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!/(^|;\s*)talk2me_session=/.test(document.cookie)) return; // connecté seulement
    registerMyKey().catch(() => {});
  }, []);
  return null;
}
