'use client';

/**
 * Talk2Me — COMPOSER STUDIO (Pascal 2026-06-12).
 * Pas un bouton magique : une table de montage intelligente.
 *   ┌ PLAN IA (ce que l'IA a compris) ┬ APERÇU (brouillon vidéo) ┐
 *   └ TIMELINE (scènes/blocs cliquables) — éditeur de la scène sélectionnée ┘
 *   [Modifier] [Régénérer cette scène] [Publier]
 * Modifs ciblées : script→voix+lèvres+sous-titres · image→sa scène · avatar→Léa · musique→piste · sous-titres→sans re-rendu.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play, Send, Sparkles, RefreshCw, Plus, Mic, MicOff, User, Music, Image as ImageIcon, Captions } from '@/lib/icons';

type BlockStatus = 'draft' | 'rendered' | 'modified' | 'error';
type BlockKind = 'image' | 'voice' | 'avatar' | 'subtitle' | 'music' | 'motion';
interface Block { status: BlockStatus; url: string | null; error?: string | null }
interface Scene {
  id: string; script: string; caption: string; visual_prompt: string; image_override: string | null;
  voice: Block; image: Block; avatar: Block; subtitle: Block; motion?: Block;
}
interface Project {
  id: string; request: string; title: string; intent: string; format: string; ratio: string;
  ton: string; cta: string; hashtags: string[]; text: string; presenter: boolean; voiceover: boolean;
  scenes: Scene[]; music: Block; draft_url: string | null; poster_url: string | null;
  status: BlockStatus; published_card_id: string | null;
}

const DOT: Record<BlockStatus, string> = { draft: 'bg-neutral-500', rendered: 'bg-emerald-500', modified: 'bg-amber-500', error: 'bg-red-500' };
const LABEL: Record<BlockStatus, string> = { draft: 'à générer', rendered: 'prêt', modified: 'à régénérer', error: 'erreur' };

function Dot({ s }: { s: BlockStatus }) { return <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[s]}`} />; }

export default function ComposerProjectEditor({ initialPrompt, initialProjectId }: { initialPrompt?: string; initialProjectId?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [project, setProject] = useState<Project | null>(null);
  const [sel, setSel] = useState<string | null>(null);     // scène sélectionnée
  const [creating, setCreating] = useState(false);
  const [rendering, setRendering] = useState(false);        // rendu global
  const [regen, setRegen] = useState<string | null>(null);  // scène en cours de régénération
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  // « Donner vie » asynchrone (Pascal 2026-06-19) : scène en cours d'animation + secondes écoulées
  // → barre de progression, et on ne tient pas une requête de 2-3 min (qui lâche sur mobile).
  const [motionScene, setMotionScene] = useState<string | null>(null);
  const [motionElapsed, setMotionElapsed] = useState(0);
  const timers = useRef<Record<string, any>>({});

  // Polling pendant l'animation : récupère le projet toutes les 4 s jusqu'à motion rendered/error.
  useEffect(() => {
    if (!motionScene || !project) return;
    setMotionElapsed(0);
    const t0 = Date.now();
    const tick = setInterval(() => setMotionElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/composer/projects/${project.id}`, { cache: 'no-store' });
        const d = await r.json();
        if (!d?.project) return;
        setProject(d.project);
        const sc = d.project.scenes.find((s: Scene) => s.id === motionScene);
        const st = sc?.motion?.status;
        if (st === 'rendered' || st === 'error') { setMotionScene(null); }
      } catch { /* retry */ }
    }, 4000);
    return () => { clearInterval(tick); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionScene]);

  // Reprise d'un projet existant (?project=<id>)
  useEffect(() => {
    if (!initialProjectId) return;
    (async () => {
      try {
        const r = await fetch(`/api/composer/projects/${initialProjectId}`);
        const d = await r.json();
        if (d.ok) { setProject(d.project); setSel(d.project.scenes[0]?.id || null); }
      } catch { /* ignore */ }
    })();
  }, [initialProjectId]);

  const isText = project?.format === 'text_post';
  const isMedia = project && !isText;
  const scene = project?.scenes.find((s) => s.id === sel) || null;

  async function create() {
    const req = prompt.trim(); if (!req || creating) return;
    setCreating(true); setError(null); setPublishedId(null);
    try {
      const r = await fetch('/api/composer/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: req }) });
      const d = await r.json(); if (!d.ok) throw new Error(d.detail || d.error);
      setProject(d.project); setSel(d.project.scenes[0]?.id || null);
    } catch (e) { setError((e as Error).message); } finally { setCreating(false); }
  }

  function patchScene(sceneId: string, patch: Record<string, any>) {
    if (!project) return;
    setProject((p) => p && ({ ...p, scenes: p.scenes.map((s) => s.id === sceneId ? { ...s, ...patch } : s) }));
    const key = sceneId + Object.keys(patch).join();
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      const r = await fetch(`/api/composer/projects/${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneId, ...patch }) });
      const d = await r.json(); if (d.ok) setProject(d.project);
    }, 500);
  }

  async function patchGlobal(patch: Record<string, any>) {
    if (!project) return;
    const r = await fetch(`/api/composer/projects/${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const d = await r.json(); if (d.ok) setProject(d.project);
  }

  async function render(opts?: { sceneId?: string; blocks?: BlockKind[] }) {
    if (!project) return;
    if (opts?.sceneId) setRegen(opts.sceneId); else setRendering(true);
    setError(null);
    try {
      const r = await fetch(`/api/composer/projects/${project.id}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts || {}) });
      const d = await r.json(); if (!d.ok) throw new Error(d.detail || d.error);
      setProject(d.project);
    } catch (e) { setError((e as Error).message); } finally { setRegen(null); setRendering(false); }
  }

  // « Donner vie » (Pascal 2026-06-19) : lance l'animation I2V en TÂCHE DE FOND (réponse immédiate),
  // puis le polling (useEffect) suit l'avancement et réinjecte le clip dans le montage à la fin.
  // → barre de progression visible, et plus de requête tenue 2-3 min qui lâche sur mobile.
  async function animateScene(sceneId: string) {
    if (motionScene || !project) return;
    setError(null);
    setMotionScene(sceneId);   // déclenche le polling + la barre
    try {
      const r = await fetch(`/api/composer/projects/${project.id}/render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId, blocks: ['motion'], background: true }),
      });
      const d = await r.json();
      if (d?.project) setProject(d.project);   // motion passe en 'modified' (en cours)
      if (!d?.ok) { setError('Lancement impossible.'); setMotionScene(null); }
    } catch { setError('Échec réseau.'); setMotionScene(null); }
  }

  const router = useRouter();
  // « Utiliser dans le post » : le studio NE publie PAS. Il RENVOIE le média généré
  // à la page 1 du composer (/creer/texte), seul endroit où l'on décide Publier ou
  // Brouillon (Pascal 2026-06-21). Aligné sur AiVideoStudioSheet.onResult.
  async function useInComposer() {
    if (!project || publishing) return;
    const isTextFmt = project.format === 'text_post';
    const params = new URLSearchParams({ from: 'composer' });
    if (isTextFmt) {
      params.set('text', (project.text || project.title || '').slice(0, 500));
    } else {
      const sceneImgs = project.scenes.filter((s) => s.image?.url);
      let media = project.draft_url;
      let kind = (project.format === 'image' || project.format === 'carousel') ? 'image' : 'video';
      // PLUSIEURS scènes + pas encore de montage → on ASSEMBLE le montage (toutes les
      // images en UNE vidéo-histoire) pour ne RIEN perdre. Avant on ne gardait qu'1 image
      // (bug Pascal 2026-06-21).
      if (!media && sceneImgs.length > 1) {
        setPublishing(true);
        try {
          const r = await fetch(`/api/composer/projects/${project.id}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          const d = await r.json();
          if (d?.project) { setProject(d.project); if (d.project.draft_url) { media = d.project.draft_url; kind = 'video'; } }
        } catch { /* repli image ci-dessous */ }
      }
      // Repli : 1 seule scène ou montage indisponible → 1re image fixe.
      if (!media) { media = sceneImgs[0]?.image.url || null; kind = 'image'; }
      if (!media) { setError('Aucun média à reprendre — relance la génération.'); setPublishing(false); return; }
      params.set('media', media);
      params.set('kind', kind);
    }
    const cap = [project.title, project.cta].filter(Boolean).join(' — ');
    if (cap) params.set('caption', cap);
    if (project.hashtags?.length) params.set('tags', project.hashtags.join(','));
    params.set('project', project.id); // pour revenir éditer les 4 images dans le studio
    setPublishing(true);
    router.push('/creer/texte?' + params.toString());
  }

  // ====================== ÉCRAN D'ENTRÉE ======================
  if (!project) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-10 text-neutral-100">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
          <label className="mb-2 flex items-center gap-2 text-sm text-neutral-400"><Sparkles className="h-4 w-4 text-violet-400" /> Décris ce que tu veux créer</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="ex. fais une vidéo sur cet hôtel…"
            className="h-28 w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-[15px] outline-none placeholder:text-neutral-600 focus:border-neutral-600" />
          <button onClick={create} disabled={creating || !prompt.trim()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-medium text-black disabled:opacity-40">
            {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyse…</> : 'Ouvrir le studio'}
          </button>
          {error && <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>}
        </div>
      </div>
    );
  }

  // ====================== STUDIO ======================
  return (
    <div className="mx-auto max-w-3xl px-3 pb-28 pt-4 text-neutral-100">
      {/* haut : PLAN IA (gauche) + APERÇU (centre/droite) */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">

        {/* ---------- PLAN IA ---------- */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">Plan IA</div>
            <input value={project.title} onChange={(e) => setProject({ ...project, title: e.target.value })} onBlur={(e) => patchGlobal({ title: e.target.value })}
              className="w-full bg-transparent text-lg font-semibold outline-none" />
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-neutral-400">
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 capitalize">{project.intent}</span>
              <span className="rounded-full bg-neutral-800 px-2 py-0.5">{project.format.replace('_', ' ')}</span>
              <span className="rounded-full bg-neutral-800 px-2 py-0.5">{project.ratio}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5"><Dot s={project.status} /> {LABEL[project.status]}</span>
            </div>
          </div>

          {/* contrôles globaux : voix / avatar / musique / sous-titres */}
          {isMedia && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Pistes</div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <button onClick={() => patchGlobal({ voiceover: !project.voiceover })} className="flex items-center gap-2 rounded-lg border border-neutral-800 px-2.5 py-2">
                  {project.voiceover ? <Mic className="h-3.5 w-3.5 text-emerald-400" /> : <MicOff className="h-3.5 w-3.5 text-neutral-500" />} Voix {project.voiceover ? 'on' : 'off'}
                </button>
                <button onClick={() => patchGlobal({ presenter: !project.presenter })} className="flex items-center gap-2 rounded-lg border border-neutral-800 px-2.5 py-2">
                  <User className={`h-3.5 w-3.5 ${project.presenter ? 'text-violet-400' : 'text-neutral-500'}`} /> Avatar Léa {project.presenter ? 'on' : 'off'}
                </button>
                <div className="flex items-center gap-2 rounded-lg border border-neutral-800 px-2.5 py-2 text-neutral-400"><Music className="h-3.5 w-3.5" /> Musique <span className="ml-auto"><Dot s={project.music.status} /></span></div>
                <div className="flex items-center gap-2 rounded-lg border border-neutral-800 px-2.5 py-2 text-neutral-400"><Captions className="h-3.5 w-3.5" /> Sous-titres</div>
              </div>
            </div>
          )}

          {/* text_post : corps éditable */}
          {isText && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Texte</div>
              <textarea defaultValue={project.text} onBlur={(e) => patchGlobal({ text: e.target.value })}
                className="h-56 w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-[15px] outline-none focus:border-neutral-600" />
            </div>
          )}
        </div>

        {/* ---------- APERÇU ---------- */}
        <div className="rounded-2xl border border-neutral-800 bg-black">
          <div className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wide text-neutral-500">
            Aperçu {rendering && <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />}
          </div>
          <div className="flex min-h-[300px] items-center justify-center p-3">
            {project.draft_url ? (
              project.format === 'image' || project.format === 'carousel'
                ? <img src={project.draft_url} alt="" className="max-h-[58vh] rounded-lg" />
                : <video src={project.draft_url} poster={project.poster_url || undefined} controls playsInline className="max-h-[58vh] rounded-lg" />
            ) : scene?.image.url ? (
              // Pas encore de montage assemblé → on montre l'image de la scène en cours
              // (générée dès la création) pour ne JAMAIS avoir un aperçu vide. Pascal 2026-06-21.
              <img src={scene.image.url} alt="" className="max-h-[58vh] rounded-lg" />
            ) : (
              <div className="text-center text-sm text-neutral-600">
                {isText ? 'Post texte — pas d\'aperçu vidéo' : <>Pas encore de brouillon.<br />Lance un <span className="text-neutral-400">Aperçu</span>.</>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------- TIMELINE ---------- */}
      {isMedia && (
        <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Timeline</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {project.scenes.map((s, i) => {
              const active = s.id === sel;
              const kind = project.presenter ? 'Léa parle' : (s.image.url ? 'Image' : 'Scène');
              return (
                <button key={s.id} onClick={() => setSel(s.id)}
                  className={`relative w-28 shrink-0 overflow-hidden rounded-xl border text-left ${active ? 'border-violet-500' : 'border-neutral-800'}`}>
                  <div className="relative h-16 w-full bg-neutral-950">
                    {s.image.url ? <img src={s.image.url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImageIcon className="h-4 w-4 text-neutral-700" /></div>}
                    {regen === s.id && <div className="absolute inset-0 flex items-center justify-center bg-black/60"><Loader2 className="h-4 w-4 animate-spin" /></div>}
                  </div>
                  <div className="px-2 py-1">
                    <div className="text-[11px] font-medium">{i + 1}. {kind}</div>
                    <div className="mt-1 flex items-center gap-1">
                      <span title={`image ${LABEL[s.image.status]}`}><Dot s={s.image.status} /></span>
                      <span title={`voix ${LABEL[s.voice.status]}`}><Dot s={s.voice.status} /></span>
                      {project.presenter && <span title={`avatar ${LABEL[s.avatar.status]}`}><Dot s={s.avatar.status} /></span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- ÉDITEUR DE LA SCÈNE SÉLECTIONNÉE ---------- */}
      {isMedia && scene && (
        <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">Scène {project.scenes.findIndex((s) => s.id === scene.id) + 1}</span>
            <div className="flex gap-1.5">
              {[['image', 'Image'], ['voice', 'Voix'], project.presenter ? ['avatar', 'Léa'] : null].filter(Boolean).map((b: any) => (
                <button key={b[0]} onClick={() => render({ sceneId: scene.id, blocks: [b[0]] })} disabled={!!regen}
                  className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 disabled:opacity-40">↻ {b[1]}</button>
              ))}
              <button onClick={() => render({ sceneId: scene.id })} disabled={!!regen}
                className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-0.5 text-[11px] font-medium disabled:opacity-40">
                {regen === scene.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Régénérer la scène
              </button>
              {/* Studio créatif — anime l'image fixe en clip (motion), réinjecté dans le montage (notre GPU) */}
              {scene.image.url && (
                <button onClick={() => animateScene(scene.id)} disabled={!!motionScene || !!regen}
                  title="Anime l'image de cette scène en vidéo (notre GPU, ~2-3 min) — réinjectée dans le montage"
                  className="inline-flex items-center gap-1 rounded-full bg-cyan-600 px-2.5 py-0.5 text-[11px] font-medium disabled:opacity-40">
                  {motionScene === scene.id ? <Loader2 className="h-3 w-3 animate-spin" /> : (scene.motion?.url ? '✓' : '✨')} {motionScene === scene.id ? 'Animation…' : (scene.motion?.url ? 'Re-animer' : 'Donner vie')}
                </button>
              )}
            </div>
          </div>
          <label className="mb-1 block text-[11px] text-neutral-500">Script (→ voix + lèvres + sous-titres)</label>
          <textarea value={scene.script} onChange={(e) => patchScene(scene.id, { script: e.target.value })}
            className="h-20 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 p-2.5 text-[14px] outline-none focus:border-neutral-600" />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-neutral-500">Sous-titre incrusté (n'altère pas la vidéo)</label>
              <input value={scene.caption} onChange={(e) => patchScene(scene.id, { caption: e.target.value })}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-[13px] outline-none focus:border-neutral-600" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-neutral-500">Visuel (→ régénère seulement cette image)</label>
              <input value={scene.visual_prompt} onChange={(e) => patchScene(scene.id, { visual_prompt: e.target.value })}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-[13px] text-neutral-400 outline-none focus:border-neutral-600" />
            </div>
          </div>
          {/* Image fixe → vivante : barre de progression pendant l'animation, puis aperçu du clip (réinjecté). */}
          {(motionScene === scene.id || scene.motion?.url || (scene.motion?.error && scene.motion.error !== null)) && (
            <div className="mt-3 rounded-xl border border-cyan-900/50 bg-cyan-950/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-cyan-400">
                Scène vivante {scene.motion?.url && motionScene !== scene.id && '· dans le montage'}
              </div>
              {motionScene === scene.id ? (
                <div className="py-2">
                  <div className="mb-2 flex items-center gap-2 text-sm text-neutral-300">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                    Animation sur ton GPU… {motionElapsed}s <span className="text-neutral-500">/ ~2-3 min — tu peux continuer à éditer</span>
                  </div>
                  {/* barre de progression (estimée sur ~150 s) */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div className="h-full rounded-full bg-cyan-500 transition-all duration-1000" style={{ width: `${Math.min(96, Math.round((motionElapsed / 150) * 100))}%` }} />
                  </div>
                </div>
              ) : scene.motion?.url ? (
                <video src={scene.motion.url} autoPlay loop muted playsInline controls className="max-h-[40vh] rounded-lg" />
              ) : (
                <div className="py-3 text-sm text-amber-300">Animation indisponible ({scene.motion?.error}). Le montage garde l'image fixe.</div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>}
      {publishedId && <div className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">Publié dans le feed ✓</div>}

      {/* ---------- BARRE D'ACTIONS ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-neutral-950/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button onClick={() => { setProject(null); setSel(null); setPublishedId(null); }} className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-800 px-3 py-2.5 text-sm text-neutral-400"><Plus className="h-4 w-4" /> Nouveau</button>
          {isMedia && (
            <button onClick={() => render()} disabled={rendering || !!regen}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 py-3 font-medium disabled:opacity-40">
              {rendering ? <><Loader2 className="h-4 w-4 animate-spin" /> Rendu…</> : project.draft_url ? <><RefreshCw className="h-4 w-4" /> Régénérer tout</> : <><Play className="h-4 w-4" /> Aperçu</>}
            </button>
          )}
          <button onClick={useInComposer} disabled={publishing}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white py-3 font-medium text-black disabled:opacity-40">
            {publishing ? <><Loader2 className="h-4 w-4 animate-spin" /> …</> : <><Send className="h-4 w-4" /> Utiliser dans le post</>}
          </button>
        </div>
      </div>
    </div>
  );
}
