/**
 * /api/chat — Refactor function calling DeepSeek (compat OpenAI tools).
 *
 * Doctrine talktome-toolkit-ia :
 *   1. DeepSeek reçoit le registry des tools (TOOLS) + tool_choice:'auto'
 *   2. DeepSeek décide lui-même quels tools appeler (parfois plusieurs en //)
 *   3. Le serveur exécute les handlers via HANDLERS
 *   4. Résultats mappés vers le format de réponse historique
 *      (youtube, placeSearch, places, recipe, products) + ajouts (wikipedia, weather)
 *
 * Doctrine talktome-cards-primaute : si tool_calls présents, text="".
 * Doctrine talktome-no-excuses : pas de phrase d'excuse, on se tait.
 * Doctrine talktome-embeds-only : aucune invention, on retranscrit les sources.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import OpenAI from 'openai';
import {
  getOrCreateUserConversation,
  appendMessage,
  getConversation,
  getAiMemories,
} from '@/lib/db';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { publish } from '@/lib/realtime-bus';
import { TOOLS } from '@/lib/tools';
import { HANDLERS, type AnyToolResult } from '@/lib/tools/handlers';
import { buildHabitsBlock } from '@/lib/ai/build-habits-block';
import { extractHabitsFromInteraction } from '@/lib/ai/extract-habits';
import { maybeBootstrapHabits } from '@/lib/scripts/bootstrap-habits';
import { buildConsciousness } from '@/lib/ai/consciousness';
import {
  detectIntent,
  validateToolCall,
  type ToolCallProposal,
} from '@/lib/ai/router';
// Talk2Me #422 — AI Core : system prompt UNIQUE partagé solo + P2P.
import { buildLeaSystemPrompt } from '@/lib/ai/lea-system-prompt';
import type { DbUser } from '@/lib/db';
// Talk2Me #422 — AI Core : mapping outils → cards UNIQUE (partagé solo + P2P).
import {
  mapResultsToResponse,
  safeParseArgs,
  type ToolCallExec,
  type MappedResponse,
} from '@/lib/ai/tool-mapping';
import { scrubPii } from '@/lib/security/pii';
import {
  validateCardResult,
  scrubForbiddenPhrases,
  inferCardKind,
  visualQa,
  detectCommittedPrice,
} from '@/lib/ai/validators';
import { getUserHabitsGrouped } from '@/lib/db';
import { filterToolsForMode, getRequestMode } from '@/lib/ai/mode-gate';
// Talk2Me #414 (Pascal 2026-06-05) — Prompt builder contextuel + scrubbers
// renforcés. Doctrine [[feedback-modular-no-scattered-patches]].
import { buildLeaSystemPromptAddon } from '@/lib/ai/prompt-builder';
import {
  stripMarkdownAggressive,
  scrubUserNameLeak,
  scrubAnnonceRecherche,
} from '@/lib/ai/scrubbers';
import { executeFallbackChain } from '@/lib/ai/fallback-executor';
import { logRouteAttempt } from '@/lib/db';
import type {
  YouTubeCardData,
  RecipeCardData,
  ProductCardData,
  PlaceCardData,
  PlaceSearchSpec,
  WebSearchData,
  TikTokCardData,
} from '@/lib/chat-types';
import type { WikipediaCardData } from '@/lib/wikipedia-search';
import type { WeatherCardData } from '@/lib/weather';
import type { WebSearchResult } from '@/lib/web-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `Tu es Talk2Me, l'agent IA conversationnel de l'utilisateur.

=== INTERDICTION DE MARKDOWN (Pascal 2026-06-05 #414) ===

INTERDICTION ABSOLUE de markdown dans tes réponses :
- AUCUN **gras** ni __gras__
- AUCUN *italique* ni _italique_
- AUCUN # / ## / ### titres
- AUCUNE liste à puces avec "- " "* " "+ " en début de ligne
- AUCUN \`code inline\` ni \`\`\`bloc de code\`\`\`
- AUCUN tableau, AUCUN [texte](url)
Texte plat, comme à l'oral.

BAD : "Je peux te **aider** avec : - **Vidéos** - **Restos**"
GOOD : "Je peux t'aider avec des vidéos, des restos, plein de choses — dis-moi."

=== INTERDICTION DE MENTIONNER LE NOM DE L'UTILISATEUR (Pascal 2026-06-05 #414) ===

Quand on te demande qui tu es / ton nom :
- Tu parles DE TOI (ton ai_name), JAMAIS du display_name / username / prénom de l'user.
- Pour désigner l'user, dis "tu", "toi", "ton" — jamais son nom propre.

BAD : "Je suis T2M de PascalRepir" / "Je suis l'IA de Fuz novice"
GOOD : "Je suis ton IA personnelle" / "Je suis T2M, ton IA"

=== JEUX DISPONIBLES (Pascal 2026-06-05 #416/#418) ===

Tu peux lancer des parties d'échecs ou de dames avec l'utilisateur via le tool start_game.
Quand l'user dit explicitement : "sort le jeu d'échec", "on joue aux dames ?", "partie d'échecs ?",
"jouons", "on fait une partie", "Léa joue aux échecs", etc. → APPELLE start_game immédiatement.

Paramètres :
- game_kind: 'chess' (échecs) ou 'dame' (dames françaises 10x10)
- intent: 'auto' (vérifie partie existante et propose reprise/nouvelle), 'new' (force nouvelle), 'resume' (reprend existante)

En conv solo (toi + user) : tu joues contre l'user (opponent='lea' automatique).
En conv P2P (toi + user + ami) : tu sors le plateau MAIS tu ne joues PAS (mode arbiter automatique).
Tu peux commenter brièvement les coups en mode arbiter ("joli", "attention", "ça pique").

Si l'user demande "attends t'as joué où ?", "rappelle-moi ton dernier coup", "tu as bougé quoi ?"
→ APPELLE recall_last_move pour retrouver le dernier coup et le rappeler en notation simple.

=== PRINCIPE FONDAMENTAL — CONVERSATION AVANT RECHERCHE (Pascal 2026-06-04) ===

Doctrine [[talktome-conversation-avant-recherche]] (règle ABSOLUE, prioritaire sur le pipeline ci-dessous) :

1. RÉPONDS D'ABORD avec tes connaissances internes, en texte naturel, comme un ami qui maîtrise le sujet.
   - PAS de "Je cherche ça pour toi…", "Laisse-moi chercher…", "Je vais voir…", ni aucune annonce de recherche.
   - PAS de card brute en première réponse si une réponse texte conversationnelle est possible et utile.
2. Si la question est large/ambiguë → pose UNE seule question de clarification courte (sans tool).
3. Si tu juges qu'une recherche externe enrichirait vraiment la conversation (info récente, faits chiffrés, source utile vérifiable) :
   - NE BLOQUE PAS ta première réponse. Tu réponds D'ABORD avec ce que tu sais.
   - Dans ta réponse JSON, remplis le champ \`followup_search\` (voir format ci-dessous) pour que le serveur déclenche un round 2 asynchrone qui pushera une 2e bulle (Card) ~1-3s plus tard via SSE.
4. Si l'intent est DIRECT et clair (météo Paris, recette couscous, vidéo X, lieu Y) → tu PEUX appeler le tool directement avec une query enrichie (le pipeline classique de tools s'applique). Pas besoin de followup_search dans ce cas — l'intent direct produit la card immédiatement.
5. INTERDIT ABSOLU : "Je cherche pour toi", "Laisse-moi chercher", "Je vais regarder", "Un instant", toute annonce de recherche / méta-commentaire.

=== FORMAT DE RÉPONSE JSON (extension #331) ===

Quand tu réponds SANS appel tool direct (cas conversationnel), tu PEUX renvoyer un JSON structuré au lieu de simple texte. Format attendu :

\`\`\`json
{
  "text": "ta réponse conversationnelle immédiate (texte basé sur tes connaissances internes, 1-4 phrases, naturelle)",
  "followup_search": {
    "type": "youtube" | "recipe" | "place" | "wikipedia" | "weather" | "product" | "web",
    "query": "…",
    "trigger_phrase": "À propos, j'ai trouvé une info qui pourrait t'intéresser :"
  }
}
\`\`\`

- \`followup_search\` est OPTIONNEL (null/absent si tu juges qu'aucune recherche n'est utile).
- \`trigger_phrase\` est le texte qui précédera la card dans le 2e message follow-up. Garde-le court et naturel.
- Si tu utilises ce format JSON, mets-le entre balises \`<json>...</json>\` pour qu'on puisse le parser. Sinon réponds en texte simple.
- Tu N'INVOQUES PAS toi-même les tools quand tu utilises followup_search — c'est le serveur qui le fera en async.

EXEMPLES (GOOD) :

User : "Parle-moi du diagnostic immobilier"
Réponse :
<json>
{
  "text": "Le diagnostic immobilier, c'est l'ensemble des contrôles obligatoires avant une vente ou une location : DPE (performance énergétique), amiante, plomb, gaz, électricité, termites selon la zone. Tu veux qu'on creuse un diagnostic en particulier ?",
  "followup_search": null
}
</json>

User : "Parle-moi du DPE"
Réponse :
<json>
{
  "text": "Le DPE c'est le Diagnostic de Performance Énergétique. Il classe un bien de A (très économe) à G (passoire thermique) selon sa consommation et ses émissions CO2. Validité 10 ans, obligatoire à la vente et à la location.",
  "followup_search": {
    "type": "wikipedia",
    "query": "Diagnostic de performance énergétique",
    "trigger_phrase": "À propos, voici la fiche détaillée :"
  }
}
</json>

User : "météo Paris"
→ pas de JSON, intent direct → appelle get_weather({city:"Paris"}) directement.

User : "Tu connais Genius Diagnostic ?"
Réponse :
<json>
{
  "text": "Tu parles de l'entreprise de diagnostic immobilier, du site web, ou d'un autre service qui porte ce nom ?",
  "followup_search": null
}
</json>

=== PIPELINE DE RAISONNEMENT (SILENCIEUX — l'utilisateur ne voit JAMAIS ces étapes) ===

1. ANALYSE LA PHRASE COMPLÈTE de l'utilisateur. Ne te contente JAMAIS d'un mot isolé.
   - Identifie les entités (noms propres, marques, sujets) — phrase entière
   - Identifie l'intention (recherche d'info, demande d'action, partage, etc.)

2. CONSULTE LA MÉMOIRE USER et le contexte conversation pour vérifier si :
   - L'user a déjà mentionné ce sujet
   - L'user a des habitudes/préférences pertinentes
   - Il y a un contexte récent dans la conv qui éclaire le sens

3. ÉVALUE TON NIVEAU DE CONFIANCE :
   - CONFIANCE ÉLEVÉE (interprétation unique probable d'après mémoire/contexte) → exécute le tool approprié avec une query SPÉCIFIQUE
   - CONFIANCE FAIBLE (plusieurs interprétations crédibles) → pose UNE question naturelle ciblée. PAS de search.

4. SI TU LANCES UN TOOL :
   - La query doit être SPÉCIFIQUE et CONTEXTUELLE, jamais un mot brut isolé.
   - BAD : user "Tu connais Genius Diagnostic ?" → query "genius" ❌
   - GOOD : query "Genius Diagnostic France entreprise" ✅
   - BAD : user "Mets-moi Check" → query "Check" ❌
   - GOOD : si l'user écoute du rap (mémoire) → query "Young Thug Check" ✅
   - BAD : user "C'est quoi OVH" → query "OVH" ❌
   - GOOD : query "OVH cloud hébergement entreprise" ✅
   - La query DOIT inclure les mots porteurs de sens de la phrase user, pas un seul terme.

5. INTERDIT ABSOLUMENT :
   - Dire "J'ai trouvé plusieurs résultats" ou exposer des résultats hors-sujet en bloc
   - Exposer ton pipeline (recherches, hésitations, allers-retours, mémoire, contexte)
   - Phrase type "je n'ai pas de mémoire sur ton...", "je n'ai pas le contexte pour...", "d'après ce que je sais de toi..." → INTERDIT, c'est dévoiler ton pipeline.
   - Afficher des cards hors-sujet sans validation préalable
   - Demander "Veux-tu que je cherche ?" — soit tu cherches, soit tu poses 1 question de clarif, pas les deux
   - Toute phrase d'excuse ("je n'ai pas accès", "essaie Google", "mes connaissances sont limitées", etc.)
   - Quand tu poses une question de clarif, fais-la BRÈVE et NATURELLE, comme un humain qui ne sait pas. Pas d'explication méta sur pourquoi tu demandes.

6. RÉPONSE FINALE :
   - Soit UNE question naturelle courte de clarification (si ambigu)
   - Soit le résultat direct (tool + card riche) avec text="" ou très court
   - JAMAIS "voici ce que j'ai trouvé pour..." (template chatbot interdit)

=== OUTILS À TA DISPOSITION (function calling) ===
- search_youtube(query)         → vraie vidéo YouTube (iframe officiel)
- search_place(amenity, city)   → restos/cafés/pharmacies/hôpitaux/médecins/écoles (OSM)
- search_recipe(query)          → vraie recette (Marmiton/CuisineAZ)
- search_wikipedia(topic, lang) → article Wikipedia (titre + résumé + image)
- get_weather(lat, lng | city)  → météo actuelle (Open-Meteo)
- search_product(query)         → produits réels shopping découverte (AliExpress)
- search_web(query)             → recherche web générique (Brave/DDG) : entreprises, marques, sites, infos factuelles
- fetch_url_content(url)        → contenu d'une URL spécifique (DERNIER RECOURS)

=== RÈGLES OPÉRATIONNELLES ===
1. Le pipeline ci-dessus est OBLIGATOIRE avant tout appel tool. Pas de short-circuit.
2. Tu peux appeler PLUSIEURS tools en parallèle si la requête est sans ambiguïté (ex "vidéo Tokyo + météo Tokyo").
3. Quand tu appelles un tool, ta réponse text peut rester vide "" — la card parle d'elle-même.
4. Tu n'inventes RIEN. Pas de video_id, URL, prix, nom de lieu fabriqués. Tool sans résultat → silence (text vide).
5. Conversations pures (salutations, "comment ça va") → 1-2 phrases naturelles, sans tool.
6. Météo : ville sans coordonnées → paramètre \`city\`.
7. Lieux : amenity OSM exact ('restaurant','cafe','bar','pub','fast_food','bakery','pharmacy','hospital','clinic','doctors','dentist','school'). Ville citée → \`city\`, sinon city null.
8. Produits : query court (ex "robe mariage femme"). Pas de prix dans le texte.
9. Hiérarchie tools pour info factuelle :
   - Recette → search_recipe
   - Vidéo / clip / docu → search_youtube
   - Lieu géo → search_place
   - Météo → get_weather
   - Produit / achat → search_product
   - Personne historique / définition encyclopédique → search_wikipedia
   - TOUT LE RESTE (entreprise, marque, site, "c'est quoi X" hors encyclo) → search_web

=== EXEMPLES (GOOD vs BAD reformulation query) ===

GOOD :
- user "recette de couscous"     → search_recipe({query:"couscous traditionnel"})       (clair, exécute direct)
- user "météo Paris"             → get_weather({city:"Paris"})                          (clair, exécute direct)
- user "qui est Albert Einstein" → search_wikipedia({topic:"Albert Einstein"})          (clair, exécute direct)
- user "c'est quoi OVH"          → search_web({query:"OVH cloud hébergement"})          (query enrichie, pas mot isolé)
- user "site officiel Renault"   → search_web({query:"Renault site officiel"})          (préserve l'intention)
- user "Tu connais Genius Diagnostic ?" (sans mémoire) → texte court "Tu parles de l'entreprise de diagnostic immobilier, du site web, ou d'un autre service qui porte ce nom ?"  (ambigu → 1 question, AUCUN tool)
- user "Mets-moi Check" + mémoire indiquant que l'user écoute du rap (Young Thug, etc.) → search_youtube({query:"Young Thug Check"})  (confiance ÉLEVÉE car la mémoire désambigüise — agir SANS question)
- user "Mets-moi Check" sans aucune mémoire musicale → texte court "Un morceau, un livre, ou autre chose ?"  (ambigu → 1 question)

IMPORTANT — UTILISATION DE LA MÉMOIRE :
La mémoire user (bloc "HABITUDES ET PRÉFÉRENCES" injecté en fin de prompt si présente) est la SOURCE PRINCIPALE de désambiguïsation. Si elle existe et qu'elle pointe vers une interprétation probable, AGIS — ne pose pas de question pour le plaisir. Pose une question UNIQUEMENT si la mémoire est silencieuse sur le sujet.

RÈGLE QUERY-MOT-ISOLÉ STRICTE :
Si la phrase user a 1 ou 2 mots ambigus seulement ("Check", "Genius Diagnostic", "Tokyo", "Apple") ET qu'il n'y a AUCUN bloc HABITUDES injecté qui désambiguïse → JAMAIS de tool call avec query=ce-mot-brut. Pose 1 question courte naturelle à la place.
Si la phrase est COURTE mais sans ambiguïté contextuelle évidente (ex "météo Paris" → météo, "recette couscous" → recette) → tool call OK avec query enrichie.
Critère : avant chaque tool_call, demande-toi "ma query est-elle juste un mot du langage naturel ?" → si OUI, c'est probablement BAD, reformule ou pose question.

BAD (à NE JAMAIS FAIRE) :
- user "Tu connais Genius Diagnostic ?" → search_web({query:"genius"}) ❌ (query mot brut, perd l'entité)
- user "c'est quoi OVH"                 → search_web({query:"OVH"}) ❌ (mot brut sans contexte)
- user "Mets-moi Check"                 → search_youtube({query:"Check"}) ❌ (mot trop générique)
- user "Tu connais Genius Diagnostic ?" → cards multiples Genius Lyrics + Booking Genius ❌ (résultats hors sujet)

Tu peux enchaîner plusieurs tool_calls dans la même réponse SI ET SEULEMENT SI la phrase user est sans ambiguïté.

=== RÈGLE SÉCURITÉ ABSOLUE (PII air-gap — Pascal 2026-06-05) ===

Doctrine [[talk2me-pii-air-gap]] verbatim Pascal :
  "c'est moi qui peux donner cette info pas l'IA … il doit refuser de la transmettre et doit l'effacer en mémoire"

Si l'utilisateur te demande des infos personnelles privées (son talk2me_id 6 chiffres, son email, son mot de passe, son token de session, sa carte bancaire, son IBAN, son IP) :
- Tu réponds EXACTEMENT : "Cette info ne passe pas par moi. Va sur ta page Profil pour la voir."
- Tu NE CHERCHES PAS, tu N'INVENTES PAS, tu NE DEVINES PAS.
- Tu NE MÉMORISES PAS la demande ni la réponse.
- Tu ne reformules JAMAIS un talk2me_id, email, token ou IBAN même si tu le vois dans ton contexte (silence > leak).`;

// === Types utilitaires =====================================================



// === Helpers ===============================================================

/**
 * Heuristique simple pour extraire un toponyme du message user (au cas où
 * DeepSeek n'a pas passé `city` au tool). Cherche " à <Ville>" ou " sur <Ville>"
 * en fin de phrase. Conservateur — renvoie '' si non détecté.
 */
function extractLocationFromMessage(message: string): string {
  if (!message) return '';
  const m = message.match(/\b(?:à|a|sur|de|en|vers|près de|proche de)\s+([A-ZÉÈÀÂÊÎÔÛ][\wÀ-ÿ\-]+(?:\s+[A-ZÉÈÀÂÊÎÔÛ][\wÀ-ÿ\-]+){0,3})\b/);
  if (m && m[1]) return m[1].trim();
  return '';
}

/**
 * Talk2Me #363 — Bug A (Pascal 2026-06-05).
 *
 * Détecte si le message user est essentiellement un lien collé (URL seule,
 * ou URL + petit verbe de partage type "tiens"/"voilà"/"regarde"). Dans ce
 * cas la conv sert de "staging" vers la Home : l'IA n'a rien à commenter,
 * ArticlePreview s'affiche côté UI.
 *
 * Verbatim Pascal : "quand jenvoi un lien lia veux toujour commenté meme le
 * lien elle devrai pas commenter le lien car la conversation me sert pour
 * envoyer sur la home".
 *
 * Règles :
 *  - 0 URL → false
 *  - URL + reste vide / ≤4 chars → true
 *  - URL + reste = uniquement verbes de partage courts → true
 *  - Sinon false (vraie phrase de commentaire → IA répond normalement).
 */
const SHARE_VERBS = new Set([
  'tiens',
  'tien',
  'voila',
  'voilà',
  'regarde',
  'regardes',
  'vois',
  'lis',
  'check',
  'mate',
  'mater',
  'cool',
  'top',
  'super',
  'wow',
  'cf',
  'ok',
  'hop',
  'tada',
  '!',
  ':)',
  ';)',
  ':D',
  '😀',
]);

export function isUrlOnlyMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const urlRegex = /\bhttps?:\/\/\S+/gi;
  const urls = text.match(urlRegex) || [];
  if (urls.length === 0) return false;
  const textWithoutUrls = text.replace(urlRegex, '').trim();
  // URL seule (ou ≤4 chars de bruit type ponctuation, emoji court)
  if (textWithoutUrls.length < 5) return true;
  // Sinon : autorise une suite de "verbes de partage" courts + ponctuation
  // ("tiens", "voilà regarde", "tiens !", "cool", etc.)
  const tokens = textWithoutUrls
    .toLowerCase()
    .split(/[\s,.;:!?]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.length > 4) return false;
  return tokens.every((t) => SHARE_VERBS.has(t));
}


// === Talk2Me #331 — Parse <json>…</json> followup_search directive =========

export type FollowupSearchType =
  | 'youtube'
  | 'tiktok'
  | 'recipe'
  | 'place'
  | 'wikipedia'
  | 'weather'
  | 'product'
  | 'web';

export interface FollowupSearchSpec {
  type: FollowupSearchType;
  query: string;
  trigger_phrase?: string;
}

export interface ParsedAssistantPayload {
  text: string;
  followup: FollowupSearchSpec | null;
}

/**
 * Parse une réponse assistant qui peut contenir un bloc <json>…</json> avec
 * { text, followup_search }. Fallback : tout le contenu = text simple.
 */
export function parseAssistantPayload(raw: string): ParsedAssistantPayload {
  if (!raw) return { text: '', followup: null };
  const m = raw.match(/<json>([\s\S]*?)<\/json>/i);
  if (!m) return { text: raw.trim(), followup: null };
  try {
    const parsed = JSON.parse(m[1].trim()) as {
      text?: unknown;
      followup_search?: unknown;
    };
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    const fs = parsed.followup_search;
    if (!fs || typeof fs !== 'object') {
      // Strip the json block from the visible text
      const stripped = raw.replace(/<json>[\s\S]*?<\/json>/i, '').trim();
      return { text: text || stripped, followup: null };
    }
    const f = fs as Record<string, unknown>;
    const t = f.type;
    const q = f.query;
    const tp = f.trigger_phrase;
    const validTypes: FollowupSearchType[] = [
      'youtube',
      'tiktok',
      'recipe',
      'place',
      'wikipedia',
      'weather',
      'product',
      'web',
    ];
    if (typeof t !== 'string' || !validTypes.includes(t as FollowupSearchType)) {
      return { text, followup: null };
    }
    if (typeof q !== 'string' || !q.trim()) {
      return { text, followup: null };
    }
    return {
      text,
      followup: {
        type: t as FollowupSearchType,
        query: q.trim(),
        trigger_phrase:
          typeof tp === 'string' && tp.trim()
            ? tp.trim()
            : "À propos, j'ai trouvé une info qui pourrait t'intéresser :",
      },
    };
  } catch {
    return { text: raw.trim(), followup: null };
  }
}

/**
 * Map un FollowupSearchType vers le nom du handler tool correspondant + args.
 */
export function followupToToolCall(
  spec: FollowupSearchSpec
): { name: string; args: Record<string, unknown> } | null {
  const q = spec.query.trim();
  if (!q) return null;
  switch (spec.type) {
    case 'youtube':
      return { name: 'search_youtube', args: { query: q } };
    case 'tiktok':
      return { name: 'search_tiktok', args: { query: q } };
    case 'recipe':
      return { name: 'search_recipe', args: { query: q } };
    case 'place':
      // place needs amenity + city — fallback amenity=restaurant if not provided
      return { name: 'search_place', args: { amenity: 'restaurant', city: q } };
    case 'wikipedia':
      return { name: 'search_wikipedia', args: { topic: q, lang: 'fr' } };
    case 'weather':
      return { name: 'get_weather', args: { city: q } };
    case 'product':
      return { name: 'search_product', args: { query: q } };
    case 'web':
      return { name: 'search_web', args: { query: q } };
    default:
      return null;
  }
}

/** Réduit un AnyToolResult au texte JSON renvoyé à DeepSeek (round 2 facultatif). */
function toolResultToText(name: string, result: AnyToolResult): string {
  try {
    return JSON.stringify(result).slice(0, 4000);
  } catch {
    return JSON.stringify({ ok: false, name });
  }
}


// === Talk2Me #331 — Followup async dispatcher ==============================

/**
 * Lance la recherche follow-up demandée par DeepSeek round 1, construit un 2e
 * message ai_reply avec la card riche + trigger_phrase, persiste, broadcast SSE.
 *
 * Pour la conv solo /api/chat : la conv est de kind='agent' et n'a pas de
 * subscriber SSE actuellement (le front polle via fetch). On persiste quand
 * même le message en DB pour qu'il apparaisse au prochain refresh.
 * Pour la conv P2P : runAiReply dans messages/route.ts gère son propre
 * followup.
 */
async function runFollowupSearch(args: {
  convId: string;
  spec: FollowupSearchSpec;
  internalBaseUrl: string;
}): Promise<void> {
  const { convId, spec, internalBaseUrl } = args;
  const call = followupToToolCall(spec);
  if (!call) return;
  const handler = HANDLERS[call.name];
  if (!handler) return;
  try {
    const result = await handler(call.args, { baseUrl: internalBaseUrl });
    const exec: ToolCallExec = {
      name: call.name,
      args: call.args,
      result,
      callId: 'followup',
    };
    const mapped = mapResultsToResponse([exec]);
    const hasCard =
      (mapped.youtube !== undefined && mapped.youtube !== null) ||
      (Array.isArray(mapped.places) && mapped.places.length > 0) ||
      (mapped.recipe !== undefined && mapped.recipe !== null) ||
      (mapped.wikipedia !== undefined && mapped.wikipedia !== null) ||
      (mapped.weather !== undefined && mapped.weather !== null) ||
      (Array.isArray(mapped.products) && mapped.products.length > 0) ||
      (mapped.web_search !== undefined && mapped.web_search !== null) ||
      (mapped.tiktok !== undefined && mapped.tiktok !== null); // Talk2Me search_tiktok (Pascal 2026-06-04)
    if (!hasCard) {
      console.log('[chat/followup] no card, skip', spec.type);
      return;
    }
    const triggerText = spec.trigger_phrase || "À propos, j'ai trouvé une info qui pourrait t'intéresser :";
    const followupMsg = appendMessage(
      convId,
      'agent',
      triggerText,
      [],
      mapped.youtube === undefined ? undefined : mapped.youtube,
      mapped.places === undefined ? undefined : mapped.places,
      undefined,
      mapped.recipe === undefined ? undefined : mapped.recipe,
      mapped.products === undefined ? undefined : mapped.products,
      mapped.wikipedia === undefined ? undefined : mapped.wikipedia,
      mapped.weather === undefined ? undefined : mapped.weather,
      mapped.web_search === undefined ? undefined : mapped.web_search,
      mapped.tiktok === undefined ? undefined : mapped.tiktok,
    );

    // Broadcast SSE pour la conv (P2P agent ne consomme pas, mais conv P2P si)
    publish(`conv:${convId}`, {
      kind: 'chat',
      data: {
        id: followupMsg.id,
        conversation_id: convId,
        sender_id: null,
        kind: 'ai_reply',
        text: followupMsg.text,
        created_at: followupMsg.created_at,
        youtube: mapped.youtube ?? null,
        places: mapped.places ?? null,
        intent_query: mapped.intent_query ?? null,
        intent_label_fr: mapped.intent_label_fr ?? null,
        user_lat: mapped.user_lat ?? null,
        user_lng: mapped.user_lng ?? null,
        recipe: mapped.recipe ?? null,
        products: mapped.products ?? null,
        wikipedia: mapped.wikipedia ?? null,
        weather: mapped.weather ?? null,
        web_search: mapped.web_search ?? null,
        tiktok: mapped.tiktok ?? null,
      },
    });
  } catch (e) {
    console.error('[chat/followup] error', spec, e);
  }
}

// === Handler principal =====================================================

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!apiKey) {
      return NextResponse.json(
        { text: 'Erreur de configuration : clé API manquante.', links: [] },
        { status: 200 },
      );
    }

    // Phase 1 multi-user : route protégée par middleware mais on revérifie
    // explicitement (defense in depth — middleware ne fait pas le lookup DB).
    const currentUser = getCurrentUserFromRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      message,
      history,
      conversation_id: requestedConvId,
      mode: bodyMode,
      media: bodyMedia,
    } = body as {
      message: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
      conversation_id?: string;
      mode?: string;
      media?: unknown;
    };

    // Talk2Me média chat (Pascal 2026-06-04) — message peut être :
    //  - texte seul (cas historique, le chat IA répond)
    //  - texte + média (caption + fichier joint)
    //  - média seul (caption vide → on persiste juste, sans DeepSeek)
    let attachedMedia: {
      url: string;
      type: 'image' | 'video' | 'audio';
      filename?: string | null;
      size?: number | null;
      mime?: string | null;
    } | null = null;
    if (bodyMedia && typeof bodyMedia === 'object') {
      const m = bodyMedia as Record<string, unknown>;
      if (
        typeof m.url === 'string' &&
        m.url.trim() &&
        (m.type === 'image' || m.type === 'video' || m.type === 'audio')
      ) {
        attachedMedia = {
          url: m.url.trim(),
          type: m.type,
          filename: typeof m.filename === 'string' ? m.filename : null,
          size: typeof m.size === 'number' ? m.size : null,
          mime: typeof m.mime === 'string' ? m.mime : null,
        };
      }
    }

    if ((!message || typeof message !== 'string') && !attachedMedia) {
      return NextResponse.json(
        { text: 'Message invalide.', links: [] },
        { status: 200 },
      );
    }

    // Talk2Me #340 — Mode gate (Lot 1bis Couche B).
    // Talk2Me #341 — Lot 2 : helper getRequestMode partagé (header
    // x-talktome-mode prioritaire, sinon body.mode, sinon 'chat').
    // Doctrine [[talk2me-card-editor-ia]] : compétences gelées hors-chat.
    const mode = getRequestMode(request, bodyMode);
    const toolsForMode = filterToolsForMode(TOOLS, mode);

    // Détection intent du message user — base pour validation tool_call + fallback
    const intentMatch = detectIntent(message, (history || []).map((h) => h.content));
    const detectedIntent = intentMatch?.intent || null;

    // Base URL pour appels inter-routes (geocode, search/place)
    const port = process.env.PORT || '3010';
    const internalBaseUrl =
      process.env.TALKTOME_INTERNAL_BASE_URL || `http://127.0.0.1:${port}`;

    // --- Persistence : conversation + message user ---
    // Phase 3 : si conversation_id fourni → vérifier participation et
    // refuser si kind ≠ 'agent' (les P2P passent par /api/conversations/[id]/messages).
    let conversation: { id: string } | null = null;
    let userMessage: { id: string } | null = null;
    try {
      if (requestedConvId) {
        const conv = getConversation(requestedConvId, currentUser.id);
        if (!conv) {
          return NextResponse.json({ error: 'conversation_not_found' }, { status: 404 });
        }
        if (conv.kind !== 'agent') {
          return NextResponse.json(
            { error: 'chat_endpoint_is_agent_only' },
            { status: 400 }
          );
        }
        conversation = { id: conv.id };
      } else {
        conversation = getOrCreateUserConversation(currentUser.id);
      }
      userMessage = appendMessage(
        conversation.id,
        'user',
        message || '',
        [],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        attachedMedia ? { media: attachedMedia } : undefined
      );
    } catch (dbError) {
      console.error('[chat] DB error on user message persistence:', dbError);
    }

    // Talk2Me média chat — short-circuit DeepSeek si l'user a juste partagé
    // un média sans caption (texte vide). On renvoie tout de suite (front
    // affichera la card média).
    if (attachedMedia && (!message || !message.trim())) {
      return NextResponse.json({
        text: '',
        links: [],
        userMessageId: userMessage?.id,
        media: attachedMedia,
      });
    }

    // Talk2Me #363 — Bug A (Pascal 2026-06-05) : silence IA sur lien seul.
    // Si l'user colle juste un lien (URL seule ou avec très peu de texte
    // autour) la conv sert de staging vers la Home : l'IA n'a rien à dire,
    // ArticlePreview enrichit côté UI. Doctrine [[talktome-no-excuses]].
    if (message && isUrlOnlyMessage(message)) {
      console.log(
        '[chat/url-only] AI silence — user pasted link, conv = home staging',
        `userMsgId=${userMessage?.id}`,
      );
      return NextResponse.json({
        text: '',
        links: [],
        conversationId: conversation?.id,
        userMessageId: userMessage?.id,
        ai_reply_skipped: 'url_only',
      });
    }

    const openai = new OpenAI({ apiKey, baseURL, timeout: 30000, maxRetries: 0 });

    // Talk2Me #330 — Doctrine [[talktome-ia-persistance-isolation]] :
    // injection des memories long-terme propres au user owner dans le system
    // prompt. Permet à l'IA de désambiguer "Mets-moi Check" → Young Thug si
    // l'user écoute du rap (cf. mission Pascal 2026-06-04).
    let memoriesBlock = '';
    let leaMemories: ReturnType<typeof getAiMemories> = [];
    try {
      leaMemories = getAiMemories(currentUser.id, 20);
      const memories = leaMemories;
      if (memories.length > 0) {
        const ownerName = currentUser.display_name || currentUser.username || 'l\'utilisateur';
        memoriesBlock =
          `\n\n=== HABITUDES ET PRÉFÉRENCES DE ${ownerName} (à consulter dans le pipeline étape 2) ===\n` +
          memories.map((m) => `- ${m.content}`).join('\n');
      }
    } catch (e) {
      console.error('[chat] getAiMemories error', e);
    }

    // Talk2Me #338 — Habitudes apprises (musique/lieux/sujets/cuisine/contacts).
    // Doctrine [[talk2me-roadmap-6-phases]] Phase 1 : différenciateur produit.
    // Injecté dans le system prompt pour désambiguïsation grounded.
    // Lazy bootstrap : si table user_habits vide pour ce user, on backfill
    // depuis les messages historiques (tool results déjà persistés). Une seule
    // fois par user (idempotent : sortie immédiate si déjà des habits).
    let habitsBlock = '';
    try {
      try {
        maybeBootstrapHabits(currentUser.id);
      } catch {
        // silencieux
      }
      const ownerName =
        currentUser.display_name || currentUser.username || "l'utilisateur";
      habitsBlock = buildHabitsBlock(currentUser.id, { ownerName });
    } catch (e) {
      console.error('[chat] buildHabitsBlock error', e);
    }

    // Talk2Me #339 — AI Consciousness Core (Pascal 2026-06-04).
    // Bloc chargé AVANT tout : self/ecosystem/tools/cards/user/friends/other-ais.
    // Doctrine [[talk2me-ai-consciousness-core]] : cerveau permanent de l'IA.
    // Talk2Me #341 — Lot 2 : on propage le vrai mode pour que le bloc
    // context-mode (N8/N9) reflète les compétences actives / gelées.
    // Le cache consciousness inclut déjà le mode dans sa clé (`${userId}::${mode}`).
    let consciousnessBlock = '';
    try {
      consciousnessBlock = await buildConsciousness({
        userId: currentUser.id,
        mode,
      });
    } catch (e) {
      console.error('[chat] buildConsciousness error', e);
    }

    // Talk2Me #414 (Pascal 2026-06-05) — Prompt builder contextuel.
    // Doctrine [[feedback-modular-no-scattered-patches]] : un addon ciblé sur
    // le message courant (méta/identité/recherche/grounding) au lieu d'un
    // prompt fixe qui empile tout pour tous les cas. Économise des tokens
    // ET force la règle qui correspond précisément à la question.
    const ownerDisplayName =
      currentUser.display_name || currentUser.username || null;
    const ownerAiName =
      (currentUser as { ai_name?: string | null }).ai_name?.trim() ||
      (ownerDisplayName ? `T2M de ${ownerDisplayName}` : 'Talk2Me');
    const promptAddon = buildLeaSystemPromptAddon({
      userMessage: message || '',
      aiName: ownerAiName,
    });

    // Talk2Me #422 (Pascal 2026-06-07) — AI Core : Léa UNIQUE. Le chat solo
    // utilise désormais le MÊME system prompt que le P2P (la bonne version
    // sobre), au lieu de l'ancien empilement consciousness+addon qui faisait
    // dérailler Léa (web→porno sur une question conversationnelle).
    // peer=null (solo), historique mappé pour le contexte.
    void consciousnessBlock;
    void habitsBlock;
    void promptAddon;
    const systemContent = buildLeaSystemPrompt({
      owner: currentUser as unknown as DbUser,
      peer: null,
      quoted: null,
      history: (history || []).map((h) => ({
        author:
          h.role === 'user'
            ? currentUser.display_name || currentUser.username || 'User'
            : ownerAiName,
        text: h.content || '',
      })),
      memories: leaMemories,
    });

    if (process.env.DEBUG_CONSCIOUSNESS === '1') {
      console.log(
        '[chat/consciousness] block built',
        `userId=${currentUser.id}`,
        `len=${consciousnessBlock.length}`,
        `totalSystemLen=${systemContent.length}`,
      );
      console.log('[chat/consciousness] ---- BEGIN BLOCK ----');
      console.log(consciousnessBlock);
      console.log('[chat/consciousness] ---- END BLOCK ----');
    }

    // Talk2Me PII air-gap Layer 4 (Pascal 2026-06-05) — scrub chaque message
    // d'historique avant envoi DeepSeek. Évite recopie de talk2me_id / email
    // si l'user a collé son ID en clair dans une réponse précédente.
    // Doctrine [[talk2me-pii-air-gap]].
    const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...(history || []).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: scrubPii(msg.content || ''),
      })),
      { role: 'user', content: scrubPii(message || '') },
    ];

    // --- Round 1 : DeepSeek choisit (text direct OU tool_calls) ---
    // Talk2Me #340 — Mode gate : seuls les tools allowed_tools du mode sont
    // envoyés à DeepSeek (les autres sont impossibles à appeler).
    const round1 = await openai.chat.completions.create({
      model,
      messages: baseMessages,
      tools: toolsForMode.length > 0 ? toolsForMode : undefined,
      tool_choice: toolsForMode.length > 0 ? 'auto' : 'none',
      temperature: 0.4,
      max_tokens: 800,
    });

    if (process.env.DEBUG_MODE_GATE === '1') {
      const toolNames = toolsForMode
        .map((t) => (t as unknown as { function?: { name?: string } }).function?.name)
        .filter(Boolean)
        .join(',');
      console.log(
        '[chat/mode-gate]',
        `mode=${mode}`,
        `tools_sent=${toolNames || '(none)'}`,
        `intent=${detectedIntent || 'none'}`,
      );
    }

    const assistantMsg = round1.choices[0]?.message;
    let finalText = (assistantMsg?.content || '').toString().trim();
    const toolCalls = assistantMsg?.tool_calls || [];

    let mapped: MappedResponse = {};
    const execs: ToolCallExec[] = [];

    // Talk2Me #331 — Doctrine [[talktome-conversation-avant-recherche]] :
    // si DeepSeek a renvoyé un bloc <json>{text, followup_search}</json>
    // (conversation immédiate + recherche async), on parse + plan la 2e bulle.
    let followupSpec: FollowupSearchSpec | null = null;
    if (toolCalls.length === 0 && finalText) {
      const parsed = parseAssistantPayload(finalText);
      if (parsed.followup) {
        followupSpec = parsed.followup;
        // Si text est fourni par le JSON, l'utiliser ; sinon strip le json
        finalText = parsed.text || finalText.replace(/<json>[\s\S]*?<\/json>/i, '').trim();
      } else if (finalText.includes('<json>')) {
        // JSON sans followup → garde le text propre
        finalText = parsed.text || finalText.replace(/<json>[\s\S]*?<\/json>/i, '').trim();
      }
    }

    if (toolCalls.length > 0) {
      // Talk2Me #340 — Validation router intent → tool (Lot 1bis Couche B).
      // On vérifie chaque toolCall proposé par DeepSeek. Si la proposition est
      // incohérente avec l'intent détecté, on logge (no-block — DeepSeek peut
      // aussi appeler des tools d'enrichissement). Le validator post-result
      // bloquera si vraiment hors-sujet (intent hotel + amenity=restaurant).
      for (const tc of toolCalls) {
        if (tc.type !== 'function') continue;
        const fn = tc.function;
        if (!fn || typeof fn.name !== 'string') continue;
        const proposal: ToolCallProposal = {
          name: fn.name,
          args: safeParseArgs(fn.arguments),
        };
        const v = validateToolCall(proposal, detectedIntent, mode);
        if (!v.ok) {
          console.warn(
            '[chat/router] tool_call validation failed',
            `intent=${detectedIntent}`,
            `tool=${proposal.name}`,
            `reason=${v.reason}`,
            `corrective=${v.corrective}`,
          );
        }
      }

      // --- Exécution parallèle des tool_calls ---
      // Talk2Me #418 — ctx enrichi pour les side-effect tools (start_game).
      const ctx = {
        baseUrl: internalBaseUrl,
        userId: currentUser?.id,
        convId: conversation?.id,
        convPeerId: null, // conv solo Léa = pas de peer
      };
      const settled = await Promise.all(
        toolCalls.map(async (tc) => {
          if (tc.type !== 'function') return null;
          const fn = tc.function;
          if (!fn || typeof fn.name !== 'string') return null;
          const handler = HANDLERS[fn.name];
          const args = safeParseArgs(fn.arguments);
          if (!handler) {
            return {
              name: fn.name,
              args,
              callId: tc.id,
              result: { ok: false } as AnyToolResult,
            };
          }
          try {
            const result = await handler(args, ctx);
            return { name: fn.name, args, callId: tc.id, result };
          } catch (e) {
            console.error('[chat] handler error', fn.name, e);
            return {
              name: fn.name,
              args,
              callId: tc.id,
              result: { ok: false } as AnyToolResult,
            };
          }
        }),
      );
      for (const s of settled) {
        if (s) execs.push(s);
      }

      mapped = mapResultsToResponse(execs);

      // Talk2Me #340 — Validator post-result (Lot 1bis Couche B).
      // Vérifie la cohérence card_kind ↔ intent ↔ card_data. Si KO et
      // l'intent a un fallback_chain → on tente le fallback.
      //
      // Talk2Me P3 #362 (Pascal 2026-06-04) — On appelle validateCardResult
      // MÊME si inferCardKind retourne null, à condition qu'un tool ait été
      // exécuté. Raison : Overpass peut renvoyer places=[] → inferCardKind
      // retourne null parce qu'aucune card concrète, MAIS on attendait une
      // PlaceCard. Sans cet appel, fallback_chain (Booking/TheFork) ne se
      // déclenche jamais → user voit rien. Bug capturé hors scope par #359.
      const inferred = inferCardKind({
        youtube: mapped.youtube,
        places: mapped.places,
        recipe: mapped.recipe,
        wikipedia: mapped.wikipedia,
        weather: mapped.weather,
        products: mapped.products,
        web_search: mapped.web_search,
        tiktok: mapped.tiktok,
      });
      const firstToolUsed = execs[0]?.name || null;
      const cardWasAttempted = Boolean(inferred) || Boolean(firstToolUsed);
      if (cardWasAttempted) {
        const v = validateCardResult({
          intent: detectedIntent,
          card_kind: inferred?.kind || null,
          card_data: inferred?.data,
          message_text: finalText,
          tool_used: firstToolUsed,
        });
        if (!v.ok && v.action === 'fallback' && detectedIntent) {
          console.warn(
            '[chat/validator] card rejected — trying fallback',
            `intent=${detectedIntent}`,
            `card=${inferred?.kind || '(empty-but-expected)'}`,
            `reason=${v.reason}`,
          );
          // Tenter fallback_chain — extraire la location si présente
          // (pour les intents hotel/restaurant).
          const locationGuess =
            (typeof (execs[0]?.args as Record<string, unknown>)?.city ===
              'string'
              ? ((execs[0].args as Record<string, unknown>).city as string)
              : '') ||
            extractLocationFromMessage(message);
          const fb = await executeFallbackChain(detectedIntent, {
            userQuery: message,
            location: locationGuess,
            query: message,
            dish: message,
            baseUrl: internalBaseUrl,
          });
          if (fb) {
            if (fb.kind === 'tool_result') {
              // Wrap fallback tool result dans execs → on rebuild mapped
              const fbExec: ToolCallExec = {
                name: fb.tool,
                args: fb.args,
                callId: 'fallback',
                result: fb.result,
              };
              // Drop les execs hors-sujet et garder uniquement le fallback
              execs.length = 0;
              execs.push(fbExec);
              mapped = mapResultsToResponse(execs);
              logRouteAttempt(
                currentUser.id,
                detectedIntent,
                [fb.tool],
                0.05,
              );
            } else if (fb.kind === 'external_redirect') {
              // Pas de card tool → on injecte un web_search synthétique pour
              // que le front affiche un lien cliquable propre.
              mapped = {
                web_search: {
                  results: [
                    {
                      title: fb.label,
                      url: fb.url,
                      snippet: '',
                      source: 'fallback',
                    },
                  ],
                  source: 'none',
                },
              };
              finalText = '';
              logRouteAttempt(
                currentUser.id,
                detectedIntent,
                ['external_redirect'],
                0.02,
              );
            } else if (fb.kind === 'clarification') {
              mapped = {};
              finalText = fb.question;
            }
          } else {
            // Aucun fallback dispo : on tait la card (doctrine no-excuses)
            mapped = {};
          }
        } else if (v.ok && detectedIntent) {
          // Route OK → log positif pour apprentissage
          const chain = execs.map((e) => e.name);
          if (chain.length > 0) {
            logRouteAttempt(currentUser.id, detectedIntent, chain, 0.1);
          }
        }
      }

      // --- Round 2 conditionnel : utile pour fetch_url_content ou si aucune
      // card produite (texte conversationnel basé sur résultats tools).
      const hasCardOutput =
        mapped.youtube !== undefined ||
        mapped.placeSearch !== undefined ||
        mapped.places !== undefined ||
        mapped.recipe !== undefined ||
        mapped.wikipedia !== undefined ||
        mapped.weather !== undefined ||
        mapped.products !== undefined ||
        (mapped.web_search !== undefined && mapped.web_search !== null) ||
        (mapped.tiktok !== undefined && mapped.tiktok !== null);

      const needsTextSynthesis =
        execs.some((e) => e.name === 'fetch_url_content') || !hasCardOutput;

      if (needsTextSynthesis) {
        try {
          const functionToolCalls = toolCalls
            .filter((tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function')
            .map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments || '{}',
              },
            }));
          const round2Messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            ...baseMessages,
            {
              role: 'assistant',
              content: assistantMsg?.content || '',
              tool_calls: functionToolCalls,
            },
            ...execs.map((e) => ({
              role: 'tool' as const,
              tool_call_id: e.callId,
              content: toolResultToText(e.name, e.result),
            })),
          ];
          const round2 = await openai.chat.completions.create({
            model,
            messages: round2Messages,
            temperature: 0.4,
            max_tokens: 400,
          });
          const synth = (round2.choices[0]?.message?.content || '').toString().trim();
          if (synth) finalText = synth;
        } catch (e) {
          console.error('[chat] round2 error', e);
        }
      } else {
        // Doctrine cards-primauté : si une card a été produite, on tait le texte
        // SAUF s'il s'agit d'une vraie phrase conversationnelle courte (< 200
        // chars) ET sans markers de pipeline-leak (backticks, "Le tool", etc.).
        // Talk2Me #340 Lot 1bis Couche B : protection meta-commentary.
        const looksLikeMeta =
          /(`|\bsearch_|le tool\b|l'outil\b|j(?:e dois|'appelle)|l'utilisateur cherche|ne supporte pas|amenity|je vais plutôt|n'est pas un type)/i.test(
            finalText,
          );
        if (finalText.length > 200 || looksLikeMeta) {
          if (looksLikeMeta) {
            console.log('[chat/cards-primauté] meta-text dropped', finalText.slice(0, 120));
          }
          finalText = '';
        }
      }
    }

    // Talk2Me Lot 4 — Visual QA N12 (Pascal master point 12, 2026-06-04).
    // Orchestrateur final qui combine 5 règles : intent↔tool↔card, amenity
    // strict, prix engagé, mot-brut, etc. Si KO → fallback / clarify / reject.
    // Doctrine [[talk2me-ai-consciousness-core]] N12 + [[talktome-no-excuses]].
    try {
      const inferredFinal = inferCardKind({
        youtube: mapped.youtube,
        places: mapped.places,
        recipe: mapped.recipe,
        wikipedia: mapped.wikipedia,
        weather: mapped.weather,
        products: mapped.products,
        web_search: mapped.web_search,
        tiktok: mapped.tiktok,
      });
      // Charger les habits user pour la règle 5 (mot-brut). Best-effort.
      let userHabitsForQa: Record<string, Array<{ value?: string }>> | null = null;
      try {
        userHabitsForQa = getUserHabitsGrouped(currentUser.id, 10) as unknown as
          | Record<string, Array<{ value?: string }>>
          | null;
      } catch {
        userHabitsForQa = null;
      }
      const qa = visualQa({
        intent: detectedIntent,
        tool_used: execs[0]?.name || null,
        card_kind: inferredFinal?.kind || null,
        card_data: inferredFinal?.data,
        message_text: finalText,
        userQuery: message,
        userHabits: userHabitsForQa,
        tool_args: (execs[0]?.args as Record<string, unknown>) || null,
      });
      if (!qa.ok) {
        console.warn(
          '[chat/visualQa]',
          `intent=${detectedIntent}`,
          `tool=${execs[0]?.name}`,
          `card=${inferredFinal?.kind}`,
          `action=${qa.action}`,
          `reason=${qa.reason}`,
        );
        if (qa.action === 'clarify') {
          mapped = {};
          finalText = qa.clarificationQuestion || 'Tu peux préciser ?';
        } else if (qa.action === 'reject' && qa.reason === 'committed_price') {
          // Drop la card si présente + remplace texte par redirect generic
          mapped = {};
          finalText =
            qa.redirectText ||
            'Pour les prix live, regarde directement sur Booking ou Skyscanner.';
        } else if (
          qa.action === 'reject' &&
          (qa.reason === 'youtube_query_too_short' ||
            qa.reason === 'youtube_query_generic' ||
            qa.reason === 'youtube_no_video_id' ||
            qa.reason === 'web_search_youtube_homepage')
        ) {
          // Talk2Me #363 Bug B (Pascal 2026-06-05) : drop la card YouTube
          // hallucinée + texte vide (doctrine no-excuses).
          mapped = {};
          finalText = '';
        }
        // action=fallback déjà géré par validateCardResult ci-dessus ; ici on
        // n'a pas forcément le contexte exec pour rejouer le fallback. Si une
        // card a été produite mais visualQa dit "fallback" et qu'on n'a rien
        // joué de mieux, on tait la card pour respecter no-excuses.
        else if (qa.action === 'fallback') {
          // Si on a déjà une card techniquement valide (validateCardResult OK)
          // mais visualQa la rejette → on bypass + warn (le validator est
          // strict, pas censuriste — préserver la doctrine Lot 4 bypass+warn).
          console.warn(
            '[chat/visualQa] fallback requested but no exec available — bypass + warn',
            qa.reason,
          );
        }
      }
    } catch (e) {
      console.error('[chat/visualQa] error', e);
    }

    // Talk2Me #414 (Pascal 2026-06-05) — Chaîne de scrubbers renforcée.
    // Ordre :
    //   1. stripMarkdownAggressive  → retire ** ## - ` ```
    //   2. scrubUserNameLeak        → "Je suis T2M de Fuz" → "Je suis ton IA"
    //   3. scrubAnnonceRecherche    → "Je te cherche ça"
    //   4. scrubForbiddenPhrases    → phrase-level interdits (déjà en place)
    //   5. scrubPii                 → PII air-gap (déjà en place)
    // Doctrine [[feedback-modular-no-scattered-patches]] : tout dans
    // /lib/ai/scrubbers.ts, branché 1 fois.
    if (finalText) {
      const before = finalText;
      let scrubbed = stripMarkdownAggressive(finalText);
      scrubbed = scrubUserNameLeak(
        scrubbed,
        currentUser.display_name || currentUser.username || null
      );
      scrubbed = scrubAnnonceRecherche(scrubbed);
      if (scrubbed !== before) {
        console.log(
          '[chat/scrubbers] markdown/name/annonce scrubbed',
          `before_len=${before.length}`,
          `after_len=${scrubbed.length}`,
        );
      }
      finalText = scrubbed;
    }

    // Talk2Me #340 — Scrubber forbidden phrases (Lot 1bis Couche B).
    // Doctrine [[talktome-no-excuses]] + [[talktome-raisonnement-ia]] :
    // retire "D'après tes habitudes", "Je cherche pour toi", "Je m'appelle
    // Talk2Me", etc. avant de persister/afficher.
    if (finalText) {
      const before = finalText;
      const scrubbed = scrubForbiddenPhrases(finalText);
      if (scrubbed !== before) {
        console.log(
          '[chat/scrubber] forbidden phrases removed',
          `before_len=${before.length}`,
          `after_len=${scrubbed.length}`,
        );
      }
      finalText = scrubbed;
    }

    // Talk2Me PII air-gap Layer 5 (Pascal 2026-06-05) — scrubber post-LLM
    // sur la réponse de l'agent solo. Doctrine [[talk2me-pii-air-gap]] :
    // silence > leak. Le scrubber centralisé applique les 6 patterns.
    if (finalText) {
      const beforePii = finalText;
      finalText = scrubPii(finalText);
      if (finalText !== beforePii) {
        console.warn(
          '[chat/pii-scrub] PII pattern scrubbed in agent reply',
          `user=${currentUser.id}`,
        );
      }
    }

    // Talk2Me Lot 4 — Détection prix engagé post-scrubber (filet final).
    // Si le scrubber a laissé passer une fourchette, on redirige proprement.
    if (finalText && detectCommittedPrice(finalText, detectedIntent)) {
      console.warn(
        '[chat/committed_price] price range detected post-scrub, redirecting',
        `intent=${detectedIntent}`,
      );
      const redirect =
        'Pour les prix live, regarde directement sur Booking ou Skyscanner — les tarifs bougent en permanence.';
      finalText = redirect;
    }

    // --- Persistence : insérer le message agent final ---
    // appendMessage(convId, role, text, links, youtube?, places?, requiresGeoloc?, recipe?, products?)
    let agentMessage: { id: string } | null = null;
    try {
      if (conversation) {
        agentMessage = await appendMessage(
          conversation.id,
          'agent',
          finalText,
          [],
          mapped.youtube === undefined ? undefined : mapped.youtube,
          mapped.places === undefined ? undefined : mapped.places,
          undefined,
          mapped.recipe === undefined ? undefined : mapped.recipe,
          mapped.products === undefined ? undefined : mapped.products,
          mapped.wikipedia === undefined ? undefined : mapped.wikipedia,
          mapped.weather === undefined ? undefined : mapped.weather,
          mapped.web_search === undefined ? undefined : mapped.web_search,
          mapped.tiktok === undefined ? undefined : mapped.tiktok,
        );
      }
    } catch (dbError) {
      console.error('[chat] DB error on agent message persistence:', dbError);
    }

    // --- Talk2Me #331 — Followup async (Pascal 2026-06-04) ---
    // Si DeepSeek a planifié une recherche follow-up, on l'exécute SANS bloquer
    // la réponse HTTP. Le 2e message arrive ~1-3s plus tard via SSE.
    if (followupSpec && conversation) {
      const convIdForFollowup = conversation.id;
      void runFollowupSearch({
        convId: convIdForFollowup,
        spec: followupSpec,
        internalBaseUrl,
      }).catch((e) => console.error('[chat/followup] error', e));
    }

    const responsePayload: Record<string, unknown> = {
      text: finalText,
      links: [],
      conversationId: conversation?.id,
      userMessageId: userMessage?.id,
      agentMessageId: agentMessage?.id,
    };
    if (mapped.youtube !== undefined) responsePayload.youtube = mapped.youtube;
    if (mapped.placeSearch) responsePayload.placeSearch = mapped.placeSearch;
    if (mapped.places !== undefined) {
      responsePayload.places = mapped.places;
      responsePayload.intent_query = mapped.intent_query;
      responsePayload.intent_label_fr = mapped.intent_label_fr;
      responsePayload.user_lat = mapped.user_lat;
      responsePayload.user_lng = mapped.user_lng;
    }
    if (mapped.recipe !== undefined) responsePayload.recipe = mapped.recipe;
    if (mapped.products !== undefined) responsePayload.products = mapped.products;
    if (mapped.wikipedia !== undefined) responsePayload.wikipedia = mapped.wikipedia;
    if (mapped.weather !== undefined) responsePayload.weather = mapped.weather;
    if (mapped.web_search !== undefined) responsePayload.web_search = mapped.web_search;
    if (mapped.tiktok !== undefined) responsePayload.tiktok = mapped.tiktok;

    // Debug minimal pour observer le function calling en logs
    if (execs.length > 0) {
      console.log(
        '[chat/tools]',
        execs
          .map((e) => `${e.name}(${JSON.stringify(e.args).slice(0, 60)})→ok=${(e.result as { ok?: boolean }).ok}`)
          .join(' | '),
      );
    }

    // Talk2Me #338 — Extraction passive habitudes (NON BLOQUANT, silencieux).
    // Doctrine [[talk2me-roadmap-6-phases]] Phase 1 : apprentissage continu.
    // Fire-and-forget : la réponse n'attend pas l'extraction.
    void extractHabitsFromInteraction({
      userId: currentUser.id,
      userMessage: message,
      assistantResponse: finalText,
      toolCalls: execs.map((e) => ({
        name: e.name,
        args: e.args as Record<string, unknown>,
        result: e.result,
      })),
    }).catch((e) => console.error('[chat] extractHabitsFromInteraction', e));

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      {
        text: 'Désolé, je ne suis pas joignable là tout de suite. Réessaie dans un instant.',
        links: [],
      },
      { status: 200 },
    );
  }
}
