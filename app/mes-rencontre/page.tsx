'use client';

/**
 * Rencontre — miroir du natif (Pascal 2026-07-28, Phase 2). Profil UNIQUE : s'il existe déjà →
 * on ouvre le SALON (/rencontre/[id]), le formulaire ne réapparaît JAMAIS ; sinon → création.
 * (Pas de « liste » ici : 1 seul profil par compte. Cf /api/rencontre/mine.)
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreateRencontreSheet from '@/components/create/CreateRencontreSheet';

export default function MesRencontrePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'loading' | 'create'>('loading');

  useEffect(() => {
    let alive = true;
    fetch('/api/rencontre/mine', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.id) router.replace(`/rencontre/${d.id}`); // profil existant → salon (jamais re-créer)
        else setMode('create');
      })
      .catch(() => { if (alive) setMode('create'); });
    return () => { alive = false; };
  }, [router]);

  if (mode === 'loading') {
    return <div className="min-h-screen bg-white grid place-items-center text-[13px] text-[#9DAAB7]">Chargement…</div>;
  }
  return (
    <div className="min-h-screen bg-white">
      <CreateRencontreSheet open onClose={() => router.back()} />
    </div>
  );
}
