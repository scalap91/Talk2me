'use client';

/**
 * Talk2Me — ADMIN : FILE DE MODÉRATION des signalements (Apple 1.2 « agir <24h »).
 * Consomme /api/admin/moderation (moteur lib/moderation.ts) — la route existait, l'UI manquait
 * (orphelin Audit #60). Deux files : signalements d'UTILISATEURS + de CONTENU. Actions par ligne :
 * Résoudre (avec mesure prise) ou Rejeter. L'âge est affiché pour prioriser le <24h.
 * Gate super-admin hérité de app/admin/layout.tsx.
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ShieldCheck, XCircle, Loader2, Flag, Clock } from '@/lib/icons';

interface UserReport { id: string; reporter_username?: string; reported_username?: string; reported_display?: string; reason: string; description?: string | null; created_at: number }
interface ContentReport { id: string; reporter_username?: string; content_kind: string; content_id: string; reason: string; description?: string | null; created_at: number }

function ageLabel(ts: number): { txt: string; over24h: boolean } {
  const ms = Date.now() - ts;
  const h = ms / 3_600_000;
  const over24h = h >= 24;
  if (h < 1) return { txt: `il y a ${Math.max(1, Math.round(ms / 60000))} min`, over24h };
  if (h < 24) return { txt: `il y a ${Math.round(h)} h`, over24h };
  return { txt: `il y a ${Math.floor(h / 24)} j`, over24h };
}

export default function AdminModerationPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserReport[]>([]);
  const [content, setContent] = useState<ContentReport[]>([]);
  const [counts, setCounts] = useState<{ users: number; content: number }>({ users: 0, content: 0 });
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/moderation', { credentials: 'include', cache: 'no-store' });
      if (r.status === 403) { setForbidden(true); return; }
      const d = await r.json();
      if (d?.ok) { setUsers(d.users || []); setContent(d.content || []); setCounts(d.counts || { users: 0, content: 0 }); }
    } catch { /* */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = useCallback(async (table: 'user' | 'content', id: string, status: 'resolved' | 'dismissed') => {
    let action_taken = '';
    if (status === 'resolved') {
      action_taken = (typeof window !== 'undefined' ? window.prompt('Mesure prise (ex : compte suspendu, contenu retiré) :', '') : '') || '';
    }
    setBusy(id);
    try {
      const r = await fetch('/api/admin/moderation', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, report_id: id, status, action_taken }),
      });
      if (r.ok) {
        if (table === 'user') setUsers((l) => l.filter((x) => x.id !== id));
        else setContent((l) => l.filter((x) => x.id !== id));
        setCounts((c) => ({ ...c, [table === 'user' ? 'users' : 'content']: Math.max(0, c[table === 'user' ? 'users' : 'content'] - 1) }));
      }
    } catch { /* */ } finally { setBusy(null); }
  }, []);

  const Actions = ({ table, id }: { table: 'user' | 'content'; id: string }) => (
    <div className="flex gap-2 shrink-0">
      <button type="button" disabled={busy === id} onClick={() => act(table, id, 'resolved')}
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white text-[12px] font-semibold px-2.5 py-1.5 disabled:opacity-50">
        {busy === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Résoudre
      </button>
      <button type="button" disabled={busy === id} onClick={() => act(table, id, 'dismissed')}
        className="inline-flex items-center gap-1 rounded-lg bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] text-[12px] font-semibold px-2.5 py-1.5 disabled:opacity-50">
        <XCircle className="w-3.5 h-3.5" /> Rejeter
      </button>
    </div>
  );

  const Age = ({ ts }: { ts: number }) => {
    const a = ageLabel(ts);
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${a.over24h ? 'text-red-600' : 'text-[var(--t2m-ink-3)]'}`}>
        <Clock className="w-3 h-3" /> {a.txt}{a.over24h ? ' · >24h' : ''}
      </span>
    );
  };

  if (forbidden) return <div className="p-8 text-center text-[var(--t2m-ink-2)]">Accès réservé aux administrateurs.</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={() => router.push('/home')} className="p-1 -ml-1 text-[var(--t2m-ink-2)]"><ChevronLeft className="w-5 h-5" /></button>
        <h1 className="text-[18px] font-bold text-[var(--t2m-ink)] flex items-center gap-2"><Flag className="w-5 h-5 text-red-600" /> Modération</h1>
        <span className="ml-auto text-[12px] text-[var(--t2m-ink-2)]">{counts.users + counts.content} en attente</span>
      </div>

      {loading ? (
        <div className="py-16 grid place-items-center text-[var(--t2m-ink-3)]"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (users.length === 0 && content.length === 0) ? (
        <div className="py-16 text-center text-[var(--t2m-ink-3)]">Aucun signalement en attente. 🎉</div>
      ) : (
        <div className="flex flex-col gap-6">
          {users.length > 0 && (
            <section>
              <h2 className="text-[13px] font-semibold text-[var(--t2m-ink-2)] mb-2">Utilisateurs signalés ({users.length})</h2>
              <div className="flex flex-col gap-2">
                {users.map((r) => (
                  <div key={r.id} className="rounded-xl border border-[var(--t2m-line)] bg-[var(--t2m-card-bg)] p-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-[var(--t2m-ink)] truncate">@{r.reported_username || r.reported_display || 'inconnu'}</div>
                      <div className="text-[12.5px] text-[var(--t2m-ink-2)]">Motif : <b>{r.reason}</b>{r.description ? ` — ${r.description}` : ''}</div>
                      <div className="mt-1 flex items-center gap-2"><span className="text-[11px] text-[var(--t2m-ink-3)]">par @{r.reporter_username || '?'}</span><Age ts={r.created_at} /></div>
                    </div>
                    <Actions table="user" id={r.id} />
                  </div>
                ))}
              </div>
            </section>
          )}
          {content.length > 0 && (
            <section>
              <h2 className="text-[13px] font-semibold text-[var(--t2m-ink-2)] mb-2">Contenus signalés ({content.length})</h2>
              <div className="flex flex-col gap-2">
                {content.map((r) => (
                  <div key={r.id} className="rounded-xl border border-[var(--t2m-line)] bg-[var(--t2m-card-bg)] p-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-[var(--t2m-ink)]">{r.content_kind} · <span className="font-mono text-[12px] text-[var(--t2m-ink-2)]">{r.content_id.slice(0, 10)}</span></div>
                      <div className="text-[12.5px] text-[var(--t2m-ink-2)]">Motif : <b>{r.reason}</b>{r.description ? ` — ${r.description}` : ''}</div>
                      <div className="mt-1 flex items-center gap-2"><span className="text-[11px] text-[var(--t2m-ink-3)]">par @{r.reporter_username || '?'}</span><Age ts={r.created_at} /></div>
                    </div>
                    <Actions table="content" id={r.id} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
