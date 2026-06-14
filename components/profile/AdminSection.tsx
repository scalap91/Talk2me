'use client';

/**
 * Talk2Me — section ADMIN du profil (Pascal 2026-06-10).
 * - Toggle « Mode admin » (déplacé ici pour ne pas décaler le menu du Hub).
 * - Super-admin uniquement : donner des DROITS granulaires à des collaborateurs
 *   (ex : « Remplir la boutique ») — différents des siens.
 * Ne s'affiche que si l'user est admin-capable.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Loader2, UserPlus, Check, ClipboardCheck } from 'lucide-react';

interface Collab { user_id: string; username: string; display_name: string | null; permissions: string[] }

export default function AdminSection() {
  const router = useRouter();
  const [capable, setCapable] = useState(false);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [myPerms, setMyPerms] = useState<string[]>([]);
  const [adminMode, setAdminMode] = useState(false);
  const [available, setAvailable] = useState<{ key: string; label: string }[]>([]);
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [handle, setHandle] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const u = d?.user; if (!u) return;
      setCapable(!!u.is_admin_capable); setSuperAdmin(!!u.is_admin); setMyPerms(Array.isArray(u.permissions) ? u.permissions : []);
      try { setAdminMode(localStorage.getItem('t2m_admin_mode') === '1'); } catch { /* */ }
      if (u.is_admin) loadPerms();
    }).catch(() => {});
  }, []);

  const loadPerms = () => fetch('/api/admin/permissions', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.ok) { setAvailable(d.available || []); setCollabs(d.collaborators || []); } }).catch(() => {});

  const toggleMode = () => setAdminMode((v) => { const n = !v; try { localStorage.setItem('t2m_admin_mode', n ? '1' : '0'); } catch { /* */ } return n; });

  const grant = async () => {
    const perms = Object.keys(picked).filter((k) => picked[k]);
    if (!handle.trim() || perms.length === 0 || busy) return;
    setBusy(true); setMsg('');
    try {
      for (const p of perms) {
        const r = await fetch('/api/admin/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, permission: p, grant: true }) }).then((x) => x.json());
        if (r?.error === 'user_not_found') { setMsg('Utilisateur introuvable.'); setBusy(false); return; }
      }
      setMsg('Droits accordés ✓'); setHandle(''); setPicked({}); await loadPerms();
    } finally { setBusy(false); }
  };

  const revoke = async (userId: string, perm: string, username: string) => {
    await fetch('/api/admin/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: username, permission: perm, grant: false }) }).catch(() => {});
    await loadPerms();
  };

  if (!capable) return null;

  return (
    <div className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.05] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-amber-300" />
        <span className="text-[11px] uppercase tracking-wider text-amber-200/80">Espace admin</span>
      </div>

      {/* Toggle mode admin */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[14px] text-white/90 font-medium">Mode admin</div>
          <div className="text-[12px] text-white/55">Les onglets basculent en gestion (Eat, Shop…).</div>
        </div>
        <button onClick={toggleMode} className={'w-12 h-7 rounded-full transition-colors relative ' + (adminMode ? 'bg-amber-500' : 'bg-white/15')}>
          <span className={'absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ' + (adminMode ? 'left-[1.6rem]' : 'left-0.5')} />
        </button>
      </div>

      {/* Validateur/admin : accès à la file de validation */}
      {myPerms.includes('curation_validateur') && (
        <button onClick={() => router.push('/admin/validation')} className="w-full flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/85">
          <ClipboardCheck className="w-4 h-4 text-amber-300" /> File de validation (fiches à valider)
        </button>
      )}

      {/* Super-admin : donner des droits */}
      {superAdmin && (
        <div className="pt-3 border-t border-white/10 space-y-3">
          <div className="text-[13px] text-white/85 font-medium">Donner des droits à un collaborateur</div>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@pseudo ou ID" className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-amber-400/50" />
          <div className="space-y-1.5">
            {available.map((p) => (
              <button key={p.key} onClick={() => setPicked((s) => ({ ...s, [p.key]: !s[p.key] }))} className="w-full flex items-center gap-2 text-left">
                <span className={'w-5 h-5 rounded-md border grid place-items-center ' + (picked[p.key] ? 'bg-amber-500 border-amber-500' : 'border-white/25')}>{picked[p.key] && <Check className="w-3.5 h-3.5 text-black" />}</span>
                <span className="text-[13px] text-white/85">{p.label}</span>
              </button>
            ))}
          </div>
          <button onClick={grant} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-black text-[13px] font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Accorder
          </button>
          {msg && <p className="text-[12px] text-amber-200">{msg}</p>}

          {collabs.length > 0 && (
            <div className="pt-2 space-y-2">
              <div className="text-[12px] text-white/55">Collaborateurs</div>
              {collabs.map((c) => (
                <div key={c.user_id} className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2">
                  <div className="text-[13px] text-white/90">@{c.username}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {c.permissions.map((p) => (
                      <button key={p} onClick={() => revoke(c.user_id, p, c.username)} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/25">{available.find((a) => a.key === p)?.label || p} ✕</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
