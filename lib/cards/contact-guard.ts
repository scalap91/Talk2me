/**
 * contact-guard — anti-désintermédiation (Pascal 2026-07-21).
 *
 * Un vendeur ne doit pas glisser son NUMÉRO DE TÉLÉPHONE dans un texte de carte (nom de boutique,
 * description, article, légende) pour faire sortir l'acheteur de l'app (perte commission + escrow +
 * protection acheteur). Ici : DÉTECTION + MASQUAGE À L'AFFICHAGE d'un numéro dans du texte libre.
 *
 * Précision > rappel : on masque ce qui RESSEMBLE VRAIMENT à un numéro, JAMAIS un prix / une année /
 * une quantité. Règle : suite de chiffres (séparateurs espace . - / autorisés à l'intérieur) qui,
 * une fois les séparateurs retirés, fait 9–13 chiffres ET commence par 0 (local MG/FR…) ou par
 * +/00 suivi d'un indicatif. Un prix « 10 000 000 Ar » (8 chiffres, ne commence pas par 0) ou une
 * année « 2026 » ne matchent pas. Couche 1 (dissuasion) ; l'OCR image = couche 2 (à venir).
 *
 * NB : ne réécrit JAMAIS un numéro (cf. [[feedback_no_phone_transform]]) — il est MASQUÉ (••),
 * jamais reformaté. Contexte = carte publique, pas le répertoire de l'utilisateur.
 */

// Candidat = +/00 optionnel, puis chiffres avec séparateurs internes (espace . - /), min ~8 signes.
const CANDIDATE = /(?:\+|00)?\d(?:[\s.\-/]?\d){7,13}/g;

function looksLikePhone(raw: string): boolean {
  const intl = /^(?:\+|00)/.test(raw.trim());
  const digits = raw.replace(/\D/g, '');
  if (intl) return digits.length >= 8 && digits.length <= 15;      // +261 34 …, 0033 6 …
  // local : doit commencer par 0 (03x MG, 06/07 FR…) et faire 9–11 chiffres.
  return digits.startsWith('0') && digits.length >= 9 && digits.length <= 11;
}

/** true si le texte contient au moins un numéro de téléphone probable. */
export function hasContactLeak(text: string | null | undefined): boolean {
  if (!text) return false;
  CANDIDATE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CANDIDATE.exec(text))) { if (looksLikePhone(m[0])) return true; }
  return false;
}

/** Remplace tout numéro probable par des points, en gardant la ponctuation/longueur visuelle. */
export function maskContactInfo(text: string | null | undefined): string {
  if (!text) return text ?? '';
  return text.replace(CANDIDATE, (seg) =>
    looksLikePhone(seg) ? seg.replace(/\d/g, '•') : seg,
  );
}
