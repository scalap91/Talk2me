/**
 * POST /api/contacts/match { contacts: [{ n?: name, p: phone }] }
 * Reçoit le répertoire du tél et dit lesquels sont DÉJÀ sur Talk2Me vs à INVITER.
 *
 * RÈGLE (Pascal 2026-06-25) : on ne TRANSFORME JAMAIS un numéro du répertoire. Pas
 * d'indicatif ajouté (l'app n'est PAS réservée à Madagascar). Le numéro renvoyé pour
 * l'invitation est EXACTEMENT celui du répertoire. La normalisation E.164 n'est utilisée
 * QU'en interne, comme tentative supplémentaire pour RETROUVER un membre — jamais renvoyée.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getUserByPhone } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const raw = Array.isArray(body.contacts) ? body.contacts : [];
  const seen = new Set<string>();
  const onT2m: Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null; name: string | null }> = [];
  const toInvite: Array<{ name: string | null; phone: string }> = [];

  for (const c of raw.slice(0, 2000)) {
    const item = c as { n?: unknown; p?: unknown };
    const original = (typeof item.p === 'string' ? item.p : '').trim(); // numéro BRUT, jamais modifié
    const clean = original.replace(/[\s().\-]/g, ''); // sert juste à dédupliquer/chercher
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    const name = typeof item.n === 'string' ? item.n.slice(0, 80) : null;

    // Recherche d'un membre : on essaie le numéro tel quel, puis (en dernier recours,
    // INTERNE) sa forme E.164 — mais on ne renvoie JAMAIS un numéro transformé.
    let u = getUserByPhone(clean) || (original !== clean ? getUserByPhone(original) : null);
    if (!u) {
      const e164 = normalizePhone(clean);
      if (e164 && e164 !== clean) u = getUserByPhone(e164);
    }

    if (u && u.id !== me.id) {
      onT2m.push({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, name });
    } else if (!u) {
      toInvite.push({ name, phone: original }); // EXACTEMENT le numéro du répertoire
    }
  }
  toInvite.sort((a, b) => (a.name || a.phone).localeCompare(b.name || b.phone));
  return NextResponse.json({ ok: true, on_t2m: onT2m, to_invite: toInvite });
}
