// Gating par domaine (Pascal 2026-07-05) — domaine 'labo' (ou super-admin).
import { requireDomain } from '@/lib/access-guard';

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireDomain('labo');
  return <>{children}</>;
}
