'use client';

/**
 * ProfileDiscoveryClient — le profil « Discovery » façon MAGAZINE (Pascal 2026-08-30).
 * On ré-assemble la vie T2M d'une personne (déjà dans l'espace Card) et on la MET EN SCÈNE par
 * thèmes, avec des dispositions variées (hero / carrousel / mosaïque / étagère / mini-feed). Chaque
 * tuile est rendue par le LECTEUR UNIQUE (FeedMini) ; un clic ouvre le feed SUR ce post.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@/lib/icons';
import FeedMini, { type CardItem } from '@/components/feed/FeedMini';

interface Fiche { id: string; name: string; kind: string; cover: string | null; href: string | null; card_id: string | null; preview_item?: unknown }
interface Photo { id: string; url: string; caption: string | null }
export interface DiscoveryData {
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null; cover: string | null; tagline: string | null; friends_count: number } | null;
  photos: Photo[]; publications: unknown[]; music: unknown[]; works: unknown[]; boutiques: Fiche[]; likes: unknown[];
}

// Reveal au scroll — chaque section « se découvre » en fondu + glissé (esprit aventure).
function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className="transition-all duration-700 ease-out" style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(24px)' }}>{children}</div>;
}

export default function ProfileDiscoveryClient({ data }: { data: DiscoveryData }) {
  const router = useRouter();
  const u = data.user;
  const [rel, setRel] = useState<{ is_self: boolean; is_friend: boolean } | null>(null);
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>(data.photos || []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const up = await (await fetch('/api/upload', { method: 'POST', body: fd })).json();
      if (up?.url) {
        const r = await fetch('/api/users/photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: up.url }) });
        const d = await r.json();
        if (d?.photo) setPhotos((p) => [d.photo, ...p]);
      }
    } finally { setUploading(false); }
  };
  const removePhoto = async (id: string) => {
    setPhotos((p) => p.filter((x) => x.id !== id));
    try { await fetch('/api/users/photos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); } catch { /* */ }
  };

  // Relation viewer↔profil (pour les boutons). Anonyme (crawler SEO) → 401 → CTA « Rejoindre ».
  useEffect(() => {
    if (!u) return;
    fetch(`/api/users/${encodeURIComponent(u.username)}`, { cache: 'no-store' })
      .then((r) => { if (r.status === 401) { setAnon(true); return null; } return r.ok ? r.json() : null; })
      .then((d) => { if (d) setRel({ is_self: !!d.is_self, is_friend: !!d.is_friend }); })
      .catch(() => {});
  }, [u]);

  const openCard = (id?: string | null) => { if (!id) return; try { sessionStorage.setItem('t2m_feed_focus', id); } catch { /* */ } router.push('/home'); };

  const follow = async () => {
    if (!u || busy) return; setBusy(true);
    try { await fetch('/api/friends/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friend_id: u.id }) }); setRel((r) => r ? { ...r, is_friend: true } : r); } finally { setBusy(false); }
  };
  const message = async () => {
    if (!u) return;
    try {
      const r = await fetch('/api/conversations/create-p2p', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friend_id: u.id }) });
      const d = await r.json();
      if (r.ok && d?.conversation?.id) router.push(`/c/${d.conversation.id}`);
    } catch { /* */ }
  };

  if (!u) return <div className="min-h-[100svh] grid place-items-center text-[var(--t2m-ink-2)] text-[14px]">Profil introuvable.</div>;

  const name = u.display_name || u.username;
  const asItems = (arr: unknown[]) => arr as CardItem[];

  // Tuile card (mini-feed) → clic ouvre le feed sur le post.
  const tile = (item: CardItem, key: string) => (
    <button key={key} type="button" onClick={() => openCard((item as { id?: string }).id)} className="block w-full text-left rounded-2xl overflow-hidden border border-[var(--t2m-line)] bg-white active:opacity-90">
      <FeedMini item={item} />
    </button>
  );

  const Section = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <Reveal>
      <section className="mt-8">
        <div className="px-4 mb-3">
          <h2 className="text-[21px] font-extrabold tracking-tight text-[var(--t2m-ink)]" style={{ fontFamily: "'Outfit',sans-serif" }}>{title}</h2>
          {subtitle && <p className="text-[13px] text-[var(--t2m-ink-3)] mt-0.5">{subtitle}</p>}
        </div>
        {children}
      </section>
    </Reveal>
  );

  // Carrousel horizontal (musique / œuvres) — tuiles à largeur fixe.
  const carousel = (items: CardItem[]) => (
    <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1 snap-x">
      {items.map((it, i) => <div key={i} className="shrink-0 w-[190px] max-h-[440px] overflow-hidden rounded-2xl snap-start">{tile(it, `c${i}`)}</div>)}
    </div>
  );
  // Grille mini-feed (publications).
  const grid = (items: CardItem[]) => (
    <div className="px-4 grid grid-cols-2 gap-3 items-start">{items.map((it, i) => tile(it, `g${i}`))}</div>
  );
  // Mosaïque décalée (coups de cœur) — masonry en colonnes.
  const mosaic = (items: CardItem[]) => (
    <div className="px-4 columns-2 gap-3 [column-fill:_balance]">{items.map((it, i) => <div key={i} className="mb-3 break-inside-avoid">{tile(it, `m${i}`)}</div>)}</div>
  );

  return (
    <main className="min-h-[100svh] w-full bg-[var(--t2m-paper)] pb-16">
      {/* Barre retour flottante */}
      <button type="button" onClick={() => router.back()} aria-label="Retour" className="fixed top-3 left-3 z-50 w-10 h-10 rounded-full bg-black/35 text-white grid place-items-center backdrop-blur-md active:scale-95">
        <ArrowLeft size={18} />
      </button>

      {/* HERO — grande photo + avatar + nom + actions (le H1 pour le SEO). */}
      <header className="relative">
        <div className="w-full h-56 overflow-hidden bg-gradient-to-br from-[#FFB86B] to-[#FF7F11]">
          {u.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.cover} alt="" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--t2m-paper)] via-transparent to-black/10" />
        </div>
        <div className="px-4 -mt-12 relative">
          <div className="flex items-end gap-3">
            <div className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-[var(--t2m-paper)] bg-[var(--t2m-wash)] shrink-0 grid place-items-center">
              {u.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={u.avatar_url} alt={name} className="w-full h-full object-cover" />
                : <span className="text-[34px] font-bold text-[var(--t2m-primary)]">{name.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--t2m-ink)] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>{name}</h1>
              <p className="text-[14px] text-[var(--t2m-ink-3)] truncate">@{u.username} · {u.friends_count} ami{u.friends_count > 1 ? 's' : ''}</p>
            </div>
          </div>
          {u.tagline && <p className="text-[14px] text-[var(--t2m-ink-2)] mt-3 leading-relaxed">{u.tagline}</p>}
          {/* Actions */}
          {!rel?.is_self && (
            <div className="flex gap-2.5 mt-4">
              {anon ? (
                <button type="button" onClick={() => router.push('/signin')} className="flex-1 h-11 rounded-full bg-[var(--t2m-primary)] text-white text-[15px] font-semibold active:scale-[0.99]">Rejoindre {name} sur Talk2Me</button>
              ) : (
                <>
                  <button type="button" onClick={follow} disabled={busy || rel?.is_friend} className={`flex-1 h-11 rounded-full text-[15px] font-semibold active:scale-[0.99] ${rel?.is_friend ? 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-3)]' : 'bg-[var(--t2m-primary)] text-white'}`}>{rel?.is_friend ? 'Ami' : 'Suivre'}</button>
                  <button type="button" onClick={message} className="flex-1 h-11 rounded-full border border-[var(--t2m-line)] text-[var(--t2m-ink)] text-[15px] font-semibold active:scale-[0.99]">Message</button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Zone GAMIFICATION (emplacement prêt) — défis, jeux, récompenses à venir (Pascal 2026-08-30). */}
      <Reveal>
        <div className="mx-4 mt-6 rounded-2xl p-4 flex items-center gap-3 bg-gradient-to-r from-[#FF7F11] to-[#FFB86B] text-white shadow-[0_8px_24px_rgba(255,127,17,0.25)]">
          <span className="text-[26px]">🏆</span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-extrabold" style={{ fontFamily: "'Outfit',sans-serif" }}>Défis &amp; récompenses</div>
            <div className="text-[12.5px] text-white/90">Bientôt : relève des défis, joue, gagne des récompenses.</div>
          </div>
          <span className="text-[11px] font-bold bg-white/20 rounded-full px-2.5 py-1">Bientôt</span>
        </div>
      </Reveal>

      {/* PHOTOS PERSO — galerie que le proprio remplit. Humanise le profil (Pascal 2026-08-30). */}
      {(photos.length > 0 || rel?.is_self) && (
        <Section title="Ses photos" subtitle={rel?.is_self ? 'Ta galerie perso — visible sur ton profil' : undefined}>
          <div className="px-4 grid grid-cols-3 gap-2">
            {rel?.is_self && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="aspect-square rounded-2xl border-2 border-dashed border-[var(--t2m-line)] bg-[var(--t2m-wash)] grid place-items-center text-[var(--t2m-ink-3)] active:scale-95 disabled:opacity-50">
                {uploading ? <span className="text-[13px]">Envoi…</span> : <span className="text-[28px] leading-none">＋</span>}
              </button>
            )}
            {photos.map((ph) => (
              <div key={ph.id} className="relative aspect-square rounded-2xl overflow-hidden bg-[var(--t2m-wash)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.url} alt={ph.caption || ''} className="w-full h-full object-cover" />
                {rel?.is_self && <button type="button" onClick={() => removePhoto(ph.id)} aria-label="Supprimer" className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 text-white grid place-items-center text-[13px] backdrop-blur-md active:scale-95">✕</button>}
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={addPhoto} />
        </Section>
      )}

      {/* SECTIONS — chacune sa disposition (carrousel / grille / mosaïque). Rendues si non vides.
          Schéma UNIVERSEL : marche pour une personne comme pour une institution (Pascal 2026-08-30). */}
      {data.music.length > 0 && <Section title="Ce qu’il écoute, là" subtitle="Son ambiance du moment">{carousel(asItems(data.music))}</Section>}
      {data.works.length > 0 && <Section title="Ce qu’il fait vibrer" subtitle="Films · albums · formations">{carousel(asItems(data.works))}</Section>}
      {data.publications.length > 0 && <Section title="Ce qu’il raconte" subtitle="Ses publications">{grid(asItems(data.publications))}</Section>}
      {data.boutiques.length > 0 && (
        <Section title="Ses boutiques & fiches">
          <div className="px-4 grid grid-cols-2 gap-3 items-start">
            {data.boutiques.map((b, i) => b.preview_item
              ? tile(b.preview_item as CardItem, `b${i}`)
              : (
                <button key={`b${i}`} type="button" onClick={() => b.href && router.push(b.href)} className="block w-full text-left rounded-2xl overflow-hidden border border-[var(--t2m-line)] bg-white active:opacity-90">
                  <div className="w-full aspect-[3/4] bg-[var(--t2m-wash)] grid place-items-center overflow-hidden">
                    {b.cover
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={b.cover} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[34px]">🛍️</span>}
                  </div>
                  <div className="px-2.5 py-2 text-[13px] font-semibold text-[var(--t2m-ink)] truncate">{b.name}</div>
                </button>
              ))}
          </div>
        </Section>
      )}
      {data.likes.length > 0 && <Section title="Ses pépites" subtitle="Ce qui le fait vibrer en ce moment">{mosaic(asItems(data.likes))}</Section>}

      {data.music.length === 0 && data.works.length === 0 && data.publications.length === 0 && data.boutiques.length === 0 && data.likes.length === 0 && (
        <div className="text-center text-[var(--t2m-ink-3)] text-[14px] py-16 px-8">Cette personne n’a encore rien publié sur Talk2Me.</div>
      )}
    </main>
  );
}
