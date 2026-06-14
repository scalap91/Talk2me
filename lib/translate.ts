'use server-only';

/**
 * Talk2Me — Module de TRADUCTION réutilisable (Pascal 2026-06-09).
 * Traduit le contenu tiers (API CJ : titres/descriptions EN/ZH, etc.) vers une
 * langue cible (FR par défaut ; ES, EN, etc. prêts → « on sait jamais, si on
 * vend en Espagne le module est déjà là »). DeepSeek + cache DB persistant
 * (on ne traduit jamais deux fois le même texte). Si pas de clé → renvoie le
 * texte original (dégradation propre, jamais de blocage).
 *
 * Générique : translate(text, lang) / translateMany(texts, lang).
 */

import OpenAI from 'openai';
import { createHash } from 'crypto';
import { getDb } from '@/lib/db';

const LANG_NAMES: Record<string, string> = {
  fr: 'français', es: 'espagnol', en: 'anglais', de: 'allemand', it: 'italien',
  pt: 'portugais', nl: 'néerlandais', ar: 'arabe', zh: 'chinois', ru: 'russe',
};

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`CREATE TABLE IF NOT EXISTS translations (k TEXT PRIMARY KEY, v TEXT NOT NULL, created_at INTEGER NOT NULL);`);
  ensured = true;
}
const keyOf = (text: string, lang: string) => `${lang}:${createHash('sha1').update(text).digest('hex')}`;

function cacheGet(text: string, lang: string): string | null {
  ensure();
  const row = getDb().prepare('SELECT v FROM translations WHERE k = ?').get(keyOf(text, lang)) as { v: string } | undefined;
  return row?.v ?? null;
}
function cacheSet(text: string, lang: string, v: string) {
  ensure();
  getDb().prepare('INSERT OR REPLACE INTO translations (k, v, created_at) VALUES (?, ?, ?)').run(keyOf(text, lang), v, Date.now());
}

function client(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 30000, maxRetries: 1 });
}

/** Traduit une liste de textes vers `lang`. Conserve l'ordre. Cache + 1 appel LLM pour les manquants. */
export async function translateMany(texts: string[], lang = 'fr'): Promise<string[]> {
  const out = [...texts];
  if (!texts.length) return out;
  const langName = LANG_NAMES[lang] || lang;

  // 1) cache
  const missIdx: number[] = [];
  texts.forEach((t, i) => {
    if (!t || !t.trim()) return;
    const hit = cacheGet(t, lang);
    if (hit != null) out[i] = hit;
    else missIdx.push(i);
  });
  if (missIdx.length === 0) return out;

  // 2) LLM pour les manquants (1 seul appel, JSON in/out)
  const openai = client();
  if (!openai) return out; // pas de clé → original
  const payload = missIdx.map((i) => texts[i]);
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            `Tu es un traducteur professionnel e-commerce. Traduis fidèlement vers le ${langName}, ` +
            `de façon naturelle et vendeuse (pas mot-à-mot). Garde les noms de marque tels quels. ` +
            `Réponds UNIQUEMENT par un tableau JSON de chaînes, MÊME ORDRE et MÊME LONGUEUR que l'entrée. Aucun autre texte.`,
        },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });
    const raw = completion.choices[0]?.message?.content || '';
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) {
      const arr = JSON.parse(m[0]) as string[];
      missIdx.forEach((origIdx, k) => {
        const tr = typeof arr[k] === 'string' ? arr[k] : '';
        if (tr) { out[origIdx] = tr; cacheSet(texts[origIdx], lang, tr); }
      });
    }
  } catch {
    // garde l'original en cas d'échec
  }
  return out;
}

/** Traduit un texte unique vers `lang`. */
export async function translate(text: string, lang = 'fr'): Promise<string> {
  if (!text || !text.trim() || lang === 'auto') return text;
  const [r] = await translateMany([text], lang);
  return r || text;
}
