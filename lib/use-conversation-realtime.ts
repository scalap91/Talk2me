'use client';

import { useEffect } from 'react';
import { playNotifSound } from '@/lib/notif-sound';
import type {
  CallSignalEvent,
  CallKind,
  CallMode,
  IncomingOffer,
} from '@/components/call/CallModal';
import type { Activity, VideoSyncState } from '@/lib/activity-types';
import type {
  YouTubeCardData,
  PlaceCardData,
  RecipeCardData,
  ProductCardData,
  WebSearchData,
  TikTokCardData,
} from '@/lib/chat-types';
import type { WikipediaCardData } from '@/lib/wikipedia-search';
import type { WeatherCardData } from '@/lib/weather';
import type { UnifiedCard } from '@/lib/embed-hub/types';

/**
 * Talk2Me #337 — Hook réutilisable encapsulant TOUTE la plomberie SSE pour
 * une conversation P2P (chat, calls WebRTC, activités synchronisées).
 *
 * Extrait de app/c/[conv_id]/page.tsx pour amaigrir la page UI.
 */
export interface RealtimeMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp?: number;
  sender_id?: string | null;
  quoted_message_id?: string | null;
  kind?: 'user' | 'ai_reply';
  ai_for_user_id?: string | null;
  ai_name?: string | null;
  ai_avatar_url?: string | null;
  youtube?: YouTubeCardData | null;
  places?: PlaceCardData[] | null;
  intent_query?: string | null;
  user_lat?: number | null;
  user_lng?: number | null;
  recipe?: RecipeCardData | null;
  products?: ProductCardData[] | null;
  wikipedia?: WikipediaCardData | null;
  weather?: WeatherCardData | null;
  web_search?: WebSearchData | null;
  /** Talk2Me search_tiktok (Pascal 2026-06-04) — vidéo safe filtrée 5 garde-fous. */
  tiktok?: TikTokCardData | null;
  /** Talk2Me média chat (Pascal 2026-06-04). */
  media?: {
    url: string;
    type: 'image' | 'video' | 'audio';
    filename?: string | null;
    size?: number | null;
    mime?: string | null;
    poster?: string | null;
  } | null;
  /**
   * Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — UnifiedCards
   * d'origine renvoyées par T2M Officiel sous le texte. Bug fix verbatim :
   * "il ne sait pas me ressevir en card dorigine le contenue quil a citer".
   */
  attached_cards?: UnifiedCard[] | null;
}

/**
 * Talk2Me #408 — Watch Together event passthrough (Pascal 2026-06-05).
 * Doctrine [[talk2me-watch-together-passthrough]] : aucun média transporté,
 * uniquement events de contrôle.
 */
export interface WatchSyncEvent {
  activity_id: string;
  action: 'play' | 'pause' | 'seek' | 'rate';
  time: number;
  rate: number | null;
  client_ts: number;
  server_ts: number;
  from_user_id: string;
}

/**
 * Talk2Me #408 — Jeux interactifs (chess + dames). Broadcast d'un move pour
 * synchroniser le plateau peer en temps réel.
 */
export interface GameMoveEvent {
  game_kind: 'chess' | 'dame';
  game_id: string;
  move: unknown; // {from, to, promotion?} pour chess ; {from, to, captures?} pour dame
  fen_or_state: unknown;
  status: 'in_progress' | 'white_won' | 'black_won' | 'draw';
  winner: string | null;
  from_user_id: string;
}

interface UseConversationRealtimeOpts {
  convId: string | undefined;
  enabled: boolean;
  meId: string | undefined;
  callActive: boolean;
  onChatMessage: (m: RealtimeMessage) => void;
  // Talk2Me — Accusés WhatsApp (Pascal 2026-06-26). onTyping : le peer écrit.
  // onRead : le peer a lu jusqu'à `at` (ms) → passer mes messages en ✓✓.
  onTyping?: (userId: string) => void;
  onRead?: (userId: string, at: number) => void;
  onCallOffer: (data: {
    kind: CallKind;
    mode: CallMode;
    incomingOffer: IncomingOffer;
  }) => void;
  onCallSignal: (evt: CallSignalEvent) => void;
  onActivityStart: (activity: Activity<unknown>, state: VideoSyncState | null) => void;
  onActivityState: (
    activityId: string,
    state: VideoSyncState
  ) => void;
  onActivityEnd: (activityId: string) => void;
  // Talk2Me #408 — Watch Together consentement (optionnel, rétro-compat OK).
  onWatchInvite?: (activity: Activity<unknown>) => void;
  onWatchAccepted?: (activity: Activity<unknown>) => void;
  onWatchDeclined?: (activityId: string) => void;
  onWatchSync?: (evt: WatchSyncEvent) => void;
  // Talk2Me #408 — Jeux interactifs (chess + dames).
  onGameMove?: (evt: GameMoveEvent) => void;
  onGameEnd?: (gameId: string, winner: string | null) => void;
  // Talk2Me #416 — Pause / Reprise persistante (Pascal 2026-06-05).
  onGamePause?: (gameId: string, pausedAt: number) => void;
  onGameResume?: (gameId: string) => void;
}

export function useConversationRealtime({
  convId,
  enabled,
  meId,
  callActive,
  onChatMessage,
  onTyping,
  onRead,
  onCallOffer,
  onCallSignal,
  onActivityStart,
  onActivityState,
  onActivityEnd,
  onWatchInvite,
  onWatchAccepted,
  onWatchDeclined,
  onWatchSync,
  onGameMove,
  onGameEnd,
  onGamePause,
  onGameResume,
}: UseConversationRealtimeOpts) {
  useEffect(() => {
    if (!convId || !enabled) return;
    const es = new EventSource(`/api/conversations/${convId}/events`);

    es.addEventListener('chat', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        // Son de notif quand le message vient d'un AUTRE (pas mes propres envois).
        if (data.sender_id && data.sender_id !== meId) playNotifSound();
        onChatMessage({
          id: data.id,
          role: data.kind === 'ai_reply' ? 'agent' : 'user',
          content: data.text,
          timestamp: data.created_at,
          sender_id: data.sender_id ?? null,
          quoted_message_id: data.quoted_message_id ?? null,
          kind: data.kind === 'ai_reply' ? 'ai_reply' : 'user',
          ai_for_user_id: data.ai_for_user_id ?? null,
          ai_name: data.ai_name ?? null,
          ai_avatar_url: data.ai_avatar_url ?? null,
          youtube: data.youtube ?? null,
          places: data.places ?? null,
          intent_query: data.intent_query ?? null,
          user_lat: data.user_lat ?? null,
          user_lng: data.user_lng ?? null,
          recipe: data.recipe ?? null,
          products: data.products ?? null,
          wikipedia: data.wikipedia ?? null,
          weather: data.weather ?? null,
          web_search: data.web_search ?? null,
          media: data.media ?? null,
          // Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) —
          // propagé via SSE pour rendu temps réel sous la bulle T2M Officiel.
          attached_cards: Array.isArray(data.attached_cards)
            ? (data.attached_cards as UnifiedCard[])
            : null,
        });
      } catch {
        // ignore
      }
    });

    es.addEventListener('typing', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data.user_id && data.user_id !== meId) onTyping?.(data.user_id);
      } catch { /* ignore */ }
    });

    es.addEventListener('read', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data.user_id && data.user_id !== meId) onRead?.(data.user_id, Number(data.at) || Date.now());
      } catch { /* ignore */ }
    });

    es.addEventListener('call_offer', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data.from_user_id === meId) return;
        if (callActive) return;
        const kind: CallKind = data.kind === 'video' ? 'video' : 'audio';
        onCallOffer({
          kind,
          mode: 'incoming',
          incomingOffer: {
            sdp_offer: data.sdp_offer,
            from_user_id: data.from_user_id,
          },
        });
        onCallSignal({
          type: 'call_offer',
          from_user_id: data.from_user_id,
          kind,
          sdp_offer: data.sdp_offer,
        });
      } catch (e) {
        console.error('[call] parse call_offer', e);
      }
    });

    es.addEventListener('call_answer', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data.from_user_id === meId) return;
        onCallSignal({
          type: 'call_answer',
          from_user_id: data.from_user_id,
          sdp_answer: data.sdp_answer,
        });
      } catch (e) {
        console.error('[call] parse call_answer', e);
      }
    });

    es.addEventListener('ice_candidate', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data.from_user_id === meId) return;
        onCallSignal({
          type: 'ice_candidate',
          from_user_id: data.from_user_id,
          candidate: data.candidate,
        });
      } catch (e) {
        console.error('[call] parse ice_candidate', e);
      }
    });

    es.addEventListener('call_decline', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data.from_user_id === meId) return;
        onCallSignal({
          type: 'call_decline',
          from_user_id: data.from_user_id,
          reason: data.reason,
        });
      } catch (e) {
        console.error('[call] parse call_decline', e);
      }
    });

    es.addEventListener('call_hangup', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data.from_user_id === meId) return;
        onCallSignal({
          type: 'call_hangup',
          from_user_id: data.from_user_id,
        });
      } catch (e) {
        console.error('[call] parse call_hangup', e);
      }
    });

    es.addEventListener('activity_start', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.activity) return;
        onActivityStart(
          data.activity as Activity<unknown>,
          data.activity.kind === 'video' && data.activity.state
            ? (data.activity.state as VideoSyncState)
            : null
        );
      } catch (e) {
        console.error('[activity] parse start', e);
      }
    });

    es.addEventListener('activity_state', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.activity_id || !data?.state) return;
        onActivityState(data.activity_id, data.state as VideoSyncState);
      } catch (e) {
        console.error('[activity] parse state', e);
      }
    });

    es.addEventListener('activity_end', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.activity_id) return;
        onActivityEnd(data.activity_id);
      } catch (e) {
        console.error('[activity] parse end', e);
      }
    });

    // Talk2Me #408 — Watch Together consentement events
    es.addEventListener('watch_invite', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.activity) return;
        // L'inviteur lui-même ne reçoit pas son propre banner.
        if (data.from_user_id === meId) return;
        onWatchInvite?.(data.activity as Activity<unknown>);
      } catch (e) {
        console.error('[watch] parse invite', e);
      }
    });

    es.addEventListener('watch_accepted', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.activity_id) return;
        onWatchAccepted?.(data.activity as Activity<unknown>);
      } catch (e) {
        console.error('[watch] parse accepted', e);
      }
    });

    es.addEventListener('watch_declined', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.activity_id) return;
        onWatchDeclined?.(data.activity_id);
      } catch (e) {
        console.error('[watch] parse declined', e);
      }
    });

    es.addEventListener('watch_sync', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.activity_id || !data?.action) return;
        onWatchSync?.({
          activity_id: data.activity_id,
          action: data.action,
          time: typeof data.time === 'number' ? data.time : 0,
          rate: typeof data.rate === 'number' ? data.rate : null,
          client_ts: typeof data.client_ts === 'number' ? data.client_ts : Date.now(),
          server_ts: typeof data.server_ts === 'number' ? data.server_ts : Date.now(),
          from_user_id: data.from_user_id,
        });
      } catch (e) {
        console.error('[watch] parse sync', e);
      }
    });

    // Talk2Me #408 — Jeux interactifs
    es.addEventListener('game_move', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.game_id || !data?.game_kind) return;
        onGameMove?.({
          game_kind: data.game_kind,
          game_id: data.game_id,
          move: data.move,
          fen_or_state: data.fen_or_state,
          status: data.status || 'in_progress',
          winner: data.winner ?? null,
          from_user_id: data.from_user_id,
        });
      } catch (e) {
        console.error('[game] parse move', e);
      }
    });

    es.addEventListener('game_end', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.game_id) return;
        onGameEnd?.(data.game_id, data.winner ?? null);
      } catch (e) {
        console.error('[game] parse end', e);
      }
    });

    // Talk2Me #416 — Pause / Reprise (Pascal 2026-06-05).
    es.addEventListener('game_pause', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.game_id) return;
        onGamePause?.(data.game_id, data.paused_at ?? Date.now());
      } catch (e) {
        console.error('[game] parse pause', e);
      }
    });

    es.addEventListener('game_resume', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (!data?.game_id) return;
        onGameResume?.(data.game_id);
      } catch (e) {
        console.error('[game] parse resume', e);
      }
    });

    es.onerror = () => {
      // Reconnexion auto
    };

    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, enabled, meId, callActive]);
}
