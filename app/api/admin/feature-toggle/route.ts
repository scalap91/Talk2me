/**
 * Talk2Me — Super-Admin : interrupteurs des fonctionnalités globales (Pascal 2026-06-21).
 * GET  → { features: { piece3d } }.
 * POST { feature, enabled } → applique (super-admin only).
 * Sert à parquer/allumer des capacités premium (ex. pièces 3D) sans amputer la vision
 * internationale : éteint pour le contexte Mada, allumable pour l'international.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { featuresState, setFeatureEnabled, type AppFeature } from '@/lib/app-settings';
import { backfillUnifiedPosts } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID: AppFeature[] = ['piece3d', 'unified_feed', 'cardos'];

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, features: featuresState() });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { feature?: string; enabled?: boolean } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.feature || !VALID.includes(b.feature as AppFeature)) return NextResponse.json({ error: 'bad_feature' }, { status: 400 });
  // LOT 2 ④ : avant d'allumer le feed unifié, on synchronise unified_posts (backfill idempotent)
  // pour qu'il ne manque aucun post existant.
  if (b.feature === 'unified_feed' && b.enabled) { try { backfillUnifiedPosts(); } catch { /* */ } }
  setFeatureEnabled(b.feature as AppFeature, !!b.enabled);
  return NextResponse.json({ ok: true, features: featuresState() });
}
