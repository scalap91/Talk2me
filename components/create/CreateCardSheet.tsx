'use client';

/**
 * CreateCardSheet — feuille « Créer une card » (maquette Gemini composer.png).
 * Ouverte par le bouton + de la BottomNav. Tuiles : Photo/Texte → /creer/texte ·
 * Vidéo → Composer Studio · Boutique → BoutiqueQuickSheet · Plat maison → AddPlatMaisonSheet
 * (Boutique + Plat maison rapatriés de Discussions, Pascal 2026-07-03). Léa prend le relais.
 */
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';

const OPTIONS = [
  // Vidéo (scènes+IA), Texte et Formation retirés du « + Créer » (Pascal 2026-07-05 :
  // pas assez aboutis/définis) → testables uniquement depuis /labo.
  // Ordre par INTENTION (Pascal 2026-07-05) : poster → vendre un bien → commerce local → métier.
  // — Poster / partager
  { key: 'photo', emoji: '📸', bg: '#FF7F11', title: 'Caméra', sub: 'photo · vidéo · live', wide: false },
  { key: 'visuel', emoji: '🎨', bg: '#EC4899', title: 'Visuel', sub: 'compose comme Canva', wide: false },
  // — Vendre un bien (annonces)
  { key: 'article', emoji: '🏷️', bg: '#F59E0B', title: 'Annonce', sub: 'vends un objet', wide: false },
  { key: 'immo', emoji: '🏠', bg: '#0D9488', title: 'Immobilier', sub: 'louer / vendre un bien', wide: false },
  { key: 'auto', emoji: '🚗', bg: '#DC2626', title: 'Automobile', sub: 'vendre / louer un véhicule', wide: false },
  // — Commerce local
  { key: 'boutique', emoji: '🛍️', bg: '#22B573', title: 'Boutique', sub: 'plusieurs articles', wide: false },
  { key: 'platmaison', emoji: '🍲', bg: '#F5A623', title: 'Plat maison', sub: 'voisins à 500 m', wide: false },
  // — Métier / travail
  { key: 'service', emoji: '🔧', bg: '#0EA5E9', title: 'Service', sub: 'devis / prestation', wide: false },
  { key: 'emploi', emoji: '💼', bg: '#EF4444', title: 'Emploi', sub: 'propose un job', wide: false },
  // — Rencontre (Pascal 2026-07-14) : un PROFIL, action « Écrire », pas d'achat.
  { key: 'rencontre', emoji: '❤️', bg: '#EC4899', title: 'Rencontre', sub: 'crée ton profil', wide: false },
] as const;

export default function CreateCardSheet({ open, onClose, onBoutique, onPlat, onService, onEmploi, onArticle, onImmo, onAuto, onRencontre }: { open: boolean; onClose: () => void; onBoutique: () => void; onPlat: () => void; onService: () => void; onEmploi: () => void; onArticle: () => void; onImmo: () => void; onAuto: () => void; onRencontre: () => void }) {
  const router = useRouter();
  if (!open || typeof document === 'undefined') return null;

  const go = (key: string) => {
    onClose();
    // Vidéo → le NOUVEAU composer (/creer/texte), PAS l'ancien Studio /composer (parqué au labo)
    // qui apparaissait en fantôme. Pascal 2026-07-12.
    if (key === 'video') router.push('/creer/texte');
    else if (key === 'photo') router.push('/creer/texte?start=photo');
    else if (key === 'texte') router.push('/creer/texte');
    else if (key === 'visuel') router.push('/creer/visuel'); // designer de cards (Fabric.js, mini-Canva)
    else if (key === 'article') onArticle(); // annonce SEULE (1 objet) → /api/annonces/mine, pas de boutique
    else if (key === 'immo') onImmo(); // annonce IMMOBILIÈRE : même form, pré-réglé sur la catégorie Immobilier
    else if (key === 'auto') onAuto(); // annonce VÉHICULE : même form, pré-réglé sur Véhicules (vente/location → Drive)
    else if (key === 'boutique') onBoutique();
    else if (key === 'service') onService(); // annonce Service : form dédié + kind 'service' + action « Demander un devis »
    else if (key === 'formation') router.push('/creer/formation'); // PDF → Léa découpe en modules → card formation
    else if (key === 'emploi') onEmploi(); // annonce Emploi : form dédié + kind 'emploi' + action « Postuler »
    else if (key === 'rencontre') onRencontre(); // profil Rencontre : form dédié + kind 'rencontre' + action « Écrire »
    else if (key === 'platmaison') onPlat();
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose} role="dialog" aria-label="Créer une card">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="relative w-full max-w-[440px] bg-white rounded-t-[28px] px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-[0_-8px_40px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Fermer" className="absolute right-4 top-4 w-9 h-9 rounded-full bg-[#F0F2F5] text-[#6A7585] grid place-items-center text-[18px] leading-none active:scale-95">✕</button>
        <button type="button" onClick={onClose} aria-label="Fermer" className="block w-10 h-1.5 rounded-full bg-[#E7EAF0] mx-auto mb-4 mt-0.5" />
        <h2 className="text-center text-[19px] font-bold text-[#2F343A] mb-0.5" style={{ fontFamily: "'Outfit',sans-serif" }}>Créer une card</h2>
        <p className="text-center text-[12.5px] text-[#6A7585] mb-4">Un post pour le plaisir, ou lance ton business. À toi de jouer 🔥</p>

        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => go(o.key)}
              className={`flex flex-col items-center bg-[#F5F6F8] border border-[#EDF0F4] rounded-xl py-2.5 px-2 active:scale-[0.97] transition ${o.wide ? 'col-span-2 flex-row justify-center gap-3 py-2.5' : ''}`}
            >
              <div className="w-10 h-10 rounded-xl grid place-items-center text-[18px] mb-1.5" style={{ background: o.bg, marginBottom: o.wide ? 0 : undefined }}>{o.emoji}</div>
              <div className={o.wide ? 'text-left' : ''}>
                <div className="text-[13px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>{o.title}</div>
                <div className="text-[10.5px] text-[#9DAAB7] mt-0.5">{o.sub}</div>
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-[14px] text-[#7C5CFF] mt-6">✨ Quel que soit ton choix, Léa propose — tu décides.</p>
      </motion.div>
    </div>,
    document.body,
  );
}
