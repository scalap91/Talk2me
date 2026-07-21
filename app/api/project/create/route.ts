import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { buildProjectCard, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';
import { PROJECT_DOMAINS } from '@/lib/cards/v2/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/** POST /api/project/create — crée une « œuvre-en-projet » (kind=project, facet domaine). */
export async function POST(req: NextRequest) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const domain = String(body.domain ?? '');
  if (!(PROJECT_DOMAINS as readonly string[]).includes(domain)) return NextResponse.json({ error: 'invalid_domain', allowed: PROJECT_DOMAINS }, { status: 400 });
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'title_required' }, { status: 400 });

  // Contraintes réelles (optionnelles) : bornées, entiers positifs — le producteur s'y tiendra.
  const rawC = body.constraints && typeof body.constraints === 'object' ? body.constraints as Record<string, unknown> : null;
  const posInt = (v: unknown, max: number): number | undefined => {
    const n = typeof v === 'number' ? Math.floor(v) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : undefined;
  };
  const constraints = rawC ? {
    ...(Array.isArray(rawC.locations) ? { locations: rawC.locations.filter((x): x is string => typeof x === 'string').slice(0, 20) } : {}),
    ...(posInt(rawC.people, 100000) !== undefined ? { people: posInt(rawC.people, 100000) } : {}),
    ...(posInt(rawC.devices, 1000) !== undefined ? { devices: posInt(rawC.devices, 1000) } : {}),
    ...(posInt(rawC.target_duration_ms, 86400000) !== undefined ? { target_duration_ms: posInt(rawC.target_duration_ms, 86400000) } : {}),
  } : undefined;

  const card = buildProjectCard({
    owner: user.id,
    domain,
    title: title.slice(0, 200),
    idea: typeof body.idea === 'string' ? body.idea.slice(0, 5000) : undefined,
    intent: typeof body.intent === 'string' ? body.intent.slice(0, 1000) : undefined,
    source_card_id: typeof body.source_card_id === 'string' ? body.source_card_id : undefined,
    ...(constraints && Object.keys(constraints).length ? { constraints } : {}),
    film: body.film && typeof body.film === 'object' ? body.film as Record<string, unknown> : undefined,
  });

  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
  return NextResponse.json({ id: card.id, url: saved.url, view: renderCard(card, 'full') }, { status: 201 });
}
