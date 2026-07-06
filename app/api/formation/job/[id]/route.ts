/**
 * GET /api/formation/job/[id] (Pascal 2026-07-04)
 * Suivi d'un job de génération de formation : étape + progression (0-100). Quand status
 * = 'done', renvoie le `plan` (le client passe alors à l'écran d'édition). Le client peut
 * quitter et revenir : tant que le job vit côté serveur, il retrouve sa progression.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getJob } from '@/lib/formation-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job || job.userId !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    status: job.status,
    step: job.step,
    progress: job.progress,
    ...(job.status === 'done' ? { plan: job.plan } : {}),
    ...(job.status === 'error' ? { message: job.error } : {}),
  });
}
