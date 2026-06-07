/**
 * Talk2Me #338 — Extraction passive d'habitudes utilisateur.
 *
 * Doctrine [[talk2me-roadmap-6-phases]] Phase 1 (Pascal 2026-06-04) :
 *   "L'IA doit apprendre progressivement : musique préférée ; habitudes
 *    de recherche ; lieux fréquents ; sujets fréquents ; contacts fréquents.
 *    Mets-moi Check + user écoute rap → query enrichie Young Thug Check."
 *
 * Pipeline :
 *   1. Tool results réussis → extraction structurée déterministe
 *      - search_youtube → music_artist (channel) + music_genre (heuristique titre)
 *      - search_place → place_visited (city/address) + food_pref (cuisine/amenity)
 *      - search_recipe → food_pref (mots-clés query)
 *      - get_weather → place_visited (city)
 *      - search_product → topic (query)
 *      - search_web / search_wikipedia → topic (query)
 *   2. Message user → contacts (@mentions) + DeepSeek light extraction
 *      (fail-soft, temperature 0.0, prompt court, timeout 5s)
 *
 * NON BLOQUANT : appelé en fire-and-forget depuis /api/chat. Erreurs loggées
 * mais jamais propagées. Doctrine [[talktome-no-excuses]] : silencieux.
 */

import OpenAI from 'openai';
import { upsertUserHabit, type UserHabitKind } from '@/lib/db';
import { containsPii } from '@/lib/security/pii';

/**
 * Talk2Me PII air-gap Layer 3 (Pascal 2026-06-05) — Doctrine
 * [[talk2me-pii-air-gap]] : "il dois refuser de la transmetre et dois lefacer
 * en memoire". Avant tout upsert habit, on rejette si value contient un
 * pattern PII (talk2me_id, email, IP, IBAN, CC, session token).
 */
function safeUpsertUserHabit(
  userId: string,
  kind: UserHabitKind,
  value: string,
  source?: string,
  metadata?: Record<string, unknown>,
): void {
  if (containsPii(value)) {
    console.warn(
      '[habits/pii-filter] habit refused — PII pattern detected',
      `userId=${userId}`,
      `kind=${kind}`,
      `value="${value.slice(0, 40)}…"`,
    );
    return;
  }
  upsertUserHabit(userId, kind, value, source, metadata);
}

export interface ExtractHabitsToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: any;
}

export interface ExtractHabitsInput {
  userId: string;
  userMessage: string;
  assistantResponse?: string;
  toolCalls?: ExtractHabitsToolCall[];
}

const CONTACT_MENTION_RE = /@([\p{L}][\p{L}0-9_]{1,30})/gu;

// Mots-clés genre musical → heuristique sur titre/channel YouTube
const MUSIC_GENRE_HINTS: Record<string, string> = {
  rap: 'rap',
  trap: 'rap',
  drill: 'rap',
  hiphop: 'rap',
  'hip-hop': 'rap',
  rock: 'rock',
  metal: 'metal',
  pop: 'pop',
  jazz: 'jazz',
  classique: 'classical',
  classical: 'classical',
  electro: 'electronic',
  edm: 'electronic',
  house: 'electronic',
  techno: 'electronic',
  reggae: 'reggae',
  rai: 'rai',
  raï: 'rai',
  rnb: 'rnb',
  soul: 'soul',
  blues: 'blues',
  variete: 'variete',
  variété: 'variete',
};

function detectMusicGenre(title: string, channel: string): string | null {
  const hay = `${title} ${channel}`.toLowerCase();
  for (const [needle, genre] of Object.entries(MUSIC_GENRE_HINTS)) {
    if (hay.includes(needle)) return genre;
  }
  return null;
}

/** Nettoie le nom d'une chaîne YouTube (retire "VEVO", "Official", etc.). */
function cleanChannelToArtist(channel: string): string {
  return channel
    .replace(/\b(VEVO|Official|Music|Records|Channel|TV)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface CuisineMap {
  cuisine: string;
  food: string;
}
// Map amenity OSM → food_pref
const AMENITY_TO_FOOD: Record<string, string> = {
  restaurant: 'restaurant',
  cafe: 'café',
  bar: 'bar',
  pub: 'pub',
  fast_food: 'fast-food',
  bakery: 'boulangerie',
};

/**
 * Extraction déterministe depuis un tool result réussi.
 * Retourne la liste des habits à upserter (kind, value, source, metadata).
 */
function extractFromToolResult(
  call: ExtractHabitsToolCall,
): Array<{ kind: UserHabitKind; value: string; meta?: Record<string, unknown> }> {
  const out: Array<{ kind: UserHabitKind; value: string; meta?: Record<string, unknown> }> = [];
  const result = call.result;
  if (!result || result.ok === false) return out;

  const name = call.name;

  if (name === 'search_youtube' && result.video) {
    const v = result.video;
    const channel = typeof v.channel === 'string' ? v.channel : '';
    const title = typeof v.title === 'string' ? v.title : '';
    const artist = cleanChannelToArtist(channel);
    if (artist) {
      out.push({ kind: 'music_artist', value: artist });
    }
    const genre = detectMusicGenre(title, channel);
    if (genre) {
      out.push({ kind: 'music_genre', value: genre });
    }
  }

  if (name === 'search_place') {
    const amenity = typeof call.args.amenity === 'string' ? call.args.amenity : '';
    const city =
      typeof call.args.city === 'string' && call.args.city.trim() !== ''
        ? call.args.city.trim()
        : null;
    if (city) {
      out.push({ kind: 'place_visited', value: city });
    }
    if (amenity && AMENITY_TO_FOOD[amenity]) {
      out.push({ kind: 'food_pref', value: AMENITY_TO_FOOD[amenity] });
    }
    // Si serveur a pré-fetché des places, on capte les cuisines
    if (Array.isArray(result.places)) {
      const cuisines = new Set<string>();
      for (const p of result.places) {
        if (p && typeof p.cuisine === 'string' && p.cuisine.trim()) {
          for (const c of p.cuisine.split(/[;,]+/)) {
            const cc = c.trim().toLowerCase();
            if (cc && cc.length <= 40) cuisines.add(cc);
          }
        }
      }
      // Cap à 3 cuisines par interaction pour éviter sur-pondération.
      for (const c of Array.from(cuisines).slice(0, 3)) {
        out.push({ kind: 'food_pref', value: c });
      }
    }
  }

  if (name === 'search_recipe' && result.recipe) {
    const q = typeof call.args.query === 'string' ? call.args.query.trim() : '';
    if (q && q.length <= 60) {
      out.push({ kind: 'food_pref', value: q.toLowerCase() });
    }
    const recipeName = result.recipe.name;
    if (typeof recipeName === 'string' && recipeName.trim()) {
      out.push({ kind: 'food_pref', value: recipeName.trim().toLowerCase() });
    }
  }

  if (name === 'get_weather' && result.weather) {
    const w = result.weather;
    const city = typeof w.place_label === 'string' ? w.place_label : null;
    if (city) {
      out.push({ kind: 'place_visited', value: city });
    } else {
      // fallback : city passée en args
      const argCity = typeof call.args.city === 'string' ? call.args.city : '';
      if (argCity) out.push({ kind: 'place_visited', value: argCity });
    }
  }

  if (name === 'search_product') {
    const q = typeof call.args.query === 'string' ? call.args.query.trim() : '';
    if (q && q.length <= 60) {
      out.push({ kind: 'topic', value: q.toLowerCase() });
    }
  }

  if (name === 'search_web' || name === 'search_wikipedia') {
    const q = typeof call.args.query === 'string' ? call.args.query.trim() : '';
    if (q && q.length <= 60) {
      out.push({ kind: 'topic', value: q.toLowerCase() });
    }
  }

  return out;
}

/** Extrait @contacts depuis le message user. */
function extractContacts(message: string): string[] {
  const out = new Set<string>();
  CONTACT_MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONTACT_MENTION_RE.exec(message)) !== null) {
    const handle = m[1];
    // Skip @T2M de … (l'IA elle-même)
    if (/^T2M$/i.test(handle)) continue;
    out.add(handle);
    if (out.size >= 5) break;
  }
  return Array.from(out);
}

/** Appel DeepSeek light pour extraire entités structurées du message user. */
async function llmExtractEntities(
  message: string,
): Promise<{
  music?: string[];
  places?: string[];
  topics?: string[];
  food?: string[];
} | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  // Skip messages trop courts (pas d'info exploitable) ou trop longs (coût)
  const trimmed = message.trim();
  if (trimmed.length < 8 || trimmed.length > 500) return null;

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 5000,
      maxRetries: 0,
    });
    const completion = await openai.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            'Tu extrais des entités d\'intérêt utilisateur depuis un message. Retourne UNIQUEMENT du JSON valide avec les clés optionnelles : "music" (artistes/groupes), "places" (villes/lieux), "topics" (sujets/marques/entreprises), "food" (cuisines/plats). Chaque valeur est un tableau de strings courts (max 40 chars). Pas de phrase, pas d\'explication. Si rien d\'intéressant : retourne {}.',
        },
        {
          role: 'user',
          content: `Message : "${trimmed}"\n\nJSON :`,
        },
      ],
      temperature: 0.0,
      max_tokens: 150,
    });
    const raw = (completion.choices[0]?.message?.content || '').trim();
    if (!raw) return null;
    // Tolère ```json ... ```
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object') return null;
    const out: {
      music?: string[];
      places?: string[];
      topics?: string[];
      food?: string[];
    } = {};
    for (const key of ['music', 'places', 'topics', 'food'] as const) {
      const arr = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(arr)) {
        out[key] = arr
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length <= 40)
          .slice(0, 3);
      }
    }
    return out;
  } catch (e) {
    // Doctrine no-excuses : silencieux
    console.warn('[habits] llmExtractEntities skipped:', (e as Error).message);
    return null;
  }
}

/**
 * Point d'entrée extraction passive. NON BLOQUANT.
 * Doit être appelé en fire-and-forget (`.catch(...)`).
 */
export async function extractHabitsFromInteraction(
  input: ExtractHabitsInput,
): Promise<void> {
  const userId = input.userId;
  if (!userId) return;
  const userMessage = (input.userMessage || '').trim();

  try {
    // 1. Tool results déterministes
    if (Array.isArray(input.toolCalls)) {
      for (const call of input.toolCalls) {
        const extracted = extractFromToolResult(call);
        for (const e of extracted) {
          safeUpsertUserHabit(userId, e.kind, e.value, 'extract_tool_result', e.meta);
        }
      }
    }

    // 2. Contacts @handle dans le message user
    if (userMessage) {
      const contacts = extractContacts(userMessage);
      for (const c of contacts) {
        safeUpsertUserHabit(userId, 'contact', c, 'extract_message');
      }
    }

    // 3. DeepSeek light entity extraction (fail-soft)
    if (userMessage) {
      const ents = await llmExtractEntities(userMessage);
      if (ents) {
        for (const v of ents.music || []) {
          safeUpsertUserHabit(userId, 'music_artist', v, 'extract_message');
        }
        for (const v of ents.places || []) {
          safeUpsertUserHabit(userId, 'place_visited', v, 'extract_message');
        }
        for (const v of ents.topics || []) {
          safeUpsertUserHabit(userId, 'topic', v, 'extract_message');
        }
        for (const v of ents.food || []) {
          safeUpsertUserHabit(userId, 'food_pref', v, 'extract_message');
        }
      }
    }
  } catch (e) {
    console.error('[habits] extractHabitsFromInteraction error:', e);
  }
}
