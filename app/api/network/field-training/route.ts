/**
 * Talk2Me — Formation TERRAIN faite (Pascal 2026-08-08). Dernière étape de la boucle : après la
 * certification, le contributeur forme sa recrue sur le terrain, puis marque ici que c'est fait.
 * POST { user_id } → marque terrain fait. Réservé au PARRAIN de la recrue (sponsor_id = moi).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getContributor } from '@/lib/network';
import { markFieldTraining } from '@/lib/formation-access';
import { createNotif } from '@/lib/notifs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let b: { user_id?: string } = {};
  try { b = await req.json(); } catch { /* vide */ }
  const target = typeof b.user_id === 'string' ? b.user_id.trim() : '';
  if (!target) return NextResponse.json({ error: 'user_id_required' }, { status: 400 });

  // Seul le PARRAIN de la recrue peut marquer sa formation terrain.
  const c = getContributor(target);
  if (!c || c.sponsor_id !== me.id) return NextResponse.json({ ok: false, reason: 'pas_ta_recrue' });

  markFieldTraining(target);
  createNotif(target, 'formation', '🎉 Formation terrain faite', 'Ton parrain a validé ta formation terrain. Tu es pleinement opérationnel — au boulot !', '/parcours');
  return NextResponse.json({ ok: true });
}
