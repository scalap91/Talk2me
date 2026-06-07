'use client';

import { X, Share, Plus } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Talk2Me #332 — Modal instructions installation iOS Safari.
 *
 * Safari n'expose pas `beforeinstallprompt` : on doit guider l'utilisateur
 * manuellement à travers le geste "Partage → Sur l'écran d'accueil → Ajouter".
 *
 * Charte premium Talk2Me : dark sobre, accents violets discrets, pas de gros
 * dégradés ni glow permanent (voir feedback_talktome_design_premium).
 */
export function IosInstallModal({ onClose }: { onClose: () => void }) {
  // Fermeture sur ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-title"
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 pt-12 sm:p-4"
      onClick={onClose}
      data-testid="ios-install-modal"
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-white/12 bg-[#15151c] shadow-[0_24px_64px_rgba(0,0,0,0.55)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-5">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-red-300/85">
              Installer sur iPhone
            </div>
            <h2
              id="ios-install-title"
              className="text-[18px] font-medium text-white/95 tracking-tight"
            >
              Talk2Me sur ton écran d&apos;accueil
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 p-1.5 rounded-full text-white/55 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <ol className="px-5 py-5 space-y-3">
          <li className="flex items-start gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-red-500/15 border border-red-400/30 text-red-200 text-[12px] font-medium inline-flex items-center justify-center">
              1
            </span>
            <div className="flex-1 text-[13.5px] text-white/85 leading-relaxed">
              Tape l&apos;icône <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 align-middle"><Share size={12} className="text-blue-300" /><span className="text-white/85 text-[12px]">Partage</span></span> en bas de Safari.
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-red-500/15 border border-red-400/30 text-red-200 text-[12px] font-medium inline-flex items-center justify-center">
              2
            </span>
            <div className="flex-1 text-[13.5px] text-white/85 leading-relaxed">
              Fais défiler et choisis <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 align-middle"><Plus size={12} className="text-white/85" /><span className="text-white/85 text-[12px]">Sur l&apos;écran d&apos;accueil</span></span>.
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-red-500/15 border border-red-400/30 text-red-200 text-[12px] font-medium inline-flex items-center justify-center">
              3
            </span>
            <div className="flex-1 text-[13.5px] text-white/85 leading-relaxed">
              Confirme en tapant <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-white/90 text-[12px]">Ajouter</span> en haut à droite.
            </div>
          </li>
        </ol>

        <div className="px-5 pb-5 pt-1 text-[12px] text-white/50 leading-relaxed border-t border-white/8">
          Tu retrouveras Talk2Me comme une vraie app, plein écran, sans barre Safari.
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-full bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-colors"
          >
            J&apos;ai compris
          </button>
        </div>
      </div>
    </div>
  );
}

export default IosInstallModal;
