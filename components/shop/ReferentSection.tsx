'use client';
/**
 * « Mon référent » (Module 5, Phase 1) — sur la fiche du PROPRIÉTAIRE. La fiche lui appartient :
 * c'est LUI qui choisit/change/retire le contributeur qui l'aide (souveraineté). Zéro argent ici.
 * Un changement de référent est loggé côté serveur (switch = alerte → futur casier).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Ref { referent_id: string; name: string; avatar: string | null }
interface UserHit { id: string; display_name: string | null; username: string; talk2me_id?: string; is_friend?: boolean }

export default function ReferentSection({ shopId, allowGive, onGiven }: { shopId: string; allowGive?: boolean; onGiven?: (clientName: string) => void }) {
  const [ref, setRef] = useState<Ref | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState<'set' | 'give'>('set'); // 'set' = choisir référent · 'give' = donner la fiche
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

  // Le système PROPOSE nos amis par défaut (Pascal 2026-08-13) : à l'ouverture + quand la recherche est vide.
  const loadFriends = () => {
    fetch('/api/friends/list', { cache: 'no-store' }).then((r) => r.json())
      .then((d) => setHits((d?.friends || []).slice(0, 8).map((f: UserHit) => ({ id: f.id, username: f.username, display_name: f.display_name, talk2me_id: f.talk2me_id, is_friend: true }))))
      .catch(() => setHits([]));
  };
  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { loadFriends(); return; } // vide → on re-propose les amis
    timer.current = setTimeout(async () => {
      try { const d = await fetch(`/api/friends/search?q=${encodeURIComponent(v.trim())}`).then((r) => r.json()); setHits((d?.users || []).slice(0, 8)); } catch { setHits([]); }
    }, 250);
  };
  const openPicker = (m: 'set' | 'give') => { setMode(m); setPicking(true); setQ(''); setMsg(''); loadFriends(); };
  const assign = async (u: UserHit) => {
    const name = u.display_name || u.username;
    if (mode === 'give' && !window.confirm(`Donner cette fiche à ${name} ? Cette personne en devient PROPRIÉTAIRE (tu restes son référent tant qu'elle ne te retire pas).`)) return;
    setBusy(true); setMsg('');
    try {
      const payload = mode === 'give'
        ? { shop_id: shopId, action: 'give', client_id: u.id }
        : { shop_id: shopId, action: 'set', referent_id: u.id };
      const d = await fetch('/api/referents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => r.json());
      if (d?.ok) {
        setPicking(false); setQ(''); setHits([]);
        if (mode === 'give') { setMsg(`✅ Fiche donnée à ${d.client?.name || name}.`); onGiven?.(d.client?.name || name); }
        else { setRef(d.referent); setMsg(d.changed ? '✅ Référent changé.' : '✅ Référent choisi.'); }
      } else setMsg(d?.error === 'cannot_be_own_referent' ? 'Le référent doit être une AUTRE personne.' : d?.error === 'invalid_client' ? 'Choisis une autre personne.' : 'Échec.');
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
          <button onClick={() => openPicker('set')} disabled={busy} style={{ fontSize: 12.5, color: '#FF7F11', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>Changer</button>
          <button onClick={remove} disabled={busy} style={{ fontSize: 12.5, color: '#E24C4C', background: 'none', border: 'none', cursor: 'pointer' }}>Retirer</button>
        </div>
      ) : !picking ? (
        <button onClick={() => openPicker('set')} style={{ width: '100%', padding: '10px', borderRadius: 12, background: '#FF7F11', color: '#fff', fontWeight: 700, fontSize: 13.5, border: 'none', cursor: 'pointer' }}>Choisir un référent</button>
      ) : null}

      {allowGive && !picking && (
        <button onClick={() => openPicker('give')} disabled={busy} style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 12, background: '#fff', color: '#1A1D22', fontWeight: 700, fontSize: 13.5, border: '1px solid #E3E6EA', cursor: 'pointer' }}>
          Donner cette fiche à un client
        </button>
      )}

      {picking && (
        <div style={{ marginTop: 10 }}>
          {mode === 'give' && <p style={{ fontSize: 12, color: '#B54708', margin: '0 0 8px' }}>Choisis la personne à qui <b>donner</b> cette fiche : elle en devient <b>propriétaire</b>, tu restes son référent.</p>}
          <input autoFocus value={q} onChange={(e) => search(e.target.value)} placeholder={mode === 'give' ? 'À qui donner la fiche ?' : 'Nom, identifiant…'}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid #E3E6EA', fontSize: 14, outline: 'none', color: '#1A1D22', background: '#fff' }} />
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
