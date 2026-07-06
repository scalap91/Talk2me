'use client';

/**
 * Talk2Me — Ordinateurs connectés (Pascal 2026-06-26, sécurité). L'user voit les
 * sessions WEB (desktop) liées par QR : IP, date, et peut les déconnecter. Règle
 * « une seule connexion ouverte » appliquée côté serveur. Doctrine
 * [[project_talk2me_qr_web_login]].
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, Loader2, ChevronLeft, LogOut } from '@/lib/icons';

interface WebSession { pub_id: string; ip: string | null; user_agent: string | null; created_at: number; last_seen_at: number | null; current: boolean }

function browserOf(ua: string | null): string {
  if (!ua) return 'Ordinateur';
  if (/edg/i.test(ua)) return 'Edge';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Navigateur';
}
function osOf(ua: string | null): string {
  if (!ua) return '';
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac os|macintosh/i.test(ua)) return 'Mac';
  if (/linux/i.test(ua)) return 'Linux';
  if (/android/i.test(ua)) return 'Android';
  return '';
}
function when(ts: number): string {
  try { return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

export default function AppareilsPage() {
  const router = useRouter();
  const [list, setList] = useState<WebSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/auth/web-sessions', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setList(d.sessions || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const revoke = async (pub: string) => {
    if (busy) return;
    setBusy(pub);
    try {
      await fetch('/api/auth/web-sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pub_id: pub }) });
      load();
    } finally { setBusy(null); }
  };

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-3 border-b border-white/8" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={() => router.push('/profile')} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/80"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold text-white/95">Ordinateurs connectés</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-lg w-full mx-auto">
        <p className="text-[12.5px] text-white/55 leading-relaxed mb-4">
          Les ordinateurs connectés à ton compte via QR. Une seule connexion ouverte à la fois — toute nouvelle connexion remplace l’ancienne. Tu peux déconnecter à distance.
        </p>

        {loading ? (
          <div className="py-16 grid place-items-center text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : list.length === 0 ? (
          <div className="py-14 text-center px-6">
            <Monitor className="w-8 h-8 text-white/25 mx-auto mb-3" strokeWidth={1.6} />
            <p className="text-white/60 text-[14px]">Aucun ordinateur connecté.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {list.map((s) => (
              <div key={s.pub_id} className="bg-white/[0.05] border border-white/10 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-400/25 grid place-items-center text-red-300 shrink-0"><Monitor className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-[14px] font-semibold">
                    {browserOf(s.user_agent)}{osOf(s.user_agent) ? ` · ${osOf(s.user_agent)}` : ''}
                    {s.current && <span className="ml-2 text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-400/25 rounded-full px-1.5 py-0.5">cet appareil</span>}
                  </div>
                  <div className="text-white/55 text-[12px] mt-0.5">IP {s.ip || 'inconnue'} · connecté le {when(s.created_at)}</div>
                </div>
                <button onClick={() => revoke(s.pub_id)} disabled={busy === s.pub_id}
                  className="shrink-0 h-9 px-3 rounded-full bg-white/10 text-white/85 text-[12.5px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                  {busy === s.pub_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Déconnecter
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
