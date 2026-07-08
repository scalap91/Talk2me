'use client';

/**
 * /drafts/[id]/edit — Reprise d'un brouillon (Talk2Me #334).
 *
 * Workflow :
 *  1. Fetch /api/drafts/[id]
 *  2. Pré-remplit useCardDraftStore avec le snapshot (image/video) OU
 *     passe initialText/initialVariant (texte)
 *  3. Monte l'éditeur correspondant avec resumeDraftId
 *  4. Au close → save final + retour /drafts
 *  5. Au publish → delete draft + retour /home
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from '@/lib/icons';
import ImageCardEditor from '@/components/cards/editors/ImageCardEditor';
import VideoCardEditor from '@/components/cards/editors/VideoCardEditor';
import TexteCardEditor from '@/components/cards/editors/TexteCardEditor';
import GabaritEditor from '@/components/cards/editors/GabaritEditor';
import { useCardDraftStore, type CardDraft } from '@/lib/card-draft-store';

interface DraftDto {
  id: string;
  type: 'image' | 'video' | 'texte' | 'gabarit';
  draft_data: any;
  thumbnail_url: string | null;
  title: string | null;
  created_at: number;
  updated_at: number;
}

export default function DraftResumePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [draft, setDraft] = useState<DraftDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiName, setAiName] = useState<string | null>(null);
  const [aiAvatarUrl, setAiAvatarUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const resetDraft = useCardDraftStore((s) => s.resetDraft);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [r, me] = await Promise.all([
        fetch(`/api/drafts/${encodeURIComponent(id)}`, { cache: 'no-store' }),
        fetch('/api/auth/me', { cache: 'no-store' }),
      ]);
      if (r.status === 401 || me.status === 401) {
        router.replace('/signin');
        return;
      }
      if (!r.ok) {
        setError('Brouillon introuvable.');
        return;
      }
      const d = await r.json();
      if (!d?.draft) {
        setError('Brouillon introuvable.');
        return;
      }
      setDraft(d.draft);
      if (me.ok) {
        const mj = await me.json();
        setAiName(mj?.user?.ai_name ?? null);
        setAiAvatarUrl(mj?.user?.ai_avatar_url ?? null);
      }
    } catch {
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  // Pré-remplir le store pour image/video AVANT de monter l'éditeur
  useEffect(() => {
    if (!draft) return;
    if (draft.type === 'image' || draft.type === 'video') {
      const data = draft.draft_data as Partial<CardDraft> | null;
      if (!data || typeof data !== 'object') {
        setError('Brouillon corrompu.');
        return;
      }
      // Hydrate le store en passant DIRECTEMENT le draft complet.
      // On évite initDraft qui reset les champs, on set directement.
      useCardDraftStore.setState({
        draft: {
          type: draft.type,
          source_url: data.source_url || '',
          crop: data.crop || 'original',
          filter: data.filter || 'none',
          texts: Array.isArray(data.texts) ? data.texts : [],
          title: data.title || '',
          description: data.description || '',
          hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
          cover_url: data.cover_url || null,
          duration_s: data.duration_s ?? (draft.type === 'video' ? null : undefined),
          trim: data.trim ?? (draft.type === 'video' ? null : undefined),
          cover_time_s: data.cover_time_s ?? (draft.type === 'video' ? 0 : undefined),
        } as CardDraft,
        past: [],
        future: [],
        chat: [],
        aiLoading: false,
      });
    }
    setReady(true);
    return () => {
      resetDraft();
    };
  }, [draft, resetDraft]);

  const handleClose = () => {
    router.push('/drafts');
  };

  const handlePublished = () => {
    router.push('/home');
  };

  if (loading || !ready) {
    return (
      <div className="flex items-center justify-center h-[100svh] bg-[var(--t2m-paper)] text-[var(--t2m-ink-2)]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Chargement du brouillon…
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="flex flex-col items-center justify-center h-[100svh] bg-[var(--t2m-paper)] text-[var(--t2m-ink-2)] gap-3 px-6 text-center">
        <p className="text-[14px]">{error || 'Brouillon introuvable.'}</p>
        <button
          type="button"
          onClick={() => router.push('/drafts')}
          className="px-4 py-2 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink)] text-[13px]"
        >
          Retour aux brouillons
        </button>
      </div>
    );
  }

  if (draft.type === 'image') {
    const sourceUrl =
      (draft.draft_data && (draft.draft_data as any).source_url) || draft.thumbnail_url;
    return (
      <ImageCardEditor
        onClose={handleClose}
        onPublished={handlePublished}
        aiName={aiName}
        aiAvatarUrl={aiAvatarUrl}
        resumeDraftId={draft.id}
        initialPreviewUrl={sourceUrl}
      />
    );
  }

  if (draft.type === 'video') {
    const sourceUrl =
      (draft.draft_data && (draft.draft_data as any).source_url) || draft.thumbnail_url;
    const sizeBytes =
      (draft.draft_data && (draft.draft_data as any).source_size_bytes) || 0;
    return (
      <VideoCardEditor
        onClose={handleClose}
        onPublished={handlePublished}
        aiName={aiName}
        aiAvatarUrl={aiAvatarUrl}
        resumeDraftId={draft.id}
        demoPreviewUrl={sourceUrl}
        demoFileName={draft.title || 'draft.mp4'}
        demoFileSizeBytes={sizeBytes}
      />
    );
  }

  if (draft.type === 'gabarit') {
    const g = (draft.draft_data || {}) as {
      videoUrl?: string | null;
      mediaUrl?: string | null;
      mediaType?: 'image' | 'video' | null;
      caption?: string | null;
      title?: string | null;
      description?: string | null;
      hashtags?: string | null;
      tags?: string | null;
      son?: import('@/lib/embed-hub/types').UnifiedCard | null;
      produit?: import('@/lib/chat-types').ProductCardData | null;
    };
    return (
      <GabaritEditor
        onClose={handleClose}
        onPublished={handlePublished}
        aiName={aiName}
        aiAvatarUrl={aiAvatarUrl}
        resumeDraftId={draft.id}
        initialMediaUrl={g.mediaUrl ?? g.videoUrl ?? null}
        initialMediaType={g.mediaType ?? (g.videoUrl ? 'video' : null)}
        initialTitle={g.title ?? g.caption ?? null}
        initialDescription={g.description ?? null}
        initialHashtags={g.hashtags ?? null}
        initialTags={g.tags ?? null}
        initialSon={g.son ?? null}
        initialProduct={g.produit ?? null}
      />
    );
  }

  // texte
  const tdata = draft.draft_data as { text?: string; bg_variant?: string } | null;
  return (
    <TexteCardEditor
      onClose={handleClose}
      onPublished={handlePublished}
      resumeDraftId={draft.id}
      initialText={tdata?.text || ''}
      initialVariant={tdata?.bg_variant || 'neutral'}
    />
  );
}
