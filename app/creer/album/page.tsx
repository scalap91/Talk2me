'use client';
/**
 * /creer/album — COMPOSER ALBUM (musique) — reproduction FIDÈLE du composer natif (Pascal 2026-07-22).
 *
 * Même écran que create_card.dart (album) : gros bloc POCHETTE carré (3000×3000) + Titre + Artiste +
 * Prix + Description + Pistes (« + Ajouter un MP3 ») → POST /api/cards/media/publish { kind:'album' }.
 * Uploads via /api/upload (FormData `file`). File inputs RÉELS (cachés, ref) → le picker s'ouvre bien
 * sur mobile (un input créé à la volée ne s'ouvre pas dans certains WebView). Le `.card` reste la source.
 */
import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/system/BackButton';

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
  const [draftId, setDraftId] = useState<string | undefined>(undefined);

  const [editId, setEditId] = useState<string | undefined>(undefined);

  // Reprise d'un BROUILLON (?draft=<id>) OU édition d'un album PUBLIÉ (?edit=<id>, depuis « Mes albums »,
  // parité natif MyMediaScreen). L'édition préremplit depuis la `.card` (bibliothèque) et republie EN
  // PLACE via `card_id` (media/publish met à jour le même id, pas de doublon).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const draft = sp.get('draft');
    const edit = sp.get('edit');
    if (draft) {
      fetch(`/api/drafts/${draft}`, { cache: 'no-store' }).then((r) => r.json()).then((res) => {
        const d = res?.draft?.draft_data; if (!d) return;
        setCover(d.cover ?? null); setTitle(d.title || ''); setArtist(d.artist || '');
        setDescription(d.description || ''); setPrice(d.price || ''); setTracks(Array.isArray(d.tracks) ? d.tracks : []);
        setDraftId(draft);
      }).catch(() => {});
      return;
    }
    if (edit) {
      // La bibliothèque porte la `.card` sérialisée (dotcard) → on préremplit tous les champs.
      fetch('/api/library', { cache: 'no-store' }).then((r) => r.json()).then((res) => {
        const item = (res?.items || []).find((x: { id: string }) => x.id === edit);
        if (!item?.dotcard) return;
        let c: Record<string, unknown>; try { c = JSON.parse(item.dotcard); } catch { return; }
        const audio = (c.audio && typeof c.audio === 'object' ? c.audio as Record<string, unknown> : {}) as Record<string, unknown>;
        const imgs = Array.isArray(c.images) ? c.images as string[] : [];
        const tr = Array.isArray(audio.tracks) ? audio.tracks as { title?: string; url?: string; duration?: string }[] : [];
        const pr = (c.price && typeof c.price === 'object' ? c.price as { amount?: number } : {});
        setCover((imgs[0] as string) || (audio.thumbnail as string) || null);
        setTitle((c.title as string) || '');
        setArtist((audio.author as string) || '');
        setDescription(((c.text as { body?: string })?.body) || '');
        setPrice(pr.amount ? String(pr.amount) : '');
        setTracks(tr.filter((t) => t.url).map((t) => ({ title: t.title || 'Piste', url: t.url as string })));
        setEditId(edit);
      }).catch(() => {});
    }
  }, []);

  // Mettre en brouillon → /api/drafts (repris via ?draft= ci-dessus).
  async function saveDraft() {
    if (busy) return;
    if (!title.trim() && !cover && tracks.length === 0) { setErr('Rien à enregistrer.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/drafts', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: draftId, type: 'album', title: title.trim() || 'Album', thumbnail_url: cover, draft_data: { cover, title, artist, description, price, tracks } }),
      });
      const d = await r.json(); if (d?.draft?.id) setDraftId(d.draft.id);
      setOkMsg('💾 Brouillon enregistré — dans Card → Brouillons.');
    } finally { setBusy(false); }
  }

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
        ...(editId ? { card_id: editId } : {}), // édition d'un album publié → mise à jour EN PLACE
      };
      const r = await fetch('/api/cards/media/publish', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error === 'cover_required' ? 'Ajoute une pochette.' : d?.error === 'tracks_required' ? 'Ajoute au moins un MP3.' : (d?.error || `HTTP ${r.status}`)); return; }
      if (draftId) { try { await fetch(`/api/drafts/${draftId}`, { method: 'DELETE' }); } catch { /* */ } setDraftId(undefined); } // le brouillon publié disparaît
      // Retour au FEED pile sur le post créé (Pascal 2026-09-07 : « ça devrait revenir au feed
      // à l'endroit du post nouvellement créé »). Mécanisme existant de PostFeed : on pose l'id
      // dans t2m_feed_focus, le feed charge jusqu'à la card et scrolle dessus. Feed→feed (règle d'or).
      const newId = d?.card_id as string | undefined;
      if (newId) { try { sessionStorage.setItem('t2m_feed_focus', newId); } catch { /* */ } }
      router.replace('/home');
      return;
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  const canPublish = !busy && !!cover && title.trim().length > 0 && tracks.length > 0;

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '14px 16px 60px' }}>
      <BackButton label="Retour" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#6A7585] hover:text-[#141519] transition-colors mb-2" />

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
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button onClick={saveDraft} disabled={busy}
          style={{ flex: '0 0 auto', padding: '15px 18px', borderRadius: 12, border: '1px solid #E7E9EC', background: '#fff', color: INK, fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>
          Brouillon
        </button>
        <button onClick={publish} disabled={!canPublish}
          style={{ flex: 1, padding: 15, borderRadius: 12, border: 0, background: canPublish ? ACCENT : '#CBD0D6', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 16, cursor: canPublish ? 'pointer' : 'default' }}>
          {busy ? '…' : 'Publier l\'album'}
        </button>
      </div>
    </main>
  );
}
