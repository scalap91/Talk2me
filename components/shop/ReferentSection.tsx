'use client';
/**
 * « Mon référent » (Module 5, Phase 1) — sur la fiche du PROPRIÉTAIRE. La fiche lui appartient :
 * c'est LUI qui choisit/change/retire le contributeur qui l'aide (souveraineté). Zéro argent ici.
 * Un changement de référent est loggé côté serveur (switch = alerte → futur casier).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Ref { referent_id: string; name: string; avatar: string | null }
interface UserHit { id: string; display_name: string | null; username: string; talk2me_id?: string; is_friend?: boolean }

export default function ReferentSection({ shopId }: { shopId: string }) {
  const [ref, setRef] = useState<Ref | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try { const d = await fetch(`/api/referents?shop_id=${encodeURIComponent(shopId)}`, { cache: 'no-store' }).then((r) => r.json()); setRef(d?.referent || null); } catch { /* */ }
    setLoading(false);
  }, [shopId]);
  useEffect(() => { load(); }, [load]);

  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      try { const d = await fetch(`/api/friends/search?q=${encodeURIComponent(v.trim())}`).then((r) => r.json()); setHits((d?.users || []).slice(0, 8)); } catch { setHits([]); }
    }, 250);
  };
  const assign = async (u: UserHit) => {
    setBusy(true); setMsg('');
    try {
      const d = await fetch('/api/referents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shop_id: shopId, action: 'set', referent_id: u.id }) }).then((r) => r.json());
      if (d?.ok) { setRef(d.referent); setPicking(false); setQ(''); setHits([]); setMsg(d.changed ? '✅ Référent changé.' : '✅ Référent choisi.'); }
      else setMsg(d?.error === 'cannot_be_own_referent' ? 'Le référent doit être une AUTRE personne.' : 'Échec.');
    } catch { setMsg('Erreur réseau.'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Retirer ton référent ? Il ne gérera plus ta fiche.')) return;
    setBusy(true);
    try { const d = await fetch('/api/referents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shop_id: shopId, action: 'remove' }) }).then((r) => r.json()); if (d?.ok) { setRef(null); setMsg('Référent retiré.'); } } catch { setMsg('Erreur réseau.'); } finally { setBusy(false); }
  };

  if (loading) return null;
  const initial = (n: string) => (n[0] || '?').toUpperCase();

  return (
    <div style={{ background: '#fff', border: '1px solid #EEF0F2', borderRadius: 16, padding: 14, margin: '12px 0' }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#1A1D22', marginBottom: 4 }}>Mon référent</div>
      <p style={{ fontSize: 12, color: '#6A7585', margin: '0 0 10px' }}>La personne qui t'aide à gérer ta fiche. C'est <b>toi</b> qui la choisis — et tu peux la changer quand tu veux.</p>

      {ref ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {ref.avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={ref.avatar} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,127,17,.15)', color: '#FF7F11', fontWeight: 700, display: 'grid', placeItems: 'center' }}>{initial(ref.name)}</div>}
          <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, color: '#1A1D22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.name}</div>
          <button onClick={() => setPicking(true)} disabled={busy} style={{ fontSize: 12.5, color: '#FF7F11', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Changer</button>
          <button onClick={remove} disabled={busy} style={{ fontSize: 12.5, color: '#E24C4C', background: 'none', border: 'none', cursor: 'pointer' }}>Retirer</button>
        </div>
      ) : !picking ? (
        <button onClick={() => setPicking(true)} style={{ width: '100%', padding: '10px', borderRadius: 12, background: '#FF7F11', color: '#fff', fontWeight: 700, fontSize: 13.5, border: 'none', cursor: 'pointer' }}>Choisir un référent</button>
      ) : null}

      {picking && (
        <div style={{ marginTop: 10 }}>
          <input autoFocus value={q} onChange={(e) => search(e.target.value)} placeholder="Nom, identifiant…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid #E3E6EA', fontSize: 14, outline: 'none' }} />
          <div style={{ marginTop: 6 }}>
            {hits.map((u) => (
              <button key={u.id} onClick={() => assign(u)} disabled={busy} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,127,17,.15)', color: '#FF7F11', fontWeight: 700, display: 'grid', placeItems: 'center', fontSize: 13 }}>{initial(u.display_name || u.username)}</div>
                <span style={{ flex: 1, fontSize: 13.5, color: '#1A1D22' }}>{u.display_name || u.username}</span>
                {u.is_friend && <span style={{ fontSize: 10, color: '#12B76A', background: 'rgba(18,183,106,.12)', padding: '2px 7px', borderRadius: 8 }}>ami</span>}
              </button>
            ))}
          </div>
          <button onClick={() => { setPicking(false); setQ(''); setHits([]); }} style={{ marginTop: 4, fontSize: 12.5, color: '#6A7585', background: 'none', border: 'none', cursor: 'pointer' }}>Annuler</button>
        </div>
      )}

      {msg && <p style={{ fontSize: 12.5, color: msg.startsWith('✅') ? '#12B76A' : '#E24C4C', marginTop: 8, marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}
