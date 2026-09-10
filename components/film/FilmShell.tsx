'use client';
/**
 * components/film/FilmShell.tsx — CHROME partagé des écrans FILM (miroir natif, Pascal 2026-09-10).
 * En-tête collant (flèche retour + titre du film) + fond clair + conteneur. Chaque étape du parcours
 * (Écriture · Storyboard · Tournage · Montage) l'utilise pour un rendu IDENTIQUE d'un écran à l'autre.
 */
import type { ReactNode } from 'react';
import BackButton from '@/components/system/BackButton';

const OUTFIT = { fontFamily: "'Outfit',sans-serif" } as const;

export function FilmShell({ title, children, back }: { title: string; children: ReactNode; back?: string }) {
  return (
    <div className="min-h-screen" style={{ background: '#F4F5F7', color: '#141519' }}>
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 h-14 bg-white border-b border-[#EDF0F4]">
        <BackButton size={20} to={back} className="w-9 h-9 grid place-items-center rounded-full text-[#2F343A] hover:text-black transition-colors active:scale-95 shrink-0" />
        <h1 className="text-[17px] font-extrabold text-[#2F343A] truncate" style={OUTFIT}>{title}</h1>
      </header>
      <main className="max-w-[600px] mx-auto px-4 pt-4 pb-28">{children}</main>
    </div>
  );
}

/** Titre d'étape + sous-titre gris (comme « Écriture guidée » + explication). */
export function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[26px] font-black text-[#141519]" style={OUTFIT}>{title}</h2>
      <p className="text-[15px] text-[#6A7585] mt-1 leading-snug">{subtitle}</p>
    </div>
  );
}

/** Bandeau vert « prêt » (fin d'étape) — texte vert sur fond vert clair. */
export function GreenBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3.5 mt-5" style={{ background: '#E9F9EF', color: '#15803D' }}>
      <span className="mt-0.5 w-6 h-6 shrink-0 grid place-items-center rounded-full text-white text-[13px] font-black" style={{ background: '#22C55E' }}>✓</span>
      <div className="text-[15px] font-bold leading-snug" style={OUTFIT}>{children}</div>
    </div>
  );
}

/** Gros bouton d'action orange plein largeur (CTA d'étape). */
export function CtaButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-full mt-4 rounded-2xl py-4 text-white text-[17px] font-extrabold active:scale-[0.99] transition disabled:opacity-60"
      style={{ ...OUTFIT, background: disabled ? '#CBD0D6' : '#FF7F11' }}>
      {children}
    </button>
  );
}

/** Carte blanche arrondie (scène, plan, étape créative…). */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white border border-[#EAECEF] rounded-2xl p-4 mb-3 ${className}`}>{children}</div>;
}
