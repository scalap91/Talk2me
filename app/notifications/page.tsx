'use client';

/**
 * /notifications — centre de notifications (Pascal 2026-07-05).
 * EMPLACEMENT posé : accessible depuis le Profil (« 🔔 Notifications »). La cloche du
 * menu du haut a été retirée pour gagner de la place. La LISTE se remplira quand on
 * branchera les événements (nouveau message, vente « X a acheté », like, go-live…),
 * et un point orange apparaîtra alors sur l'icône Profil de la barre du bas.
 */
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@/lib/icons';

export default function NotificationsPage() {
  const router = useRouter();
  return (
    <div className="min-h-[100svh] bg-[var(--t2m-paper)] text-[var(--t2m-ink)] flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 h-14 px-3 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(env(safe-area-inset-top) + 3.5rem)' }}>
        <button onClick={() => (window.history.length > 1 ? router.back() : router.push('/profile'))} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)] active:scale-95"><ArrowLeft size={18} /></button>
        <h1 className="text-[16px] font-semibold">Notifications</h1>
      </header>

      <div className="flex-1 grid place-items-center px-8 text-center">
        <div>
          <div className="w-16 h-16 rounded-full bg-[var(--t2m-wash)] grid place-items-center mx-auto mb-4 text-[28px]">🔔</div>
          <p className="text-[var(--t2m-ink-2)] text-[15px] font-medium">Rien de neuf pour l’instant</p>
          <p className="text-[var(--t2m-ink-3)] text-[13px] mt-1.5 leading-relaxed">Tes messages, tes ventes et l’activité de ton compte apparaîtront ici.</p>
        </div>
      </div>
    </div>
  );
}
