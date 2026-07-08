/**
 * Talk2Me — CONTEXTE WIKIPÉDIA pour la vérification des faits (M2, Pascal 2026-07-08).
 * Source GRATUITE, sans clé, sans carte, sans scrape (API officielle Wikimedia). Pour nos
 * pages-entités encyclopédiques (classements, certifications, producteurs, dates…) l'article
 * Wikipédia du sujet a EXACTEMENT ces faits — meilleur qu'une recherche web générique.
 * On récupère l'extrait en texte brut → donné à Léa comme preuve autoritative.
 */
import OpenAI from 'openai';

const UA = 'Talk2Me/1.0 (https://talk2me.fr; contact@talk2me.fr)';

/**
 * Déduit le SUJET encyclopédique réel d'un article (pour chercher Wikipédia) — le titre de
 * la card peut être trompeur (« Litchis au marché » alors que l'article parle de Tamatave).
 * Renvoie une requête concise ; échec/pas de clé → le fallback fourni.
 */
export async function wikiQueryFromArticle(body: string, fallback: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const text = (body || '').trim();
  if (!apiKey || text.length < 60) return fallback;
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 20000,
      maxRetries: 0,
    });
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0,
      max_tokens: 30,
      messages: [
        {
          role: 'system',
          content:
            "Donne UNIQUEMENT le sujet principal de cet article sous forme d'une requête Wikipédia concise (2 à 5 mots, avec le nom propre principal). Aucune phrase, aucune ponctuation superflue.",
        },
        { role: 'user', content: text.slice(0, 1500) },
      ],
    });
    const q = (res.choices?.[0]?.message?.content || '').trim().replace(/^["«»]+|["«».]+$/g, '');
    return q.slice(0, 80) || fallback;
  } catch {
    return fallback;
  }
}

export interface WikipediaContext {
  title: string;
  url: string;
  extract: string;
}

export async function getWikipediaExtract(query: string, lang = 'en'): Promise<WikipediaContext | null> {
  const q = (query || '').trim();
  if (!q) return null;
  try {
    // 1) Meilleur titre d'article pour la requête.
    const sres = await fetch(
      `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=1`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) },
    );
    if (!sres.ok) return null;
    const sjson = (await sres.json()) as { pages?: Array<{ title?: string }> };
    const title = sjson.pages?.[0]?.title;
    if (!title) return null;

    // 2) Extrait en texte brut de l'article (intro + sections).
    const eres = await fetch(
      `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1` +
        `&redirects=1&format=json&titles=${encodeURIComponent(title)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) },
    );
    if (!eres.ok) return null;
    const ejson = (await eres.json()) as { query?: { pages?: Record<string, { extract?: string }> } };
    const pages = ejson.query?.pages || {};
    const firstKey = Object.keys(pages)[0];
    const extract = (firstKey ? pages[firstKey]?.extract : '') || '';
    if (!extract.trim()) return null;

    return {
      title,
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
      extract: extract.slice(0, 4500),
    };
  } catch {
    return null;
  }
}
