'use client';
/**
 * « Ma progression » (Pascal 2026-07-27) — la CHECKLIST du recruté pour être certifié, dans la formation.
 * Deux gardes-fous ANTI-TRICHE, côté recruté :
 *   1. SIGNER SA PRÉSENCE — saisir l'OTP de la session (lu par le validateur) + géoloc → prouve qu'il était
 *      PHYSIQUEMENT sur place (< 300 m). Impossible à falsifier après coup.
 *   2. PASSER L'EXAMEN — les règles sacrées ; correction CÔTÉ SERVEUR (les bonnes réponses n'arrivent jamais ici).
 * Une fois les deux faits, le VALIDATEUR peut certifier (« connaît le taf »). L'état vient du serveur (honnête au reload).
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, CheckCircle2, ClipboardCheck } from '@/lib/icons';

interface Status { signed_presence: boolean; quiz_passed: boolean; certified: boolean }
interface Q { q: string; options: string[] }

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #ECEAE6', borderRadius: 16, boxShadow: '0 1px 2px rgba(26,29,34,.04)' };

export default function FormationProgress() {
  const [st, setSt] = useState<Status | null>(null);
  const [otp, setOtp] = useState('');
  const [signing, setSigning] = useState(false);
  const [signMsg, setSignMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [quiz, setQuiz] = useState<Q[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; passed: boolean } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const d = await fetch('/api/formation/access', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
      if (d?.ok) setSt({ signed_presence: !!d.signed_presence, quiz_passed: !!d.quiz_passed, certified: !!d.certified });
    } catch { /* */ }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  // 1) SIGNER LA PRÉSENCE — géoloc obligatoire (preuve de co-présence).
  const sign = () => {
    const code = otp.trim();
    if (!code || signing) return;
    setSigning(true); setSignMsg(null);
    const post = async (lat: number | null, lng: number | null) => {
      try {
        const r = await fetch('/api/formation/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, lat, lng, via: 'otp' }) });
        const d = await r.json();
        if (r.ok) { setSignMsg({ ok: true, text: d.message || '✅ Présence signée.' }); setOtp(''); loadStatus(); }
        else setSignMsg({ ok: false, text: d.message || 'Échec de la signature.' });
      } catch { setSignMsg({ ok: false, text: 'Erreur réseau.' }); } finally { setSigning(false); }
    };
    if (!navigator.geolocation) { setSignMsg({ ok: false, text: 'Ton téléphone ne partage pas sa position — impossible de signer.' }); setSigning(false); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => post(p.coords.latitude, p.coords.longitude),
      () => { setSignMsg({ ok: false, text: 'Active ta position pour signer ta présence (obligatoire).' }); setSigning(false); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  // 2) EXAMEN — charge les questions, corrige côté serveur.
  const openQuiz = async () => {
    if (quiz) return;
    try { const d = await fetch('/api/formation/quiz', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); if (d?.questions) setQuiz(d.questions); } catch { /* */ }
  };
  const submitQuiz = async () => {
    if (!quiz || grading) return;
    if (Object.keys(answers).length < quiz.length) { setResult({ score: 0, total: quiz.length, passed: false }); return; }
    setGrading(true);
    try {
      const arr = quiz.map((_, i) => (i in answers ? answers[i] : -1));
      const d = await fetch('/api/formation/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: arr }) }).then((r) => r.json());
      if (typeof d?.score === 'number') { setResult({ score: d.score, total: d.total, passed: d.passed }); loadStatus(); }
    } catch { /* */ } finally { setGrading(false); }
  };

  if (!st) return <div style={{ ...CARD, padding: 18, display: 'grid', placeItems: 'center' }}><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#9AA0A8' }} /></div>;

  const stepDone = (ok: boolean) => (ok ? { color: '#12B76A', bg: 'rgba(18,183,106,.12)', label: '✓ fait' } : { color: '#E8890C', bg: 'rgba(255,127,17,.12)', label: 'à faire' });
  const sp = stepDone(st.signed_presence), qp = stepDone(st.quiz_passed);

  return (
    <div style={{ margin: '4px 0 8px' }}>
      {st.certified ? (
        <div style={{ ...CARD, padding: 18, border: '1px solid #12B76A', background: 'linear-gradient(180deg,rgba(18,183,106,.10),transparent 70%)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <CheckCircle2 className="w-7 h-7" style={{ color: '#12B76A', flexShrink: 0 }} />
          <div><div style={{ fontWeight: 800, fontSize: 15 }}>Tu es certifié — « connaît le taf »</div><div style={{ fontSize: 13, color: '#6E7480' }}>Présence signée + examen réussi + validé par ton validateur. Tu peux agir sur le terrain.</div></div>
        </div>
      ) : (
        <>
          {/* ÉTAPE 1 — PRÉSENCE */}
          <div style={{ ...CARD, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: st.signed_presence ? 0 : 10 }}>
              <MapPin className="w-4 h-4" style={{ color: '#FF7F11' }} />
              <span style={{ fontWeight: 700, fontSize: 14.5, flex: 1 }}>1 · Signer ma présence</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: sp.color, background: sp.bg, padding: '3px 9px', borderRadius: 99 }}>{sp.label}</span>
            </div>
            {!st.signed_presence && (
              <>
                <p style={{ fontSize: 12.5, color: '#6E7480', margin: '0 0 10px' }}>Le validateur t'annonce un <b>code de session</b>. Saisis-le ici, sur place — ta position confirme que tu es bien là.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="Code à 6 chiffres" style={{ flex: 1, minWidth: 0, border: '1px solid #E3E6EA', borderRadius: 10, padding: '11px 12px', fontSize: 16, letterSpacing: '.18em', fontVariantNumeric: 'tabular-nums', outline: 'none' }} />
                  <button onClick={sign} disabled={signing || otp.trim().length < 6} style={{ border: 'none', borderRadius: 10, padding: '0 16px', background: otp.trim().length < 6 ? '#F1EFEB' : '#FF7F11', color: otp.trim().length < 6 ? '#9AA0A8' : '#fff', fontWeight: 700, fontSize: 14, cursor: otp.trim().length < 6 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>{signing ? 'Position…' : 'Signer'}</button>
                </div>
                {signMsg && <p style={{ fontSize: 12.5, marginTop: 8, color: signMsg.ok ? '#12B76A' : '#E24C4C' }}>{signMsg.text}</p>}
              </>
            )}
          </div>

          {/* ÉTAPE 2 — EXAMEN */}
          <div style={{ ...CARD, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: st.quiz_passed ? 0 : 10 }}>
              <ClipboardCheck className="w-4 h-4" style={{ color: '#FF7F11' }} />
              <span style={{ fontWeight: 700, fontSize: 14.5, flex: 1 }}>2 · Passer l'examen</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: qp.color, background: qp.bg, padding: '3px 9px', borderRadius: 99 }}>{qp.label}</span>
            </div>
            {!st.quiz_passed && (
              <>
                {!quiz ? (
                  <button onClick={openQuiz} style={{ marginTop: 2, border: '1px solid #FF7F11', color: '#FF7F11', background: 'transparent', borderRadius: 10, padding: '10px 14px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Commencer l'examen — {6} questions</button>
                ) : (
                  <>
                    {quiz.map((qq, i) => (
                      <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid #F1EFEB' : 'none' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 7 }}>{i + 1}. {qq.q}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {qq.options.map((opt, oi) => {
                            const sel = answers[i] === oi;
                            return (
                              <button key={oi} onClick={() => setAnswers((a) => ({ ...a, [i]: oi }))} style={{ textAlign: 'left', border: `1px solid ${sel ? '#FF7F11' : '#E3E6EA'}`, background: sel ? 'rgba(255,127,17,.08)' : '#fff', borderRadius: 10, padding: '9px 12px', fontSize: 13, cursor: 'pointer', color: '#1A1D22' }}>
                                <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 99, border: `2px solid ${sel ? '#FF7F11' : '#C9CDD3'}`, background: sel ? '#FF7F11' : '#fff', marginRight: 8, verticalAlign: '-3px' }} />{opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <button onClick={submitQuiz} disabled={grading} style={{ marginTop: 12, width: '100%', border: 'none', borderRadius: 10, padding: '12px', background: '#FF7F11', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{grading ? 'Correction…' : 'Valider mes réponses'}</button>
                    {result && !result.passed && (
                      <p style={{ fontSize: 13, marginTop: 10, color: '#E24C4C', textAlign: 'center' }}>{result.score}/{result.total} — il faut 5 sur 6. Relis la formation et réessaie.</p>
                    )}
                  </>
                )}
              </>
            )}
            {st.quiz_passed && <p style={{ fontSize: 12.5, color: '#12B76A', margin: 0 }}>Examen réussi. Ton validateur peut maintenant te certifier.</p>}
          </div>

          {st.signed_presence && st.quiz_passed && (
            <p style={{ fontSize: 12.5, color: '#6E7480', marginTop: 12, textAlign: 'center' }}>✅ Les deux étapes sont faites. <b>Rapproche-toi de ton validateur</b> — il pose ton badge « connaît le taf ».</p>
          )}
        </>
      )}
    </div>
  );
}
