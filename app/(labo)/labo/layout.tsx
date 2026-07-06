// Labo / R&D — réservé au domaine « labo » (super-admin OU collaborateur labo).
// Pascal 2026-07-05 : rassemble les features parquées / en dev pour les tester
// SANS qu'elles polluent l'app du peuple. Gaté côté serveur (même l'URL directe).
import { requireDomain } from '@/lib/access-guard';

export default async function LaboLayout({ children }: { children: React.ReactNode }) {
  await requireDomain('labo');
  return <>{children}</>;
}
