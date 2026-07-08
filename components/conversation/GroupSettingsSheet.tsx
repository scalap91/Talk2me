'use client';

/**
 * Talk2Me — Réglages d'un GROUPE (#groupe, Pascal 2026-06-09).
 * Renommer · liste des membres · ajouter des amis · retirer (créateur) · quitter.
 * Autonome : fetch /api/conversations/[id] + /api/friends/list.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Check, UserPlus, LogOut, Loader2, Pencil } from '@/lib/icons';

interface Member { id: string; username: string; display_name: string | null; avatar_url?: string | null }

function label(m: Member): string {
  return m.display_name?.trim() || '@' + m.username;
}
function initial(m: Member): string {
  return (m.display_name?.trim() || m.username || '?')[0]?.toUpperCase() || '?';
}

export default function GroupSettingsSheet({
  convId,
  meId,
  onClose,
}: {
  convId: string;
  meId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [createdBy, setCreatedBy] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [friends, setFriends] = useState<Member[]>([]);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const isOwner = createdBy === meId;

  const reload = useCallback(async () => {
    const [cRes, fRes] = await Promise.all([
      fetch(`/api/conversations/${convId}`, { cache: 'no-store' }),
      fetch('/api/friends/list', { cache: 'no-store' }),
    ]);
    if (cRes.ok) {
      const d = await cRes.json();
      const c = d.conversation;
      setName(c?.name || 'Groupe');
      setCreatedBy(c?.created_by || '');
      setMembers(c?.participants || []);
    }
    if (fRes.ok) {
      const d = await fRes.json();
      setFriends(d.friends || []);
    }
    setLoading(false);
  }, [convId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveName = async () => {
    setBusy(true);
    await fetch(`/api/conversations/${convId}/rename`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    setEditingName(false);
  };

  const removeMember = async (uid: string) => {
    setBusy(true);
    await fetch(`/api/conversations/${convId}/members`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid }),
    });
    await reload();
    setBusy(false);
  };

  const addSelected = async () => {
    if (toAdd.length === 0) return;
    setBusy(true);
    await fetch(`/api/conversations/${convId}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_ids: toAdd }),
    });
    setToAdd([]);
    setAdding(false);
    await reload();
    setBusy(false);
  };

  const leave = async () => {
    setBusy(true);
    const r = await fetch(`/api/conversations/${convId}/leave`, { method: 'POST' });
    setBusy(false);
    if (r.ok) router.replace('/friends');
  };

  const memberIds = new Set(members.map((m) => m.id));
  const addable = friends.filter((f) => !memberIds.has(f.id));

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-[var(--t2m-paper)] rounded-t-3xl sm:rounded-3xl border-t border-[var(--t2m-line)] shadow-[0_2px_10px_rgba(47,52,58,.05)]" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between px-4 h-14 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]">
          <h2 className="text-[15px] font-semibold text-[var(--t2m-ink)]">Réglages du groupe</h2>
          <button onClick={onClose} className="p-1 text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink)]"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-[var(--t2m-ink-3)]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : (
          <div className="p-4 space-y-5">
            {/* Nom */}
            <div>
              <p className="text-[12px] text-[var(--t2m-ink-3)] mb-1.5">Nom du groupe</p>
              {editingName ? (
                <div className="flex gap-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2 text-[14px] text-[var(--t2m-ink)] outline-none focus:border-[var(--t2m-primary)]" />
                  <button onClick={saveName} disabled={busy} className="px-3 rounded-xl bg-red-600 text-white text-[13px] font-semibold">OK</button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-[var(--t2m-ink)]">{name}</span>
                  <button onClick={() => setEditingName(true)} className="p-1.5 text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink)]"><Pencil className="w-4 h-4" /></button>
                </div>
              )}
            </div>

            {/* Membres */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] text-[var(--t2m-ink-3)]">{members.length} membre{members.length > 1 ? 's' : ''}</p>
                <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-[12px] text-red-600 font-medium">
                  <UserPlus className="w-4 h-4" /> Ajouter
                </button>
              </div>

              {adding && (
                <div className="mb-3 rounded-2xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] p-2 space-y-1 max-h-56 overflow-y-auto">
                  {addable.length === 0 ? (
                    <p className="text-[12px] text-[var(--t2m-ink-3)] text-center py-3">Tous tes amis sont déjà dans le groupe.</p>
                  ) : (
                    addable.map((f) => {
                      const on = toAdd.includes(f.id);
                      return (
                        <button key={f.id} onClick={() => setToAdd((p) => on ? p.filter((x) => x !== f.id) : [...p, f.id])}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-[var(--t2m-ink)] hover:bg-[var(--t2m-wash)]">
                          <Avatar m={f} />
                          <span className="flex-1 text-left text-[13px] truncate">{label(f)}</span>
                          <span className={'w-5 h-5 rounded-full grid place-items-center border ' + (on ? 'bg-red-500 border-red-400 text-white' : 'border-[var(--t2m-ink-3)]')}>
                            {on && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      );
                    })
                  )}
                  {toAdd.length > 0 && (
                    <button onClick={addSelected} disabled={busy} className="w-full mt-1 py-2 rounded-xl bg-red-600 text-white text-[13px] font-semibold">
                      Ajouter {toAdd.length}
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-1">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5 px-1 py-1.5">
                    <Avatar m={m} />
                    <span className="flex-1 text-[14px] truncate text-[var(--t2m-ink)]">{label(m)}{m.id === meId ? ' (moi)' : ''}</span>
                    {m.id === createdBy ? (
                      <span className="text-[10px] uppercase tracking-wide text-red-600">Créateur</span>
                    ) : isOwner ? (
                      <button onClick={() => removeMember(m.id)} disabled={busy} className="p-1.5 text-[var(--t2m-ink-3)] hover:text-rose-500"><X className="w-4 h-4" /></button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {/* Quitter (sauf créateur) */}
            {!isOwner && (
              <button onClick={leave} disabled={busy} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-400/30 text-[14px] font-semibold">
                <LogOut className="w-4 h-4" /> Quitter le groupe
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ m }: { m: Member }) {
  return m.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <span className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500/70 to-red-700/70 grid place-items-center text-white text-[13px] font-bold shrink-0">{initial(m)}</span>
  );
}
