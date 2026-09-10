'use client';
/**
 * /creer/oeuvre — COMPOSER WEB « Film » : FORMULAIRE DE CRÉATION uniquement (Pascal 2026-09-10).
 *
 * Deux modes (miroir natif create_card) :
 *  - Film TERMINÉ → POST /api/cards/media/publish { kind:'film' } → retour feed sur le post.
 *  - Film EN PROJET → POST /api/project/create → REDIRIGE vers le parcours en 5 écrans
 *    (/creer/oeuvre/[id]/ecriture → storyboard → tournage → montage), IDENTIQUE au natif.
 * La LISTE des films est `/mes-films` ; ouvrir un film reprend au parcours. `?edit=` réédite un film publié.
 */
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BackButton from '@/components/system/BackButton';

const ACCENT = '#FF7F11';

async function uploadFile(f: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', f);
  const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
  if (!r.ok) return null;
  const d = await r.json();
  return typeof d?.url === 'string' ? d.url : null;
}

function CreerOeuvreInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filmMode, setFilmMode] = useState<'termine' | 'projet'>('projet');
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
  const [cams, setCams] = useState('1');
  // état
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | undefined>(undefined);

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

  // Film TERMINÉ → publie la carte média (kind:film) et revient au feed sur le post créé.
  async function publishMedia() {
    setBusy(true); setErr(null);
    try {
      const p = Number(price) || 0;
      const priceObj = p > 0 ? { amount: p, currency: 'Ar' } : undefined;
      const payload = { kind: 'film', title: title.trim(), cover, full, trailer, synopsis: synopsis.trim(), ...(priceObj ? { price: priceObj } : {}), ...(editId ? { card_id: editId } : {}) };
      const r = await fetch('/api/cards/media/publish', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error || `HTTP ${r.status}`); return; }
      const newId = d?.card_id as string | undefined;
      if (newId) { try { sessionStorage.setItem('t2m_feed_focus', newId); } catch { /* */ } }
      router.replace('/home');
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  // Film EN PROJET → crée le projet PUIS entre dans le parcours (étape Écriture).
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
      try { localStorage.setItem('t2m_last_project', d.id); } catch { /* privé */ }
      router.replace(`/creer/oeuvre/${d.id}/ecriture`);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  // Reprise d'un projet existant (?project=) → va directement au parcours. Édition d'un film publié (?edit=) → préremplit le form.
  const loadEdit = useCallback((edit: string) => {
    fetch('/api/library', { cache: 'no-store' }).then((r) => r.json()).then((res) => {
      const item = (res?.items || []).find((x: { id: string }) => x.id === edit);
      if (!item?.dotcard) return;
      let c: Record<string, unknown>; try { c = JSON.parse(item.dotcard); } catch { return; }
      const video = (c.video && typeof c.video === 'object' ? c.video as Record<string, unknown> : {}) as Record<string, unknown>;
      const imgs = Array.isArray(c.images) ? c.images as string[] : [];
      const pr = (c.price && typeof c.price === 'object' ? c.price as { amount?: number } : {});
      setFilmMode('termine');
      setCover((imgs[0] as string) || (video.poster as string) || null);
      setTitle((c.title as string) || '');
      setTrailer((video.trailer as string) || null);
      setFull((video.full as string) || (video.url as string) || null);
      setSynopsis(((c.text as { body?: string })?.body) || (video.synopsis as string) || '');
      setPrice(pr.amount ? String(pr.amount) : '');
      setEditId(edit);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const pid = searchParams.get('project');
    if (pid) { router.replace(`/creer/oeuvre/${pid}/ecriture`); return; }
    const edit = searchParams.get('edit');
    if (edit) loadEdit(edit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={wrap}>
      <BackButton to="/mes-films" label="Mes films" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#6A7585] hover:text-[#141519] transition-colors mb-3" />
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>🎬 {editId ? 'Modifier le film' : 'Créer un film'}</h1>

      {/* GROS PAVÉ affiche (parité natif create_card) : grande zone cliquable, aperçu plein cadre. */}
      <button type="button" onClick={() => pick('image/*', setCover)} aria-label="Ajouter l'affiche"
        style={{ width: '100%', aspectRatio: '16 / 9', marginBottom: 12, borderRadius: 16, cursor: 'pointer', overflow: 'hidden',
          border: `1px solid ${cover ? `${ACCENT}66` : '#E7E9EC'}`, background: cover ? '#000' : '#F4F5F7',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
        {cover
          ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#6A7585' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9AA3AF" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Ajouter l&apos;affiche</span>
            </span>}
      </button>
      <input style={input} placeholder="Titre du film" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input style={input} placeholder="Réalisateur" value={owner} onChange={(e) => setOwner(e.target.value)} />
      {filmMode !== 'projet' && <input style={input} type="number" placeholder="Prix (Ar)" value={price} onChange={(e) => setPrice(e.target.value)} />}

      <div style={{ display: 'flex', margin: '2px 0 14px' }}>
        {seg(filmMode === 'termine', '🎬 Film terminé', () => setFilmMode('termine'))}
        {seg(filmMode === 'projet', '🌱 Film en projet', () => setFilmMode('projet'))}
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
            🌱 L&apos;IA-producteur écrit ton film étape par étape, découpe les scènes et les plans, te guide au tournage puis monte tout seul.
          </div>
          <textarea style={{ ...input, minHeight: 70 }} placeholder="Ton idée / pitch" value={idea} onChange={(e) => setIdea(e.target.value)} />
          <input style={input} placeholder="Lieu de la 1re scène (optionnel)" value={loc} onChange={(e) => setLoc(e.target.value)} />
          <input style={input} type="number" placeholder="Combien de figurants ? (optionnel)" value={crowd} onChange={(e) => setCrowd(e.target.value)} />
          <input style={input} type="number" min={1} max={6} placeholder="Combien de téléphones/caméras ? (défaut 1)" value={cams} onChange={(e) => setCams(e.target.value)} />
          <p style={{ color: '#6A7585', fontSize: 11, margin: '2px 0 0' }}>L&apos;IA répartit les scènes sur ce nombre de caméras. 1 seul téléphone → l&apos;IA découpe en plusieurs passes.</p>
        </>
      )}

      {err && <p style={{ color: '#C0392B', margin: '4px 0' }}>{err}</p>}
      <button onClick={filmMode === 'projet' ? createProject : publishMedia} disabled={busy || !title.trim()} style={btn(busy || !title.trim())}>
        {busy ? '…' : (filmMode === 'projet' ? 'Créer le film' : (editId ? 'Enregistrer' : 'Publier le film'))}
      </button>
    </main>
  );
}

const wrap: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '28px 18px', fontFamily: 'Inter, system-ui', background: '#ffffff', color: '#141519', minHeight: '100svh' };
const input: React.CSSProperties = { width: '100%', padding: 13, borderRadius: 12, border: '1px solid #E7E9EC', fontSize: 15, marginBottom: 10, boxSizing: 'border-box' };
const btn = (disabled: boolean): React.CSSProperties => ({ width: '100%', marginTop: 10, padding: 15, borderRadius: 12, border: 0, background: disabled ? '#CBD0D6' : ACCENT, color: '#fff', fontWeight: 800, fontSize: 16, cursor: disabled ? 'default' : 'pointer' });

function seg(on: boolean, label: string, onClick: () => void) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: 10, margin: '0 4px', borderRadius: 10, cursor: 'pointer',
      border: `1px solid ${on ? ACCENT : '#E7E9EC'}`, background: on ? `${ACCENT}1F` : '#F1F2F4',
      color: on ? ACCENT : '#6A7585', fontWeight: 700, fontSize: 13 }}>{label}</button>
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

export default function CreerOeuvrePage() {
  return (
    <Suspense fallback={null}>
      <CreerOeuvreInner />
    </Suspense>
  );
}
