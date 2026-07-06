/**
 * POST /api/conversations/[id]/messages { text, quoted_message_id? }
 * Envoie un message dans une conversation existante.
 *
 * Talk2Me #324 v2 (Pascal 2026-06-04) — Doctrine
 * [[talk2me-ia-personnelle-integree]] :
 * - L'IA de chaque user est INTÉGRÉE DANS le fil P2P (pas conv séparée).
 * - Tag `@<ai_name>` dans le message → fork branche IA async (DeepSeek +
 *   tools), persiste un message kind='ai_reply' dans le MÊME fil.
 * - L'IA est CONSCIENTE de son nom via system prompt.
 * - Si user a renommé son IA "Nova" → tag = `@Nova`.
 * - quoted_message_id permet à l'IA de répondre à un message précis cité.
 *
 * - kind='agent' → délègue à /api/chat (DeepSeek + tools). Pas ici.
 * - kind='p2p'   → persiste message + broadcast SSE + éventuelle réponse IA.
 *
 * Sécurité : vérifie que le user est participant.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { recordLlmUsage } from '@/lib/schema/llm-usage';
import { sendPushToUser } from '@/lib/push';
import {
  appendMessage,
  getAiMemories,
  getConversation,
  getMessageById,
  getRecentMessages,
  getUserById,
  type DbAiMemory,
  type DbMessage,
  type DbUser,
} from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
import { isBlockedEither } from '@/lib/moderation';
import { TOOLS } from '@/lib/tools';
import { HANDLERS, type AnyToolResult } from '@/lib/tools/handlers';
// Talk2Me #379 — IA T2M Officiel institutionnelle (Pascal 2026-06-05).
import { T2M_OFFICIEL_USER_ID } from '@/lib/ai/officiel/constants';
import { runOfficielReply } from '@/lib/ai/officiel/handler';
import { scrubPii } from '@/lib/security/pii';
// Talk2Me #414 (Pascal 2026-06-05) — Prompt builder contextuel + scrubbers
// renforcés. Mêmes outils que /api/chat pour cohérence solo/P2P.
import { buildLeaSystemPromptAddon } from '@/lib/ai/prompt-builder';
// Talk2Me #422 — AI Core : system prompt UNIQUE (partagé solo + P2P).
import { buildLeaSystemPrompt } from '@/lib/ai/lea-system-prompt';
// Talk2Me #422 — AI Core : mapping outils → cards UNIQUE (partagé solo + P2P).
import {
  mapResultsToResponse,
  safeParseArgs,
  type ToolCallExec,
  type MappedResponse,
} from '@/lib/ai/tool-mapping';
import {
  stripMarkdownAggressive,
  scrubUserNameLeak,
  scrubAnnonceRecherche,
} from '@/lib/ai/scrubbers';
import { scrubForbiddenPhrases } from '@/lib/ai/validators';
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

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Échappe une chaîne pour usage dans un RegExp (le nom IA peut contenir des
 * espaces, accents, etc.).
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Détecte si le message contient un tag `@<ai_name>` au début OU précédé
 * d'un espace, case-insensitive. Le tag doit être suivi d'un word boundary
 * ou fin de chaîne.
 */
function hasAiTag(text: string, aiName: string): boolean {
  if (!text || !aiName) return false;
  const escaped = escapeRegex(aiName.trim());
  // Match : début OU précédé d'un espace, puis @<name>, suivi de fin/espace/ponctuation
  const re = new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,!?;:])`, 'i');
  return re.test(text);
}

/**
 * Talk2Me PII air-gap Layer 4 (Pascal 2026-06-05) — Sanitize un texte avant
 * qu'il soit injecté dans le system prompt de Léa (IA personnelle).
 *
 * Doctrine [[talk2me-pii-air-gap]] verbatim Pascal :
 *   "cette infos en general ne dois meme pas passer dans les tuyaux de l'IA"
 *
 * Combine :
 *   - Retrait des lignes "Talk2Me ID : 123456" / "ID : 123456" / "identifiant N"
 *     (filet contextuel : on coupe la phrase complète, pas juste le numéro)
 *   - scrubPii() centralisé pour talk2me_id, email, IP, IBAN, CC, session token
 *
 * Volontairement plus permissif que le scrubber officiel : on accepte de
 * perdre l'info pour Léa, on ne veut pas qu'elle recopie.
 */
function sanitizeQuotedText(input: string): string {
  if (!input) return '';
  let out = input;
  // Filet contextuel — retire phrases entières mentionnant un ID
  out = out.replace(/^.*talk2me\s*id.*$/gim, '');
  out = out.replace(/^.*\b(id|identifiant)\s*[:#-]?\s*\d{4,8}\b.*$/gim, '');
  // Layer commun /lib/security/pii — scrub patterns centralisés
  out = scrubPii(out);
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/**
 * Construit le system prompt CONSCIENT du nom de l'IA. Inclut le contexte
 * conversation (peer + history + quoted message si présent).
 *
 * Doctrine [[talk2me-ia-personnelle-integree]] section "Ownership IA" :
 * "L'IA doit être CONSCIENTE de son nom : le nom courant est passé dans le
 * system prompt DeepSeek à chaque call. Si user change le nom, l'IA sait
 * son nouveau nom dès le prochain message."
 */

/**
 * Talk2Me #326 — Strip markdown résiduel après réponse DeepSeek (filet de
 * sécurité au cas où le modèle ignore l'instruction). Pas de remplacement
 * HTML, juste supprimer les marqueurs visibles.
 */
function stripMarkdown(text: string): string {
  if (!text) return text;
  let out = text;
  // Liens markdown [label](url) → label
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  // Gras **x** ou __x__ → x
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  // Italique *x* (mais pas ** déjà traité) → x
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
  // Italique _x_ (mais pas mots avec underscore au milieu type ai_name)
  out = out.replace(/(^|[\s.,!?;:])_([^_\n]+)_(?=[\s.,!?;:]|$)/g, '$1$2');
  // Headers en début de ligne
  out = out.replace(/^#{1,6}\s+/gm, '');
  // Code inline `x` → x
  out = out.replace(/`([^`\n]+)`/g, '$1');
  // Code blocks ```...```
  out = out.replace(/```[\s\S]*?```/g, '');
  return out;
}

// === MAPPING TOOL RESULTS → CARDS (mirror de /api/chat/route.ts) ===





// === Talk2Me #331 — Followup parsing & dispatcher ==========================

type FollowupSearchType =
  | 'youtube'
  | 'tiktok'
  | 'recipe'
  | 'place'
  | 'wikipedia'
  | 'weather'
  | 'product'
  | 'web';

interface FollowupSearchSpec {
  type: FollowupSearchType;
  query: string;
  trigger_phrase?: string;
}

function parseAssistantPayload(raw: string): {
  text: string;
  followup: FollowupSearchSpec | null;
} {
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
    if (!fs || typeof fs !== 'object') {
      return { text: text || raw.replace(/<json>[\s\S]*?<\/json>/i, '').trim(), followup: null };
    }
    const f = fs as Record<string, unknown>;
    if (
      typeof f.type !== 'string' ||
      !validTypes.includes(f.type as FollowupSearchType) ||
      typeof f.query !== 'string' ||
      !f.query.trim()
    ) {
      return { text, followup: null };
    }
    return {
      text,
      followup: {
        type: f.type as FollowupSearchType,
        query: (f.query as string).trim(),
        trigger_phrase:
          typeof f.trigger_phrase === 'string' && f.trigger_phrase.trim()
            ? (f.trigger_phrase as string).trim()
            : "À propos, j'ai trouvé une info qui pourrait t'intéresser :",
      },
    };
  } catch {
    return { text: raw.trim(), followup: null };
  }
}

function followupToToolCall(
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

/**
 * Lance la recherche follow-up async pour une conv P2P : persiste un 2e
 * message ai_reply avec card + trigger_phrase, broadcast SSE.
 */
async function runFollowupSearch(args: {
  convId: string;
  owner: DbUser;
  userMessageId: string;
  spec: FollowupSearchSpec;
  internalBaseUrl: string;
}): Promise<void> {
  const { convId, owner, userMessageId, spec, internalBaseUrl } = args;
  const call = followupToToolCall(spec);
  if (!call) return;
  const handler = HANDLERS[call.name];
  if (!handler) return;
  try {
    const result = await handler(call.args, { baseUrl: internalBaseUrl });
    const mapped = mapResultsToResponse([
      { name: call.name, args: call.args, result, callId: 'followup' },
    ]);
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
      console.log('[ai-reply/followup] no card, skip', spec.type);
      return;
    }
    const triggerText = spec.trigger_phrase || "À propos, j'ai trouvé une info qui pourrait t'intéresser :";
    const aiName = owner.ai_name || `T2M de ${owner.display_name || owner.username}`;
    const aiMessage = appendMessage(
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
      {
        kind: 'ai_reply',
        aiForUserId: owner.id,
        aiName,
        aiAvatarUrl: owner.ai_avatar_url || null,
        quotedMessageId: userMessageId,
        senderId: null,
      }
    );
    publish(`conv:${convId}`, {
      kind: 'chat',
      data: {
        id: aiMessage.id,
        conversation_id: convId,
        sender_id: null,
        ai_for_user_id: owner.id,
        ai_name: aiName,
        ai_avatar_url: owner.ai_avatar_url || null,
        kind: 'ai_reply',
        quoted_message_id: userMessageId,
        text: aiMessage.text,
        created_at: aiMessage.created_at,
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
    console.error('[ai-reply/followup] error', spec, e);
  }
}

function authorNameOf(msg: DbMessage, ownerId: string, peer: DbUser | null, ownerName: string, peerName: string): string {
  if (msg.kind === 'ai_reply') return msg.ai_name || 'IA';
  if (msg.sender_id === ownerId) return ownerName;
  if (peer && msg.sender_id === peer.id) return peerName;
  // Fallback : role
  return msg.role === 'agent' ? 'IA' : ownerName;
}

/**
 * Branche IA asynchrone : appelée après broadcast du message user. Persiste
 * un message kind='ai_reply' + broadcast SSE quand prêt. N'await pas la
 * route principale.
 */
async function runAiReply(args: {
  convId: string;
  owner: DbUser;
  peer: DbUser | null;
  userMessage: DbMessage;
  userText: string;
  quotedId: string | null;
  internalBaseUrl: string;
}): Promise<void> {
  const { convId, owner, peer, userMessage, userText, quotedId, internalBaseUrl } = args;

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.warn('[ai-reply] DEEPSEEK_API_KEY missing');
      return;
    }
    const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    // Résout quoted message si présent
    let quoted: { text: string; authorName: string } | null = null;
    if (quotedId) {
      const qm = getMessageById(quotedId);
      if (qm) {
        const ownerName = owner.display_name || owner.username;
        const peerName = peer ? peer.display_name || peer.username : 'interlocuteur';
        quoted = {
          // Talk2Me PII security (Pascal 2026-06-05) — sanitize le quoted
          // pour éviter que Léa recopie un talk2me_id / email / "Talk2Me ID :
          // 123456" mentionné par T2M Officiel dans un message antérieur.
          // Doctrine [[talk2me-pii-security]].
          text: sanitizeQuotedText(qm.text || ''),
          authorName: authorNameOf(qm, owner.id, peer, ownerName, peerName),
        };
      }
    }

    // Récupère 8 derniers messages (avant le message user actuel) pour contexte
    const recent = getRecentMessages(convId, 10).filter(
      (m) => m.id !== userMessage.id
    );
    const ownerName = owner.display_name || owner.username;
    const peerName = peer ? peer.display_name || peer.username : 'interlocuteur';
    const history = recent.map((m) => ({
      author: authorNameOf(m, owner.id, peer, ownerName, peerName),
      // Talk2Me PII security (Pascal 2026-06-05) — sanitize chaque entrée
      // d'historique avant injection prompt Léa. Évite recopie de PII via
      // contexte conversationnel. Doctrine [[talk2me-pii-security]].
      text: sanitizeQuotedText((m.text || '').slice(0, 400)),
    }));

    // Talk2Me #326 — Mémoire long terme du OWNER de l'IA strictement isolée.
    // Top 20 par weight DESC + recency. Jamais cross-user (isolation Pascal).
    const memories = getAiMemories(owner.id, 20);

    let systemPrompt = buildLeaSystemPrompt({ owner, peer, quoted, history, memories });

    // Talk2Me #414 (Pascal 2026-06-05) — Prompt builder contextuel.
    // Ajoute un addon ciblé (méta/identité/recherche/grounding) au prompt
    // existant. Doctrine [[feedback-modular-no-scattered-patches]].
    const ownerAiName =
      (owner.ai_name || '').trim() || `T2M de ${owner.display_name || owner.username}`;
    const promptAddon = buildLeaSystemPromptAddon({
      userMessage: userText || '',
      aiName: ownerAiName,
    });
    if (promptAddon) {
      systemPrompt = `${systemPrompt}\n\n${promptAddon}`;
    }

    const openai = new OpenAI({ apiKey, baseURL, timeout: 30000, maxRetries: 0 });

    const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ];

    // Round 1 — DeepSeek peut appeler des tools ou répondre directement.
    const round1 = await openai.chat.completions.create({
      model,
      messages: baseMessages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.5,
      max_tokens: 600,
    });
    recordLlmUsage(model, round1.usage, 'chat'); // instrumentation coûts LLM (tokens réels)

    const assistantMsg = round1.choices[0]?.message;
    let finalText = (assistantMsg?.content || '').toString().trim();
    const toolCalls = assistantMsg?.tool_calls || [];

    let mapped: MappedResponse = {};
    const execs: ToolCallExec[] = [];

    // Talk2Me #331 — Si pas de tool_call mais bloc <json> avec followup_search
    // → planifier l'exécution async de la recherche après broadcast du round 1.
    let followupSpec: FollowupSearchSpec | null = null;
    if (toolCalls.length === 0 && finalText) {
      const parsed = parseAssistantPayload(finalText);
      if (parsed.followup) {
        followupSpec = parsed.followup;
        finalText = parsed.text || finalText.replace(/<json>[\s\S]*?<\/json>/i, '').trim();
      } else if (finalText.includes('<json>')) {
        finalText = parsed.text || finalText.replace(/<json>[\s\S]*?<\/json>/i, '').trim();
      }
    }

    if (toolCalls.length > 0) {
      // Exécute les tools en parallèle
      // Talk2Me #418 — ctx enrichi pour les side-effect tools (start_game).
      const ctx = {
        baseUrl: internalBaseUrl,
        userId: owner.id,
        convId,
        convPeerId: peer?.id ?? null,
      };
      await Promise.all(
        toolCalls.map(async (tc) => {
          if (tc.type !== 'function') return;
          const fn = tc.function;
          if (!fn || typeof fn.name !== 'string') return;
          const handler = HANDLERS[fn.name];
          const toolArgs = safeParseArgs(fn.arguments);
          if (!handler) {
            execs.push({
              name: fn.name,
              args: toolArgs,
              callId: tc.id,
              result: { ok: false } as AnyToolResult,
            });
            return;
          }
          try {
            const result = await handler(toolArgs, ctx);
            execs.push({ name: fn.name, args: toolArgs, callId: tc.id, result });
          } catch (e) {
            console.error('[ai-reply] handler error', fn.name, e);
            execs.push({
              name: fn.name,
              args: toolArgs,
              callId: tc.id,
              result: { ok: false } as AnyToolResult,
            });
          }
        })
      );

      mapped = mapResultsToResponse(execs);

      // Doctrine cards-primauté : si une card riche EFFECTIVEMENT remplie,
      // on a déjà tout le visuel — round 2 inutile (sauf fetch_url_content
      // qui n'a pas de card). Une card "vide" (places=[], wikipedia=null,
      // etc.) ne compte PAS : il faut un texte de synthèse.
      const hasCardOutput =
        (mapped.youtube !== undefined && mapped.youtube !== null) ||
        mapped.placeSearch !== undefined ||
        (Array.isArray(mapped.places) && mapped.places.length > 0) ||
        (mapped.recipe !== undefined && mapped.recipe !== null) ||
        (mapped.wikipedia !== undefined && mapped.wikipedia !== null) ||
        (mapped.weather !== undefined && mapped.weather !== null) ||
        (Array.isArray(mapped.products) && mapped.products.length > 0) ||
        (mapped.web_search !== undefined && mapped.web_search !== null) ||
        (mapped.tiktok !== undefined && mapped.tiktok !== null); // Talk2Me search_tiktok (Pascal 2026-06-04)

      const needsTextSynthesis =
        execs.some((e) => e.name === 'fetch_url_content') || !hasCardOutput;

      if (needsTextSynthesis) {
        // Round 2 — synthèse texte basée sur les résultats tools.
        const functionToolCalls = toolCalls
          .filter((tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function')
          .map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments || '{}' },
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
            content: JSON.stringify(e.result).slice(0, 4000),
          })),
        ];
        try {
          const round2 = await openai.chat.completions.create({
            model,
            messages: round2Messages,
            temperature: 0.5,
            max_tokens: 400,
          });
          recordLlmUsage(model, round2.usage, 'chat'); // instrumentation coûts LLM
          const synth = (round2.choices[0]?.message?.content || '').toString().trim();
          if (synth) finalText = synth;
        } catch (e) {
          console.error('[ai-reply] round2 error', e);
        }
      } else {
        // Card produite : tais le texte si trop long (la card parle).
        if (finalText.length > 200) finalText = '';
      }
    }

    // Talk2Me #326 — Anti-markdown filet de sécurité (au cas où DeepSeek
    // ignore les instructions du system prompt).
    //
    // Talk2Me #414 (Pascal 2026-06-05) — Chaîne de scrubbers renforcée :
    //   1. stripMarkdownAggressive (plus strict que stripMarkdown legacy)
    //   2. scrubUserNameLeak        ("Je suis T2M de <name>" → "Je suis ton IA")
    //   3. scrubAnnonceRecherche    ("Je te cherche ça")
    //   4. scrubForbiddenPhrases    (phrase-level via consciousness.json)
    //   5. stripMarkdown legacy (kept en filet final pour compat)
    //   6. scrubPii (déjà appliqué plus bas)
    if (finalText) {
      const before = finalText;
      let out = stripMarkdownAggressive(finalText);
      out = scrubUserNameLeak(out, owner.display_name || owner.username || null);
      out = scrubAnnonceRecherche(out);
      out = scrubForbiddenPhrases(out);
      out = stripMarkdown(out).trim();
      if (out !== before) {
        console.log(
          '[ai-reply/scrubbers] cleaned',
          `owner=${owner.id}`,
          `before_len=${before.length}`,
          `after_len=${out.length}`,
        );
      }
      finalText = out;
    }

    // Talk2Me PII air-gap Layer 5 (Pascal 2026-06-05) — scrubber post-LLM
    // sur la réponse de Léa. Si DeepSeek ignore le prompt et leak un PII,
    // on REDACT. Doctrine [[talk2me-pii-air-gap]] : "doit refuser de la
    // transmettre". Le scrubber est un filet ultime — silence > leak.
    if (finalText) {
      const before = finalText;
      finalText = scrubPii(finalText);
      if (finalText !== before) {
        console.warn(
          '[ai-reply/pii-scrub] PII pattern scrubbed in Léa reply',
          `owner=${owner.id}`,
        );
      }
    }

    // Doctrine no-excuses : si vide ET pas de card EFFECTIVEMENT remplie →
    // on ne push rien (sinon bulle vide).
    const hasAnyCard =
      (mapped.youtube !== undefined && mapped.youtube !== null) ||
      (Array.isArray(mapped.places) && mapped.places.length > 0) ||
      (mapped.recipe !== undefined && mapped.recipe !== null) ||
      (mapped.wikipedia !== undefined && mapped.wikipedia !== null) ||
      (mapped.weather !== undefined && mapped.weather !== null) ||
      (Array.isArray(mapped.products) && mapped.products.length > 0) ||
      (mapped.web_search !== undefined && mapped.web_search !== null) ||
      (mapped.tiktok !== undefined && mapped.tiktok !== null); // Talk2Me search_tiktok (Pascal 2026-06-04)

    if (!finalText && !hasAnyCard) {
      console.log('[ai-reply] empty response + no card, skipping persistence');
      return;
    }

    // Debug logs
    if (execs.length > 0) {
      console.log(
        '[ai-reply/tools]',
        execs
          .map(
            (e) =>
              `${e.name}(${JSON.stringify(e.args).slice(0, 60)})→ok=${
                (e.result as { ok?: boolean }).ok
              }`
          )
          .join(' | ')
      );
    }

    // Persiste comme ai_reply AVEC les cards riches (youtube/places/recipe/etc)
    const aiName = owner.ai_name || `T2M de ${owner.display_name || owner.username}`;
    const aiMessage = appendMessage(
      convId,
      'agent',
      finalText,
      [],
      mapped.youtube === undefined ? undefined : mapped.youtube,
      mapped.places === undefined ? undefined : mapped.places,
      undefined, // requires_geoloc
      mapped.recipe === undefined ? undefined : mapped.recipe,
      mapped.products === undefined ? undefined : mapped.products,
      mapped.wikipedia === undefined ? undefined : mapped.wikipedia,
      mapped.weather === undefined ? undefined : mapped.weather,
      mapped.web_search === undefined ? undefined : mapped.web_search,
      mapped.tiktok === undefined ? undefined : mapped.tiktok,
      {
        kind: 'ai_reply',
        aiForUserId: owner.id,
        aiName,
        aiAvatarUrl: owner.ai_avatar_url || null,
        quotedMessageId: userMessage.id,
        senderId: null,
      }
    );

    publish(`conv:${convId}`, {
      kind: 'chat',
      data: {
        id: aiMessage.id,
        conversation_id: convId,
        sender_id: null,
        ai_for_user_id: owner.id,
        ai_name: aiName,
        ai_avatar_url: owner.ai_avatar_url || null,
        kind: 'ai_reply',
        quoted_message_id: userMessage.id,
        text: aiMessage.text,
        created_at: aiMessage.created_at,
        // Talk2Me #326 — Cards riches propagées via SSE
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

    // Talk2Me #331 — Followup async (Pascal 2026-06-04).
    // Doctrine [[talktome-conversation-avant-recherche]] : conversation
    // immédiate (round 1 ci-dessus) puis recherche enrichissante async qui
    // arrive ~1-3s plus tard sous forme d'une 2e bulle ai_reply.
    if (followupSpec) {
      void runFollowupSearch({
        convId,
        owner,
        userMessageId: aiMessage.id,
        spec: followupSpec,
        internalBaseUrl,
      }).catch((e) => console.error('[ai-reply/followup] error', e));
    }
  } catch (e) {
    console.error('[ai-reply] runAiReply error', e);
  }
}

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const conv = getConversation(id, me.id);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: {
    text?: unknown;
    quoted_message_id?: unknown;
    media?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  // Talk2Me média chat (Pascal 2026-06-04) — un message peut être :
  //  - texte seul (cas historique)
  //  - média seul (caption vide)
  //  - texte + média (caption)
  // Au moins l'un des deux est requis.
  let media: {
    url: string;
    type: 'image' | 'video' | 'audio';
    filename?: string | null;
    size?: number | null;
    mime?: string | null;
  } | null = null;
  if (body.media && typeof body.media === 'object') {
    const m = body.media as Record<string, unknown>;
    if (
      typeof m.url === 'string' &&
      m.url.trim() &&
      (m.type === 'image' || m.type === 'video' || m.type === 'audio')
    ) {
      media = {
        url: m.url.trim(),
        type: m.type,
        filename: typeof m.filename === 'string' ? m.filename : null,
        size: typeof m.size === 'number' ? m.size : null,
        mime: typeof m.mime === 'string' ? m.mime : null,
      };
    }
  }

  if (!text && !media) {
    return NextResponse.json({ error: 'text_or_media_required' }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: 'text_too_long' }, { status: 400 });
  }
  const quotedId =
    typeof body.quoted_message_id === 'string' && body.quoted_message_id.trim()
      ? body.quoted_message_id.trim()
      : null;

  if (conv.kind === 'agent') {
    return NextResponse.json(
      { error: 'use_chat_endpoint_for_agent_conv' },
      { status: 400 }
    );
  }

  // Récupère le user complet (ai_name + ai_avatar_url) — `me` est déjà DbUser
  // mais on relit pour s'assurer d'avoir la valeur la plus fraîche au cas où
  // user vient de renommer son IA.
  const owner = getUserById(me.id) || me;
  const peer =
    conv.kind === 'p2p'
      ? conv.participants.find((p) => p.id !== me.id) || null
      : null;
  const aiName = owner.ai_name || `T2M de ${owner.display_name || owner.username}`;

  // Apple Guideline 1.2 — blocage : si l'un a bloqué l'autre, on coupe la messagerie.
  if (peer && isBlockedEither(me.id, peer.id)) {
    return NextResponse.json({ error: 'blocked' }, { status: 403 });
  }

  // Détecte le tag IA
  const triggersAi = hasAiTag(text, aiName);

  // Persist message user avec sender_id + quoted_message_id + media éventuels
  const message = appendMessage(
    conv.id,
    'user',
    text,
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
    {
      kind: 'user',
      senderId: me.id,
      quotedMessageId: quotedId,
      media,
    }
  );

  // Broadcast SSE temps réel
  publish(`conv:${conv.id}`, {
    kind: 'chat',
    data: {
      id: message.id,
      conversation_id: conv.id,
      sender_id: me.id,
      sender_username: me.username,
      sender_display_name: me.display_name,
      text: message.text,
      created_at: message.created_at,
      quoted_message_id: quotedId,
      kind: 'user',
      media: message.media ?? null,
    },
  });

  // Notification push au destinataire (Pascal 2026-06-11). Best-effort.
  if (peer && peer.id !== me.id) {
    const senderName = me.display_name || me.username;
    const preview = (message.text || '').trim() || (media && media.length ? '📷 Photo' : 'Nouveau message');
    void sendPushToUser(peer.id, {
      title: senderName,
      body: preview.slice(0, 140),
      url: `/c/${conv.id}`,
      tag: `conv:${conv.id}`,
    }).catch(() => {});
  }

  // Talk2Me #379 — Routing T2M Officiel (Pascal 2026-06-05).
  // Doctrine [[talk2me-officiel-ia]] : si le peer est T2M Officiel, on route
  // vers le handler institutionnel (DB-only, ZÉRO tool externe). Pas
  // d'extraction passive habits, pas de buildConsciousness — court-circuite
  // tout le pipeline IA personnelle ci-dessous.
  //
  // Talk2Me #386 (Pascal 2026-06-05) — Anti-boucle 3 messages :
  // 1) Si le sender EST T2M Officiel (sender_id = T2M_OFFICIEL_USER_ID), on ne
  //    re-déclenche PAS T2M Officiel (sinon elle se répond à elle-même).
  // 2) Si le texte user tague l'IA PERSONNELLE de l'user (@T2M de <ownerName>),
  //    on PRIORITISE l'IA personnelle (runAiReply) au lieu de T2M Officiel.
  //    Pascal verbatim : "@T2M de Pascal.repir réponds" ne doit PAS faire
  //    re-répondre T2M Officiel.
  const senderIsOfficiel = me.id === T2M_OFFICIEL_USER_ID;
  const peerIsOfficiel = peer ? peer.id === T2M_OFFICIEL_USER_ID : false;
  if (peerIsOfficiel && !senderIsOfficiel && !triggersAi) {
    // Talk2Me #380 Phase 2-3 : on propage baseUrl pour que les handlers
    // enrichissent les posts avec UnifiedCard (via /api/embed-hub).
    const officielBaseUrl = new URL(request.url).origin;
    void runOfficielReply({
      convId: conv.id,
      senderUser: owner,
      userMessage: message,
      userText: text,
      officielAvatarUrl: peer!.avatar_url || null,
      baseUrl: officielBaseUrl,
    });
    return NextResponse.json({
      ok: true,
      message: {
        id: message.id,
        conversation_id: conv.id,
        sender_id: me.id,
        role: 'user',
        content: message.text,
        timestamp: message.created_at,
        quoted_message_id: quotedId,
        kind: 'user',
        media: message.media ?? null,
      },
      officiel_triggered: true,
    });
  }
  // Cas : peer = T2M Officiel ET user tague son IA perso → on tombe dans le
  // bloc triggersAi ci-dessous. T2M Officiel reste silencieuse (1 question = 1
  // réponse soit officielle soit perso, jamais les deux).

  // Si tag IA détecté → fork async branche DeepSeek
  if (triggersAi) {
    const port = process.env.PORT || '3010';
    // Talk2Me #326 — basePath retiré (next.config.ts), donc plus de /talktome
    // dans l'URL interne. Override via env si déploiement avec basePath.
    const internalBaseUrl =
      process.env.TALKTOME_INTERNAL_BASE_URL || `http://127.0.0.1:${port}`;
    // Pas d'await — la réponse HTTP retourne immédiatement, l'IA push via SSE.
    void runAiReply({
      convId: conv.id,
      owner,
      peer: peer as DbUser | null,
      userMessage: message,
      userText: text,
      quotedId,
      internalBaseUrl,
    });
  }

  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      conversation_id: conv.id,
      sender_id: me.id,
      role: 'user',
      content: message.text,
      timestamp: message.created_at,
      quoted_message_id: quotedId,
      kind: 'user',
      media: message.media ?? null,
    },
    ai_triggered: triggersAi,
  });
}
