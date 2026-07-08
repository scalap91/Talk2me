/**
 * Talk2Me — CERVEAU DE FUSION éditoriale (page-entité vivante, M1, Pascal 2026-07-08).
 * Léa = rédactrice en chef. À chaque contribution, elle LIT l'article entier + la
 * contribution, SCORE (contexte + nouveauté), et décide : intégrer / doublon /
 * hors-sujet / à vérifier. Si intégré, elle RÉÉCRIT l'article complet :
 *  - le descriptif va dans la bonne section (dédup, restructure) ;
 *  - un ÉVÉNEMENT daté (tournée, sortie, récompense, polémique…) va dans une
 *    section « Chronologie », placé dans l'ORDRE chronologique.
 * Grounding strict [[feedback_content_grounding]] : jamais de fait inventé.
 */
import OpenAI from 'openai';

export type MergeVerdict = 'integrated' | 'duplicate' | 'off_context' | 'needs_review';

export interface MergeResult {
  verdict: MergeVerdict;
  scoreContext: number; // 0-100 : la contribution est-elle DANS le sujet ?
  scoreNovelty: number; // 0-100 : apporte-t-elle du NEUF vs l'article ?
  isEvent: boolean; // la contribution est-elle un ÉVÉNEMENT daté (→ Chronologie, exception au gel M5) ?
  reason: string; // une phrase, langue de l'utilisateur
  newBody: string; // article réécrit complet (si integrated), sinon article inchangé
}

const SYSTEM = `Tu es la RÉDACTRICE EN CHEF d'une page encyclopédique VIVANTE sur une ENTITÉ (un son, un artiste, un produit, un lieu, une actualité…). Un contributeur propose un ajout. Ton rôle :

1. CONTEXTE (0-100) : la contribution parle-t-elle vraiment du sujet de l'article ? Hors-sujet = score bas.
2. NOUVEAUTÉ (0-100) : apporte-t-elle une information NOUVELLE par rapport à l'article actuel ? Déjà présent = score bas.
3. VERDICT :
   - "integrated" : dans le sujet ET nouveau → tu RÉÉCRIS L'ARTICLE ENTIER en y intégrant l'élément À SA JUSTE PLACE. Règles de réécriture :
       • information DESCRIPTIVE → dans la bonne section thématique (dédoublonne, restructure, renomme/crée des sous-titres si utile).
       • ÉVÉNEMENT DATÉ ou datable (tournée, sortie, récompense, concert, polémique, décès…) → dans une section « Chronologie » (crée-la si absente), inséré dans l'ORDRE CHRONOLOGIQUE parmi les autres événements.
       • retire ce qui est hors-sujet, garde un fil cohérent.
   - "duplicate" : rien de neuf → NE CHANGE PAS l'article.
   - "off_context" : hors sujet → NE CHANGE PAS l'article.
   - "needs_review" : contradiction avec l'article, ou affirmation douteuse/invérifiable → NE CHANGE PAS l'article, explique quoi vérifier.

INTERDITS :
- N'invente JAMAIS un fait qui n'est ni dans l'article actuel ni dans la contribution (grounding strict).
- AUCUN symbole markdown (pas de **, #, *). Les sous-titres sont sur leur propre ligne, en texte simple.
- Écris "newBody" dans la LANGUE demandée (traduis si besoin pour rester homogène).

Réponds STRICTEMENT en JSON : {"verdict","scoreContext","scoreNovelty","isEvent","reason","newBody"}. "isEvent" = true si la contribution décrit un ÉVÉNEMENT daté/datable (sinon false). "newBody" = l'article réécrit complet si "integrated", sinon renvoie l'article actuel inchangé. "reason" = une phrase courte dans la langue demandée.`;

function clampScore(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0;
}

/**
 * CONSOLIDATION : Léa relit l'article et RETIRE les répétitions/doublons, restructure,
 * SANS retirer d'information factuelle ni rien inventer. Sert à nettoyer un article
 * hérité de l'ancien empilage. Pas de clé / échec → renvoie le corps inchangé.
 */
export async function consolidateArticle(input: { body: string; title: string; lang: string }): Promise<string> {
  const body = (input.body || '').trim();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !body) return body;
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 90000,
      maxRetries: 1,
    });
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 3000,
      messages: [
        {
          role: 'system',
          content:
            "Cet article contient des répétitions/doublons. Réécris-le pour SUPPRIMER les redondances et le rendre cohérent et bien structuré (sous-titres courts sur leur propre ligne, section « Chronologie » pour les événements datés). N'AJOUTE aucun fait, ne RETIRE aucune information factuelle réelle, n'invente rien. Aucun symbole markdown (ni **, #, *). Écris dans la langue indiquée. Réponds uniquement par l'article nettoyé.",
        },
        { role: 'user', content: `LANGUE : ${input.lang}\nTITRE : ${input.title}\n\n=== ARTICLE À NETTOYER ===\n${body}` },
      ],
    });
    const out = (res.choices?.[0]?.message?.content || '').trim();
    return out || body;
  } catch {
    return body;
  }
}

/**
 * RAFRAÎCHISSEMENT : l'article est peut-être daté (chiffres/statuts qui évoluent). À partir
 * des SOURCES ACTUELLES (Wikipédia/API), Léa met à jour les faits qui ont changé, garde le
 * reste, ne retire pas l'historique (formule « en 1971… ; aujourd'hui… »). Grounding strict.
 */
export async function refreshArticle(input: {
  body: string;
  title: string;
  lang: string;
  authoritative: string;
}): Promise<string> {
  const body = (input.body || '').trim();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !body) return body;
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 90000,
      maxRetries: 1,
    });
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 3000,
      messages: [
        {
          role: 'system',
          content:
            "Cet article peut contenir des DONNÉES DATÉES (population, chiffres, statuts, classements qui évoluent). À partir des SOURCES ACTUELLES fournies UNIQUEMENT, METS À JOUR les faits qui ont changé (remplace les valeurs périmées par les valeurs actuelles). N'invente RIEN (si une donnée actuelle n'est pas dans les sources, laisse l'ancienne en la datant). Ne retire pas l'info historique pertinente — tu peux formuler « en 1971… ; aujourd'hui… ». Garde le reste intact. Aucun markdown. Écris dans la langue indiquée. Réponds uniquement par l'article mis à jour.",
        },
        {
          role: 'user',
          content: `TITRE : ${input.title}\nLANGUE : ${input.lang}\n\n=== SOURCES ACTUELLES ===\n${input.authoritative || '(aucune)'}\n\n=== ARTICLE À RAFRAÎCHIR ===\n${body}`,
        },
      ],
    });
    const out = (res.choices?.[0]?.message?.content || '').trim();
    return out || body;
  } catch {
    return body;
  }
}

export async function mergeContribution(input: {
  currentBody: string;
  contribution: string;
  title: string;
  lang: string;
  state?: 'developing' | 'mature' | 'frozen';
}): Promise<MergeResult> {
  const current = (input.currentBody || '').trim();
  const fallback: MergeResult = {
    verdict: 'needs_review',
    scoreContext: 0,
    scoreNovelty: 0,
    isEvent: false,
    reason: 'Fusion indisponible pour le moment.',
    newBody: current,
  };
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !input.contribution.trim()) return fallback;

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 90000,
      maxRetries: 1,
    });
    // Cycle de vie : plus l'article est avancé, plus la barre monte (anti-bloat) — SAUF
    // pour un ÉVÉNEMENT NOUVEAU daté (la réalité ne s'arrête pas → exception qui rouvre).
    const stateNote =
      input.state === 'frozen'
        ? "ÉTAT : FIGÉ. N'accepte (\"integrated\") QUE : un ÉVÉNEMENT NOUVEAU daté et significatif, OU une correction factuelle. Tout le reste → \"duplicate\" ou \"off_context\"."
        : input.state === 'mature'
          ? "ÉTAT : MÛR (sujet bien couvert). Élève la barre : n'accepte que ce qui apporte une info IMPORTANTE et vérifiable, un ÉVÉNEMENT nouveau daté, ou une correction. Une addition mineure/anecdotique → \"duplicate\"."
          : 'ÉTAT : en développement (barre normale).';
    const user = `TITRE DE L'ENTITÉ : ${input.title}
LANGUE DE SORTIE : ${input.lang}
${stateNote}

=== ARTICLE ACTUEL ===
${current || '(article vide pour le moment)'}

=== CONTRIBUTION PROPOSÉE ===
${input.contribution.trim().slice(0, 8000)}`;

    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
    });

    const raw = res.choices?.[0]?.message?.content || '{}';
    const j = JSON.parse(raw) as Partial<MergeResult>;
    const verdict: MergeVerdict = (['integrated', 'duplicate', 'off_context', 'needs_review'] as const).includes(
      j.verdict as MergeVerdict,
    )
      ? (j.verdict as MergeVerdict)
      : 'needs_review';
    const newBody = verdict === 'integrated' ? String(j.newBody || current).trim() : current;
    return {
      verdict,
      scoreContext: clampScore(j.scoreContext),
      scoreNovelty: clampScore(j.scoreNovelty),
      isEvent: Boolean(j.isEvent),
      reason: String(j.reason || '').slice(0, 300),
      newBody: newBody || current,
    };
  } catch {
    return fallback;
  }
}
