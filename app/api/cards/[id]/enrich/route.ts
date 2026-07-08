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
import { addEnrichment } from '@/lib/cards/engine/enrichments';
import { addContributor } from '@/lib/cards/engine/contributors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

const REFORMULATE_PROMPT =
  "Reformule ce texte pour le rendre clair, lisible et bien écrit, SANS inventer ni " +
  "ajouter la moindre information ou fait qui n'y est pas. Garde le sens et les faits " +
  "EXACTS. Réponds uniquement par le texte reformulé.";

/** Léa reformule la FORME (DeepSeek). Échec/pas de clé → renvoie l'original intact. */
async function reformulate(text: string): Promise<string> {
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
        { role: 'system', content: REFORMULATE_PROMPT },
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

  if (action === 'reformulate') {
    if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 });
    const reformulated = await reformulate(text);
    return NextResponse.json({ reformulated });
  }

  if (action === 'save') {
    if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 });
    const eid = addEnrichment(cardId, me.id, text);
    if (!eid) return NextResponse.json({ error: 'empty' }, { status: 400 });
    // Enrichir = devenir ÉDITEUR de la card (ne rétrograde jamais un creator).
    addContributor(cardId, me.id, 'editor');
    return NextResponse.json({ ok: true, id: eid });
  }

  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
