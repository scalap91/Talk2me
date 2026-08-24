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
import BoutiqueComposer from '@/components/boutique/BoutiqueComposer';

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
  const boutiqueOpen = useCardCreationStore((s) => s.boutiqueOpen);
  const closeBoutique = useCardCreationStore((s) => s.closeBoutique);
  const openBoutique = useCardCreationStore((s) => s.openBoutique);
  const [boutiqueDraft, setBoutiqueDraft] = useState<{ id: string; initial: unknown } | null>(null);

  // Reprise d'un BROUILLON Boutique depuis Mes Cards (composer global → événement).
  useEffect(() => {
    const onResume = (e: Event) => {
      const det = (e as CustomEvent).detail as { id?: string; initial?: unknown } | undefined;
      if (det?.id) { setBoutiqueDraft({ id: det.id, initial: det.initial }); openBoutique(); }
    };
    window.addEventListener('ttm:resume-boutique', onResume);
    return () => window.removeEventListener('ttm:resume-boutique', onResume);
  }, [openBoutique]);

  // Tâche #8 : le doublon CardCreationSheet est retiré → toute demande d'ouverture de la couche
  // de création redirige vers /creer/texte (GabaritEditor), qui lit les presets du store.
  useEffect(() => {
    if (!open) return;
    useCardCreationStore.setState({ open: false }); // ferme la couche SANS effacer les presets
    router.push('/creer/texte');
  }, [open, router]);

  return (
    <>
      <Suspense fallback={null}>
        <DeepLinkOpener />
      </Suspense>
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
