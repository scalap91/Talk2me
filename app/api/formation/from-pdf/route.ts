/**
 * POST /api/formation/from-pdf (Pascal 2026-07-03, async 2026-07-04)
 * Reçoit le PDF + la durée, lance un JOB en arrière-plan et rend un `jobId` IMMÉDIATEMENT.
 * La génération (lecture PDF entier → plan → rédaction) tourne côté serveur ; le client
 * suit la progression via GET /api/formation/job/[id] et peut QUITTER l'écran.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { extractPdfText, buildFormationFromPdf } from '@/lib/formation';
import { createJob, updateJob } from '@/lib/formation-jobs';
import { sendPushToUser } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let file: File | null = null;
  let duration = 60;
  let figuresText = '';
  let figuresUrls: string[] = [];
  try {
    const form = await req.formData();
    const f = form.get('file') || form.get('pdf');
    if (f instanceof File) file = f;
    const d = Number(form.get('duration'));
    if (Number.isFinite(d) && d > 0) duration = d;
    figuresText = String(form.get('figures_text') || ''); // texte des figures, lu SUR L'APPAREIL
    try { const raw = form.get('figures_urls'); if (raw) figuresUrls = (JSON.parse(String(raw)) as string[]).filter((u) => typeof u === 'string'); } catch { /* pas d'images */ }
  } catch {
    return NextResponse.json({ error: 'bad_form' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'no_file' }, { status: 400 });

  const name = (file.name || '').toLowerCase();
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
  if (!isPdf) return NextResponse.json({ error: 'not_pdf', message: 'Envoie un fichier PDF.' }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'too_big', message: 'PDF trop lourd (max 25 Mo).' }, { status: 400 });

  // On capture le buffer MAINTENANT (la requête va se terminer avant le traitement).
  const buf = new Uint8Array(await file.arrayBuffer());
  const job = createJob(me.id);

  // Traitement en ARRIÈRE-PLAN (le process reste vivant : serveur long-running, pas serverless).
  (async () => {
    try {
      updateJob(job.id, { step: 'Léa ouvre ton document…', progress: 3 });
      const { text, pages } = await extractPdfText(buf);
      if (!text || text.length < 40) {
        updateJob(job.id, { status: 'error', error: "Ce PDF n'a pas de texte lisible (scanné ?). Envoie un PDF avec du texte." });
        return;
      }
      // AUTO-RETRY : on RÉESSAIE jusqu'à aboutir (3 fois). Si un essai échoue (LLM surchargé,
      // sortie trop longue…), on réduit la durée demandée pour alléger la charge, puis on repart.
      let plan: Awaited<ReturnType<typeof buildFormationFromPdf>> | null = null;
      let lastErr = '';
      for (let attempt = 1; attempt <= 3 && !plan; attempt++) {
        const dur = attempt === 1 ? duration : Math.max(20, Math.round(duration / attempt)); // moins de charge à chaque retry
        try {
          plan = await buildFormationFromPdf(text, pages, dur, (step, pct) => updateJob(job.id, { step, progress: pct }), figuresText, figuresUrls);
        } catch (e) {
          lastErr = e instanceof Error ? e.message : 'échec';
          updateJob(job.id, { step: `Petit souci, Léa réessaie… (${attempt}/3)`, progress: 8 });
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      if (plan) {
        updateJob(job.id, { status: 'done', progress: 100, step: 'Terminé', plan });
        const title = (plan as { title?: string })?.title;
        void sendPushToUser(me.id, {
          title: '📚 Ta formation est prête !',
          body: title ? `« ${title} » est prête à consulter.` : 'Ton document a été transformé en formation.',
          url: '/creer/formation', tag: `formation-${job.id}`,
        });
      } else {
        updateJob(job.id, { status: 'error', error: `Échec après 3 essais. ${lastErr}`.trim() });
        void sendPushToUser(me.id, { title: '⚠️ Formation échouée', body: "Léa a réessayé 3 fois sans y arriver. Réessaie avec un PDF plus léger ou une durée plus courte.", url: '/creer/formation', tag: `formation-${job.id}` });
      }
    } catch (e) {
      updateJob(job.id, { status: 'error', error: e instanceof Error ? e.message : 'Échec de la génération.' });
      void sendPushToUser(me.id, { title: '⚠️ Formation échouée', body: "Une erreur a interrompu la génération. Réessaie.", url: '/creer/formation', tag: `formation-${job.id}` });
    }
  })();

  return NextResponse.json({ ok: true, jobId: job.id });
}
