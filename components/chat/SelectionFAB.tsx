'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { useChatStore } from '@/lib/store/chat';

export default function SelectionFAB() {
  const router = useRouter();
  const selectionMode = useChatStore((state) => state.selectionMode);
  const publishSelection = useChatStore((state) => state.publishSelection);
  const exitSelection = useChatStore((state) => state.exitSelection);

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Souscriptions scalaires (références stables) pour éviter re-render infini.
  const messages = useChatStore((s) => s.messages);
  const selectionStartId = useChatStore((s) => s.selectionStartId);
  const selectionEndId = useChatStore((s) => s.selectionEndId);

  const selectedMessages = useMemo(() => {
    if (!selectionStartId || !selectionEndId) return [];
    const startIdx = messages.findIndex((m) => m.id === selectionStartId);
    const endIdx = messages.findIndex((m) => m.id === selectionEndId);
    if (startIdx === -1 || endIdx === -1) return [];
    const minIdx = Math.min(startIdx, endIdx);
    const maxIdx = Math.max(startIdx, endIdx);
    return messages.slice(minIdx, maxIdx + 1);
  }, [messages, selectionStartId, selectionEndId]);

  const selectedCount = selectedMessages.length;

  // Heuristique simple :
  //   1 message AVEC card riche (recipe / places / youtube / requires_geoloc) = 1 slide entière
  //   sinon, par paquets de 4 messages text → 1 slide
  const estimatedSlideCount = (() => {
    if (selectedMessages.length === 0) return 0;
    let slides = 0;
    let textBucket = 0;
    for (const m of selectedMessages) {
      const hasCard =
        !!m.recipe ||
        (Array.isArray(m.places) && m.places.length > 0) ||
        (m.youtube !== undefined && m.youtube !== null) ||
        m.requires_geoloc === true;
      if (hasCard) {
        if (textBucket > 0) {
          slides += 1;
          textBucket = 0;
        }
        slides += 1;
      } else {
        textBucket += 1;
        if (textBucket >= 4) {
          slides += 1;
          textBucket = 0;
        }
      }
    }
    if (textBucket > 0) slides += 1;
    return slides;
  })();

  const MAX_SLIDES = 6;
  const tooMany = estimatedSlideCount > MAX_SLIDES;

  const handlePublish = async () => {
    if (selectedCount === 0 || publishing || tooMany) return;

    setPublishing(true);
    setError(null);

    try {
      const result = await publishSelection();
      if (result?.ok) {
        router.push('/home');
      } else {
        setError('Erreur');
        setPublishing(false);
        setTimeout(() => setError(null), 2000);
      }
    } catch {
      setError('Erreur');
      setPublishing(false);
      setTimeout(() => setError(null), 2000);
    }
  };

  return (
    <AnimatePresence>
      {selectionMode && (
        <motion.div
          key="selection-fab"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4"
        >
          <div className="bg-gradient-to-r from-red-500 to-red-700 text-white rounded-full shadow-lg px-5 py-3 flex items-center gap-3">
            {/* Bouton Annuler */}
            <button
              onClick={exitSelection}
              className="flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity"
              aria-label="Annuler la sélection"
            >
              <X className="w-4 h-4" />
              <span className="text-sm">Annuler</span>
            </button>

            {/* Séparateur visuel */}
            <div className="w-px h-6 bg-white/30" />

            {/* Bouton Publier */}
            <button
              onClick={handlePublish}
              disabled={selectedCount === 0 || publishing || tooMany}
              className={`flex items-center gap-1 transition-all ${
                selectedCount === 0 || publishing || tooMany
                  ? 'opacity-50 pointer-events-none'
                  : 'opacity-100 hover:opacity-90'
              }`}
              aria-label={`Publier ${selectedCount} message${selectedCount > 1 ? 's' : ''}`}
            >
              <Upload className="w-4 h-4" />
              <span className="text-sm">
                {publishing
                  ? 'Publication...'
                  : error
                  ? error
                  : tooMany
                  ? `Réduis (${estimatedSlideCount}/6 pages)`
                  : `Publier (${selectedCount})`}
              </span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
