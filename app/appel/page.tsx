'use client';
/**
 * /appel — CONTESTER SA SANCTION (Pascal 2026-08-29, Branchement 2). Le sanctionné voit sa sanction
 * active et ouvre un recours. Le chef INSTRUIT, le validateur TRANCHE (lever/maintenir). L'app a
 * tranché ; l'humain revoit. Page atteinte depuis la notif « ⚠ Avertissement » (link=/appel).
 */
import { useEffect, useState, useCallback } from 'react';

interface Sanction { id: string; level: number; reason: string; created_at: number }
interface Appeal { id: string; status: string; created_at: number }
const LEVEL_NAME: Record<number, string> = { 1: 'Avertissement', 2: 'Restriction', 3: 'Suspension', 4: 'Retrait du rôle', 5: 'Bannissement' };

export default function AppelPage() {
  const [loading, setLoading] = useState(true);
  const [sanction, setSanction] = useState<Sanction | null>(null);
  const [appeal, setAppeal] = useState<Appeal | null>(null);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/sanction/appeal', { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (d?.ok) { setSanction(d.sanction); setAppeal(d.appeal); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!reason.trim()) { setMsg('Explique pourquoi tu contestes.'); return; }
    setSending(true); setMsg(null);
    try {
      const r = await fetch('/api/sanction/appeal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
      const d = await r.json().catch(() => null);
      if (d?.ok) { setMsg('Recours envoyé. Un responsable de zone va l’examiner.'); await load(); }
      else setMsg(d?.message || 'Impossible d’envoyer le recours.');
    } finally { setSending(false); }
  };

  return (
    <div style={{ minHeight: '100svh', background: 'var(--t2m-wash, #f5f6f7)', padding: '20px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--t2m-ink, #16181d)', margin: '4px 0 14px' }}>Contester une sanction</h1>

        {loading ? (
          <p style={{ color: 'var(--t2m-ink-3, #8a94a2)' }}>Chargement…</p>
        ) : !sanction ? (
          <div style={{ background: 'var(--t2m-paper, #fff)', border: '1px solid var(--t2m-line, #e7e9ec)', borderRadius: 14, padding: 18 }}>
            <p style={{ color: 'var(--t2m-ink-2, #4a5561)', margin: 0 }}>Tu n’as aucune sanction active. Rien à contester 👍</p>
          </div>
        ) : (
          <>
            <div style={{ background: 'var(--t2m-paper, #fff)', border: '1px solid var(--t2m-line, #e7e9ec)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: '#b45309', textTransform: 'uppercase' }}>Sanction en cours</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t2m-ink, #16181d)', margin: '6px 0 4px' }}>{LEVEL_NAME[sanction.level] || `Niveau ${sanction.level}`}</div>
              <div style={{ fontSize: 14, color: 'var(--t2m-ink-2, #4a5561)' }}>{sanction.reason}</div>
            </div>

            {appeal ? (
              <div style={{ background: 'var(--t2m-paper, #fff)', border: '1px solid var(--t2m-line, #e7e9ec)', borderRadius: 14, padding: 18 }}>
                <p style={{ margin: 0, color: 'var(--t2m-ink-2, #4a5561)' }}>
                  ✅ Ton recours est <b>{appeal.status === 'instructed' ? 'en cours d’examen par un validateur' : 'reçu, en attente d’un responsable de zone'}</b>.
                </p>
              </div>
            ) : (
              <div style={{ background: 'var(--t2m-paper, #fff)', border: '1px solid var(--t2m-line, #e7e9ec)', borderRadius: 14, padding: 18 }}>
                <label style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t2m-ink, #16181d)' }}>Pourquoi contestes-tu ?</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
                  placeholder="Explique ta version des faits…"
                  style={{ width: '100%', marginTop: 8, padding: 12, borderRadius: 10, border: '1px solid var(--t2m-line, #e7e9ec)', background: 'var(--t2m-wash, #f5f6f7)', color: 'var(--t2m-ink, #16181d)', fontSize: 14, resize: 'vertical' }} />
                <button onClick={submit} disabled={sending}
                  style={{ marginTop: 12, width: '100%', height: 46, borderRadius: 999, border: 'none', background: 'var(--t2m-ink, #16181d)', color: '#fff', fontSize: 15, fontWeight: 700, opacity: sending ? 0.6 : 1 }}>
                  {sending ? 'Envoi…' : 'Envoyer le recours'}
                </button>
              </div>
            )}
            {msg && <p style={{ marginTop: 12, color: 'var(--t2m-ink-2, #4a5561)', fontSize: 13.5 }}>{msg}</p>}
          </>
        )}
      </div>
    </div>
  );
}
