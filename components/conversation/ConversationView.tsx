'use client';

import React from 'react';
import ChatInput, { type AttachedMedia } from '@/components/chat/ChatInput';
import BottomNav from '@/components/chat/BottomNav';
import ConversationHeader from './ConversationHeader';
import ConversationStream from './ConversationStream';
import type { ConversationPeer, UnifiedMessage } from './types';

interface ReplyTo {
  id: string;
  text: string;
  author_name: string;
}

export interface ConversationViewProps {
  peer: ConversationPeer;
  messages: UnifiedMessage[];
  isTyping?: boolean;
  typingLabel?: string;

  onSend: (text: string, opts?: { quoted_message_id?: string | null }) => void;
  sending?: boolean;

  /**
   * Talk2Me média chat (Pascal 2026-06-04) — handler partage de fichier
   * (image/vidéo/audio). Optionnel : si absent, le menu n'affiche pas les
   * options Photo/Vidéo/Audio.
   */
  onSendMedia?: (
    media: AttachedMedia,
    opts?: { caption?: string; quoted_message_id?: string | null }
  ) => Promise<void> | void;

  /** URL retour. null si conv IA root. */
  backHref?: string | null;

  /** Reply (drag-to-reply WhatsApp-style — actif en P2P, désactivé en IA). */
  enableSwipeReply?: boolean;
  replyTo?: ReplyTo | null;
  onReply?: (m: UnifiedMessage) => void;
  onReplyCancel?: () => void;

  /**
   * Talk2Me #351 — Active la sélection contiguë de messages via long-press
   * (500ms) + tap d'extension. Réservé à la conv IA solo (interdit en P2P
   * pour confidentialité). Default false.
   */
  enableSelection?: boolean;

  /** Avatar IA dans ChatInput (toujours présent, tagging @IA). */
  aiName?: string | null;
  aiAvatarUrl?: string | null;

  onAudioCall?: () => void;
  onVideoCall?: () => void;
  callsEnabled?: boolean;

  /** Affichage si messages.length === 0. */
  emptyState?: React.ReactNode;

  /** Slot bonus injecté en bas (ex: CallModal en P2P). */
  children?: React.ReactNode;

  /**
   * Talk2Me #416 (Pascal 2026-06-05) — Hook "Lancer un jeu" depuis le menu +
   * du ChatInput. Si fourni, l'option apparaît. Sinon masquée (rétro-compat).
   */
  onStartGame?: (game_kind: 'chess' | 'dame') => void;

  /**
   * Talk2Me #419 (Pascal 2026-06-05) — Slot rendu entre le stream de messages
   * et le composer ChatInput. Conçu pour InlineGameDock (jeu sticky bottom)
   * mais réutilisable pour tout dock contextuel persistant.
   *
   * Quand présent, ConversationStream scrolle au-dessus du slot (les nouveaux
   * messages restent visibles juste au-dessus du dock) tout en gardant le
   * composer accessible en bas.
   */
  bottomSlot?: React.ReactNode;
}

/**
 * Talk2Me #337 (Pascal 2026-06-04) — Composant central UNIFIÉ pour toute
 * page de conversation (IA solo OU P2P humain).
 *
 * Doctrine [[modular-no-scattered-patches]] :
 *   Pascal : "le mieu aurais etait davoir un modules pages avec diferente
 *   pages et les servire avec les amis et conversation meme pages sauf ces
 *   les amis qui chznges"
 *
 * Skeleton identique entre les deux pages : Header + Stream + Input + BottomNav.
 * Le caller fournit les data (peer + messages + handlers). Aucune décision
 * UI prise dans la page elle-même.
 */
const ConversationView: React.FC<ConversationViewProps> = ({
  peer,
  messages,
  isTyping = false,
  typingLabel,
  onSend,
  sending = false,
  backHref = '/messages',
  enableSwipeReply = false,
  replyTo = null,
  onReply,
  onReplyCancel,
  aiName = null,
  aiAvatarUrl = null,
  onAudioCall,
  onVideoCall,
  callsEnabled = true,
  emptyState,
  children,
  onSendMedia,
  enableSelection = false,
  onStartGame,
  bottomSlot,
}) => {
  return (
    <div
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#0e0e12] overflow-hidden"
      data-testid="conversation-view"
      data-peer-kind={peer.kind}
    >
      <ConversationHeader
        peer={peer}
        backHref={backHref}
        onAudioCall={onAudioCall}
        onVideoCall={onVideoCall}
        callsEnabled={callsEnabled}
      />

      <ConversationStream
        messages={messages}
        isTyping={isTyping}
        typingLabel={typingLabel}
        onReply={onReply}
        enableSwipeReply={enableSwipeReply}
        enableSelection={enableSelection}
        emptyState={emptyState}
      />

      {/* Talk2Me #419 (Pascal 2026-06-05) — Dock contextuel (jeu, etc.)
          rendu entre le stream et le composer. Les nouveaux messages scrollent
          au-dessus, le composer reste accessible en bas. */}
      {bottomSlot}

      <ChatInput
        onSend={onSend}
        disabled={sending}
        aiName={aiName}
        aiAvatarUrl={aiAvatarUrl}
        replyTo={replyTo}
        onReplyCancel={onReplyCancel}
        onSendMedia={onSendMedia}
        onStartGame={onStartGame}
      />

      <BottomNav />

      {children}
    </div>
  );
};

export default ConversationView;
