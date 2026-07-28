/**
 * GET /api/transport/driver-search?q= — recherche type-ahead pour rattacher un chauffeur.
 * Accepte NOM / identifiant Talk2Me (6 chiffres) / NUMÉRO DE TÉLÉPHONE. Les AMIS remontent en
 * premier (souvent on rattache un ami). Renvoie { users: [{ id, name, avatar, is_friend }] }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDb, listFriends } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ users: [] });

  const db = getDb();
  const friendIds = new Set<string>();
  try { for (const f of listFriends(me.id)) friendIds.add((f as { id: string }).id); } catch { /* */ }

  const digits = q.replace(/\D/g, '');
  const like = `%${q.toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT id, COALESCE(display_name, username) AS name, avatar_url, talk2me_id
    FROM users
    WHERE id != ?
      AND ( LOWER(username) LIKE ? OR LOWER(COALESCE(display_name,'')) LIKE ?
            ${digits.length >= 4 ? "OR talk2me_id = ? OR REPLACE(REPLACE(COALESCE(phone,''),' ',''),'+','') LIKE ?" : ''} )
    LIMIT 40
  `).all(...(digits.length >= 4
    ? [me.id, like, like, digits, '%' + digits.slice(-9)]
    : [me.id, like, like])) as { id: string; name: string | null; avatar_url: string | null; talk2me_id: string | null }[];

  // Amis d'abord, puis par nom.
  const users = rows
    .map((u) => ({ id: u.id, name: u.name || 'Utilisateur', avatar: u.avatar_url || null, talk2me_id: u.talk2me_id, is_friend: friendIds.has(u.id) }))
    .sort((a, b) => (Number(b.is_friend) - Number(a.is_friend)) || a.name.localeCompare(b.name))
    .slice(0, 20);
  return NextResponse.json({ users });
}
