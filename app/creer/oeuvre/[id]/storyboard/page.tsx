'use client';
/**
 * /creer/oeuvre/[id]/storyboard — ÉTAPE 3 « Storyboard » (miroir natif film_storyboard, Pascal 2026-09-10).
 * Découpage du scénario en scènes, puis génération des plans multicaméra par scène + esquisse par plan.
 * Dès qu'un plan est prêt → « 🎬 Tourner » (étape 4). Chaque scène est révisable (dire à l'IA).
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FilmShell, StepHeader, GreenBanner, CtaButton, Card } from '@/components/film/FilmShell';
import { getProject, rebuildFromCard, filmApi, type FilmScene, type FilmShot } from '@/lib/film/api';

const OUTFIT = { fontFamily: "'Outfit',sans-serif" } as const;

export default function StoryboardPage() {
  const router = useRouter();
  const id = String(useParams()?.id || '');
  const [title, setTitle] = useState('Film');
  const [breakdownOk, setBreakdownOk] = useState(false);
  const [scenes, setScenes] = useState<FilmScene[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null); // scène ou plan en cours (IA)
  const [err, setErr] = useState<string | null>(null);
  const [revise, setRevise] = useState<string | null>(null);
  const [reviseText, setReviseText] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const card = await getProject(id);
    if (card) { const s = rebuildFromCard(card); setTitle(s.title); setBreakdownOk(s.breakdownOk); setScenes(s.scenes); }
    setLoaded(true);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function breakdown() {
    setBusy(true); setErr(null);
    const { ok, status, d } = await filmApi.breakdown(id);
    setBusy(false);
    if (status === 503) { setErr('IA indisponible pour le découpage.'); return; }
    if (!ok) { setErr(d?.need ? `À valider d'abord : ${d.need}` : (d?.error || `HTTP ${status}`)); return; }
    setScenes(d.scenes || []);
  }
  async function approveBreakdown() {
    setBusy(true); setErr(null);
    const { ok, status, d } = await filmApi.approve(id, 'breakdown');
    setBusy(false);
    if (!ok) { setErr(d?.error || `HTTP ${status}`); return; }
    setBreakdownOk(true);
  }
  async function genShots(sceneId: string) {
    setBusyKey(sceneId); setErr(null);
    const { ok, status, d } = await filmApi.genShots(id, sceneId);
    setBusyKey(null);
    if (status === 503) { setErr('IA indisponible pour les plans.'); return; }
    if (!ok) { setErr(d?.need ? `À valider d'abord : ${d.need}` : (d?.error || `HTTP ${status}`)); return; }
    setScenes((sc) => sc.map((s) => (s.id === sceneId ? { ...s, shots: d.shots || [] } : s)));
  }
  async function genSketch(sceneId: string, shotId: string) {
    setBusyKey(shotId); setErr(null);
    const { ok, status, d } = await filmApi.genSketch(id, sceneId, shotId);
    setBusyKey(null);
    if (!ok) { setErr(d?.error === 'no_svg' ? "L'IA n'a pas rendu de dessin, réessaie." : (d?.error || `HTTP ${status}`)); return; }
    setScenes((sc) => sc.map((s) => (s.id !== sceneId ? s : { ...s, shots: (s.shots || []).map((sh) => (sh.id === shotId ? { ...sh, storyboardImage: d.storyboardImage } : sh)) })));
  }
  async function applyRevise(sceneId: string) {
    if (!reviseText.trim()) return;
    setBusyKey(sceneId); setErr(null);
    const { ok, status, d } = await filmApi.reviseScene(id, sceneId, reviseText.trim());
    setBusyKey(null);
    if (!ok) { setErr(d?.error || `HTTP ${status}`); return; }
    if (d.scene) setScenes((sc) => sc.map((s) => (s.id === sceneId ? { ...s, ...d.scene } : s)));
    setRevise(null); setReviseText('');
  }

  const anyShot = scenes.some((s) => (s.shots || []).length > 0);

  return (
    <FilmShell title={title} back={`/creer/oeuvre/${id}/ecriture`}>
      <StepHeader title="Storyboard" subtitle="Découpe ton film en scènes, puis génère les plans multicaméra de chaque scène." />

      {loaded && scenes.length === 0 && (
        <CtaButton onClick={breakdown} disabled={busy}>{busy ? 'Découpage…' : '🎬 Générer le découpage (scènes)'}</CtaButton>
      )}

      {scenes.length > 0 && !breakdownOk && (
        <CtaButton onClick={approveBreakdown} disabled={busy}>{busy ? '…' : `✅ Valider le découpage (${scenes.length} scènes)`}</CtaButton>
      )}

      {scenes.map((s, i) => (
        <Card key={s.id}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 shrink-0 grid place-items-center rounded-full bg-[#141519] text-white text-[15px] font-black">{i + 1}</span>
              <span className="text-[19px] font-black text-[#141519] truncate" style={OUTFIT}>{s.title || `Scène ${i + 1}`}</span>
            </div>
            <button type="button" onClick={() => { setRevise(revise === s.id ? null : s.id); setReviseText(''); setErr(null); }}
              className="shrink-0 text-[15px] font-extrabold" style={{ color: '#FF7F11' }}>✨ Réviser</button>
          </div>
          {s.location && <div className="text-[15px] text-[#6A7585] mt-1.5">📍 {s.location}</div>}
          {s.summary && <p className="text-[15.5px] text-[#2F343A] mt-2 leading-snug">{s.summary}</p>}
          {(s.action || s.dialogue) && <p className="text-[14.5px] text-[#6A7585] italic mt-2 leading-snug whitespace-pre-wrap">{s.action || s.dialogue}</p>}

          {revise === s.id && (
            <div className="mt-3">
              <textarea autoFocus value={reviseText} onChange={(e) => setReviseText(e.target.value)}
                placeholder="Dis à l'IA ce qu'il faut changer dans cette scène. Elle garde la cohérence avec le reste du film."
                className="w-full min-h-[62px] rounded-xl border border-[#E7E9EC] p-3 text-[15px]" />
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => applyRevise(s.id)} disabled={busyKey === s.id || !reviseText.trim()}
                  className="flex-1 rounded-xl py-3 text-white text-[15px] font-extrabold disabled:opacity-60" style={{ background: '#FF7F11' }}>{busyKey === s.id ? "L'IA modifie…" : '✨ Appliquer'}</button>
                <button type="button" onClick={() => { setRevise(null); setReviseText(''); }} className="rounded-xl px-4 font-extrabold text-[#6A7585]" style={{ background: '#F1F2F4' }}>Annuler</button>
              </div>
            </div>
          )}

          {/* Plans de la scène */}
          {(s.shots || []).length > 0 ? (
            <div className="mt-4">
              <div className="text-[15px] font-extrabold text-[#141519] mb-2" style={OUTFIT}>🎥 Plans</div>
              {(s.shots as FilmShot[]).map((sh, k) => (
                <ShotCard key={sh.id} shot={sh} n={k + 1} busy={busyKey === sh.id} onSketch={() => genSketch(s.id, sh.id)} />
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => genShots(s.id)} disabled={!breakdownOk || busyKey === s.id}
              className="w-full mt-3 rounded-xl py-3 text-[15px] font-extrabold disabled:opacity-60"
              style={{ background: breakdownOk ? '#FFF1E4' : '#F1F2F4', color: breakdownOk ? '#FF7F11' : '#9AA3AF' }}>
              {busyKey === s.id ? 'Plans…' : (breakdownOk ? '🎥 Générer les plans' : 'Valide le découpage d\'abord')}
            </button>
          )}
        </Card>
      ))}

      {breakdownOk && anyShot && (
        <>
          <GreenBanner>Tu peux déjà TOURNER les plans prêts. (Génère les autres plans quand tu veux.)</GreenBanner>
          <CtaButton onClick={() => router.push(`/creer/oeuvre/${id}/tournage`)}>🎬 Tourner</CtaButton>
        </>
      )}

      {err && <p className="text-[#C0392B] mt-3 text-[14px]">{err}</p>}
    </FilmShell>
  );
}

/** Carte d'un PLAN (numéro + cadrage + CAM + intention + guides + esquisse). */
function ShotCard({ shot, n, busy, onSketch }: { shot: FilmShot; n: number; busy: boolean; onSketch: () => void }) {
  return (
    <div className="rounded-xl border border-[#EEF0F3] p-3 mb-2.5" style={{ background: '#FAFBFC' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 shrink-0 grid place-items-center rounded-lg text-[13px] font-black" style={{ background: '#FFE4CC', color: '#B45309' }}>{n}</span>
          {shot.cameraRole && <span className="shrink-0 text-[12.5px] font-bold text-[#6A7585] rounded-lg px-2 py-0.5" style={{ background: '#EEF0F3' }}>{shot.cameraRole}</span>}
        </div>
        {shot.cam ? <span className="shrink-0 text-[12px] font-extrabold text-white rounded-full px-2.5 py-1" style={{ background: '#141519' }}>CAM {shot.cam}{shot.pass && shot.pass > 1 ? ` · passe ${shot.pass}` : ''}</span> : null}
      </div>
      {shot.intention && <p className="text-[15.5px] font-bold text-[#141519] mt-2 leading-snug">{shot.intention}</p>}
      {shot.placement && <p className="text-[14px] text-[#6A7585] mt-1.5 leading-snug">📍 {shot.placement}</p>}
      {shot.framingGuide && <p className="text-[14px] text-[#6A7585] mt-1.5 leading-snug">📐 {shot.framingGuide}</p>}
      {shot.storyboardImage && (
        <img src={shot.storyboardImage} alt="" className="w-full rounded-xl mt-3 border border-[#EAECEF]" style={{ background: '#fff' }} />
      )}
      <button type="button" onClick={onSketch} disabled={busy}
        className="mt-2.5 flex items-center gap-1.5 text-[14px] font-extrabold disabled:opacity-60" style={{ color: '#FF7F11' }}>
        {busy ? '🖌️ Dessin…' : (shot.storyboardImage ? '🖌️ Refaire l\'esquisse' : '🖌️ Esquisser ce plan')}
      </button>
    </div>
  );
}
