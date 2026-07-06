// Gating par domaine (Pascal 2026-07-05) — SUPER-ADMIN uniquement.
import { requireDomain } from '@/lib/access-guard';

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireDomain(null);
  return <>{children}</>;
}
