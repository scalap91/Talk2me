/**
 * Boussole technique — DEV ONLY (Pascal 2026-06-15).
 * Outil interne (code/schéma/AI-Ops). Ne doit PAS exister sur la beta :
 * sur talk2me.fr (pas de TALKTOME_DB_PATH dev), on renvoie 404. Visible
 * uniquement sur dev.talk2me.fr.
 */
import { notFound } from 'next/navigation';

export default function SchemaLayout({ children }: { children: React.ReactNode }) {
  const isDev = (process.env.TALKTOME_DB_PATH || '').includes('talktome-dev');
  if (!isDev) notFound();
  return <>{children}</>;
}
