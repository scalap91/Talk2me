'use client';

/**
 * Talk2Me — Écran STAFF : nomination des validateurs (Pascal 2026-07-30).
 * Le droit `curation_validateur` (autoriser l'accès à l'argent) ne s'ouvre QUE par le staff
 * (anti-capture). Nomination sur 2 critères : mérite (échelon/casier) + envie du rôle neutre.
 * Le validateur devient NEUTRE (pas de commission sur ce qu'il valide) mais GARDE ses contrats,
 * et il est payé pour former. Cf. mémoire project_talk2me_gouvernance_anticorruption.
 */
import { useCallback, useEffect, useState } from 'react';

interface Row {
  user_id: string; username: string; display_name: string | null;
  level_rank: number; level_name: string; granted: string[];
}

const wrap: React.CSSProperties = { maxWidth: 660, margin: '0 auto', padding: '22px 16px 60px', fontFamily: "system-ui, -apple-system, sans-serif", color: '#1c1c22' };
const doctrine: React.CSSProperties = { fontSize: 13, lineHeight: 1.55, color: '#5b6270', background: 'rgba(124,92,255,.08)', border: '1px solid rgba(124,92,255,.25)', borderRadius: 12, padding: '12px 14px', margin: '10px 0 18px' };
const card: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', border: '1px solid #E7EAF0', borderRadius: 12, marginBottom: 10, flexWrap: 'wrap' };
const btnPrimary: React.CSSProperties = { padding: '8px 14px', borderRadius: 9, border: 'none', background: '#7C5CFF', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { padding: '8px 14px', borderRadius: 9, border: '1px solid #E7EAF0', background: '#fff', color: '#6A7585', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const badgeV: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: '#16A34A', background: 'rgba(22,163,74,.14)', marginLeft: 8 };

export default function ValidateursAdminPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/contributors', { cache: 'no-store' });
    if (r.status === 403) { setForbidden(true); return; }
    const d = await r.json().catch(() => null);
    setRows((d?.contributors as Row[]) || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const isValidateur = (row: Row) => row.granted.includes('curation_validateur');
  // MÉRITE = avoir fait TOUT le parcours (grimpé toute l'échelle contributeur, dernier échelon = rang 5).
  // Le staff nomine UNIQUEMENT parmi ces candidats méritants (Pascal 2026-08-08). Pas de candidature.
  const PARCOURS_COMPLET = 5;
  const eligible = (row: Row) => row.level_rank >= PARCOURS_COMPLET;

  async function act(user_id: string, action: 'nominate_validateur' | 'revoke_validateur') {
    setBusy(user_id);
    try {
      await fetch('/api/admin/contributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id, action }) });
      await load();
    } finally { setBusy(''); setConfirmId(''); }
  }

  if (forbidden) return <div style={wrap}><h1 style={{ fontSize: 20 }}>🛡️ Nomination des validateurs</h1><p>Réservé au <b>staff</b>.</p></div>;
  if (!rows) return <div style={wrap}>Chargement…</div>;

  const filtered = rows
    .filter((r) => !q.trim() || (r.display_name || '').toLowerCase().includes(q.toLowerCase()) || r.username.toLowerCase().includes(q.toLowerCase()))
    // Éligibles (parcours complet) d'abord, puis par échelon décroissant.
    .sort((a, z) => (Number(eligible(z)) - Number(eligible(a))) || (z.level_rank - a.level_rank));
  const nbV = rows.filter(isValidateur).length;

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 21, margin: '0 0 2px' }}>🛡️ Nomination des validateurs</h1>
      <div style={{ fontSize: 12.5, color: '#9AA0AA' }}>{rows.length} contributeurs · {nbV} validateur{nbV > 1 ? 's' : ''}</div>
      <p style={doctrine}>
        Nomination <b>staff-only</b> (dernier verrou anti-capture — le rail de l&apos;argent ne s&apos;ouvre qu&apos;à la racine).
        <b>Le mérite = avoir fait TOUT le parcours</b> (grimpé toute l&apos;échelle, dernier échelon). Tu nommes
        <b> uniquement parmi ces candidats méritants</b>. Le validateur devient <b>neutre</b> (aucune commission
        sur ce qu&apos;il valide), <b>garde ses contrats</b>, et est <b>payé pour former</b>.
      </p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un contributeur…" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #E7EAF0', fontSize: 14, marginBottom: 14, outline: 'none' }} />

      {filtered.map((row) => {
        const v = isValidateur(row);
        return (
          <div key={row.user_id} style={card}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{row.display_name || `@${row.username}`}{v && <span style={badgeV}>✅ Validateur</span>}{!v && eligible(row) && <span style={{ ...badgeV, color: '#7C5CFF', background: 'rgba(124,92,255,.14)' }}>🎓 Parcours complet</span>}</div>
              <div style={{ fontSize: 12, color: '#9AA0AA' }}>@{row.username} · échelon : <b style={{ color: '#6A7585' }}>{row.level_name}</b> (rang {row.level_rank}/{PARCOURS_COMPLET})</div>
            </div>
            {v ? (
              <button disabled={busy === row.user_id} onClick={() => act(row.user_id, 'revoke_validateur')} style={btnGhost}>{busy === row.user_id ? '…' : 'Retirer le rôle'}</button>
            ) : !eligible(row) ? (
              <span style={{ fontSize: 12, color: '#9AA0AA', fontWeight: 600, whiteSpace: 'nowrap' }}>Parcours pas fini · rang {row.level_rank}/{PARCOURS_COMPLET}</span>
            ) : confirmId === row.user_id ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button disabled={busy === row.user_id} onClick={() => act(row.user_id, 'nominate_validateur')} style={btnPrimary}>{busy === row.user_id ? '…' : 'Confirmer'}</button>
                <button onClick={() => setConfirmId('')} style={btnGhost}>Annuler</button>
              </div>
            ) : (
              <button onClick={() => setConfirmId(row.user_id)} style={btnPrimary}>Nommer validateur</button>
            )}
          </div>
        );
      })}
      {!filtered.length && <div style={{ color: '#9AA0AA', fontSize: 14, padding: '20px 0' }}>Aucun contributeur trouvé.</div>}
    </div>
  );
}
