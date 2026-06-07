'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ChatMessage } from '@/lib/chat-types'
import MessageBubble from './MessageBubble'

interface ChatStreamProps {
  messages: ChatMessage[]
  isTyping?: boolean
}

export default function ChatStream({ messages, isTyping = false }: ChatStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages.length, isTyping])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10"
    >
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          messageId={m.id}
          role={m.role}
          content={m.content}
          timestamp={m.timestamp}
          extraLinks={m.links}
          youtube={m.youtube}
          places={m.places}
          intent_query={m.intent_query}
          user_lat={m.user_lat}
          user_lng={m.user_lng}
          requires_geoloc={m.requires_geoloc}
          recipe={m.recipe}
          products={m.products}
          wikipedia={m.wikipedia}
          weather={m.weather}
          web_search={m.web_search}
        />
      ))}
      <AnimatePresence>
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex justify-start"
          >
            <div className="flex items-start gap-2">
              {/* Avatar Talk2Me avec lettre "A" */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                A
              </div>
              {/* Bulle glass */}
              <div className="px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-sm">
                <span className="text-gray-300 italic text-sm">Talk2Me écrit...</span>
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
  )
}
