/**
 * Helpers avatar Talk2Me (Phase 3 : photo profil upload).
 *
 * - `avatarUrl()` : retourne l'URL d'avatar si disponible, sinon null.
 *   Les composants peuvent alors fallback sur initiale + gradient.
 * - `initialsOf()` : génère 1-2 initiales depuis display_name OU username.
 * - `gradientFromSeed()` : gradient déterministe stable depuis user.id.
 *
 * Doctrine : pas d'avatar par défaut "stock" (gravatar etc.). On rend
 * UNIQUEMENT la photo uploadée par l'user, sinon fallback initiale.
 */

export interface AvatarUserMinimal {
  id?: string;
  avatar_url?: string | null;
  display_name?: string | null;
  username?: string | null;
  talk2me_id?: string | null;
}

/** Retourne l'URL avatar ou null si fallback initiale nécessaire. */
export function avatarUrl(user: AvatarUserMinimal | null | undefined): string | null {
  if (!user) return null;
  const u = (user.avatar_url || '').trim();
  return u.length > 0 ? u : null;
}

/** 1-2 lettres pour le fallback. */
export function initialsOf(
  user: AvatarUserMinimal | null | undefined,
  fallback = '?'
): string {
  if (!user) return fallback;
  const src = (user.display_name && user.display_name.trim()) || user.username || fallback;
  const parts = src.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || fallback;
}

/** Gradient HSL stable depuis seed (user.id en priorité, username sinon). */
export function gradientFromSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const hue = Math.abs(h) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55% / 0.85), hsl(${(hue + 40) % 360} 70% 50% / 0.85))`;
}

export function seedOf(user: AvatarUserMinimal | null | undefined, fallback = 'user'): string {
  if (!user) return fallback;
  return user.id || user.username || user.talk2me_id || fallback;
}
