/**
 * reader/search.ts — projection RECHERCHE du lecteur unique (contexte `search`).
 *
 * Chantier A (unification .card). But : l'index FTS ne re-parse plus la carte
 * dans son coin — il consomme une projection CALCULÉE depuis le `.card`
 * (source de vérité). On produit le texte cherchable en récoltant les champs
 * PORTEURS DE SENS d'un `.card` (spec:1 legacy converti OU spec:2 natif :
 * project/mission/resource inclus), pour que les NOUVEAUX kinds deviennent
 * trouvables sans toucher au reste.
 *
 * Doctrine :
 * - ADDITIF : le texte produit AUGMENTE le blob FTS existant (jamais ne le
 *   remplace) → strictement plus trouvable, zéro régression par construction.
 * - AIR-GAP argent/PII [[feedback_talk2me_pii_air_gap]] : on n'indexe JAMAIS
 *   les ids opaques (owner/payee/contributor/ref), les montants, ni les URLs.
 *   La recherche est du TEXTE HUMAIN, pas un annuaire d'identifiants.
 * - DÉFENSIF : ne throw jamais (best-effort d'indexation), tolère toute forme.
 */

// Clés dont la VALEUR texte est du sens humain cherchable.
const TEXT_KEYS = new Set([
  'title', 'subtitle', 'summary', 'caption', 'text', 'description', 'name',
  'label', 'logline', 'synopsis', 'idea', 'pitch', 'role', 'need', 'note',
  'genre', 'artist', 'channel', 'author', 'brand', 'model', 'category',
  'city', 'region', 'country', 'address', 'place', 'venue', 'kind', 'facet',
  'domain', 'status', 'headline', 'tagline', 'question', 'answer',
]);

// Clés/valeurs à NE JAMAIS indexer : ids opaques, argent, technique.
const SKIP_KEYS = new Set([
  'id', 'ref', 'external_ref', 'owner', 'owner_id', 'payee', 'payee_id',
  'contributor', 'contributor_id', 'user_id', 'author_id', 'uid',
  'amount', 'amount_minor', 'price', 'budget', 'currency', 'total',
  'url', 'href', 'src', 'embed', 'thumbnail', 'thumbnail_url', 'media_url',
  'video_id', 'hash', 'sig', 'token', 'phone', 'email', 'lat', 'lng',
  'created_at', 'updated_at', 'spec', 'format', 'version', 'schema',
]);

// Une valeur ressemble-t-elle à un id/url/technique (à ne pas indexer) ?
function looksTechnical(s: string): boolean {
  if (/^https?:\/\//i.test(s)) return true;          // URL
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return true; // UUID
  if (/^[a-z0-9_]{16,}$/i.test(s) && !/\s/.test(s)) return true; // token/id long
  return false;
}

function pushText(out: string[], raw: unknown): void {
  if (typeof raw !== 'string') return;
  const s = raw.trim();
  if (!s || s.length > 400) return;         // borne raisonnable
  if (looksTechnical(s)) return;
  out.push(s);
}

function walk(node: unknown, out: string[], depth: number): void {
  if (depth > 6 || node == null) return;
  if (Array.isArray(node)) {
    for (const el of node) {
      if (typeof el === 'string') pushText(out, el); // ex: tags[]
      else walk(el, out, depth + 1);
    }
    return;
  }
  if (typeof node !== 'object') return;
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    const k = key.toLowerCase();
    if (SKIP_KEYS.has(k)) continue;
    if (k === 'tags' || k === 'hashtags' || k === 'keywords') {
      if (Array.isArray(val)) for (const t of val) pushText(out, t);
      else pushText(out, val);
      continue;
    }
    if (typeof val === 'string') {
      if (TEXT_KEYS.has(k)) pushText(out, val);
      // sinon on ignore les strings de clés inconnues (bruit / ids probables)
    } else {
      walk(val, out, depth + 1);
    }
  }
}

/**
 * deriveSearchText — texte cherchable HUMAIN dérivé d'un `.card` (objet parsé).
 * Robuste : accepte spec:1 comme spec:2, ne throw jamais, dédoublonne.
 * Renvoie '' si rien d'exploitable (l'appelant n'ajoute alors rien).
 */
export function deriveSearchText(card: unknown): string {
  try {
    const out: string[] = [];
    walk(card, out, 0);
    if (!out.length) return '';
    // Dédup insensible à la casse en gardant l'ordre.
    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const s of out) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(s);
    }
    return uniq.join(' ').slice(0, 2000); // cap dur pour l'index FTS
  } catch {
    return '';
  }
}
