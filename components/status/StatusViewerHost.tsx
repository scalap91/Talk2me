'use client';

/**
 * StatusViewerHost — host GLOBAL du viewer de story (Pascal 2026-08-30). Monté une fois dans le layout.
 * N'importe quelle bulle (UserAvatar) avec un liseré émet `ttm:status:open` {ownerId, username, name,
 * avatar} → on récupère les statuts et on ouvre LE viewer unique (StatusViewer). Convention Insta : la
 * story d'abord, puis le nom/avatar du header mène au Discovery de la personne. Zéro doublon de viewer.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatusViewer, { type ViewerState } from '@/components/status/StatusViewer';

export interface StatusOpenDetail { ownerId: string; username?: string; name?: string; avatar?: string | null }

export default function StatusViewerHost() {
  const router = useRouter();
  const [viewer, setViewer] = useState<ViewerState | null>(null);

  useEffect(() => {
    const onOpen = async (e: Event) => {
      const d = (e as CustomEvent<StatusOpenDetail>).detail;
      if (!d?.ownerId) return;
      try {
        const res = await fetch(`/api/status/${d.ownerId}`, { cache: 'no-store' });
        const j = await res.json();
        if (j?.ok && (j.statuses || []).length) {
          setViewer({ statuses: j.statuses, idx: 0, name: d.name || d.username || '', mine: false, username: d.username, avatar: d.avatar ?? null });
        } else if (d.username) {
          // Pas de story récupérable → on va directement au Discovery (jamais d'écran mort).
          router.push(`/u/${encodeURIComponent(d.username)}`);
        }
      } catch { if (d.username) router.push(`/u/${encodeURIComponent(d.username)}`); }
    };
    window.addEventListener('ttm:status:open', onOpen as EventListener);
    return () => window.removeEventListener('ttm:status:open', onOpen as EventListener);
  }, [router]);

  if (!viewer) return null;
  return (
    <StatusViewer
      viewer={viewer}
      onNext={() => setViewer((v) => (v && v.idx < v.statuses.length - 1 ? { ...v, idx: v.idx + 1 } : null))}
      onClose={() => setViewer(null)}
      onOpenProfile={viewer.username ? () => { const uname = viewer.username!; setViewer(null); router.push(`/u/${encodeURIComponent(uname)}`); } : undefined}
    />
  );
}
