/**
 * /api/cards/editor/generate-metadata
 *
 * Endpoint utilitaire pour générer UN seul champ (titre / description /
 * hashtags) depuis un bouton manuel du panneau. Indépendant du chat IA.
 * Réutilise DeepSeek mais avec un mini-prompt structuré (pas de tools).
 *
 * POST { field: 'title'|'description'|'hashtags', draft: {...}, length?: 'short'|'long', count?: int }
 *  → { ok, value: string | string[] }
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getAiMemories } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DraftSnapshot {
  type: 'image' | 'video';
  crop: string;
  filter: string;
  texts: Array<{ content: string; position: string }>;
  title: string;
  description: string;
  hashtags: string[];
}

function clampStr(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  return v.slice(0, max);
}

function buildCtx(draft: DraftSnapshot, memorySummary: string): string {
  const bits: string[] = [`Type: ${draft.type === 'video' ? 'vidéo' : 'image'}`];
  if (draft.title) bits.push(`titre: "${draft.title}"`);
  if (draft.description) bits.push(`description: "${draft.description.slice(0, 140)}"`);
  if (draft.texts.length > 0) {
    bits.push(
      `textes posés: ${draft.texts.map((t) => `"${t.content.slice(0, 30)}"`).join(', ')}`
    );
  }
  if (draft.crop && draft.crop !== 'original') bits.push(`crop: ${draft.crop}`);
  if (draft.filter && draft.filter !== 'none') bits.push(`filtre: ${draft.filter}`);
  if (draft.hashtags.length > 0)
    bits.push(`hashtags actuels: ${draft.hashtags.map((h) => `#${h}`).join(' ')}`);
  if (memorySummary) bits.push(`style user à respecter: ${memorySummary}`);
  return bits.join(' | ');
}

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  if (!apiKey) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 500 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const field = body?.field;
  if (field !== 'title' && field !== 'description' && field !== 'hashtags') {
    return NextResponse.json({ error: 'invalid_field' }, { status: 400 });
  }

  const rawDraft = body?.draft as Partial<DraftSnapshot> | undefined;
  const draft: DraftSnapshot = {
    type: rawDraft?.type === 'video' ? 'video' : 'image',
    crop: typeof rawDraft?.crop === 'string' ? rawDraft.crop : 'original',
    filter: typeof rawDraft?.filter === 'string' ? rawDraft.filter : 'none',
    texts: Array.isArray(rawDraft?.texts)
      ? rawDraft!.texts.slice(0, 10).map((t: any) => ({
          content: typeof t?.content === 'string' ? t.content.slice(0, 60) : '',
          position: typeof t?.position === 'string' ? t.position : 'center',
        }))
      : [],
    title: clampStr(rawDraft?.title, 80),
    description: clampStr(rawDraft?.description, 400),
    hashtags: Array.isArray(rawDraft?.hashtags)
      ? (rawDraft!.hashtags as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .slice(0, 15)
      : [],
  };

  const memories = getAiMemories(me.id, 10);
  const memorySummary = memories.map((m) => m.content).join('; ');
  const ctx = buildCtx(draft, memorySummary);

  const openai = new OpenAI({ apiKey, baseURL, timeout: 20000, maxRetries: 0 });

  try {
    if (field === 'title') {
      const r = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              "Génère uniquement un titre court (max 60 caractères), 1 ligne, sans guillemets, sans markdown.",
          },
          { role: 'user', content: ctx },
        ],
        temperature: 0.7,
        max_tokens: 60,
      });
      const out = (r.choices[0]?.message?.content || '').toString().trim();
      const value = out.replace(/^["'`]+|["'`]+$/g, '').slice(0, 80);
      return NextResponse.json({ ok: true, value });
    }

    if (field === 'description') {
      const length = body?.length === 'long' ? 'long' : 'short';
      const r = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              length === 'short'
                ? "Génère une description courte (1 phrase, max 120 caractères). Sans guillemets, sans markdown."
                : "Génère une description plus longue (2-3 phrases, max 280 caractères). Sans guillemets, sans markdown.",
          },
          { role: 'user', content: ctx },
        ],
        temperature: 0.7,
        max_tokens: length === 'short' ? 80 : 160,
      });
      const out = (r.choices[0]?.message?.content || '').toString().trim();
      const value = out.replace(/^["'`]+|["'`]+$/g, '').slice(0, 400);
      return NextResponse.json({ ok: true, value });
    }

    // hashtags
    let count = typeof body?.count === 'number' ? Math.floor(body.count) : 6;
    if (count < 3) count = 3;
    if (count > 12) count = 12;
    const r = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            "Génère uniquement une ligne de hashtags séparés par des espaces, chacun précédé de #, en minuscules, sans accents, sans ponctuation. Pas de phrase, pas de markdown.",
        },
        { role: 'user', content: `${ctx}\n\nGénère ${count} hashtags pertinents.` },
      ],
      temperature: 0.7,
      max_tokens: 120,
    });
    const out = (r.choices[0]?.message?.content || '').toString().trim();
    const tags = out
      .split(/\s+/)
      .map((s) => s.trim().replace(/^#+/, '').toLowerCase())
      .map((s) => s.replace(/[^\p{L}\p{N}_]/gu, ''))
      .filter((s) => s.length > 0 && s.length <= 30);
    const uniq = Array.from(new Set(tags)).slice(0, count);
    return NextResponse.json({ ok: true, value: uniq });
  } catch (e) {
    console.error('[editor/generate-metadata] error', e);
    return NextResponse.json({ error: 'deepseek_failed' }, { status: 500 });
  }
}
