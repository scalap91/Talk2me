'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Trash2, Share2, Users, Check } from '@/lib/icons';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { useChatStore } from '@/lib/store/chat';
import { countSlides } from '@/lib/posts/slides';

/** Conversation cible pour le transfert (subset de /api/conversations/list). */
interface ForwardConv {
  id: string;
  kind: 'agent' | 'p2p' | 'group';
  name?: string | null;
  peer?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export default function SelectionFAB() {
  const router = useRouter();
  const selectionMode = useChatStore((state) => state.selectionMode);
  const publishSelection = useChatStore((state) => state.publishSelection);
  const deleteSelection = useChatStore((state) => state.deleteSelection);
  const exitSelection = useChatStore((state) => state.exitSelection);

  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transfert (Lot 2) — sélecteur de conversation cible + état d'envoi.
  const [showForward, setShowForward] = useState(false);
  const [forwardConvs, setForwardConvs] = useState<ForwardConv[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [forwardDone, setForwardDone] = useState(false);

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

  // SOURCE UNIQUE de découpage (même calcul que le serveur + le rendu PostCard).
  const estimatedSlideCount = useMemo(() => countSlides(selectedMessages), [selectedMessages]);

  const MAX_SLIDES = 6;
  const tooMany = estimatedSlideCount > MAX_SLIDES;

  const handleDelete = async () => {
    if (selectedCount === 0 || deleting) return;
    if (!window.confirm(`Supprimer ${selectedCount} message${selectedCount > 1 ? 's' : ''} ?`)) return;
    setDeleting(true);
    try {
      await deleteSelection();
    } finally {
      setDeleting(false);
    }
  };

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

  // === Transfert (Lot 2) ===
  // Ouvre le sélecteur et charge mes conversations (exclut l'IA solo kind='agent').
  const openForward = async () => {
    if (selectedCount === 0) return;
    setShowForward(true);
    setForwardLoading(true);
    try {
      const res = await fetch('/api/conversations/list', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        const list: ForwardConv[] = Array.isArray(d?.conversations) ? d.conversations : [];
        // Exclut la conv IA solo (kind='agent'). PII air-gap : on ne garde que
        // id/kind/name/peer(username/display_name/avatar), jamais talk2me_id/tel.
        setForwardConvs(
          list
            .filter((c) => c.kind !== 'agent')
            .map((c) => ({
              id: c.id,
              kind: c.kind,
              name: c.name ?? null,
              peer: c.peer
                ? {
                    id: c.peer.id,
                    username: c.peer.username,
                    display_name: c.peer.display_name,
                    avatar_url: c.peer.avatar_url,
                  }
                : null,
            }))
        );
      }
    } catch {
      // silencieux — la sheet reste ouverte avec liste vide
    } finally {
      setForwardLoading(false);
    }
  };

  // Envoie CHAQUE message sélectionné (dans l'ordre, séquentiel) vers la conv
  // cible via POST /api/conversations/[id]/messages { text }. Média → on
  // transmet l'URL en fallback texte. Pas de republication publique, pas d'IA.
  const doForward = async (targetId: string) => {
    if (forwarding || selectedCount === 0) return;
    setForwarding(true);
    try {
      for (const m of selectedMessages) {
        const text = (m.content || '').trim() || (m.media?.url || '').trim();
        if (!text) continue; // rien à transférer pour ce message
        await fetch(`/api/conversations/${targetId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }).catch(() => {});
      }
      setShowForward(false);
      exitSelection();
      setForwardDone(true);
      setTimeout(() => setForwardDone(false), 1800);
    } catch {
      setError('Erreur');
      setTimeout(() => setError(null), 2000);
    } finally {
      setForwarding(false);
    }
  };

  const forwardTitle = (c: ForwardConv) =>
    c.kind === 'group' ? c.name || 'Groupe' : c.peer?.display_name || c.peer?.username || 'Conversation';

  return (
    <>
      {/* Toast de confirmation "Transféré ✓" (survit à la fermeture de la FAB). */}
      <AnimatePresence>
        {forwardDone && (
          <motion.div
            key="forward-done"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="fixed bottom-24 left-0 right-0 z-[130] flex justify-center px-4 pointer-events-none"
          >
            <div className="bg-[#2F343A] text-white rounded-full shadow-lg px-5 py-2.5 flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-emerald-300" />
              <span>Transféré</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

              {/* Bouton Supprimer (Talk2Me #22) */}
              <button
                onClick={handleDelete}
                disabled={selectedCount === 0 || deleting}
                className={`flex items-center gap-1 transition-all ${
                  selectedCount === 0 || deleting ? 'opacity-50 pointer-events-none' : 'opacity-100 hover:opacity-90'
                }`}
                aria-label={`Supprimer ${selectedCount} message${selectedCount > 1 ? 's' : ''}`}
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm">{deleting ? 'Suppression…' : `Supprimer (${selectedCount})`}</span>
              </button>

              {/* Séparateur visuel */}
              <div className="w-px h-6 bg-white/30" />

              {/* Bouton Transférer (Lot 2) */}
              <button
                onClick={openForward}
                disabled={selectedCount === 0 || forwarding}
                className={`flex items-center gap-1 transition-all ${
                  selectedCount === 0 || forwarding ? 'opacity-50 pointer-events-none' : 'opacity-100 hover:opacity-90'
                }`}
                aria-label={`Transférer ${selectedCount} message${selectedCount > 1 ? 's' : ''}`}
                data-testid="selection-forward"
              >
                <Share2 className="w-4 h-4" />
                <span className="text-sm">Transférer</span>
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

      {/* Sélecteur de conversation cible (bottom-sheet, style cohérent /friends). */}
      {showForward && (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => !forwarding && setShowForward(false)}
          data-testid="selection-forward-sheet"
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl border-t border-[#E7EAF0] max-h-[70vh] flex flex-col pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-[15px] font-semibold text-[#2F343A]">
                Transférer {selectedCount > 1 ? `${selectedCount} messages` : 'le message'}
              </span>
              <button
                type="button"
                onClick={() => !forwarding && setShowForward(false)}
                aria-label="Fermer"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#9DAAB7] hover:text-[#2F343A] hover:bg-black/[0.05] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {forwardLoading && (
                <div className="text-center text-[#9DAAB7] text-[13px] py-8">Chargement…</div>
              )}
              {!forwardLoading && forwardConvs.length === 0 && (
                <div className="text-center text-[#9DAAB7] text-[13px] py-8 px-4">
                  Aucune conversation où transférer. Ajoute un ami d&apos;abord.
                </div>
              )}
              {!forwardLoading &&
                forwardConvs.map((c) => {
                  const title = forwardTitle(c);
                  const initial = (title || '?').charAt(0).toUpperCase();
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={forwarding}
                      onClick={() => doForward(c.id)}
                      data-testid={`selection-forward-target-${c.id}`}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/[0.04] active:bg-black/[0.04] transition-colors text-left disabled:opacity-50"
                    >
                      {c.kind === 'group' ? (
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-white flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #B7C0CC 0%, #8A96A6 100%)' }}
                        >
                          <Users size={18} />
                        </div>
                      ) : c.peer?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.peer.avatar_url}
                          alt={title}
                          className="w-11 h-11 rounded-full object-cover border border-[#E7EAF0] flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[15px] font-medium flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #FFB347 0%, #FF7F11 100%)' }}
                        >
                          {initial}
                        </div>
                      )}
                      <span className="flex-1 min-w-0 text-[14.5px] font-medium text-[#2F343A] truncate">
                        {title}
                      </span>
                      {forwarding && <span className="text-[12px] text-[#9DAAB7]">…</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
