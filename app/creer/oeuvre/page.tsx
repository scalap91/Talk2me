'use client';
/**
 * /creer/oeuvre — COMPOSER WEB « Œuvre » (Album · Film) — Pascal 2026-07-21.
 *
 * MIROIR EXACT du composer natif `create_card.dart` (mêmes choix, mêmes champs, même `.card`) :
 *  - Album  → POST /api/cards/media/publish { kind:'album', … }        (spec:1 actuel)
 *  - Film TERMINÉ → POST /api/cards/media/publish { kind:'film', … }   (spec:1 actuel)
 *  - Film EN PROJET → POST /api/project/create { kind project… }       (spec:2, œuvre vivante)
 * Uploads via /api/upload (FormData `file`). Aligne le web sur le natif (doctrine « SEUL composer »).
 */
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BackButton from '@/components/system/BackButton';

const ACCENT = '#FF7F11';

// Barre de retour — INDISPENSABLE en app web (WebView) : sans elle on reste coincé sur la page.
function BackBar() {
  return (
    <BackButton label="Retour" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#6A7585] hover:text-[#141519] transition-colors mb-3" />
  );
}

async function uploadFile(f: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', f);
  const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
  if (!r.ok) return null;
  const d = await r.json();
  return typeof d?.url === 'string' ? d.url : null;
}

type View = { badge?: { label?: string }; title?: string; progress?: { label?: string; needs?: { total?: number; open?: number; filledRatio?: number } } };

function CreerOeuvreInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Page FILM uniquement — l'ALBUM a désormais son composer dédié (/creer/album). Modules distincts.
  const [filmMode, setFilmMode] = useState<'termine' | 'projet'>('projet');
  // communs
  const [cover, setCover] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [price, setPrice] = useState('');
  // film terminé
  const [full, setFull] = useState<string | null>(null);
  const [trailer, setTrailer] = useState<string | null>(null);
  const [synopsis, setSynopsis] = useState('');
  // film en projet
  const [idea, setIdea] = useState('');
  const [loc, setLoc] = useState('');
  const [crowd, setCrowd] = useState('');
  const [cams, setCams] = useState('1'); // nb de téléphones/caméras réels → borne le multicam de l'IA
  // état
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  // progression projet
  const [projectId, setProjectId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [missions, setMissions] = useState(0);
  const [myProjects, setMyProjects] = useState<{ id: string; title: string; lifecycle: string }[]>([]);
  const [showForm, setShowForm] = useState(false); // LISTE d'abord (comme le natif) ; « + » ouvre le formulaire
  // producteur créatif (scénario généré étape par étape)
  const [steps, setSteps] = useState<{ step: string; text: string }[]>([]);
  const [nextStep, setNextStep] = useState<string | null>('logline');
  // storyboard (VS2) : validations + découpage + plans
  const [screenplayOk, setScreenplayOk] = useState(false);
  const [breakdownOk, setBreakdownOk] = useState(false);
  const [scenes, setScenes] = useState<{ id: string; title?: string; location?: string; summary?: string; shots?: unknown[] }[]>([]);
  const [busyScene, setBusyScene] = useState<string | null>(null);
  const [reviseKey, setReviseKey] = useState<string | null>(null); // étape/scène en cours de modif IA
  const [reviseText, setReviseText] = useState('');
  // montage (VS5)
  const [cut, setCut] = useState<{ url: string; id: string; coverage: number } | null>(null);

  async function pick(accept: string, set: (u: string) => void) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return;
      setBusy(true); setErr(null);
      const url = await uploadFile(f);
      setBusy(false);
      if (url) set(url); else setErr('Upload échoué');
    };
    input.click();
  }

  // Film TERMINÉ : publie la carte média (kind:film). Le film EN PROJET passe par createProject.
  async function publishMedia() {
    setBusy(true); setErr(null); setOkMsg(null);
    try {
      const p = Number(price) || 0;
      const priceObj = p > 0 ? { amount: p, currency: 'Ar' } : undefined;
      const payload = { kind: 'film', title: title.trim(), cover, full, trailer, synopsis: synopsis.trim(), ...(priceObj ? { price: priceObj } : {}) };
      const r = await fetch('/api/cards/media/publish', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error || `HTTP ${r.status}`); return; }
      setOkMsg('✅ Film publié — visible dans le feed.');
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  async function createProject() {
    setBusy(true); setErr(null);
    try {
      const scenes = (crowd.trim() || loc.trim())
        ? [{ id: 'scene-1', title: 'Scène 1', ...(loc.trim() ? { location: loc.trim() } : {}), productionHints: { ...(Number(crowd) > 0 ? { crowdSize: Number(crowd) } : {}) } }]
        : undefined;
      const r = await fetch('/api/project/create', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'film', title: title.trim(), idea: idea.trim(), ...(scenes ? { film: { scenes } } : {}), constraints: { devices: Math.min(6, Math.max(1, Number(cams) || 1)) } }) });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error === 'disabled' ? 'Module projet désactivé (flag OFF).' : (d?.issues?.join(' ; ') || d?.error || `HTTP ${r.status}`)); return; }
      setProjectId(d.id); setView(d.view); setNextStep('logline');
      // Reprenable : on met l'id dans l'URL + localStorage → un rechargement retrouve le projet.
      try { localStorage.setItem('t2m_last_project', d.id); } catch { /* privé */ }
      router.replace(`/creer/oeuvre?project=${d.id}`);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  // Reconstruit tout l'état d'un projet existant depuis sa carte (source de vérité).
  const rebuildFromCard = useCallback((card: { project?: { film?: { creativeDevelopment?: Record<string, string>; scenes?: { id: string; title?: string; location?: string; summary?: string; shots?: unknown[] }[] }; approvals?: { stage: string; state: string }[] } }, viewD: View | null) => {
    const cd = card?.project?.film?.creativeDevelopment || {};
    const order = ['logline', 'synopsis', 'treatment', 'screenplay'];
    setSteps(order.filter((k) => cd[k]).map((k) => ({ step: k, text: cd[k] })));
    setNextStep(order.find((k) => !cd[k]) || null);
    const appr = (card?.project?.approvals || []).filter((a) => a.state === 'approved' || a.state === 'locked').map((a) => a.stage);
    setScreenplayOk(appr.includes('screenplay'));
    setBreakdownOk(appr.includes('breakdown'));
    setScenes(card?.project?.film?.scenes || []);
    setView(viewD);
  }, []);

  // Charge un projet existant (par id) et reprend là où on s'était arrêté.
  const loadExisting = useCallback(async (pid: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/project/${pid}?context=full`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok || !d?.card) { try { localStorage.removeItem('t2m_last_project'); } catch { /* */ } return; }
      setFilmMode('projet'); setProjectId(pid);
      rebuildFromCard(d.card, d.view || null);
    } catch { /* réseau */ } finally { setBusy(false); }
  }, [rebuildFromCard]);

  // Liste « Mes films en projet » (page 1 : les retrouver, avec stylo + poubelle).
  const loadMine = useCallback(async () => {
    try {
      const r = await fetch('/api/project/mine', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setMyProjects(Array.isArray(d.projects) ? d.projects : []);
    } catch { /* réseau */ }
  }, []);

  // Au montage : reprend le projet depuis l'URL (?project=) ou le dernier ouvert, sinon liste les projets.
  useEffect(() => {
    const pid = searchParams.get('project') || (typeof localStorage !== 'undefined' ? localStorage.getItem('t2m_last_project') : null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pid) loadExisting(pid); else loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✏️ Ouvrir un projet existant depuis la liste (reprend où on s'était arrêté).
  function openProject(pid: string) {
    router.replace(`/creer/oeuvre?project=${pid}`);
    loadExisting(pid);
  }

  // 🗑️ Supprimer un projet depuis la liste (ownership vérifié côté serveur).
  async function removeProject(pid: string) {
    if (typeof window !== 'undefined' && !window.confirm('Supprimer ce film en projet ? Cette action est définitive.')) return;
    try {
      const r = await fetch(`/api/project/${pid}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d?.error || `HTTP ${r.status}`); return; }
      if (typeof localStorage !== 'undefined' && localStorage.getItem('t2m_last_project') === pid) localStorage.removeItem('t2m_last_project');
      setMyProjects((l) => l.filter((p) => p.id !== pid));
    } catch (e) { setErr(String(e)); }
  }

  async function resolveNeeds() {
    if (!projectId) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/project/${projectId}/resolve-needs`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error || `HTTP ${r.status}`); return; }
      setView(d.view); setMissions((d.missions_created || []).length);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  // Producteur-IA : génère l'étape créative suivante (logline → synopsis → traitement → scénario).
  async function develop() {
    if (!projectId) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/project/${projectId}/develop`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
      const d = await r.json();
      if (r.status === 503 && d?.error === 'llm_unavailable') { setErr("IA indisponible — écris l'étape toi-même (saisie manuelle à venir)."); return; }
      if (!r.ok) { setErr(d?.error || `HTTP ${r.status}`); return; }
      setSteps((s) => [...s, { step: d.step, text: d.generated }]);
      setNextStep(d.next); if (d.view) setView(d.view);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }
  const STEP_FR: Record<string, string> = { logline: 'la logline', synopsis: 'le synopsis', treatment: 'le traitement', screenplay: 'le scénario' };
  const LIFECYCLE_FR: Record<string, string> = { idea: '💡 Idée', writing: '✍️ Écriture', preproduction: '🎬 Préproduction', shooting: '🎥 Tournage', postproduction: '✂️ Montage', ready: '✅ Prêt' };

  // Boîte « dire à l'IA quoi changer » — réutilisée par chaque étape et chaque scène.
  // L'IA réécrit l'élément visé en restant COHÉRENTE avec le reste du script.
  function reviseBox(itemKey: string, onSend: () => void, isBusy: boolean) {
    if (reviseKey !== itemKey) {
      return <button onClick={() => { setReviseKey(itemKey); setReviseText(''); setErr(null); }} style={{ background: 'none', border: 0, color: '#7C5CFF', fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: '6px 0' }}>✏️ Modifier (dire à l&apos;IA)</button>;
    }
    return (
      <div style={{ marginTop: 6 }}>
        <textarea autoFocus value={reviseText} onChange={(e) => setReviseText(e.target.value)}
          placeholder="Dis à l'IA ce qu'il faut changer (ex. « rends-la plus tendue », « ajoute un personnage »). Elle garde la cohérence avec le reste du film."
          style={{ ...input, minHeight: 62, marginBottom: 6 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onSend} disabled={isBusy || !reviseText.trim()} style={{ ...btn(isBusy || !reviseText.trim()), flex: 1, marginTop: 0, padding: 11, fontSize: 14 }}>{isBusy ? "L'IA modifie…" : '✨ Appliquer (cohérent)'}</button>
          <button onClick={() => { setReviseKey(null); setReviseText(''); }} style={{ background: '#F1F2F4', color: '#6A7585', border: 0, borderRadius: 10, padding: '0 16px', fontWeight: 800, cursor: 'pointer' }}>Annuler</button>
        </div>
      </div>
    );
  }

  // Valide une étape (scénario / découpage) — gate obligatoire avant la suite.
  async function approve(stage: 'screenplay' | 'breakdown') {
    if (!projectId) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/project/${projectId}/approve`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage, state: 'approved' }) });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error || `HTTP ${r.status}`); return; }
      if (stage === 'screenplay') setScreenplayOk(true); else setBreakdownOk(true);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  // Découpage : scénario → scènes (VS2).
  async function breakdown() {
    if (!projectId) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/project/${projectId}/storyboard`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
      const d = await r.json();
      if (r.status === 503) { setErr('IA indisponible pour le découpage.'); return; }
      if (!r.ok) { setErr(d?.need ? `À valider d'abord : ${d.need}` : (d?.error || `HTTP ${r.status}`)); return; }
      setScenes(d.scenes || []);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  // Plans d'une scène (VS2).
  async function genShots(sceneId: string) {
    if (!projectId) return;
    setBusyScene(sceneId); setErr(null);
    try {
      const r = await fetch(`/api/project/${projectId}/storyboard`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scene_id: sceneId }) });
      const d = await r.json();
      if (r.status === 503) { setErr('IA indisponible pour les plans.'); return; }
      if (!r.ok) { setErr(d?.need ? `À valider d'abord : ${d.need}` : (d?.error || `HTTP ${r.status}`)); return; }
      setScenes((sc) => sc.map((s) => (s.id === sceneId ? { ...s, shots: d.shots || [] } : s)));
    } catch (e) { setErr(String(e)); } finally { setBusyScene(null); }
  }

  // Modifier une ÉTAPE via consigne : l'IA réécrit l'étape en restant cohérente avec le script.
  async function reviseStep(step: string) {
    if (!projectId || !reviseText.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/project/${projectId}/develop`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step, instruction: reviseText.trim() }) });
      const d = await r.json();
      if (r.status === 503) { setErr('IA indisponible pour la modification.'); return; }
      if (!r.ok) { setErr(d?.error || `HTTP ${r.status}`); return; }
      setSteps((s) => s.map((x) => (x.step === step ? { ...x, text: d.generated } : x)));
      setReviseKey(null); setReviseText('');
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  // Modifier une SCÈNE via consigne : l'IA réécrit la scène en restant cohérente avec le script.
  async function reviseScene(sceneId: string) {
    if (!projectId || !reviseText.trim()) return;
    setBusyScene(sceneId); setErr(null);
    try {
      const r = await fetch(`/api/project/${projectId}/storyboard`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scene_id: sceneId, instruction: reviseText.trim() }) });
      const d = await r.json();
      if (r.status === 503) { setErr('IA indisponible pour la modification.'); return; }
      if (!r.ok) { setErr(d?.error || `HTTP ${r.status}`); return; }
      if (d.scene) setScenes((sc) => sc.map((s) => (s.id === sceneId ? { ...s, ...d.scene } : s)));
      setReviseKey(null); setReviseText('');
    } catch (e) { setErr(String(e)); } finally { setBusyScene(null); }
  }

  // Esquisse (dessin SVG via DeepSeek) d'un plan → overlay de tournage.
  async function genSketch(sceneId: string, shotId: string) {
    if (!projectId) return;
    setBusyScene(shotId); setErr(null);
    try {
      const r = await fetch(`/api/project/${projectId}/storyboard`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scene_id: sceneId, shot_id: shotId, sketch: true }) });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error === 'no_svg' ? "L'IA n'a pas rendu de dessin, réessaie." : (d?.error || `HTTP ${r.status}`)); return; }
      setScenes((sc) => sc.map((s) => (s.id !== sceneId ? s : { ...s, shots: (s.shots as { id: string }[] || []).map((sh) => (sh.id === shotId ? { ...sh, storyboardImage: d.storyboardImage } : sh)) })));
    } catch (e) { setErr(String(e)); } finally { setBusyScene(null); }
  }

  // Montage : garde la meilleure prise de chaque plan → assemble une version du film.
  async function montage() {
    if (!projectId) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/project/${projectId}/montage`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
      const d = await r.json();
      if (r.status === 409 && d?.error === 'no_takes') { setErr('Filme au moins un plan (🎬 Tourner) avant de monter.'); return; }
      if (!r.ok) { setErr(d?.detail || d?.need || d?.error || `HTTP ${r.status}`); return; }
      setCut({ url: d.media_url, id: d.version_id, coverage: d.coverage });
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  // ── Écran PROGRESSION (film en projet créé) ──
  if (projectId && view) {
    const pr = view.progress || {};
    const ratio = Math.max(0, Math.min(1, pr.needs?.filledRatio ?? 0));
    return (
      <main style={wrap}>
        <BackBar />
        <span style={badgeStyle}>{view.badge?.label || 'EN PROJET'}</span>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: '14px 0 4px' }}>{view.title || 'Œuvre en projet'}</h1>
        {pr.label && <p style={{ color: '#6A7585', margin: 0 }}>{pr.label}</p>}
        <div style={{ height: 10, background: '#EDEFF2', borderRadius: 8, overflow: 'hidden', margin: '18px 0 8px' }}>
          <div style={{ width: `${Math.round(ratio * 100)}%`, height: '100%', background: ACCENT }} />
        </div>
        {(pr.needs?.total ?? 0) > 0 && <p style={{ color: '#9AA3AF', fontSize: 12.5, margin: 0 }}>{pr.needs?.open} besoin(s) à combler sur {pr.needs?.total}</p>}
        {/* Producteur créatif : l'IA écrit le film RÉALISABLE avec tes moyens, étape par étape. */}
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #EDEFF2' }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Écrire le film (IA)</div>
          <p style={{ color: '#9AA3AF', fontSize: 12, margin: '0 0 10px' }}>L&apos;IA propose le meilleur film <b>réalisable avec tes moyens</b> (ton téléphone). Tu relis, tu corriges, tu valides.</p>
          {steps.map((s) => (
            <div key={s.step} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: ACCENT, fontWeight: 800 }}>{STEP_FR[s.step] || s.step}</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: '#2F343A', background: '#F7F8FA', border: '1px solid #EDEFF2', borderRadius: 10, padding: 12, marginTop: 4 }}>{s.text}</div>
              {reviseBox(`step:${s.step}`, () => reviseStep(s.step), busy)}
            </div>
          ))}
          {nextStep
            ? <button onClick={develop} disabled={busy} style={btn(busy)}>{busy ? "L'IA écrit…" : `✍️ Générer ${STEP_FR[nextStep] || nextStep} (IA)`}</button>
            : !screenplayOk
              ? <button onClick={() => approve('screenplay')} disabled={busy} style={btn(busy)}>{busy ? '…' : '✅ Valider le scénario'}</button>
              : <div style={okBox}>✅ Scénario validé.</div>}
        </div>

        {/* VS2 — Storyboard : découpage en scènes, puis plans par scène (film long = par paliers). */}
        {screenplayOk && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #EDEFF2' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Storyboard</div>
            <p style={{ color: '#9AA3AF', fontSize: 12, margin: '0 0 10px' }}>Découpage en scènes, puis les plans (filmables au téléphone). Un long film se remplit scène par scène.</p>
            {scenes.length === 0
              ? <button onClick={breakdown} disabled={busy} style={btn(busy)}>{busy ? 'Découpage…' : '🎬 Générer le découpage (scènes)'}</button>
              : <>
                  {!breakdownOk && <button onClick={() => approve('breakdown')} disabled={busy} style={btn(busy)}>{busy ? '…' : `✅ Valider le découpage (${scenes.length} scènes)`}</button>}
                  {scenes.map((s, i) => (
                    <div key={s.id} style={{ marginTop: 12, padding: 12, background: '#F7F8FA', border: '1px solid #EDEFF2', borderRadius: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{i + 1}. {s.title || s.id}{s.location ? ` · ${s.location}` : ''}</div>
                      {s.summary && <div style={{ color: '#6A7585', fontSize: 12.5, marginTop: 2 }}>{s.summary}</div>}
                      {Array.isArray(s.shots) && s.shots.length > 0
                        ? <div style={{ marginTop: 8 }}>{(s.shots as { id: string; cameraRole?: string; intention?: string; framingGuide?: string; placement?: string; storyboardImage?: string; cam?: number; pass?: number }[]).map((sh) => (
                            <div key={sh.id} style={{ padding: '6px 0', borderTop: '1px dashed #E7EAF0' }}>
                              <div style={{ fontSize: 12.5, color: '#2F343A', display: 'flex', alignItems: 'center', gap: 8 }}>
                                {sh.storyboardImage
                                  ? <img src={sh.storyboardImage} alt="" style={{ width: 48, height: 27, objectFit: 'contain', background: '#fff', border: '1px solid #EDEFF2', borderRadius: 4, flexShrink: 0 }} />
                                  : null}
                                <span style={{ flex: 1 }}>{sh.cam ? <b style={{ color: '#7C5CFF' }}>CAM {sh.cam}{sh.pass && sh.pass > 1 ? ` · passe ${sh.pass}` : ''} · </b> : null}🎥 <b>{sh.cameraRole || 'plan'}</b>{sh.intention ? ` — ${sh.intention}` : ''}{sh.placement ? <span style={{ color: '#6A7585' }}> · 📍 {sh.placement}</span> : null}{sh.framingGuide ? <span style={{ color: '#9AA3AF' }}> · {sh.framingGuide}</span> : null}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 12, marginTop: 4, paddingLeft: sh.storyboardImage ? 56 : 0 }}>
                                <button onClick={() => genSketch(s.id, sh.id)} disabled={busyScene === sh.id} style={{ background: 'none', border: 0, color: busyScene === sh.id ? '#9AA3AF' : '#7C5CFF', fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: 0 }}>{busyScene === sh.id ? 'Dessin…' : (sh.storyboardImage ? '🖌️ Refaire l\'esquisse' : '🖌️ Esquisse (IA)')}</button>
                                <a href={`/tournage/${projectId}?scene=${encodeURIComponent(s.id)}&shot=${encodeURIComponent(sh.id)}`} style={{ color: ACCENT, fontWeight: 800, textDecoration: 'none', fontSize: 12 }}>🎬 Tourner</a>
                              </div>
                            </div>))}</div>
                        : <button onClick={() => genShots(s.id)} disabled={!breakdownOk || busyScene === s.id} style={{ ...btn(!breakdownOk || busyScene === s.id), marginTop: 8, padding: 10, fontSize: 13 }}>{busyScene === s.id ? 'Plans…' : (breakdownOk ? '🎥 Générer les plans' : 'Valide le découpage d\'abord')}</button>}
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #E7EAF0' }}>{reviseBox(`scene:${s.id}`, () => reviseScene(s.id), busyScene === s.id)}</div>
                    </div>
                  ))}
                </>}
            {/* VS5 — Montage : le film s'assemble tout seul depuis les prises. */}
            {breakdownOk && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #E7EAF0' }}>
                <button onClick={montage} disabled={busy} style={btn(busy)}>{busy ? 'Montage…' : '🎬 Monter le film (depuis les prises)'}</button>
                {cut && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12.5, color: '#22B573', fontWeight: 800, marginBottom: 6 }}>✅ Version {cut.id} · {cut.coverage}% des plans tournés</div>
                    <video src={cut.url} controls playsInline style={{ width: '100%', borderRadius: 12, background: '#000' }} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <button onClick={resolveNeeds} disabled={busy} style={{ ...btn(busy), background: '#F1F2F4', color: '#6A7585', marginTop: 12 }}>{busy ? '…' : '🔎 Trouver les besoins & missions'}</button>
        {missions > 0 && <div style={okBox}>✅ {missions} mission(s) ouverte(s) — les contributeurs peuvent participer.</div>}
        {err && <p style={{ color: '#C0392B', marginTop: 12 }}>{err}</p>}
      </main>
    );
  }

  // ── Vue LISTE (par défaut) — comme le natif : « Mes films » d'abord, « + » ouvre le formulaire. ──
  if (!showForm) {
    return (
      <main style={wrap}>
        <BackBar />
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>🎬 Mes films</h1>

        {/* Rejoindre un tournage en cam 2 : SCAN du QR de la caméra principale → direct dans le live. */}
        <button onClick={() => router.push('/scan')} style={{ width: '100%', marginBottom: 16, padding: 12, borderRadius: 12, border: '1px dashed #7C5CFF', background: '#F5F3FF', color: '#7C5CFF', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>📷 Rejoindre un tournage (scanner le QR)</button>

        {myProjects.length > 0 ? (
          myProjects.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#F7F8FA', border: '1px solid #EDEFF2', borderRadius: 10, marginBottom: 6 }}>
              <button onClick={() => openProject(p.id)} style={{ flex: 1, textAlign: 'left', border: 0, background: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#2F343A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || 'Sans titre'}</div>
                <div style={{ fontSize: 11.5, color: '#9AA3AF' }}>{LIFECYCLE_FR[p.lifecycle] || p.lifecycle}</div>
              </button>
              <button onClick={() => openProject(p.id)} aria-label="Ouvrir" style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}>✏️</button>
              <button onClick={() => removeProject(p.id)} aria-label="Supprimer" style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}>🗑️</button>
            </div>
          ))
        ) : (
          <p style={{ color: '#9AA3AF', textAlign: 'center', padding: '30px 10px', fontSize: 13.5, lineHeight: 1.5 }}>Aucun film pour l&apos;instant.<br />Appuie sur « + Créer un film » pour en démarrer un.</p>
        )}

        <button onClick={() => setShowForm(true)} style={{ ...btn(false), marginTop: 16 }}>+ Créer un film</button>
        {err && <p style={{ color: '#C0392B', marginTop: 12 }}>{err}</p>}
      </main>
    );
  }

  // ── Vue FORMULAIRE — ouverte par « + » (séparée de la liste, comme le natif). ──
  return (
    <main style={wrap}>
      <button onClick={() => setShowForm(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0, color: '#6A7585', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: '2px 0', marginBottom: 12 }}>← Mes films</button>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>🎬 Créer un film</h1>

      <Uploader label={cover ? 'Affiche ajoutée ✓' : "Ajouter l'affiche"} done={!!cover} onClick={() => pick('image/*', setCover)} />
      <input style={input} placeholder="Titre du film" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input style={input} placeholder="Réalisateur" value={owner} onChange={(e) => setOwner(e.target.value)} />
      {filmMode !== 'projet' && <input style={input} type="number" placeholder="Prix (Ar)" value={price} onChange={(e) => setPrice(e.target.value)} />}

      {(
        <>
          <div style={{ display: 'flex', margin: '2px 0 14px' }}>
            {seg(filmMode === 'termine', '🎬 Film terminé', () => setFilmMode('termine'), false)}
            {seg(filmMode === 'projet', '🌱 Film en projet', () => setFilmMode('projet'), false)}
          </div>
          {filmMode === 'termine' ? (
            <>
              <Uploader label={full ? 'Film complet ajouté ✓' : 'Choisir le FILM complet (MP4)'} done={!!full} onClick={() => pick('video/*', setFull)} />
              <Uploader label={trailer ? 'Bande-annonce ajoutée ✓' : 'Bande-annonce (facultatif)'} done={!!trailer} onClick={() => pick('video/*', setTrailer)} />
              <textarea style={{ ...input, minHeight: 70 }} placeholder="Synopsis" value={synopsis} onChange={(e) => setSynopsis(e.target.value)} />
            </>
          ) : (
            <>
              <div style={{ padding: 12, marginBottom: 12, background: `${ACCENT}14`, border: `1px solid ${ACCENT}4D`, borderRadius: 12, color: '#6A7585', fontSize: 12.5, lineHeight: 1.4 }}>
                🌱 Publie ton film dès l&apos;idée. L&apos;IA-producteur détecte les besoins (figurants, lieu, musique…) et ouvre des missions.
              </div>
              <textarea style={{ ...input, minHeight: 70 }} placeholder="Ton idée / pitch" value={idea} onChange={(e) => setIdea(e.target.value)} />
              <input style={input} placeholder="Lieu de la 1re scène (optionnel)" value={loc} onChange={(e) => setLoc(e.target.value)} />
              <input style={input} type="number" placeholder="Combien de figurants ? (optionnel)" value={crowd} onChange={(e) => setCrowd(e.target.value)} />
              <input style={input} type="number" min={1} max={6} placeholder="Combien de téléphones/caméras ? (défaut 1)" value={cams} onChange={(e) => setCams(e.target.value)} />
              <p style={{ color: '#6A7585', fontSize: 11, margin: '2px 0 0' }}>L&apos;IA répartit les scènes sur ce nombre de caméras. 1 seul téléphone → l&apos;IA découpe en plusieurs passes.</p>
            </>
          )}
        </>
      )}

      {err && <p style={{ color: '#C0392B', margin: '4px 0' }}>{err}</p>}
      {okMsg && <p style={{ color: '#2E5E3E', margin: '4px 0', fontWeight: 600 }}>{okMsg}</p>}
      <button
        onClick={filmMode === 'projet' ? createProject : publishMedia}
        disabled={busy || !title.trim()}
        style={btn(busy || !title.trim())}>
        {busy ? '…' : (filmMode === 'projet' ? 'Créer le projet' : 'Publier le film')}
      </button>
    </main>
  );
}

// ── styles + petits composants ──
const wrap: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '28px 18px', fontFamily: 'Inter, system-ui', background: '#ffffff', color: '#141519', minHeight: '100svh' };
const input: React.CSSProperties = { width: '100%', padding: 13, borderRadius: 12, border: '1px solid #E7E9EC', fontSize: 15, marginBottom: 10, boxSizing: 'border-box' };
const badgeStyle: React.CSSProperties = { background: `${ACCENT}22`, color: ACCENT, fontWeight: 800, fontSize: 11, padding: '4px 11px', borderRadius: 20 };
const okBox: React.CSSProperties = { marginTop: 14, padding: 14, background: '#F1FBF3', border: '1px solid #B8E6C4', borderRadius: 12, color: '#2E5E3E', fontWeight: 600, fontSize: 13.5 };
const btn = (disabled: boolean): React.CSSProperties => ({ width: '100%', marginTop: 10, padding: 15, borderRadius: 12, border: 0, background: disabled ? '#CBD0D6' : ACCENT, color: '#fff', fontWeight: 800, fontSize: 16, cursor: disabled ? 'default' : 'pointer' });

function seg(on: boolean, label: string, onClick: () => void, big: boolean) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: big ? 11 : 10, margin: '0 4px', borderRadius: big ? 12 : 10, cursor: 'pointer',
      border: `1px solid ${on ? ACCENT : '#E7E9EC'}`, background: on ? (big ? ACCENT : `${ACCENT}1F`) : '#F1F2F4',
      color: on ? (big ? '#fff' : ACCENT) : '#6A7585', fontWeight: big ? 800 : 700, fontSize: big ? 14.5 : 13 }}>{label}</button>
  );
}

function Uploader({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', padding: 14, marginBottom: 10, borderRadius: 12, cursor: 'pointer',
      border: `1px solid ${done ? `${ACCENT}66` : '#E7E9EC'}`, background: done ? `${ACCENT}1A` : '#F4F5F7', color: '#374151', fontWeight: 700, fontSize: 14 }}>
      {done ? '✓ ' : '＋ '}{label}
    </button>
  );
}

// useSearchParams (reprise du projet via ?project=) exige une frontière Suspense en App Router.
export default function CreerOeuvrePage() {
  return (
    <Suspense fallback={null}>
      <CreerOeuvreInner />
    </Suspense>
  );
}
