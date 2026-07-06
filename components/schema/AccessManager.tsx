'use client';
/**
 * AccessManager — UI super-admin pour attribuer/retirer les rôles cockpit aux
 * utilisateurs (par @username). Pascal 2026-06-30. Appelle /api/schema/access.
 */
import { useEffect, useState, useCallback } from 'react';

interface Grant { user_id: string; username: string; role: string; created_at: number }
interface RoleOpt { key: string; name: string; emoji: string }

export default function AccessManager() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/schema/access').then((x) => x.json()).catch(() => null);
    if (r) { setGrants(r.grants || []); setRoles(r.roles || []); if (!role && r.roles?.[0]) setRole(r.roles[0].key); }
  }, [role]);

  useEffect(() => { load(); }, [load]);

  const grant = useCallback(async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/schema/access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant', username, role }),
      }).then((x) => x.json());
      if (r.ok) { setMsg(`✅ @${r.username} → ${r.role}`); setUsername(''); load(); }
      else setMsg(`⚠️ ${r.error || 'échec'}`);
    } finally { setBusy(false); }
  }, [username, role, load]);

  const revoke = useCallback(async (userId: string) => {
    setBusy(true);
    try {
      await fetch('/api/schema/access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', userId }),
      });
      load();
    } finally { setBusy(false); }
  }, [load]);

  return (
    <div className="space-y-5">
      {/* Attribuer */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-3">Attribuer un rôle</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="@username" disabled={busy}
            className="bg-white/[0.05] border border-white/12 rounded-lg px-3 py-1.5 text-[13px] outline-none focus:border-white/30"
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}
            className="bg-white/[0.06] border border-white/15 rounded-lg text-[13px] px-2 py-1.5 outline-none">
            {roles.map((r) => <option key={r.key} value={r.key} className="bg-[#16181f]">{r.emoji} {r.name}</option>)}
          </select>
          <button onClick={grant} disabled={busy || !username || !role}
            className="rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 px-3 py-1.5 text-[13px] hover:bg-emerald-500/30 disabled:opacity-40">
            Attribuer
          </button>
          {msg && <span className="text-[12px] text-white/70">{msg}</span>}
        </div>
        <p className="text-[11px] text-white/35 mt-2">Le super-admin (toi) a toujours le rôle « admin » — inconditionnel, non listé ici.</p>
      </section>

      {/* Accès actuels */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-3">Accès attribués ({grants.length})</h2>
        {grants.length === 0 ? (
          <p className="text-[12.5px] text-white/40">Aucun rôle attribué pour l&apos;instant (en dehors du super-admin).</p>
        ) : (
          <div className="space-y-1.5">
            {grants.map((g) => (
              <div key={g.user_id} className="flex items-center justify-between gap-3 border-t border-white/6 pt-1.5 first:border-0 first:pt-0">
                <span className="text-[13px]"><b>@{g.username}</b> <span className="text-white/45">→</span> <code className="text-violet-200/85">{g.role}</code></span>
                <button onClick={() => revoke(g.user_id)} disabled={busy}
                  className="text-[12px] rounded-lg bg-red-500/15 border border-red-400/25 text-red-200/85 px-2.5 py-1 hover:bg-red-500/25 disabled:opacity-40">
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
