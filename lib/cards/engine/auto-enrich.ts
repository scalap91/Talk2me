/**
 * AUTO-ENRICHISSEMENT d'une page-entité (Pascal 2026-07-11, #73 « modèle Young Thug »).
 *
 * Doctrine PAGE-ENTITÉ VIVANTE : un son posté nu au feed n'a pas d'entité → on l'auto-enrichit
 * AUTOMATIQUEMENT (pas un bouton), avec les MÊMES sources ancrées que n'importe quelle entité :
 * API YouTube officielle + Wikipédia (aucune invention — grounding strict). Dédup : une seule page
 * par entité (clé yt:<id>) ; si l'article existe déjà, on ne régénère pas (le 2e devient contributeur).
 *
 * Validé par le juge (émanation-vs-boussole) AVANT codage : respecte l'esprit (aucun écart).
 */
import OpenAI from 'openai';
import { getYouTubeVideoDetails, youtubeFactsBlock } from '@/lib/youtube-video';
import { getWikipediaExtract } from '@/lib/wikipedia-context';
import { getArticle, setArticle, setArticleState } from './article';

/** Faits AUTORITATIFS (gratuits, sans scrape) : YouTube officiel + Wikipédia. */
async function buildFacts(ref: string, title: string): Promise<string> {
  const baseQuery = title
    .replace(/\((?:official|clip|video|audio|lyric)[^)]*\)/gi, '')
    .replace(/official (music )?video/gi, '')
    .trim();
  const ytId = ref.startsWith('yt:') ? ref.slice(3) : null;
  const [yt, wiki] = await Promise.all([
    ytId ? getYouTubeVideoDetails(ytId) : Promise.resolve(null),
    getWikipediaExtract(baseQuery, 'en').catch(() => null),
  ]);
  const parts: string[] = [];
  if (yt) parts.push(`API YOUTUBE (officiel) :\n${youtubeFactsBlock(yt)}`);
  if (wiki) parts.push(`WIKIPÉDIA — ${wiki.url}\n${wiki.extract}`);
  return parts.join('\n\n');
}

/**
 * Génère et enregistre l'article de la page-entité `ref` SI elle n'existe pas encore.
 * best-effort, à lancer en arrière-plan (`void autoEnrichEntity(...)`). Retourne true si écrit.
 */
export async function autoEnrichEntity(ref: string, title: string, lang = 'français'): Promise<boolean> {
  try {
    if (!ref) return false;
    if (getArticle(ref)) return false; // DÉDUP : page déjà enrichie → ne pas régénérer

    const facts = await buildFacts(ref, title);
    if (!facts || facts.length < 40) return false; // pas de source ancrée → on N'INVENTE PAS

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return false;
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 45000,
      maxRetries: 1,
    });
    const sys =
      `Tu écris une courte fiche vivante (page-entité) sur « ${title} », en ${lang}. ` +
      `Appuie-toi UNIQUEMENT sur les FAITS AUTORITATIFS ci-dessous. N'INVENTE RIEN : si une info n'y est pas, ` +
      `ne la mets pas. Pas de symboles markdown (ni **, ni #, ni *). Sous-titres courts sur leur propre ligne ` +
      `quand pertinent. 120 à 220 mots.\n\n===== FAITS AUTORITATIFS =====\n${facts}`;
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `Rédige la fiche de « ${title} », uniquement d'après les faits fournis.` },
      ],
    });
    let body = (res.choices?.[0]?.message?.content || '').trim();
    body = body.replace(/^["«»“”]+|["«»“”]+$/g, '').trim();
    if (body.length < 40) return false;

    setArticle(ref, body, lang);
    try { setArticleState(ref, 'developing'); } catch { /* colonne state best-effort */ }
    return true;
  } catch {
    return false; // jamais bloquer la création de card
  }
}

/**
 * Si `attachedAudio` porte un son YouTube → lance l'auto-enrichissement de sa page-entité en
 * arrière-plan (fire-and-forget, ne bloque jamais). À appeler après la création d'une card.
 * (Extrait de la route create — juge de propreté : « 1 fonction dédiée, pas de patch éparpillé ».)
 */
export function autoEnrichIfSound(attachedAudio: unknown, fallbackTitle?: string): void {
  try {
    // L'objet son/vidéo attaché porte l'id YouTube sous `video_id` (activity-types, db-core,
    // chat-types) — PAS `youtube_video_id`. On lit donc `video_id` D'ABORD, puis les alias, et on
    // extrait au besoin l'id d'une URL d'embed / watch. (Avant : on ne lisait que `youtube_video_id`
    // → l'enrichi ne se déclenchait JAMAIS. Pascal 2026-07-11 : « enrichir la vidéo au feed ».)
    const a = attachedAudio as {
      video_id?: string; youtube_video_id?: string; title?: string;
      media?: { video_id?: string; youtube_video_id?: string };
      embed?: { src?: string }; external_url?: string; url?: string;
    } | undefined;
    const fromUrl = (u?: string): string | undefined => {
      if (!u) return undefined;
      const m = u.match(/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,20})/);
      return m ? m[1] : undefined;
    };
    const ytId =
      a && (a.video_id || a.youtube_video_id || a.media?.video_id || a.media?.youtube_video_id
        || fromUrl(a.embed?.src) || fromUrl(a.external_url) || fromUrl(a.url));
    if (ytId && /^[A-Za-z0-9_-]{6,20}$/.test(ytId)) {
      const title = (a?.title || fallbackTitle || 'Ce son').slice(0, 140);
      void autoEnrichEntity(`yt:${ytId}`, title);
    }
  } catch { /* best-effort : ne bloque jamais la création */ }
}
