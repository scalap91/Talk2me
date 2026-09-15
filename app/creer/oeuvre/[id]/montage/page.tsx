'use client';
/**
 * /creer/oeuvre/[id]/montage — ÉTAPE 5 « Montage » (miroir natif MontageScreen, Pascal 2026-09-10).
 * Garde la meilleure prise de chaque plan et assemble le film. Progression « N / 12 plans tournés »
 * + bouton « Monter le film » → assemble une version (ffmpeg) et la prévisualise.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FilmShell, StepHeader, CtaButton } from '@/components/film/FilmShell';
import { getProject, rebuildFromCard, shotStats, shotCameras, filmApi, type FilmScene } from '@/lib/film/api';
import MulticamEditor, { type MulticamCamera } from '@/components/film/MulticamEditor';

interface MulticamShot { sceneId: string; shotId: string; label: string; cameras: MulticamCamera[]; initSegs: { takeId: string; fromSec: number; toSec: number }[]; edited: boolean }

export default function MontagePage() {
  const id = String(useParams()?.id || '');
  const router = useRouter();
  const [title, setTitle] = useState('Film');
  const [scenes, setScenes] = useState<FilmScene[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cut, setCut] = useState<{ url: string; id: string; coverage: number } | null>(null);
  const [editing, setEditing] = useState<MulticamShot | null>(null);

  const load = useCallback(async () => {
    const card = await getProject(id);
    if (card) { const s = rebuildFromCard(card); setTitle(s.title); setScenes(s.scenes); const last = s.versions[s.versions.length - 1]; if (last?.media_url) setCut({ url: last.media_url, id: last.id, coverage: last.coverage ?? 0 }); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const stats = shotStats(scenes);
  const ratio = stats.total ? stats.shot / stats.total : 0;

  // Plans filmés par ≥2 caméras → montage manuel au cross-fader (parité natif).
  const multicamShots: MulticamShot[] = [];
  for (const sc of scenes) {
    for (const sh of sc.shots || []) {
      const cams = shotCameras(sh);
      if (cams.length < 2) continue;
      multicamShots.push({
        sceneId: sc.id, shotId: sh.id,
        label: sc.title ? `${sc.title} · ${sh.cameraRole || sh.intention || 'Plan'}` : (sh.cameraRole || sh.intention || 'Plan'),
        cameras: cams.map((t, k) => ({ takeId: t.id, url: t.media_url || '', label: `Caméra ${k + 1}` })),
        initSegs: (sh.multicamEdit?.segments || []),
        edited: !!(sh.multicamEdit?.segments?.length),
      });
    }
  }

  async function montage() {
    setBusy(true); setErr(null);
    const { ok, status, d } = await filmApi.montage(id);
    setBusy(false);
    if (status === 409 && d?.error === 'no_takes') { setErr('Filme au moins un plan (🎬 Tourner) avant de monter.'); return; }
    if (!ok) { setErr(d?.detail || d?.need || d?.error || `HTTP ${status}`); return; }
    setCut({ url: d.media_url, id: d.version_id, coverage: d.coverage });
  }

  // PAS de publication directe au feed (Pascal 2026-09-11 : dangereux — films pas finis / ratés).
  // On TÉLÉCHARGE le film ; il n'entre au feed que via le composer « film terminé », quand l'auteur décide.

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

      {multicamShots.length > 0 && (
        <div className="mt-4">
          <div className="text-[16px] font-black text-[#141519] flex items-center gap-1.5" style={{ fontFamily: "'Outfit',sans-serif" }}>🎥 Plans multi-caméras</div>
          <p className="text-[#6A7585] text-[12.5px] mt-0.5 mb-2.5">Plusieurs caméras ont filmé ces plans. Monte-les à la main : alterne les angles au cross-fader.</p>
          {multicamShots.map((mc) => (
            <div key={mc.shotId} className="flex items-center gap-3 bg-white border border-[#EAECEF] rounded-xl p-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13.5px] text-[#141519] truncate">{mc.label}</div>
                <div className="text-[12px]" style={{ color: mc.edited ? '#22C55E' : '#6A7585' }}>{mc.cameras.length} caméras{mc.edited ? ' · monté ✓' : ''}</div>
              </div>
              <button type="button" onClick={() => setEditing(mc)} disabled={busy}
                className="rounded-[10px] px-3 py-2.5 text-white text-[12.5px] font-extrabold disabled:opacity-60"
                style={{ fontFamily: "'Outfit',sans-serif", background: '#1A1D21' }}>
                {mc.edited ? 'Rééditer' : 'Éditer les angles'}
              </button>
            </div>
          ))}
        </div>
      )}

      {cut && (
        <div className="mt-4">
          <div className="text-[14px] font-extrabold mb-2" style={{ color: '#15803D' }}>✅ Version {cut.id} · {cut.coverage}% des plans tournés</div>
          {/* Aperçu borné : compact même si la vidéo est portrait (parité natif). */}
          <video src={cut.url} controls playsInline className="rounded-2xl bg-black mx-auto" style={{ width: '100%', maxHeight: 240, objectFit: 'contain' }} />
          {/* ✂️ ÉDITER EN STUDIO (Pascal 2026-09-12) : reprendre la main sur le montage auto — table de
              montage (réordonner, rogner, transitions). Le geste auto ci-dessus n'est pas cassé. */}
          <button type="button" onClick={() => router.push(`/creer/oeuvre/${id}/studio`)}
            className="block w-full mt-3 rounded-2xl py-3.5 text-[15.5px] font-extrabold text-center active:scale-[0.99] transition"
            style={{ fontFamily: "'Outfit',sans-serif", background: '#F3EEFF', color: '#6D28D9', border: '1px solid #DDD0FF' }}>
            ✂️ Éditer en Studio (peaufiner le montage)
          </button>
          {/* Télécharger le film (PAS de publication directe au feed — Pascal 2026-09-11). Pour le publier,
              tu l'attacheras via le composer « film terminé » quand tu jugeras qu'il est fini. */}
          <a href={cut.url} download={`${(title || 'film').replace(/[^a-z0-9]+/gi, '-')}.mp4`}
            onClick={() => { filmApi.finalize(id).catch(() => {}); }} // télécharger = terminé → statut 🎬 Film (même projet)
            className="block w-full mt-3 rounded-2xl py-4 text-white text-[17px] font-extrabold text-center active:scale-[0.99] transition"
            style={{ fontFamily: "'Outfit',sans-serif", background: '#1A1D21' }}>⬇ Télécharger le film</a>
          <p className="text-[#6A7585] text-[12.5px] mt-2 text-center">Le film n’est pas publié automatiquement. Quand il est fini, publie-le via le composer.</p>
        </div>
      )}

      {err && <p className="text-[#C0392B] mt-3 text-[14px]">{err}</p>}

      {editing && (
        <MulticamEditor
          projectId={id}
          sceneId={editing.sceneId}
          shotId={editing.shotId}
          shotLabel={editing.label}
          cameras={editing.cameras}
          initialSegments={editing.initSegs}
          onClose={async (saved) => { setEditing(null); await load(); if (saved) await montage(); }}
        />
      )}
    </FilmShell>
  );
}
