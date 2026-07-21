import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard, listResourceCards } from '@/lib/cards/project/store';
import { detectNeeds, resolveNeed, registerDomain, type SupplyPools, type OpportunitySignal } from '@/lib/cards/project/engine';
import { filmDomain } from '@/lib/cards/project/domains/film';
registerDomain(filmDomain); // ROBUSTE : import de la VALEUR + register explicite (un import side-effect
                            // seul serait tree-shaké au build Next → domaine non enregistré). Idempotent.
import { renderCard } from '@/lib/cards/v2/reader/reader';
import type { SuperCardV2, ProjectNeed } from '@/lib/cards/v2/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * POST /api/project/:id/resolve-needs — lance le Discovery Engine.
 * Détecte les besoins du domaine → résout (asset→resource→opportunity) → crée une `mission` card
 * pour chaque résidu → met à jour `project.needs[].candidates`. Owner uniquement.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const card = await loadProject(id);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (card.owner !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const project = card.project!;

  // Besoins : ceux déjà portés par la carte, sinon détectés par l'adaptateur de domaine.
  const existing = Array.isArray(project.needs) ? project.needs : [];
  const needs: ProjectNeed[] = existing.length ? existing : detectNeeds(project);

  // Pools d'offre : ressources du store spec:2 + hints optionnels du corps (assets/opportunities).
  const storeResources = await listResourceCards();
  const bodyResources = Array.isArray(body.resources) ? (body.resources as SuperCardV2[]).filter((c) => c && c.kind === 'resource') : [];
  const pools: SupplyPools = {
    assets: Array.isArray(body.assets) ? (body.assets as SuperCardV2[]) : [],
    resources: [...storeResources, ...bodyResources],
    opportunities: Array.isArray(body.opportunities) ? (body.opportunities as OpportunitySignal[]) : [],
  };

  const now = Date.now();
  const resolvedNeeds: ProjectNeed[] = [];
  const createdMissions: string[] = [];
  const issues: string[] = [];

  for (const need of needs) {
    const r = resolveNeed(need, pools, { owner: card.owner, projectCardId: card.id, now });
    resolvedNeeds.push(r.updatedNeed);
    if (r.mission) {
      const saved = await saveCard(r.mission);
      if (saved.ok) createdMissions.push(r.mission.id);
      else issues.push(`${r.mission.id}: ${saved.errors.join(', ')}`);
    }
  }

  project.needs = resolvedNeeds;
  const savedProject = await saveCard(card);
  if (!savedProject.ok) return NextResponse.json({ error: 'invalid_card', issues: savedProject.errors }, { status: 400 });

  return NextResponse.json({
    id: card.id,
    needs: resolvedNeeds.map((n) => ({ id: n.id, kind: n.kind, status: n.status, filled: n.quantity?.filled, required: n.quantity?.required, candidates: n.candidates?.length ?? 0 })),
    missions_created: createdMissions,
    ...(issues.length ? { warnings: issues } : {}),
    view: renderCard(card, 'full'),
  });
}
