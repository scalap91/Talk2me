/**
 * Talk2Me — Super-Admin : mode d'affichage par section (Carte | Photo). Design system.
 * GET  → { modes: { feed, annonces, … } }.
 * POST { section, mode } → applique (super-admin only). Défaut 'cards' partout.
 * POST { all: 'cards' | 'photo' } → applique à TOUTES les sections (raccourci global).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { displayModeState, setDisplayMode, DISPLAY_SECTIONS, type DisplaySection, type DisplayMode } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isMode(m: unknown): m is DisplayMode { return m === 'cards' || m === 'photo'; }

// Super-admin en prod ; sur DEV, tout compte connecté peut piloter l'affichage (test).
function canManage(me: { id: string; email?: string | null } | null): boolean {
  if (!me) return false;
  if (process.env.T2M_ENV === 'dev') return true;
  return isAiOpsAdmin(me.id, me.email);
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!canManage(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, modes: displayModeState() });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!canManage(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { section?: string; mode?: string; all?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  // Raccourci global : tout Carte / tout Photo.
  if (b.all !== undefined) {
    if (!isMode(b.all)) return NextResponse.json({ error: 'bad_mode' }, { status: 400 });
    for (const s of DISPLAY_SECTIONS) setDisplayMode(s, b.all);
    return NextResponse.json({ ok: true, modes: displayModeState() });
  }
  if (!b.section || !DISPLAY_SECTIONS.includes(b.section as DisplaySection)) return NextResponse.json({ error: 'bad_section' }, { status: 400 });
  if (!isMode(b.mode)) return NextResponse.json({ error: 'bad_mode' }, { status: 400 });
  setDisplayMode(b.section as DisplaySection, b.mode);
  return NextResponse.json({ ok: true, modes: displayModeState() });
}
