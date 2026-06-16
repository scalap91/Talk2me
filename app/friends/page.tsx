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

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus, Sparkles, Users, X, Check, Store, Loader2, MessageCircle, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import AddPlatMaisonSheet from '@/components/feed/AddPlatMaisonSheet';
import BoutiqueSheet from '@/components/feed/BoutiqueSheet';
import BottomNav from '@/components/chat/BottomNav';
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
        className="w-12 h-12 rounded-full object-cover border border-white/10"
      />
    );
  }
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-medium border border-white/10"
      style={{
        background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)',
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
      className="w-12 h-12 rounded-full flex items-center justify-center text-white border border-white/10"
      style={{
        background: 'linear-gradient(135deg, #dc2626 0%, #dc2626 100%)',
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
        className="w-12 h-12 rounded-full object-cover border border-white/15"
      />
    );
  }
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-medium border border-white/15"
      style={{
        background:
          'radial-gradient(circle at 30% 30%, #ff8d99 0%, #ff3344 45%, #e6253a 75%, #7a1623 100%)',
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
  const [loading, setLoading] = useState(true);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showPlatMaison, setShowPlatMaison] = useState(false);
  const [platDraft, setPlatDraft] = useState<{ id: string; initial: unknown } | null>(null);
  const [nearbyPlats, setNearbyPlats] = useState<Array<{ id: string; public_key: string; name: string; cover_url: string | null; dist_m: number; items_count: number }>>([]);
  const [openPlatKey, setOpenPlatKey] = useState<string | null>(null);
  // Messagerie entreprise (Pascal 2026-06-09) — créée d'ici, aussi vite qu'un groupe.
  const [showBizModal, setShowBizModal] = useState(false);
  const [bizName, setBizName] = useState('');
  const [bizCreating, setBizCreating] = useState(false);
  // 2 types depuis le bouton 🏪 : 'choose' → choix, 'chat' → messagerie (existant).
  const [bizType, setBizType] = useState<'choose' | 'chat' | 'shop' | 'eat'>('choose');
  const [bizDesc, setBizDesc] = useState('');
  const [bizCategory, setBizCategory] = useState('');
  const [bizInboxes, setBizInboxes] = useState<{ id: string; name: string; public_key: string }[]>([]);
  const [myShops, setMyShops] = useState<{ id: string; name: string; description?: string | null }[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [allFriends, setAllFriends] = useState<PeerDto[]>([]);
  const [friendReqs, setFriendReqs] = useState<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([]);

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

  // Plats maison à proximité (500 m) : les voisins connectés les voient.
  useEffect(() => {
    if (!me || typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        fetch(`/api/plat-maison/nearby?lat=${p.coords.latitude}&lng=${p.coords.longitude}&radius=500`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => { if (d?.ok) setNearbyPlats(d.plats || []); })
          .catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }, [me]);


  // Sort : agent first PINNED, puis P2P + groupes par last_message_at DESC
  const { agent, others } = useMemo(() => {
    const agent = convs.find((c) => c.kind === 'agent') || null;
    const others = convs
      .filter((c) => c.kind === 'p2p' || c.kind === 'group')
      .sort((a, b) => {
        const aT = a.last_message_at ?? a.created_at;
        const bT = b.last_message_at ?? b.created_at;
        return bT - aT;
      });
    return { agent, others };
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
        body: JSON.stringify({ name: bizName.trim() || (bizType === 'eat' ? 'Mon resto' : 'Ma boutique'), description: bizDesc.trim(), category: bizCategory, kind: bizType === 'eat' ? 'eat' : 'boutique' }),
      });
      const d = await res.json();
      if (d?.ok && d.shop) { setShowBizModal(false); setBizName(''); setBizDesc(''); setBizCategory(''); setBizType('choose'); router.push(`/ma-boutique/${d.shop.id}`); }
    } finally { setBizCreating(false); }
  };

  const aiDisplayName = me?.ai_name?.trim() || 'Mon IA';

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#0e0e12] overflow-hidden">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/8 bg-[#0e0e12]/85 px-4 backdrop-blur-xl">
        <h1 className="text-[17px] font-medium tracking-tight text-white/95">
          Amis
        </h1>
        <div className="flex items-center gap-2.5">
          {/* Entreprise À GAUCHE (Pascal) + taille alignée sur le reste */}
          <button
            type="button"
            onClick={() => { setBizType('choose'); setShowBizModal(true); }}
            aria-label="Créer une présence pro (messagerie ou boutique)"
            data-testid="friends-new-business"
            className="w-11 h-11 rounded-full flex items-center justify-center text-red-200 hover:text-white bg-red-500/15 border border-red-400/30 hover:bg-red-500/25 transition-colors"
          >
            <Store size={26} />
          </button>
          <button
            type="button"
            onClick={() => setShowPlatMaison(true)}
            aria-label="Vendre un plat maison à mes voisins"
            data-testid="friends-plat-maison"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/85 hover:text-white bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] transition-colors"
          >
            <UtensilsCrossed size={24} />
          </button>
          <button
            type="button"
            onClick={() => setShowGroupModal(true)}
            aria-label="Nouveau groupe"
            data-testid="friends-new-group"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/85 hover:text-white bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] transition-colors"
          >
            <Users size={26} />
          </button>
          <Link
            href="/friends/add"
            aria-label="Ajouter un ami"
            data-testid="friends-add"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/85 hover:text-white bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] transition-colors"
          >
            <UserPlus size={26} />
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <StatusBar />

        {/* Demandes d'ami reçues — à accepter ou refuser (Pascal 2026-06-16) */}
        {!loading && friendReqs.length > 0 && (
          <div className="px-4 pt-3 pb-2 border-b border-white/10">
            <div className="text-[13px] font-semibold text-white/90 mb-2">
              Demandes d&apos;ami <span className="text-white/40 text-[11px] font-normal">· {friendReqs.length}</span>
            </div>
            <div className="space-y-2">
              {friendReqs.map((u) => (
                <div key={u.id} className="flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {u.avatar_url
                    ? <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-full shrink-0 grid place-items-center bg-white/10 text-white/80 text-[15px] font-bold">{(u.display_name || u.username || '?').charAt(0).toUpperCase()}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[14px] font-medium truncate">{u.display_name || u.username}</div>
                    <div className="text-white/45 text-[12px] truncate">@{u.username} veut être ton ami</div>
                  </div>
                  <button type="button" onClick={() => acceptReq(u.id)} className="shrink-0 px-3 h-8 rounded-full bg-white text-black text-[12px] font-bold active:scale-95">Accepter</button>
                  <button type="button" onClick={() => declineReq(u.id)} aria-label="Refuser" className="shrink-0 w-8 h-8 rounded-full border border-white/15 text-white/60 grid place-items-center active:scale-95"><X size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plats maison près de toi (voisins à 500 m) */}
        {!loading && nearbyPlats.length > 0 && (
          <div className="px-4 pt-3 pb-2 border-b border-white/5">
            <div className="text-[13px] font-semibold text-white/90 mb-2">Plats maison près de toi <span className="text-white/40 text-[11px] font-normal">· 500 m</span></div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
              {nearbyPlats.map((p) => (
                <button key={p.id} type="button" onClick={() => setOpenPlatKey(p.public_key)} className="shrink-0 w-32 text-left active:scale-[0.98]">
                  <div className="w-32 h-32 rounded-2xl overflow-hidden bg-white/[0.05] border border-white/10 grid place-items-center">
                    {p.cover_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.cover_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-white/30 text-[11px]">Plat maison</span>}
                  </div>
                  <div className="text-[12.5px] text-white/90 font-medium truncate mt-1">{p.name}</div>
                  <div className="text-[11px] text-white/45">{p.dist_m} m · {p.items_count} plat{p.items_count > 1 ? 's' : ''}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center text-white/55 text-[13px] py-12">Chargement…</div>
        )}

        {!loading && me && (
          <ul className="divide-y divide-white/5">
            {/* === IA solo PINNED en haut === */}
            {agent && (
              <li>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  data-testid="friends-hub-agent"
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
                >
                  <AiAvatar me={me} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-medium text-white/95 truncate">
                        {aiDisplayName}
                      </span>
                      <span
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-400/30 text-red-200 flex-shrink-0"
                        title="Conversation épinglée — moi et mon IA"
                      >
                        Moi & l’IA
                      </span>
                    </div>
                    <p className="text-[12.5px] text-white/55 truncate mt-0.5">
                      {agent.last_message_preview
                        ? agent.last_message_preview
                        : 'Pose-moi une question 💬'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[11px] text-white/40">
                      {formatRelative(agent.last_message_at)}
                    </span>
                    {agent.unread_count > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center">
                        {agent.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )}

            {/* === Messageries ENTREPRISE (Pascal 2026-06-09) === */}
            {bizInboxes.map((b) => (
              <li key={'biz-' + b.id}>
                <button
                  type="button"
                  data-testid={`friends-biz-${b.id}`}
                  onClick={() => router.push(`/biz/${b.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
                >
                  <span className="w-11 h-11 rounded-full bg-red-500/15 border border-red-400/30 flex items-center justify-center text-red-200 flex-shrink-0">
                    <Store size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-medium text-white/95 truncate">{b.name}</span>
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-400/30 text-red-200 flex-shrink-0">
                        Entreprise
                      </span>
                    </div>
                    <p className="text-[12.5px] text-white/55 truncate mt-0.5">Widget site • code &amp; test →</p>
                  </div>
                </button>
              </li>
            ))}

            {/* === P2P + Groupes triés DESC === */}
            {others.length === 0 && (
              <li className="px-6 py-10 text-center">
                <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/8 flex items-center justify-center mx-auto mb-3">
                  <UserPlus className="text-white/45" size={22} />
                </div>
                <div className="text-[14px] text-white/85 font-medium mb-1">
                  Pas encore d&apos;amis
                </div>
                <p className="text-[12.5px] text-white/55 leading-relaxed max-w-xs mx-auto">
                  Tape sur <span className="text-white/85 font-medium">+</span>{' '}
                  en haut pour ajouter un ami via son @pseudo ou son Talk2Me ID.
                </p>
              </li>
            )}

            {others.map((c) => {
              if (c.kind === 'group') {
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/c/${c.id}`)}
                      data-testid={`friends-hub-group-${c.id}`}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
                    >
                      <GroupAvatar />
                      <div className="flex-1 min-w-0">
                        <span className="text-[14.5px] font-medium text-white/95 truncate block">
                          {c.name || 'Groupe'}
                        </span>
                        <p className="text-[12.5px] text-white/55 truncate mt-0.5">
                          {c.last_message_preview || 'Aucun message pour le moment'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-[11px] text-white/40">
                          {formatRelative(c.last_message_at)}
                        </span>
                        {c.unread_count > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              }

              if (!c.peer) return null;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/c/${c.id}`)}
                    data-testid={`friends-hub-p2p-${c.peer.id}`}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
                  >
                    <div className="relative">
                      <PeerAvatar peer={c.peer} />
                      {c.peer.presence?.status === 'online' && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0e0e12]"
                          aria-label="En ligne"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14.5px] font-medium text-white/95 truncate block">
                        {c.peer.display_name || c.peer.username}
                      </span>
                      <p className="text-[12.5px] text-white/55 truncate mt-0.5">
                        {c.last_message_preview || 'Aucun message pour le moment'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[11px] text-white/40">
                        {formatRelative(c.last_message_at)}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* === Plat maison (vente entre voisins, feed Amis) === */}
      {showPlatMaison && <AddPlatMaisonSheet onClose={() => { setShowPlatMaison(false); setPlatDraft(null); }} onCreated={load} draftId={platDraft?.id} initial={platDraft?.initial as never} />}
      {openPlatKey && <BoutiqueSheet shopKey={openPlatKey} onClose={() => setOpenPlatKey(null)} />}

      {/* === Modale création de groupe === */}
      {showGroupModal && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowGroupModal(false)}
        >
          <div
            className="w-full max-w-md bg-[#15151c] rounded-t-2xl shadow-2xl border-t border-white/10 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8">
              <h2 className="text-[17px] font-medium text-white/95">Nouveau groupe</h2>
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 border-b border-white/8">
              <label htmlFor="group-name" className="text-[13px] text-white/60 mb-1.5 block">
                Nom du groupe
              </label>
              <input
                id="group-name"
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ex: Projets, Sorties…"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-[14px] text-white/95 placeholder-white/40 outline-none focus:border-red-500/50 focus:bg-white/[0.07] transition-colors"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              <p className="text-[13px] text-white/60 mb-3">
                Sélectionne des amis à ajouter ({selectedMemberIds.length} sélectionné{selectedMemberIds.length > 1 ? 's' : ''})
              </p>
              {availableFriends.length === 0 && (
                <p className="text-[13px] text-white/40 text-center py-6">
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
                      checked ? 'bg-red-500/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                        checked
                          ? 'bg-red-500 border-red-500'
                          : 'border-white/20'
                      }`}
                    >
                      {checked && <Check size={12} className="text-white" />}
                    </div>
                    <PeerAvatar peer={friend} />
                    <span className="text-[14px] text-white/90 truncate">
                      {friend.display_name || friend.username}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-white/8 flex gap-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-white/70 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={createGroup}
                disabled={!groupName.trim() || selectedMemberIds.length === 0 || creating}
                data-testid="group-create-submit"
                className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            className="w-full max-w-md bg-[#0e0e12] rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/8">
              <div className="flex items-center gap-2">
                <Store size={18} className="text-red-300" />
                <h2 className="text-[17px] font-medium text-white/95">
                  {bizType === 'choose' ? 'Créer dans tes messages' : 'Messagerie entreprise'}
                </h2>
              </div>
              <button type="button" onClick={closeBizModal} className="text-white/50 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {bizType === 'choose' ? (
              /* ÉTAPE 0 — choix du type (Pascal 2026-06-09) */
              <div className="px-5 py-4 space-y-2.5">
                {/* MES BOUTIQUES EXISTANTES — pour les rouvrir (Pascal : "j'ai créé une boutique je ne la vois pas") */}
                {myShops.length > 0 && (
                  <div className="space-y-1.5 pb-1">
                    <p className="text-[12px] text-white/45 uppercase tracking-wide">Mes boutiques</p>
                    {myShops.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setShowBizModal(false); router.push(`/ma-boutique/${s.id}`); }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] text-left active:scale-[0.99]"
                      >
                        <span className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-400/30 grid place-items-center text-emerald-200 shrink-0"><ShoppingBag size={18} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-semibold text-white/95 truncate">{s.name}</span>
                          {s.description ? <span className="block text-[12px] text-white/50 truncate">{s.description}</span> : <span className="block text-[12px] text-white/40">Ouvrir / gérer</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {/* MES MESSAGERIES EXISTANTES */}
                {bizInboxes.length > 0 && (
                  <div className="space-y-1.5 pb-1">
                    <p className="text-[12px] text-white/45 uppercase tracking-wide">Mes messageries</p>
                    {bizInboxes.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => { setShowBizModal(false); router.push(`/biz/${b.id}`); }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-2xl border border-red-400/20 bg-red-500/[0.06] hover:bg-red-500/[0.12] text-left active:scale-[0.99]"
                      >
                        <span className="w-9 h-9 rounded-full bg-red-500/15 border border-red-400/30 grid place-items-center text-red-200 shrink-0"><MessageCircle size={18} /></span>
                        <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-white/95 truncate">{b.name}</span><span className="block text-[12px] text-white/40">Ouvrir</span></span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[13px] text-white/55 pt-1">{myShops.length || bizInboxes.length ? 'Ou crée du nouveau :' : 'Tu crées quoi ?'}</p>
                <button
                  type="button"
                  data-testid="biz-type-chat"
                  onClick={() => setBizType('chat')}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-left active:scale-[0.99]"
                >
                  <span className="w-11 h-11 rounded-full bg-red-500/15 border border-red-400/30 grid place-items-center text-red-200 shrink-0"><MessageCircle size={22} /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-white/95">Messagerie</span>
                    <span className="block text-[12px] text-white/55">Un chat à coller sur ton site → les messages arrivent ici</span>
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="biz-type-shop"
                  onClick={() => setBizType('shop')}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-left active:scale-[0.99]"
                >
                  <span className="w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-400/30 grid place-items-center text-emerald-200 shrink-0"><ShoppingBag size={22} /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-white/95">Boutique</span>
                    <span className="block text-[12px] text-white/55">Un catalogue façon WhatsApp — tes produits, commande via le chat</span>
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="biz-type-eat"
                  onClick={() => setBizType('eat')}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-left active:scale-[0.99]"
                >
                  <span className="w-11 h-11 rounded-full bg-amber-500/15 border border-amber-400/30 grid place-items-center text-amber-200 shrink-0 text-[20px]">🍔</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-white/95">Restaurant</span>
                    <span className="block text-[12px] text-white/55">Façon Uber Eats — ta carte, commande + panier + livraison dans le chat</span>
                  </span>
                </button>
              </div>
            ) : (
              <>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-[13px] text-white/55">
                    {bizType === 'eat'
                      ? <>Ton resto façon <b className="text-white/80">Uber Eats</b> : ta carte (plats + prix), le client <b className="text-white/80">commande dans le chat</b> (panier + Wallet), livraison par scooter.</>
                      : bizType === 'shop'
                      ? <>Ta petite boutique : tes <b className="text-white/80">photos avec prix</b>, tu la mets dans ta <b className="text-white/80">story</b>, on te paie au Wallet. Boost = audience élargie.</>
                      : <>Un chat à coller sur ton site. Les messages des clients arrivent <b className="text-white/80">ici</b>, dans cette messagerie. Tu réponds, ou ton IA répond pour toi.</>}
                  </p>
                  <div>
                    <label className="text-[12px] text-white/50 block mb-1.5">{bizType === 'eat' ? 'Nom du resto' : bizType === 'shop' ? 'Nom de la boutique' : "Nom de l'entreprise"}</label>
                    <input
                      value={bizName}
                      onChange={(e) => setBizName(e.target.value)}
                      placeholder={bizType === 'eat' ? 'Ex : Chez Mama' : bizType === 'shop' ? 'Ex : Chez Léa' : 'Ex : Genius Diagnostic'}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-red-400/50"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] text-white/50 block mb-1.5">Description <span className="text-white/30">{bizType === 'eat' ? '(ta cuisine)' : bizType === 'shop' ? '(ce que tu vends)' : '(ton service)'}</span></label>
                    <textarea
                      value={bizDesc}
                      onChange={(e) => setBizDesc(e.target.value)}
                      rows={2}
                      placeholder={bizType === 'eat' ? 'Ex : Cuisine maison, burgers & tacos, livraison rapide' : bizType === 'shop' ? 'Ex : Vêtements & accessoires faits main, sur commande' : 'Ex : Plombier dépannage 7j/7, devis gratuit'}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-red-400/50 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] text-white/50 block mb-1.5">Catégorie <span className="text-white/30">(pour les Annonces)</span></label>
                      <select
                        value={bizCategory}
                        onChange={(e) => setBizCategory(e.target.value)}
                        className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-red-400/50"
                      >
                        <option value="" className="bg-[#1a1a22]">Choisir…</option>
                        {['Mode', 'Beauté', 'Tech & High-tech', 'Maison & Déco', 'Alimentation', 'Bijoux & Accessoires', 'Bébé & Enfant', 'Sport & Loisirs', 'Auto & Moto', 'Services', 'Autre'].map((c) => (
                          <option key={c} value={c} className="bg-[#1a1a22]">{c}</option>
                        ))}
                      </select>
                    </div>
                </div>
                <div className="px-5 py-4 border-t border-white/8 flex gap-3">
                  <button type="button" onClick={() => setBizType('choose')} className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-white/70 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                    Retour
                  </button>
                  <button
                    type="button"
                    onClick={bizType === 'chat' ? createBusiness : createShop}
                    disabled={bizCreating}
                    data-testid="biz-create-submit"
                    className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 inline-flex items-center justify-center gap-1.5 transition-colors"
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

      <BottomNav />
    </div>
  );
}
