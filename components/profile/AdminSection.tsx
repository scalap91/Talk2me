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
import { Shield, Loader2, Check, ShoppingBag, Banknote, Trash2 } from '@/lib/icons';


export default function AdminSection() {
  const router = useRouter();
  const [capable, setCapable] = useState(false);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [myPerms, setMyPerms] = useState<string[]>([]);
  const [adminMode, setAdminMode] = useState(false);
  type ShopToggle = 'eat' | 'annonces' | 'boutique' | 'rencontre' | 'pub';
  const [shopSections, setShopSections] = useState<Record<ShopToggle, boolean>>({ eat: true, annonces: true, boutique: true, rencontre: true, pub: true });
  // Card OS — "on part propre" : vider le feed social (super-admin).
  const [wipeBusy, setWipeBusy] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState(false);
  const [wipeMsg, setWipeMsg] = useState('');
  const [diag, setDiag] = useState<null | { counts: Record<string, number>; feed_items: number; feed_covered_by_wipe: number; feed_orphans: { kind: string; id: string }[]; db_path: string }>(null);
  const loadDiag = () => fetch('/api/cards/feed-diag', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.ok) setDiag(d); }).catch(() => {});
  type ChanStat = { total: number; withCard: number; pct: number };
  const [chan, setChan] = useState<null | { feed: ChanStat; annonces: ChanStat; boutique: ChanStat; eat: ChanStat }>(null);
  const loadChan = () => fetch('/api/cards/channels-diag', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.ok) setChan(d.channels); }).catch(() => {});

  const wipeFeed = async () => {
    setWipeBusy(true); setWipeMsg('');
    try {
      const r = await fetch('/api/cards/wipe-feed?confirm=VIRE-TOUT', { method: 'POST' }).then((x) => x.json());
      if (r?.ok) setWipeMsg(`Feed vidé ✓ — ${r.deleted.cards} cards + ${r.deleted.posts} clips, ${r.deleted.likes} likes, ${r.deleted.comments} commentaires supprimés.`);
      else setWipeMsg('Erreur : ' + (r?.error || 'inconnue'));
    } catch { setWipeMsg('Erreur réseau.'); }
    finally { setWipeBusy(false); setWipeConfirm(false); }
  };

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const u = d?.user; if (!u) return;
      setCapable(!!u.is_admin_capable); setSuperAdmin(!!u.is_admin); setMyPerms(Array.isArray(u.permissions) ? u.permissions : []);
      try { setAdminMode(localStorage.getItem('t2m_admin_mode') === '1'); } catch { /* */ }
      if (u.is_admin) { loadShop(); loadDiag(); loadChan(); }
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
        <Shield size={16} className="text-amber-300" />
        <span className="text-[11px] uppercase tracking-wider text-amber-200/80">Espace admin</span>
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
          <div className="text-[13px] text-neutral-800 font-medium flex items-center gap-1.5"><ShoppingBag size={14} className="text-amber-300" /> Sections du Shop</div>
          <p className="text-[11px] text-neutral-400 -mt-1">L'icône Shop reste ; tu actives/masques chaque sous-partie.</p>
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

      {/* Super-admin : CM assisté groupe Facebook */}
      {superAdmin && (
        <button onClick={() => router.push('/admin/cm')} className="w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-800">
          <ShoppingBag className="w-4 h-4 text-amber-300" /> CM assisté — posts groupe Facebook
        </button>
      )}

      {/* Super-admin : carte des scans du prospectus (où T2M se répand). */}
      {superAdmin && (
        <button onClick={() => router.push('/admin/flyer')} className="w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-800">
          <span aria-hidden>📍</span> Carte prospectus (scans du QR)
        </button>
      )}

      {/* Super-admin : reversement manuel (jambe "reverser" en attendant le payout auto) */}
      {superAdmin && (
        <button onClick={() => router.push('/admin/payouts')} className="w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-800">
          <Banknote className="w-4 h-4 text-emerald-300" /> Reversement manuel (sommes dues)
        </button>
      )}

      {/* Super-admin : ZONE DANGER — vider le feed (Card OS, on part propre) */}
      {superAdmin && (
        <div className="pt-3 border-t border-neutral-200 space-y-2">
          <div className="text-[13px] text-red-300 font-medium flex items-center gap-1.5"><Trash2 size={14} /> Vider le feed</div>
          <p className="text-[11px] text-neutral-400 -mt-1">
            Supprime tous les posts du feed (image/vidéo/texte) + leurs likes/commentaires.
            Garde produits de boutique, brouillons, conversations. Irréversible.
          </p>
          {/* PREUVE Card OS : couverture `.card` réelle par canal (withCard/total). */}
          {chan && (
            <div className="rounded-xl bg-neutral-100 border border-neutral-200 px-3 py-2 text-[11.5px] font-mono leading-relaxed">
              <div className="text-neutral-500 mb-1 not-italic font-sans text-[11px] uppercase tracking-wide">Couverture .card par canal</div>
              {([['feed', chan.feed], ['annonces', chan.annonces], ['boutique', chan.boutique], ['eat', chan.eat]] as const).map(([name, s]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-neutral-600">{name}</span>
                  <span className={s.pct === 100 ? 'text-emerald-300' : s.total === 0 ? 'text-neutral-400' : 'text-amber-300'}>
                    {s.withCard}/{s.total} ({s.pct}%)
                  </span>
                </div>
              ))}
              <div className="text-neutral-400 not-italic font-sans text-[10px] mt-1">100% = lu en vrai `.card`. &lt;100% = anciens objets, migrés à l&apos;ouverture de leur page.</div>
            </div>
          )}
          {/* Preuve chiffrée : ce que le feed contient vs ce que le wipe couvre. */}
          {diag && (
            <div className="rounded-xl bg-neutral-100 border border-neutral-200 px-3 py-2 text-[11px] text-neutral-600 font-mono leading-relaxed">
              <div>posts (clips) : <b className="text-neutral-800">{diag.counts.posts}</b> · direct_cards feed : <b className="text-neutral-800">{diag.counts.direct_cards_feed}</b> · boutique (gardé) : {diag.counts.direct_cards_boutique}</div>
              <div>feed affiché : {diag.feed_items} items → couverts par le wipe : <b className={diag.feed_covered_by_wipe === diag.feed_items ? 'text-emerald-300' : 'text-red-300'}>{diag.feed_covered_by_wipe}/{diag.feed_items}</b></div>
              {diag.feed_orphans.length > 0 && (
                <div className="text-red-300">⚠ {diag.feed_orphans.length} item(s) du feed introuvables dans posts NI direct_cards (2e source !) : {diag.feed_orphans.slice(0, 3).map((o) => `${o.kind}:${o.id.slice(0, 6)}`).join(', ')}</div>
              )}
              <div className="text-neutral-400 truncate">db : {diag.db_path}</div>
            </div>
          )}
          {!wipeConfirm ? (
            <button onClick={() => setWipeConfirm(true)} className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-200 font-medium">
              <Trash2 className="w-4 h-4" /> Vider le feed
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[12px] text-amber-200">⚠️ Confirmer ? Action irréversible.</p>
              <div className="flex gap-2">
                <button onClick={wipeFeed} disabled={wipeBusy} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-semibold disabled:opacity-50">
                  {wipeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Oui, vider
                </button>
                <button onClick={() => setWipeConfirm(false)} disabled={wipeBusy} className="px-4 py-2.5 rounded-xl border border-neutral-300 text-[13px] text-neutral-700">Annuler</button>
              </div>
            </div>
          )}
          {wipeMsg && <p className={'text-[12px] ' + (wipeMsg.startsWith('Erreur') ? 'text-red-300' : 'text-emerald-300')}>{wipeMsg}</p>}
        </div>
      )}

    </div>
  );
}
