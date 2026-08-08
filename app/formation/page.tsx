'use client';
/**
 * « Ma formation » (Pascal 2026-08-02) — l'entrée contributeur dans l'app.
 * RÉSERVÉE AUX RECRUTÉS dont un VALIDATEUR a ouvert l'accès (gate /api/formation/access).
 * Contient : le lien vers LE COURS (= la CARTE FORMATION du feed, source unique .card) +
 * la progression/certification + le simulateur de gains.
 * NB : le cours n'est PLUS un markdown à part (doublon supprimé) — la source est la .card du feed.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2, GraduationCap } from '@/lib/icons';
import FormationProgress from '@/components/formation/FormationProgress';

// LE cours = LA carte .card du feed (source unique). TODO prod : rendre configurable (env/DB).
const FORMATION_CARD_ID = '0371bc49-0c6b-4e4e-b389-8088a8d51969';

export default function FormationPage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'locked' | 'error'>('loading');
  const [status, setStatus] = useState<{ confirmed?: boolean; certified?: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    fetch('/api/formation/access', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { setState('locked'); return; }
        if (!r.ok) { setState('error'); return; }
        const d = await r.json();
        setStatus(d);
        setState(d.has_access ? 'ok' : 'locked');
      })
      .catch(() => setState('error'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const confirmFormation = async () => {
    setConfirming(true);
    try { await fetch('/api/formation/confirm', { method: 'POST' }); load(); } catch { /* */ } finally { setConfirming(false); }
  };
  const declineFormation = async () => {
    setConfirming(true);
    try { await fetch('/api/formation/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decline: true }) }); load(); } catch { /* */ } finally { setConfirming(false); }
  };

  if (state === 'loading') return <div className="fixed inset-0 grid place-items-center bg-[#FBFAF8] text-[#6E7480]"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (state === 'locked') return (
    <div className="min-h-screen bg-[#FBFAF8] text-[#1A1D22] px-5 py-6">
      <button onClick={() => smartBack(router, '/profile')} className="text-[#6E7480] text-sm mb-6">← Retour</button>
      <div className="max-w-sm mx-auto text-center pt-16">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-[18px] font-extrabold mb-2">Formation réservée</h1>
        <p className="text-[14px] text-[#6E7480] leading-relaxed">L'accès à la formation est <b>ouvert par un validateur</b>, lors de sa session. Rapproche-toi d'un validateur de ta zone pour être formé.</p>
      </div>
    </div>
  );

  if (state === 'error') return (
    <div className="min-h-screen bg-[#FBFAF8] grid place-items-center text-[#6E7480] text-[14px]">Formation indisponible pour l'instant.</div>
  );

  return (
    <div className="min-h-screen bg-[#FBFAF8] text-[#1A1D22]">
      <div className="max-w-[760px] mx-auto px-5 py-6 pb-24">
        <button onClick={() => smartBack(router, '/profile')} className="text-[#6E7480] text-sm mb-4">← Retour</button>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[rgba(255,127,17,.15)] grid place-items-center"><GraduationCap className="w-5 h-5 text-[#FF7F11]" /></div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Ma formation</h1>
        </div>
        <p className="text-[14px] text-[#6E7480] mb-4">Deviens un agent de terrain de la marketplace du peuple — et sache te servir de l'outil.</p>

        {/* CONFIRMATION — un validateur t'a convoqué : tu dois ACCEPTER de suivre la formation (Pascal 2026-08-08). */}
        {status && status.confirmed === false && status.certified === false && (
          <div className="rounded-2xl border border-[#FFD9A8] bg-[#FFF6EC] p-4 mb-6">
            <div className="text-[14px] font-extrabold text-[#1A1D22] mb-1">🎓 Tu es convoqué en formation</div>
            <p className="text-[12.5px] text-[#8A6D3B] mb-3 leading-relaxed">Un validateur t'a ouvert la formation. Confirme ta participation pour qu'il t'inscrive à sa prochaine session.</p>
            <div className="flex gap-2">
              <button onClick={confirmFormation} disabled={confirming} className="flex-1 rounded-lg bg-[#FF7F11] text-white font-semibold text-[14px] py-2.5 disabled:opacity-60">{confirming ? '…' : 'Confirmer ma participation'}</button>
              <button onClick={declineFormation} disabled={confirming} className="rounded-lg border border-[#E4C9A6] text-[#8A6D3B] font-semibold text-[14px] px-4 py-2.5 disabled:opacity-60">Refuser</button>
            </div>
          </div>
        )}
        {status && status.confirmed === true && status.certified === false && (
          <div className="rounded-xl border border-[#CDEBD6] bg-[#F1FAF4] px-4 py-2.5 mb-6 text-[13px] text-[#1E7A4B] font-semibold">✓ Participation confirmée — présente-toi à la session de ton validateur.</div>
        )}

        {/* LE COURS = la carte formation du feed (source unique .card) */}
        <button
          onClick={() => router.push(`/card/${FORMATION_CARD_ID}`)}
          className="w-full text-left rounded-2xl border border-[#ECEAE6] bg-white p-4 mb-6 hover:border-[#FF7F11] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="text-2xl">📖</div>
            <div className="flex-1">
              <div className="text-[15px] font-extrabold text-[#1A1D22]">Ouvrir le cours</div>
              <div className="text-[12.5px] text-[#6E7480]">Le cours complet, page par page — le métier, l'app, le composer, la gouvernance.</div>
            </div>
            <div className="text-[#FF7F11] text-lg">→</div>
          </div>
        </button>

        {/* Ma progression — les 2 gardes-fous à valider pour être certifié (présence + examen) */}
        <div className="rounded-2xl border border-[#ECEAE6] bg-white/60 p-4 mb-6">
          <div className="text-[13px] font-bold text-[#1A1D22] mb-1">🎯 Pour être certifié</div>
          <p className="text-[12.5px] text-[#6E7480] mb-2">Deux preuves, pas des paroles : ta présence signée sur place, et l'examen réussi. Ensuite ton validateur pose ton badge.</p>
          <FormationProgress />
        </div>
        {/* « Le modèle en chiffres » (simulateur) RETIRÉ de /formation (Pascal 2026-08-07) — pas besoin ici. */}
      </div>
    </div>
  );
}
