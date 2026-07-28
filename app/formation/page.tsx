'use client';
/**
 * « Ma formation » (Pascal 2026-07-27) — la formation contributeur EN LIGNE dans l'app.
 * RÉSERVÉE AUX RECRUTÉS : gate is_contributor (403 sinon → écran « réservé »). Contient le
 * simulateur d'économie intégré + le texte de la formation (docs/formation-contributeur.md).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2, GraduationCap } from '@/lib/icons';
import ContributorSimulator from '@/components/formation/ContributorSimulator';
import FormationProgress from '@/components/formation/FormationProgress';

export default function FormationPage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'locked' | 'error'>('loading');
  const [md, setMd] = useState('');

  useEffect(() => {
    fetch('/api/formation/content', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 403) { setState('locked'); return; }
        if (!r.ok) { setState('error'); return; }
        const d = await r.json(); setMd(d.markdown || ''); setState('ok');
      })
      .catch(() => setState('error'));
  }, []);

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

        {/* Ma progression — les 2 gardes-fous à valider pour être certifié (présence + examen) */}
        <div className="rounded-2xl border border-[#ECEAE6] bg-white/60 p-4 mb-6">
          <div className="text-[13px] font-bold text-[#1A1D22] mb-1">🎯 Pour être certifié</div>
          <p className="text-[12.5px] text-[#6E7480] mb-2">Deux preuves, pas des paroles : ta présence signée sur place, et l'examen réussi. Ensuite ton validateur pose ton badge.</p>
          <FormationProgress />
        </div>

        {/* Le simulateur d'économie, intégré dans la formation */}
        <div className="rounded-2xl border border-[#ECEAE6] bg-white/60 p-4 mb-6">
          <div className="text-[13px] font-bold text-[#1A1D22] mb-1">💰 Le modèle en chiffres</div>
          <p className="text-[12.5px] text-[#6E7480] mb-1">Sur chaque vente : 3 % de commission — 2 % plateforme, 1 % pour le référent qui sert le commerce. Bouge les curseurs pour voir ce que tu gagnes.</p>
          <ContributorSimulator />
        </div>

        {/* Le texte de la formation */}
        <article className="formation-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        </article>
      </div>

      <style jsx global>{`
        .formation-prose{font-size:15px;line-height:1.65;color:#2b2f36}
        .formation-prose h1{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:28px 0 10px;padding-bottom:8px;border-bottom:1px solid #ECEAE6}
        .formation-prose h2{font-size:19px;font-weight:800;margin:26px 0 8px;color:#1A1D22}
        .formation-prose h3{font-size:15.5px;font-weight:700;margin:18px 0 6px;color:#1A1D22}
        .formation-prose p{margin:10px 0}
        .formation-prose strong{color:#1A1D22;font-weight:700}
        .formation-prose em{color:#6E7480}
        .formation-prose ul,.formation-prose ol{margin:10px 0;padding-left:22px}
        .formation-prose li{margin:5px 0}
        .formation-prose hr{border:none;border-top:1px solid #ECEAE6;margin:26px 0}
        .formation-prose a{color:#FF7F11;text-decoration:none}
        .formation-prose code{background:#F1EFEB;border-radius:5px;padding:1px 5px;font-size:13.5px}
        .formation-prose blockquote{border-left:3px solid #FF7F11;margin:12px 0;padding:2px 0 2px 14px;color:#4a4f57;background:rgba(255,127,17,.05)}
        .formation-prose table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13.5px;display:block;overflow-x:auto}
        .formation-prose th,.formation-prose td{border:1px solid #ECEAE6;padding:7px 10px;text-align:left}
        .formation-prose th{background:#F5F3EF;font-weight:700}
      `}</style>
    </div>
  );
}
