'use client';

/**
 * CreateCardSheet — feuille « Créer » (CALÉE À L'EXACT SUR LE NATIF, Pascal 2026-07-28).
 * Miroir de `_openCreate` / `_createChoices` / `_createSections` de talk2me-flutter/lib/main.dart :
 *  - ouverte par le + de la BottomNav ;
 *  - 4 sections titrées (Créer & partager · Vendre un bien · Commerce & services · Autres) ;
 *  - 14 tuiles en RANGÉE (icône + titre + sous-titre), Film ET Album SÉPARÉS, + Restaurant ;
 *  - feuille SCROLLABLE bornée à 72% de l'écran.
 * Phase 2 (à suivre) : chaque tuile ouvrira son écran « Mes X » (liste + bouton +) avant le formulaire,
 * comme `_pickCreate` du natif. Ici : la feuille.
 */
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';

// ORDRE + libellés + couleurs IDENTIQUES au natif (_createChoices).
const CHOICES: Record<string, { emoji: string; bg: string; title: string; sub: string }> = {
  photo: { emoji: '📸', bg: '#FF7F11', title: 'Caméra', sub: 'photo · vidéo · live' },
  visuel: { emoji: '🎨', bg: '#EC4899', title: 'Visuel', sub: 'compose comme Canva' },
  film: { emoji: '🎬', bg: '#7C3AED', title: 'Film', sub: 'en projet ou à vendre' },
  album: { emoji: '🎵', bg: '#7C5CFF', title: 'Album', sub: 'ta musique à vendre' },
  article: { emoji: '🏷️', bg: '#F59E0B', title: 'Annonce', sub: 'vends un objet' },
  immo: { emoji: '🏠', bg: '#0D9488', title: 'Immobilier', sub: 'louer / vendre un bien' },
  auto: { emoji: '🚗', bg: '#DC2626', title: 'Automobile', sub: 'vendre / louer un véhicule' },
  boutique: { emoji: '🛍️', bg: '#22B573', title: 'Boutique', sub: 'plusieurs articles' },
  platmaison: { emoji: '🍲', bg: '#F5A623', title: 'Plat maison', sub: 'voisins à 500 m' },
  restaurant: { emoji: '🍽️', bg: '#E8590C', title: 'Restaurant', sub: 'ta carte sur Eat' },
  service: { emoji: '🔧', bg: '#0EA5E9', title: 'Service', sub: 'devis / prestation' },
  emploi: { emoji: '💼', bg: '#EF4444', title: 'Emploi', sub: 'propose un job' },
  rencontre: { emoji: '❤️', bg: '#EC4899', title: 'Rencontre', sub: 'ton profil' },
  pub: { emoji: '📢', bg: '#FF7F11', title: 'Publicité', sub: 'lance une campagne' },
};

// Sections IDENTIQUES au natif (_createSections).
const SECTIONS: { title: string; keys: string[] }[] = [
  { title: 'Créer & partager', keys: ['photo', 'visuel', 'film', 'album'] },
  { title: 'Vendre un bien', keys: ['article', 'immo', 'auto'] },
  { title: 'Commerce & services', keys: ['boutique', 'platmaison', 'restaurant', 'service', 'emploi'] },
  { title: 'Autres', keys: ['rencontre', 'pub'] },
];

export default function CreateCardSheet({ open, onClose, onBoutique, onPlat, onRestaurant, onService, onEmploi, onArticle, onImmo, onAuto, onRencontre }: { open: boolean; onClose: () => void; onBoutique: () => void; onPlat: () => void; onRestaurant: () => void; onService: () => void; onEmploi: () => void; onArticle: () => void; onImmo: () => void; onAuto: () => void; onRencontre: () => void }) {
  const router = useRouter();
  if (!open || typeof document === 'undefined') return null;

  const go = (key: string) => {
    onClose();
    if (key === 'photo') router.push('/creer/texte?start=photo');
    else if (key === 'visuel') router.push('/creer/visuel'); // designer de cards (Fabric.js, mini-Canva)
    else if (key === 'film') router.push('/creer/oeuvre'); // Film (terminé ou EN PROJET)
    else if (key === 'album') router.push('/creer/album'); // Album (musique) — composer dédié
    else if (key === 'article') router.push('/mes-annonces'); // Phase 2 : écran « Mes annonces » (liste + bouton +) puis form
    else if (key === 'immo') router.push('/mes-immobilier'); // Phase 2 : écran « Mes biens » (liste + bouton +)
    else if (key === 'auto') router.push('/mes-vehicules'); // Phase 2 : écran « Mes véhicules » (liste + bouton +)
    else if (key === 'boutique') router.push('/mes-boutiques'); // Phase 2 : écran « Mes boutiques » (liste + bouton +)
    else if (key === 'platmaison') router.push('/mes-plats'); // Phase 2 : écran « Mes plats » (liste + bouton +)
    else if (key === 'restaurant') router.push('/mes-restos'); // Phase 2 : écran « Mes restos » (liste + bouton +)
    else if (key === 'service') router.push('/mes-services'); // Phase 2 : écran « Mes services » (liste + bouton +)
    else if (key === 'emploi') router.push('/mes-emploi'); // Phase 2 : écran « Mes offres d'emploi » (liste + bouton +)
    else if (key === 'rencontre') onRencontre();
    else if (key === 'pub') router.push('/creer/pub'); // RÉGIE : composer pub + paiement PaPi avant diffusion
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose} role="dialog" aria-label="Créer">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="relative w-full max-w-[440px] bg-white rounded-t-[28px] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_40px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête : « Créer » + fermer (identique natif) */}
        <div className="flex items-center pl-5 pr-3 pt-4 pb-1.5">
          <h2 className="text-[20px] font-extrabold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Créer</h2>
          <div className="flex-1" />
          <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full grid place-items-center text-[#9DAAB7] active:scale-95 text-[20px] leading-none">✕</button>
        </div>

        {/* Corps SCROLLABLE borné à 72% écran (identique natif) */}
        <div className="max-h-[72vh] overflow-y-auto overscroll-contain">
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <p className="px-[18px] pt-2.5 pb-1 text-[11px] font-extrabold tracking-[0.5px] text-[#9DAAB7]" style={{ fontFamily: "'Inter',sans-serif" }}>{sec.title.toUpperCase()}</p>
              <div className="grid grid-cols-2 gap-3 px-3.5 pb-1.5">
                {sec.keys.map((key) => {
                  const c = CHOICES[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => go(key)}
                      className="flex items-center gap-2.5 bg-[#F7F8FA] border border-[#EAECEF] rounded-2xl p-3 text-left active:scale-[0.97] transition"
                    >
                      <div className="w-11 h-11 shrink-0 rounded-[13px] grid place-items-center text-[22px]" style={{ background: c.bg }}>{c.emoji}</div>
                      <div className="min-w-0">
                        <div className="text-[14.5px] font-bold text-[#2F343A] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>{c.title}</div>
                        <div className="text-[11px] text-[#6A7585] truncate" style={{ fontFamily: "'Inter',sans-serif" }}>{c.sub}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="h-2" />
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
