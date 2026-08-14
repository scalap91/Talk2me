/**
 * /api/cards/editor/chat — IA personnelle en MODE ÉDITEUR DE CARD.
 *
 * Doctrine [[talk2me-card-editor-ia]] :
 *   - Compétences GELÉES : pas de search_web/youtube/recipe/place/etc.
 *   - Tools dédiés : edit_image_crop, edit_image_filter, edit_image_add_text,
 *     edit_image_remove_text, edit_image_move_text, generate_title,
 *     generate_description, generate_hashtags
 *   - Hors-sujet → recentre sur la card
 *   - Mémoire user injectée (isolation [[talktome-ia-persistance-isolation]])
 *
 * Le serveur N'APPLIQUE PAS les ops sur le draft (le draft vit côté client
 * via Zustand). Le serveur retourne :
 *   { text, ops: [{ tool: 'edit_image_crop', args: { ratio: 'vertical' } }, …] }
 * et le client applique chaque op via le store.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getAiMemories } from '@/lib/db';
import { getRequestMode, getModeLabel } from '@/lib/ai/mode-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// --- Types --------------------------------------------------------

type CropRatio = 'square' | 'vertical' | 'horizontal' | 'original';
type FilterKind = 'auto' | 'bright' | 'warm' | 'cold' | 'soft';
type TextPos = 'top' | 'center' | 'bottom';

interface DraftSnapshot {
  type: 'image' | 'video';
  crop: string;
  filter: string;
  texts: Array<{
    id: string;
    content: string;
    position: string;
    start_s?: number | null;
    end_s?: number | null;
  }>;
  title: string;
  description: string;
  hashtags: string[];
  // Vidéo
  duration_s?: number | null;
  trim?: { start_s: number; end_s: number } | null;
  cover_time_s?: number | null;
}

interface EditorOp {
  tool: string;
  args: Record<string, unknown>;
  /** Texte décrivant ce qui a été fait (affiché à l'user). */
  label: string;
  /** Résultat éventuel (titre, description, hashtags). */
  result?: unknown;
}

// --- Tools (function calling DeepSeek) ----------------------------

/** Tools image (utilisés si draft.type === 'image'). */
const IMAGE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'edit_image_crop',
      description: 'Recadre l\'image au ratio demandé.',
      parameters: {
        type: 'object',
        properties: {
          ratio: {
            type: 'string',
            enum: ['square', 'vertical', 'horizontal', 'original'],
            description: 'square=1:1, vertical=9:16, horizontal=16:9, original=ratio source.',
          },
        },
        required: ['ratio'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_image_filter',
      description: 'Applique un filtre prédéfini.',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            enum: ['auto', 'bright', 'warm', 'cold', 'soft'],
          },
        },
        required: ['filter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_image_add_text',
      description: 'Ajoute un texte overlay sur l\'image.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Texte à afficher (max 60 chars).' },
          position: {
            type: 'string',
            enum: ['top', 'center', 'bottom'],
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_image_remove_text',
      description: 'Supprime un texte overlay par son id.',
      parameters: {
        type: 'object',
        properties: {
          text_id: { type: 'string' },
        },
        required: ['text_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_image_move_text',
      description: 'Déplace un texte overlay.',
      parameters: {
        type: 'object',
        properties: {
          text_id: { type: 'string' },
          position: {
            type: 'string',
            enum: ['top', 'center', 'bottom'],
          },
        },
        required: ['text_id', 'position'],
      },
    },
  },
];

/** Tools vidéo (utilisés si draft.type === 'video'). */
const VIDEO_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'edit_video_trim',
      description: 'Définit un découpage (trim) de la vidéo entre start_s et end_s (en secondes, dans la timeline source).',
      parameters: {
        type: 'object',
        properties: {
          start_s: { type: 'number', minimum: 0 },
          end_s: { type: 'number', minimum: 0 },
        },
        required: ['start_s', 'end_s'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_video_clear_trim',
      description: 'Annule un trim existant et revient à la vidéo complète.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_video_cover',
      description: 'Définit la frame de couverture (cover) extraite à time_s (en secondes, dans la vidéo finale, post-trim si présent).',
      parameters: {
        type: 'object',
        properties: {
          time_s: { type: 'number', minimum: 0 },
        },
        required: ['time_s'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_video_add_text',
      description: 'Ajoute un texte overlay sur la vidéo. Position au choix (top/center/bottom). Optionnel : durée d\'affichage start_s/end_s (en secondes, dans la vidéo finale).',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Texte (max 60 chars).' },
          position: { type: 'string', enum: ['top', 'center', 'bottom'] },
          start_s: { type: 'number', minimum: 0 },
          end_s: { type: 'number', minimum: 0 },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_video_remove_text',
      description: 'Supprime un texte overlay par son id.',
      parameters: {
        type: 'object',
        properties: { text_id: { type: 'string' } },
        required: ['text_id'],
      },
    },
  },
];

/** Tools communs (génération de métadonnées, valides pour image + vidéo). */
const META_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'generate_title',
      description: 'Génère un titre court (1 ligne, max 60 chars) pour la card.',
      parameters: {
        type: 'object',
        properties: {
          hint: { type: 'string', description: 'Indication user éventuelle.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_description',
      description: 'Génère une description pour la card.',
      parameters: {
        type: 'object',
        properties: {
          length: { type: 'string', enum: ['short', 'long'] },
          hint: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_hashtags',
      description: 'Génère des hashtags pertinents pour la card (3 à 12).',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'integer', minimum: 3, maximum: 12 },
          hint: { type: 'string' },
        },
      },
    },
  },
];

// --- Helpers ------------------------------------------------------

function safeParseArgs(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function clampStr(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  return v.slice(0, max);
}

function asEnum<T extends string>(v: unknown, values: readonly T[]): T | null {
  return typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : null;
}

// Sub-call DeepSeek très court pour générer titre/description/hashtags.
async function subGenerate(
  client: OpenAI,
  model: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const r = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'Tu génères du contenu court et naturel pour une card sociale. Réponds UNIQUEMENT par le contenu demandé, sans préambule, sans markdown, sans guillemets.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: maxTokens,
  });
  return (r.choices[0]?.message?.content || '').toString().trim();
}

function buildContextLine(draft: DraftSnapshot): string {
  const bits: string[] = [];
  if (draft.title) bits.push(`titre actuel: "${draft.title}"`);
  if (draft.description) bits.push(`description actuelle: "${draft.description.slice(0, 140)}"`);
  if (draft.texts.length > 0) {
    bits.push(
      `textes posés: ${draft.texts
        .map((t) => {
          const range =
            typeof t.start_s === 'number' || typeof t.end_s === 'number'
              ? ` [${typeof t.start_s === 'number' ? t.start_s.toFixed(1) : '0'}s→${
                  typeof t.end_s === 'number' ? t.end_s.toFixed(1) + 's' : 'fin'
                }]`
              : '';
          return `id=${t.id}: "${t.content.slice(0, 30)}"${range}`;
        })
        .join(', ')}`
    );
  }
  if (draft.type === 'image') {
    if (draft.crop && draft.crop !== 'original') bits.push(`crop: ${draft.crop}`);
    if (draft.filter && draft.filter !== 'none') bits.push(`filtre: ${draft.filter}`);
  } else {
    if (typeof draft.duration_s === 'number' && draft.duration_s > 0) {
      bits.push(`durée source: ${draft.duration_s.toFixed(1)}s`);
    }
    if (draft.trim) {
      bits.push(
        `trim: ${draft.trim.start_s.toFixed(1)}s → ${draft.trim.end_s.toFixed(1)}s (${(
          draft.trim.end_s - draft.trim.start_s
        ).toFixed(1)}s)`
      );
    }
    if (typeof draft.cover_time_s === 'number') {
      bits.push(`cover @${draft.cover_time_s.toFixed(1)}s`);
    }
  }
  if (draft.hashtags.length > 0) bits.push(`hashtags: ${draft.hashtags.map((h) => `#${h}`).join(' ')}`);
  return bits.length > 0 ? bits.join(' | ') : '(card vide pour l\'instant)';
}

// --- Handler ------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const me = getCurrentUserFromRequest(request);
    if (!me) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    if (!apiKey) {
      return NextResponse.json(
        { text: 'Erreur de configuration : clé API manquante.', ops: [] },
        { status: 200 }
      );
    }

    let body: {
      message?: unknown;
      draft?: unknown;
      history?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const message = clampStr(body.message, 500);
    if (!message.trim()) {
      return NextResponse.json({ error: 'message_required' }, { status: 400 });
    }

    const rawDraft = body.draft as Partial<DraftSnapshot> | undefined;
    const rawTrim = (rawDraft as any)?.trim;
    const safeTrim =
      rawTrim &&
      typeof rawTrim === 'object' &&
      typeof rawTrim.start_s === 'number' &&
      typeof rawTrim.end_s === 'number' &&
      rawTrim.end_s > rawTrim.start_s
        ? { start_s: rawTrim.start_s, end_s: rawTrim.end_s }
        : null;
    const draft: DraftSnapshot = {
      type: rawDraft?.type === 'video' ? 'video' : 'image',
      crop: typeof rawDraft?.crop === 'string' ? rawDraft.crop : 'original',
      filter: typeof rawDraft?.filter === 'string' ? rawDraft.filter : 'none',
      texts: Array.isArray(rawDraft?.texts)
        ? rawDraft!.texts.slice(0, 10).map((t: any) => ({
            id: typeof t?.id === 'string' ? t.id : '',
            content: typeof t?.content === 'string' ? t.content.slice(0, 60) : '',
            position: typeof t?.position === 'string' ? t.position : 'center',
            start_s: typeof t?.start_s === 'number' ? t.start_s : null,
            end_s: typeof t?.end_s === 'number' ? t.end_s : null,
          }))
        : [],
      title: typeof rawDraft?.title === 'string' ? rawDraft.title.slice(0, 80) : '',
      description: typeof rawDraft?.description === 'string'
        ? rawDraft.description.slice(0, 400)
        : '',
      hashtags: Array.isArray(rawDraft?.hashtags)
        ? (rawDraft!.hashtags as unknown[])
            .filter((x): x is string => typeof x === 'string')
            .slice(0, 15)
        : [],
      duration_s:
        typeof (rawDraft as any)?.duration_s === 'number'
          ? (rawDraft as any).duration_s
          : null,
      trim: safeTrim,
      cover_time_s:
        typeof (rawDraft as any)?.cover_time_s === 'number'
          ? (rawDraft as any).cover_time_s
          : null,
    };

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(
      body.history
    )
      ? (body.history as any[])
          .filter(
            (m) =>
              m &&
              typeof m.content === 'string' &&
              (m.role === 'user' || m.role === 'assistant')
          )
          .slice(-6)
          .map((m) => ({ role: m.role, content: String(m.content).slice(0, 300) }))
      : [];

    const memories = getAiMemories(me.id, 10);
    const memoriesBlock =
      memories.length > 0
        ? memories.map((m) => `- ${m.content}`).join('\n')
        : '(aucune mémoire pour ce user)';

    const aiName = me.ai_name || 'IA'; // défaut sans nom = « IA » (Pascal 2026-08-13).
    const displayName = me.display_name || me.username;
    const cardKind = draft.type === 'video' ? 'vidéo' : 'image';

    const isVideo = draft.type === 'video';

    // Talk2Me #341 — Lot 2 N8 : lecture du mode (header prioritaire).
    // Mode attendu : card_editor_video ou card_editor_image. Si incohérent
    // avec draft.type → on garde draft.type comme source de vérité (sécurité),
    // mais on logge pour traçabilité.
    const headerMode = getRequestMode(request, undefined);
    const expectedMode = isVideo ? 'card_editor_video' : 'card_editor_image';
    if (headerMode !== expectedMode && headerMode !== 'chat') {
      console.warn(
        '[editor/chat/mode] mode mismatch',
        `header=${headerMode}`,
        `expected=${expectedMode}`,
      );
    }
    const modeLabel = getModeLabel(expectedMode);
    if (process.env.DEBUG_MODE_GATE === '1') {
      console.log(
        '[editor/chat/mode]',
        `header=${headerMode}`,
        `effective=${expectedMode}`,
        `label=${modeLabel}`,
      );
    }

    const toolsBlock = isVideo
      ? `- edit_video_trim({start_s, end_s}) : découpe la vidéo entre 2 timestamps (timeline source, secondes)
- edit_video_clear_trim() : annule un trim
- edit_video_cover({time_s}) : définit la frame de couverture
- edit_video_add_text({content, position, start_s?, end_s?}) : overlay texte sur la vidéo
- edit_video_remove_text({text_id})
- generate_title({hint?}) : titre court
- generate_description({length: 'short'|'long', hint?})
- generate_hashtags({count: 3-12, hint?})`
      : `- edit_image_crop({ratio}) : 'square' | 'vertical' | 'horizontal' | 'original'
- edit_image_filter({filter}) : 'auto' | 'bright' | 'warm' | 'cold' | 'soft'
- edit_image_add_text({content, position}) : 'top' | 'center' | 'bottom'
- edit_image_remove_text({text_id})
- edit_image_move_text({text_id, position})
- generate_title({hint?}) : retourne un titre court
- generate_description({length: 'short'|'long', hint?})
- generate_hashtags({count: 3-12, hint?})`;

    const systemPrompt = `Tu es ${aiName}, l'IA personnelle de ${displayName}, en MODE ${modeLabel.toUpperCase()} (mode technique: ${expectedMode}).

CONTEXTE : ${displayName} édite une ${cardKind} avant publication.
État actuel de la card : ${buildContextLine(draft)}

=== PIPELINE DE RAISONNEMENT (SILENCIEUX) ===
${displayName} ne voit JAMAIS ce pipeline. Tu l'exécutes dans ta tête AVANT toute action.

1. ANALYSE LA PHRASE COMPLÈTE de ${displayName}. Ne te contente JAMAIS d'un mot isolé.
   - Identifie l'intention (recadrer, filtrer, ajouter texte, trimer vidéo, générer titre/desc/tags).
   - Extrait les paramètres EXPLICITES de la phrase ENTIÈRE (durée, position, ratio, texte exact).
   - Exemples :
     * "coupe ça à 1 minute" → durée totale visée = 60s, PAS "1" comme valeur brute.
     * "recadre carré" → ratio='square'.
     * "mets un texte en haut : Vacances 2026" → content="Vacances 2026", position='top'.
     * "fais-moi un titre" → generate_title (clair).
     * "écris cool" sans position ni champ visé → ambigu → 1 question.

2. CONSULTE l'état de la card ci-dessus + la mémoire user pour désambiguer :
   - Card vidéo + "coupe à 1 minute" → edit_video_trim avec end_s=60.
   - Card avec titre existant + "change-le" → il parle du titre.
   - Habitudes user en mémoire → réutilise pour les générations.

3. ÉVALUE TON NIVEAU DE CONFIANCE :
   - CONFIANCE ÉLEVÉE (intent + paramètres clairs) → APPELLE le tool directement.
   - CONFIANCE FAIBLE (ambigu ou paramètre essentiel manquant) → 1 question courte. PAS de tool.

4. SI TU LANCES UN TOOL : extrait les paramètres de la PHRASE COMPLÈTE, pas d'un mot isolé.
   - BAD : "coupe à 1 minute" → edit_video_trim({end_s: 1}) ❌ (le "1" pris brut)
   - GOOD : "coupe à 1 minute" → edit_video_trim({start_s: 0, end_s: 60}) ✅
   - BAD : "ajoute Soleil en bas" → edit_image_add_text({content:"Soleil"}) sans position ❌
   - GOOD : edit_image_add_text({content:"Soleil", position:"bottom"}) ✅

5. INTERDIT :
   - Demander confirmation quand l'intent est clair.
   - Exposer ton pipeline (raisonnement interne).
   - Tool sur paramètre mal extrait.

6. RÉPONSE FINALE :
   - Soit UNE question courte (si ambigu).
   - Soit le tool + confirmation 1 phrase max.

COMPÉTENCES GELÉES (mode ${modeLabel}) : Tu ne fais PAS de recherche web, YouTube, recettes, lieux, Wikipedia, météo, produits. Ces outils ne sont PAS dans ta liste de tools — il est impossible de les appeler.
Si ${displayName} te demande hors-sujet (météo, restos, hôtels, vidéos, etc.) → réponds en UNE phrase, sans excuse longue :
  « Je suis en mode ${modeLabel}, je ne peux pas faire ça ici. Reviens au chat normal pour cela. »
puis propose de continuer l'édition de la card.

TOOLS DISPONIBLES (function calling) :
${toolsBlock}

MÉMOIRE LONG-TERME DE ${displayName} (à respecter dans les générations) :
${memoriesBlock}

RÈGLES :
1. Dès que la demande correspond à un tool, APPELLE-LE directement, ne demande pas confirmation.
2. Tu peux enchaîner plusieurs tools dans la même réponse (ex "coupe entre 5 et 15s puis génère des hashtags" → 2 tools).
3. Ta réponse texte reste TRÈS COURTE (1 phrase, 1-2 lignes max). Confirme ce que tu fais.
4. Pas de markdown, pas de guillemets décoratifs, pas d'emojis sauf si ${displayName} en met.
5. Si l'intention n'est pas claire → pose UNE question courte, n'appelle pas de tool.${
      isVideo
        ? `
6. Pour le trim : convertis "1 min 04" → 64s, "00:12 à 00:45" → start_s=12, end_s=45. Vérifie que end > start.`
        : ''
    }

Réponds en français naturel.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];

    const openai = new OpenAI({ apiKey, baseURL, timeout: 30000, maxRetries: 0 });

    const activeTools = isVideo
      ? [...VIDEO_TOOLS, ...META_TOOLS]
      : [...IMAGE_TOOLS, ...META_TOOLS];

    const r1 = await openai.chat.completions.create({
      model,
      messages,
      tools: activeTools,
      tool_choice: 'auto',
      temperature: 0.4,
      max_tokens: 400,
    });

    const aMsg = r1.choices[0]?.message;
    let finalText = (aMsg?.content || '').toString().trim();
    const toolCalls = aMsg?.tool_calls || [];

    const ops: EditorOp[] = [];

    // Contexte texte commun pour les sub-générations
    const draftCtx = `Type: ${cardKind}. ${buildContextLine(draft)}.${
      memories.length > 0
        ? ` Style/préférences user à respecter: ${memories.map((m) => m.content).join('; ')}.`
        : ''
    }`;

    for (const tc of toolCalls) {
      if (tc.type !== 'function') continue;
      const fn = tc.function;
      if (!fn || typeof fn.name !== 'string') continue;
      const args = safeParseArgs(fn.arguments);

      switch (fn.name) {
        case 'edit_image_crop': {
          const ratio = asEnum<CropRatio>(args.ratio, ['square', 'vertical', 'horizontal', 'original']);
          if (ratio) {
            ops.push({
              tool: 'edit_image_crop',
              args: { ratio },
              label: `Recadrage ${ratio}`,
            });
          }
          break;
        }
        case 'edit_image_filter': {
          const filter = asEnum<FilterKind>(args.filter, ['auto', 'bright', 'warm', 'cold', 'soft']);
          if (filter) {
            ops.push({
              tool: 'edit_image_filter',
              args: { filter },
              label: `Filtre ${filter}`,
            });
          }
          break;
        }
        case 'edit_image_add_text': {
          const content = clampStr(args.content, 60).trim();
          const position = asEnum<TextPos>(args.position, ['top', 'center', 'bottom']) || 'center';
          if (content) {
            ops.push({
              tool: 'edit_image_add_text',
              args: { content, position },
              label: `Texte ajouté : "${content}" (${position})`,
            });
          }
          break;
        }
        case 'edit_image_remove_text': {
          const id = clampStr(args.text_id, 80).trim();
          if (id) {
            ops.push({
              tool: 'edit_image_remove_text',
              args: { text_id: id },
              label: 'Texte supprimé',
            });
          }
          break;
        }
        case 'edit_image_move_text': {
          const id = clampStr(args.text_id, 80).trim();
          const position = asEnum<TextPos>(args.position, ['top', 'center', 'bottom']);
          if (id && position) {
            ops.push({
              tool: 'edit_image_move_text',
              args: { text_id: id, position },
              label: `Texte déplacé vers ${position}`,
            });
          }
          break;
        }
        // ----- Vidéo ---------------------------------------------
        case 'edit_video_trim': {
          const s = typeof args.start_s === 'number' ? args.start_s : null;
          const e = typeof args.end_s === 'number' ? args.end_s : null;
          if (s !== null && e !== null && e > s && s >= 0) {
            const max =
              draft.type === 'video' && typeof draft.duration_s === 'number' && draft.duration_s > 0
                ? draft.duration_s
                : e;
            const start = Math.max(0, Math.min(s, max));
            const end = Math.max(start + 0.1, Math.min(e, max));
            ops.push({
              tool: 'edit_video_trim',
              args: { start_s: start, end_s: end },
              label: `Trim ${start.toFixed(1)}s → ${end.toFixed(1)}s`,
            });
          }
          break;
        }
        case 'edit_video_clear_trim': {
          ops.push({
            tool: 'edit_video_clear_trim',
            args: {},
            label: 'Trim annulé',
          });
          break;
        }
        case 'edit_video_cover': {
          const t = typeof args.time_s === 'number' ? args.time_s : null;
          if (t !== null && t >= 0) {
            const max =
              draft.type === 'video' && typeof draft.duration_s === 'number' && draft.duration_s > 0
                ? draft.duration_s
                : t;
            const time = Math.max(0, Math.min(t, max));
            ops.push({
              tool: 'edit_video_cover',
              args: { time_s: time },
              label: `Cover @${time.toFixed(1)}s`,
            });
          }
          break;
        }
        case 'edit_video_add_text': {
          const content = clampStr(args.content, 60).trim();
          const position = asEnum<TextPos>(args.position, ['top', 'center', 'bottom']) || 'center';
          const start_s = typeof args.start_s === 'number' ? args.start_s : null;
          const end_s = typeof args.end_s === 'number' ? args.end_s : null;
          if (content) {
            const rangeLabel =
              start_s !== null || end_s !== null
                ? ` [${start_s !== null ? start_s.toFixed(1) + 's' : '0s'}→${
                    end_s !== null ? end_s.toFixed(1) + 's' : 'fin'
                  }]`
                : '';
            ops.push({
              tool: 'edit_video_add_text',
              args: { content, position, start_s, end_s },
              label: `Texte vidéo : "${content}" (${position})${rangeLabel}`,
            });
          }
          break;
        }
        case 'edit_video_remove_text': {
          const id = clampStr(args.text_id, 80).trim();
          if (id) {
            ops.push({
              tool: 'edit_video_remove_text',
              args: { text_id: id },
              label: 'Texte vidéo supprimé',
            });
          }
          break;
        }
        case 'generate_title': {
          const hint = clampStr(args.hint, 200);
          try {
            const out = await subGenerate(
              openai,
              model,
              `Génère un TITRE court (1 ligne, max 60 caractères) pour cette card. ${draftCtx}. ${
                hint ? `Indication: ${hint}.` : ''
              } Réponds uniquement par le titre, sans guillemets.`,
              60
            );
            const title = out.replace(/^["'`]+|["'`]+$/g, '').slice(0, 80);
            if (title) {
              ops.push({
                tool: 'set_title',
                args: { title },
                label: `Titre généré : "${title}"`,
                result: title,
              });
            }
          } catch (e) {
            console.error('[editor/chat] generate_title error', e);
          }
          break;
        }
        case 'generate_description': {
          const length = asEnum<'short' | 'long'>(args.length, ['short', 'long']) || 'short';
          const hint = clampStr(args.hint, 200);
          try {
            const maxChars = length === 'short' ? 120 : 280;
            const out = await subGenerate(
              openai,
              model,
              `Génère une DESCRIPTION ${length === 'short' ? 'courte (1 phrase)' : 'longue (2-3 phrases)'} pour cette card. Max ${maxChars} caractères. ${draftCtx}. ${
                hint ? `Indication: ${hint}.` : ''
              } Réponds uniquement par la description.`,
              length === 'short' ? 80 : 160
            );
            const desc = out.replace(/^["'`]+|["'`]+$/g, '').slice(0, 400);
            if (desc) {
              ops.push({
                tool: 'set_description',
                args: { description: desc },
                label: `Description générée (${length})`,
                result: desc,
              });
            }
          } catch (e) {
            console.error('[editor/chat] generate_description error', e);
          }
          break;
        }
        case 'generate_hashtags': {
          let count = typeof args.count === 'number' ? Math.floor(args.count) : 6;
          if (count < 3) count = 3;
          if (count > 12) count = 12;
          const hint = clampStr(args.hint, 200);
          try {
            const out = await subGenerate(
              openai,
              model,
              `Génère ${count} hashtags pertinents pour cette card. ${draftCtx}. ${
                hint ? `Indication: ${hint}.` : ''
              } Format STRICT : tags séparés par espaces, chacun précédé de #, sans accent, sans ponctuation, en minuscules. Ex: #paris #soiree #ami. Réponds uniquement par la ligne de hashtags.`,
              120
            );
            const tags = out
              .split(/\s+/)
              .map((s) => s.trim().replace(/^#+/, '').toLowerCase())
              .map((s) => s.replace(/[^\p{L}\p{N}_]/gu, ''))
              .filter((s) => s.length > 0 && s.length <= 30);
            const uniq = Array.from(new Set(tags)).slice(0, count);
            if (uniq.length > 0) {
              ops.push({
                tool: 'set_hashtags',
                args: { hashtags: uniq },
                label: `${uniq.length} hashtags générés`,
                result: uniq,
              });
            }
          } catch (e) {
            console.error('[editor/chat] generate_hashtags error', e);
          }
          break;
        }
        default:
          // tool inconnu → ignore
          break;
      }
    }

    // Si DeepSeek n'a rien dit ET qu'on a quand même des ops → texte par défaut
    if (!finalText && ops.length > 0) {
      finalText = ops.map((o) => o.label).join(' · ');
    }
    // Si rien du tout (ni texte ni ops) → message minimal
    if (!finalText) {
      finalText = 'OK';
    }
    // Cap longueur du texte IA
    if (finalText.length > 240) finalText = finalText.slice(0, 240).trim() + '…';

    return NextResponse.json({
      ok: true,
      text: finalText,
      ops,
    });
  } catch (err) {
    console.error('[cards/editor/chat] error', err);
    return NextResponse.json(
      {
        ok: false,
        text: 'Je ne suis pas joignable là tout de suite. Réessaye dans un instant.',
        ops: [],
      },
      { status: 200 }
    );
  }
}
