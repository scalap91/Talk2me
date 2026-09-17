'use client';
/**
 * /gouvernance — HUB de la gouvernance (Pascal 2026-09-16). Re-branchement des outils qui
 * existaient mais étaient orphelins d'URL (aucun menu n'y menait). Vocabulaire adouci :
 * « Médiation » (différends) et « mesures » (au lieu de litiges / sanctions).
 * Gate par rôle : la Médiation s'affiche pour référent/validateur ; les Mesures pour le staff.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2 } from '@/lib/icons';

interface Med { is_chef: boolean; is_validateur: boolean; open: unknown[]; instructed: unknown[] }

export default function GouvernanceHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [med, setMed] = useState<Med | null>(null);
  const [staff, setStaff] = useState<{ ok: boolean; count: number } | null>(null);
  const [pet, setPet] = useState<number>(0);
  const [leave, setLeave] = useState<{ mine: { on_leave: boolean }; negligence: { id: string; reason: string | null }[]; leaves: { user_id: string; until_at: number }[] } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Médiation : /api/litige renvoie is_chef/is_validateur + les files (403 si aucun rôle).
      const m = await fetch('/api/litige', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      // Mesures : /api/admin/sanctions est staff-only (403 sinon).
      const s = await fetch('/api/admin/sanctions', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      // Pétitions : file escaladée que je peux trancher (validateur/staff).
      const pt = await fetch('/api/petition', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const lv = await fetch('/api/gouvernance/leave', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!alive) return;
      setMed(m?.ok ? m : null);
      setStaff(s?.ok ? { ok: true, count: (s.sanctions || []).length } : null);
      setPet(pt?.ok ? (pt.petitions || []).length : 0);
      setLeave(lv?.ok ? lv : null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const refreshLeave = async () => { const lv = await fetch('/api/gouvernance/leave', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null); setLeave(lv?.ok ? lv : null); };
  const declareLeave = async () => { const d = window.prompt('Indisponible combien de jours ? (max 30)', '7'); const days = Math.min(30, Math.max(1, Number(d) || 0)); if (!days) return; await fetch('/api/gouvernance/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'declare', until_at: Date.now() + days * 86400000 }) }); refreshLeave(); };
  const endLeave = async () => { await fetch('/api/gouvernance/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'end' }) }); refreshLeave(); };

  if (loading) return <div className="fixed inset-0 grid place-items-center bg-[#FBFAF8] text-[#6E7480]"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const canMediate = !!med && (med.is_chef || med.is_validateur);
  const isStaff = !!staff?.ok;
  const canPetitions = (!!med && med.is_validateur) || isStaff;
  const nothing = !canMediate && !isStaff;

  const card = 'w-full text-left rounded-2xl border border-[#ECEAE6] bg-white p-4 mb-3 flex items-start gap-3 hover:border-[#D9D5CE] transition-colors';
  const badge = 'inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-bold text-white bg-[#FF7F11]';

  return (
    <div className="min-h-screen bg-[#FBFAF8] text-[#1A1D22] px-5 py-6 pb-24">
      <div className="max-w-[640px] mx-auto">
        <button onClick={() => smartBack(router, '/profile')} className="text-[#6E7480] text-sm mb-4">← Retour</button>
        <h1 className="text-[22px] font-extrabold tracking-tight mb-1">🤝 Gouvernance</h1>
        <p className="text-[14px] text-[#6E7480] mb-5">Ton espace pour accompagner la communauté : on <b>examine</b> les différends, on <b>décide</b> avec justice, et on <b>retire</b> les mesures dès que c’est réglé.</p>

        {!nothing && leave && (
          <div className="rounded-2xl border border-[#ECEAE6] bg-white p-4 mb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-bold">Mon statut de gardien</div>
                <div className="text-[12px] text-[#6E7480]">{leave.mine.on_leave ? '\uD83C\uDF34 Tu es en indisponibilit\u00e9 \u2014 aucune marque de n\u00e9gligence pendant l\u2019absence.' : 'Disponible. Tu peux te d\u00e9clarer indisponible (cong\u00e9/m\u00e9dical, max 30 j).'}</div>
              </div>
              {leave.mine.on_leave
                ? <button onClick={endLeave} className="shrink-0 px-3 py-2 rounded-lg bg-[#0E9F6E] text-white text-[12.5px] font-semibold">Je reviens</button>
                : <button onClick={declareLeave} className="shrink-0 px-3 py-2 rounded-lg border border-[#E3E6EA] text-[#4A4F57] text-[12.5px] font-semibold">Me d\u00e9clarer indisponible</button>}
            </div>
            {leave.negligence.length > 0 && (
              <div className="mt-3 rounded-lg bg-[#FEF3E2] px-3 py-2 text-[12.5px] text-[#8A5A0A]">\u23F0 <b>{leave.negligence.length} dossier(s) laiss\u00e9(s) en retard</b> \u2014 \u00e7a p\u00e8se sur ton casier. Traite tes dossiers pour \u00e9viter la descente.</div>
            )}
            {leave.leaves.length > 0 && <div className="mt-3 text-[11.5px] text-[#9AA0A8]">En cong\u00e9 : {leave.leaves.length} gardien(s).</div>}
          </div>
        )}

        {canMediate && (() => {
          const nOpen = med!.is_chef ? med!.open.length : 0;
          const nInstr = med!.is_validateur ? med!.instructed.length : 0;
          const total = nOpen + nInstr;
          return (
            <button onClick={() => router.push('/gouvernance/litiges')} className={card}>
              <span className="text-[26px] leading-none">🤝</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <b className="text-[15px]">Médiation</b>
                  {total > 0 && <span className={badge}>{total}</span>}
                </span>
                <span className="block text-[13px] text-[#6E7480] mt-0.5">Examiner et décider les différends entre membres (achat, location, échange). Neutre, sur les faits.</span>
                {total > 0 && <span className="block text-[12px] text-[#B45309] mt-1">{nOpen > 0 && `${nOpen} à examiner`}{nOpen > 0 && nInstr > 0 && ' · '}{nInstr > 0 && `${nInstr} à décider`}</span>}
              </span>
              <span className="text-[#C7C2B9] text-[20px] leading-none">›</span>
            </button>
          );
        })()}

        {canPetitions && (
          <button onClick={() => router.push('/gouvernance/petitions')} className={card}>
            <span className="text-[26px] leading-none">⚖️</span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <b className="text-[15px]">Pétitions</b>
                {pet > 0 && <span className={badge} style={{ background: '#7F1D1D' }}>{pet}</span>}
              </span>
              <span className="block text-[13px] text-[#6E7480] mt-0.5">Dénonciations collectives d’un supérieur (chef/validateur). Juger sur les faits — calomnie = retour de bâton.</span>
            </span>
            <span className="text-[#C7C2B9] text-[20px] leading-none">›</span>
          </button>
        )}

        {isStaff && (
          <button onClick={() => router.push('/gouvernance/sanctions')} className={card}>
            <span className="text-[26px] leading-none">🛡️</span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <b className="text-[15px]">Mesures en cours</b>
                {staff!.count > 0 && <span className={badge} style={{ background: '#6E7480' }}>{staff!.count}</span>}
              </span>
              <span className="block text-[13px] text-[#6E7480] mt-0.5">Suivi des mesures en vigueur. Le staff peut les <b>retirer</b> en dernier ressort.</span>
            </span>
            <span className="text-[#C7C2B9] text-[20px] leading-none">›</span>
          </button>
        )}

        {nothing && (
          <div className="max-w-sm mx-auto text-center pt-16">
            <div className="text-4xl mb-3">🤝</div>
            <h1 className="text-[18px] font-extrabold mb-2">Réservé à la gouvernance</h1>
            <p className="text-[14px] text-[#6E7480]">Examiner un différend = chef de secteur ; décider = validateur ; le suivi des mesures = staff.</p>
          </div>
        )}
      </div>
    </div>
  );
}
