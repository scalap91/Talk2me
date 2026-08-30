'use client';

/**
 * Talk2Me — Barre de STATUTS façon WhatsApp Actus (Pascal 2026-06-09).
 * Rangée de CARTES en haut d'Amis : fond = miniature de la story, photo de profil
 * (avatar) PAR-DESSUS en haut-gauche, nom en bas. Tap → viewer plein écran.
 * Sur MES stories : bouton supprimer. Statut 'shop' = catalogue de la boutique.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from '@/lib/icons';
import StatusViewer from '@/components/status/StatusViewer';

interface Group { owner_id: string; username: string; display_name: string | null; avatar_url: string | null; preview: string | null; count: number; mine: boolean }
interface ShopItem { id: string; image_url: string; label: string | null; price_cents: number }
interface Status { id: string; kind: string; media_url: string | null; caption: string | null; shop?: { id: string; name: string; public_key: string; items: ShopItem[] } | null }

function letter(name: string | null, username: string) { return (name?.trim() || username || '?')[0]?.toUpperCase() || '?'; }

function Avatar({ url, name, username, ring }: { url: string | null; name: string | null; username: string; ring?: boolean }) {
  const cls = 'w-9 h-9 rounded-full object-cover ' + (ring ? 'border-2 border-[var(--t2m-primary)]' : 'border-2 border-white');
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cls} />
  ) : (
    <span className={cls + ' grid place-items-center bg-gradient-to-br from-[#FF7F11] to-[#C4441C] text-white text-[13px] font-bold'}>{letter(name, username)}</span>
  );
}

export default function StatusBar() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [me, setMe] = useState<{ id: string; avatar_url: string | null; display_name: string | null }>({ id: '', avatar_url: null, display_name: null });
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<{ statuses: Status[]; idx: number; name: string; mine: boolean; username?: string; avatar?: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (coords?: { lat: number; lng: number }) => {
    try {
      const qs = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : '';
      const r = await fetch('/api/status' + qs, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (d?.ok) { setGroups(d.groups || []); if (d.me) setMe(d.me); }
    } catch { /* */ }
  }, []);
  // 1er chargement immédiat (amis), puis re-charge avec la géoloc → stories boutique/plat à 500 m.
  useEffect(() => {
    load();
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => load({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => { /* refus → on garde le feed amis seul */ },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
      );
    }
  }, [load]);

  const mine = groups.find((g) => g.mine);
  const others = groups.filter((g) => !g.mine);

  // Galerie NATIVE du téléphone (sélecteur système) → la photo devient une story.
  const addStatus = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const up = await fetch('/api/upload', { method: 'POST', body: fd }).then((r) => r.json());
      if (up?.url) {
        const kind = f.type.startsWith('video') ? 'video' : 'image';
        await fetch('/api/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, media_url: up.url }) });
        await load();
      }
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const open = async (g: Group) => {
    try {
      const d = await fetch(`/api/status/${g.owner_id}`, { cache: 'no-store' }).then((r) => r.json());
      if (d?.ok && (d.statuses || []).length) setViewer({ statuses: d.statuses, idx: 0, name: g.mine ? 'Mon statut' : (g.display_name || g.username), mine: g.mine, username: g.mine ? undefined : g.username, avatar: g.avatar_url });
    } catch { /* */ }
  };

  const deleteCurrent = async () => {
    if (!viewer) return;
    const s = viewer.statuses[viewer.idx];
    await fetch('/api/status', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) });
    const rest = viewer.statuses.filter((_, i) => i !== viewer.idx);
    if (rest.length === 0) setViewer(null);
    else setViewer({ ...viewer, statuses: rest, idx: Math.min(viewer.idx, rest.length - 1) });
    await load();
  };

  // Carte façon Actus : fond = miniature, avatar par-dessus, nom en bas.
  const Card = ({ bg, avatar, name, username, label, onClick, plus, onAdd }: { bg: string | null; avatar: string | null; name: string | null; username: string; label: string; onClick: () => void; plus?: boolean; onAdd?: () => void }) => (
    <div className="shrink-0 relative w-[88px] h-[132px]">
      <button type="button" onClick={onClick} className={'absolute inset-0 rounded-2xl overflow-hidden ' + (bg ? 'border-2 border-[var(--t2m-primary)]' : 'border-2 border-dashed border-[var(--t2m-line)] bg-[var(--t2m-wash)]')}>
        {bg ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
            <div className="absolute top-2 left-2">
              <Avatar url={avatar} name={name} username={username} ring />
            </div>
            <span className="absolute bottom-1.5 left-2 right-2 text-[11px] font-medium text-white truncate text-left drop-shadow">{label}</span>
          </>
        ) : (
          // Carte VIDE : le cadre reste, avatar centré + bouton +.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <span className="relative inline-block">
              <Avatar url={avatar} name={name} username={username} />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[var(--t2m-primary)] border-2 border-white grid place-items-center"><Plus className="w-2.5 h-2.5 text-white" /></span>
            </span>
            <span className="text-[11px] font-medium text-[var(--t2m-ink-2)] px-1 text-center leading-tight">{busy ? '…' : label}</span>
          </div>
        )}
      </button>
      {/* + permanent pour AJOUTER une autre photo (DANS la carte → non rogné par l'overflow, donc cliquable) */}
      {onAdd && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAdd(); }} aria-label="Ajouter une photo à ma story"
          className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-[var(--t2m-primary)] border-2 border-white shadow-lg grid place-items-center active:scale-95 z-10">
          <Plus className="w-4 h-4 text-white" />
        </button>
      )}
    </div>
  );

  return (
    <div className="border-b border-[var(--t2m-line)]">
      <div className="flex gap-2.5 px-3 py-3 overflow-x-auto">
        {/* Mon statut / Ajouter */}
        <Card
          bg={mine?.preview ?? null}
          avatar={me.avatar_url}
          name={me.display_name}
          username="moi"
          label={mine ? 'Mon statut' : 'Ajouter'}
          plus={!mine}
          onClick={() => (mine ? open(mine) : fileRef.current?.click())}
          onAdd={mine ? () => fileRef.current?.click() : undefined}
        />
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={addStatus} />

        {others.map((g) => (
          <Card key={g.owner_id} bg={g.preview} avatar={g.avatar_url} name={g.display_name} username={g.username} label={g.display_name || g.username} onClick={() => open(g)} />
        ))}
      </div>

      {/* VIEWER plein écran — LE viewer unique (partagé avec le host global des bulles). */}
      {viewer && (
        <StatusViewer
          viewer={viewer}
          onNext={() => setViewer((v) => (v && v.idx < v.statuses.length - 1 ? { ...v, idx: v.idx + 1 } : null))}
          onClose={() => setViewer(null)}
          onDelete={viewer.mine ? deleteCurrent : undefined}
          onOpenProfile={viewer.username ? () => { const uname = viewer.username!; setViewer(null); router.push(`/u/${encodeURIComponent(uname)}`); } : undefined}
        />
      )}
    </div>
  );
}
