/**
 * Talk2Me — géoloc PAYS d'une IP, ANONYME (Pascal 2026-06-08).
 * On dérive UNIQUEMENT le pays (coarse) pour le dashboard "combien & où".
 * L'IP n'est JAMAIS stockée (doctrine PII air-gap). Best-effort : si échec,
 * on retourne null et on ne bloque rien.
 *
 * Source : ip-api.com (gratuit, sans clé, ~45 req/min). Champ `country` (nom FR
 * via lang=fr). Timeout court pour ne pas ralentir l'inscription.
 */

/** Extrait l'IP cliente depuis les headers proxy (nginx). */
export function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') || null;
}

const LOCAL = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc00:|fe80:)/;

export async function geolocateCountry(ip: string | null): Promise<string | null> {
  if (!ip || LOCAL.test(ip)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country&lang=fr`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const j = (await res.json()) as { status?: string; country?: string };
    if (j.status === 'success' && typeof j.country === 'string' && j.country.trim()) {
      return j.country.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/** Pays à partir d'un point GPS (reverse-geocode Nominatim/OSM, sans clé). */
export async function reverseCountry(lat: number, lng: number): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=3&accept-language=fr&lat=${lat}&lon=${lng}`,
      { signal: ctrl.signal, headers: { 'User-Agent': 'Talk2Me-Drive/1.0' } }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const j = (await res.json()) as { address?: { country?: string } };
    return j.address?.country?.trim() || null;
  } catch {
    return null;
  }
}
