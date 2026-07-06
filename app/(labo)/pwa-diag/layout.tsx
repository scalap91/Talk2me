// Page de diagnostic interne — réservée au SUPER-ADMIN (Pascal 2026-07-05).
// Preuve du socle « accès par domaine » : un user normal qui ouvre /pwa-diag
// (même avec l'URL) est redirigé vers le feed.
import { requireDomain } from '@/lib/access-guard';

export default async function PwaDiagLayout({ children }: { children: React.ReactNode }) {
  await requireDomain(null); // null = super-admin uniquement
  return <>{children}</>;
}
