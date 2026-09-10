'use client';

/**
 * « Mes films » — miroir MyMediaScreen('film') natif (Pascal 2026-07-28, Phase 2).
 * Source = `/api/project/mine` (composer_projects, domain='film') : « page 1 du composer :
 * retrouver ses films ». Liste + bouton + qui ouvre le composer film. Tap → l'atelier du film.
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from '@/lib/icons';
import BackButton from '@/components/system/BackButton';
import { filmApi } from '@/lib/film/api';

type Project = { id: string; title: string; domain: string; lifecycle?: string };

// Statut (miroir natif « 💡 Idée »…) : couvre le cycle projet ET le cycle carte, tolérant.
const LIFECYCLE_LABEL: Record<string, string> = {
  idea: '💡 Idée', writing: '✍️ Écriture', preproduction: '🎬 Préproduction', shooting: '🎥 Tournage', postproduction: '✂️ Montage', ready: '✅ Prêt',
  draft: '💡 Idée', rendered: '✅ Prêt', published: '📣 Publié', modified: '✏️ Modifié', error: '⚠️ Erreur',
};

export default function MesFilmsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/project/mine', { cache: 'no-store' });
      const d = await r.json();
      const list: Project[] = Array.isArray(d?.projects) ? d.projects : [];
      setItems(list.filter((p) => (p.domain || 'film') === 'film'));
    } catch { setItems([]); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(pid: string) {
    if (typeof window !== 'undefined' && !window.confirm('Supprimer ce film ? Cette action est définitive.')) return;
    const { ok } = await filmApi.remove(pid);
    if (ok) setItems((l) => l.filter((p) => p.id !== pid));
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 h-14 bg-white border-b border-[#EDF0F4]">
        <BackButton size={20} className="w-9 h-9 grid place-items-center rounded-full text-[#2F343A] hover:text-black transition-colors active:scale-95" />
        <h1 className="text-[17px] font-extrabold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Mes films</h1>
      </header>

      <div className="px-4 pt-3 pb-28">
        {/* Rejoindre un tournage en 2e caméra : scanner le QR affiché par la caméra principale (bouton Multi-cam). */}
        <button type="button" onClick={() => router.push('/scan')}
          className="w-full mb-3 flex items-center justify-center gap-2 rounded-2xl py-3 text-[14.5px] font-extrabold active:scale-[0.99] transition"
          style={{ background: '#F5F3FF', color: '#7C5CFF', border: '1px dashed #C4B5FD' }}>
          📷 Scanner le QR — rejoindre un tournage
        </button>
        {loading ? (
          <p className="text-center text-[#9DAAB7] text-[13px] mt-10">Chargement…</p>
        ) : items.length === 0 ? (
          <div className="text-center mt-16 px-6">
            <div className="text-[40px] mb-2">🎬</div>
            <p className="text-[15px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Aucun film</p>
            <p className="text-[13px] text-[#6A7585] mt-1">Appuie sur + pour créer un film (en projet ou à vendre).</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-2 bg-[#F7F8FA] border border-[#EAECEF] rounded-2xl p-2.5">
                <button type="button" onClick={() => router.push(`/creer/oeuvre/${p.id}/ecriture`)} className="flex items-center gap-3 min-w-0 flex-1 text-left active:scale-[0.99] transition">
                  <div className="w-14 h-14 shrink-0 rounded-xl grid place-items-center text-[22px]" style={{ backgroundColor: 'rgba(124,58,237,0.12)' }}>🎬</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-[#2F343A] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>{p.title || 'Film sans titre'}</div>
                    <div className="text-[12px] text-[#6A7585] truncate">{LIFECYCLE_LABEL[p.lifecycle || 'idea'] || '💡 Idée'}</div>
                  </div>
                </button>
                <button type="button" onClick={() => router.push(`/creer/oeuvre/${p.id}/ecriture`)} aria-label="Ouvrir" className="shrink-0 w-9 h-9 grid place-items-center text-[18px] active:scale-90">✏️</button>
                <button type="button" onClick={() => remove(p.id)} aria-label="Supprimer" className="shrink-0 w-9 h-9 grid place-items-center text-[18px] active:scale-90">🗑️</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" onClick={() => router.push('/creer/oeuvre')} aria-label="Nouveau film" className="fixed bottom-24 right-5 w-14 h-14 rounded-2xl bg-[#FF7F11] text-white grid place-items-center shadow-[0_8px_24px_rgba(255,127,17,0.4)] active:scale-95">
        <Plus className="w-7 h-7" />
      </button>
    </div>
  );
}
