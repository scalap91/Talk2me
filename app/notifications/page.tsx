'use client';

/**
 * /notifications — centre de notifications (Pascal 2026-07-05).
 * EMPLACEMENT posé : accessible depuis le Profil (« 🔔 Notifications »). La cloche du
 * menu du haut a été retirée pour gagner de la place. La LISTE se remplira quand on
 * branchera les événements (nouveau message, vente « X a acheté », like, go-live…),
 * et un point orange apparaîtra alors sur l'icône Profil de la barre du bas.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/system/BackButton';

interface Notif { id: string; type: string; title: string; body: string; link: string | null; created_at: number; read_at: number | null }

export default function NotificationsPage() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/notifications', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.notifications) setNotifs(d.notifications); }).catch(() => {}).finally(() => setLoading(false));
    // Ouvrir la page = tout marquer lu.
    fetch('/api/notifications', { method: 'POST' }).catch(() => {});
  }, []);

  const fmt = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="min-h-[100svh] bg-[var(--t2m-paper)] text-[var(--t2m-ink)] flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 h-14 px-3 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(env(safe-area-inset-top) + 3.5rem)' }}>
        <BackButton size={18} className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)] active:scale-95" />
        <h1 className="text-[16px] font-semibold">Notifications</h1>
      </header>

      {loading ? null : notifs.length === 0 ? (
        <div className="flex-1 grid place-items-center px-8 text-center">
          <div>
            <div className="w-16 h-16 rounded-full bg-[var(--t2m-wash)] grid place-items-center mx-auto mb-4 text-[28px]">🔔</div>
            <p className="text-[var(--t2m-ink-2)] text-[15px] font-medium">Rien de neuf pour l’instant</p>
            <p className="text-[var(--t2m-ink-3)] text-[13px] mt-1.5 leading-relaxed">Tes messages, tes ventes et l’activité de ton compte apparaîtront ici.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {notifs.map((n) => (
            <div
              key={n.id}
              onClick={n.link ? () => router.push(n.link as string) : undefined}
              className={`rounded-2xl border border-[var(--t2m-line)] bg-white p-3.5${n.link ? ' cursor-pointer active:scale-[0.99] transition-transform' : ''}`}
              style={n.read_at == null ? { borderColor: 'var(--t2m-primary)' } : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-bold">{n.title}</span>
                <span className="text-[11px] text-[var(--t2m-ink-3)]">{fmt(n.created_at)}</span>
              </div>
              <p className="text-[13px] text-[var(--t2m-ink-2)] mt-1 leading-relaxed">{n.body}</p>
              {n.link && <div className="text-[12px] font-semibold text-[var(--t2m-primary)] mt-1.5">Ouvrir →</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
