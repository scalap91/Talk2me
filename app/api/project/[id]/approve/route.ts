import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';
import { APPROVAL_STAGES, APPROVAL_STATES } from '@/lib/cards/v2/registry';
import type { ProjectApproval } from '@/lib/cards/v2/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/** POST /api/project/:id/approve — valide une étape versionnée (scénario/découpage/storyboard). Owner. */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const card = await loadProject(id);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (card.owner !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const stage = String(body.stage ?? '');
  const state = String(body.state ?? 'approved');
  if (!(APPROVAL_STAGES as readonly string[]).includes(stage)) return NextResponse.json({ error: 'invalid_stage', allowed: APPROVAL_STAGES }, { status: 400 });
  if (!(APPROVAL_STATES as readonly string[]).includes(state)) return NextResponse.json({ error: 'invalid_state', allowed: APPROVAL_STATES }, { status: 400 });

  const project = card.project!;
  const approvals: ProjectApproval[] = Array.isArray(project.approvals) ? project.approvals : [];
  const existing = approvals.find((a) => a.stage === stage);
  if (existing) { existing.state = state; existing.by_ref = user.id; existing.at = Date.now(); }
  else approvals.push({ stage, state, by_ref: user.id, at: Date.now() });
  project.approvals = approvals;

  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
  return NextResponse.json({ id: card.id, approvals, view: renderCard(card, 'full') });
}
