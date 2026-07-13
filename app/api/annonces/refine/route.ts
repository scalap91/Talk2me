/**
 * Talk2Me — POST /api/annonces/refine
 * { title, description, category, city, price } → { title, description }
 * Corrige TOUTE l'annonce (titre + description) en regardant l'ensemble des champs pour
 * comprendre le sujet. Garde la langue (FR/malgache), n'invente rien. Pascal 2026-07-12.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { refineAnnonce } from '@/lib/boutique/refine-text';
import { createLabelTask, getTask } from '@/lib/compute/task-queue';

/** Vision POOL : enfile la photo comme tâche 'label', attend qu'un téléphone du pool la traite
 *  (ML Kit Image Labeling, GPU du tél — PAS de RunPod), renvoie les objets/couleurs détectés.
 *  Timeout court + fallback silencieux (si aucun tél dispo → on corrige sans la vision). Pascal 2026-07-12. */
async function visionFromPool(imageUrl: string, budgetMs = 7000): Promise<string[]> {
  if (!imageUrl.startsWith('/uploads/')) return [];
  try {
    const task = createLabelTask(imageUrl);
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 400));
      const t = getTask(task.id);
      if (t?.status === 'done') {
        try {
          const labels = JSON.parse(t.result || '[]') as { text?: string; conf?: number }[];
          return labels.filter((l) => l && typeof l.text === 'string' && (l.conf ?? 1) >= 0.5).map((l) => l.text as string).slice(0, 12);
        } catch { return []; }
      }
    }
  } catch { /* pool indispo */ }
  return [];
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 2000) : '');
  const fields = {
    title: s(body?.title),
    description: s(body?.description),
    category: s(body?.category),
    city: s(body?.city),
    price: s(body?.price),
  };
  const photo = s(body?.photo);
  if (!fields.title.trim() && !fields.description.trim()) {
    return NextResponse.json({ error: 'empty' }, { status: 400 });
  }
  // Vision POOL sur la photo (objets/couleurs) → aide l'IA à confirmer/compléter (couleur, produit).
  console.log(`[ANNONCE-REFINE] user=${me.id} hasPhoto=${!!photo} photo=${JSON.stringify(photo.slice(0, 80))}`);
  const visionLabels = photo ? await visionFromPool(photo) : [];
  console.log(`[ANNONCE-REFINE] visionLabels(${visionLabels.length})=${JSON.stringify(visionLabels)}`);
  const out = await refineAnnonce({ ...fields, visionLabels });
  return NextResponse.json({ ok: true, ...out, visionLabels });
}
