/**
 * Talk2Me — normalisation des numéros (Pascal 2026-06-24, inscription téléphone Mada-first).
 * Sortie : E.164 (+261…) ou null si invalide. Madagascar : 03X XX XXX XX (10 chiffres
 * avec le 0) → +261 3X…. Accepte aussi un numéro international déjà en +.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let s = raw.replace(/[\s().\-]/g, '');
  if (s.startsWith('+')) {
    return /^\+\d{8,15}$/.test(s) ? s : null;
  }
  s = s.replace(/\D/g, '');
  if (!s) return null;
  // Madagascar local : 0XXXXXXXXX (10 chiffres) → on retire le 0, on préfixe +261.
  if (s.length === 10 && s.startsWith('0')) return '+261' + s.slice(1);
  // Sans le 0 (9 chiffres, commence par 3) : 3XXXXXXXX → +261…
  if (s.length === 9 && s.startsWith('3')) return '+261' + s;
  // Déjà 261…
  if (s.startsWith('261') && s.length >= 11) return '+' + s;
  // International générique
  if (s.length >= 8 && s.length <= 15) return '+' + s;
  return null;
}

/** Masque pour affichage : +261 34 ** *** 12 (on ne montre que la fin). */
export function maskPhone(phone: string): string {
  if (!phone) return '';
  const tail = phone.slice(-2);
  const head = phone.slice(0, Math.max(0, phone.length - 5));
  return `${head}***${tail}`;
}
