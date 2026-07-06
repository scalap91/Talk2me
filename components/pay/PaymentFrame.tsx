'use client';

/**
 * Talk2Me — Cadre de paiement PaPi (Pascal 2026-06-27). La page PaPi est externe
 * (cross-origin) → on ne peut PAS la recolorer ; on brande NOTRE cadre autour
 * (header rouge/sombre + « Talk2Me · Paiement sécurisé »). Le branding de la page
 * PaPi elle-même se règle dans le compte marchand PaPi. Doctrine [[project_talk2me_papi_payment]].
 */
/* eslint-disable @next/next/no-img-element */
import { X, Lock } from '@/lib/icons';

export default function PaymentFrame({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] bg-[#0b0b0d] flex flex-col">
      <div className="shrink-0 flex items-center gap-2.5 px-3 h-14 border-b border-red-500/30 bg-[#101015]">
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full grid place-items-center text-white/85 hover:bg-white/10"><X className="w-5 h-5" /></button>
        {/* Logo officiel Talk2Me (cf. reference_talk2me_brand_logo). */}
        <img src="/brand/t2m-logo-square.png" alt="Talk2Me" className="w-8 h-8 rounded-lg object-contain" />
        <span className="text-white/70 text-[13px] inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-emerald-300" /> Paiement sécurisé</span>
      </div>
      <iframe src={url} title="Paiement" className="flex-1 w-full bg-white" allow="payment" />
    </div>
  );
}
