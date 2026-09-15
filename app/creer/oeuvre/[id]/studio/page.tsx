'use client';
/**
 * /creer/oeuvre/[id]/studio — STUDIO, table de montage (Couche 1, Pascal 2026-09-12).
 * L'auto-montage devient ÉDITABLE : on réordonne / rogne / supprime les plans et on choisit la
 * transition (coupe franche ou fondu) à chaque jointure. Auto-save (comme le multicam). « Rendre »
 * assemble la timeline éditée → aperçu → « Télécharger ». Le montage auto (étape précédente) reste intact.
 * PARITÉ NATIVE : miroir de StudioScreen (film_studio_table.dart). NATIF = référence.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { FilmShell, StepHeader } from '@/components/film/FilmShell';
import { filmApi, type FilmStudioItem, type FilmTextCard, type FilmSoundtrack } from '@/lib/film/api';

async function uploadAudioFile(file: File): Promise<string | null> {
  const fd = new FormData(); fd.append('file', file);
  const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  return d?.url || null;
}

const ACCENT = '#FF7F11';

export default function StudioPage() {
  const id = String(useParams()?.id || '');
  const [items, setItems] = useState<FilmStudioItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null); // bloc dont le rognage est ouvert
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [rendering, setRendering] = useState(false);
  const [cut, setCut] = useState<{ url: string; id: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [soundtrack, setSoundtrack] = useState<FilmSoundtrack | null>(null); // bande sonore film (Couche 3)
  const [audioPanel, setAudioPanel] = useState<string | null>(null);         // clip dont le panneau redub est ouvert
  const [uploading, setUploading] = useState(false);
  const skipSave = useRef(true); // ne pas sauver au premier rendu (chargement)

  const load = useCallback(async () => {
    const { ok, d } = await filmApi.studioTimeline(id);
    if (ok && Array.isArray(d?.items)) { skipSave.current = true; setItems(d.items as FilmStudioItem[]); setSoundtrack((d.soundtrack as FilmSoundtrack) || null); }
    setLoaded(true);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // AUTO-SAVE (débounce 800 ms) — timeline + bande sonore persistent même si on quitte sans bouton (parité multicam).
  useEffect(() => {
    if (!loaded) return;
    if (skipSave.current) { skipSave.current = false; return; }
    const t = setTimeout(() => { filmApi.studioSave(id, items, soundtrack).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [items, soundtrack, loaded, id]);

  function move(i: number, dir: -1 | 1) {
    setItems((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function remove(i: number) {
    setItems((arr) => arr.filter((_, k) => k !== i));
    setExpanded(null);
  }
  function setTransition(i: number, type: 'cut' | 'fade') {
    setItems((arr) => arr.map((it, k) => (k === i ? { ...it, transitionIn: type } : it)));
  }
  function setTrim(i: number, fromSec: number, toSec: number) {
    setItems((arr) => arr.map((it, k) => {
      if (k !== i) return it;
      const c0 = it.clips[0];
      if (!c0) return it;
      const clips = [...it.clips];
      clips[0] = { ...c0, fromSec: Math.max(0, fromSec), toSec: Math.max(fromSec + 0.1, toSec) };
      return { ...it, clips };
    }));
  }

  // ── CARTONS DE GÉNÉRIQUE (Couche 2) : titre de début (au tout début), carton (à la fin), crédits (à la fin). ──
  function addCard(role: 'title' | 'credits' | 'carton') {
    const card: FilmTextCard = {
      role,
      title: role === 'title' ? '' : role === 'credits' ? 'Fin' : '',
      subtitle: role === 'credits' ? 'Réalisé avec Talk2Me' : undefined,
      durationSec: role === 'title' ? 3 : role === 'credits' ? 5 : 3,
      bg: '#000000',
    };
    const item: FilmStudioItem = {
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind: 'card', sceneId: '', shotId: '', clips: [], transitionIn: 'fade', card,
    };
    setItems((arr) => (role === 'title' ? [item, ...arr] : [...arr, item]));
    setExpanded(item.id); // ouvre l'édition tout de suite
  }
  function updateCard(i: number, patch: Partial<FilmTextCard>) {
    setItems((arr) => arr.map((it, k) => (k === i && it.card ? { ...it, card: { ...it.card, ...patch } } : it)));
  }

  // ── REDOUBLAGE (Couche 3) : remplacer / superposer un audio sur un plan. ──
  async function pickClipAudio(i: number, file: File) {
    setUploading(true); setErr(null);
    const url = await uploadAudioFile(file);
    setUploading(false);
    if (!url) { setErr('Import audio échoué.'); return; }
    setItems((arr) => arr.map((it, k) => (k === i ? { ...it, audio: { url, mode: 'replace', volume: 100 } } : it)));
  }
  function updateClipAudio(i: number, patch: Partial<{ mode: 'replace' | 'mix'; volume: number }>) {
    setItems((arr) => arr.map((it, k) => (k === i && it.audio ? { ...it, audio: { ...it.audio, ...patch } } : it)));
  }
  function removeClipAudio(i: number) {
    setItems((arr) => arr.map((it, k) => { if (k !== i) return it; const { audio: _a, ...rest } = it; return rest as FilmStudioItem; }));
  }

  // ── BANDE SONORE film (Couche 3). ──
  async function pickSoundtrack(file: File) {
    setUploading(true); setErr(null);
    const url = await uploadAudioFile(file);
    setUploading(false);
    if (!url) { setErr('Import musique échoué.'); return; }
    setSoundtrack({ url, musicVolume: 40, originalVolume: 100 });
  }

  async function render() {
    setRendering(true); setErr(null);
    await filmApi.studioSave(id, items, soundtrack); // fige la timeline + bande sonore avant de rendre
    const { ok, status, d } = await filmApi.montageStudio(id);
    setRendering(false);
    if (status === 409 && d?.error === 'no_takes') { setErr('Aucun plan à monter.'); return; }
    if (!ok) { setErr(d?.detail || d?.error || `HTTP ${status}`); return; }
    setCut({ url: d.media_url, id: d.version_id });
  }

  return (
    <FilmShell title="Studio" back={`/creer/oeuvre/${id}/montage`}>
      <StepHeader title="Table de montage" subtitle="Réordonne, rogne et choisis les transitions. Ton montage se sauve tout seul. « Rendre » assemble le film final." />

      {!loaded ? (
        <p className="text-center text-[#9DAAB7] text-[13px] mt-10">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="text-center mt-14 px-6">
          <div className="text-[40px] mb-2">🎬</div>
          <p className="text-[15px] font-bold text-[#2F343A]">Rien à monter</p>
          <p className="text-[13px] text-[#6A7585] mt-1">Monte d'abord le film (étape précédente) pour remplir la table.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {items.map((it, i) => {
            const url = it.clips[0]?.media_url || '';
            const multicam = it.clips.length > 1;
            const dur = durations[it.id] || 0;
            const from = it.clips[0]?.fromSec || 0;
            const to = (it.clips[0]?.toSec || 0) > from ? (it.clips[0]?.toSec || 0) : dur;
            const open = expanded === it.id;
            return (
              <div key={it.id}>
                {/* Transition DEPUIS le bloc précédent (le 1er bloc n'en a pas). */}
                {i > 0 && (
                  <div className="flex items-center justify-center gap-1.5 my-1">
                    <span className="text-[11px] text-[#9AA3AF]">↳ transition :</span>
                    {(['cut', 'fade'] as const).map((t) => (
                      <button key={t} type="button" onClick={() => setTransition(i, t)}
                        className="text-[11.5px] font-extrabold rounded-full px-2.5 py-1 transition"
                        style={it.transitionIn === t
                          ? { background: ACCENT, color: '#fff' }
                          : { background: '#F1F2F4', color: '#6A7585' }}>
                        {t === 'cut' ? '✂️ Coupe' : '🌫 Fondu'}
                      </button>
                    ))}
                  </div>
                )}

                {it.kind === 'card' ? (
                  /* CARTON DE GÉNÉRIQUE (Couche 2) : titre de début / carton / crédits de fin. */
                  <div className="rounded-2xl p-2.5" style={{ background: '#FBF9FF', border: '1px solid #E7DBFF' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-14 rounded-lg grid place-items-center text-white text-center px-1 shrink-0 overflow-hidden" style={{ background: it.card?.bg || '#000' }}>
                        <span className="text-[11px] font-black leading-tight line-clamp-2">{it.card?.title || '—'}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold text-[#6D28D9]">{it.card?.role === 'title' ? '🎬 Titre de début' : it.card?.role === 'credits' ? '🏁 Crédits de fin' : '📝 Carton'}</div>
                        <div className="text-[11.5px] text-[#6A7585] truncate">{(it.card?.durationSec || 3).toFixed(0)}s{it.card?.subtitle ? ` · ${it.card.subtitle}` : ''}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter" className="w-8 h-8 grid place-items-center rounded-lg text-[16px] disabled:opacity-30" style={{ background: '#EEE6FF' }}>↑</button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Descendre" className="w-8 h-8 grid place-items-center rounded-lg text-[16px] disabled:opacity-30" style={{ background: '#EEE6FF' }}>↓</button>
                        <button type="button" onClick={() => setExpanded(open ? null : it.id)} aria-label="Éditer" className="w-8 h-8 grid place-items-center rounded-lg text-[14px]" style={{ background: open ? '#6D28D9' : '#EEE6FF', color: open ? '#fff' : '#2F343A' }}>✎</button>
                        <button type="button" onClick={() => remove(i)} aria-label="Supprimer" className="w-8 h-8 grid place-items-center rounded-lg text-[15px]" style={{ background: '#FDECEC', color: '#D14343' }}>🗑</button>
                      </div>
                    </div>
                    {open && (
                      <div className="mt-2.5 flex flex-col gap-2">
                        <input value={it.card?.title || ''} onChange={(e) => updateCard(i, { title: e.target.value })} placeholder={it.card?.role === 'title' ? 'Titre du film' : 'Titre du carton'}
                          className="w-full rounded-xl border border-[#E7DBFF] p-2.5 text-[15px] font-bold" />
                        <input value={it.card?.subtitle || ''} onChange={(e) => updateCard(i, { subtitle: e.target.value })} placeholder="Sous-titre (ex. « Réalisé par… », facultatif)"
                          className="w-full rounded-xl border border-[#E7DBFF] p-2.5 text-[14px]" />
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-[#6A7585] w-16">Durée</span>
                          <input type="range" min={1} max={15} step={1} value={it.card?.durationSec || 3} onChange={(e) => updateCard(i, { durationSec: parseInt(e.target.value, 10) })} className="flex-1 accent-[#6D28D9]" />
                          <span className="text-[12px] text-[#9AA3AF] w-8 text-right tabular-nums">{(it.card?.durationSec || 3).toFixed(0)}s</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-[#6A7585] w-16">Fond</span>
                          {['#000000', '#111827', '#7C2D12', '#1E3A8A', '#FFFFFF'].map((c) => (
                            <button key={c} type="button" onClick={() => updateCard(i, { bg: c })} aria-label={c}
                              className="w-6 h-6 rounded-full border" style={{ background: c, borderColor: (it.card?.bg || '#000') === c ? '#6D28D9' : '#D8DCE1', borderWidth: (it.card?.bg || '#000') === c ? 2 : 1 }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white border border-[#EAECEF] rounded-2xl p-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 shrink-0 grid place-items-center rounded-lg text-[13px] font-black" style={{ background: '#F3EEFF', color: '#6D28D9' }}>{i + 1}</div>
                      {/* Vignette vidéo (source du rognage : elle défile quand on bouge les poignées). */}
                      <video
                        id={`v_${it.id}`} src={url} muted playsInline preload="metadata"
                        onLoadedMetadata={(e) => setDurations((d) => ({ ...d, [it.id]: (e.target as HTMLVideoElement).duration || 0 }))}
                        className="w-24 h-14 rounded-lg bg-black object-cover shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold text-[#141519] truncate">Plan {i + 1}{multicam ? ' · multicam' : ''}</div>
                        <div className="text-[11.5px] text-[#6A7585]">{dur ? `${(to - from).toFixed(1)}s` : '…'}{multicam ? ' · monté aux angles' : ''}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter" className="w-8 h-8 grid place-items-center rounded-lg text-[16px] disabled:opacity-30" style={{ background: '#F1F2F4' }}>↑</button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Descendre" className="w-8 h-8 grid place-items-center rounded-lg text-[16px] disabled:opacity-30" style={{ background: '#F1F2F4' }}>↓</button>
                        {!multicam && (
                          <button type="button" onClick={() => { setExpanded(open ? null : it.id); setAudioPanel(null); }} aria-label="Rogner" className="w-8 h-8 grid place-items-center rounded-lg text-[15px]" style={{ background: open ? ACCENT : '#F1F2F4', color: open ? '#fff' : '#2F343A' }}>✂</button>
                        )}
                        {!multicam && (
                          <button type="button" onClick={() => { setAudioPanel(audioPanel === it.id ? null : it.id); setExpanded(null); }} aria-label="Redoubler" className="w-8 h-8 grid place-items-center rounded-lg text-[14px]" style={{ background: it.audio ? '#DCFCE7' : (audioPanel === it.id ? ACCENT : '#F1F2F4'), color: audioPanel === it.id ? '#fff' : (it.audio ? '#15803D' : '#2F343A') }}>🎙</button>
                        )}
                        <button type="button" onClick={() => remove(i)} aria-label="Supprimer" className="w-8 h-8 grid place-items-center rounded-lg text-[15px]" style={{ background: '#FDECEC', color: '#D14343' }}>🗑</button>
                      </div>
                    </div>

                    {/* Rognage (mono-prise) : deux poignées ; en bougeant, l'aperçu vidéo défile à la position. */}
                    {open && !multicam && dur > 0 && (
                      <div className="mt-2.5 px-1">
                        <TrimRow label="Début" value={from} min={0} max={Math.max(0, to - 0.2)} vid={`v_${it.id}`} onChange={(v) => setTrim(i, v, to)} />
                        <TrimRow label="Fin" value={to} min={from + 0.2} max={dur} vid={`v_${it.id}`} onChange={(v) => setTrim(i, from, v)} />
                      </div>
                    )}

                    {/* Redoublage (mono-prise) : remplacer/superposer un son sur ce plan. */}
                    {audioPanel === it.id && !multicam && (
                      <div className="mt-2.5 px-1">
                        {!it.audio ? (
                          <label className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-extrabold cursor-pointer" style={{ background: '#F0FDF4', color: '#15803D', border: '1px dashed #86EFAC' }}>
                            {uploading ? 'Import…' : '🎙 Ajouter une voix / un son (fichier audio)'}
                            <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickClipAudio(i, f); }} />
                          </label>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <audio src={it.audio.url} controls className="w-full h-8" />
                            <div className="flex gap-2">
                              {(['replace', 'mix'] as const).map((m) => (
                                <button key={m} type="button" onClick={() => updateClipAudio(i, { mode: m })}
                                  className="flex-1 rounded-lg py-2 text-[12px] font-extrabold"
                                  style={it.audio!.mode === m ? { background: '#15803D', color: '#fff' } : { background: '#F1F2F4', color: '#6A7585' }}>
                                  {m === 'replace' ? 'Remplacer le son' : 'Ajouter par-dessus'}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#6A7585] w-14">Volume</span>
                              <input type="range" min={0} max={150} step={5} value={it.audio.volume} onChange={(e) => updateClipAudio(i, { volume: parseInt(e.target.value, 10) })} className="flex-1 accent-[#15803D]" />
                              <span className="text-[11px] text-[#9AA3AF] w-10 text-right tabular-nums">{it.audio.volume}%</span>
                            </div>
                            <button type="button" onClick={() => removeClipAudio(i)} className="self-start text-[12px] font-bold text-[#D14343]">Retirer le redoublage</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {loaded && items.length > 0 && (
        <>
          {/* BANDE SONORE (Couche 3) : musique de fond sur tout le film. */}
          <div className="rounded-2xl p-3 mb-3" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <div className="text-[13.5px] font-black text-[#15803D] mb-2">🎵 Bande sonore</div>
            {!soundtrack ? (
              <label className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-extrabold cursor-pointer" style={{ background: '#fff', color: '#15803D', border: '1px dashed #86EFAC' }}>
                {uploading ? 'Import…' : '➕ Ajouter une musique de fond'}
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickSoundtrack(f); }} />
              </label>
            ) : (
              <div className="flex flex-col gap-2">
                <audio src={soundtrack.url} controls className="w-full h-8" />
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#6A7585] w-20">Musique</span>
                  <input type="range" min={0} max={150} step={5} value={soundtrack.musicVolume} onChange={(e) => setSoundtrack({ ...soundtrack, musicVolume: parseInt(e.target.value, 10) })} className="flex-1 accent-[#15803D]" />
                  <span className="text-[11px] text-[#9AA3AF] w-10 text-right tabular-nums">{soundtrack.musicVolume}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#6A7585] w-20">Son du film</span>
                  <input type="range" min={0} max={150} step={5} value={soundtrack.originalVolume} onChange={(e) => setSoundtrack({ ...soundtrack, originalVolume: parseInt(e.target.value, 10) })} className="flex-1 accent-[#15803D]" />
                  <span className="text-[11px] text-[#9AA3AF] w-10 text-right tabular-nums">{soundtrack.originalVolume}%</span>
                </div>
                <button type="button" onClick={() => setSoundtrack(null)} className="self-start text-[12px] font-bold text-[#D14343]">Retirer la musique</button>
              </div>
            )}
          </div>

          {/* GÉNÉRIQUE (Couche 2) : ajouter des cartons texte. Titre → au début, crédits/carton → à la fin. */}
          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => addCard('title')} className="flex-1 rounded-xl py-2.5 text-[12.5px] font-extrabold" style={{ background: '#F3EEFF', color: '#6D28D9', border: '1px solid #DDD0FF' }}>🎬 Titre</button>
            <button type="button" onClick={() => addCard('carton')} className="flex-1 rounded-xl py-2.5 text-[12.5px] font-extrabold" style={{ background: '#F3EEFF', color: '#6D28D9', border: '1px solid #DDD0FF' }}>📝 Carton</button>
            <button type="button" onClick={() => addCard('credits')} className="flex-1 rounded-xl py-2.5 text-[12.5px] font-extrabold" style={{ background: '#F3EEFF', color: '#6D28D9', border: '1px solid #DDD0FF' }}>🏁 Crédits</button>
          </div>

          <button type="button" onClick={render} disabled={rendering}
            className="w-full rounded-2xl py-4 text-white text-[16px] font-extrabold active:scale-[0.99] transition disabled:opacity-60"
            style={{ fontFamily: "'Outfit',sans-serif", background: ACCENT }}>
            {rendering ? 'Assemblage en cours…' : '🎬 Rendre le film'}
          </button>

          {cut && (
            <div className="mt-4">
              <div className="text-[14px] font-extrabold mb-2" style={{ color: '#15803D' }}>✅ Version {cut.id} rendue</div>
              <video src={cut.url} controls playsInline className="rounded-2xl bg-black mx-auto" style={{ width: '100%', maxHeight: 260, objectFit: 'contain' }} />
              <a href={cut.url} download={`film-studio.mp4`}
                onClick={() => { filmApi.finalize(id).catch(() => {}); }}
                className="block w-full mt-3 rounded-2xl py-4 text-white text-[17px] font-extrabold text-center active:scale-[0.99] transition"
                style={{ fontFamily: "'Outfit',sans-serif", background: '#1A1D21' }}>⬇ Télécharger le film</a>
              <p className="text-[#6A7585] text-[12.5px] mt-2 text-center">Le film n'est pas publié automatiquement. Publie-le via le composer quand il est fini.</p>
            </div>
          )}
        </>
      )}

      {err && <p className="text-[#C0392B] mt-3 text-[14px]">{err}</p>}
    </FilmShell>
  );
}

/** Une poignée de rognage : au drag, l'aperçu vidéo (id `vid`) défile à la seconde choisie (Pascal : pas à l'aveugle). */
function TrimRow({ label, value, min, max, vid, onChange }: { label: string; value: number; min: number; max: number; vid: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[11.5px] text-[#6A7585] w-10 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={0.1} value={Math.min(max, Math.max(min, value))}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(v);
          const el = document.getElementById(vid) as HTMLVideoElement | null;
          if (el) { try { el.currentTime = v; } catch { /* seek best-effort */ } }
        }}
        className="flex-1 accent-[#FF7F11]" />
      <span className="text-[11px] text-[#9AA3AF] w-10 text-right tabular-nums">{value.toFixed(1)}s</span>
    </div>
  );
}
