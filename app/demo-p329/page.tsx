'use client';

/**
 * /demo-p329 — page de capture screenshots Phase B Video Editor (#329).
 *
 * Affiche le VideoCardEditor en plein écran avec une vidéo /uploads/ existante.
 * Query params :
 *  - ?step=editor   → éditeur vierge (vidéo chargée, pas d'ops)
 *  - ?step=trim     → trim 5–15s appliqué via store
 *  - ?step=text     → texte BONJOUR en haut + trim
 *
 * Page non listée. Auth requise (middleware).
 */

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import VideoCardEditor from '@/components/cards/editors/VideoCardEditor';
import { useCardDraftStore } from '@/lib/card-draft-store';

const SAMPLE_VIDEO_URL = '/uploads/p329_sample.mp4';
const SAMPLE_FILE_NAME = 'sample-30s.mp4';
const SAMPLE_FILE_SIZE = 1252010;
const SAMPLE_DURATION_S = 30;

function Inner() {
  const params = useSearchParams();
  const step = params.get('step') || 'editor';
  const [ready, setReady] = useState(false);

  const initDraft = useCardDraftStore((s) => s.initDraft);
  const setDuration = useCardDraftStore((s) => s.setDuration);
  const setTrim = useCardDraftStore((s) => s.setTrim);
  const setCoverTime = useCardDraftStore((s) => s.setCoverTime);
  const addText = useCardDraftStore((s) => s.addText);
  const setTitle = useCardDraftStore((s) => s.setTitle);
  const setDescription = useCardDraftStore((s) => s.setDescription);
  const setHashtags = useCardDraftStore((s) => s.setHashtags);
  const resetDraft = useCardDraftStore((s) => s.resetDraft);

  useEffect(() => {
    resetDraft();
    initDraft('video', SAMPLE_VIDEO_URL);
    setDuration(SAMPLE_DURATION_S);

    if (step === 'trim' || step === 'text') {
      setTrim(5, 15);
      setCoverTime(3);
    }
    if (step === 'text') {
      addText('BONJOUR', 'top');
      setTitle('Première vidéo du jour');
      setDescription('Vibes du matin, ça démarre fort.');
      setHashtags(['paris', 'matin', 'vibes', 'bonjour']);
    }
    setReady(true);
    return () => resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!ready) return null;

  return (
    <VideoCardEditor
      onClose={() => {}}
      onPublished={() => {}}
      aiName="T2M de Pascal"
      aiAvatarUrl={null}
      demoPreviewUrl={SAMPLE_VIDEO_URL}
      demoFileName={SAMPLE_FILE_NAME}
      demoFileSizeBytes={SAMPLE_FILE_SIZE}
    />
  );
}

export default function DemoP329() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
