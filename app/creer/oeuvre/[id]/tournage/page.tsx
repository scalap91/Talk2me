'use client';
/**
 * /creer/oeuvre/[id]/tournage — ÉTAPE 4 « Tournage guidé » (miroir natif film_shoot, Pascal 2026-09-10).
 * LISTE des plans (pas la caméra) : chaque plan → « Filmer ce plan » (ouvre /tournage/[id] = l'écran
 * caméra) ou « Refilmer » + « Revoir · N » si déjà tourné, et « Multi-cam » (live QR). « N / 12 plans
 * tournés » en tête. En bas → Montage.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FilmShell, StepHeader, CtaButton } from '@/components/film/FilmShell';
import { getProject, rebuildFromCard, shotStats, takesOf, type FilmScene, type FilmShot, type FilmTake } from '@/lib/film/api';

const OUTFIT = { fontFamily: "'Outfit',sans-serif" } as const;

export default function TournagePage() {
  const router = useRouter();
  const id = String(useParams()?.id || '');
  const [title, setTitle] = useState('Film');
  const [scenes, setScenes] = useState<FilmScene[]>([]);
  const [review, setReview] = useState<FilmTake[] | null>(null); // prises en revue (modal)

  const load = useCallback(async () => {
    const card = await getProject(id);
    if (card) { const s = rebuildFromCard(card); setTitle(s.title); setScenes(s.scenes); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const stats = shotStats(scenes);
  const cam = (sceneId: string, shotId: string, live = false) => router.push(`/tournage/${id}?scene=${encodeURIComponent(sceneId)}&shot=${encodeURIComponent(shotId)}${live ? '&live=1' : ''}`);

  return (
    <FilmShell title={title} back={`/creer/oeuvre/${id}/storyboard`}>
      <StepHeader title="Tournage guidé" subtitle={`Filme chaque plan avec ta caméra. ${stats.shot} / ${stats.total} plans tournés.`} />

      {scenes.map((s, i) => (
        <div key={s.id} className="mb-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 shrink-0 grid place-items-center rounded-full bg-[#141519] text-white text-[15px] font-black">{i + 1}</span>
              <span className="text-[18px] font-black text-[#141519] truncate" style={OUTFIT}>{s.title || `Scène ${i + 1}`}</span>
            </div>
            {s.location && <span className="shrink-0 text-[14px] text-[#6A7585]">{s.location}</span>}
          </div>
          {(s.action || s.summary) && (
            <p className="text-[14.5px] text-[#6A7585] italic leading-snug mb-2.5 whitespace-pre-wrap bg-[#EEF0F3] rounded-xl px-3 py-2.5">{s.action || s.summary}</p>
          )}
          {(s.shots || []).map((sh, k) => (
            <ShotRow key={sh.id} shot={sh} n={k + 1} onFilm={(live) => cam(s.id, sh.id, live)} onReview={() => setReview(takesOf(sh))} />
          ))}
        </div>
      ))}

      {stats.total > 0 && (
        <CtaButton onClick={() => router.push(`/creer/oeuvre/${id}/montage`)}>🎬 Monter (film partiel)</CtaButton>
      )}

      {review && <TakeReview takes={review} onClose={() => setReview(null)} />}
    </FilmShell>
  );
}

function ShotRow({ shot, n, onFilm, onReview }: { shot: FilmShot; n: number; onFilm: (live: boolean) => void; onReview: () => void }) {
  const takes = takesOf(shot);
  const done = takes.length > 0;
  return (
    <div className="bg-white border border-[#EAECEF] rounded-2xl p-3.5 mb-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 shrink-0 grid place-items-center rounded-lg text-[13px] font-black" style={{ background: '#FFE4CC', color: '#B45309' }}>{n}</span>
          {shot.cameraRole && <span className="shrink-0 text-[12.5px] font-bold text-[#6A7585] rounded-lg px-2 py-0.5" style={{ background: '#EEF0F3' }}>{shot.cameraRole}</span>}
        </div>
        {shot.cam ? <span className="shrink-0 text-[12px] font-extrabold text-white rounded-full px-2.5 py-1" style={{ background: '#141519' }}>CAM {shot.cam}{shot.pass && shot.pass > 1 ? ` · passe ${shot.pass}` : ''}</span> : null}
      </div>
      {shot.intention && <p className="text-[15.5px] font-bold text-[#141519] mt-2 leading-snug">{shot.intention}</p>}
      {shot.framingGuide && <p className="text-[14px] text-[#6A7585] mt-1.5 leading-snug">📐 {shot.framingGuide}</p>}
      {shot.placement && <p className="text-[14px] text-[#6A7585] mt-1.5 leading-snug">📍 {shot.placement}</p>}

      <div className="flex flex-wrap gap-2 mt-3">
        {done ? (
          <button type="button" onClick={() => onFilm(false)} className="flex-1 min-w-[120px] rounded-xl py-2.5 text-white text-[14.5px] font-extrabold active:scale-[0.99]" style={{ background: '#2F343A' }}>↺ Refilmer</button>
        ) : (
          <button type="button" onClick={() => onFilm(false)} className="flex-1 min-w-[140px] rounded-xl py-2.5 text-white text-[14.5px] font-extrabold active:scale-[0.99]" style={{ background: '#FF7F11' }}>🎥 Filmer ce plan</button>
        )}
        <button type="button" onClick={() => onFilm(true)} className="rounded-xl py-2.5 px-3.5 text-[14.5px] font-extrabold active:scale-[0.99]" style={{ background: '#FFF1E4', color: '#FF7F11', border: '1px solid #FFD3AC' }}>👥 Multi-cam</button>
        {done && (
          <button type="button" onClick={onReview} className="rounded-xl py-2.5 px-3.5 text-[14.5px] font-extrabold active:scale-[0.99]" style={{ background: '#EAF8F0', color: '#15803D', border: '1px solid #B7E6C9' }}>▶ Revoir · {takes.length}</button>
        )}
      </div>
    </div>
  );
}

/** Revue des prises d'un plan : lecteur vidéo + navigation entre prises (miroir _TakeReviewScreen natif). */
function TakeReview({ takes, onClose }: { takes: FilmTake[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const t = takes[Math.max(0, Math.min(i, takes.length - 1))];
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.94)' }}>
      <div className="flex items-center justify-between px-4 h-14 text-white">
        <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 grid place-items-center rounded-full text-[22px]" style={{ background: 'rgba(255,255,255,0.12)' }}>×</button>
        <span className="text-[15px] font-extrabold" style={OUTFIT}>Prise {i + 1} / {takes.length}{typeof t?.orientationScore === 'number' ? ` · cadrage ${Math.round(t.orientationScore * 100)}%` : ''}</span>
        <span className="w-9" />
      </div>
      <div className="flex-1 grid place-items-center px-3">
        {t?.media_url ? <video key={t.id} src={t.media_url} controls autoPlay playsInline className="max-w-full max-h-full rounded-xl bg-black" /> : <span className="text-white/70">Prise indisponible</span>}
      </div>
      {takes.length > 1 && (
        <div className="flex items-center justify-center gap-3 pb-8 pt-4">
          <button type="button" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0} className="rounded-xl py-2.5 px-5 text-white text-[15px] font-extrabold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.14)' }}>← Précédente</button>
          <button type="button" onClick={() => setI((v) => Math.min(takes.length - 1, v + 1))} disabled={i >= takes.length - 1} className="rounded-xl py-2.5 px-5 text-white text-[15px] font-extrabold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.14)' }}>Suivante →</button>
        </div>
      )}
    </div>
  );
}
