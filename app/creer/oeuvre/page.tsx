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
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ACCENT = '#FF7F11';

// Barre de retour — INDISPENSABLE en app web (WebView) : sans elle on reste coincé sur la page.
function BackBar() {
  const router = useRouter();
  return (
    <button onClick={() => { if (window.history.length > 1) router.back(); else router.push('/home'); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0, color: '#6A7585', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: '2px 0', marginBottom: 12 }}>
      ← Retour
    </button>
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

export default function CreerOeuvrePage() {
  const [type, setType] = useState<'album' | 'film'>('film');
  const [filmMode, setFilmMode] = useState<'termine' | 'projet'>('projet');
  // communs
  const [cover, setCover] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [price, setPrice] = useState('');
  // album
  const [tracks, setTracks] = useState<{ title: string; url: string }[]>([]);
  // film terminé
  const [full, setFull] = useState<string | null>(null);
  const [trailer, setTrailer] = useState<string | null>(null);
  const [synopsis, setSynopsis] = useState('');
  // film en projet
  const [idea, setIdea] = useState('');
  const [loc, setLoc] = useState('');
  const [crowd, setCrowd] = useState('');
  // état
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  // progression projet
  const [projectId, setProjectId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [missions, setMissions] = useState(0);

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

  async function addTrack() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'audio/*';
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return;
      setBusy(true); setErr(null);
      const url = await uploadFile(f);
      setBusy(false);
      if (url) setTracks((t) => [...t, { title: f.name.replace(/\.[^.]+$/, ''), url }]); else setErr('Upload piste échoué');
    };
    input.click();
  }

  async function publishMedia() {
    setBusy(true); setErr(null); setOkMsg(null);
    try {
      const p = Number(price) || 0;
      const priceObj = p > 0 ? { amount: p, currency: 'Ar' } : undefined;
      const payload: Record<string, unknown> = type === 'album'
        ? { kind: 'album', title: title.trim(), artist: owner.trim(), cover, tracks: tracks.map((t) => ({ ...t, artist: owner.trim() })), ...(priceObj ? { price: priceObj } : {}) }
        : { kind: 'film', title: title.trim(), cover, full, trailer, synopsis: synopsis.trim(), ...(priceObj ? { price: priceObj } : {}) };
      const r = await fetch('/api/cards/media/publish', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error || `HTTP ${r.status}`); return; }
      setOkMsg(`✅ ${type === 'album' ? 'Album' : 'Film'} publié — visible dans le feed.`);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  async function createProject() {
    setBusy(true); setErr(null);
    try {
      const scenes = (crowd.trim() || loc.trim())
        ? [{ id: 'scene-1', title: 'Scène 1', ...(loc.trim() ? { location: loc.trim() } : {}), productionHints: { ...(Number(crowd) > 0 ? { crowdSize: Number(crowd) } : {}) } }]
        : undefined;
      const r = await fetch('/api/project/create', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'film', title: title.trim(), idea: idea.trim(), ...(scenes ? { film: { scenes } } : {}) }) });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error === 'disabled' ? 'Module projet désactivé (flag OFF).' : (d?.issues?.join(' ; ') || d?.error || `HTTP ${r.status}`)); return; }
      setProjectId(d.id); setView(d.view);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
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
        <button onClick={resolveNeeds} disabled={busy} style={btn(busy)}>{busy ? 'Le producteur travaille…' : '✨ Lancer le producteur (besoins & missions)'}</button>
        {missions > 0 && <div style={okBox}>✅ {missions} mission(s) ouverte(s) — les contributeurs peuvent participer.</div>}
        {err && <p style={{ color: '#C0392B', marginTop: 12 }}>{err}</p>}
      </main>
    );
  }

  const film = type === 'film';
  return (
    <main style={wrap}>
      <BackBar />
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>🎬 Créer une œuvre</h1>
      <div style={{ display: 'flex', marginBottom: 16 }}>
        {seg(type === 'album', '🎵 Album', () => setType('album'), true)}
        {seg(type === 'film', '🎬 Film', () => setType('film'), true)}
      </div>

      <Uploader label={cover ? 'Affiche ajoutée ✓' : (film ? "Ajouter l'affiche" : 'Ajouter la pochette')} done={!!cover} onClick={() => pick('image/*', setCover)} />
      <input style={input} placeholder={film ? 'Titre du film' : "Titre de l'album"} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input style={input} placeholder={film ? 'Réalisateur' : 'Artiste'} value={owner} onChange={(e) => setOwner(e.target.value)} />
      {!(film && filmMode === 'projet') && <input style={input} type="number" placeholder="Prix (Ar)" value={price} onChange={(e) => setPrice(e.target.value)} />}

      {type === 'album' ? (
        <>
          <button onClick={addTrack} style={ghost}>+ Ajouter un MP3</button>
          {tracks.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <span style={{ flex: 1, fontSize: 14 }}>🎵 {t.title}</span>
              <button onClick={() => setTracks((x) => x.filter((_, j) => j !== i))} style={{ border: 0, background: 'none', color: '#9AA3AF', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          {tracks.length === 0 && <p style={{ color: '#9AA3AF', fontSize: 13 }}>Ajoute tes fichiers MP3.</p>}
        </>
      ) : (
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
            </>
          )}
        </>
      )}

      {err && <p style={{ color: '#C0392B', margin: '4px 0' }}>{err}</p>}
      {okMsg && <p style={{ color: '#2E5E3E', margin: '4px 0', fontWeight: 600 }}>{okMsg}</p>}
      <button
        onClick={film && filmMode === 'projet' ? createProject : publishMedia}
        disabled={busy || !title.trim()}
        style={btn(busy || !title.trim())}>
        {busy ? '…' : (film ? (filmMode === 'projet' ? 'Créer le projet' : 'Publier le film') : 'Publier l\'album')}
      </button>
    </main>
  );
}

// ── styles + petits composants ──
const wrap: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '28px 18px', fontFamily: 'Inter, system-ui' };
const input: React.CSSProperties = { width: '100%', padding: 13, borderRadius: 12, border: '1px solid #E7E9EC', fontSize: 15, marginBottom: 10, boxSizing: 'border-box' };
const ghost: React.CSSProperties = { padding: '9px 14px', borderRadius: 10, border: `1px solid ${ACCENT}`, background: '#fff', color: ACCENT, fontWeight: 700, cursor: 'pointer', marginBottom: 8 };
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
