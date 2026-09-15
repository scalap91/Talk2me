'use client';

/**
 * LOCAT👀 — Page CATÉGORIES dédiée (Pascal 2026-09-14). Parité avec l'onglet Catégories du natif :
 * les 10 familles (taxonomie) + leurs sous-catégories. Tap famille/sous-cat → vitrine /locat filtrée.
 * Source unique lib/locat-taxonomy.ts (jamais de liste en dur).
 */
import { useRouter } from 'next/navigation';
import { LOCAT_FAMILIES } from '@/lib/locat-taxonomy';
import { smartBack } from '@/lib/client/smart-back';

export default function LocatCategoriesPage() {
  const router = useRouter();
  const go = (family: string) => router.push('/locat?family=' + encodeURIComponent(family));

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--t2m-paper)] flex flex-col">
      <header className="shrink-0 flex items-center gap-2 h-14 px-3 border-b border-[var(--t2m-line)] bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={() => smartBack(router, '/locat')} aria-label="Retour" className="w-9 h-9 grid place-items-center text-[var(--t2m-ink)]">‹</button>
        <div className="font-extrabold text-[17px] text-[var(--t2m-ink)]" style={{ fontFamily: "'Outfit',sans-serif" }}>Catégories</div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-5">
        {LOCAT_FAMILIES.map((f) => (
          <div key={f.key}>
            <button onClick={() => go(f.label)} className="flex items-center gap-2 mb-2 active:opacity-70">
              <span className="text-[20px]">{f.emoji}</span>
              <span className="font-bold text-[15px] text-[var(--t2m-ink)]">{f.label}</span>
            </button>
            <div className="flex flex-wrap gap-1.5">
              {f.subs.map((s) => (
                <button key={s} onClick={() => go(f.label)} className="px-3 py-1.5 rounded-full text-[12.5px] bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink)] active:scale-[0.98]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
