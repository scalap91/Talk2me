import { redirect } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Page de transition magic link.
 *
 * Next.js 16 interdit la mutation de cookies depuis une Page (Server Component).
 * On délègue donc au Route Handler /api/auth/magic-link/verify/[token] qui :
 *  - consume le token + crée/retrouve le user + set le cookie session
 *  - redirige vers / (ou /signin?error=... si invalide)
 *
 * Cette page existe uniquement pour offrir une URL `/auth/verify/...` propre
 * (UX magic link standard) et reste navigable côté humain.
 */
export default async function VerifyMagicLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/api/auth/magic-link/verify/${encodeURIComponent(token)}`);
}
