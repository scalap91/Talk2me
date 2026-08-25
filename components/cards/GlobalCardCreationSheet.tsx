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
import { useSearchParams, useRouter } from 'next/navigation';
import { useCardCreationStore } from '@/lib/card-creation-store';
import CardCreationSheet from '@/components/cards/CardCreationSheet';
import BoutiqueComposer from '@/components/boutique/BoutiqueComposer';

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
  const router = useRouter();
  const open = useCardCreationStore((s) => s.open);
  const closeSheet = useCardCreationStore((s) => s.closeSheet);
  const presetMusic = useCardCreationStore((s) => s.presetMusic);
  const presetProduct = useCardCreationStore((s) => s.presetProduct);
  const presetBoutiqueId = useCardCreationStore((s) => s.presetBoutiqueId);
  const boutiqueOpen = useCardCreationStore((s) => s.boutiqueOpen);
  const closeBoutique = useCardCreationStore((s) => s.closeBoutique);
  const openBoutique = useCardCreationStore((s) => s.openBoutique);
  const [boutiqueDraft, setBoutiqueDraft] = useState<{ id: string; initial: unknown } | null>(null);
  const [aiName, setAiName] = useState<string | null>(null);
  const [aiAvatarUrl, setAiAvatarUrl] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  // Reprise d'un BROUILLON Boutique depuis Mes Cards (composer global → événement).
  useEffect(() => {
    const onResume = (e: Event) => {
      const det = (e as CustomEvent).detail as { id?: string; initial?: unknown } | undefined;
      if (det?.id) { setBoutiqueDraft({ id: det.id, initial: det.initial }); openBoutique(); }
    };
    window.addEventListener('ttm:resume-boutique', onResume);
    return () => window.removeEventListener('ttm:resume-boutique', onResume);
  }, [openBoutique]);

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
        presetProduct={presetProduct}
        presetBoutiqueId={presetBoutiqueId}
      />
      <BoutiqueComposer
        open={boutiqueOpen}
        draftId={boutiqueDraft?.id}
        initial={boutiqueDraft?.initial as never}
        onClose={() => { closeBoutique(); setBoutiqueDraft(null); }}
        onCreated={(slug) => {
          closeBoutique();
          setBoutiqueDraft(null);
          router.push(`/${slug}`);
        }}
      />
    </>
  );
}

export default function GlobalCardCreationSheet() {
  return <Inner />;
}
