/**
 * Constantes auth partagées entre Edge middleware et Node API routes.
 * Aucune dépendance Node (crypto/fs/path) ici : safe pour Edge runtime.
 */
export const SESSION_COOKIE = 'talk2me_session';
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 jours

export function sessionCookieAttrs(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_S}`;
}
