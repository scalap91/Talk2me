/**
 * Talk2Me — GÉNÉRATION D'ENTITÉS LIÉES (page-entité vivante, M7, Pascal 2026-07-08).
 * Léa lit un article → repère les ENTITÉS notables MENTIONNÉES (autres sons, artistes,
 * albums) qui mériteraient leur propre page → cherche le VRAI clip (API YouTube, pas
 * d'invention). Ex. article Young Thug → « Tokyo Vanity – That's My Best Friend ».
 * Le graphe se construit tout seul. Grounding : clip TROUVÉ (jamais fabriqué), humain valide.
 */
import OpenAI from 'openai';
import { searchYouTube } from '@/lib/youtube-search';

export interface LinkedCandidate {
  name: string;
  type: string; // song | artist | album | video | other
  found: { videoId: string; title: string; channel: string; thumbnail: string } | null;
}

export async function suggestLinkedEntities(body: string, title: string): Promise<LinkedCandidate[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const text = (body || '').trim();
  if (!apiKey || !text) return [];

  let list: { name: string; type: string; query: string }[] = [];
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 60000,
      maxRetries: 1,
    });
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            "Repère dans cet article les ENTITÉS NOTABLES RÉELLEMENT MENTIONNÉES qui mériteraient leur propre page (autres chansons, artistes, albums, œuvres, lieux) — JAMAIS le sujet principal lui-même, et RIEN qui ne soit pas explicitement dans le texte. Pour chacune : un nom clair + une requête de recherche YouTube précise. Maximum 5. JSON {\"entities\":[{\"name\":\"...\",\"type\":\"song|artist|album|video|other\",\"query\":\"...\"}]}.",
        },
        { role: 'user', content: `SUJET PRINCIPAL (À EXCLURE) : ${title}\n\nARTICLE :\n${text.slice(0, 4000)}` },
      ],
    });
    const j = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    list = Array.isArray(j.entities) ? j.entities.slice(0, 5) : [];
  } catch {
    return [];
  }

  // Recherche du VRAI clip pour chaque entité (séquentiel). Rien trouvé → found:null (pas de faux).
  const out: LinkedCandidate[] = [];
  for (const e of list) {
    const name = String(e?.name || '').trim();
    const type = String(e?.type || 'other');
    if (!name) continue;
    let found: LinkedCandidate['found'] = null;
    if (['song', 'video', 'artist', 'album'].includes(type)) {
      try {
        const r = await searchYouTube(String(e?.query || name).slice(0, 180));
        if ('video' in r && r.video?.video_id) {
          found = {
            videoId: r.video.video_id,
            title: r.video.title,
            channel: r.video.channel,
            thumbnail: r.video.thumbnail,
          };
        }
      } catch {
        /* pas de clip → candidat texte */
      }
    }
    out.push({ name, type, found });
  }
  return out;
}
