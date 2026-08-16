'use client';

/**
 * /creer/formation — Créer une formation depuis un PDF (Pascal 2026-07-03).
 * Flux : balance ton PDF → l’IA le découpe en modules (POST /api/formation/from-pdf) →
 * tu ÉDITES/réordonnes/choisis le teaser gratuit → Publier (POST /api/formation/publish).
 * L'humain valide toujours avant publication (doctrine « IA propose, humain décide »).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { recognizeText, labelImage, type VisionLabel } from '@/lib/compute/ondevice-ocr';
import Markdown from '@/components/cards/Markdown';

// Télécharge une image (même origine) → dataURL, pour la passer à l'OCR on-device.
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'include' });
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}
import { GraduationCap, FileText, Lock, Unlock, Trash2, ChevronUp, ChevronDown, Loader2 } from '@/lib/icons';
import BackButton from '@/components/system/BackButton';

// Labels ML Kit qui trahissent un logo / du texte / une icône / une décoration (pas une figure).
const JUNK_LABELS = new Set(['text', 'font', 'logo', 'brand', 'symbol', 'icon', 'line', 'pattern', 'white', 'black']);
// Labels ML Kit qui trahissent une VRAIE figure (schéma, graphe, photo, tableau, illustration…).
const REAL_LABELS = new Set(['chart', 'diagram', 'plot', 'graph', 'screenshot', 'photograph', 'map', 'table',
  'illustration', 'document', 'person', 'building', 'design', 'product']);

/**
 * Décide si on GARDE une figure. Filtre CONSERVATEUR (anti-catastrophe « ne jamais tout perdre ») :
 *  - pas de labeling natif (via:'none') OU aucun label → GARDER (on n'a aucune info fiable).
 *  - un label « vrai contenu » présent → GARDER.
 *  - sinon, JETER SEULEMENT si le haut du classement est CLAIREMENT du logo/texte/icône.
 *  - tout doute (label inconnu en tête) → GARDER.
 */
function keepFigure(labels: VisionLabel[], via: 'native' | 'none'): boolean {
  if (via === 'none' || labels.length === 0) return true; // règle anti-catastrophe
  const hasReal = labels.some((l) => REAL_LABELS.has((l.text || '').toLowerCase()));
  if (hasReal) return true; // vraie figure détectée → on garde
  const top = labels.slice(0, 3); // « labels du haut » = les mieux notés
  const topAllJunk = top.length > 0 && top.every((l) => JUNK_LABELS.has((l.text || '').toLowerCase()));
  if (topAllJunk) return false; // logo/texte/icône évident, aucun vrai contenu → on jette
  return true; // doute → on garde
}

interface Mod { title: string; summary?: string; content: string; free: boolean }
interface Plan { title: string; description: string; price_suggestion_mga: number; modules: Mod[]; pages: number; chars: number }

export default function CreerFormation() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'duration' | 'generating' | 'edit' | 'done'>('upload');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [prog, setProg] = useState<{ step: string; pct: number }>({ step: '', pct: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [mods, setMods] = useState<Mod[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  // Étape 1 : on garde le PDF, l’IA demande la durée avant de rédiger.
  const onFile = useCallback((file: File) => { setErr(''); setPendingFile(file); setStep('duration'); }, []);

  const applyPlan = useCallback((p: Plan) => {
    setTitle(p.title); setDescription(p.description); setPrice(p.price_suggestion_mga || 0);
    setMods(p.modules.map((m, i) => ({ ...m, free: i === 0 ? true : !!m.free })));
    setStep('edit');
  }, []);

  // Poll de la progression du job (le serveur travaille en fond).
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/formation/job/${id}`, { credentials: 'include' });
        if (r.status === 404) {
          clearInterval(pollRef.current!); try { localStorage.removeItem('t2m_formation_job'); } catch {}
          setErr('Génération interrompue (serveur redémarré ?). Relance ton PDF.'); setStep('upload'); return;
        }
        if (!r.ok) return; // réseau : on retentera au prochain tick
        const d = await r.json();
        setProg({ step: d.step || '', pct: d.progress || 0 });
        if (d.status === 'done' && d.plan) { clearInterval(pollRef.current!); try { localStorage.removeItem('t2m_formation_job'); } catch {}; applyPlan(d.plan); }
        else if (d.status === 'error') { clearInterval(pollRef.current!); try { localStorage.removeItem('t2m_formation_job'); } catch {}; setErr(d.message || 'Échec de la génération.'); setStep('duration'); }
      } catch { /* réseau instable → prochain tick */ }
    }, 2000);
  }, [applyPlan]);

  // Étape 2 : durée choisie → (1) le TÉLÉPHONE lit les figures du PDF, (2) on lance le job serveur.
  const generate = useCallback(async (durationMin: number) => {
    if (!pendingFile) return;
    setErr(''); setBusy(true); setStep('generating'); setProg({ step: 'l’IA prépare ton cours…', pct: 1 });
    try {
      // (1) Extraire les figures (serveur) → DISPATCH au POOL (ton tel = worker du pool, son GPU traite).
      //     On garde AUSSI les URLs des images pour les afficher en illustration dans le cours.
      let figuresText = '';
      let figuresUrls: string[] = [];
      try {
        const fd0 = new FormData();
        fd0.append('file', pendingFile);
        const rf = await fetch('/api/formation/figures', { method: 'POST', body: fd0, credentials: 'include' });
        const df = await rf.json();
        const figs: { url: string }[] = df?.ok && Array.isArray(df.figures) ? df.figures : [];
        figuresUrls = figs.map((f) => f.url); // toutes les figures deviennent des illustrations

        // FILTRE DE FIGURES via ML Kit Image Labeling (natif, GPU du téléphone) : on ne garde
        // que les VRAIES figures (schémas/graphes/photos/tableaux), on jette les logos/déco.
        // CONSERVATEUR : sans natif (web/desktop) ou en cas de doute → on garde. On ne perd JAMAIS tout.
        if (figuresUrls.length) {
          try {
            setProg({ step: 'l’IA trie les illustrations…', pct: 1 });
            const kept: string[] = [];
            let dropped = 0;
            for (const url of figuresUrls) {
              let keep = true;
              try {
                const { labels, via } = await labelImage(await urlToDataUrl(url));
                keep = keepFigure(labels, via);
              } catch { keep = true; } // erreur d'analyse → on garde (anti-catastrophe)
              if (keep) kept.push(url); else dropped++;
            }
            // Garde-fou ULTIME : si le filtre voulait TOUT jeter, on l'annule (jamais zéro figure).
            if (kept.length > 0) {
              figuresUrls = kept;
              console.log('[T2M-FIGFILTER] gardées=' + kept.length + ' jetées=' + dropped);
            } else {
              console.log('[T2M-FIGFILTER] filtre ANNULÉ (aurait tout jeté) — on garde les ' + figuresUrls.length + ' figures');
            }
          } catch { /* filtre indisponible → on garde figuresUrls tel quel */ }
        }

        const batch: string = df?.ok ? df.batch : '';
        if (batch && figs.length > 0) {
          const done = new Map<string, string>(); // url → texte (résultats du POOL)
          const deadline = Date.now() + 15000; // on laisse le pool bosser ~15 s
          while (Date.now() < deadline && done.size < figs.length) {
            setProg({ step: 'l’IA analyse ton document…', pct: 1 + Math.round((done.size / figs.length) * 12) });
            await new Promise((r) => setTimeout(r, 1500));
            try {
              const rs = await fetch(`/api/formation/figures-status?batch=${encodeURIComponent(batch)}`, { credentials: 'include' });
              const ds = await rs.json();
              (ds?.results || []).forEach((r: { imageUrl?: string; text?: string }) => { if (r.imageUrl) done.set(r.imageUrl, r.text || ''); });
            } catch { /* réseau : on retente */ }
          }
          // Filet : figures que le pool n'a pas traitées à temps → cet appareil les finit (son GPU natif).
          const missing = figs.filter((f) => !done.has(f.url));
          for (const f of missing) {
            setProg({ step: 'l’IA analyse ton document…', pct: 13 });
            try { const { text } = await recognizeText(await urlToDataUrl(f.url)); done.set(f.url, text || ''); } catch { /* illisible */ }
          }
          figuresText = [...done.values()].map((t) => (t || '').trim()).filter((t) => t.length > 8).join('\n---\n');
        }
      } catch { /* pas de figures → on continue sans */ }

      // (2) Lancer le job serveur (texte + IMAGES des figures pour illustrer le cours).
      setProg({ step: 'l’IA structure ton cours…', pct: 16 });
      const fd = new FormData();
      fd.append('file', pendingFile);
      fd.append('duration', String(durationMin));
      if (figuresText) fd.append('figures_text', figuresText);
      if (figuresUrls.length) fd.append('figures_urls', JSON.stringify(figuresUrls));
      const r = await fetch('/api/formation/from-pdf', { method: 'POST', body: fd, credentials: 'include' });
      const d = await r.json();
      if (!r.ok || !d.ok || !d.jobId) { setErr(d.message || 'Impossible de lancer la génération.'); setStep('duration'); return; }
      try { localStorage.setItem('t2m_formation_job', d.jobId); } catch {}
      startPolling(d.jobId);
    } catch { setErr('Erreur réseau à l’envoi.'); setStep('duration'); } finally { setBusy(false); }
  }, [pendingFile, startPolling]);

  // Reprise : si un job tournait quand on a quitté, on le retrouve au retour.
  useEffect(() => {
    let id: string | null = null;
    try { id = localStorage.getItem('t2m_formation_job'); } catch {}
    if (id) { setStep('generating'); setProg({ step: 'Reprise…', pct: 1 }); startPolling(id); }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [startPolling]);

  const move = (i: number, dir: -1 | 1) => setMods((a) => {
    const j = i + dir; if (j < 0 || j >= a.length) return a;
    const b = a.slice(); [b[i], b[j]] = [b[j], b[i]]; return b;
  });
  const del = (i: number) => setMods((a) => a.filter((_, k) => k !== i));
  const setMod = (i: number, patch: Partial<Mod>) => setMods((a) => a.map((m, k) => (k === i ? { ...m, ...patch } : m)));

  const publish = useCallback(async () => {
    setErr('');
    if (!title.trim()) { setErr('Donne un titre à ta formation.'); return; }
    if (mods.length === 0) { setErr('Il faut au moins un module.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/formation/publish', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, price_mga: price, modules: mods }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setErr(d.message || 'Échec de la publication.'); return; }
      setStep('done');
    } catch { setErr('Erreur réseau.'); } finally { setBusy(false); }
  }, [title, description, price, mods]);

  return (
    <div style={{ minHeight: '100dvh', background: '#F5F6F8', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #EDF0F4', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton size={24} className="inline-flex items-center p-1 text-[#2F343A] hover:text-black transition-colors" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 17, color: '#2F343A', fontFamily: "'Outfit',sans-serif" }}>
          <GraduationCap className="w-5 h-5" color="#FF7F11" /> Créer une formation
        </div>
      </div>

      {err && <div style={{ margin: 14, padding: '10px 12px', background: '#FEECEC', color: '#C0392B', borderRadius: 12, fontSize: 13.5 }}>{err}</div>}

      {/* ÉTAPE 1 — Upload PDF */}
      {step === 'upload' && (
        <div style={{ padding: 20 }}>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            style={{ width: '100%', border: '2px dashed #C9B8F5', background: '#fff', borderRadius: 20, padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            {busy ? <Loader2 className="w-10 h-10 animate-spin" color="#FF7F11" /> : <FileText className="w-12 h-12" color="#FF7F11" />}
            <div style={{ fontWeight: 700, fontSize: 17, color: '#2F343A' }}>{busy ? 'l’IA découpe ton cours…' : 'Balance ton PDF'}</div>
            <div style={{ fontSize: 13, color: '#6A7585', textAlign: 'center', maxWidth: 280 }}>
              {busy ? 'Extraction du texte + découpage en modules' : 'l’IA le lit et le découpe en modules. Le 1er module sera l’aperçu gratuit.'}
            </div>
          </button>
          <p style={{ fontSize: 12, color: '#9DAAB7', textAlign: 'center', marginTop: 14 }}>PDF avec du texte (pas un scan d’images) · max 25 Mo</p>
        </div>
      )}

      {/* ÉTAPE 1bis — l’IA demande la DURÉE (dimensionne le cours) */}
      {step === 'duration' && (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(255,127,17,0.12)', display: 'grid', placeItems: 'center', margin: '8px auto 14px' }}><GraduationCap className="w-8 h-8" color="#FF7F11" /></div>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#2F343A' }}>{busy ? 'l’IA rédige ta formation…' : 'Combien de temps doit durer ta formation ?'}</div>
          <div style={{ fontSize: 13, color: '#6A7585', marginTop: 6, maxWidth: 320, marginInline: 'auto' }}>
            {busy ? 'Elle lit TOUT ton document, structure le cours et rédige chaque module de façon pédagogique. Ça peut prendre un moment.' : 'l’IA adapte le nombre de modules et la profondeur à la durée choisie.'}
          </div>
          {busy ? (
            <Loader2 className="w-9 h-9 animate-spin" color="#FF7F11" style={{ margin: '24px auto' }} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
              {[{ m: 30, l: 'Express', s: '~30 min' }, { m: 60, l: 'Standard', s: '~1 heure' }, { m: 120, l: 'Approfondie', s: '~2 heures' }, { m: 240, l: 'Complète', s: '4 h et +' }].map((o) => (
                <button key={o.m} onClick={() => generate(o.m)} style={{ background: '#fff', border: '1.5px solid #EDF0F4', borderRadius: 14, padding: '16px 10px', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#2F343A' }}>{o.l}</div>
                  <div style={{ fontSize: 12, color: '#FF7F11', marginTop: 2 }}>{o.s}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ÉTAPE 1ter — Génération en cours (barre de progression, quittable) */}
      {step === 'generating' && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(255,127,17,0.12)', display: 'grid', placeItems: 'center', margin: '8px auto 16px' }}><GraduationCap className="w-8 h-8" color="#FF7F11" /></div>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#2F343A' }}>l’IA construit ta formation…</div>
          <div style={{ fontSize: 13, color: '#6A7585', marginTop: 6, minHeight: 18 }}>{prog.step || 'Démarrage…'}</div>
          <div style={{ margin: '18px auto 8px', maxWidth: 320, height: 10, borderRadius: 999, background: '#EAECF0', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(3, prog.pct)}%`, background: 'linear-gradient(90deg,#FF7F11,#FF7F11)', borderRadius: 999, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 12, color: '#9DAAB7' }}>{prog.pct}%</div>
          <div style={{ marginTop: 18, padding: '10px 12px', background: '#F0F2F5', borderRadius: 12, fontSize: 12.5, color: '#6A7585', maxWidth: 340, marginInline: 'auto' }}>
            ✅ Tu peux <b>quitter cet écran</b> — l’IA continue en arrière-plan. Reviens quand tu veux, la progression est gardée.
          </div>
          <button onClick={() => router.push('/home')} style={{ marginTop: 14, padding: '10px 20px', borderRadius: 12, border: '1px solid #E7EAF0', background: '#fff', fontSize: 14, fontWeight: 600, color: '#2F343A', cursor: 'pointer' }}>Quitter (ça continue en fond)</button>
        </div>
      )}

      {/* ÉTAPE 2 — Validation / édition */}
      {step === 'edit' && (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 12, color: '#6A7585', fontWeight: 600 }}>Titre de la formation
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} /></label>
            <label style={{ fontSize: 12, color: '#6A7585', fontWeight: 600 }}>Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} /></label>
            <label style={{ fontSize: 12, color: '#6A7585', fontWeight: 600 }}>Prix (Ariary)
              <input type="number" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} style={inp} /></label>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F343A', padding: '0 2px' }}>{mods.length} module{mods.length > 1 ? 's' : ''} — glisse le 🔓 sur le teaser gratuit</div>

          {mods.map((m, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, padding: 12, border: m.free ? '1.5px solid #22B573' : '1px solid #EDF0F4' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter" style={arrow}><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === mods.length - 1} aria-label="Descendre" style={arrow}><ChevronDown className="w-4 h-4" /></button>
                </div>
                <input value={m.title} onChange={(e) => setMod(i, { title: e.target.value })} style={{ ...inp, marginTop: 0, fontWeight: 600 }} />
                <button onClick={() => del(i)} aria-label="Supprimer" style={{ ...arrow, color: '#C0392B' }}><Trash2 className="w-4 h-4" /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <button onClick={() => setMod(i, { free: !m.free })}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: m.free ? '#E7F7EE' : '#F0F2F5', color: m.free ? '#1B8A56' : '#6A7585' }}>
                  {m.free ? <><Unlock className="w-3.5 h-3.5" /> Aperçu gratuit</> : <><Lock className="w-3.5 h-3.5" /> Payant</>}
                </button>
                <button onClick={() => setOpen(open === i ? null : i)} style={{ marginLeft: 'auto', fontSize: 12, color: '#FF7F11', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {open === i ? 'Masquer' : 'Voir le contenu'}
                </button>
              </div>
              {open === i && <div style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto', background: '#FAFBFC', borderRadius: 10, padding: 12 }}><Markdown light>{m.content}</Markdown></div>}
            </div>
          ))}

          <button onClick={publish} disabled={busy}
            style={{ marginTop: 6, width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: '#FF7F11', color: '#fff', fontSize: 15.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <GraduationCap className="w-5 h-5" />} Publier ma formation
          </button>
        </div>
      )}

      {/* ÉTAPE 3 — Publié */}
      {step === 'done' && (
        <div style={{ padding: 30, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: '#E7F7EE', display: 'grid', placeItems: 'center' }}><GraduationCap className="w-9 h-9" color="#22B573" /></div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#2F343A' }}>Formation publiée 🎉</div>
          <div style={{ fontSize: 14, color: '#6A7585', maxWidth: 300 }}>Elle est dans <b>Mes Cards</b>. Le module 1 est en aperçu gratuit, le reste se débloque à l’achat.</div>
          <button onClick={() => router.push('/drafts#publiees')} style={{ marginTop: 6, padding: '12px 22px', borderRadius: 12, border: 'none', background: '#2F343A', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Voir Mes Cards</button>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', marginTop: 5, padding: '9px 11px', borderRadius: 10, border: '1px solid #E7EAF0', fontSize: 14, color: '#2F343A', background: '#fff', outline: 'none' };
const arrow: React.CSSProperties = { background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#9DAAB7' };
