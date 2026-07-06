'use client';
/**
 * RoleSwitcher — sélecteur de rôle du cockpit (Pascal 2026-06-30). Change le
 * périmètre visible via ?role= (rendu serveur) et mémorise le choix en localStorage.
 * Filtre de VUE, pas d'enforcement par compte (binding auth = étape future).
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROLES } from '@/lib/schema/registry';

const LS = 't2m_cockpit_role';

export default function RoleSwitcher({ current, fromUrl }: { current: string; fromUrl: boolean }) {
  const router = useRouter();

  // Au montage : si l'URL n'a pas de rôle mais qu'un choix est mémorisé, le restaurer.
  useEffect(() => {
    if (fromUrl) return;
    try {
      const saved = localStorage.getItem(LS);
      if (saved && saved !== current && ROLES.some((r) => r.key === saved)) {
        router.replace(`/schema/decoupage?role=${saved}`);
      }
    } catch { /* ignore */ }
  }, [fromUrl, current, router]);

  return (
    <select
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        try { localStorage.setItem(LS, v); } catch { /* ignore */ }
        router.push(`/schema/decoupage?role=${v}`);
      }}
      className="bg-white/[0.06] border border-white/15 rounded-lg text-[12.5px] text-white px-2 py-1 outline-none hover:bg-white/[0.1]"
      title="Voir le cockpit dans le périmètre d'un rôle"
    >
      {ROLES.map((r) => (
        <option key={r.key} value={r.key} className="bg-[#16181f]">{r.emoji} {r.name}</option>
      ))}
    </select>
  );
}
