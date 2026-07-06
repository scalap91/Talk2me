'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import UnifiedBubble from './UnifiedBubble';
import DateSeparator, { getDateSeparatorLabel } from './DateSeparator';
import type { UnifiedMessage } from './types';

interface ConversationStreamProps {
  messages: UnifiedMessage[];
  isTyping?: boolean;
  typingLabel?: string;
  /** Accusés de lecture (Pascal 2026-06-26) : ms jusqu'où le peer a lu. undefined = pas d'accusés (conv IA/groupe). */
  peerReadTs?: number;
  onReply?: (m: UnifiedMessage) => void;
  enableSwipeReply?: boolean;
  /** Talk2Me #351 — Active la sélection contiguë (long-press 500ms + tap). */
  enableSelection?: boolean;
  emptyState?: React.ReactNode;
}

/**
 * Talk2Me #337 — Stream de messages unifié.
 *
 * - Insère un <DateSeparator> entre chaque changement de jour calendaire
 *   (et avant le premier message).
 * - Heure HH:MM rendue sous chaque bulle (via UnifiedBubble).
 * - Scroll auto au bas quand nouveau message.
 */
const ConversationStream: React.FC<ConversationStreamProps> = ({
  messages,
  isTyping = false,
  typingLabel = 'écrit...',
  peerReadTs,
  onReply,
  enableSwipeReply = false,
  enableSelection = false,
  emptyState,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages.length, isTyping]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10"
      data-testid="conversation-stream"
    >
      {messages.length === 0 && emptyState}

      {messages.map((m, i) => {
        const prev = i > 0 ? messages[i - 1] : null;
        const label = getDateSeparatorLabel(prev?.timestamp ?? null, m.timestamp);
        return (
          <React.Fragment key={m.id}>
            {label && <DateSeparator label={label} />}
            <UnifiedBubble
              message={m}
              onReply={onReply}
              enableSwipeReply={enableSwipeReply}
              enableSelection={enableSelection}
              peerReadTs={peerReadTs}
            />
          </React.Fragment>
        );
      })}

      <AnimatePresence>
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex justify-start"
            data-testid="typing-indicator"
          >
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                T
              </div>
              <div className="px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-sm">
                <span className="text-gray-300 italic text-sm">{typingLabel}</span>
                <span className="inline-flex items-center ml-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce mx-0.5"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConversationStream;
