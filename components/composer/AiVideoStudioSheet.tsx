'use client';

/**
 * Studio Vidéo IA (Pascal 2026-06-10, refonte prompt-first 2026-06-11).
 * PAS un formulaire : un gros champ « décris ta vidéo », une ligne de toggles
 * compacts (format / voix / IA / ⋯) et GÉNÉRER en héros. Tout le détail
 * (transition, choix de voix, musique, clés) est planqué derrière « ⋯ ».
 * Sujet → script (Ollama/DeepSeek) → images (SDXL) → voix (XTTS) → montage ffmpeg.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Loader2, Check, Volume2, VolumeX, Play, Pause, MoreHorizontal } from 'lucide-react';

type Ratio = '9:16' | '1:1' | '16:9';
interface VoiceOption { id: string; name: string; desc: string; tier?: 'free' | 'premium' }
interface Niche { name: string; audience: string; why: string; exampleTitles: string[]; competition: string; rpmHint: string }
const TRANSITIONS: { key: string; label: string }[] = [
  { key: 'fade', label: 'Fondu' }, { key: 'dissolve', label: 'Dissous' }, { key: 'slide', label: 'Glisse' },
  { key: 'wipe', label: 'Balayage' }, { key: 'circle', label: 'Cercle' }, { key: 'zoom', label: 'Zoom' }, { key: 'none', label: 'Aucune' },
];
interface Options { voiceAvailable: boolean; voices: VoiceOption[]; music: { id: string; name: string; category: string }[] }

interface Props {
  initialTopic?: string;
  imageUrls?: string[]; // images déjà attachées au composer (optionnel)
  onClose: () => void;
  onResult: (r: { url: string; posterUrl: string; title: string }) => void;
}

const RATIOS: { key: Ratio; label: string }[] = [
  { key: '9:16', label: 'Reel / TikTok (9:16)' },
  { key: '1:1', label: 'Carré (1:1)' },
  { key: '16:9', label: 'YouTube (16:9)' },
];

export default function AiVideoStudioSheet({ initialTopic, imageUrls, onClose, onResult }: Props) {
  const [topic, setTopic] = useState(initialTopic || '');
  const [ratio, setRatio] = useState<Ratio>('9:16');
  const [opts, setOpts] = useState<Options | null>(null);
  const [voiceId, setVoiceId] = useState<string>('');
  const [voiceover, setVoiceover] = useState(true);
  const [musicId, setMusicId] = useState<string>('chill-1');
  const [transition, setTransition] = useState<string>('fade');
  const [visualMode, setVisualMode] = useState<'clips' | 'ai'>('clips');
  // Niches rentables
  const [niches, setNiches] = useState<Niche[] | null>(null);
  const [loadingNiches, setLoadingNiches] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; posterUrl: string; title: string } | null>(null);
  // BYOK — mes clés IA
  const [keyStatus, setKeyStatus] = useState<Record<string, { set: boolean; hint: string | null }>>({});
  const [showKeys, setShowKeys] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false); // « ⋯ » : options planquées (pas un formulaire)
  const [elevenInput, setElevenInput] = useState('');
  const [pexelsInput, setPexelsInput] = useState('');
  const [hfInput, setHfInput] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ai-video/options').then((r) => r.json()).then((d: Options) => {
      setOpts(d);
      if (d.voices?.[0]) setVoiceId(d.voices[0].id);
    }).catch(() => setOpts({ voiceAvailable: false, voices: [], music: [] }));
    fetch('/api/ai-keys').then((r) => r.json()).then((d) => setKeyStatus(d.status || {})).catch(() => {});
  }, []);

  const saveKey = async (provider: 'elevenlabs' | 'pexels' | 'huggingface', value: string) => {
    if (!value.trim()) return;
    setSavingKey(provider);
    try {
      const r = await fetch('/api/ai-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, key: value.trim() }) });
      const d = await r.json();
      if (r.ok) { setKeyStatus(d.status || {}); if (provider === 'elevenlabs') setElevenInput(''); else if (provider === 'pexels') setPexelsInput(''); else setHfInput(''); }
    } finally { setSavingKey(null); }
  };
  const deleteKey = async (provider: 'elevenlabs' | 'pexels' | 'huggingface') => {
    const r = await fetch(`/api/ai-keys?provider=${provider}`, { method: 'DELETE' });
    const d = await r.json().catch(() => null);
    if (r.ok && d) setKeyStatus(d.status || {});
  };

  // Pré-écoute des voix
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewVoice = async (id: string) => {
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (playing === id) { setPlaying(null); return; }
      setPlaying(id);
      const r = await fetch(`/api/ai-video/voice-sample?voiceId=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!r.ok || !d.url) { setPlaying(null); return; }
      const a = new Audio(d.url);
      audioRef.current = a;
      a.onended = () => setPlaying(null);
      a.onerror = () => setPlaying(null);
      await a.play().catch(() => setPlaying(null));
    } catch { setPlaying(null); }
  };

  const loadNiches = async () => {
    if (loadingNiches) return;
    setLoadingNiches(true);
    try {
      const r = await fetch('/api/ai-video/niches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 6 }) });
      const d = await r.json();
      setNiches(d.niches || []);
    } catch { setNiches([]); } finally { setLoadingNiches(false); }
  };

  const genAbort = useRef<AbortController | null>(null);
  const generate = async () => {
    if (busy || !topic.trim()) return;
    setBusy(true); setError(null); setPreview(null);
    const ac = new AbortController();
    genAbort.current = ac;
    try {
      const res = await fetch('/api/ai-video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          topic: topic.trim(),
          imageUrls: imageUrls || [],
          ratio,
          voiceId,
          voiceover: voiceover && !!opts?.voiceAvailable,
          musicId,
          transition,
          visualMode,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) { setError(d.detail || d.error || 'Échec de génération'); return; }
      setPreview({ url: d.url, posterUrl: d.posterUrl, title: d.title });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
      genAbort.current = null;
    }
  };

  const handleClose = () => {
    if (genAbort.current) { genAbort.current.abort(); genAbort.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    onClose();
  };
  useEffect(() => () => { if (genAbort.current) genAbort.current.abort(); }, []);

  const KEYS = [
    { p: 'elevenlabs' as const, label: 'ElevenLabs (voix)', url: 'https://elevenlabs.io/app/settings/api-keys', val: elevenInput, set: setElevenInput, ph: 'sk_…' },
    { p: 'pexels' as const, label: 'Pexels (clips vidéo)', url: 'https://www.pexels.com/api/', val: pexelsInput, set: setPexelsInput, ph: 'clé Pexels…' },
    { p: 'huggingface' as const, label: 'Hugging Face (images IA)', url: 'https://huggingface.co/settings/tokens', val: hfInput, set: setHfInput, ph: 'hf_…' },
  ];

  return (
    <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end" onClick={handleClose}>
      <div
        className="w-full max-h-[92dvh] overflow-y-auto bg-[#0e0e12] rounded-t-3xl border-t border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête minimal */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-white font-bold text-[16px] tracking-tight">Studio IA</h2>
          <button onClick={handleClose} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-4 h-4" /></button>
        </div>

        {preview ? (
          /* ===== APERÇU ===== */
          <div className="space-y-3 mt-3">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={preview.url} poster={preview.posterUrl} controls autoPlay loop playsInline
              className="w-full max-h-[58dvh] rounded-2xl bg-black object-contain" />
            <p className="text-white/70 text-[13px] text-center">{preview.title}</p>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="flex-1 py-3 rounded-xl bg-white/10 text-white/85 text-[14px] font-medium">Refaire</button>
              <button onClick={() => onResult(preview)} className="flex-1 py-3 rounded-xl bg-white text-black text-[14px] font-semibold inline-flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Utiliser</button>
            </div>
          </div>
        ) : (
          /* ===== CONSOLE PROMPT-FIRST ===== */
          <div className="mt-3 space-y-4">
            {/* Gros champ unique */}
            <textarea
              value={topic} onChange={(e) => setTopic(e.target.value)} rows={4} maxLength={1200}
              placeholder="Décris ta vidéo…"
              autoFocus
              className="w-full bg-white/[0.06] border border-white/12 rounded-2xl px-4 py-4 text-white text-[17px] leading-relaxed outline-none resize-none placeholder:text-white/30 focus:border-white/25"
            />

            {/* Ligne de toggles compacts — pas de champs empilés */}
            <div className="flex items-center gap-2">
              <button onClick={() => setRatio((r) => (r === '9:16' ? '1:1' : r === '1:1' ? '16:9' : '9:16'))}
                className="px-3 py-2 rounded-full text-[13px] font-medium border border-white/15 bg-white/[0.05] text-white/85 active:scale-95">
                {ratio}
              </button>
              {opts?.voiceAvailable && (
                <button onClick={() => setVoiceover((v) => !v)}
                  className={'px-3 py-2 rounded-full text-[13px] font-medium border inline-flex items-center gap-1.5 active:scale-95 ' + (voiceover ? 'border-white/60 bg-white/[0.14] text-white' : 'border-white/15 bg-white/[0.05] text-white/55')}>
                  {voiceover ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />} Voix
                </button>
              )}
              <button onClick={() => setVisualMode((m) => (m === 'ai' ? 'clips' : 'ai'))}
                className={'px-3 py-2 rounded-full text-[13px] font-medium border active:scale-95 ' + (visualMode === 'ai' ? 'border-white/60 bg-white/[0.14] text-white' : 'border-white/15 bg-white/[0.05] text-white/55')}>
                {visualMode === 'ai' ? 'Images IA' : 'Clips'}
              </button>
              <button onClick={() => setShowAdvanced((v) => !v)} aria-label="Plus d'options"
                className={'ml-auto w-10 h-10 rounded-full grid place-items-center border active:scale-95 ' + (showAdvanced ? 'border-white/60 bg-white/[0.14] text-white' : 'border-white/15 bg-white/[0.05] text-white/70')}>
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>

            {/* GÉNÉRER — héros */}
            {error && <p className="text-white/90 text-[13px] bg-white/[0.06] border border-white/15 rounded-xl px-3 py-2">{error}</p>}
            <button onClick={generate} disabled={busy || !topic.trim()}
              className="w-full py-4 rounded-2xl bg-white text-black text-[16px] font-extrabold tracking-wide inline-flex items-center justify-center gap-2 disabled:opacity-30 active:scale-[0.99]">
              {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> GÉNÉRATION…</> : <>GÉNÉRER <span className="text-[18px] leading-none">→</span></>}
            </button>
            {busy && <p className="text-white/40 text-[11px] text-center">Script → voix → images → montage, sur ton GPU. Reste sur l&apos;écran.</p>}

            {/* ===== PANNEAU AVANCÉ (planqué derrière « ⋯ ») ===== */}
            {showAdvanced && (
              <div className="space-y-4 pt-3 border-t border-white/8">
                {/* Idées de niches */}
                <div>
                  <button onClick={loadNiches} disabled={loadingNiches}
                    className="text-[12px] text-white/60 inline-flex items-center gap-1 disabled:opacity-50">
                    {loadingNiches ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Idées de niches rentables
                  </button>
                  {niches && (
                    <div className="space-y-1.5 mt-2">
                      {niches.map((nz, i) => (
                        <button key={i} onClick={() => { setTopic(`${nz.name} — ${nz.exampleTitles?.[0] || ''}`.trim()); }}
                          className="w-full text-left bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 active:scale-[0.99]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-white text-[13px] font-medium">{nz.name}</span>
                            <span className="text-[10px] px-1.5 py-px rounded leading-none bg-white/10 text-white/60">concurrence {nz.competition}</span>
                          </div>
                          <div className="text-white/45 text-[11px] mt-0.5 line-clamp-2">{nz.why}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Format détaillé */}
                <div>
                  <label className="text-white/50 text-[12px] mb-1.5 block">Format</label>
                  <div className="grid grid-cols-3 gap-2">
                    {RATIOS.map((r) => (
                      <button key={r.key} onClick={() => setRatio(r.key)}
                        className={'py-2 rounded-xl text-[12px] border ' + (ratio === r.key ? 'border-white/60 bg-white/[0.14] text-white' : 'border-white/12 bg-white/[0.05] text-white/70')}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transition */}
                <div>
                  <label className="text-white/50 text-[12px] mb-1.5 block">Transition</label>
                  <div className="grid grid-cols-4 gap-2">
                    {TRANSITIONS.map((tr) => (
                      <button key={tr.key} onClick={() => setTransition(tr.key)}
                        className={'py-1.5 rounded-lg text-[11px] border ' + (transition === tr.key ? 'border-white/60 bg-white/[0.14] text-white' : 'border-white/12 bg-white/[0.05] text-white/70')}>
                        {tr.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voix : choix + écoute */}
                {opts?.voiceAvailable && voiceover && (
                  <div>
                    <label className="text-white/50 text-[12px] mb-1.5 block">Voix off</label>
                    <div className="grid grid-cols-2 gap-2">
                      {opts.voices.map((v) => (
                        <div key={v.id}
                          className={'py-2 pl-2 pr-1.5 rounded-xl border flex items-center gap-1.5 ' + (voiceId === v.id ? 'border-white/60 bg-white/[0.14]' : 'border-white/12 bg-white/[0.05]')}>
                          <button onClick={() => setVoiceId(v.id)} className="flex-1 text-left min-w-0">
                            <div className="text-white text-[13px] font-medium flex items-center gap-1.5">
                              {v.name}
                              {v.tier === 'premium' && <span className="text-[9px] px-1 py-px rounded bg-white/15 text-white/70 leading-none">PREMIUM</span>}
                            </div>
                            <div className="text-white/45 text-[11px] truncate">{v.desc}</div>
                          </button>
                          <button onClick={() => previewVoice(v.id)} aria-label={`Écouter ${v.name}`}
                            className="shrink-0 w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80 active:scale-90">
                            {playing === v.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Musique */}
                {opts?.music?.length ? (
                  <div>
                    <label className="text-white/50 text-[12px] mb-1.5 block">Musique de fond</label>
                    <select value={musicId} onChange={(e) => setMusicId(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/12 rounded-xl px-3 py-2.5 text-white text-[14px] outline-none">
                      {opts.music.map((m) => <option key={m.id} value={m.id} className="bg-[#101015]">{m.name} · {m.category}</option>)}
                    </select>
                  </div>
                ) : null}

                {/* Clés externes (optionnel) */}
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <button type="button" onClick={() => setShowKeys((v) => !v)} className="w-full px-3 py-2.5 flex items-center justify-between text-left">
                    <span className="text-white/80 text-[13px] font-medium">Clés externes <span className="text-[11px] text-white/40">optionnel — le GPU maison suffit</span></span>
                    <span className="text-white/40 text-[12px]">{showKeys ? '▲' : '▼'}</span>
                  </button>
                  {showKeys && (
                    <div className="px-3 pb-3 space-y-3 border-t border-white/8 pt-3">
                      {KEYS.map((k) => (
                        <div key={k.p}>
                          <label className="text-white/60 text-[12px] mb-1 flex items-center justify-between">
                            <span>{k.label} <a href={k.url} target="_blank" rel="noreferrer" className="text-white/55 underline">obtenir</a></span>
                            {keyStatus[k.p]?.set && <span className="text-white/70 text-[11px]">●●● {keyStatus[k.p].hint} <button onClick={() => deleteKey(k.p)} className="text-white/40 ml-1">retirer</button></span>}
                          </label>
                          <div className="flex gap-2">
                            <input value={k.val} onChange={(e) => k.set(e.target.value)} type="password" placeholder={keyStatus[k.p]?.set ? 'remplacer…' : k.ph}
                              className="flex-1 bg-white/[0.06] border border-white/12 rounded-lg px-2.5 py-2 text-white text-[13px] outline-none placeholder:text-white/30" />
                            <button onClick={() => saveKey(k.p, k.val)} disabled={savingKey === k.p || !k.val.trim()} className="px-3 rounded-lg bg-white text-black text-[12px] font-medium disabled:opacity-40">OK</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
