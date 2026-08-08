/**
 * Talk2Me — « Envoyer un inscrit en formation » (Pascal 2026-08-08).
 * Un CONTRIBUTEUR envoie une recrue en formation. On mémorise QUI l'envoie ; à la CERTIFICATION
 * (app/api/formation/access, action:'certify') la recrue devient AUTOMATIQUEMENT son filleul.
 * Ici on ne parraine PAS encore — on enregistre juste l'intention (boucle fermée plus tard, sur PREUVE).
 * POST { user_id } → { ok } | { ok:false, reason:'self' | 'deja_ton_filleul' }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getContributor } from '@/lib/network';
import { sendToFormation } from '@/lib/formation-access';

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

  // Déjà mon filleul → rien à envoyer (il est déjà dans ma caste).
  const c = getContributor(target);
  if (c && c.sponsor_id === me.id) return NextResponse.json({ ok: false, reason: 'deja_ton_filleul' });

  // Routage par ZONE : la recrue tombe chez les validateurs de MA ville (je l'ai recrutée localement).
  const myCity = getContributor(me.id)?.city ?? null;
  sendToFormation(target, me.id, myCity); // premier-envoyeur gagne ; la certification fermera la boucle
  return NextResponse.json({ ok: true });
}
