/**
 * Talk2Me — GARDE D'ACCÈS PAR DOMAINE (Pascal 2026-07-05).
 *
 * Le middleware tourne en Edge (pas d'accès DB) → il ne peut vérifier que la
 * présence du cookie. Le contrôle FIN par domaine se fait ici, en Node, dans un
 * server component (layout d'une route protégée) qui appelle `requireDomain`.
 *
 * S'appuie sur le système EXISTANT `lib/permissions.ts` (table user_permissions,
 * super-admin via AI_OPS_ADMIN_*). Aucun nouveau système de rôles.
 *
 * Usage (ex. app/labo/layout.tsx) :
 *   export default async function Layout({ children }) {
 *     await requireDomain('labo');
 *     return <>{children}</>;
 *   }
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';

/**
 * Exige un DOMAINE pour accéder.
 *  - domain = null      → SUPER-ADMIN uniquement (pages système/dev).
 *  - domain = 'labo'|…  → il faut ce domaine (ou être super-admin).
 * Non connecté → /signin. Connecté sans le domaine → /home (même avec l'URL directe).
 * Retourne l'utilisateur si autorisé (jamais null : sinon on a déjà redirigé).
 */
export async function requireDomain(domain: string | null) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const ok =
    domain === null
      ? isAiOpsAdmin(user.id, user.email)
      : hasPermission(user.id, user.email, domain);
  if (!ok) redirect('/home');
  return user;
}
