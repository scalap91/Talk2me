/**
 * Boussole technique — DEV ONLY (Pascal 2026-06-15).
 * Outil interne (code/schéma/AI-Ops). Ne doit PAS exister sur la beta :
 * sur talk2me.fr (pas de TALKTOME_DB_PATH dev), on renvoie 404. Visible
 * uniquement sur dev.talk2me.fr.
 */
import { notFound } from 'next/navigation';
import { requireDomain } from '@/lib/access-guard';

export default async function SchemaLayout({ children }: { children: React.ReactNode }) {
  // Gating par domaine (Pascal 2026-07-05) : super-admin uniquement, en plus
  // du 404-sur-prod ci-dessous (garde le reste).
  await requireDomain(null);
  // Détection dev FIABLE : le serveur dev tourne en blue-green (NEXT_DIST_DIR=
  // .next-blue|.next-green) ; la prod utilise le défaut '.next'. L'ancien test
  // sur TALKTOME_DB_PATH échouait (app sous /root/talktome, pas 'talktome-dev')
  // → 404 permanent sur la boussole. (Pascal 2026-06-29)
  const isDev =
    (process.env.NEXT_DIST_DIR || '').startsWith('.next-') ||
    (process.env.TALKTOME_DB_PATH || '').includes('talktome-dev');
  if (!isDev) notFound();
  return <>{children}</>;
}
