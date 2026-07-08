'use client';

/**
 * Talk2Me #334 (Pascal 2026-06-04) — /friends devient le HUB conv :
 *  - Ligne 1 PINNED TOUJOURS : conv IA solo "T2M de <user>" en haut,
 *    peu importe l'activité.
 *  - Lignes suivantes : conversations P2P et GROUPES triées par last_message_at DESC.
 *  - FAB "+" en haut-droite → ajouter un ami / nouvelle conv (/friends/add).
 *  - BottomNav central + → CardCreationSheet (géré globalement).
 *
 * Doctrine [[talk2me-ia-personnelle-integree]] : l'IA solo a sa propre conv
 * (kind='agent') qui sert de "discussion avec moi-même + mon assistant".
 * Elle est PINNED pour montrer "Moi & l'IA toujours au top".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus, Sparkles, Users, X, Check, Store, Loader2, MessageCircle, ShoppingBag, UtensilsCrossed, Trash2, Phone, Contact, ArrowLeft, MoreHorizontal, Archive, VolumeX, Volume2, Mail } from '@/lib/icons';
import AddPlatMaisonSheet from '@/components/feed/AddPlatMaisonSheet';
import BoutiqueSheet from '@/components/feed/BoutiqueSheet';
import StatusBar from '@/components/status/StatusBar';

interface PeerDto {
  id: string;
  talk2me_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  presence: { last_seen: number; status: string } | null;
}

interface ConvDto {
  id: string;
  kind: 'agent' | 'p2p' | 'group';
  created_at: number;
  last_message_preview: string | null;
  last_message_at: number | null;
  unread_count: number;
  peer: PeerDto | null;
  name?: string | null;
  // Prefs PAR-USER (WhatsApp-like) — Lot 1.
  pinned?: boolean;
  archived?: boolean;
  muted?: boolean;
}

interface MeDto {
  id: string;
  display_name: string | null;
  username: string;
  ai_name: string | null;
  ai_avatar_url: string | null;
}

function formatRelative(ts: number | null): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'à l’instant';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function PeerAvatar({ peer }: { peer: PeerDto }) {
  const initial = (peer.display_name || peer.username || '?').charAt(0).toUpperCase();
  if (peer.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={peer.avatar_url}
        alt={peer.display_name || peer.username}
        className="w-12 h-12 rounded-full object-cover border border-[#E7EAF0]"
      />
    );
  }
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-medium"
      style={{
        background: 'linear-gradient(135deg, #FFB347 0%, #FF7F11 100%)',
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

function GroupAvatar() {
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white"
      style={{
        background: 'linear-gradient(135deg, #B7C0CC 0%, #8A96A6 100%)',
      }}
      aria-hidden="true"
    >
      <Users size={18} />
    </div>
  );
}

function AiAvatar({ me }: { me: MeDto }) {
  if (me.ai_avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={me.ai_avatar_url}
        alt={me.ai_name || 'Mon IA'}
        className="w-12 h-12 rounded-full object-cover border border-[#E7EAF0]"
      />
    );
  }
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-medium"
      style={{
        background:
          'radial-gradient(circle at 30% 30%, #9d86ff 0%, #7C5CFF 55%, #5b3fd6 85%)',
      }}
      aria-hidden="true"
    >
      <Sparkles className="w-4 h-4" />
    </div>
  );
}

export default function FriendsHubPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeDto | null>(null);
  const [convs, setConvs] = useState<ConvDto[]>([]);
  // Desktop : messagerie 2 colonnes. Le panneau droit affiche la conversation
  // sélectionnée (Léa '/' par défaut) via iframe. Mobile : navigation plein écran.
  const [paneUrl, setPaneUrl] = useState<string>('/');
  const openConv = (href: string) => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width:1024px)').matches) setPaneUrl(href);
    else router.push(href);
  };
  // Ouvre la conv IA (Léa) via le Hub '/'. Comme on ne passe PAS par /c/[id], le POST /read
  // n'était jamais appelé → le compteur non-lu restait bloqué. On le marque lu ici (Pascal 2026-07-08).
  const openAgent = () => {
    if (agent && agent.unread_count > 0) {
      patchConv(agent.id, { unread_count: 0 });
      fetch(`/api/conversations/${agent.id}/read`, { method: 'POST' }).catch(() => {});
    }
    openConv('/');
  };
  const [loading, setLoading] = useState(true);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showPlatMaison, setShowPlatMaison] = useState(false);
  const [platDraft, setPlatDraft] = useState<{ id: string; initial: unknown } | null>(null);
  const [openPlatKey, setOpenPlatKey] = useState<string | null>(null);
  // Messagerie entreprise (Pascal 2026-06-09) — créée d'ici, aussi vite qu'un groupe.
  const [showBizModal, setShowBizModal] = useState(false);
  const [bizName, setBizName] = useState('');
  const [bizCreating, setBizCreating] = useState(false);
  // 2 types depuis le bouton 🏪 : 'choose' → choix, 'chat' → messagerie (existant).
  const [bizType, setBizType] = useState<'choose' | 'chat' | 'shop'>('choose');
  const [bizDesc, setBizDesc] = useState('');
  const [bizCategory, setBizCategory] = useState('');
  const [bizInboxes, setBizInboxes] = useState<{ id: string; name: string; public_key: string }[]>([]);
  const [myShops, setMyShops] = useState<{ id: string; name: string; description?: string | null; kind?: string }[]>([]);
  const [confirmDelShop, setConfirmDelShop] = useState<string | null>(null);
  const [delShopBusy, setDelShopBusy] = useState(false);
  const [swipeShop, setSwipeShop] = useState<{ id: string; dx: number } | null>(null);
  const swipeStart = useRef<{ id: string; x: number; moved: boolean } | null>(null);
  const suppressShopClick = useRef(false);
  const [confirmDelConv, setConfirmDelConv] = useState<string | null>(null);
  const [delConvBusy, setDelConvBusy] = useState(false);
  const [swipeConv, setSwipeConv] = useState<{ id: string; dx: number } | null>(null);
  const convSwipeStart = useRef<{ id: string; x: number; moved: boolean } | null>(null);
  const suppressConvClick = useRef(false);
  // Actions WhatsApp-like (Épingler / Archiver / Muet) — Lot 1.
  const [menuConvId, setMenuConvId] = useState<string | null>(null);
  const [view, setView] = useState<'active' | 'archived'>('active'); // onglet Discussions / Archivés
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [allFriends, setAllFriends] = useState<PeerDto[]>([]);
  const [friendReqs, setFriendReqs] = useState<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([]);

  // Design system — mode d'affichage DISCUSSIONS (posé serveur sur <html data-d-discussions>).
  const [mode, setMode] = useState<'cards' | 'photo'>('cards');
  useEffect(() => {
    const read = () => setMode(document.documentElement.dataset.dDiscussions === 'photo' ? 'photo' : 'cards');
    read();
    window.addEventListener('t2m:theme', read);
    return () => window.removeEventListener('t2m:theme', read);
  }, []);

  const load = useCallback(async () => {
    try {
      const [meRes, convRes, friRes, bizRes, shopRes, reqRes] = await Promise.all([
        fetch('/api/auth/me', { cache: 'no-store' }),
        fetch('/api/conversations/list', { cache: 'no-store' }),
        fetch('/api/friends/list', { cache: 'no-store' }),
        fetch('/api/biz/create', { cache: 'no-store' }),
        fetch('/api/simple-shop', { cache: 'no-store' }),
        fetch('/api/friends/requests', { cache: 'no-store' }),
      ]);
      if (reqRes.ok) {
        const d = await reqRes.json();
        if (Array.isArray(d?.requests)) setFriendReqs(d.requests);
      }
      if (bizRes.ok) {
        const d = await bizRes.json();
        if (Array.isArray(d?.inboxes)) setBizInboxes(d.inboxes);
      }
      if (shopRes.ok) {
        const d = await shopRes.json();
        if (Array.isArray(d?.shops)) setMyShops(d.shops);
      }
      if (friRes.ok) {
        const d = await friRes.json();
        if (Array.isArray(d?.friends)) setAllFriends(d.friends as PeerDto[]);
      }
      if (meRes.status === 401 || convRes.status === 401) {
        router.replace('/signin');
        return;
      }
      if (meRes.ok) {
        const d = await meRes.json();
        if (d?.user) {
          setMe({
            id: d.user.id,
            display_name: d.user.display_name ?? null,
            username: d.user.username,
            ai_name: d.user.ai_name ?? null,
            ai_avatar_url: d.user.ai_avatar_url ?? null,
          });
        }
      }
      if (convRes.ok) {
        const d = await convRes.json();
        if (Array.isArray(d?.conversations)) setConvs(d.conversations);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const acceptReq = async (id: string) => {
    setFriendReqs((r) => r.filter((x) => x.id !== id));
    await fetch('/api/friends/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friend_id: id }) }).catch(() => {});
    load();
  };
  const declineReq = async (id: string) => {
    setFriendReqs((r) => r.filter((x) => x.id !== id));
    await fetch('/api/friends/decline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friend_id: id }) }).catch(() => {});
  };

  // Reprise d'un BROUILLON Plat maison depuis Mes Cards (handoff sessionStorage).
  useEffect(() => {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem('t2m_open_draft'); } catch { /* */ }
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d?.type === 'plat_maison' && d.id) {
        sessionStorage.removeItem('t2m_open_draft');
        fetch(`/api/drafts/${d.id}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((res) => { if (res?.draft) { setPlatDraft({ id: d.id, initial: res.draft.draft_data }); setShowPlatMaison(true); } })
          .catch(() => {});
      }
    } catch { /* */ }
  }, []);

  // (Plats/boutiques à 500 m désormais affichés dans la barre de stories du haut.)


  // Sort : agent first PINNED, puis P2P + groupes.
  // ÉPINGLÉES en HAUT (puis par last_message_at), ARCHIVÉES à part (masquées).
  const { agent, others, archived } = useMemo(() => {
    const agent = convs.find((c) => c.kind === 'agent') || null;
    const byRecent = (a: ConvDto, b: ConvDto) => {
      const aT = a.last_message_at ?? a.created_at;
      const bT = b.last_message_at ?? b.created_at;
      return bT - aT;
    };
    const list = convs.filter((c) => c.kind === 'p2p' || c.kind === 'group');
    const archived = list.filter((c) => c.archived).sort(byRecent);
    const others = list
      .filter((c) => !c.archived)
      .sort((a, b) => {
        // Épinglées d'abord, puis par récence.
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return byRecent(a, b);
      });
    return { agent, others, archived };
  }, [convs]);

  // Amis dispo pour le groupe = TOUS mes amis + les peers de mes conversations P2P.
  const availableFriends = useMemo(() => {
    const peers = convs.filter((c) => c.kind === 'p2p' && c.peer).map((c) => c.peer as PeerDto);
    const all = [...allFriends, ...peers];
    const seen = new Set<string>();
    return all.filter((p) => {
      if (!p || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [convs, allFriends]);

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedMemberIds.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch('/api/conversations/create-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName.trim(), member_ids: selectedMemberIds }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.conversation) {
          setShowGroupModal(false);
          setGroupName('');
          setSelectedMemberIds([]);
          router.push(`/c/${data.conversation.id}`);
        }
      }
    } finally {
      setCreating(false);
    }
  };

  const createBusiness = async () => {
    if (bizCreating) return;
    setBizCreating(true);
    try {
      const res = await fetch('/api/biz/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: bizName.trim() || 'Ma messagerie', description: bizDesc.trim(), category: bizCategory }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.inbox) {
          setShowBizModal(false);
          setBizName(''); setBizDesc(''); setBizCategory('');
          // On OUVRE la nouvelle messagerie (comme un groupe) — tout est dedans.
          router.push(`/biz/${data.inbox.id}`);
        }
      }
    } finally {
      setBizCreating(false);
    }
  };

  const closeBizModal = () => { setShowBizModal(false); setBizName(''); setBizDesc(''); setBizType('choose'); };

  const createShop = async () => {
    if (bizCreating) return;
    setBizCreating(true);
    try {
      const res = await fetch('/api/simple-shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: bizName.trim() || 'Ma boutique', description: bizDesc.trim(), category: bizCategory, kind: 'boutique' }),
      });
      const d = await res.json();
      if (d?.ok && d.shop) { setShowBizModal(false); setBizName(''); setBizDesc(''); setBizCategory(''); setBizType('choose'); router.push(`/ma-boutique/${d.shop.id}`); }
    } finally { setBizCreating(false); }
  };

  // Suppression d'une boutique / plat / resto du propriétaire (avec confirmation inline).
  const deleteShop = async (id: string) => {
    if (delShopBusy) return;
    setDelShopBusy(true);
    try {
      const res = await fetch('/api/simple-shop', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      if (res.ok) { setMyShops((prev) => prev.filter((x) => x.id !== id)); setConfirmDelShop(null); }
    } finally { setDelShopBusy(false); }
  };

  // Supprimer une conversation = la masquer de MA liste (glisser → confirmer).
  const deleteConv = async (id: string) => {
    if (delConvBusy) return;
    setDelConvBusy(true);
    try {
      const res = await fetch(`/api/conversations/${id}/hide`, { method: 'POST' });
      if (res.ok) { setConvs((prev) => prev.filter((x) => x.id !== id)); setConfirmDelConv(null); }
    } finally { setDelConvBusy(false); }
  };

  // === Actions PAR-USER (WhatsApp-like) : épingler / archiver / muet ===
  // Optimiste : on met à jour MA vue localement puis on POST la route dédiée.
  // N'affecte QUE ma liste (conversation_participants), jamais celle de l'autre.
  const patchConv = (id: string, patch: Partial<ConvDto>) =>
    setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const togglePin = async (c: ConvDto) => {
    const on = !c.pinned;
    patchConv(c.id, { pinned: on });
    setMenuConvId(null);
    await fetch(`/api/conversations/${c.id}/pin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }),
    }).catch(() => {});
  };
  const toggleArchive = async (c: ConvDto) => {
    const on = !c.archived;
    patchConv(c.id, { archived: on });
    setMenuConvId(null);
    await fetch(`/api/conversations/${c.id}/archive`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }),
    }).catch(() => {});
  };
  const toggleMute = async (c: ConvDto) => {
    const on = !c.muted;
    patchConv(c.id, { muted: on });
    setMenuConvId(null);
    await fetch(`/api/conversations/${c.id}/mute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }),
    }).catch(() => {});
  };
  // Marquer non-lu (Lot 2) — optimiste (badge orange réapparaît), puis reload
  // pour caler la vraie valeur DB. PAR-USER (n'affecte que MA vue).
  const markUnread = async (c: ConvDto) => {
    patchConv(c.id, { unread_count: Math.max(1, c.unread_count || 0) });
    setMenuConvId(null);
    await fetch(`/api/conversations/${c.id}/unread`, { method: 'POST' }).catch(() => {});
    load();
  };

  const aiDisplayName = me?.ai_name?.trim() || 'Mon IA';

  // Handlers tactiles partagés : swipe→supprimer (existant) + long-press→menu.
  const rowTouchStart = (c: ConvDto, e: React.TouchEvent) => {
    convSwipeStart.current = { id: c.id, x: e.touches[0].clientX, moved: false };
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      suppressConvClick.current = true;
      setMenuConvId(c.id);
    }, 500);
  };
  const rowTouchMove = (c: ConvDto, e: React.TouchEvent) => {
    if (convSwipeStart.current?.id !== c.id) return;
    const dx = e.touches[0].clientX - convSwipeStart.current.x;
    if (Math.abs(dx) > 6) {
      convSwipeStart.current.moved = true;
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    }
    if (dx < 0) setSwipeConv({ id: c.id, dx: Math.max(dx, -88) });
  };
  const rowTouchEnd = (c: ConvDto) => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    const open = swipeConv?.id === c.id && swipeConv.dx <= -56;
    if (convSwipeStart.current?.moved) suppressConvClick.current = true;
    setSwipeConv(null); convSwipeStart.current = null;
    if (open) setConfirmDelConv(c.id);
  };

  // Rangée de conversation (P2P ou groupe) — réutilisée liste principale + archivées.
  // === Mode PHOTO : tuile de mosaïque uniforme + jointive ===
  const VIOLET_FALLBACK = 'linear-gradient(135deg, #9d86ff 0%, #7C5CFF 55%, #5b3fd6 85%)';
  const renderPhotoTile = (opts: {
    key: string;
    testid?: string;
    title: string;
    preview: string;
    imageUrl?: string | null;
    onClick: () => void;
  }) => (
    <li key={opts.key} className="relative list-none">
      <button
        type="button"
        data-testid={opts.testid}
        onClick={opts.onClick}
        className="relative block w-full overflow-hidden text-left active:opacity-95"
        style={{ height: 186, borderRadius: 0 }}
      >
        {opts.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={opts.imageUrl} alt={opts.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: VIOLET_FALLBACK }} aria-hidden="true" />
        )}
        <div
          className="absolute inset-x-0 bottom-0 p-2.5"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0) 55%)' }}
        >
          <div className="text-white font-bold text-[14px] truncate">{opts.title}</div>
          <div
            className="mt-1.5 inline-block max-w-full truncate text-white text-[11.5px] px-2.5 py-1"
            style={{
              background: 'rgba(255,255,255,.2)',
              backdropFilter: 'blur(7px)',
              WebkitBackdropFilter: 'blur(7px)',
              border: '1px solid rgba(255,255,255,.3)',
              borderRadius: '13px 13px 13px 4px',
            }}
          >
            {opts.preview}
          </div>
        </div>
      </button>
    </li>
  );

  const renderConvTile = (c: ConvDto) => {
    const isGroup = c.kind === 'group';
    if (!isGroup && !c.peer) return null;
    const title = isGroup ? (c.name || 'Groupe') : (c.peer!.display_name || c.peer!.username);
    return renderPhotoTile({
      key: c.id,
      testid: isGroup ? `friends-hub-group-${c.id}` : `friends-hub-p2p-${c.peer!.id}`,
      title,
      preview: c.last_message_preview || 'Aucun message pour le moment',
      imageUrl: isGroup ? null : c.peer!.avatar_url,
      onClick: () => openConv(`/c/${c.id}`),
    });
  };

  const renderConvRow = (c: ConvDto) => {
    const isGroup = c.kind === 'group';
    if (!isGroup && !c.peer) return null;
    const title = isGroup ? (c.name || 'Groupe') : (c.peer!.display_name || c.peer!.username);
    return (
      <li
        key={c.id}
        className="relative"
        onTouchStart={(e) => rowTouchStart(c, e)}
        onTouchMove={(e) => rowTouchMove(c, e)}
        onTouchEnd={() => rowTouchEnd(c)}
        style={{ transform: swipeConv?.id === c.id ? `translateX(${swipeConv.dx}px)` : undefined, transition: swipeConv?.id === c.id ? 'none' : 'transform .18s ease' }}
      >
        {confirmDelConv === c.id && (
          <div className="absolute inset-0 z-10 flex items-center gap-2 px-4 bg-[#F5F6F8]">
            <span className="text-[12.5px] text-[#6A7585] flex-1 min-w-0">Supprimer cette conversation ?</span>
            <button type="button" disabled={delConvBusy} onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }} className="px-3 h-8 rounded-full bg-[#E86F00] text-[#2F343A] text-[12px] font-semibold active:scale-95 disabled:opacity-50">Supprimer</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDelConv(null); }} className="px-3 h-8 rounded-full border border-[#E7EAF0] text-[#9DAAB7] text-[12px] active:scale-95">Annuler</button>
          </div>
        )}
        <button
          type="button"
          onClick={() => { if (suppressConvClick.current) { suppressConvClick.current = false; return; } openConv(`/c/${c.id}`); }}
          data-testid={isGroup ? `friends-hub-group-${c.id}` : `friends-hub-p2p-${c.peer!.id}`}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/[0.04] active:bg-black/[0.04] transition-colors text-left"
        >
          {isGroup ? <GroupAvatar /> : (
            <div className="relative">
              <PeerAvatar peer={c.peer!} />
              {c.peer!.presence?.status === 'online' && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" aria-label="En ligne" />
              )}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {c.pinned && <span className="text-[12px] flex-shrink-0" title="Épinglée" aria-label="Épinglée">📌</span>}
              <span className="text-[14.5px] font-medium text-[#6A7585] truncate">{title}</span>
              {c.muted && <span className="text-[11px] flex-shrink-0" title="En sourdine" aria-label="En sourdine">🔕</span>}
            </div>
            <p className="text-[12.5px] text-[#9DAAB7] truncate mt-0.5">
              {c.last_message_preview || 'Aucun message pour le moment'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-[11px] text-[#9DAAB7]">{formatRelative(c.last_message_at)}</span>
            {c.unread_count > 0 && (
              <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#FF7F11] text-[#2F343A] text-[10px] font-medium flex items-center justify-center">
                {c.unread_count}
              </span>
            )}
          </div>
        </button>
        {/* Bouton « … » discret : ouvre le menu d'actions (alternative au long-press). */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuConvId(c.id); }}
          aria-label="Actions de la conversation"
          data-testid={`friends-conv-menu-${c.id}`}
          className="absolute top-1 right-1 w-7 h-7 rounded-full grid place-items-center text-[#9DAAB7] hover:text-[#2F343A] hover:bg-black/[0.05] transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>
      </li>
    );
  };

  const menuConv = menuConvId ? convs.find((c) => c.id === menuConvId) || null : null;

  return (
    <div className="flex h-[100svh] w-full bg-[#F5F6F8] lg:justify-center">
    {/* Colonne GAUCHE : liste des discussions (plein écran mobile/tablette, colonne fixe desktop).
        Le bloc (liste+conversation) est CENTRÉ → le vide est entre le menu et la liste,
        et la liste reste COLLÉE à la conversation (même logique d'écart que le feed). */}
    <div className="flex flex-col h-[100svh] w-full lg:w-[380px] lg:shrink-0 lg:border-r border-[#E7EAF0] overflow-hidden">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[#E7EAF0] bg-[#F5F6F8] px-4 backdrop-blur-xl">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => router.push('/home')}
            aria-label="Retour au feed"
            data-testid="friends-back"
            className="w-9 h-9 -ml-1 flex items-center justify-center text-[#6A7585] hover:text-[#2F343A] transition-colors shrink-0"
          >
            <ArrowLeft size={24} />
          </button>
          <span className="text-[22px] font-bold tracking-tight text-[#2F343A] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>Discussions</span>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Entreprise À GAUCHE (Pascal) + taille alignée sur le reste */}
          <button
            type="button"
            onClick={() => { setBizType('choose'); setShowBizModal(true); }}
            aria-label="Créer une présence pro (messagerie ou boutique)"
            data-testid="friends-new-business"
            className="w-11 h-11 rounded-full flex items-center justify-center text-[#E86F00] hover:text-[#2F343A] bg-[rgba(255,127,17,0.12)] border border-transparent hover:bg-[#FF7F11]/25 transition-colors"
          >
            <Store size={26} />
          </button>
          <button
            type="button"
            onClick={() => setShowGroupModal(true)}
            aria-label="Nouveau groupe"
            data-testid="friends-new-group"
            className="w-11 h-11 rounded-full flex items-center justify-center text-[#6A7585] hover:text-[#2F343A] bg-black/[0.04] border border-[#E7EAF0] hover:bg-white/[0.1] transition-colors"
          >
            <Users size={26} />
          </button>
          <Link
            href="/friends/add"
            aria-label="Ajouter un ami"
            data-testid="friends-add"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white bg-[#FF7F11] shadow-[0_8px_20px_rgba(255,127,17,0.35)] transition-transform active:scale-95"
          >
            <UserPlus size={24} />
          </Link>
        </div>
      </header>

      {/* Onglets Discussions / Archivés (Pascal 2026-07-05) — l'archive n'est plus déroulée
          dans la liste, elle a SON onglet. */}
      <div className="flex items-center gap-2 border-b border-[#E7EAF0] bg-[#F5F6F8] px-4 py-2">
        <button type="button" onClick={() => setView('active')} className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${view === 'active' ? 'bg-[#2F343A] text-white' : 'bg-black/[0.04] text-[#6A7585]'}`}>Discussions</button>
        <button type="button" onClick={() => setView('archived')} className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${view === 'archived' ? 'bg-[#2F343A] text-white' : 'bg-black/[0.04] text-[#6A7585]'}`}>Archivés{archived.length > 0 ? ` · ${archived.length}` : ''}</button>
      </div>

      <main className="flex-1 overflow-y-auto pb-24">
        <StatusBar />

        {/* Demandes d'ami reçues — à accepter ou refuser (Pascal 2026-06-16) */}
        {!loading && friendReqs.length > 0 && (
          <div className="px-4 pt-3 pb-2 border-b border-[#E7EAF0]">
            <div className="text-[13px] font-semibold text-[#6A7585] mb-2">
              Demandes d&apos;ami <span className="text-[#9DAAB7] text-[11px] font-normal">· {friendReqs.length}</span>
            </div>
            <div className="space-y-2">
              {friendReqs.map((u) => (
                <div key={u.id} className="flex items-center gap-3 bg-black/[0.04] border border-[#E7EAF0] rounded-xl px-3 py-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {u.avatar_url
                    ? <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-full shrink-0 grid place-items-center bg-black/[0.04] text-[#6A7585] text-[15px] font-bold">{(u.display_name || u.username || '?').charAt(0).toUpperCase()}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-[#2F343A] text-[14px] font-medium truncate">{u.display_name || u.username}</div>
                    <div className="text-[#9DAAB7] text-[12px] truncate">@{u.username} veut être ton ami</div>
                  </div>
                  <button type="button" onClick={() => acceptReq(u.id)} className="shrink-0 px-3 h-8 rounded-full bg-white text-black text-[12px] font-bold active:scale-95">Accepter</button>
                  <button type="button" onClick={() => declineReq(u.id)} aria-label="Refuser" className="shrink-0 w-8 h-8 rounded-full border border-[#E7EAF0] text-[#9DAAB7] grid place-items-center active:scale-95"><X size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* (Plats/boutiques à 500 m désormais dans la barre de stories du haut — Pascal 2026-06-20) */}

        {loading && (
          <div className="text-center text-[#9DAAB7] text-[13px] py-12">Chargement…</div>
        )}

        {!loading && me && (
          <ul className={mode === 'photo' ? 'grid grid-cols-2 gap-0' : 'divide-y divide-white/5'}>
            {/* === IA solo PINNED en haut (onglet Discussions seulement) === */}
            {view === 'active' && agent && mode === 'photo' && renderPhotoTile({
              key: 'agent',
              testid: 'friends-hub-agent',
              title: aiDisplayName,
              preview: agent.last_message_preview || 'Pose-moi une question 💬',
              // @agent-open: marque lu au clic (voir openAgent)
              imageUrl: me.ai_avatar_url,
              onClick: () => openAgent(),
            })}
            {view === 'active' && agent && mode === 'cards' && (
              <li>
                <button
                  type="button"
                  onClick={() => openAgent()}
                  data-testid="friends-hub-agent"
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/[0.04] active:bg-black/[0.04] transition-colors text-left"
                >
                  <AiAvatar me={me} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-medium text-[#6A7585] truncate">
                        {aiDisplayName}
                      </span>
                      <span
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[rgba(255,127,17,0.12)] border border-transparent text-[#E86F00] flex-shrink-0"
                        title="Conversation épinglée — moi et mon IA"
                      >
                        Moi & l’IA
                      </span>
                    </div>
                    <p className="text-[12.5px] text-[#9DAAB7] truncate mt-0.5">
                      {agent.last_message_preview
                        ? agent.last_message_preview
                        : 'Pose-moi une question 💬'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[11px] text-[#9DAAB7]">
                      {formatRelative(agent.last_message_at)}
                    </span>
                    {agent.unread_count > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#FF7F11] text-[#2F343A] text-[10px] font-medium flex items-center justify-center">
                        {agent.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )}

            {/* === Messageries ENTREPRISE (Pascal 2026-06-09) — onglet Discussions seulement === */}
            {view === 'active' && mode === 'photo' && bizInboxes.map((b) => renderPhotoTile({
              key: 'biz-' + b.id,
              testid: `friends-biz-${b.id}`,
              title: b.name,
              preview: 'Widget site • code & test →',
              imageUrl: null,
              onClick: () => router.push(`/biz/${b.id}`),
            }))}
            {view === 'active' && mode === 'cards' && bizInboxes.map((b) => (
              <li key={'biz-' + b.id}>
                <button
                  type="button"
                  data-testid={`friends-biz-${b.id}`}
                  onClick={() => router.push(`/biz/${b.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/[0.04] active:bg-black/[0.04] transition-colors text-left"
                >
                  <span className="w-11 h-11 rounded-full bg-[rgba(255,127,17,0.12)] border border-transparent flex items-center justify-center text-[#E86F00] flex-shrink-0">
                    <Store size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-medium text-[#6A7585] truncate">{b.name}</span>
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[rgba(255,127,17,0.12)] border border-transparent text-[#E86F00] flex-shrink-0">
                        Entreprise
                      </span>
                    </div>
                    <p className="text-[12.5px] text-[#9DAAB7] truncate mt-0.5">Widget site • code &amp; test →</p>
                  </div>
                </button>
              </li>
            ))}

            {/* === Onglet DISCUSSIONS : conversations actives (épinglées en haut) === */}
            {view === 'active' && others.length === 0 && (
              <li className={`px-6 py-10 text-center ${mode === 'photo' ? 'col-span-2' : ''}`}>
                <div className="w-14 h-14 rounded-full bg-black/[0.04] border border-[#E7EAF0] flex items-center justify-center mx-auto mb-3">
                  <UserPlus className="text-[#9DAAB7]" size={22} />
                </div>
                <div className="text-[14px] text-[#6A7585] font-medium mb-1">
                  Pas encore d&apos;amis
                </div>
                <p className="text-[12.5px] text-[#9DAAB7] leading-relaxed max-w-xs mx-auto">
                  Tape sur <span className="text-[#6A7585] font-medium">+</span>{' '}
                  en haut pour ajouter un ami via son @pseudo ou son Talk2Me ID.
                </p>
              </li>
            )}
            {view === 'active' && others.map(mode === 'photo' ? renderConvTile : renderConvRow)}

            {/* === Onglet ARCHIVÉS === */}
            {view === 'archived' && archived.length === 0 && (
              <li className={`px-6 py-12 text-center ${mode === 'photo' ? 'col-span-2' : ''}`}>
                <div className="w-14 h-14 rounded-full bg-black/[0.04] border border-[#E7EAF0] flex items-center justify-center mx-auto mb-3">
                  <Archive className="text-[#9DAAB7]" size={22} />
                </div>
                <div className="text-[14px] text-[#6A7585] font-medium mb-1">Aucune conversation archivée</div>
                <p className="text-[12.5px] text-[#9DAAB7] leading-relaxed max-w-xs mx-auto">
                  Archive une conversation depuis son menu (appui long) pour la ranger ici.
                </p>
              </li>
            )}
            {view === 'archived' && archived.map(mode === 'photo' ? renderConvTile : renderConvRow)}
          </ul>
        )}
      </main>

      {/* === Plat maison (vente entre voisins, feed Amis) === */}
      {showPlatMaison && <AddPlatMaisonSheet onClose={() => { setShowPlatMaison(false); setPlatDraft(null); }} onCreated={load} draftId={platDraft?.id} initial={platDraft?.initial as never} />}
      {openPlatKey && <BoutiqueSheet shopKey={openPlatKey} onClose={() => setOpenPlatKey(null)} />}

      {/* === Menu d'actions d'une conversation (long-press ou « … ») — Lot 1 ===
          Épingler / Archiver / Muet, PAR-USER (n'affecte que MA vue). */}
      {menuConv && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setMenuConvId(null)}
          data-testid="friends-conv-menu-sheet"
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl border-t border-[#E7EAF0] pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-2 text-[13px] font-semibold text-[#9DAAB7] truncate">
              {menuConv.kind === 'group' ? (menuConv.name || 'Groupe') : (menuConv.peer?.display_name || menuConv.peer?.username || 'Conversation')}
            </div>
            <button type="button" onClick={() => togglePin(menuConv)} data-testid="conv-action-pin" className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-black/[0.04] active:bg-black/[0.04] transition-colors">
              <span className="w-5 text-center text-[16px]" aria-hidden>📌</span>
              <span className="text-[15px] text-[#2F343A]">{menuConv.pinned ? 'Désépingler' : 'Épingler'}</span>
            </button>
            <button type="button" onClick={() => toggleArchive(menuConv)} data-testid="conv-action-archive" className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-black/[0.04] active:bg-black/[0.04] transition-colors">
              <Archive size={20} className="text-[#6A7585]" />
              <span className="text-[15px] text-[#2F343A]">{menuConv.archived ? 'Désarchiver' : 'Archiver'}</span>
            </button>
            <button type="button" onClick={() => toggleMute(menuConv)} data-testid="conv-action-mute" className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-black/[0.04] active:bg-black/[0.04] transition-colors">
              {menuConv.muted ? <Volume2 size={20} className="text-[#6A7585]" /> : <VolumeX size={20} className="text-[#6A7585]" />}
              <span className="text-[15px] text-[#2F343A]">{menuConv.muted ? 'Réactiver le son' : 'Mettre en sourdine'}</span>
            </button>
            {/* Marquer non-lu — visible seulement si la conv est actuellement LUE (Lot 2). */}
            {menuConv.unread_count === 0 && (
              <button type="button" onClick={() => markUnread(menuConv)} data-testid="conv-action-unread" className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-black/[0.04] active:bg-black/[0.04] transition-colors">
                <Mail size={20} className="text-[#6A7585]" />
                <span className="text-[15px] text-[#2F343A]">Marquer non-lu</span>
              </button>
            )}
            <button type="button" onClick={() => setMenuConvId(null)} className="w-full px-5 py-3.5 mt-1 border-t border-[#E7EAF0] text-[15px] font-medium text-[#9DAAB7] active:bg-black/[0.04] transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* === Modale création de groupe === */}
      {showGroupModal && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowGroupModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl border-t border-[#E7EAF0] max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#E7EAF0]">
              <h2 className="text-[17px] font-medium text-[#6A7585]">Nouveau groupe</h2>
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#9DAAB7] hover:text-[#2F343A] hover:bg-black/[0.04] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 border-b border-[#E7EAF0]">
              <label htmlFor="group-name" className="text-[13px] text-[#9DAAB7] mb-1.5 block">
                Nom du groupe
              </label>
              <input
                id="group-name"
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ex: Projets, Sorties…"
                className="w-full bg-black/[0.04] border border-[#E7EAF0] rounded-xl px-3.5 py-2.5 text-[14px] text-[#6A7585] placeholder-[#9DAAB7] outline-none focus:border-red-500/50 focus:bg-black/[0.04] transition-colors"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              <p className="text-[13px] text-[#9DAAB7] mb-3">
                Sélectionne des amis à ajouter ({selectedMemberIds.length} sélectionné{selectedMemberIds.length > 1 ? 's' : ''})
              </p>
              {availableFriends.length === 0 && (
                <p className="text-[13px] text-[#9DAAB7] text-center py-6">
                  Ajoute d&apos;abord des amis pour créer un groupe.
                </p>
              )}
              {availableFriends.map((friend) => {
                const checked = selectedMemberIds.includes(friend.id);
                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => toggleMember(friend.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
                      checked ? 'bg-[rgba(255,127,17,0.12)]' : 'hover:bg-black/[0.04]'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                        checked
                          ? 'bg-[#FF7F11] border-red-500'
                          : 'border-[#E7EAF0]'
                      }`}
                    >
                      {checked && <Check size={12} className="text-[#2F343A]" />}
                    </div>
                    <PeerAvatar peer={friend} />
                    <span className="text-[14px] text-[#6A7585] truncate">
                      {friend.display_name || friend.username}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-[#E7EAF0] flex gap-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#6A7585] bg-black/[0.04] border border-[#E7EAF0] hover:bg-black/[0.04] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={createGroup}
                disabled={!groupName.trim() || selectedMemberIds.length === 0 || creating}
                data-testid="group-create-submit"
                className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#2F343A] bg-[#E86F00] hover:bg-[#FF7F11] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? 'Création…' : 'Créer le groupe'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messagerie ENTREPRISE — créée d'ici, aussi vite qu'un groupe (Pascal 2026-06-09) */}
      {showBizModal && (
        <div
          className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={closeBizModal}
        >
          <div
            className="w-full max-w-md bg-[#F5F6F8] rounded-t-3xl sm:rounded-3xl border-t sm:border border-[#E7EAF0] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between border-b border-[#E7EAF0]">
              <div className="flex items-center gap-2">
                <Store size={18} className="text-[#FF7F11]" />
                <h2 className="text-[17px] font-medium text-[#6A7585]">
                  {bizType === 'choose' ? 'Créer dans tes messages' : 'Messagerie entreprise'}
                </h2>
              </div>
              <button type="button" onClick={closeBizModal} className="text-[#9DAAB7] hover:text-[#2F343A]">
                <X size={20} />
              </button>
            </div>

            {bizType === 'choose' ? (
              /* ÉTAPE 0 — choix du type (Pascal 2026-06-09) */
              <div className="px-5 py-4 space-y-2.5">
                {/* MES BOUTIQUES EXISTANTES — pour les rouvrir (Pascal : "j'ai créé une boutique je ne la vois pas") */}
                {myShops.length > 0 && (
                  <div className="space-y-1.5 pb-1">
                    <p className="text-[12px] text-[#9DAAB7] uppercase tracking-wide">Mes boutiques</p>
                    {myShops.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06]"
                        onTouchStart={(e) => { swipeStart.current = { id: s.id, x: e.touches[0].clientX, moved: false }; }}
                        onTouchMove={(e) => {
                          if (swipeStart.current?.id !== s.id) return;
                          const dx = e.touches[0].clientX - swipeStart.current.x;
                          if (Math.abs(dx) > 6) swipeStart.current.moved = true;
                          if (dx < 0) setSwipeShop({ id: s.id, dx: Math.max(dx, -88) });
                        }}
                        onTouchEnd={() => {
                          const open = swipeShop?.id === s.id && swipeShop.dx <= -56;
                          if (swipeStart.current?.moved) suppressShopClick.current = true;
                          setSwipeShop(null); swipeStart.current = null;
                          if (open) setConfirmDelShop(s.id);
                        }}
                        style={{
                          transform: swipeShop?.id === s.id ? `translateX(${swipeShop.dx}px)` : undefined,
                          transition: swipeShop?.id === s.id ? 'none' : 'transform .18s ease',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => { if (suppressShopClick.current) { suppressShopClick.current = false; return; } setShowBizModal(false); router.push(`/ma-boutique/${s.id}`); }}
                          className="flex-1 min-w-0 flex items-center gap-3 p-2.5 text-left hover:bg-emerald-500/[0.06] rounded-l-2xl active:scale-[0.99]"
                        >
                          <span className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-400/30 grid place-items-center text-emerald-200 shrink-0">{s.kind === 'plat_maison' ? <UtensilsCrossed size={18} /> : <ShoppingBag size={18} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold text-[#6A7585] truncate">{s.name}</span>
                            {s.description ? <span className="block text-[12px] text-[#9DAAB7] truncate">{s.description}</span> : <span className="block text-[12px] text-[#9DAAB7]">{s.kind === 'plat_maison' ? 'Plats maison · ouvrir' : 'Ouvrir / gérer'}</span>}
                          </span>
                        </button>
                        {confirmDelShop === s.id ? (
                          <span className="flex items-center gap-1.5 pr-2 shrink-0">
                            <button type="button" disabled={delShopBusy} onClick={() => deleteShop(s.id)} className="px-2.5 h-8 rounded-full bg-[#E86F00] text-[#2F343A] text-[12px] font-semibold active:scale-95 disabled:opacity-50">Supprimer</button>
                            <button type="button" onClick={() => setConfirmDelShop(null)} className="px-2.5 h-8 rounded-full border border-[#E7EAF0] text-[#9DAAB7] text-[12px] active:scale-95">Annuler</button>
                          </span>
                        ) : (
                          <button type="button" aria-label="Supprimer la boutique" onClick={() => setConfirmDelShop(s.id)} className="w-10 h-10 mr-1 rounded-full grid place-items-center text-[#9DAAB7] hover:text-[#FF7F11] hover:bg-[rgba(255,127,17,0.12)] shrink-0"><Trash2 size={16} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* MES MESSAGERIES EXISTANTES */}
                {bizInboxes.length > 0 && (
                  <div className="space-y-1.5 pb-1">
                    <p className="text-[12px] text-[#9DAAB7] uppercase tracking-wide">Mes messageries</p>
                    {bizInboxes.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => { setShowBizModal(false); router.push(`/biz/${b.id}`); }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-2xl border border-red-400/20 bg-[#FF7F11]/[0.06] hover:bg-[#FF7F11]/[0.12] text-left active:scale-[0.99]"
                      >
                        <span className="w-9 h-9 rounded-full bg-[rgba(255,127,17,0.12)] border border-transparent grid place-items-center text-[#E86F00] shrink-0"><MessageCircle size={18} /></span>
                        <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-[#6A7585] truncate">{b.name}</span><span className="block text-[12px] text-[#9DAAB7]">Ouvrir</span></span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[13px] text-[#9DAAB7] pt-1">{myShops.length || bizInboxes.length ? 'Ou crée du nouveau :' : 'Tu crées quoi ?'}</p>
                <button
                  type="button"
                  data-testid="biz-type-chat"
                  onClick={() => setBizType('chat')}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-[#E7EAF0] bg-black/[0.04] hover:bg-black/[0.04] text-left active:scale-[0.99]"
                >
                  <span className="w-11 h-11 rounded-full bg-[rgba(255,127,17,0.12)] border border-transparent grid place-items-center text-[#E86F00] shrink-0"><MessageCircle size={22} /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-[#6A7585]">Messagerie</span>
                    <span className="block text-[12px] text-[#9DAAB7]">Un chat à coller sur ton site → les messages arrivent ici</span>
                  </span>
                </button>
                {/* Boutique + Plat maison RAPATRIÉS dans le Composeur (bouton +, Pascal 2026-07-03).
                    Ici il ne reste que la Messagerie ; la création boutique/plat se fait via « Créer une card ». */}
              </div>
            ) : (
              <>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-[13px] text-[#9DAAB7]">
                    {bizType === 'shop'
                      ? <>Ta petite boutique : tes <b className="text-[#6A7585]">photos avec prix</b>, tu la mets dans ta <b className="text-[#6A7585]">story</b>, on te paie au Wallet. Boost = audience élargie.</>
                      : <>Un chat à coller sur ton site. Les messages des clients arrivent <b className="text-[#6A7585]">ici</b>, dans cette messagerie. Tu réponds, ou ton IA répond pour toi.</>}
                  </p>
                  <div>
                    <label className="text-[12px] text-[#9DAAB7] block mb-1.5">{bizType === 'shop' ? 'Nom de la boutique' : "Nom de l'entreprise"}</label>
                    <input
                      value={bizName}
                      onChange={(e) => setBizName(e.target.value)}
                      placeholder={bizType === 'shop' ? 'Ex : Chez Léa' : 'Ex : Genius Diagnostic'}
                      className="w-full bg-black/[0.04] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-red-400/50"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Description <span className="text-[#9DAAB7]">{bizType === 'shop' ? '(ce que tu vends)' : '(ton service)'}</span></label>
                    <textarea
                      value={bizDesc}
                      onChange={(e) => setBizDesc(e.target.value)}
                      rows={2}
                      placeholder={bizType === 'shop' ? 'Ex : Vêtements & accessoires faits main, sur commande' : 'Ex : Plombier dépannage 7j/7, devis gratuit'}
                      className="w-full bg-black/[0.04] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-red-400/50 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Catégorie <span className="text-[#9DAAB7]">(pour les Annonces)</span></label>
                      <select
                        value={bizCategory}
                        onChange={(e) => setBizCategory(e.target.value)}
                        className="w-full bg-black/[0.04] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-red-400/50"
                      >
                        <option value="" className="bg-white">Choisir…</option>
                        {['Mode', 'Beauté', 'Tech & High-tech', 'Maison & Déco', 'Alimentation', 'Bijoux & Accessoires', 'Bébé & Enfant', 'Sport & Loisirs', 'Auto & Moto', 'Services', 'Autre'].map((c) => (
                          <option key={c} value={c} className="bg-white">{c}</option>
                        ))}
                      </select>
                    </div>
                </div>
                <div className="px-5 py-4 border-t border-[#E7EAF0] flex gap-3">
                  <button type="button" onClick={() => setBizType('choose')} className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#6A7585] bg-black/[0.04] border border-[#E7EAF0] hover:bg-black/[0.04] transition-colors">
                    Retour
                  </button>
                  <button
                    type="button"
                    onClick={bizType === 'chat' ? createBusiness : createShop}
                    disabled={bizCreating}
                    data-testid="biz-create-submit"
                    className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#2F343A] bg-[#E86F00] hover:bg-[#FF7F11] disabled:opacity-40 inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {bizCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                    {bizCreating ? 'Création…' : 'Créer'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Barre du bas SPÉCIFIQUE Discussions (Pascal 2026-06-25) : pas de menu global,
          pas de bulle +, seulement Téléphone + Répertoire. */}
      <nav className="shrink-0 flex items-center justify-around h-16 border-t border-[#E7EAF0] bg-[#F5F6F8] backdrop-blur-xl px-2 pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          onClick={() => router.push('/appeler')}
          aria-label="Téléphone"
          data-testid="friends-bottom-dial"
          className="flex flex-col items-center gap-0.5 text-emerald-200 active:scale-95 transition-transform"
        >
          <Phone size={26} />
          <span className="text-[11px] font-medium leading-none">Téléphone</span>
        </button>
        <button
          type="button"
          onClick={() => router.push('/contacts')}
          aria-label="Répertoire"
          data-testid="friends-bottom-contacts"
          className="flex flex-col items-center gap-0.5 text-[#6A7585] active:scale-95 transition-transform"
        >
          <Contact size={26} />
          <span className="text-[11px] font-medium leading-none">Répertoire</span>
        </button>
      </nav>
    </div>

    {/* Panneau DROIT : conversation ouverte (desktop uniquement) — Léa par défaut.
        Chargée via iframe (la page /c/[id] ou / gère toute sa logique ; shell nu en iframe). */}
    <div className="hidden lg:block lg:w-[680px] lg:shrink-0 h-[100svh] bg-[#F5F6F8]">
      <iframe key={paneUrl} src={paneUrl} title="Conversation" className="w-full h-full border-0" />
    </div>
    </div>
  );
}
