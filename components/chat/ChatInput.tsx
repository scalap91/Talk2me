'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Mic,
  SendHorizontal,
  Image as ImageIcon,
  Video,
  Type,
  Camera,
  Music,
  MapPin,
  File as FileIcon,
  X,
  Loader2,
  Gamepad2,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import VideoCardEditor from '@/components/cards/editors/VideoCardEditor';
import ImageCardEditor from '@/components/cards/editors/ImageCardEditor';
import TexteCardEditor from '@/components/cards/editors/TexteCardEditor';

export interface AttachedMedia {
  url: string;
  type: 'image' | 'video' | 'audio';
  filename?: string | null;
  size?: number | null;
  mime?: string | null;
}

/**
 * Talk2Me #324 v2 (Pascal 2026-06-04) — ChatInput intègre :
 *  - Avatar IA TOUJOURS visible à droite de l'input (entre input et send/mic).
 *    Tap → insère `@<ai_name> ` (ou `@<ai_name> réponds ` si replyTo présent).
 *  - Reply banner (citation du message cité) au-dessus de l'input avec bouton X.
 *  - Submit POST avec quoted_message_id si replyTo.
 *
 * Props rétro-compat : si aiName/aiAvatarUrl/replyTo absent → comporte comme
 * avant (utilisé dans app/page.tsx home agent legacy).
 *
 * Doctrine [[talk2me-ia-personnelle-integree]] section "Raccourci rapide".
 */
interface ReplyTo {
  id: string;
  text: string;
  author_name: string;
}

interface ChatInputProps {
  onSend: (text: string, opts?: { quoted_message_id?: string | null }) => void;
  disabled?: boolean;
  // Talk2Me #324 v2 IA intégrée
  aiName?: string | null;
  aiAvatarUrl?: string | null;
  replyTo?: ReplyTo | null;
  onReplyCancel?: () => void;
  /** Si false, on cache le menu d'attachements / cards (mode P2P focus IA). */
  showAttachMenu?: boolean;
  /**
   * Talk2Me média chat (Pascal 2026-06-04) — handler optionnel pour partager
   * un fichier (image, vidéo, audio). Si absent, options Photo/Vidéo/Audio
   * non affichées dans le menu.
   */
  onSendMedia?: (
    media: AttachedMedia,
    opts?: { caption?: string; quoted_message_id?: string | null }
  ) => Promise<void> | void;
  /**
   * Talk2Me #416 (Pascal 2026-06-05) — handler optionnel "Lancer un jeu".
   * Si fourni, ajoute "Lancer un jeu" dans le menu + (parent gère le call à
   * /api/games/trigger et l'ouverture du board). Si absent, l'option est
   * masquée (rétro-compat). Le callback reçoit le kind choisi.
   */
  onStartGame?: (game_kind: 'chess' | 'dame') => void;
}

type EditorKind = null | 'video' | 'image' | 'texte';

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled = false,
  aiName = null,
  aiAvatarUrl = null,
  replyTo = null,
  onReplyCancel,
  showAttachMenu = true,
  onSendMedia,
  onStartGame,
}) => {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editor, setEditor] = useState<EditorKind>(null);
  // Talk2Me #416 (Pascal 2026-06-05) — submenu "Lancer un jeu"
  const [gameSubmenu, setGameSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Talk2Me média chat (Pascal 2026-06-04) — upload + send
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<{
    kind: 'image' | 'video' | 'audio';
    progress: number; // 0..100
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const triggerPick = (kind: 'image' | 'video' | 'audio') => {
    setMenuOpen(false);
    setUploadError(null);
    const ref =
      kind === 'image' ? imageInputRef : kind === 'video' ? videoInputRef : audioInputRef;
    ref.current?.click();
  };

  const handleFileChosen = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'image' | 'video' | 'audio'
  ) => {
    const file = e.target.files?.[0];
    // reset value pour permettre re-pick du même fichier
    e.target.value = '';
    if (!file) return;
    if (!onSendMedia) return;

    setUploadError(null);
    setUploadState({ kind, progress: 0 });

    try {
      // Upload via XHR pour progress
      const url: string = await new Promise((resolve, reject) => {
        const fd = new FormData();
        fd.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setUploadState({ kind, progress: pct });
          }
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300 && data?.url) {
              resolve(data.url);
            } else if (xhr.status === 413) {
              reject(
                new Error(
                  `Fichier trop lourd (max ${data?.max_mb ?? '?'} Mo pour un ${kind === 'video' ? 'vidéo' : kind === 'audio' ? 'audio' : 'image'})`
                )
              );
            } else if (xhr.status === 415) {
              reject(new Error(`Format non supporté (${data?.mime || file.type})`));
            } else if (xhr.status === 401) {
              reject(new Error('Tu dois être connecté pour partager un fichier'));
            } else {
              reject(new Error(data?.error || `Upload échoué (HTTP ${xhr.status})`));
            }
          } catch (err) {
            reject(err);
          }
        };
        xhr.onerror = () => reject(new Error('Erreur réseau pendant l\'upload'));
        xhr.send(fd);
      });

      const caption = text.trim();
      await onSendMedia(
        {
          url,
          type: kind,
          filename: file.name,
          size: file.size,
          mime: file.type,
        },
        {
          caption: caption || undefined,
          quoted_message_id: replyTo?.id ?? null,
        }
      );
      setText('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload échoué';
      setUploadError(msg);
      console.error('[ChatInput] media upload error', err);
    } finally {
      setUploadState(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length > 0) {
      onSend(text.trim(), { quoted_message_id: replyTo?.id ?? null });
      setText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Fermeture au clic hors menu
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        plusBtnRef.current &&
        !plusBtnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
        setGameSubmenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  // Talk2Me #416 — reset submenu si menu fermé.
  useEffect(() => {
    if (!menuOpen) setGameSubmenu(false);
  }, [menuOpen]);

  const openEditor = (k: EditorKind) => {
    setMenuOpen(false);
    setEditor(k);
  };

  const closeEditor = () => setEditor(null);

  const onPublished = () => {
    setEditor(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('talktome:card-published'));
    }
  };

  /**
   * Talk2Me #324 v2 — Tap avatar IA :
   *   - sans replyTo : insère `@<aiName> ` au début (curseur après)
   *   - avec replyTo : insère `@<aiName> réponds ` au début (curseur après)
   * Si le texte commence déjà par `@<aiName>` on ne duplique pas.
   */
  const handleTapAiAvatar = () => {
    if (!aiName) return;
    const tag = `@${aiName}`;
    const verb = replyTo ? 'réponds ' : '';
    const prefix = `${tag} ${verb}`;
    const lower = text.trimStart().toLowerCase();
    let next: string;
    if (lower.startsWith(tag.toLowerCase())) {
      // Déjà tagué : ne pas dupliquer, juste s'assurer du verbe si replyTo
      next = text;
    } else {
      next = `${prefix}${text.trimStart()}`;
    }
    setText(next);
    // Focus + curseur après le prefix
    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const pos = prefix.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch {
          // ignore
        }
      }
    }, 0);
  };

  const aiInitial = 'T'; // Initiale T2M (Talk2Me)

  return (
    <>
      {/* Reply banner (au-dessus du form) — Talk2Me #324 v2 */}
      {replyTo && (
        <div
          data-testid="reply-banner"
          className="flex items-start gap-2 px-3 py-2 border-t border-white/8 bg-white/[0.04]"
        >
          <div className="w-0.5 self-stretch rounded-full bg-red-400/70 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] uppercase tracking-wider text-red-300/85 font-medium">
              Réponse à {replyTo.author_name}
            </div>
            <div className="text-[12.5px] text-white/65 truncate">
              {replyTo.text}
            </div>
          </div>
          <button
            type="button"
            onClick={onReplyCancel}
            aria-label="Annuler la citation"
            className="p-1 text-white/55 hover:text-white/90 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Upload progress (Talk2Me média chat — Pascal 2026-06-04) */}
      {uploadState && (
        <div
          data-testid="media-upload-progress"
          className="flex items-center gap-2 px-3 py-2 border-t border-white/8 bg-white/[0.04]"
        >
          <Loader2 className="w-3.5 h-3.5 text-red-300 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] text-white/75 mb-1">
              Envoi {uploadState.kind === 'video' ? 'de la vidéo' : uploadState.kind === 'audio' ? 'de l\'audio' : 'de l\'image'}… {uploadState.progress}%
            </div>
            <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-red-700 transition-all"
                style={{ width: `${uploadState.progress}%` }}
              />
            </div>
          </div>
        </div>
      )}
      {uploadError && !uploadState && (
        <div
          data-testid="media-upload-error"
          className="flex items-start gap-2 px-3 py-2 border-t border-rose-500/30 bg-rose-500/[0.08]"
        >
          <div className="flex-1 min-w-0 text-[12.5px] text-rose-200">
            {uploadError}
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            aria-label="Fermer"
            className="p-0.5 text-rose-200/70 hover:text-rose-100 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="relative flex items-center gap-2 px-3 py-3 h-16 border-t border-white/5 bg-background/80 backdrop-blur"
      >
        {/* Menu popup au-dessus du bouton + */}
        <AnimatePresence>
          {menuOpen && showAttachMenu && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="absolute left-3 bottom-[68px] w-[220px] rounded-2xl border border-white/10 bg-[#16161c]/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden z-50"
              role="menu"
              aria-label="Créer une card"
            >
              <button
                type="button"
                onClick={() => openEditor('video')}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-white/85 hover:bg-white/[0.06] transition-colors text-sm"
                role="menuitem"
              >
                <Video className="w-4 h-4 text-red-300/80" />
                <span>Créer VideoCard</span>
              </button>
              <button
                type="button"
                onClick={() => openEditor('image')}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-white/85 hover:bg-white/[0.06] transition-colors text-sm border-t border-white/5"
                role="menuitem"
              >
                <ImageIcon className="w-4 h-4 text-blue-300/80" />
                <span>Créer ImageCard</span>
              </button>
              <button
                type="button"
                onClick={() => openEditor('texte')}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-white/85 hover:bg-white/[0.06] transition-colors text-sm border-t border-white/5"
                role="menuitem"
              >
                <Type className="w-4 h-4 text-emerald-300/80" />
                <span>Créer TexteCard</span>
              </button>
              {onSendMedia && (
                <div className="border-t border-white/5">
                  <div className="px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-white/35 font-medium">
                    Joindre un fichier
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerPick('image')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-white/85 hover:bg-white/[0.06] transition-colors text-sm"
                    role="menuitem"
                    data-testid="attach-image-btn"
                  >
                    <Camera className="w-4 h-4 text-blue-300/80" />
                    <span>Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerPick('video')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-white/85 hover:bg-white/[0.06] transition-colors text-sm border-t border-white/5"
                    role="menuitem"
                    data-testid="attach-video-btn"
                  >
                    <Video className="w-4 h-4 text-red-300/80" />
                    <span>Vidéo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerPick('audio')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-white/85 hover:bg-white/[0.06] transition-colors text-sm border-t border-white/5"
                    role="menuitem"
                    data-testid="attach-audio-btn"
                  >
                    <Music className="w-4 h-4 text-emerald-300/80" />
                    <span>Audio</span>
                  </button>
                </div>
              )}
              {/* Talk2Me #416 (Pascal 2026-06-05) — Lancer un jeu */}
              {onStartGame && !gameSubmenu && (
                <div className="border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setGameSubmenu(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-white/85 hover:bg-white/[0.06] transition-colors text-sm"
                    role="menuitem"
                    data-testid="start-game-btn"
                  >
                    <Gamepad2 className="w-4 h-4 text-amber-300/80" />
                    <span className="flex-1">Lancer un jeu</span>
                    <ChevronRight className="w-4 h-4 text-white/40" />
                  </button>
                </div>
              )}
              {onStartGame && gameSubmenu && (
                <div className="border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setGameSubmenu(false)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-white/55 hover:bg-white/[0.04] text-[12px]"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Retour</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setGameSubmenu(false);
                      onStartGame('chess');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-white/85 hover:bg-white/[0.06] text-sm border-t border-white/5"
                    role="menuitem"
                    data-testid="start-game-chess"
                  >
                    <Gamepad2 className="w-4 h-4 text-amber-300/80" />
                    <span>Échecs</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setGameSubmenu(false);
                      onStartGame('dame');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-white/85 hover:bg-white/[0.06] text-sm border-t border-white/5"
                    role="menuitem"
                    data-testid="start-game-dame"
                  >
                    <Gamepad2 className="w-4 h-4 text-amber-300/80" />
                    <span>Dames</span>
                  </button>
                </div>
              )}
              {onSendMedia && (
                <div className="border-t border-white/5">
                  <div className="px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-white/35 font-medium">
                    Bientôt
                  </div>
                  {[
                    { Icon: FileIcon, label: 'Document' },
                    { Icon: MapPin, label: 'Localisation' },
                  ].map(({ Icon, label }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-white/50 hover:bg-white/[0.04] hover:text-white/70 transition-colors text-sm"
                      role="menuitem"
                      disabled
                      title="Bientôt"
                    >
                      <Icon className="w-4 h-4 text-white/40" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hidden file inputs (Talk2Me média chat — Pascal 2026-06-04) */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileChosen(e, 'image')}
          data-testid="attach-image-input"
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => handleFileChosen(e, 'video')}
          data-testid="attach-video-input"
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => handleFileChosen(e, 'audio')}
          data-testid="attach-audio-input"
        />

        {/* Bouton Plus (gauche) */}
        <button
          ref={plusBtnRef}
          type="button"
          disabled={disabled}
          onClick={() => setMenuOpen((v) => !v)}
          className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur text-white/70 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${
            menuOpen ? 'bg-white/20 text-white' : 'bg-white/10 hover:bg-white/20'
          }`}
          aria-label="Ajouter"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <Plus className={`w-5 h-5 transition-transform ${menuOpen ? 'rotate-45' : ''}`} />
        </button>

        {/* Champ de saisie */}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={replyTo ? `Répondre à ${replyTo.author_name}…` : 'Parle ou écris quelque chose...'}
          disabled={disabled}
          className="flex-1 min-w-0 h-10 px-4 rounded-full bg-white/10 backdrop-blur text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        />

        {/* Avatar IA — Talk2Me #324 v2 : présence permanente de l'IA perso */}
        {aiName && (
          <button
            type="button"
            onClick={handleTapAiAvatar}
            aria-label={`Demander à ${aiName}`}
            title={`Demander à ${aiName}`}
            data-testid="ai-avatar-btn"
            data-ai-name={aiName}
            className="relative shrink-0 w-9 h-9 rounded-full overflow-hidden border border-white/15 hover:border-red-400/60 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400/40"
          >
            {aiAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={aiAvatarUrl}
                alt={aiName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white text-[12px] font-medium"
                style={{
                  background:
                    'radial-gradient(circle at 30% 30%, #ff8d99 0%, #ff3344 45%, #e6253a 75%, #7a1623 100%)',
                }}
                aria-hidden="true"
              >
                {aiInitial}
              </div>
            )}
          </button>
        )}

        {/* Bouton Mic ou Send (droite) */}
        <button
          type="submit"
          disabled={disabled || text.trim().length === 0}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-r from-red-500 to-red-700 text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          aria-label={text.trim().length > 0 ? 'Envoyer' : 'Microphone'}
        >
          {text.trim().length > 0 ? (
            <SendHorizontal className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
      </form>

      {/* Éditeurs full-screen */}
      {editor === 'video' && (
        <VideoCardEditor
          onClose={closeEditor}
          onPublished={onPublished}
          aiName={aiName}
          aiAvatarUrl={aiAvatarUrl}
        />
      )}
      {editor === 'image' && (
        <ImageCardEditor
          onClose={closeEditor}
          onPublished={onPublished}
          aiName={aiName}
          aiAvatarUrl={aiAvatarUrl}
        />
      )}
      {editor === 'texte' && (
        <TexteCardEditor onClose={closeEditor} onPublished={onPublished} />
      )}
    </>
  );
};

export default ChatInput;
