/**
 * Talk2Me — TRADUCTION LECTEUR de l'article-entité (page-entité vivante, Pascal 2026-07-08).
 * UN article canonique (langue source) → traduit à la volée dans la langue du LECTEUR,
 * puis MIS EN CACHE par (entité, langue, version). Le mec à Singapour lit en anglais/
 * chinois sans que Pascal produise N versions. Cache invalidé quand l'article change (version).
 */
import OpenAI from 'openai';
import { getDb } from '@/lib/db';

// Code ISO court → nom lisible (pour le prompt). Le code sert de clé de cache stable.
const LANGS: Record<string, string> = {
  fr: 'français', en: 'anglais', zh: 'chinois', es: 'espagnol', mg: 'malgache',
  pt: 'portugais', ar: 'arabe', de: 'allemand', it: 'italien', ru: 'russe',
  hi: 'hindi', ja: 'japonais', ko: 'coréen', id: 'indonésien', sw: 'swahili',
  ta: 'tamoul', th: 'thaï', vi: 'vietnamien', nl: 'néerlandais', tr: 'turc',
};
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(LANGS).map(([code, name]) => [name, code]),
);

/** Normalise 'en-US' / 'anglais' / 'EN' → code court connu ('en'), sinon best-effort. */
export function normalizeLang(input: string): string {
  const s = (input || '').trim().toLowerCase();
  if (!s) return 'fr';
  const base = s.split(/[-_]/)[0];
  if (LANGS[base]) return base;
  if (NAME_TO_CODE[s]) return NAME_TO_CODE[s];
  return base || 'fr';
}
function readable(code: string): string {
  return LANGS[code] || code;
}

let ready = false;
function ensure(): void {
  if (ready) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS entity_translations (
      entity_ref TEXT NOT NULL,
      lang       TEXT NOT NULL,
      version    INTEGER NOT NULL,
      body       TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (entity_ref, lang)
    );
  `);
  ready = true;
}

/**
 * Rend l'article dans la langue du lecteur. Même langue que la source → renvoie tel quel.
 * Cache : traduit une seule fois par (entité, langue, version) ; re-traduit si la version change.
 */
export async function translateArticle(input: {
  entityRef: string;
  body: string;
  version: number;
  sourceLang: string;
  targetLang: string;
}): Promise<string> {
  const body = (input.body || '').trim();
  const target = normalizeLang(input.targetLang);
  const source = normalizeLang(input.sourceLang);
  if (!body || target === source) return body;

  ensure();
  const db = getDb();
  const hit = db
    .prepare('SELECT body, version FROM entity_translations WHERE entity_ref = ? AND lang = ?')
    .get(input.entityRef, target) as { body?: string; version?: number } | undefined;
  if (hit?.body && hit.version === input.version) return hit.body;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return body; // pas de moteur → langue source (dégradation propre)

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 90000,
      maxRetries: 1,
    });
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.1,
      max_tokens: 3000,
      messages: [
        {
          role: 'system',
          content: `Traduis fidèlement cet article en ${readable(target)}. Ne change NI les faits NI la structure (garde les sous-titres, chacun sur sa ligne). N'ajoute rien, ne retire rien. Aucun symbole markdown. Réponds uniquement par la traduction.`,
        },
        { role: 'user', content: body },
      ],
    });
    const out = (res.choices?.[0]?.message?.content || '').trim();
    if (out) {
      db.prepare(
        `INSERT INTO entity_translations (entity_ref, lang, version, body, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(entity_ref, lang) DO UPDATE SET
           version = excluded.version, body = excluded.body, updated_at = excluded.updated_at`,
      ).run(input.entityRef, target, input.version, out, Date.now());
    }
    return out || body;
  } catch {
    return body;
  }
}
