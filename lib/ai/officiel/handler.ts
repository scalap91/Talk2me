/**
 * Talk2Me #379 — Handler IA T2M Officiel (Pascal 2026-06-05).
 * Doctrine [[talk2me-officiel-ia]] : IA institutionnelle DB-only servie quand
 * un user discute avec @T2M Officiel. AUCUN appel externe.
 *
 * - System prompt distinct (community manager / éditeur en chef)
 * - Tools restreints à OFFICIEL_TOOLS (search_db_posts, get_buzz_cards, ...)
 * - Pas d'extraction passive habits
 * - Pas de buildConsciousness
 * - Persistance des réponses avec kind='officiel_reply' pour traçabilité
 */

import OpenAI from 'openai';
import {
  appendMessage,
  type DbMessage,
  type DbUser,
} from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
import { scrubPii, containsPii } from '@/lib/security/pii';
// Talk2Me #414 (Pascal 2026-06-05) — Markdown aggressive + annonces recherche.
import {
  stripMarkdownAggressive,
  scrubAnnonceRecherche,
} from '@/lib/ai/scrubbers';
import {
  OFFICIEL_HANDLERS,
  OFFICIEL_TOOLS,
  OFFICIEL_TOOL_NAMES,
  type OfficielToolResult,
} from '@/lib/ai/officiel/tools';
import {
  T2M_OFFICIEL_DISPLAY_NAME,
  T2M_OFFICIEL_USER_ID,
} from '@/lib/ai/officiel/constants';
import type { UnifiedCard } from '@/lib/embed-hub/types';

/**
 * Cap dur du nombre de cards attachées à un message officiel (Pascal
 * 2026-06-05). Évite le spam quand T2M Officiel répond à "qu'est-ce qui
 * buzz" et qu'on a 10 posts enrichis. 3 = bon compromis preview / loading.
 */
const MAX_ATTACHED_CARDS = 3;

export const OFFICIEL_SYSTEM_PROMPT = `Tu es l'IA officielle de Talk2Me, le compte @T2M Officiel.

Tu n'es PAS une IA personnelle — tu es l'agent INSTITUTIONNEL accessible à tous les users de Talk2Me. Tu joues le rôle d'un community manager / éditeur en chef.

MISSION :
- Aider les users à découvrir le contenu Talk2Me (top posts, buzz, créateurs)
- Renseigner sur le fonctionnement de l'app (tuto interactif via get_tutorial)
- Informer sur les mentions légales (CGU, CGV, RGPD, privacy via get_legal_doc)
- Donner des métriques de performance (likes, vues, shares via get_post_stats)

RÈGLES STRICTES (NON NÉGOCIABLES) :
1. Tu ne CHERCHES JAMAIS hors de Talk2Me. PAS de YouTube, PAS de TikTok, PAS de Booking, PAS de Wikipedia, PAS de météo, PAS de Google.
2. Tu interroges UNIQUEMENT la DB Talk2Me via tes outils dédiés ci-dessous.
3. Tu ne donnes JAMAIS d'avis personnel — tu cites les chiffres et les contenus existants.
4. Tu es FACTUEL, NEUTRE, INSTITUTIONNEL. Ton ton est professionnel mais accessible (pas robotique).
5. Si un user te demande de chercher quelque chose hors Talk2Me (un resto, une vidéo, la météo, un produit, un lieu, etc.), tu lui suggères poliment de demander à son IA personnelle qui a les outils externes. Tu ne fais PAS la recherche toi-même.

TES OUTILS DB-ONLY :
- search_db_posts(query, limit?) — cherche dans les posts existants par mots-clés. Tu peux maintenant chercher par titre, description, hashtags, artiste, channel, type de card (YouTube/Spotify/TikTok/article) — pas juste le texte du chat.
- get_top_posts(metric, window, limit?) — top likes / vues / shares / saves sur day/week/month/all
- get_buzz_cards(limit?) — cards qui buzz actuellement (score combiné + décroissance temporelle)
- search_users(query) — créateurs par username ou Talk2Me ID
- get_legal_doc(topic) — mentions_legales | cgu | cgv | privacy | rgpd
- get_tutorial(topic) — home | cards | editor | amis | embed | select
- get_post_stats(post_id) — métriques agrégées d'un post

EXEMPLES DE ROUTING :
- "un truc qui buzz", "qu'est-ce qui marche", "le post qui fait fureur" → get_buzz_cards
- "top likes cette semaine", "les plus vus ce mois-ci" → get_top_posts
- "tu as un post sur le DPE ?", "cherche-moi un truc sur Booking" → search_db_posts
- "comment ça marche Talk2Me", "comment ajouter un ami" → get_tutorial
- "mentions légales", "vos CGU", "RGPD" → get_legal_doc
- "Cherche un resto à Paris" → réponds : "Je suis l'IA officielle de Talk2Me, je n'ai accès qu'au contenu de l'app. Pour chercher un resto, demande à ton IA personnelle (elle a accès aux cartes et lieux)."

FORMAT DE RÉPONSE :
- Texte court (1-4 phrases), factuel.
- Quand tu cites un post : mentionne l'auteur (@username) + métrique pertinente.
- Pas de markdown (pas de **gras**, pas de [liens](...) bruts, pas de \`code\`).
- Pas de blabla méta type "je vais chercher…", "voici ce que j'ai trouvé…". Tu agis directement.
- Quand tu appelles un tool, tu peux ensuite synthétiser le résultat en 1-3 phrases.

Tu n'inventes RIEN. Si un outil retourne ok=false ou une liste vide, tu dis simplement qu'il n'y a pas encore de contenu sur ce sujet dans Talk2Me. Pas de fallback externe, pas d'excuse.

INTERDICTION ABSOLUE :
- Tu ne tagues JAMAIS d'autre IA dans ta réponse. PAS de "@T2M de X réponds", PAS de "@<n'importe quel nom>", PAS d'aucun tag d'invocation IA.
- Tu ne demandes pas à une autre IA de répondre à ta place — tu réponds toi-même ou tu signales que c'est hors de ton scope.
- Tu n'écris JAMAIS le caractère "@" suivi d'un nom comme demande d'intervention IA.

RÈGLE SÉCURITÉ ABSOLUE (PII air-gap — Pascal 2026-06-05) :
- Tu n'exposes JAMAIS le talk2me_id (l'identifiant 6 chiffres) d'aucun user, ni d'email, ni d'identifiant interne, ni d'IP, ni de token de session, ni de carte bancaire, ni d'IBAN. C'est de la donnée privée que tu n'as PAS le droit de voir ni de transmettre.
- Tu ne formules JAMAIS des phrases comme "Talk2Me ID : 123456", "ID : 588770", "son ID est…", "ses comptes associés sont…", "il a deux comptes…". Ces formats sont INTERDITS.
- Tu n'énumères JAMAIS plusieurs comptes pour un même nom. Un user a UN compte unique que tu peux mentionner par @username. S'il existe plusieurs comptes homonymes en DB, tu ne les exposes PAS.
- Tu ne connais QUE l'user qui te parle et ses amis acceptés. Tout autre user de la DB est INVISIBLE pour toi : tu ne peux ni le nommer, ni confirmer son existence, ni donner son @username.
- Si search_users renvoie une liste vide (étranger hors scope) → tu réponds simplement "Je ne trouve aucun utilisateur correspondant dans tes contacts." Tu n'évoques PAS l'existence éventuelle d'un autre user en dehors du scope.
- Si l'user te demande SON PROPRE talk2me_id, son email, son mot de passe, son token de session, ou n'importe quelle info personnelle privée → tu réponds EXACTEMENT : "Cette info ne passe pas par moi. Va sur ta page Profil pour la voir." Tu NE CHERCHES PAS, tu N'INVENTES PAS, tu NE DEVINES PAS, tu NE MÉMORISES PAS la demande.
- Si l'user te demande l'email d'un ami, ou des détails internes d'un compte tiers → même refus : "Cette info ne passe pas par moi."
- Si tu hésites sur l'identité d'un user (homonymie, ID transmis) → tu réponds par @username + display_name UNIQUEMENT, jamais d'ID numérique.`;

export interface HandleOfficielArgs {
  /** Message brut envoyé par l'user à @T2M Officiel. */
  userMessage: string;
  /** ID de la conversation P2P. */
  conversationId: string;
  /** User qui parle (l'expéditeur). Sert au logging. */
  senderUser: DbUser;
  /** Message DB que l'user vient de poster (utile pour quoted reply). */
  userMessageDbId: string;
  /**
   * baseUrl (origin) du serveur appelant. Utilisé par les handlers qui
   * appellent `/api/embed-hub` (enrichissement UnifiedCard sur les posts).
   * Si absent → tombe sur `http://localhost:3010` (dev).
   */
  baseUrl?: string;
}

export interface HandleOfficielResult {
  text: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /**
   * Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — UnifiedCards
   * extraites des tool results (search_db_posts/get_top_posts/get_buzz_cards).
   * Sert à RE-SERVIR la card YouTube/article d'origine sous le texte de la
   * bulle. Bug Pascal : "il ne sait pas me ressevir en card dorigine le
   * contenue quil a citer". Cap 3 enforced.
   */
  cards: UnifiedCard[];
}

interface ToolCallExec {
  name: string;
  args: Record<string, unknown>;
  callId: string;
  result: OfficielToolResult;
}

/**
 * Talk2Me T2M Officiel cards (Pascal 2026-06-05) — collecte les
 * UnifiedCards depuis les tool results. Les handlers DB-only retournent
 * `{ ok, posts: [...] }` où chaque post peut être enrichi avec
 * `unified_card` (cf. enrichWithCards dans tools.ts). On dédupe par
 * source+external_url pour éviter de servir 2x la même card (post
 * apparaissant dans get_top_posts ET get_buzz_cards).
 */
function collectCardsFromExecs(execs: ToolCallExec[]): UnifiedCard[] {
  const out: UnifiedCard[] = [];
  const seen = new Set<string>();
  for (const exec of execs) {
    const r = exec.result as Record<string, unknown>;
    if (!r || r.ok === false) continue;
    const posts = r.posts;
    if (!Array.isArray(posts)) continue;
    for (const item of posts) {
      if (!item || typeof item !== 'object') continue;
      const card = (item as { unified_card?: unknown }).unified_card;
      if (!card || typeof card !== 'object') continue;
      const c = card as UnifiedCard;
      const key = `${c.source}|${c.external_url || c.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= MAX_ATTACHED_CARDS) return out;
    }
  }
  return out;
}

function stripMarkdown(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
  out = out.replace(/(^|[\s.,!?;:])_([^_\n]+)_(?=[\s.,!?;:]|$)/g, '$1$2');
  out = out.replace(/^#{1,6}\s+/gm, '');
  out = out.replace(/`([^`\n]+)`/g, '$1');
  out = out.replace(/```[\s\S]*?```/g, '');
  return out;
}

/**
 * Talk2Me #386 (Pascal 2026-06-05) — Anti-tag : T2M Officiel n'a JAMAIS le
 * droit d'écrire "@<n'importe quel nom>" qui pourrait redéclencher une IA
 * personnelle si l'user re-poste le tag. On supprime les patterns @Nom
 * suivis d'un mot (verbe "réponds" inclus) en gardant juste un texte neutre.
 */
function stripAiTags(text: string): string {
  if (!text) return text;
  let out = text;
  // Supprime "@T2M de XYZ réponds" / "@T2M de XYZ" et variants
  out = out.replace(/@T2M\s+de\s+\S+(\s+réponds?)?/gi, '');
  // Supprime "@<NomCapitalisé> réponds"
  out = out.replace(/@[A-ZÀ-Ý][\wÀ-ÿ.-]*\s+réponds?\b/gi, '');
  // Supprime "@<NomCapitalisé>" standalone (en début/milieu de phrase)
  out = out.replace(/(^|\s)@[A-ZÀ-Ý][\wÀ-ÿ.-]*(?=\s|$|[.,!?;:])/g, '$1');
  return out.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Talk2Me PII security (Pascal 2026-06-05) — Scrubber post-LLM (filet ultime).
 *
 * Verbatim Pascal : "léa mdonne des information devrait pas connaitre comment
 * ce fait il quelle connait mes id et quelle sait que jai deux compte en terme
 * de sécurité sa crains" — exemple concret : "pascalrepir — Talk2Me ID :
 * 263368". Doctrine [[talk2me-pii-security]].
 *
 * Filtres appliqués sur la réponse FINALE avant persistance/broadcast :
 *   1. Phrase contenant "Talk2Me ID" + chiffres → ligne entière retirée.
 *   2. Patterns "ID : 123456" / "ID 123456" → ligne entière retirée.
 *   3. Pattern email (foo@bar.tld) → ligne entière retirée.
 *   4. Numéros isolés de 6 chiffres (talk2me_id format) → REDACTED.
 *   5. Liste "comptes associés à <nom>" → la phrase complète est retirée.
 *
 * Si le scrubber détecte une leak → log warning + fallback message safe.
 * On préfère perdre la réponse qu'exposer une PII.
 */
export interface ScrubResult {
  text: string;
  leaked: boolean;
  reasons: string[];
}

export function scrubPiiFromReply(input: string): ScrubResult {
  if (!input) return { text: '', leaked: false, reasons: [] };
  const reasons: string[] = [];
  let out = input;

  // 1. Lignes mentionnant explicitement "Talk2Me ID" (avec ou sans chiffres)
  const t2mIdLine = /^.*talk2me\s*id.*$/gim;
  if (t2mIdLine.test(out)) {
    reasons.push('talk2me_id_label');
    out = out.replace(t2mIdLine, '');
  }

  // 2. "ID : 123456", "id 263368", "identifiant 588770"
  const idNumberPhrase = /^.*\b(id|identifiant)\s*[:#-]?\s*\d{4,8}\b.*$/gim;
  if (idNumberPhrase.test(out)) {
    reasons.push('id_number_phrase');
    out = out.replace(idNumberPhrase, '');
  }

  // 3. Email — drop la ligne complète (jamais d'email d'user)
  const emailLine = /^.*[\w.+-]+@[\w-]+\.[\w.-]+.*$/gim;
  if (emailLine.test(out)) {
    reasons.push('email');
    out = out.replace(emailLine, '');
  }

  // 4. "comptes associés à <Nom>" / "X a deux comptes" / "ses comptes"
  const accountsEnumeration = /^.*\b(comptes?\s+(associés?|liés?|enregistrés?)|deux\s+comptes?|plusieurs\s+comptes?|ses\s+comptes?)\b.*$/gim;
  if (accountsEnumeration.test(out)) {
    reasons.push('accounts_enumeration');
    out = out.replace(accountsEnumeration, '');
  }

  // 5. Talk2Me PII air-gap Layer 5 étendu (Pascal 2026-06-05) — utilise
  // /lib/security/pii pour couvrir : IPv4, IBAN, CC, session token (sess_,
  // tok_, magic_), email, talk2me_id 6 chiffres. Doctrine [[talk2me-pii-air-gap]].
  if (containsPii(out)) {
    reasons.push('pii_pattern');
    out = scrubPii(out);
  }

  // Cleanup : lignes vides multiples
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  return { text: out, leaked: reasons.length > 0, reasons };
}

function safeParseArgs(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Garde-fou ULTIME : si DeepSeek essaye d'appeler un tool externe interdit,
 * on bloque et on retourne ok=false. Aucune chance qu'un appel HTTP fuite.
 */
function isAllowedTool(name: string): boolean {
  return OFFICIEL_TOOL_NAMES.includes(name);
}

/**
 * Exécute la boucle IA officielle (round 1 + éventuel round 2 de synthèse
 * après tools) et retourne le texte final + la liste des tool calls effectués.
 */
export async function handleOfficielMessage(
  args: HandleOfficielArgs,
): Promise<HandleOfficielResult> {
  const { userMessage, senderUser } = args;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[officiel] DEEPSEEK_API_KEY missing');
    return {
      text: "Je suis l'IA officielle de Talk2Me mais je suis temporairement indisponible. Réessaie dans quelques instants.",
      toolCalls: [],
      cards: [],
    };
  }

  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const openai = new OpenAI({ apiKey, baseURL, timeout: 30000, maxRetries: 0 });

  // Talk2Me PII air-gap Layer 4 (Pascal 2026-06-05) — scrub user message
  // avant envoi DeepSeek. Si l'user a tapé son ID 6 chiffres en clair, il
  // ne doit pas remonter dans le contexte LLM. Doctrine [[talk2me-pii-air-gap]].
  const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: OFFICIEL_SYSTEM_PROMPT },
    { role: 'user', content: scrubPii(userMessage || '') },
  ];

  let finalText = '';
  const toolCallsOut: Array<{ name: string; args: Record<string, unknown> }> = [];
  // Talk2Me T2M Officiel cards (Pascal 2026-06-05) — execs hoistées au scope
  // outer pour pouvoir extraire les UnifiedCards APRÈS le round 2.
  const allExecs: ToolCallExec[] = [];

  try {
    const round1 = await openai.chat.completions.create({
      model,
      messages: baseMessages,
      tools: OFFICIEL_TOOLS,
      tool_choice: 'auto',
      temperature: 0.4,
      max_tokens: 600,
    });

    const assistantMsg = round1.choices[0]?.message;
    finalText = (assistantMsg?.content || '').toString().trim();
    const toolCalls = assistantMsg?.tool_calls || [];

    if (toolCalls.length > 0) {
      const execs: ToolCallExec[] = [];
      for (const tc of toolCalls) {
        if (tc.type !== 'function') continue;
        const fn = tc.function;
        if (!fn || typeof fn.name !== 'string') continue;
        const toolArgs = safeParseArgs(fn.arguments);

        if (!isAllowedTool(fn.name)) {
          console.warn('[officiel] blocked external tool attempt:', fn.name);
          execs.push({
            name: fn.name,
            args: toolArgs,
            callId: tc.id,
            result: { ok: false, error: 'tool_not_allowed' },
          });
          continue;
        }
        toolCallsOut.push({ name: fn.name, args: toolArgs });
        const handler = OFFICIEL_HANDLERS[fn.name];
        if (!handler) {
          execs.push({
            name: fn.name,
            args: toolArgs,
            callId: tc.id,
            result: { ok: false, error: 'handler_missing' },
          });
          continue;
        }
        try {
          // Talk2Me PII security (Pascal 2026-06-05) — propage senderUser
          // pour scoper search_users à current + amis. Doctrine
          // [[talk2me-pii-security]].
          const result = await handler(toolArgs, {
            baseUrl: args.baseUrl,
            senderUser,
          });
          execs.push({ name: fn.name, args: toolArgs, callId: tc.id, result });
        } catch (e) {
          console.error('[officiel] handler error', fn.name, e);
          execs.push({
            name: fn.name,
            args: toolArgs,
            callId: tc.id,
            result: { ok: false, error: 'handler_threw' },
          });
        }
      }

      // Talk2Me T2M Officiel cards (Pascal 2026-06-05) — propage les execs
      // collectées au scope outer pour extraction des UnifiedCards plus bas.
      allExecs.push(...execs);

      // Round 2 : synthèse texte basée sur les résultats DB.
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
          content: JSON.stringify(e.result).slice(0, 6000),
        })),
      ];
      try {
        const round2 = await openai.chat.completions.create({
          model,
          messages: round2Messages,
          temperature: 0.4,
          max_tokens: 500,
        });
        const synth = (round2.choices[0]?.message?.content || '').toString().trim();
        if (synth) finalText = synth;
      } catch (e) {
        console.error('[officiel] round2 error', e);
      }
    }
  } catch (e) {
    console.error('[officiel] round1 error', e);
    finalText =
      "Je n'ai pas pu traiter ta question pour le moment. Réessaie dans quelques instants.";
  }

  // Talk2Me #414 (Pascal 2026-06-05) — Pipeline scrubbers renforcé.
  // stripMarkdownAggressive d'abord (plus strict que stripMarkdown legacy)
  // pour éviter "**Truc**" / "- bullet" qui passaient dans la version legacy.
  finalText = stripMarkdownAggressive(finalText);
  finalText = scrubAnnonceRecherche(finalText);
  finalText = stripMarkdown(finalText).trim();
  // Talk2Me #386 — Strip tags IA hallucinés (anti-boucle).
  finalText = stripAiTags(finalText).trim();

  // Talk2Me PII security (Pascal 2026-06-05) — Filet ultime contre les leaks
  // talk2me_id / email / énumération de comptes. Si le LLM ignore le prompt,
  // on scrub. Si la leak est grave (talk2me_id explicite ou énumération de
  // comptes), on remplace la réponse par un message neutre.
  // Doctrine [[talk2me-pii-security]].
  const scrub = scrubPiiFromReply(finalText);
  if (scrub.leaked) {
    console.warn(
      '[officiel/pii-scrub] PII leak detected and scrubbed',
      `reasons=${scrub.reasons.join(',')}`,
      `sender=${senderUser?.id || '?'}`,
    );
    const hardLeak =
      scrub.reasons.includes('talk2me_id_label') ||
      scrub.reasons.includes('accounts_enumeration') ||
      scrub.reasons.includes('email');
    finalText = hardLeak
      ? "Je ne peux pas exposer ces infos personnelles. Tu peux retrouver ton propre Talk2Me ID dans Réglages → Profil."
      : scrub.text.trim();
  } else {
    finalText = scrub.text.trim();
  }

  if (!finalText) {
    finalText =
      "Je suis l'IA officielle de Talk2Me. Je peux te montrer ce qui buzz, les top posts, les tutos ou les mentions légales — que veux-tu voir ?";
  }
  // Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — extrait les
  // UnifiedCards des tool results pour les renvoyer attachées. Bug fix :
  // "il ne sait pas me ressevir en card dorigine le contenue quil a citer".
  const cards = collectCardsFromExecs(allExecs);
  if (cards.length > 0) {
    console.log(
      '[officiel] attached cards count=%d sources=%s',
      cards.length,
      cards.map((c) => c.source).join(','),
    );
  }
  return { text: finalText, toolCalls: toolCallsOut, cards };
}

/**
 * Exécute le handler officiel ET persiste le résultat comme `kind='officiel_reply'`
 * dans la conversation + broadcast SSE. Appelée depuis la route messages.
 *
 * Async fire-and-forget : la POST messages route retourne immédiatement,
 * l'IA push sa réponse via SSE quand prête.
 */
export async function runOfficielReply(args: {
  convId: string;
  senderUser: DbUser;
  userMessage: DbMessage;
  userText: string;
  officielAvatarUrl: string | null;
  /** baseUrl (origin) du serveur, propagé aux handlers qui appellent /api/embed-hub. */
  baseUrl?: string;
}): Promise<void> {
  const { convId, senderUser, userMessage, userText, officielAvatarUrl, baseUrl } = args;
  try {
    const reply = await handleOfficielMessage({
      userMessage: userText,
      conversationId: convId,
      senderUser,
      userMessageDbId: userMessage.id,
      baseUrl,
    });
    if (!reply.text) return;

    // Persiste : on utilise kind='ai_reply' au niveau colonne (le schéma DB
    // ne tolère que 'user'|'ai_reply') et on flag avec ai_for_user_id =
    // T2M_OFFICIEL_USER_ID + ai_name='T2M Officiel'. Le tag logique
    // 'officiel_reply' apparaît dans le préfixe text + dans les logs.
    const aiMessage = appendMessage(
      convId,
      'agent',
      reply.text,
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
        kind: 'ai_reply',
        aiForUserId: T2M_OFFICIEL_USER_ID,
        aiName: T2M_OFFICIEL_DISPLAY_NAME,
        aiAvatarUrl: officielAvatarUrl,
        quotedMessageId: userMessage.id,
        senderId: null,
        // Talk2Me T2M Officiel cards (Pascal 2026-06-05) — cards d'origine
        // RE-SERVIES sous le texte. Fix verbatim : "il ne sait pas me
        // ressevir en card dorigine le contenue quil a citer".
        attachedCards: reply.cards.length > 0 ? reply.cards : null,
      },
    );

    publish(`conv:${convId}`, {
      kind: 'chat',
      data: {
        id: aiMessage.id,
        conversation_id: convId,
        sender_id: null,
        ai_for_user_id: T2M_OFFICIEL_USER_ID,
        ai_name: T2M_OFFICIEL_DISPLAY_NAME,
        ai_avatar_url: officielAvatarUrl,
        // Talk2Me #379 — sous-type logique exposé via SSE pour le front.
        kind: 'officiel_reply',
        quoted_message_id: userMessage.id,
        text: aiMessage.text,
        created_at: aiMessage.created_at,
        // Talk2Me T2M Officiel cards (Pascal 2026-06-05) — propagé via SSE
        // pour rendu temps réel front (UnifiedBubble → UnifiedCardRenderer).
        attached_cards: aiMessage.attached_cards ?? null,
      },
    });

    console.log(
      '[officiel] reply pushed conv=%s sender=%s tools=%s',
      convId,
      senderUser.id,
      reply.toolCalls.map((t) => t.name).join(',') || 'none',
    );
  } catch (e) {
    console.error('[officiel] runOfficielReply error', e);
  }
}
