'use client';
/**
 * /creer/oeuvre/[id]/ecriture — ÉTAPE 2 « Écriture guidée » (miroir natif FilmWriting, Pascal 2026-09-10).
 * Le producteur-IA écrit le film étape par étape (logline → synopsis → treatment → scénario). Chaque
 * étape écrite = une carte avec ✓ vert + « Réviser » (dire à l'IA quoi changer). Scénario complet →
 * « Passer au storyboard » (valide le scénario puis va à l'étape 3).
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FilmShell, StepHeader, GreenBanner, CtaButton, Card } from '@/components/film/FilmShell';
import { getProject, rebuildFromCard, filmApi, STEP_FR, STEP_TITLE, type FilmStep } from '@/lib/film/api';

export default function EcriturePage() {
  const router = useRouter();
  const id = String(useParams()?.id || '');
  const [title, setTitle] = useState('Film');
  const [steps, setSteps] = useState<FilmStep[]>([]);
  const [nextStep, setNextStep] = useState<string | null>('logline');
  const [screenplayOk, setScreenplayOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [revise, setRevise] = useState<string | null>(null); // step en cours de révision
  const [reviseText, setReviseText] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const card = await getProject(id);
    if (card) { const s = rebuildFromCard(card); setTitle(s.title); setSteps(s.steps); setNextStep(s.nextStep); setScreenplayOk(s.screenplayOk); }
    setLoaded(true);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function develop() {
    setBusy(true); setErr(null);
    const { ok, status, d } = await filmApi.develop(id);
    setBusy(false);
    if (status === 503 && d?.error === 'llm_unavailable') { setErr("IA indisponible — réessaie dans un instant."); return; }
    if (!ok) { setErr(d?.error || `HTTP ${status}`); return; }
    setSteps((s) => [...s, { step: d.step, text: d.generated }]); setNextStep(d.next);
  }

  async function applyRevise(step: string) {
    if (!reviseText.trim()) return;
    setBusy(true); setErr(null);
    const { ok, status, d } = await filmApi.develop(id, { step, instruction: reviseText.trim() });
    setBusy(false);
    if (!ok) { setErr(d?.error || `HTTP ${status}`); return; }
    setSteps((s) => s.map((x) => (x.step === step ? { ...x, text: d.generated } : x)));
    setRevise(null); setReviseText('');
  }

  async function toStoryboard() {
    setBusy(true); setErr(null);
    if (!screenplayOk) {
      const { ok, status, d } = await filmApi.approve(id, 'screenplay');
      if (!ok) { setBusy(false); setErr(d?.error || `HTTP ${status}`); return; }
    }
    router.push(`/creer/oeuvre/${id}/storyboard`);
  }

  const done = nextStep === null; // scénario complet

  return (
    <FilmShell title={title} back="/mes-films">
      <StepHeader title="Écriture guidée" subtitle="Le producteur-IA écrit ton film étape par étape. Tu peux réviser ou réécrire chaque étape." />

      {steps.map((s) => (
        <Card key={s.step}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 grid place-items-center rounded-full text-white text-[14px] font-black" style={{ background: '#22C55E' }}>✓</span>
              <span className="text-[19px] font-black text-[#141519]" style={{ fontFamily: "'Outfit',sans-serif" }}>{STEP_TITLE[s.step] || s.step}</span>
            </div>
            <button type="button" onClick={() => { setRevise(revise === s.step ? null : s.step); setReviseText(''); setErr(null); }}
              className="flex items-center gap-1 text-[15px] font-extrabold" style={{ color: '#FF7F11' }}>✨ Réviser</button>
          </div>
          <p className="text-[16px] text-[#2F343A] mt-2.5 whitespace-pre-wrap leading-relaxed">{s.text}</p>
          {revise === s.step && (
            <div className="mt-3">
              <textarea autoFocus value={reviseText} onChange={(e) => setReviseText(e.target.value)}
                placeholder="Dis à l'IA ce qu'il faut changer (ex. « rends-la plus tendue »). Elle garde la cohérence avec le reste du film."
                className="w-full min-h-[64px] rounded-xl border border-[#E7E9EC] p-3 text-[15px]" />
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => applyRevise(s.step)} disabled={busy || !reviseText.trim()}
                  className="flex-1 rounded-xl py-3 text-white text-[15px] font-extrabold disabled:opacity-60" style={{ background: '#FF7F11' }}>{busy ? "L'IA modifie…" : '✨ Appliquer (cohérent)'}</button>
                <button type="button" onClick={() => { setRevise(null); setReviseText(''); }} className="rounded-xl px-4 font-extrabold text-[#6A7585]" style={{ background: '#F1F2F4' }}>Annuler</button>
              </div>
            </div>
          )}
        </Card>
      ))}

      {loaded && !done && (
        <CtaButton onClick={develop} disabled={busy}>{busy ? "L'IA écrit…" : `✍️ Générer ${STEP_FR[nextStep!] || nextStep} (IA)`}</CtaButton>
      )}

      {done && (
        <>
          <GreenBanner>Scénario prêt. Passe au storyboard : découpage en scènes + plans multicaméra.</GreenBanner>
          <CtaButton onClick={toStoryboard} disabled={busy}>{busy ? '…' : '🎬 Passer au storyboard'}</CtaButton>
        </>
      )}

      {err && <p className="text-[#C0392B] mt-3 text-[14px]">{err}</p>}
    </FilmShell>
  );
}
