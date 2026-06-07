'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import CallModal, {
  type CallKind,
  type CallMode,
  type CallSignalEvent,
  type IncomingOffer,
} from '@/components/call/CallModal';
import ActivityPicker from '@/components/activity/ActivityPicker';
import ActivityVideoSync from '@/components/activity/ActivityVideoSync';
import WatchInviteBanner from '@/components/activity/WatchInviteBanner';
// Talk2Me #419 (Pascal 2026-06-05) — GameBoardModal remplacé par InlineGameDock
// (jeu inline sticky bottom au lieu de modal plein écran). Voir
// components/games/InlineGameDock.tsx pour la motivation produit.
import InlineGameDock from '@/components/games/InlineGameDock';
import GameInviteCard from '@/components/games/GameInviteCard';
import type { ChessGame, DameGame } from '@/lib/games/types';
import type { Activity, VideoSyncState } from '@/lib/activity-types';
import { isVideoActivity } from '@/lib/activity-types';
import ConversationView from '@/components/conversation/ConversationView';
import type {
  ConversationPeer,
  UnifiedMessage,
} from '@/components/conversation/types';
import {
  useConversationRealtime,
  type RealtimeMessage,
  type WatchSyncEvent,
} from '@/lib/use-conversation-realtime';
// Talk2Me #386 (Pascal 2026-06-05) — Mapping bulle T2M Officiel.
// T2M Officiel est un agent INSTITUTIONNEL (jamais "mon" IA personnelle).
// Doit TOUJOURS apparaître en bulle peer (gauche, neutre), même si l'user
// est lui-même connecté avec le compte T2M Officiel pour debug.
import { T2M_OFFICIEL_USER_ID } from '@/lib/ai/officiel/constants';

interface ConvDto {
  id: string;
  kind: 'agent' | 'p2p' | 'group';
  peer: {
    id: string;
    talk2me_id: string;
    username: string;
    display_name: string | null;
    avatar_url?: string | null;
    presence: { last_seen: number; status: string } | null;
  } | null;
}

interface MeDto {
  id: string;
  username: string;
  display_name?: string | null;
  ai_name?: string | null;
  ai_avatar_url?: string | null;
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function formatLastSeen(ts: number | null | undefined): string {
  if (!ts) return 'hors ligne';
  const diff = Date.now() - ts;
  if (diff < ONLINE_WINDOW_MS) return 'en ligne';
  if (diff < 3600_000) return `vu il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86400_000) return `vu il y a ${Math.floor(diff / 3600_000)} h`;
  return `vu il y a ${Math.floor(diff / 86400_000)} j`;
}

export default function ConversationPage() {
  const params = useParams<{ conv_id: string }>();
  const router = useRouter();
  const convId = params?.conv_id;
  const [conv, setConv] = useState<ConvDto | null>(null);
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [me, setMe] = useState<MeDto | null>(null);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [peerOnlineTs, setPeerOnlineTs] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<RealtimeMessage | null>(null);

  const [callState, setCallState] = useState<
    | { kind: CallKind; mode: CallMode; incomingOffer?: IncomingOffer }
    | null
  >(null);
  const [activity, setActivity] = useState<Activity<unknown> | null>(null);
  const [activityRemoteState, setActivityRemoteState] =
    useState<VideoSyncState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Talk2Me #408 — Watch Together (Pascal 2026-06-05)
  // Banner reçue par le PEER (= activité 'pending' où started_by !== meId).
  // syncEvent : event watch_sync à appliquer dans le player follower.
  const [pendingInvite, setPendingInvite] = useState<Activity<unknown> | null>(null);
  const [syncEvent, setSyncEvent] = useState<WatchSyncEvent | null>(null);
  // Talk2Me #408 — Jeux interactifs (chess + dames)
  // Quand une partie est ouverte, ces refs stockent {kind, id} pour render le board.
  const [activeGame, setActiveGame] = useState<
    | { kind: 'chess' | 'dame'; id: string }
    | null
  >(null);
  // Tick incrémenté à chaque event 'game_move' SSE pour reload board state
  const [gameRefreshTick, setGameRefreshTick] = useState(0);
  // Talk2Me #416 (Pascal 2026-06-05) — invite card si partie existante détectée
  const [gameInvite, setGameInvite] = useState<
    | {
        game: ChessGame | DameGame;
        gameKind: 'chess' | 'dame';
        mode: 'solo' | 'arbiter';
      }
    | null
  >(null);
  const [startingGame, setStartingGame] = useState(false);

  const callListenersRef = useRef<Set<(evt: CallSignalEvent) => void>>(new Set());
  const callSignal = useMemo(
    () => ({
      subscribe(handler: (evt: CallSignalEvent) => void) {
        callListenersRef.current.add(handler);
        return () => {
          callListenersRef.current.delete(handler);
        };
      },
    }),
    []
  );

  useEffect(() => {
    if (conv?.kind === 'agent') router.replace('/');
  }, [conv?.kind, router]);

  const loadConv = useCallback(async () => {
    if (!convId) return;
    try {
      const [convRes, meRes] = await Promise.all([
        fetch(`/api/conversations/${convId}`, { cache: 'no-store' }),
        fetch('/api/auth/me', { cache: 'no-store' }),
      ]);
      if (convRes.status === 401 || meRes.status === 401) {
        router.replace('/signin');
        return;
      }
      if (!convRes.ok) {
        setLoadError(convRes.status === 404 ? 'Conversation introuvable.' : 'Erreur de chargement');
        return;
      }
      const data = await convRes.json();
      setConv(data.conversation);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.conversation?.peer?.presence?.last_seen) {
        setPeerOnlineTs(data.conversation.peer.presence.last_seen);
      }
      const meData = await meRes.json();
      if (meData?.user) {
        setMe({
          id: meData.user.id,
          username: meData.user.username,
          display_name: meData.user.display_name,
          ai_name: meData.user.ai_name,
          ai_avatar_url: meData.user.ai_avatar_url,
        });
      }
    } catch (e) {
      console.error('[conv] load', e);
      setLoadError('Erreur réseau');
    }
  }, [convId, router]);

  useEffect(() => {
    loadConv();
  }, [loadConv]);

  // Pré-fetch activité courante
  useEffect(() => {
    if (!convId || conv?.kind !== 'p2p') return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/activities/active?conv_id=${encodeURIComponent(convId)}`, {
          cache: 'no-store',
        });
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        if (d?.activity) {
          setActivity(d.activity as Activity<unknown>);
          if (d.activity.kind === 'video' && d.activity.state) {
            setActivityRemoteState(d.activity.state as VideoSyncState);
          }
        }
      } catch {
        // silencieux
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [convId, conv?.kind]);

  // SSE realtime via hook dédié
  useConversationRealtime({
    convId,
    enabled: conv?.kind === 'p2p',
    meId: me?.id,
    callActive: !!callState,
    onChatMessage: (m) => {
      let added = false;
      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        added = true;
        return [...prev, m];
      });
      if (added && m.sender_id && m.sender_id !== me?.id && convId) {
        fetch(`/api/conversations/${convId}/read`, { method: 'POST' }).catch(() => {});
      }
    },
    onCallOffer: ({ kind, mode, incomingOffer }) =>
      setCallState({ kind, mode, incomingOffer }),
    onCallSignal: (evt) => {
      callListenersRef.current.forEach((h) => {
        try {
          h(evt);
        } catch (e) {
          console.error('[call] listener', e);
        }
      });
    },
    onActivityStart: (a, state) => {
      setActivity((prev) => (prev && prev.id === a.id ? prev : a));
      if (state) setActivityRemoteState(state);
    },
    onActivityState: (activityId, state) => {
      setActivity((prev) => (!prev || prev.id !== activityId ? prev : { ...prev, state }));
      setActivityRemoteState(state);
    },
    onActivityEnd: (activityId) => {
      setActivity((prev) => (!prev || prev.id !== activityId ? prev : null));
      setActivityRemoteState(null);
      setPendingInvite((prev) => (prev && prev.id === activityId ? null : prev));
    },
    // Talk2Me #408 — Watch Together consentement
    onWatchInvite: (a) => {
      // Pas pour moi si je suis l'inviteur (déjà filtré côté hook, ceinture+bretelles)
      if (a.started_by === me?.id) return;
      setPendingInvite(a);
      // L'inviteur a aussi un activity côté lui (déjà fetched via /start) mais
      // pas pour le peer ; on ne setActivity QUE après accept (sinon le player
      // démarre prématurément côté peer).
    },
    onWatchAccepted: (a) => {
      // Reçu par les DEUX (leader + peer). Place l'activity réelle + cleanup
      // banner (chez le peer).
      setActivity(a);
      if (a && a.kind === 'video' && a.state) {
        setActivityRemoteState(a.state as VideoSyncState);
      }
      setPendingInvite((prev) => (prev && prev.id === a.id ? null : prev));
    },
    onWatchDeclined: (activityId) => {
      // Reçu par les DEUX. Si je suis l'inviteur, mon activity locale disparaît.
      setActivity((prev) => (!prev || prev.id !== activityId ? prev : null));
      setActivityRemoteState(null);
      setPendingInvite((prev) => (prev && prev.id === activityId ? null : prev));
    },
    onWatchSync: (evt) => {
      // Ne s'applique qu'à l'activité courante (filet de sécurité).
      if (!activity || activity.id !== evt.activity_id) return;
      setSyncEvent(evt);
    },
    // Talk2Me #408 — Jeux interactifs
    onGameMove: (evt) => {
      // Si la partie active matche, on incrémente le tick pour reload state
      if (activeGame && activeGame.id === evt.game_id) {
        setGameRefreshTick((n) => n + 1);
      }
      // Si pas encore d'activeGame (cas: peer m'a invité à une partie), on
      // l'ouvre automatiquement. Évite friction.
      if (!activeGame && evt.from_user_id !== me?.id) {
        setActiveGame({ kind: evt.game_kind, id: evt.game_id });
      }
    },
    onGameEnd: (gameId) => {
      if (activeGame && activeGame.id === gameId) {
        setGameRefreshTick((n) => n + 1); // reload pour montrer le status final
      }
    },
    // Talk2Me #416 (Pascal 2026-06-05) — pause / reprise persistante.
    onGamePause: (gameId) => {
      if (activeGame && activeGame.id === gameId) {
        setGameRefreshTick((n) => n + 1);
      }
    },
    onGameResume: (gameId) => {
      if (activeGame && activeGame.id === gameId) {
        setGameRefreshTick((n) => n + 1);
      }
    },
  });

  const send = useCallback(
    async (value: string, opts?: { quoted_message_id?: string | null }) => {
      const v = value.trim();
      if (!v || sending || !convId || !conv) return;
      if (conv.kind !== 'p2p') return;
      setSending(true);
      try {
        const res = await fetch(`/api/conversations/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: v,
            quoted_message_id: opts?.quoted_message_id ?? replyTo?.id ?? null,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setMessages((prev) =>
            prev.some((m) => m.id === data.message.id)
              ? prev
              : [
                  ...prev,
                  {
                    id: data.message.id,
                    role: 'user',
                    content: data.message.content,
                    timestamp: data.message.timestamp,
                    sender_id: data.message.sender_id,
                    quoted_message_id: data.message.quoted_message_id ?? null,
                    kind: 'user',
                  },
                ]
          );
          setReplyTo(null);
        }
      } finally {
        setSending(false);
      }
    },
    [convId, conv, replyTo, sending]
  );

  // Talk2Me média chat (Pascal 2026-06-04) — partage de fichier dans une
  // conv P2P. POST sur la même route messages avec body.media + caption optionnelle.
  const sendMedia = useCallback(
    async (
      media: {
        url: string;
        type: 'image' | 'video' | 'audio';
        filename?: string | null;
        size?: number | null;
        mime?: string | null;
      },
      opts?: { caption?: string; quoted_message_id?: string | null }
    ) => {
      if (sending || !convId || !conv || conv.kind !== 'p2p') return;
      setSending(true);
      try {
        const res = await fetch(`/api/conversations/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: opts?.caption?.trim() || '',
            media,
            quoted_message_id: opts?.quoted_message_id ?? replyTo?.id ?? null,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setMessages((prev) =>
            prev.some((m) => m.id === data.message.id)
              ? prev
              : [
                  ...prev,
                  {
                    id: data.message.id,
                    role: 'user',
                    content: data.message.content,
                    timestamp: data.message.timestamp,
                    sender_id: data.message.sender_id,
                    quoted_message_id: data.message.quoted_message_id ?? null,
                    kind: 'user',
                    media: data.message.media ?? null,
                  },
                ]
          );
          setReplyTo(null);
        }
      } finally {
        setSending(false);
      }
    },
    [convId, conv, replyTo, sending]
  );

  const peer = conv?.peer || null;
  const peerOnline = peerOnlineTs !== null && Date.now() - peerOnlineTs < ONLINE_WINDOW_MS;
  const peerLabel = peer?.display_name || (peer ? `@${peer.username}` : 'Conversation');

  /**
   * Talk2Me #416 (Pascal 2026-06-05) — Démarre/reprend une partie via
   * /api/games/trigger (helper triggerGameFromConv). Si existing=true, on
   * affiche d'abord la GameInviteCard. Sinon ouverture board direct.
   *
   * Mode déduit par le helper : si conv P2P (peer présent) → 'arbiter' (Léa
   * arbitre les 2 humains). Sinon → 'solo' (vs Léa, mais ici conv P2P → peer
   * obligatoire pour cette route, donc en pratique : mode='arbiter').
   */
  const handleStartGame = useCallback(
    async (gameKind: 'chess' | 'dame') => {
      if (!conv || !me) return;
      if (startingGame) return;
      setStartingGame(true);
      try {
        // Pour une conv P2P, on appelle find-or-create directement pour
        // distinguer existant vs nouveau (le helper trigger crée tout de
        // suite ; ici on veut juste détecter).
        const peerId = peer?.id || null;
        if (peerId) {
          // Mode arbitre dans conv P2P
          const checkRes = await fetch(`/api/${gameKind}/find-or-create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conv_id: conv.id,
              opponent: peerId,
              mode: 'arbiter',
            }),
          });
          const data = await checkRes.json().catch(() => ({}));
          if (!checkRes.ok || !data?.game) {
            console.error('[game] find-or-create failed', data);
            return;
          }
          if (data.existing) {
            setGameInvite({ game: data.game, gameKind, mode: 'arbiter' });
          } else {
            setActiveGame({ kind: gameKind, id: data.game.id });
          }
        } else {
          // Pas de peer (rare en P2P) → solo Léa
          const checkRes = await fetch(`/api/${gameKind}/find-or-create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conv_id: conv.id,
              opponent: 'lea',
              mode: 'solo',
            }),
          });
          const data = await checkRes.json().catch(() => ({}));
          if (!checkRes.ok || !data?.game) return;
          if (data.existing) {
            setGameInvite({ game: data.game, gameKind, mode: 'solo' });
          } else {
            setActiveGame({ kind: gameKind, id: data.game.id });
          }
        }
      } catch (e) {
        console.error('[game] handleStartGame', e);
      } finally {
        setStartingGame(false);
      }
    },
    [conv, me, peer, startingGame]
  );

  /** Force la création d'une nouvelle partie (depuis la GameInviteCard). */
  const handleForceNewGame = useCallback(
    async (gameKind: 'chess' | 'dame', mode: 'solo' | 'arbiter') => {
      if (!conv) return;
      const peerId = peer?.id || null;
      const body =
        mode === 'arbiter' && peerId
          ? { conv_id: conv.id, opponent: peerId, mode: 'arbiter', force_new: true }
          : { conv_id: conv.id, opponent: 'lea', mode: 'solo', force_new: true };
      try {
        const res = await fetch(`/api/${gameKind}/find-or-create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.game) {
          setGameInvite(null);
          setActiveGame({ kind: gameKind, id: data.game.id });
        }
      } catch (e) {
        console.error('[game] handleForceNewGame', e);
      }
    },
    [conv, peer]
  );

  const messagesById = useMemo(() => {
    const m = new Map<string, RealtimeMessage>();
    for (const msg of messages) m.set(msg.id, msg);
    return m;
  }, [messages]);

  const resolveAuthorName = useCallback(
    (msg: RealtimeMessage): string => {
      if (msg.kind === 'ai_reply') {
        // Talk2Me #386 — T2M Officiel : nom canonique stable.
        if (msg.ai_for_user_id === T2M_OFFICIEL_USER_ID) return 'T2M Officiel';
        return msg.ai_name || 'IA';
      }
      // Talk2Me #386 — sender T2M Officiel : nom canonique stable.
      if (msg.sender_id === T2M_OFFICIEL_USER_ID) return 'T2M Officiel';
      if (msg.sender_id && me && msg.sender_id === me.id) {
        return me.display_name || me.username || 'Toi';
      }
      if (peer && msg.sender_id === peer.id) {
        return peer.display_name || peer.username || 'Lui';
      }
      return msg.role === 'user' ? me?.display_name || me?.username || 'Toi' : 'IA';
    },
    [me, peer]
  );

  const conversationPeer: ConversationPeer | null = useMemo(() => {
    if (!peer) return null;
    return {
      id: peer.id,
      kind: 'human',
      name: peerLabel,
      avatarUrl: peer.avatar_url ?? null,
      presence: peerOnline ? 'online' : 'offline',
      subtitle: peerOnline ? 'en ligne' : formatLastSeen(peerOnlineTs),
    };
  }, [peer, peerLabel, peerOnline, peerOnlineTs]);

  const unified: UnifiedMessage[] = useMemo(() => {
    return messages.map((m) => {
      const isAiReply = m.kind === 'ai_reply';
      // Talk2Me #338 — auteur dérivé sur 4 valeurs (Pascal 2026-06-04).
      // - ai_reply : c'est l'IA. Owner = ai_for_user_id (snapshot DB).
      //   Si owner = moi → 'me-ai' (MON IA, côté droit avec moi)
      //   Sinon → 'peer-ai' (IA de l'ami, côté gauche avec lui)
      //   Fallback (legacy sans ai_for_user_id) : on regarde sender_id puis role.
      // - Sinon (kind='user') : me/peer selon sender_id == me?.id.
      let author: UnifiedMessage['author'];
      if (isAiReply) {
        const aiOwnerId = m.ai_for_user_id ?? m.sender_id ?? null;
        // Talk2Me #386 — T2M Officiel est INSTITUTIONNEL (jamais "ma" IA).
        // Force 'peer-ai' même si me.id === T2M_OFFICIEL_USER_ID (debug).
        if (aiOwnerId === T2M_OFFICIEL_USER_ID) {
          author = 'peer-ai';
        } else {
          const aiIsMine = !!me?.id && !!aiOwnerId && aiOwnerId === me.id;
          author = aiIsMine ? 'me-ai' : 'peer-ai';
        }
      } else {
        // Talk2Me #386 — Messages "user" envoyés depuis le compte T2M Officiel
        // sont toujours 'peer' (institutionnels), jamais 'me'.
        if (m.sender_id && m.sender_id === T2M_OFFICIEL_USER_ID) {
          author = 'peer';
        } else {
          const senderIsMe = m.sender_id
            ? m.sender_id === me?.id
            : m.role === 'user';
          author = senderIsMe ? 'me' : 'peer';
        }
      }
      const isMine = author === 'me';
      const isMyAi = author === 'me-ai';
      const quoted = m.quoted_message_id ? messagesById.get(m.quoted_message_id) : null;
      const quotedPreview = quoted
        ? { author_name: resolveAuthorName(quoted), text: (quoted.content || '').slice(0, 120) }
        : null;
      // Avatar : pour ai → ai_avatar_url ; pour peer humain → peer.avatar ; pour me → null.
      const avatarUrl = isAiReply
        ? m.ai_avatar_url ?? (isMyAi ? me?.ai_avatar_url ?? null : null)
        : isMine
          ? null
          : peer?.avatar_url ?? null;
      return {
        id: m.id,
        author,
        content: m.content,
        timestamp: m.timestamp,
        author_name: resolveAuthorName(m),
        author_avatar_url: avatarUrl,
        quotedPreview,
        quoted_message_id: m.quoted_message_id ?? null,
        youtube: m.youtube ?? null,
        places: m.places ?? null,
        intent_query: m.intent_query ?? null,
        user_lat: m.user_lat ?? null,
        user_lng: m.user_lng ?? null,
        recipe: m.recipe ?? null,
        products: m.products ?? null,
        wikipedia: m.wikipedia ?? null,
        weather: m.weather ?? null,
        web_search: m.web_search ?? null,
        tiktok: m.tiktok ?? null,
        media: m.media ?? null,
        // Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — propagées
        // au rendu UnifiedBubble qui les passe à UnifiedCardRenderer.
        attached_cards: m.attached_cards ?? null,
      };
    });
  }, [messages, messagesById, me, peer, resolveAuthorName]);

  if (loadError) {
    return (
      <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#0e0e12] items-center justify-center text-center gap-3 px-6">
        <p className="text-white/85">{loadError}</p>
        <Link href="/messages" className="text-red-300 underline">
          Retour aux messages
        </Link>
      </div>
    );
  }

  if (!conv || !conversationPeer) {
    return (
      <div className="flex items-center justify-center h-[100dvh] text-white/55 text-[13px]">
        Chargement…
      </div>
    );
  }
  if (conv.kind === 'agent') return null;

  return (
    <ConversationView
      peer={conversationPeer}
      messages={unified}
      sending={sending}
      onSend={(text, opts) => send(text, opts)}
      onSendMedia={(media, opts) => sendMedia(media, opts)}
      backHref="/messages"
      enableSwipeReply
      replyTo={
        replyTo
          ? {
              id: replyTo.id,
              text: (replyTo.content || '').slice(0, 200),
              author_name: resolveAuthorName(replyTo),
            }
          : null
      }
      onReply={(m) => {
        const orig = messagesById.get(m.id);
        if (orig) setReplyTo(orig);
      }}
      onReplyCancel={() => setReplyTo(null)}
      aiName={me?.ai_name ?? null}
      aiAvatarUrl={me?.ai_avatar_url ?? null}
      onAudioCall={() => peer && !callState && setCallState({ kind: 'audio', mode: 'outgoing' })}
      onVideoCall={() => peer && !callState && setCallState({ kind: 'video', mode: 'outgoing' })}
      callsEnabled={!!peer && !callState}
      onStartGame={handleStartGame}
      emptyState={
        <div className="text-center text-white/45 text-[13px] py-12">
          Démarre la conversation avec {peerLabel}
        </div>
      }
      bottomSlot={
        activeGame && me ? (
          <InlineGameDock
            gameKind={activeGame.kind}
            gameId={activeGame.id}
            meId={me.id}
            peerLabel={peer?.display_name || (peer ? `@${peer.username}` : undefined)}
            refreshTick={gameRefreshTick}
            onClose={() => setActiveGame(null)}
          />
        ) : null
      }
    >
      {callState && peer && (
        <CallModal
          convId={conv.id}
          peer={{ id: peer.id, username: peer.username, display_name: peer.display_name }}
          kind={callState.kind}
          mode={callState.mode}
          incomingOffer={callState.incomingOffer}
          signal={callSignal}
          onClose={() => {
            if (activity) {
              void fetch(`/api/activities/${activity.id}/end`, { method: 'POST' }).catch(() => {});
              setActivity(null);
              setActivityRemoteState(null);
            }
            setPickerOpen(false);
            setCallState(null);
          }}
          onOpenActivityPicker={activity ? undefined : () => setPickerOpen(true)}
          activitySlot={
            // Talk2Me #408 — Le player ne s'affiche QUE si invite_status='accepted'
            // (côté leader comme côté peer). Pendant 'pending', l'overlay
            // WatchInviteBanner gère le opt-in chez le peer ; chez le leader on
            // affiche un "en attente d'acceptation".
            activity &&
            isVideoActivity(activity) &&
            activity.invite_status === 'accepted' &&
            me ? (
              <ActivityVideoSync
                activity={activity}
                isLeader={activity.state.leader_id === me.id}
                remoteState={activityRemoteState}
                meId={me.id}
                peerLabel={peer.display_name || `@${peer.username}`}
                syncEvent={syncEvent}
                onEnd={() => {
                  setActivity(null);
                  setActivityRemoteState(null);
                }}
              />
            ) : activity &&
              isVideoActivity(activity) &&
              activity.invite_status === 'pending' &&
              me &&
              activity.started_by === me.id ? (
              <div className="flex flex-col items-center justify-center h-full bg-black text-white/80 gap-3 px-6">
                <div className="text-[13px] uppercase tracking-wider text-red-300/85">
                  En attente
                </div>
                <div className="text-[14px] text-center max-w-xs">
                  {peer?.display_name || `@${peer?.username}`} doit accepter
                  ton invitation Watch Together.
                </div>
                <div className="text-[11.5px] text-white/45 text-center max-w-xs">
                  Vidéo : « {(activity.state as VideoSyncState).title} »
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void fetch(`/api/activities/${activity.id}/end`, {
                      method: 'POST',
                    }).catch(() => {});
                    setActivity(null);
                    setActivityRemoteState(null);
                  }}
                  className="mt-2 text-[12px] px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white/80"
                >
                  Annuler
                </button>
              </div>
            ) : undefined
          }
        />
      )}
      {/* Talk2Me #408 — Banner overlay reçue par le PEER d'une activité 'pending'.
          Posée au-dessus de tout (z-[140]) y compris CallModal. */}
      {pendingInvite && me && pendingInvite.started_by !== me.id && (
        <WatchInviteBanner
          activity={pendingInvite}
          inviterLabel={peer?.display_name || (peer ? `@${peer.username}` : 'Ton ami')}
          onAccepted={(a) => {
            setPendingInvite(null);
            setActivity(a);
            if (a && a.kind === 'video' && a.state) {
              setActivityRemoteState(a.state as VideoSyncState);
            }
            // Si pas d'appel actif, on en lance un en mode 'outgoing'… non,
            // restons explicite : Pascal veut que le user décide. Si l'appel
            // n'est pas actif, le player s'affichera tout seul en plein écran
            // dans une future feature. Pour ce MVP, on requiert que CallModal
            // soit déjà actif (cas normal : Watch Together pendant un appel).
          }}
          onDeclined={() => setPendingInvite(null)}
        />
      )}
      {pickerOpen && me && (
        <ActivityPicker
          convId={conv.id}
          meId={me.id}
          peerId={peer?.id}
          onClose={() => setPickerOpen(false)}
          onActivityStarted={(a) => {
            setActivity({
              id: a.id,
              conv_id: a.conv_id,
              kind: a.kind,
              state: a.state,
              started_by: a.started_by,
              started_at: a.started_at,
              // Talk2Me #408 — Le leader voit son activité en 'pending' jusqu'à
              // ce que le peer accepte. L'API a déjà créé en pending.
              invite_status: a.kind === 'video' ? 'pending' : 'accepted',
            });
            if (a.kind === 'video' && a.state) {
              setActivityRemoteState(a.state as VideoSyncState);
            }
          }}
          onGameStarted={(kind, id) => {
            // Ouvre directement le board chez le leader (le peer sera ouvert
            // automatiquement par onGameMove dès le 1er coup, ou via badge à
            // venir). Pour V1, le peer voit la partie quand un coup est joué.
            setActiveGame({ kind, id });
          }}
        />
      )}
      {/* Talk2Me #419 (Pascal 2026-06-05) — Le jeu n'est PLUS un modal.
          Il est rendu inline en bas via le prop bottomSlot de ConversationView
          (voir au-dessus). InlineGameDock = sticky bottom au-dessus du composer,
          messages scrollent au-dessus. GameBoardModal supprimé (#408 deprecated). */}
      {/* Talk2Me #416 (Pascal 2026-06-05) — GameInviteCard si partie en cours détectée */}
      {gameInvite && (
        <GameInviteCard
          game={gameInvite.game}
          gameKind={gameInvite.gameKind}
          peerLabel={peerLabel}
          mode={gameInvite.mode}
          onResume={() => {
            const id = gameInvite.game.id;
            const k = gameInvite.gameKind;
            setGameInvite(null);
            setActiveGame({ kind: k, id });
          }}
          onNew={() => {
            const k = gameInvite.gameKind;
            const m = gameInvite.mode;
            void handleForceNewGame(k, m);
          }}
          onClose={() => setGameInvite(null)}
        />
      )}
    </ConversationView>
  );
}
