'use client';
/**
 * Talk2Me — Panneau de GOUVERNANCE (Pascal 2026-07-27). L'interface humaine du moteur de sanction :
 * un validateur voit le CASIER (les faits) d'un recruté + son historique, et pose/lève une sanction
 * SIGNÉE avec motif obligatoire. Il décide sur la DATA, jamais à la tête du client. Non-argent
 * (records/décisions) ; les effets argent/droits ne sont PAS appliqués ici (enforcement gaté).
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from '@/lib/icons';

interface Casier { churn: number; reports: number; refunds: number; litiges: number; score: number; health: 'green' | 'orange' | 'red'; suggested: number; sanction: { level: number; reason: string } | null }
interface Level { level: number; name: string; desc: string; reversible: boolean; neutralConfirm: boolean; touchesMoney: boolean }
interface Sanction { id: string; level: number; reason: string; by_user: string; created_at: number; active: number; expires_at: number | null }

const HEALTH = { green: { t: '✓ Bon', c: '#12B76A', bg: 'rgba(18,183,106,.12)' }, orange: { t: 'À surveiller', c: '#E8890C', bg: 'rgba(255,127,17,.12)' }, red: { t: '⚠ Alerte', c: '#E24C4C', bg: 'rgba(226,76,76,.12)' } };

export default function SanctionPanel({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const [casier, setCasier] = useState<Casier | null>(null);
  const [scale, setScale] = useState<Level[]>([]);
  const [history, setHistory] = useState<Sanction[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([
        fetch(`/api/casier?user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/sanction?user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (c?.casier) setCasier(c.casier);
      if (s?.scale) setScale(s.scale);
      if (s?.sanctions) setHistory(s.sanctions);
    } catch { /* */ } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const info = scale.find((s) => s.level === level) || null;

  const apply = async () => {
    if (!level || busy) return;
    if (!reason.trim()) { setErr('Un motif écrit est obligatoire (droit de recours).'); return; }
    if (info?.neutralConfirm && !window.confirm(`Niveau ${level} (${info.name}) est IRRÉVERSIBLE et doit être confirmé côté neutre. Confirmer ?`)) return;
    setBusy(true); setErr('');
    try {
      const d = await fetch('/api/sanction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action: 'apply', level, reason: reason.trim() }) }).then((r) => r.json());
      if (d?.ok) { setReason(''); setLevel(0); await load(); } else setErr(d?.message || 'Échec.');
    } catch { setErr('Erreur réseau.'); } finally { setBusy(false); }
  };
  const lift = async (id: string) => {
    if (busy) return; setBusy(true); setErr('');
    try { const d = await fetch('/api/sanction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sanction_id: id, action: 'lift' }) }).then((r) => r.json()); if (d?.ok) await load(); else setErr(d?.error === 'irreversible' ? 'Irréversible — ne peut pas être levée.' : 'Échec.'); } catch { /* */ } finally { setBusy(false); }
  };

  const openLitige = async () => {
    const reason = window.prompt(`Ouvrir un litige contre ${name} — motif (les faits) :`);
    if (!reason || !reason.trim() || busy) return;
    setBusy(true);
    try { const d = await fetch('/api/litige', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open', subject_id: userId, reason: reason.trim() }) }).then((r) => r.json()); alert(d?.ok ? 'Litige ouvert. À instruire par un chef, puis tranché par un validateur (page ⚖️ Litiges).' : 'Échec.'); } catch { /* */ } finally { setBusy(false); }
  };

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const cell = (lbl: string, v: number) => (
    <div key={lbl} style={{ background: '#fff', border: '1px solid #ECEAE6', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: v > 0 ? '#1A1D22' : '#C9CDD3' }}>{v}</div>
      <div style={{ fontSize: 10, color: '#9AA0A8', marginTop: 2 }}>{lbl}</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(20,20,26,.55)', display: 'grid', placeItems: 'end center' }} onClick={onClose}>
      <div style={{ background: '#FBFAF8', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', padding: 18, paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D8D5CF', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div><div style={{ fontWeight: 800, fontSize: 17 }}>⚖️ Gouvernance — {name}</div><div style={{ fontSize: 12, color: '#9AA0A8' }}>On juge sur les faits, avec motif. Jamais à la tête du client.</div></div>
          <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: 99, background: '#EDEBE7', border: 'none', fontSize: 13 }}>Fermer</button>
        </div>

        {loading ? <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#9AA0A8' }} /></div> : casier && (
          <>
            {/* CASIER — les faits */}
            <div style={{ background: '#fff', border: '1px solid #ECEAE6', borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6E7480', textTransform: 'uppercase', letterSpacing: '.06em' }}>🛡️ Casier</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: HEALTH[casier.health].c, background: HEALTH[casier.health].bg, padding: '3px 10px', borderRadius: 99 }}>{HEALTH[casier.health].t}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>{cell('Churn', casier.churn)}{cell('Plaintes', casier.reports)}{cell('Rembours.', casier.refunds)}{cell('Litiges', casier.litiges)}</div>
              {casier.suggested > 0 && <div style={{ fontSize: 12, color: '#E8890C', marginTop: 10 }}>La data appelle un <b>niveau {casier.suggested}</b>.</div>}
              <button onClick={openLitige} disabled={busy} style={{ marginTop: 10, width: '100%', padding: '9px', borderRadius: 10, border: '1px solid #E3E6EA', background: '#fff', color: '#6E7480', fontSize: 12.5, fontWeight: 600 }}>⚠ Ouvrir un litige (→ chef instruit, validateur tranche)</button>
            </div>

            {/* POSER UNE SANCTION */}
            <div style={{ background: '#fff', border: '1px solid #ECEAE6', borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>Poser une sanction</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {scale.map((s) => (
                  <button key={s.level} onClick={() => setLevel(s.level)} style={{ padding: '7px 11px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, border: `1px solid ${level === s.level ? '#FF7F11' : '#E3E6EA'}`, background: level === s.level ? 'rgba(255,127,17,.08)' : '#fff', color: '#1A1D22' }}>{s.level}. {s.name}</button>
                ))}
              </div>
              {info && (
                <div style={{ fontSize: 12, color: '#6E7480', marginBottom: 8 }}>{info.desc}{info.touchesMoney && <span style={{ color: '#E24C4C' }}> · effet argent/droits NON appliqué (enforcement gaté)</span>}{info.neutralConfirm && <span style={{ color: '#E8890C' }}> · irréversible, confirmation neutre</span>}</div>
              )}
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (obligatoire) — les faits, pas une opinion" rows={2} style={{ width: '100%', border: '1px solid #E3E6EA', borderRadius: 10, padding: '9px 11px', fontSize: 13.5, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              {err && <div style={{ fontSize: 12, color: '#E24C4C', marginTop: 6 }}>{err}</div>}
              <button onClick={apply} disabled={!level || busy} style={{ marginTop: 10, width: '100%', padding: 12, borderRadius: 10, border: 'none', background: !level ? '#EDEBE7' : '#E24C4C', color: !level ? '#9AA0A8' : '#fff', fontWeight: 700, fontSize: 14 }}>{busy ? '…' : 'Poser la sanction (signée à mon nom)'}</button>
            </div>

            {/* HISTORIQUE */}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6E7480', margin: '4px 2px 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Historique</div>
            {history.length === 0 ? <div style={{ fontSize: 13, color: '#9AA0A8', padding: '0 2px 8px' }}>Aucune sanction. Casier propre.</div> : history.map((h) => (
              <div key={h.id} style={{ background: '#fff', border: '1px solid #ECEAE6', borderRadius: 12, padding: '10px 12px', marginBottom: 8, opacity: h.active ? 1 : 0.55 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>Niveau {h.level} · {scale.find((s) => s.level === h.level)?.name || ''} {h.active ? '' : '(levée)'}</span>
                  {h.active === 1 && <button onClick={() => lift(h.id)} disabled={busy} style={{ fontSize: 12, color: '#12B76A', background: 'none', border: 'none', fontWeight: 600 }}>Lever</button>}
                </div>
                <div style={{ fontSize: 12.5, color: '#4A4F57', marginTop: 3 }}>{h.reason}</div>
                <div style={{ fontSize: 11, color: '#9AA0A8', marginTop: 3 }}>signée · {fmtDate(h.created_at)}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
