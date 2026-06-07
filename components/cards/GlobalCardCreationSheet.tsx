'use client';

/**
 * GlobalCardCreationSheet — Wrapper monté dans le RootLayout pour exposer la
 * bottom-sheet "Créer une card" partout dans l'app (déclenchée par le bouton +
 * central du BottomNav via useCardCreationStore).
 *
 * Récupère ai_name/ai_avatar_url du user courant pour les passer aux éditeurs
 * (mode "Assisté par <T2M de X>"). Si user pas connecté → ne rend rien.
 *
 * Talk2Me #334 (Pascal 2026-06-04). Doctrine [[talk2me-card-editor-ia]].
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCardCreationStore } from '@/lib/card-creation-store';
import CardCreationSheet from '@/components/cards/CardCreationSheet';

interface MeResp {
  user: {
    ai_name?: string | null;
    ai_avatar_url?: string | null;
  } | null;
}

function DeepLinkOpener() {
  const openSheet = useCardCreationStore((s) => s.openSheet);
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams?.get('openSheet') === '1') {
      openSheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

function Inner() {
  const open = useCardCreationStore((s) => s.open);
  const closeSheet = useCardCreationStore((s) => s.closeSheet);
  const presetMusic = useCardCreationStore((s) => s.presetMusic);
  const [aiName, setAiName] = useState<string | null>(null);
  const [aiAvatarUrl, setAiAvatarUrl] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!open || fetched) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!alive) return;
        if (r.ok) {
          const d: MeResp = await r.json();
          setAiName(d.user?.ai_name ?? null);
          setAiAvatarUrl(d.user?.ai_avatar_url ?? null);
        }
      } catch {
        // ignore
      } finally {
        if (alive) setFetched(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, fetched]);

  return (
    <>
      <Suspense fallback={null}>
        <DeepLinkOpener />
      </Suspense>
      <CardCreationSheet
        open={open}
        onClose={closeSheet}
        aiName={aiName}
        aiAvatarUrl={aiAvatarUrl}
        presetMusic={presetMusic}
      />
    </>
  );
}

export default function GlobalCardCreationSheet() {
  return <Inner />;
}
