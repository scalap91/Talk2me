'use client';

/**
 * VideoMetaSection — métadonnées de la VideoCard (titre / description / hashtags
 * + boutons « générer IA »), extrait de VideoCardEditor (#51 modularisation,
 * Pascal 2026-06-29). AUCUN changement de comportement. Embarque ManualGenButton.
 */
import { useState } from 'react';
import { X, Loader2, Sparkles } from '@/lib/icons';
import { useCardDraftStore } from '@/lib/card-draft-store';

interface Props {
  title: string;
  onTitle: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  hashtags: string[];
  onRemoveHashtag: (h: string) => void;
  onSetHashtags: (arr: string[]) => void;
  newTagInput: string;
  setNewTagInput: (v: string) => void;
  onAddTag: () => void;
}

export default function VideoMetaSection({
  title, onTitle, description, onDescription, hashtags,
  onRemoveHashtag, onSetHashtags, newTagInput, setNewTagInput, onAddTag,
}: Props) {
  return (
    <div className="space-y-2 pt-1">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-white/40 mb-1">Titre</div>
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Titre court"
            maxLength={80}
            className="flex-1 rounded-2xl bg-white/[0.04] border border-white/8 px-4 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-white/20"
          />
          <ManualGenButton field="title" onApply={(val) => typeof val === 'string' && onTitle(val)} />
        </div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-white/40 mb-1">Description</div>
        <div className="flex items-start gap-2">
          <textarea
            value={description}
            onChange={(e) => onDescription(e.target.value)}
            placeholder="Description"
            rows={2}
            maxLength={400}
            className="flex-1 rounded-2xl bg-white/[0.04] border border-white/8 px-4 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-white/20 resize-none"
          />
          <ManualGenButton field="description" onApply={(val) => typeof val === 'string' && onDescription(val)} />
        </div>
        <div className="text-[10px] text-white/30 text-right mt-0.5">{description.length} / 400</div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-white/40 mb-1">Hashtags</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {hashtags.map((h) => (
            <span key={h} className="inline-flex items-center gap-1 bg-white/[0.06] border border-white/10 rounded-full pl-2.5 pr-1 py-0.5 text-[12px] text-white/85">
              #{h}
              <button
                type="button"
                onClick={() => onRemoveHashtag(h)}
                className="w-4 h-4 rounded-full flex items-center justify-center text-white/60 hover:text-white"
                aria-label={`Supprimer #${h}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); onAddTag(); }
            }}
            placeholder="+ hashtag"
            className="w-28 rounded-full bg-white/[0.04] border border-white/8 px-3 py-1 text-[12px] text-white placeholder-white/30 outline-none focus:border-white/20"
          />
          <ManualGenButton
            field="hashtags"
            onApply={(val) => { if (Array.isArray(val)) onSetHashtags(val.filter((x): x is string => typeof x === 'string')); }}
          />
        </div>
      </div>
    </div>
  );
}

/* ManualGenButton — génération IA d'un champ (titre/description/hashtags). */
function ManualGenButton({
  field,
  onApply,
}: {
  field: 'title' | 'description' | 'hashtags';
  onApply: (val: string | string[]) => void;
}) {
  const draft = useCardDraftStore((s) => s.draft);
  const [loading, setLoading] = useState(false);

  const click = async () => {
    if (!draft || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/cards/editor/generate-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          draft: {
            type: draft.type,
            crop: draft.crop,
            filter: draft.filter,
            texts: draft.texts.map((t) => ({ content: t.content, position: t.position })),
            title: draft.title,
            description: draft.description,
            hashtags: draft.hashtags,
          },
          ...(field === 'description' ? { length: 'short' } : {}),
          ...(field === 'hashtags' ? { count: 6 } : {}),
        }),
      });
      const json = await res.json();
      if (res.ok && json?.value !== undefined) onApply(json.value);
    } catch (e) {
      console.error('[ManualGenButton] error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={loading || !draft}
      title="Générer avec l'IA"
      aria-label="Générer avec l'IA"
      className="flex-shrink-0 w-9 h-9 rounded-full bg-red-500/15 border border-red-400/30 text-red-200 hover:bg-red-500/25 flex items-center justify-center disabled:opacity-40"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
    </button>
  );
}
