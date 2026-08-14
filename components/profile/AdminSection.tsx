'use client';

/**
 * Talk2Me — section ADMIN du profil (Pascal 2026-06-10).
 * - Toggle « Mode admin » (déplacé ici pour ne pas décaler le menu du Hub).
 * - Super-admin uniquement : donner des DROITS granulaires à des collaborateurs
 *   (ex : « Remplir la boutique ») — différents des siens.
 * Ne s'affiche que si l'user est admin-capable.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag } from '@/lib/icons';


export default function AdminSection() {
  const router = useRouter();
  const [capable, setCapable] = useState(false);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [myPerms, setMyPerms] = useState<string[]>([]);
  const [adminMode, setAdminMode] = useState(false);
  type ShopToggle = 'eat' | 'annonces' | 'boutique' | 'rencontre' | 'pub';
  const [shopSections, setShopSections] = useState<Record<ShopToggle, boolean>>({ eat: true, annonces: true, boutique: true, rencontre: true, pub: true });
  // « Vider le feed » (bouton + diag + wipe HTTP) SUPPRIMÉ (Pascal 2026-08-14) : pas de bouton
  // qui efface tout le contenu d'un doigt. Le wipe se fait UNIQUEMENT en ligne de commande (SQL/
  // node direct sur data/talktome.db). API /api/cards/{wipe-feed,feed-diag,channels-diag} + lib
  // wipeFeed() + page /admin/wipe-feed retirées avec.

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const u = d?.user; if (!u) return;
      setCapable(!!u.is_admin_capable); setSuperAdmin(!!u.is_admin); setMyPerms(Array.isArray(u.permissions) ? u.permissions : []);
      try { setAdminMode(localStorage.getItem('t2m_admin_mode') === '1'); } catch { /* */ }
      if (u.is_admin) { loadShop(); }
    }).catch(() => {});
  }, []);

  const loadShop = () => fetch('/api/admin/shop-toggle', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.sections) setShopSections(d.sections); }).catch(() => {});
  const toggleSection = async (section: ShopToggle, label: string) => {
    const next = !shopSections[section];
    // FERMER un module = confirmation obligatoire (Pascal 2026-08-14) : on ne masque pas une
    // section pour tous les utilisateurs sur un simple appui. L'activer ne demande rien.
    if (!next && typeof window !== 'undefined' &&
        !window.confirm(`Fermer « ${label} » ? La section disparaîtra pour TOUS les utilisateurs. Tu pourras la rouvrir ici.`)) return;
    setShopSections((s) => ({ ...s, [section]: next }));
    try {
      const r = await fetch('/api/admin/shop-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, enabled: next }) }).then((x) => x.json());
      if (r?.sections) setShopSections(r.sections);
    } catch { setShopSections((s) => ({ ...s, [section]: !next })); }
  };


  const toggleMode = () => setAdminMode((v) => { const n = !v; try { localStorage.setItem('t2m_admin_mode', n ? '1' : '0'); } catch { /* */ } return n; });

  if (!capable) return null;

  // Style commun d'un bouton de ligne (navigation) + d'un titre de sous-bloc.
  const rowBtn = 'w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[13px] text-neutral-800';
  const blockTitle = 'text-[11px] uppercase tracking-wider text-amber-700 font-semibold';

  return (
    // Plus de titre « Espace admin » ici : ce composant vit DÉJÀ dans la section « Espace Admin »
    // du Profil (fini le « espace admin dans espace admin »). Rangé en 3 blocs. Pascal 2026-08-14.
    <div className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.05] p-5 space-y-5">

      {/* ── BLOC 1 · AFFICHAGE — ce qui est visible pour les utilisateurs ── */}
      <div className="space-y-3">
        <div className={blockTitle}>Affichage</div>
        {/* Mode admin (les onglets basculent en gestion) */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[14px] text-neutral-800 font-medium">Mode admin</div>
            <div className="text-[12px] text-neutral-500">Les onglets basculent en gestion (Eat, Shop…).</div>
          </div>
          <button onClick={toggleMode} aria-label="Activer/désactiver le mode admin" className={'shrink-0 w-12 h-7 rounded-full transition-colors relative ' + (adminMode ? 'bg-amber-500' : 'bg-neutral-300')}>
            <span className={'absolute top-1 w-5 h-5 rounded-full bg-white transition-all' + (adminMode ? ' left-6' : ' left-1')} />
          </button>
        </div>
        {/* Sections du Shop — fermer une section demande CONFIRMATION (cf. toggleSection). Super-admin. */}
        {superAdmin && (
          <div className="pt-1 space-y-2.5">
            <div className="text-[13px] text-neutral-800 font-medium flex items-center gap-1.5"><ShoppingBag size={14} className="text-amber-600" /> Sections du Shop</div>
            <p className="text-[11px] text-neutral-500 -mt-1">L&apos;icône Shop reste ; tu actives/masques chaque sous-partie (fermer = confirmation).</p>
            {([
              { key: 'eat' as const, label: 'Eat (restos / plats)' },
              { key: 'annonces' as const, label: 'Annonces' },
              { key: 'boutique' as const, label: 'Boutiques' },
              { key: 'rencontre' as const, label: 'Rencontre' },
              { key: 'pub' as const, label: 'Publicité' },
            ]).map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[13px] text-neutral-800">{label}</span>
                <button onClick={() => toggleSection(key, label)} aria-label={'Activer/désactiver ' + label} className={'shrink-0 w-12 h-7 rounded-full transition-colors relative ' + (shopSections[key] ? 'bg-amber-500' : 'bg-neutral-300')}>
                  <span className={'absolute top-1 w-5 h-5 rounded-full bg-white transition-all' + (shopSections[key] ? ' left-6' : ' left-1')} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── BLOC 2 · CROISSANCE — diffusion & acquisition (super-admin) ── */}
      {superAdmin && (
        <div className="pt-3 border-t border-neutral-200 space-y-2">
          <div className={blockTitle}>Croissance</div>
          <button onClick={() => router.push('/admin/flyer')} className={rowBtn}>
            <span aria-hidden>📍</span> Carte prospectus (générer le QR + scans)
          </button>
        </div>
      )}

      {/* ── BLOC 3 · TECHNIQUE — plan des modules & prototypes ── */}
      <div className="pt-3 border-t border-neutral-200 space-y-2">
        <div className={blockTitle}>Technique</div>
        {/* Navigation DURE (<a>) — /schema et /labo sont sous des groupes de route ; en SPA la
            route attrape-tout app/[slug] les intercepterait → 404. Pascal 2026-06-29 / 2026-08-14. */}
        <a href="/schema" className={rowBtn}><span aria-hidden>🧭</span> Boussole technique (plan des modules)</a>
        <a href="/labo" className={rowBtn}><span aria-hidden>🧪</span> Labo (prototypes parqués)</a>
      </div>

      {/* PARQUÉS AU LABO (/labo) ou RETIRÉS (Pascal 2026-08-14) — traçabilité :
          • File de validation (curation Shein) → labo · CM assisté (FB) → labo · Reversement manuel → labo.
          • Fonctionnalités premium (Pièces 3D → labo ; Feed unifié = code mort) → retiré.
          • Doublon Vérification CNI → retiré (vit dans l'administratif via l'entrée validateur du Profil).
          • Vider le feed → retiré (wipe = ligne de commande uniquement). */}

    </div>
  );
}
