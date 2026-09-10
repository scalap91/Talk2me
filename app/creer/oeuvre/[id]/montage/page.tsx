'use client';
/**
 * /creer/oeuvre/[id]/montage — ÉTAPE 5 « Montage » (miroir natif MontageScreen, Pascal 2026-09-10).
 * Garde la meilleure prise de chaque plan et assemble le film. Progression « N / 12 plans tournés »
 * + bouton « Monter le film » → assemble une version (ffmpeg) et la prévisualise.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { FilmShell, StepHeader, CtaButton } from '@/components/film/FilmShell';
import { getProject, rebuildFromCard, shotStats, filmApi, type FilmScene } from '@/lib/film/api';

export default function MontagePage() {
  const id = String(useParams()?.id || '');
  const [title, setTitle] = useState('Film');
  const [scenes, setScenes] = useState<FilmScene[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cut, setCut] = useState<{ url: string; id: string; coverage: number } | null>(null);

  const load = useCallback(async () => {
    const card = await getProject(id);
    if (card) { const s = rebuildFromCard(card); setTitle(s.title); setScenes(s.scenes); const last = s.versions[s.versions.length - 1]; if (last?.media_url) setCut({ url: last.media_url, id: last.id, coverage: last.coverage ?? 0 }); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const stats = shotStats(scenes);
  const ratio = stats.total ? stats.shot / stats.total : 0;

  async function montage() {
    setBusy(true); setErr(null);
    const { ok, status, d } = await filmApi.montage(id);
    setBusy(false);
    if (status === 409 && d?.error === 'no_takes') { setErr('Filme au moins un plan (🎬 Tourner) avant de monter.'); return; }
    if (!ok) { setErr(d?.detail || d?.need || d?.error || `HTTP ${status}`); return; }
    setCut({ url: d.media_url, id: d.version_id, coverage: d.coverage });
  }

  return (
    <FilmShell title={title} back={`/creer/oeuvre/${id}/tournage`}>
      <StepHeader title="Montage" subtitle="On garde la meilleure prise de chaque plan et on assemble ton film. Il grandit à chaque nouveau plan tourné." />

      <div className="bg-white border border-[#EAECEF] rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-[17px] font-black text-[#141519]" style={{ fontFamily: "'Outfit',sans-serif" }}>Plans tournés</span>
          <span className="text-[17px] font-black" style={{ color: '#FF7F11' }}>{stats.shot} / {stats.total}</span>
        </div>
        <div className="h-2.5 rounded-full mt-3 overflow-hidden" style={{ background: '#EDEFF2' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.round(ratio * 100)}%`, background: '#FF7F11' }} />
        </div>
      </div>

      <CtaButton onClick={montage} disabled={busy}>{busy ? 'Montage en cours…' : '🎬 Monter le film'}</CtaButton>

      {cut && (
        <div className="mt-4">
          <div className="text-[14px] font-extrabold mb-2" style={{ color: '#15803D' }}>✅ Version {cut.id} · {cut.coverage}% des plans tournés</div>
          <video src={cut.url} controls playsInline className="w-full rounded-2xl bg-black" />
        </div>
      )}

      {err && <p className="text-[#C0392B] mt-3 text-[14px]">{err}</p>}
    </FilmShell>
  );
}
