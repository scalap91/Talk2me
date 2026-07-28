/**
 * GET /api/transport/dev-verify — DEV ONLY. Auto-vérifie le transporteur = l'utilisateur CONNECTÉ
 * (saute l'attente admin, pour tester le module agence/colis). Ne vérifie QUE soi-même. À retirer
 * (ou gater) avant la prod. Tourne DANS l'app live → écrit dans la bonne base (pas de devinette de chemin).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { devForceVerify, getCarrierProfile } from '@/lib/transport-profile';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized — connecte-toi d’abord' }, { status: 401 });
  const prof = getCarrierProfile(me.id);
  const name = prof?.full_name || (getDb().prepare('SELECT COALESCE(display_name, username) AS n FROM users WHERE id=?').get(me.id) as { n?: string } | undefined)?.n || 'Transporteur test';
  const phone = prof?.phone || (getDb().prepare('SELECT phone FROM users WHERE id=?').get(me.id) as { phone?: string } | undefined)?.phone || '';
  devForceVerify(me.id, name, phone);
  return NextResponse.json({ ok: true, message: 'Vérifié ✓ — retourne dans « Devenir transporteur », la section « Devenir agence » est débloquée.', profile: getCarrierProfile(me.id) });
}
