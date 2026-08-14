'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Talk2Me — RACINE `/` (Pascal 2026-08-13). L'appli s'ouvre sur le FEED (règle d'or « feed = entrée »).
 * La redirection `/` → `/home` est faite dans le MIDDLEWARE (instantanée, avant tout rendu). Cette page
 * n'est donc jamais rendue en pratique — mais elle reste un CLIENT component (`'use client'`) pour
 * garantir un manifest de route valide et éviter l'InvariantError Next 16 sur une racine server-only.
 * Le chat IA personnel vit désormais sur `/ia`.
 */
export default function RootRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/home');
  }, [router]);
  return null;
}
