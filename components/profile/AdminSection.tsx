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
import { Shield, ShoppingBag } from '@/lib/icons';


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
  const toggleSection = async (section: ShopToggle) => {
    const next = !shopSections[section];
    setShopSections((s) => ({ ...s, [section]: next }));
    try {
      const r = await fetch('/api/admin/shop-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, enabled: next }) }).then((x) => x.json());
      if (r?.sections) setShopSections(r.sections);
    } catch { setShopSections((s) => ({ ...s, [section]: !next })); }
  };


  const toggleMode = () => setAdminMode((v) => { const n = !v; try { localStorage.setItem('t2m_admin_mode', n ? '1' : '0'); } catch { /* */ } return n; });

  if (!capable) return null;

  return (
    <div className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.05] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-amber-600" />
        <span className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">Espace admin</span>
      </div>

      {/* Toggle mode admin */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[14px] text-neutral-800 font-medium">Mode admin</div>
          <div className="text-[12px] text-neutral-500">Les onglets basculent en gestion (Eat, Shop…).</div>
        </div>
        <button onClick={toggleMode} className={'w-12 h-7 rounded-full transition-colors relative ' + (adminMode ? 'bg-amber-500' : 'bg-neutral-300')}>
          <span className={'absolute top-1 w-5 h-5 rounded-full bg-white transition-all' + (adminMode ? ' left-6' : ' left-1')} />
        </button>
      </div>

      {/* Boussole technique — accessible depuis l'Espace admin. Navigation DURE
          (<a> full reload) pour éviter que la route attrape-tout app/[slug]
          n'intercepte /schema en SPA et affiche un 404. Pascal 2026-06-29. */}
      <a href="/schema" className="w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-800">
        <span aria-hidden>🧭</span> Boussole technique (plan des modules)
      </a>

      {/* Porte du LABO : prototypes parqués (Salle 3D, Avatar IA, Boutique 3D…) restés branchés
          pour la R&D. Navigation DURE (<a>) — /labo est sous le groupe (labo), sinon la route
          attrape-tout app/[slug] l'intercepte en SPA → 404. Pascal 2026-08-14. */}
      <a href="/labo" className="w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-800">
        <span aria-hidden>🧪</span> Labo (prototypes parqués)
      </a>

      {/* « FILE DE VALIDATION » (curation) PARQUÉE AU LABO (Pascal 2026-08-14).
          À QUOI C'EST RELIÉ : c'est le rail de gouvernance de la CURATION de la BOUTIQUE SHEIN
          — les « regardeurs » (droit curation_regardeur) proposaient des fiches produit (Shein),
          les « validateurs » (curation_validateur) validaient/refusaient avant publication.
          POURQUOI PARQUÉ : on n'est plus dans l'optique de garder la boutique Shein → stratégie
          ancienne, on y reviendra. Code intact (page /admin/validation + API /api/curation/*),
          accessible uniquement via le LABO (/labo). Bouton retiré de l'Espace Admin live. */}

      {/* Super-admin : switch des sous-sections du Shop (l'icône Shop reste toujours) */}
      {superAdmin && (
        <div className="pt-3 border-t border-neutral-200 space-y-2.5">
          <div className="text-[13px] text-neutral-800 font-medium flex items-center gap-1.5"><ShoppingBag size={14} className="text-amber-600" /> Sections du Shop</div>
          <p className="text-[11px] text-neutral-500 -mt-1">L'icône Shop reste ; tu actives/masques chaque sous-partie.</p>
          {([
            { key: 'eat' as const, label: 'Eat (restos / plats)' },
            { key: 'annonces' as const, label: 'Annonces' },
            { key: 'boutique' as const, label: 'Boutiques' },
            { key: 'rencontre' as const, label: 'Rencontre' },
            { key: 'pub' as const, label: 'Publicité' },
          ]).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-[13px] text-neutral-800">{label}</span>
              <button onClick={() => toggleSection(key)} aria-label={'Activer/désactiver ' + label} className={'w-12 h-7 rounded-full transition-colors relative ' + (shopSections[key] ? 'bg-amber-500' : 'bg-neutral-300')}>
                <span className={'absolute top-1 w-5 h-5 rounded-full bg-white transition-all' + (shopSections[key] ? ' left-6' : ' left-1')} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Section « Fonctionnalités premium » RETIRÉE (Pascal 2026-08-14). « Feed unifié (test) » =
          code mort depuis l'unification du feed sur `cards`+ranking. « Pièces 3D » = la 3D immersive
          quitte le feed pour vivre au LABO (bouton Labo ci-dessus) → plus de toggle admin, plus de
          switch caché : au labo la 3D est toujours accessible pour la R&D, jamais dans le fil. */}

      {/* DOUBLON « Vérification CNI » RETIRÉ de l'Espace Admin (Pascal 2026-08-14). L'Espace Admin
          est PUREMENT TECHNIQUE ; la vérif d'identité relève de la GOUVERNANCE → elle vit dans
          l'administratif (entrée validateur « 🪪 Vérifier les identités (CNI) » du Profil, gated
          isValidateur → /admin/cni). On ne garde pas la même porte en double. */}

      {/* « CM ASSISTÉ » PARQUÉ AU LABO (Pascal 2026-08-14).
          CE QUE C'ÉTAIT : outil marketing/croissance — l'IA préparait un post prêt-à-publier
          (titre + texte + 1er commentaire + image) pour chaque annonce publiée ; l'admin copiait-
          collait à la MAIN dans un GROUPE FACEBOOK (pas d'auto-post = pas de ban Meta).
          POURQUOI PARQUÉ : intérêt pas clair / pas utilisé. Ce n'est ni technique ni gouvernance,
          donc pas sa place dans l'Espace Admin. Code intact (page /admin/cm + API /api/admin/cm),
          atteignable uniquement via le LABO (/labo). On y reviendra si besoin. */}

      {/* Super-admin : carte des scans du prospectus (où T2M se répand). */}
      {superAdmin && (
        <button onClick={() => router.push('/admin/flyer')} className="w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-800">
          <span aria-hidden>📍</span> Carte prospectus (scans du QR)
        </button>
      )}

      {/* « REVERSEMENT MANUEL » PARQUÉ AU LABO (Pascal 2026-08-14).
          CE QUE C'ÉTAIT : outil FINANCE de secours — listait les bénéficiaires à payer (solde wallet
          crédité par l'escrow à la livraison) ; l'admin envoyait le mobile money À LA MAIN puis
          cliquait « J'ai versé » → débit du wallet + trace + Telegram. Bootstrap en attendant le
          payout AUTOMATIQUE (PaPi/Paysend). POURQUOI PARQUÉ : ne sert plus (le rail auto prend le
          relais). Code intact (page /admin/payouts + API /api/admin/payouts), via le LABO (/labo). */}

      {/* « Vider le feed » (zone danger + diag) RETIRÉ (Pascal 2026-08-14) : aucun bouton pour
          effacer tout le contenu d'un doigt. Le wipe passe UNIQUEMENT par la ligne de commande. */}

    </div>
  );
}
