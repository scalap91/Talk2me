'use client';

/**
 * Switch « Mode développeur » dans le Profil (Pascal 2026-07-01).
 * Débloque l'Inspecteur de Cards (long-press → « Inspecter ») — le capot moteur.
 * Comme Android : off par défaut, on l'active volontairement.
 */
import { useEffect, useState } from 'react';
import { Braces } from '@/lib/icons';
import { isDevMode, setDevMode } from '@/lib/client/dev-mode';

export default function DevModeToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(isDevMode()); }, []);
  const toggle = () => { const n = !on; setOn(n); setDevMode(n); };

  return (
    <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/[0.05] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Braces size={18} className="text-cyan-300 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-[14px] text-neutral-800 font-medium">Mode développeur</div>
            <div className="text-[12px] text-neutral-500 leading-snug">
              Débloque l’<b>Inspecteur de Cards</b> (appui long sur une card → « Inspecter ») :
              structure, source JSON, rayons avancés. Pour les initiés. L’édition simple reste dispo sans ça.
            </div>
          </div>
        </div>
        <button onClick={toggle} aria-label="Activer le mode développeur"
          className={'shrink-0 w-12 h-7 rounded-full transition-colors relative ' + (on ? 'bg-cyan-500' : 'bg-neutral-300')}>
          <span className={'absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ' + (on ? 'left-[1.6rem]' : 'left-0.5')} />
        </button>
      </div>
    </div>
  );
}
