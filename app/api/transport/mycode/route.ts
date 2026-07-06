/**
 * Talk2Me — Mon code de remise (4 derniers chiffres de MON numéro). Affiché dans le pop-up
 * du destinataire/détenteur pour que l'autre partie le saisisse (façon Uber). Pascal 2026-06-22.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const r = getDb().prepare('SELECT phone FROM users WHERE id = ?').get(me.id) as { phone: string | null } | undefined;
  const digits = (r?.phone || '').replace(/\D/g, '');
  return NextResponse.json({ ok: true, code: digits ? digits.slice(-4) : null });
}
