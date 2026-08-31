/**
 * Édition du Discovery par SON propriétaire (Pascal 2026-08-31) : masquer/rétablir des éléments (hidden =
 * liste COMPLÈTE d'IDs) et remplacer/effacer le texte de l'IA (portraitOverride). Auth obligatoire ; on
 * n'édite QUE son propre Discovery (les prefs sont indexées sur l'utilisateur courant). POST /api/discovery/prefs
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDiscoveryPrefs, setDiscoveryPrefs } from '@/lib/discovery-prefs';
import { getProfileDiscovery } from '@/lib/profile-discovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // hiddenItems (titres) pour le panneau « rétablir » côté natif — byproduct de getProfileDiscovery.
  let hiddenItems: unknown[] = [];
  try { hiddenItems = getProfileDiscovery(me.username, me.id).hiddenItems; } catch { hiddenItems = []; }
  return NextResponse.json({ ...getDiscoveryPrefs(me.id), hiddenItems });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { portraitOverride?: string | null; hidden?: string[] } = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const patch: { portraitOverride?: string | null; hidden?: string[] } = {};
  if (Object.prototype.hasOwnProperty.call(body, 'portraitOverride')) patch.portraitOverride = body.portraitOverride ?? null;
  if (Array.isArray(body.hidden)) patch.hidden = body.hidden.map((s) => String(s));
  const next = setDiscoveryPrefs(me.id, patch);
  return NextResponse.json({ ok: true, prefs: next });
}
