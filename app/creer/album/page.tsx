'use client';
/**
 * /creer/album — COMPOSER ALBUM (musique) — reproduction FIDÈLE du composer natif (Pascal 2026-07-22).
 *
 * Même écran que create_card.dart (album) : gros bloc POCHETTE carré (3000×3000) + Titre + Artiste +
 * Prix + Description + Pistes (« + Ajouter un MP3 ») → POST /api/cards/media/publish { kind:'album' }.
 * Uploads via /api/upload (FormData `file`). File inputs RÉELS (cachés, ref) → le picker s'ouvre bien
 * sur mobile (un input créé à la volée ne s'ouvre pas dans certains WebView). Le `.card` reste la source.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const ACCENT = '#FF7F11';
const INK = '#2F343A';
const input: React.CSSProperties = { width: '100%', padding: 14, borderRadius: 12, border: '1px solid #E7E9EC', background: '#F4F5F7', fontSize: 15, color: INK, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };

async function uploadFile(f: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', f);
  const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
  if (!r.ok) return null;
  const d = await r.json();
  return typeof d?.url === 'string' ? d.url : null;
}

export default function CreerAlbumPage() {
  const router = useRouter();
  const coverRef = useRef<HTMLInputElement>(null);
  const mp3Ref = useRef<HTMLInputElement>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [tracks, setTracks] = useState<{ title: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function onCover(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setBusy(true); setErr(null);
    const url = await uploadFile(f);
    setBusy(false);
    if (url) setCover(url); else setErr('Upload de la pochette échoué');
  }

  async function onMp3(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setBusy(true); setErr(null);
    const url = await uploadFile(f);
    setBusy(false);
    if (url) setTracks((t) => [...t, { title: f.name.replace(/\.[^.]+$/, ''), url }]); else setErr('Upload du MP3 échoué');
  }

  async function publish() {
    setBusy(true); setErr(null); setOkMsg(null);
    try {
      const p = Number(price) || 0;
      const payload = {
        kind: 'album', title: title.trim(), artist: artist.trim(), description: description.trim(), cover,
        tracks: tracks.map((t) => ({ ...t, artist: artist.trim() })),
        ...(p > 0 ? { price: { amount: p, currency: 'Ar' } } : {}),
      };
      const r = await fetch('/api/cards/media/publish', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error === 'cover_required' ? 'Ajoute une pochette.' : d?.error === 'tracks_required' ? 'Ajoute au moins un MP3.' : (d?.error || `HTTP ${r.status}`)); return; }
      setOkMsg('✅ Album publié — visible dans le feed.');
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  const canPublish = !busy && !!cover && title.trim().length > 0 && tracks.length > 0;

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '14px 16px 60px' }}>
      <button onClick={() => { if (window.history.length > 1) router.back(); else router.push('/home'); }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0, color: '#6A7585', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: '2px 0', marginBottom: 8 }}>← Retour</button>
      <h1 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 24, fontWeight: 900, color: INK, marginBottom: 16 }}>Créer</h1>

      {/* Bloc POCHETTE carré (3000×3000) — comme le natif. */}
      <input ref={coverRef} type="file" accept="image/*" hidden onChange={onCover} />
      <button type="button" onClick={() => coverRef.current?.click()} disabled={busy}
        style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 14, border: '1px solid #E7E9EC', background: '#F4F5F7', cursor: 'pointer', overflow: 'hidden', padding: 0, display: 'grid', placeItems: 'center', marginBottom: 14 }}>
        {cover
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ textAlign: 'center', color: '#9AA3AF' }}>
              <div style={{ fontSize: 34 }}>💿</div>
              <div style={{ color: '#6A7585', fontWeight: 600, marginTop: 6 }}>Ajouter la pochette</div>
              <div style={{ fontSize: 12, marginTop: 3 }}>carrée · 3000×3000</div>
            </div>}
      </button>

      <input style={input} placeholder="Titre de l'album" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input style={input} placeholder="Artiste" value={artist} onChange={(e) => setArtist(e.target.value)} />
      <input style={input} type="number" placeholder="Prix (Ar)" value={price} onChange={(e) => setPrice(e.target.value)} />
      <textarea style={{ ...input, minHeight: 84, resize: 'vertical' }} placeholder="Description (de quoi parle l'album…)" value={description} onChange={(e) => setDescription(e.target.value)} />

      {/* Pistes + Ajouter un MP3 */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '6px 0 8px' }}>
        <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 15, color: INK }}>Pistes</span>
        <span style={{ flex: 1 }} />
        <input ref={mp3Ref} type="file" accept="audio/*,.mp3,.m4a,.aac" hidden onChange={onMp3} />
        <button type="button" onClick={() => mp3Ref.current?.click()} disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 0, color: ACCENT, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>+ Ajouter un MP3</button>
      </div>
      {tracks.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ color: ACCENT, fontSize: 16 }}>🎵</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: INK, fontSize: 14 }}>{t.title}</span>
          <button onClick={() => setTracks((x) => x.filter((_, j) => j !== i))} style={{ border: 0, background: 'none', color: '#9AA3AF', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      ))}
      {tracks.length === 0 && <p style={{ color: '#9AA3AF', fontSize: 13 }}>Ajoute au moins un MP3.</p>}

      {err && <p style={{ color: '#C0392B', margin: '8px 0' }}>{err}</p>}
      {okMsg && <p style={{ color: '#2E5E3E', margin: '8px 0', fontWeight: 600 }}>{okMsg}</p>}
      <button onClick={publish} disabled={!canPublish}
        style={{ width: '100%', marginTop: 12, padding: 15, borderRadius: 12, border: 0, background: canPublish ? ACCENT : '#CBD0D6', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 16, cursor: canPublish ? 'pointer' : 'default' }}>
        {busy ? '…' : 'Publier l\'album'}
      </button>
    </main>
  );
}
