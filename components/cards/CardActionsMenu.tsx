'use client';

/**
 * Talk2Me #331 (Pascal 2026-06-04) — Menu actions sur chaque Card IA.
 * Doctrine [[talktome-conversation-avant-recherche]] : chaque card vivante
 * est réutilisable. Bouton ⋯ → bottom-sheet :
 *  - Enregistrer (POST /api/cards/save)
 *  - Modifier (TODO MVP : ouvre éditeur — désactivé pour video/image/texte
 *    cards déjà gérées par leur éditeur dédié)
 *  - Envoyer à un ami (modal select friend + comment + POST /api/cards/forward)
 *  - Partager (lien public — désactivé MVP)
 */

import { useState, useEffect, useCallback } from 'react';
import { MoreHorizontal, Bookmark, Edit3, Send, Share2, X } from '@/lib/icons';

export type CardKind =
  | 'youtube'
  | 'place'
  | 'recipe'
  | 'wikipedia'
  | 'weather'
  | 'product'
  | 'web_search'
  | 'video_card'
  | 'image_card'
  | 'texte_card';

interface FriendDto {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

interface CardActionsMenuProps {
  cardKind: CardKind;
  cardData: unknown;
  /** ID du message source (pour traçabilité). */
  sourceMessageId?: string | null;
  /** ID de la conv source. */
  sourceConvId?: string | null;
  /** Titre court pour la liste /saved-cards. */
  title?: string | null;
  /** Désactive l'action "Envoyer à un ami" (ex: si user pas connecté). */
  hideForward?: boolean;
}

export default function CardActionsMenu({
  cardKind,
  cardData,
  sourceMessageId = null,
  sourceConvId = null,
  title = null,
  hideForward = false,
}: CardActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  // Cards conversationnelles (issues de l'IA) → publiables au feed. Les video/image/
  // texte cards SONT déjà des posts feed, pas de re-publication.
  const canPublish = (['youtube', 'place', 'recipe', 'wikipedia', 'weather', 'product', 'web_search'] as CardKind[]).includes(cardKind);

  const handlePublish = useCallback(async () => {
    if (publishing || published) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/cards/publish-to-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_kind: cardKind, card_data: cardData }),
      });
      const data = await res.json();
      if (res.ok && data.ok) { setPublished(true); setToast('Publié au feed 🎉'); }
      else setToast(data.error || 'Erreur');
    } catch {
      setToast('Erreur réseau');
    } finally {
      setPublishing(false);
      setOpen(false);
    }
  }, [publishing, published, cardKind, cardData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/cards/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_kind: cardKind,
          card_data: cardData,
          source_message_id: sourceMessageId,
          source_conv_id: sourceConvId,
          title,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.card?.id) {
        setSavedCardId(data.card.id);
        setToast('Enregistré');
      } else {
        setToast(data.error || 'Erreur');
      }
    } catch {
      setToast('Erreur réseau');
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }, [saving, cardKind, cardData, sourceMessageId, sourceConvId, title]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white/85 hover:text-white flex items-center justify-center backdrop-blur-sm transition-colors"
        aria-label="Actions sur la card"
        data-testid="card-actions-trigger"
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setOpen(false)}
          data-testid="card-actions-sheet"
        >
          <div
            className="w-full max-w-md bg-[var(--t2m-paper)] rounded-t-3xl sm:rounded-3xl border border-[var(--t2m-line)] p-4 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2">
              <span className="text-[13px] uppercase tracking-wider text-[var(--t2m-ink-3)]">
                Actions
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink)]"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            <SheetButton
              icon={<Bookmark size={16} />}
              label={savedCardId ? 'Enregistré' : saving ? 'Enregistrement…' : 'Enregistrer'}
              disabled={saving || !!savedCardId}
              onClick={handleSave}
              testId="card-action-save"
            />

            <SheetButton
              icon={<Edit3 size={16} />}
              label="Modifier"
              disabled
              hint="Bientôt disponible"
              testId="card-action-edit"
            />

            {canPublish && (
              <SheetButton
                icon={<Share2 size={16} />}
                label={published ? 'Publié ✓' : publishing ? 'Publication…' : 'Publier au feed'}
                disabled={publishing || published}
                onClick={handlePublish}
                testId="card-action-publish"
              />
            )}

            {!hideForward && (
              <SheetButton
                icon={<Send size={16} />}
                label="Envoyer à un ami"
                onClick={() => {
                  setOpen(false);
                  setForwardOpen(true);
                }}
                testId="card-action-forward"
              />
            )}

            <SheetButton
              icon={<Share2 size={16} />}
              label="Partager (lien public)"
              disabled
              hint="Bientôt disponible"
              testId="card-action-share"
            />
          </div>
        </div>
      )}

      {forwardOpen && (
        <ForwardModal
          cardKind={cardKind}
          cardData={cardData}
          sourceMessageId={sourceMessageId}
          sourceConvId={sourceConvId}
          title={title}
          savedCardId={savedCardId}
          onSaved={(id) => setSavedCardId(id)}
          onClose={() => setForwardOpen(false)}
          onToast={(msg) => setToast(msg)}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-red-500/90 text-white text-[13px] shadow-lg"
          data-testid="card-actions-toast"
        >
          {toast}
        </div>
      )}
    </>
  );
}

function SheetButton({
  icon,
  label,
  hint,
  onClick,
  disabled,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-[var(--t2m-wash)] text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span className="w-8 h-8 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] flex items-center justify-center text-[var(--t2m-ink-2)] shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] text-[var(--t2m-ink)]">{label}</span>
        {hint && <span className="block text-[11.5px] text-[var(--t2m-ink-3)]">{hint}</span>}
      </span>
    </button>
  );
}

function ForwardModal({
  cardKind,
  cardData,
  sourceMessageId,
  sourceConvId,
  title,
  savedCardId,
  onSaved,
  onClose,
  onToast,
}: {
  cardKind: CardKind;
  cardData: unknown;
  sourceMessageId: string | null;
  sourceConvId: string | null;
  title: string | null;
  savedCardId: string | null;
  onSaved: (id: string) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/friends/list', { cache: 'no-store' });
        const d = await r.json();
        if (Array.isArray(d?.friends)) setFriends(d.friends);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function ensureSavedCard(): Promise<string | null> {
    if (savedCardId) return savedCardId;
    try {
      const res = await fetch('/api/cards/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_kind: cardKind,
          card_data: cardData,
          source_message_id: sourceMessageId,
          source_conv_id: sourceConvId,
          title,
        }),
      });
      const d = await res.json();
      if (res.ok && d.ok && d.card?.id) {
        onSaved(d.card.id);
        return d.card.id;
      }
    } catch {
      // ignore
    }
    return null;
  }

  async function handleSend() {
    if (!selectedId || sending) return;
    setSending(true);
    try {
      // 1) Save the card (ou récupère savedCardId)
      const cardId = await ensureSavedCard();
      if (!cardId) {
        onToast('Échec enregistrement');
        return;
      }
      // 2) Crée (ou récupère) la conv P2P avec l'ami
      const convRes = await fetch('/api/conversations/create-p2p', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_id: selectedId }),
      });
      const convData = await convRes.json();
      if (!convRes.ok || !convData.conversation?.id) {
        onToast(convData.error || 'Conversation introuvable');
        return;
      }
      const toConvId = convData.conversation.id as string;
      // 3) Forward
      const fwRes = await fetch('/api/cards/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          to_conv_id: toConvId,
          comment: comment.trim() || undefined,
        }),
      });
      const fwData = await fwRes.json();
      if (fwRes.ok && fwData.ok) {
        onToast('Envoyé');
        onClose();
      } else {
        onToast(fwData.error || 'Échec envoi');
      }
    } catch {
      onToast('Erreur réseau');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}
      data-testid="forward-modal"
    >
      <div
        className="w-full max-w-md bg-[var(--t2m-paper)] rounded-t-3xl sm:rounded-3xl border border-[var(--t2m-line)] p-4 space-y-3 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-medium text-[var(--t2m-ink)]">Envoyer à un ami</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink)]"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-[var(--t2m-ink-3)]">
            Choisis un ami
          </div>
          {loading ? (
            <div className="text-[13px] text-[var(--t2m-ink-3)] py-2">Chargement…</div>
          ) : friends.length === 0 ? (
            <div className="text-[13px] text-[var(--t2m-ink-3)] py-2">Aucun ami pour le moment.</div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {friends.map((f) => {
                const active = selectedId === f.id;
                return (
                  <button
                    type="button"
                    key={f.id}
                    onClick={() => setSelectedId(f.id)}
                    data-testid={`forward-friend-${f.username}`}
                    className={
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors ' +
                      (active
                        ? 'bg-red-500/15 border border-red-400/40'
                        : 'bg-white border border-[var(--t2m-line)] hover:bg-[var(--t2m-wash)]')
                    }
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500/70 to-red-700/70 flex items-center justify-center text-white text-[13px] font-medium shrink-0">
                      {(f.display_name || f.username || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] text-[var(--t2m-ink)] truncate">
                        {f.display_name || f.username}
                      </div>
                      <div className="text-[11.5px] text-[var(--t2m-ink-3)] truncate">@{f.username}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-[var(--t2m-ink-3)]">
            Commentaire (optionnel)
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Regarde ce que j'ai trouvé…"
            data-testid="forward-comment"
            className="w-full px-3 py-2 rounded-xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[14px] text-[var(--t2m-ink)] placeholder-[var(--t2m-ink-3)] outline-none focus:border-[var(--t2m-primary)] resize-none"
          />
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!selectedId || sending}
          data-testid="forward-send"
          className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bg-red-500/85 hover:bg-red-500 text-white text-[14px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={14} />
          {sending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}
