/**
 * Talk2Me — ENRICHIR une card (page-entité vivante, Pascal 2026-07-08).
 * POST /api/cards/{id}/enrich  (auth OBLIGATOIRE)
 *
 *  body { action:'reformulate', text } → Léa remet la FORME propre (jamais le fond)
 *    → { reformulated }. Doctrine [[feedback_content_grounding]] : Léa ne rajoute
 *    aucun fait ; le savoir vient de l'humain.
 *  body { action:'save', text } → enregistre l'enrichissement ATTRIBUÉ à l'user
 *    + le promeut contributeur 'editor' → { ok:true }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { addEnrichment, listEnrichments } from '@/lib/cards/engine/enrichments';
import { addContributor } from '@/lib/cards/engine/contributors';
import { entityRefFromCardId, cardContext } from '@/lib/cards/engine/resolve-ref';
import { mergeContribution, consolidateArticle } from '@/lib/cards/engine/merge';
import { getArticle, setArticle } from '@/lib/cards/engine/article';
import { verifyText } from '@/lib/cards/engine/verify';
import { getYouTubeVideoDetails, youtubeFactsBlock } from '@/lib/youtube-video';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

const REFORMULATE_PROMPT =
  "Reformule ce texte pour le rendre clair, lisible et bien écrit, SANS inventer ni " +
  "ajouter la moindre information ou fait qui n'y est pas. Garde le sens et les faits " +
  "EXACTS. Réponds uniquement par le texte reformulé.";

/** Léa reformule la FORME (DeepSeek), dans la langue finale. Échec/pas de clé → original intact. */
async function reformulate(text: string, lang: string): Promise<string> {
  const original = (text || '').trim();
  if (!original) return '';
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return original;
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 30000,
      maxRetries: 1,
    });
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: 'system', content: `${REFORMULATE_PROMPT} Rédige la réponse en ${lang} (traduis si le texte est dans une autre langue). Structure le texte avec des sous-titres courts sur leur propre ligne quand c'est pertinent. N'utilise AUCun symbole markdown (ni **, ni #, ni *).` },
        { role: 'user', content: original },
      ],
    });
    let out = (res.choices?.[0]?.message?.content || '').trim();
    out = out.replace(/^["«»“”]+|["«»“”]+$/g, '').trim();
    return out || original;
  } catch {
    return original;
  }
}

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: cardId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '');
  const text = String(body?.text || '').trim();
  const lang = String(body?.lang || 'français').slice(0, 30);

  if (action === 'reformulate') {
    if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 });
    const reformulated = await reformulate(text, lang);
    return NextResponse.json({ reformulated });
  }

  // PROPOSE (M1) : Léa lit l'article ENTIER + la contribution, score, décide, et
  // renvoie l'article RÉÉCRIT en aperçu — SANS rien écrire. L'humain valide ensuite.
  if (action === 'propose') {
    if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 });
    const { ref, title, baseText } = cardContext(cardId);
    const currentBody = getArticle(ref) || baseText || '';
    const merged = await mergeContribution({ currentBody, contribution: text, title, lang });
    return NextResponse.json({
      verdict: merged.verdict,
      scoreContext: merged.scoreContext,
      scoreNovelty: merged.scoreNovelty,
      isEvent: merged.isEvent,
      reason: merged.reason,
      newBody: merged.newBody,
      changed: merged.verdict === 'integrated' && merged.newBody.trim() !== currentBody.trim(),
    });
  }

  // VERIFY (M2) : fact-check les affirmations du texte (l'article, ou `text` fourni) sur le
  // web. Retourne veracity + par-affirmation confirmée/contredite/invérifiable + sources.
  if (action === 'verify') {
    const { ref, baseText } = cardContext(cardId);
    const target = text || getArticle(ref) || baseText || '';
    // Entité YouTube → faits OFFICIELS de l'API comme source autoritative (grounding, zéro scrape).
    let authoritative = '';
    const ytId = ref.startsWith('yt:') ? ref.slice(3) : null;
    if (ytId) {
      const d = await getYouTubeVideoDetails(ytId);
      if (d) authoritative = youtubeFactsBlock(d);
    }
    const result = await verifyText(target, { authoritative });
    return NextResponse.json(result);
  }

  // CONSOLIDATE (M1) : nettoie l'article existant (retire les doublons hérités de l'ancien
  // empilage), restructure, sans perdre d'info factuelle. Renvoie un aperçu à valider.
  if (action === 'consolidate') {
    const { ref, title, baseText } = cardContext(cardId);
    const canonical = getArticle(ref);
    const currentBody =
      canonical || [baseText, ...listEnrichments(ref).map((e) => e.text)].filter(Boolean).join('\n\n');
    const newBody = await consolidateArticle({ body: currentBody, title, lang });
    return NextResponse.json({
      verdict: 'integrated',
      scoreContext: 100,
      scoreNovelty: 0,
      isEvent: false,
      reason: 'Doublons retirés, article consolidé.',
      newBody,
      changed: newBody.trim() !== currentBody.trim(),
    });
  }

  // COMMIT (M1) : l'humain a validé l'article fusionné → on remplace le corps canonique,
  // on garde la contribution brute (traçabilité/réputation) et on crédite l'éditeur.
  if (action === 'commit') {
    const newBody = String(body?.newBody || '').trim();
    if (!newBody) return NextResponse.json({ error: 'empty' }, { status: 400 });
    const ref = entityRefFromCardId(cardId);
    setArticle(ref, newBody, lang); // mémorise la langue SOURCE (base de la traduction lecteur)
    if (text) addEnrichment(ref, me.id, text); // trace de la contribution brute (log)
    addContributor(ref, me.id, 'editor'); // ne rétrograde jamais un creator
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
