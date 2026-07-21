import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';
import type { ProjectContributor } from '@/lib/cards/v2/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/** POST /api/project/:id/join — un contributeur rejoint le projet (ref OPAQUE, jamais de PII). */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const card = await loadProject(id);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const roles = Array.isArray(body.roles) ? body.roles.filter((r): r is string => typeof r === 'string') : undefined;

  const project = card.project!;
  const contributors: ProjectContributor[] = Array.isArray(project.contributors) ? project.contributors : [];
  const existing = contributors.find((c) => c.ref === user.id);
  if (existing) {
    existing.status = 'active';
    if (roles) existing.roles = roles;
  } else {
    contributors.push({ ref: user.id, ...(roles ? { roles } : {}), status: 'active' });
  }
  project.contributors = contributors;

  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
  return NextResponse.json({ id: card.id, contributors: contributors.length, view: renderCard(card, 'full') });
}
