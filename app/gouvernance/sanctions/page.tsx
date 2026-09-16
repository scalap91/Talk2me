'use client';
/**
 * /gouvernance/sanctions — FILE STAFF (Pascal 2026-08-29, Branchement 3) : « toute sanction non
 * levée remonte au staff ». Supervision finale, staff-only (isAiOpsAdmin). Voit qui est sanctionné,
 * si un recours est en cours, et peut LEVER en dernier ressort.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';

interface Row {
  id: string;
  user: { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
  level: number; reason: string; by_user: string; created_at: number;
  appeal: { id: string; status: string } | null;
}
const LEVEL: Record<number, string> = { 1: 'Rappel', 2: 'Restriction', 3: 'Suspension', 4: 'Retrait du rôle', 5: 'Exclusion' };
const LEVEL_CLS: Record<number, string> = { 1: '#B45309', 2: '#D97706', 3: '#DC2626', 4: '#B91C1C', 5: '#7F1D1D' };

export default function StaffSanctionsPage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden'>('loading');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/sanctions', { cache: 'no-store' });
    if (r.status === 403) { setState('forbidden'); return; }
    const d = await r.json().catch(() => null);
    if (d?.ok) { setRows(d.sanctions || []); setState('ok'); } else setState('forbidden');
  }, []);
  useEffect(() => { load(); }, [load]);

  const lift = async (id: string) => {
    if (busy) return; setBusy(id);
    try {
      const d = await fetch('/api/admin/sanctions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lift', sanction_id: id }) }).then((r) => r.json());
      if (d?.ok) await load(); else alert(d?.error || 'Échec.');
    } finally { setBusy(''); }
  };

  return (
    <div style={{ minHeight: '100svh', background: 'var(--t2m-wash, #f5f6f7)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '14px 16px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button onClick={() => smartBack(router, '/profile')} style={{ fontSize: 22, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2m-ink-2,#4a5561)' }}>‹</button>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--t2m-ink, #16181d)', margin: 0 }}>Mesures en cours</h1>
        </div>

        {state === 'loading' && <p style={{ color: 'var(--t2m-ink-3,#8a94a2)' }}>Chargement…</p>}
        {state === 'forbidden' && <p style={{ color: 'var(--t2m-ink-2,#4a5561)' }}>Accès réservé au staff.</p>}
        {state === 'ok' && rows.length === 0 && (
          <div style={{ background: 'var(--t2m-paper,#fff)', border: '1px solid var(--t2m-line,#e7e9ec)', borderRadius: 14, padding: 20, textAlign: 'center', color: 'var(--t2m-ink-2,#4a5561)' }}>
            ✅ Aucune mesure en cours. Tout est clean.
          </div>
        )}
        {state === 'ok' && rows.map((s) => (
          <div key={s.id} style={{ background: 'var(--t2m-paper,#fff)', border: '1px solid var(--t2m-line,#e7e9ec)', borderRadius: 14, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.user.avatar_url
                ? <img src={s.user.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e7e9ec' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--t2m-ink,#16181d)' }}>{s.user.display_name || s.user.username || 'Utilisateur'}</div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: LEVEL_CLS[s.level] || '#B45309' }}>{LEVEL[s.level] || `Niveau ${s.level}`}</div>
              </div>
              {s.appeal
                ? <span style={{ fontSize: 11.5, fontWeight: 700, color: '#B45309', background: '#FEF3E2', padding: '3px 8px', borderRadius: 999 }}>recours {s.appeal.status === 'instructed' ? 'examiné' : 'ouvert'}</span>
                : <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>pas de recours</span>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2m-ink-2,#4a5561)', marginTop: 8 }}>{s.reason}</div>
            <button onClick={() => lift(s.id)} disabled={busy === s.id}
              style={{ marginTop: 10, width: '100%', height: 40, borderRadius: 10, border: '1px solid #0E9F6E', background: 'rgba(14,159,110,0.08)', color: '#0E9F6E', fontWeight: 700, cursor: 'pointer' }}>
              {busy === s.id ? '…' : 'Retirer (dernier ressort)'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
