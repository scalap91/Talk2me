/**
 * CardAIPanel — Panneau chat IA en MODE ÉDITEUR DE CARD.
 * Doctrine [[talk2me-card-editor-ia]] :
 *  - Conversation TEXTE/voix uniquement focalisée sur la card en cours
 *  - L'IA propose, l'humain applique (auto-apply ops sur le draft store)
 *  - Compétences gelées (gérées côté API)
 */
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Sparkles, Mic } from '@/lib/icons';
import { useCardDraftStore } from '@/lib/card-draft-store';

interface Props {
  aiName: string;
  aiAvatarUrl: string | null;
  /**
   * Talk2Me #341 — Lot 2 N8 : mode actif transmis au serveur via header
   * x-talktome-mode. Par défaut le serveur déduit depuis draft.type ; envoyer
   * le mode explicitement permet le badge UI et l'audit côté serveur.
   */
  mode?: 'card_editor_video' | 'card_editor_image' | 'card_editor_text';
}

interface ServerOp {
  tool: string;
  args: Record<string, unknown>;
  label: string;
  result?: unknown;
}

export default function CardAIPanel({ aiName, aiAvatarUrl, mode }: Props) {
  const draft = useCardDraftStore((s) => s.draft);
  const chat = useCardDraftStore((s) => s.chat);
  const aiLoading = useCardDraftStore((s) => s.aiLoading);
  const setAiLoading = useCardDraftStore((s) => s.setAiLoading);
  const pushChatUser = useCardDraftStore((s) => s.pushChatUser);
  const pushChatAI = useCardDraftStore((s) => s.pushChatAI);
  const setCrop = useCardDraftStore((s) => s.setCrop);
  const setFilter = useCardDraftStore((s) => s.setFilter);
  const addText = useCardDraftStore((s) => s.addText);
  const removeText = useCardDraftStore((s) => s.removeText);
  const updateText = useCardDraftStore((s) => s.updateText);
  const setTitle = useCardDraftStore((s) => s.setTitle);
  const setDescription = useCardDraftStore((s) => s.setDescription);
  const setHashtags = useCardDraftStore((s) => s.setHashtags);
  const setTrim = useCardDraftStore((s) => s.setTrim);
  const clearTrim = useCardDraftStore((s) => s.clearTrim);
  const setCoverTime = useCardDraftStore((s) => s.setCoverTime);

  const [input, setInput] = useState('');
  const [recording, setRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // auto-scroll au bas
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, aiLoading]);

  const applyOps = (ops: ServerOp[]) => {
    if (!draft) return;
    for (const op of ops) {
      switch (op.tool) {
        case 'edit_image_crop': {
          const r = op.args.ratio;
          if (r === 'square' || r === 'vertical' || r === 'horizontal' || r === 'original') {
            setCrop(r);
          }
          break;
        }
        case 'edit_image_filter': {
          const f = op.args.filter;
          if (f === 'auto' || f === 'bright' || f === 'warm' || f === 'cold' || f === 'soft') {
            setFilter(f);
          }
          break;
        }
        case 'edit_image_add_text': {
          const content = typeof op.args.content === 'string' ? op.args.content : '';
          const position = op.args.position === 'top' || op.args.position === 'bottom'
            ? op.args.position
            : 'center';
          if (content) addText(content, position as any);
          break;
        }
        case 'edit_image_remove_text': {
          const id = typeof op.args.text_id === 'string' ? op.args.text_id : '';
          if (id) removeText(id);
          break;
        }
        case 'edit_image_move_text': {
          const id = typeof op.args.text_id === 'string' ? op.args.text_id : '';
          const position = op.args.position === 'top' || op.args.position === 'bottom'
            ? op.args.position
            : 'center';
          if (id) updateText(id, { position: position as any });
          break;
        }
        case 'set_title': {
          const t = typeof op.result === 'string' ? op.result : '';
          if (t) setTitle(t);
          break;
        }
        case 'set_description': {
          const d = typeof op.result === 'string' ? op.result : '';
          if (d) setDescription(d);
          break;
        }
        case 'set_hashtags': {
          if (Array.isArray(op.result)) {
            setHashtags(op.result.filter((x): x is string => typeof x === 'string'));
          }
          break;
        }
        // ----- Vidéo -----
        case 'edit_video_trim': {
          const s = typeof op.args.start_s === 'number' ? op.args.start_s : null;
          const e = typeof op.args.end_s === 'number' ? op.args.end_s : null;
          if (s !== null && e !== null && e > s) setTrim(s, e);
          break;
        }
        case 'edit_video_clear_trim': {
          clearTrim();
          break;
        }
        case 'edit_video_cover': {
          const t = typeof op.args.time_s === 'number' ? op.args.time_s : null;
          if (t !== null) setCoverTime(t);
          break;
        }
        case 'edit_video_add_text': {
          const content = typeof op.args.content === 'string' ? op.args.content : '';
          const position =
            op.args.position === 'top' || op.args.position === 'bottom'
              ? op.args.position
              : 'center';
          const start_s =
            typeof op.args.start_s === 'number' ? op.args.start_s : undefined;
          const end_s =
            typeof op.args.end_s === 'number' ? op.args.end_s : undefined;
          if (content) {
            addText(content, position as any, { start_s, end_s });
          }
          break;
        }
        case 'edit_video_remove_text': {
          const id = typeof op.args.text_id === 'string' ? op.args.text_id : '';
          if (id) removeText(id);
          break;
        }
      }
    }
  };

  const send = async () => {
    const txt = input.trim();
    if (!txt || aiLoading || !draft) return;
    setInput('');
    pushChatUser(txt);
    setAiLoading(true);
    try {
      const recent = chat.slice(-6).map((m) => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.text,
      }));
      const snapshot = {
        type: draft.type,
        crop: draft.crop,
        filter: draft.filter,
        texts: draft.texts.map((t) => ({
          id: t.id,
          content: t.content,
          position: t.position,
          start_s: t.start_s ?? null,
          end_s: t.end_s ?? null,
        })),
        title: draft.title,
        description: draft.description,
        hashtags: draft.hashtags,
        // Vidéo
        duration_s: draft.duration_s ?? null,
        trim: draft.trim ?? null,
        cover_time_s: draft.cover_time_s ?? null,
      };
      // Talk2Me #341 — Lot 2 N8 : header x-talktome-mode = mode courant.
      // Le serveur l'utilise pour logger + cohérence + badge UI.
      const effectiveMode =
        mode ||
        (draft.type === 'video' ? 'card_editor_video' : 'card_editor_image');
      const res = await fetch('/api/cards/editor/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-talktome-mode': effectiveMode,
        },
        body: JSON.stringify({
          message: txt,
          draft: snapshot,
          history: recent,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        pushChatAI(json?.error || 'Erreur IA');
      } else {
        const ops: ServerOp[] = Array.isArray(json?.ops) ? json.ops : [];
        applyOps(ops);
        pushChatAI(
          typeof json?.text === 'string' ? json.text : 'OK',
          ops.map((o) => o.label)
        );
      }
    } catch (e) {
      console.error('[CardAIPanel] send error', e);
      pushChatAI('Connexion impossible. Réessaye.');
    } finally {
      setAiLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Web Speech API (transcription navigateur, best-effort, fallback silencieux).
  const toggleMic = () => {
    const SpeechRecognition =
      (typeof window !== 'undefined' &&
        ((window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition)) ||
      null;
    if (!SpeechRecognition) return;
    if (recording) {
      setRecording(false);
      return;
    }
    try {
      const rec = new SpeechRecognition();
      rec.lang = 'fr-FR';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (ev: any) => {
        const transcript = Array.from(ev.results)
          .map((r: any) => r[0]?.transcript || '')
          .join(' ')
          .trim();
        if (transcript) {
          setInput((cur) => (cur ? cur + ' ' + transcript : transcript));
          inputRef.current?.focus();
        }
      };
      rec.onerror = () => setRecording(false);
      rec.onend = () => setRecording(false);
      rec.start();
      setRecording(true);
    } catch (e) {
      console.warn('[CardAIPanel] speech error', e);
      setRecording(false);
    }
  };

  const aiInitial = (aiName || 'T')[0]?.toUpperCase() || 'T';

  return (
    <div className="flex flex-col bg-white/[0.03] border border-white/8 rounded-3xl overflow-hidden">
      {/* Header panneau IA */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/8">
        <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
          {aiAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={aiAvatarUrl} alt={aiName} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white text-[11px] font-medium"
              style={{
                background:
                  'radial-gradient(circle at 30% 30%, #ff8d99 0%, #ff3344 45%, #e6253a 75%, #7a1623 100%)',
              }}
            >
              {aiInitial}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-white/90 truncate">{aiName}</div>
          <div className="text-[10px] text-white/40 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            Mode éditeur de card
          </div>
        </div>
      </div>

      {/* Conversation */}
      <div
        ref={scrollRef}
        className="flex-1 max-h-[35vh] min-h-[120px] overflow-y-auto px-4 py-3 space-y-3 text-[13px]"
      >
        {chat.length === 0 && (
          <div className="text-white/40 italic">
            Dis-moi ce qu&apos;on fait : <span className="text-white/60">&laquo;&nbsp;recadre en vertical&nbsp;&raquo;</span>, <span className="text-white/60">&laquo;&nbsp;ajoute un texte Soirée Paris en haut&nbsp;&raquo;</span>, <span className="text-white/60">&laquo;&nbsp;génère des hashtags&nbsp;&raquo;</span>…
          </div>
        )}
        {chat.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="bg-white/[0.14] border border-white/15 px-3 py-2 rounded-2xl max-w-[85%] text-white/90">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col items-start gap-1.5 max-w-[90%]">
              <div className="text-white/85 leading-snug">{m.text}</div>
              {m.actions && m.actions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.actions.map((a, i) => (
                    <span
                      key={i}
                      className="text-[10.5px] text-red-200/90 bg-red-500/15 border border-red-400/25 rounded-full px-2 py-0.5"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        )}
        {aiLoading && (
          <div className="flex items-center gap-2 text-white/50 text-[12px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {aiName} prépare la modif…
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/8 px-3 py-2.5 flex items-center gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={aiLoading}
          placeholder={`Parle à ${aiName}…`}
          className="flex-1 bg-white/[0.04] border border-white/8 rounded-full px-4 py-2 text-[13px] text-white placeholder-white/30 outline-none focus:border-white/20"
        />
        <button
          type="button"
          onClick={toggleMic}
          aria-label="Microphone"
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
            recording ? 'bg-red-500/20 text-red-300' : 'bg-white/[0.06] text-white/70 hover:text-white'
          }`}
          title="Dicter (Web Speech)"
        >
          <Mic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={send}
          disabled={aiLoading || input.trim().length === 0}
          aria-label="Envoyer à l'IA"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-r from-red-500 to-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
