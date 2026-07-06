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
import { Shield, Loader2, UserPlus, Check, ClipboardCheck, ShoppingBag, Boxes, ShieldCheck, Banknote, Trash2 } from '@/lib/icons';

interface Collab { user_id: string; username: string; display_name: string | null; permissions: string[] }
interface ContribRow { user_id: string; username: string; display_name: string | null; level_rank: number; level_name: string; expected: string[]; rights_open: boolean }

export default function AdminSection() {
  const router = useRouter();
  const [capable, setCapable] = useState(false);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [myPerms, setMyPerms] = useState<string[]>([]);
  const [adminMode, setAdminMode] = useState(false);
  const [available, setAvailable] = useState<{ key: string; label: string }[]>([]);
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [handle, setHandle] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [shopSections, setShopSections] = useState<Record<'eat' | 'annonces' | 'boutique', boolean>>({ eat: true, annonces: true, boutique: true });
  const [features, setFeatures] = useState<Record<'piece3d' | 'unified_feed', boolean>>({ piece3d: false, unified_feed: false });
  const [contribs, setContribs] = useState<ContribRow[]>([]);
  const [contribBusy, setContribBusy] = useState('');
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
      if (u.is_admin) { loadPerms(); loadShop(); loadContribs(); loadFeatures(); loadDiag(); loadChan(); }
    }).catch(() => {});
  }, []);

  const loadContribs = () => fetch('/api/admin/contributors', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.ok) setContribs(d.contributors || []); }).catch(() => {});
  const setRights = async (userId: string, action: 'open' | 'close') => {
    setContribBusy(userId);
    try {
      await fetch('/api/admin/contributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, action }) });
      await loadContribs();
    } finally { setContribBusy(''); }
  };

  const loadPerms = () => fetch('/api/admin/permissions', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.ok) { setAvailable(d.available || []); setCollabs(d.collaborators || []); } }).catch(() => {});
  const loadShop = () => fetch('/api/admin/shop-toggle', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.sections) setShopSections(d.sections); }).catch(() => {});
  const toggleSection = async (section: 'eat' | 'annonces' | 'boutique') => {
    const next = !shopSections[section];
    setShopSections((s) => ({ ...s, [section]: next }));
    try {
      const r = await fetch('/api/admin/shop-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, enabled: next }) }).then((x) => x.json());
      if (r?.sections) setShopSections(r.sections);
    } catch { setShopSections((s) => ({ ...s, [section]: !next })); }
  };

  const loadFeatures = () => fetch('/api/admin/feature-toggle', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.features) setFeatures(d.features); }).catch(() => {});
  const toggleFeature = async (feature: 'piece3d' | 'unified_feed') => {
    const next = !features[feature];
    setFeatures((s) => ({ ...s, [feature]: next }));
    try {
      const r = await fetch('/api/admin/feature-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature, enabled: next }) }).then((x) => x.json());
      if (r?.features) setFeatures(r.features);
    } catch { setFeatures((s) => ({ ...s, [feature]: !next })); }
  };

  const toggleMode = () => setAdminMode((v) => { const n = !v; try { localStorage.setItem('t2m_admin_mode', n ? '1' : '0'); } catch { /* */ } return n; });

  const grant = async () => {
    const perms = Object.keys(picked).filter((k) => picked[k]);
    if (!handle.trim() || perms.length === 0 || busy) return;
    setBusy(true); setMsg('');
    try {
      for (const p of perms) {
        const r = await fetch('/api/admin/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, permission: p, grant: true }) }).then((x) => x.json());
        if (r?.error === 'user_not_found') { setMsg('Utilisateur introuvable.'); setBusy(false); return; }
      }
      setMsg('Droits accordés ✓'); setHandle(''); setPicked({}); await loadPerms();
    } finally { setBusy(false); }
  };

  const revoke = async (userId: string, perm: string, username: string) => {
    await fetch('/api/admin/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: username, permission: perm, grant: false }) }).catch(() => {});
    await loadPerms();
  };

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
          <span className={'absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ' + (adminMode ? 'left-[1.6rem]' : 'left-0.5')} />
        </button>
      </div>

      {/* Boussole technique — accessible depuis l'Espace admin. Navigation DURE
          (<a> full reload) pour éviter que la route attrape-tout app/[slug]
          n'intercepte /schema en SPA et affiche un 404. Pascal 2026-06-29. */}
      <a href="/schema" className="w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-800">
        <span aria-hidden>🧭</span> Boussole technique (plan des modules)
      </a>

      {/* Validateur/admin : accès à la file de validation */}
      {myPerms.includes('curation_validateur') && (
        <button onClick={() => router.push('/admin/validation')} className="w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-800">
          <ClipboardCheck className="w-4 h-4 text-amber-300" /> File de validation (fiches à valider)
        </button>
      )}

      {/* Super-admin : switch des sous-sections du Shop (l'icône Shop reste toujours) */}
      {superAdmin && (
        <div className="pt-3 border-t border-neutral-200 space-y-2.5">
          <div className="text-[13px] text-neutral-800 font-medium flex items-center gap-1.5"><ShoppingBag size={14} className="text-amber-300" /> Sections du Shop</div>
          <p className="text-[11px] text-neutral-400 -mt-1">L'icône Shop reste ; tu actives/masques chaque sous-partie.</p>
          {([
            { key: 'eat' as const, label: 'Eat (restos / plats)' },
            { key: 'annonces' as const, label: 'Petites annonces' },
            { key: 'boutique' as const, label: 'Boutiques' },
          ]).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-[13px] text-neutral-800">{label}</span>
              <button onClick={() => toggleSection(key)} aria-label={'Activer/désactiver ' + label} className={'w-12 h-7 rounded-full transition-colors relative ' + (shopSections[key] ? 'bg-amber-500' : 'bg-neutral-300')}>
                <span className={'absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ' + (shopSections[key] ? 'left-[1.6rem]' : 'left-0.5')} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Super-admin : fonctionnalités premium ON/OFF (parquées pour Mada, allumables pour l'international) */}
      {superAdmin && (
        <div className="pt-3 border-t border-neutral-200 space-y-2.5">
          <div className="text-[13px] text-neutral-800 font-medium flex items-center gap-1.5"><Boxes size={14} className="text-amber-300" /> Fonctionnalités premium</div>
          <p className="text-[11px] text-neutral-400 -mt-1">Capacités lourdes/avant-gardistes. Éteintes pour Mada (perf), à allumer pour l'international.</p>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-[13px] text-neutral-800">Pièces 3D</span>
              <p className="text-[11px] text-neutral-400">Espaces 3D immersifs (avatar, monde, pièce). GPU.</p>
            </div>
            <button onClick={() => toggleFeature('piece3d')} aria-label="Activer/désactiver les pièces 3D" className={'shrink-0 w-12 h-7 rounded-full transition-colors relative ' + (features.piece3d ? 'bg-amber-500' : 'bg-neutral-300')}>
              <span className={'absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ' + (features.piece3d ? 'left-[1.6rem]' : 'left-0.5')} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-[13px] text-neutral-800">Feed unifié (test)</span>
              <p className="text-[11px] text-neutral-400">Lit le fil depuis la table unique unified_posts (LOT 2). Tester avant de garder.</p>
            </div>
            <button onClick={() => toggleFeature('unified_feed')} aria-label="Activer/désactiver le feed unifié" className={'shrink-0 w-12 h-7 rounded-full transition-colors relative ' + (features.unified_feed ? 'bg-amber-500' : 'bg-neutral-300')}>
              <span className={'absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ' + (features.unified_feed ? 'left-[1.6rem]' : 'left-0.5')} />
            </button>
          </div>
        </div>
      )}

      {/* Super-admin : file de vérification CNI des porteurs (programme Drive) */}
      {superAdmin && (
        <button onClick={() => router.push('/admin/cni')} className="w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-800">
          <ShieldCheck className="w-4 h-4 text-amber-300" /> Vérification CNI (porteurs Drive)
        </button>
      )}

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

      {/* Super-admin : PONT contributeurs ↔ droits (échelon auto → admin ouvre les droits) */}
      {superAdmin && (
        <div className="pt-3 border-t border-neutral-200 space-y-2">
          <div className="text-[13px] text-neutral-800 font-medium">Contributeurs (échelon automatique)</div>
          <p className="text-[11px] text-neutral-400 -mt-1">L'échelon se gagne au mérite. Tu ouvres les droits du rang en 1 clic.</p>
          {contribs.length === 0 ? (
            <p className="text-[12px] text-neutral-400 py-2">Aucun contributeur pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {contribs.map((c) => (
                <div key={c.user_id} className="rounded-xl bg-neutral-100 border border-neutral-200 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] text-neutral-800 truncate">{c.display_name || '@' + c.username}</div>
                      <div className="text-[11px] text-amber-200/80">🏅 {c.level_name}</div>
                    </div>
                    {c.expected.length === 0 ? (
                      <span className="text-[11px] text-neutral-400 shrink-0">aucun droit à ouvrir</span>
                    ) : c.rights_open ? (
                      <button onClick={() => setRights(c.user_id, 'close')} disabled={contribBusy === c.user_id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 shrink-0 disabled:opacity-50 inline-flex items-center gap-1.5">
                        {contribBusy === c.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Droits ouverts
                      </button>
                    ) : (
                      <button onClick={() => setRights(c.user_id, 'open')} disabled={contribBusy === c.user_id} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-500 text-black font-semibold shrink-0 disabled:opacity-50 inline-flex items-center gap-1.5">
                        {contribBusy === c.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Ouvrir les droits du rang
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Super-admin : donner des droits (manuel, granulaire) */}
      {superAdmin && (
        <div className="pt-3 border-t border-neutral-200 space-y-3">
          <div className="text-[13px] text-neutral-800 font-medium">Donner des droits à un collaborateur</div>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@pseudo ou ID" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-2.5 text-[14px] text-neutral-800 outline-none focus:border-amber-400/50" />
          <div className="space-y-1.5">
            {available.map((p) => (
              <button key={p.key} onClick={() => setPicked((s) => ({ ...s, [p.key]: !s[p.key] }))} className="w-full flex items-center gap-2 text-left">
                <span className={'w-5 h-5 rounded-md border grid place-items-center ' + (picked[p.key] ? 'bg-amber-500 border-amber-500' : 'border-neutral-300')}>{picked[p.key] && <Check className="w-3.5 h-3.5 text-black" />}</span>
                <span className="text-[13px] text-neutral-800">{p.label}</span>
              </button>
            ))}
          </div>
          <button onClick={grant} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-black text-[13px] font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Accorder
          </button>
          {msg && <p className="text-[12px] text-amber-200">{msg}</p>}

          {collabs.length > 0 && (
            <div className="pt-2 space-y-2">
              <div className="text-[12px] text-neutral-500">Collaborateurs</div>
              {collabs.map((c) => (
                <div key={c.user_id} className="rounded-xl bg-neutral-100 border border-neutral-200 px-3 py-2">
                  <div className="text-[13px] text-neutral-800">@{c.username}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {c.permissions.map((p) => (
                      <button key={p} onClick={() => revoke(c.user_id, p, c.username)} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/25">{available.find((a) => a.key === p)?.label || p} ✕</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
