/**
 * Helpers auth Talk2Me (Phase 1 multi-user) — Node runtime uniquement.
 *
 * Importe db.ts (better-sqlite3 / scrypt). NE PAS importer depuis le
 * middleware Edge. Le middleware utilise lib/auth-constants.ts.
 */
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, type DbUser } from '@/lib/db';

export {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  sessionCookieAttrs,
} from '@/lib/auth-constants';

import { SESSION_COOKIE } from '@/lib/auth-constants';

/** Récupère l'user courant depuis le cookie session côté Server Component / Route Handler. */
export async function getCurrentUser(): Promise<DbUser | null> {
  try {
    const c = await cookies();
    const token = c.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return getSessionUser(token);
  } catch {
    return null;
  }
}

/** Variante pour les API Routes / middleware Node qui ont un NextRequest. */
export function getCurrentUserFromRequest(req: NextRequest): DbUser | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(token);
}
