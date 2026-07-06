/**
 * GET /api/formation/[id] (Pascal 2026-07-03)
 * Sert la card FORMATION avec le VERROU appliqué : un non-acheteur reçoit les modules
 * payants SANS leur contenu (titre + résumé + locked:true). Le contenu réel ne sort
 * jamais du serveur pour lui. Propriétaire ou acheteur → tout débloqué.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { readCardFileRaw } from '@/lib/cards/card-file';
import { parseCard } from '@/lib/cards/supercard';
import { gateFormationForUser, hasFormationAccess } from '@/lib/formation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = getCurrentUserFromRequest(req); // peut être null (consultation publique)
  const raw = await readCardFileRaw(id);
  if (!raw) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const parsed = parseCard(raw);
  if (!parsed.ok || !parsed.card) return NextResponse.json({ error: 'unreadable' }, { status: 404 });

  const owner = (parsed.card as unknown as { owner?: string }).owner;
  const unlocked = !!me && (owner === me.id || hasFormationAccess(me.id, id));
  const card = gateFormationForUser(parsed.card, me?.id || null);
  return NextResponse.json({ ok: true, card, unlocked });
}
