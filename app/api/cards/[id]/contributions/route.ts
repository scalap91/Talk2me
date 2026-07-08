/**
 * Talk2Me — CONTRIBUTIONS d'une card (page-entité vivante, Pascal 2026-07-08).
 * GET /api/cards/{id}/contributions  (public — lecture de page-entité publiée)
 *   → { contributors:[{ user_id, role, joined_at, username, display_name, avatar_url }],
 *       enrichments:[{ id, user_id, text, created_at, username, display_name, avatar_url }] }
 *
 * PII air-gap [[feedback_talk2me_pii_air_gap]] : on n'expose QUE username /
 * display_name / avatar_url. Jamais email, talk2me_id, phone, IP, tokens.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { listContributors } from '@/lib/cards/engine/contributors';
import { listEnrichments } from '@/lib/cards/engine/enrichments';
import { entityRefFromCardId } from '@/lib/cards/engine/resolve-ref';
import { topBadge } from '@/lib/cards/engine/reputation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

interface PublicUser { username: string | null; display_name: string | null; avatar_url: string | null }

/** Résout un lot d'ids → identité PUBLIQUE minimale seulement (PII air-gap). */
function publicUsers(ids: string[]): Map<string, PublicUser> {
  const out = new Map<string, PublicUser>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const placeholders = unique.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT id, username, display_name, avatar_url FROM users WHERE id IN (${placeholders})`)
    .all(...unique) as { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[];
  for (const r of rows) {
    out.set(r.id, { username: r.username, display_name: r.display_name, avatar_url: r.avatar_url });
  }
  return out;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const { id: cardId } = await ctx.params;
  const ref = entityRefFromCardId(cardId); // clé d'ENTITÉ (2 partages du même son = même ref)

  const rawContributors = listContributors(ref);
  const rawEnrichments = listEnrichments(ref);

  const dir = publicUsers([...rawContributors.map((c) => c.user_id), ...rawEnrichments.map((e) => e.user_id)]);
  const empty: PublicUser = { username: null, display_name: null, avatar_url: null };

  const contributors = rawContributors.map((c) => {
    const u = dir.get(c.user_id) || empty;
    return {
      user_id: c.user_id,
      role: c.role,
      joined_at: c.joined_at,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      badge: topBadge(c.user_id)?.label || null,
    };
  });

  const enrichments = rawEnrichments.map((e) => {
    const u = dir.get(e.user_id) || empty;
    return { id: e.id, user_id: e.user_id, text: e.text, created_at: e.created_at, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url };
  });

  return NextResponse.json({ contributors, enrichments });
}
