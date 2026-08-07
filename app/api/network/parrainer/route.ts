/**
 * Talk2Me — Parrainer un inscrit (Pascal 2026-07-30).
 * Depuis « Mon activité » : le contributeur cherche un inscrit et le PARRAINE (l'ajoute à ses filleuls).
 * On ne crée rien d'autre. Réutilise becomeContributor (idempotent : ne double pas un existant).
 * POST { user_id } → { ok } | { ok:false, reason:'deja_ton_filleul' | 'deja_contributeur' | 'self' }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { becomeContributor, getContributor } from '@/lib/network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!getContributor(me.id)) return NextResponse.json({ error: 'not_contributor' }, { status: 403 });

  let b: { user_id?: string } = {};
  try { b = await req.json(); } catch { /* vide */ }
  const target = typeof b.user_id === 'string' ? b.user_id.trim() : '';
  if (!target) return NextResponse.json({ error: 'user_id_required' }, { status: 400 });
  if (target === me.id) return NextResponse.json({ ok: false, reason: 'self' });

  const already = getContributor(target);
  if (already) return NextResponse.json({ ok: false, reason: already.sponsor_id === me.id ? 'deja_ton_filleul' : 'deja_contributeur' });

  becomeContributor(target, me.id); // rattache le filleul sous moi (recruits++ + contribution loggée)
  return NextResponse.json({ ok: true });
}
