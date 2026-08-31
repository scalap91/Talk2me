'use client';

/**
 * ProfileDiscoveryClient — « Discovery » = LE LECTEUR d'une personne, EN UNE SEULE PAGE (Pascal 2026-08-30).
 * On ne renvoie plus vers d'autres écrans : tout le contenu vit ICI, rendu par LE LECTEUR UNIQUE
 * (AlignedPostCard) — sa musique et ses vidéos jouent sur place (player YouTube 16:9), ses publications se
 * lisent, sa boutique montre ses articles, ses pages enregistrées et ses coups de cœur défilent, ses photos
 * et sa meilleure vente closent le voyage. Un héro immersif (chaud, orange T2M #FF7F11, zéro violet) ouvre la
 * descente. Le .card reste la source (getProfileDiscovery ré-assemble des FeedItem) ; aucun renderer bricolé.
 * SSR + liens SEO crawlables. Animations coupées si prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@/lib/icons';
import { smartBack } from '@/lib/client/smart-back';
import { deriveCover } from '@/lib/discovery-cover';
import AlignedPostCard from '@/components/feed/AlignedPostCard';
import type { FeedItem } from '@/components/feed/PostFeed';

interface Fiche { id: string; name: string; kind: string; cover: string | null; href: string | null; card_id: string | null; preview_item?: unknown }
interface Photo { id: string; url: string; caption: string | null }
interface BestSeller { id: string; image: string | null; title: string; subtitle: string; href: string | null; price_cents?: number | null; sold?: number; shop_name?: string }
interface Saved { id: string; title: string; kind: string; cover: string | null; cardId: string | null }
export interface DiscoveryData {
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null; cover: string | null; tagline: string | null; friends_count: number } | null;
  photos: Photo[]; publications: unknown[]; music: unknown[]; works: unknown[]; boutiques: Fiche[]; likes: unknown[];
  bestSellers?: BestSeller[];
  saved?: Saved[];
  ai?: { portrait: string | null; captions: Record<string, string> } | null;
}

const EDITORIAL = "var(--font-editorial), 'Playfair Display', Georgia, serif";
const KICKER = "var(--font-kicker), 'Barlow Condensed', system-ui, sans-serif";
const ORANGE = '#FF7F11';

const ariary = (cents?: number | null): string =>
  cents == null ? '' : `${Math.round(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ar`;

function useReducedMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setRm(m.matches);
    const h = () => setRm(m.matches);
    m.addEventListener?.('change', h);
    return () => m.removeEventListener?.('change', h);
  }, []);
  return rm;
}

// Braises chaudes qui montent — ambiance ouverture d'aventure (héro seulement).
function EmberCanvas({ paused }: { paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (paused) return;
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    let raf = 0, w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    const N = Math.max(16, Math.min(34, Math.round(w / 14)));
    const P = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 2.4, s: 0.15 + Math.random() * 0.7, a: 0.12 + Math.random() * 0.5, d: Math.random() * Math.PI * 2 }));
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of P) {
        p.y -= p.s; p.d += 0.02; p.x += Math.sin(p.d) * 0.3;
        if (p.y < -6) { p.y = h + 6; p.x = Math.random() * w; }
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, ${175 + Math.round(p.r * 18)}, 110, ${p.a})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [paused]);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden />;
}

// En-tête de chapitre (numéro + kicker + titre géant + compteur).
function ChapterHead({ n, kicker, title, sub, count }: { n: number; kicker: string; title: string; sub?: string; count?: string }) {
  return (
    <div className="flex items-end gap-3 mb-4">
      <div>
        <div className="flex items-center gap-2 text-white/70">
          <span className="grid place-items-center min-w-6 h-6 px-1.5 rounded-full text-[11px] font-black border border-white/20">{String(n).padStart(2, '0')}</span>
          <span className="text-[11.5px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: KICKER, color: '#FFA23D' }}>{kicker}</span>
        </div>
        <h2 className="text-white font-black leading-none tracking-tight mt-2" style={{ fontFamily: EDITORIAL, fontSize: 30 }}>{title}</h2>
        {sub && <div className="text-white/55 text-[13px] mt-1.5">{sub}</div>}
      </div>
      <div className="flex-1" />
      {count && <div className="text-white/45 text-[13px]" style={{ fontFamily: EDITORIAL, fontWeight: 700 }}>{count}</div>}
    </div>
  );
}

// Rail de vignettes-index : montre le reste d'un chapitre sans empiler des lecteurs plein format. Tap = lecteur.
function CoverRail({ covers, badge, onOpen }: { covers: { id: string; image: string | null; title: string; subtitle: string | null; accent: string }[]; badge: string; onOpen: (id?: string | null) => void }) {
  if (!covers.length) return null;
  return (
    <div className="dz-rail -mx-4 px-4 mt-3">
      {covers.map((c, k) => (
        <button key={`cr${c.id}${k}`} type="button" onClick={() => onOpen(c.id)} className="w-[140px] text-left rounded-2xl overflow-hidden bg-white/[0.05] border border-white/10 active:opacity-90">
          <div className="aspect-square relative">
            {c.image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={c.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
              : <div className="absolute inset-0 grid place-items-center px-3 text-center" style={{ background: `linear-gradient(150deg, ${c.accent}, ${c.accent}CC 70%, #1a1310)` }}><span className="text-white font-bold text-[13px] leading-tight" style={{ fontFamily: EDITORIAL }}>{c.title}</span></div>}
            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/45 backdrop-blur grid place-items-center text-[12px]">{badge}</div>
          </div>
          <div className="p-2.5"><div className="text-[12.5px] font-bold leading-tight line-clamp-2">{c.title}</div></div>
        </button>
      ))}
    </div>
  );
}

// Ligne compacte d'un morceau (chapitre Musique) — pochette + play + titre. Tap = lecteur (le son joue).
function TrackRow({ c, onOpen }: { c: { id: string; image: string | null; title: string; subtitle: string | null; accent: string }; onOpen: (id?: string | null) => void }) {
  return (
    <button type="button" onClick={() => onOpen(c.id)} className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.05] border border-white/10 text-left w-full active:opacity-90">
      <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">
        {c.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={c.image} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full" style={{ background: c.accent }} />}
        <div className="absolute inset-0 grid place-items-center bg-black/25"><span className="text-white text-[16px] drop-shadow">▶</span></div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-white font-bold text-[15px] truncate">{c.title}</div>
        {c.subtitle && <div className="text-white/45 text-[12.5px] truncate mt-0.5">{c.subtitle}</div>}
      </div>
      <span className="text-white/25 text-[18px] mr-1">›</span>
    </button>
  );
}

export default function ProfileDiscoveryClient({ data }: { data: DiscoveryData }) {
  const router = useRouter();
  const u = data.user;
  const rm = useReducedMotion();
  const [rel, setRel] = useState<{ is_self: boolean; is_friend: boolean } | null>(null);
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>(data.photos || []);
  const [uploading, setUploading] = useState(false);
  const [ai, setAi] = useState<{ portrait: string | null; captions: Record<string, string> } | null>(data.ai || null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    let ticking = false;
    const apply = () => {
      ticking = false;
      const max = Math.max(1, el.scrollHeight - el.clientHeight);
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, el.scrollTop / max)})`;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } };
    apply();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

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

  useEffect(() => {
    if (!u) return;
    fetch(`/api/users/${encodeURIComponent(u.username)}`, { cache: 'no-store' })
      .then((r) => { if (r.status === 401) { setAnon(true); return null; } return r.ok ? r.json() : null; })
      .then((d) => { if (d) setRel({ is_self: !!d.is_self, is_friend: !!d.is_friend }); })
      .catch(() => {});
  }, [u]);

  // IA cache-first : récupère le texte (déclenche la génération en fond côté serveur). 1 retry pour la
  // 1ʳᵉ visite (le temps que l'IA réponde). Si rien → repli sur le portrait générique.
  useEffect(() => {
    if (!u) return;
    let alive = true;
    const load = async (): Promise<boolean> => {
      try {
        const r = await fetch(`/api/discovery/ai?u=${encodeURIComponent(u.username)}`, { cache: 'no-store' });
        const d = await r.json();
        if (alive && d?.ai && (d.ai.portrait || Object.keys(d.ai.captions || {}).length)) { setAi(d.ai); return true; }
      } catch { /* repli statique */ }
      return false;
    };
    (async () => { const ok = await load(); if (!ok && alive) setTimeout(() => { if (alive) load(); }, 6000); })();
    return () => { alive = false; };
  }, [u]);

  // Ouvre une card dans le lecteur unique (feed) — pour les vignettes-index (enregistrées / likes).
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

  // Facettes : items de feed. Rythme MAGAZINE (pas un feed sans fin) — la musique en lignes compactes,
  // et par chapitre UN contenu qui joue/se lit en grand (lecteur unique) + le reste en rail (tap = lecteur).
  const music = data.music as unknown as FeedItem[];
  const works = data.works as unknown as FeedItem[];
  const publications = data.publications as unknown as FeedItem[];
  const musicCov = (data.music as unknown[]).map(deriveCover);
  const worksCov = (data.works as unknown[]).map(deriveCover);
  const pubCov = (data.publications as unknown[]).map(deriveCover);
  const likesCovers = (data.likes as unknown[]).map(deriveCover);
  const saved = data.saved || [];
  const boutiques = data.boutiques || [];
  const bestSellers = data.bestSellers || [];

  const genericPortrait = (() => {
    const b: string[] = [];
    if (publications.length) b.push(`${publications.length} publication${publications.length > 1 ? 's' : ''}`);
    if (music.length) b.push(`${music.length} son${music.length > 1 ? 's' : ''}`);
    if (works.length) b.push(`${works.length} vidéo${works.length > 1 ? 's' : ''}`);
    if (boutiques.length) b.push(`${boutiques.length} boutique${boutiques.length > 1 ? 's' : ''}`);
    return b.length ? b.slice(0, 3).join(' · ') : 'Son aventure commence sur Talk2Me.';
  })();
  const portrait = ai?.portrait || genericPortrait;

  const hasAnything = !!(music.length || works.length || publications.length || saved.length || likesCovers.length || boutiques.length || bestSellers.length || photos.length);
  // Numérotation dynamique des chapitres (on saute ceux qui sont vides — jamais de section creuse).
  let n = 0; const num = () => ++n;

  return (
    <div ref={scroller} className="fixed inset-0 h-[100svh] w-full overflow-y-auto overflow-x-hidden bg-[#100c0a] text-white" style={{ scrollBehavior: rm ? 'auto' : 'smooth' }}>
      <style>{`
        @keyframes t2mBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(5px)} }
        @keyframes t2mRise { from{opacity:0; transform:translateY(26px)} to{opacity:1; transform:none} }
        @media (prefers-reduced-motion: no-preference){
          .t2m-bob{animation:t2mBob 1.6s ease-in-out infinite}
          .t2m-rise{animation:t2mRise .9s cubic-bezier(.16,1,.3,1) both}
        }
        .dz-rail{display:flex;gap:12px;overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;padding-bottom:4px}
        .dz-rail::-webkit-scrollbar{display:none}
        .dz-rail>*{scroll-snap-align:start;flex:0 0 auto}
        .dz-card{margin-bottom:16px}
      `}</style>

      {/* Fil d'aventure */}
      <div className="fixed top-0 left-0 right-0 h-[3px] z-[70]" aria-hidden>
        <div ref={barRef} className="h-full origin-left" style={{ transform: 'scaleX(0)', background: 'linear-gradient(90deg,#FFB86B,#FF7F11,#FF5A1F)' }} />
      </div>
      <button type="button" onClick={() => smartBack(router, '/home')} aria-label="Retour" className="fixed top-3 left-3 z-[65] w-10 h-10 rounded-full bg-black/40 text-white grid place-items-center backdrop-blur-md active:scale-95">
        <ArrowLeft size={18} />
      </button>

      {/* ══════ HÉRO ══════ */}
      <section className="relative h-[100svh] overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg,#FFC876 0%,#FF7F11 42%,#C4441C 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 50% at 30% 22%, rgba(255,225,140,.55), transparent 60%), radial-gradient(55% 55% at 80% 58%, rgba(196,68,28,.5), transparent 60%)' }} />
        <EmberCanvas paused={rm} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.12) 0%, transparent 30%, rgba(16,12,10,.55) 78%, #100c0a 100%)' }} />
        <div className="absolute inset-x-0 bottom-0 p-6 pb-14">
          <div className={rm ? '' : 't2m-rise'}>
            <div className="text-white/85 text-[12px] font-bold tracking-[0.24em] uppercase" style={{ fontFamily: KICKER }}>Une découverte</div>
            <h1 className="text-white text-[48px] leading-[0.94] font-black tracking-tight mt-1" style={{ fontFamily: EDITORIAL, textShadow: '0 3px 22px rgba(0,0,0,.3)' }}>{name}</h1>
            <div className="flex items-center gap-2.5 mt-3">
              <div className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-white/70 bg-white/10 grid place-items-center shrink-0">
                {u.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={u.avatar_url} alt={name} className="w-full h-full object-cover" />
                  : <span className="text-[18px] font-bold text-white">{name.charAt(0).toUpperCase()}</span>}
              </div>
              <div className="text-white/90 text-[13.5px]">@{u.username} · {u.friends_count} ami{u.friends_count > 1 ? 's' : ''}{u.tagline ? ` · ${u.tagline}` : ''}</div>
            </div>
            <p className="text-white text-[16px] mt-3.5 max-w-[380px] leading-snug" style={{ fontFamily: EDITORIAL, fontStyle: 'italic', textShadow: '0 1px 8px rgba(0,0,0,.3)' }}>{portrait}</p>
            {!rel?.is_self && (
              <div className="flex gap-2.5 mt-5 max-w-[360px]">
                {anon ? (
                  <button type="button" onClick={() => router.push('/signin')} className="flex-1 h-12 rounded-full bg-white text-[#C4441C] text-[15px] font-bold active:scale-[0.99]">Rejoindre {name}</button>
                ) : (
                  <>
                    <button type="button" onClick={message} className="flex-1 h-12 rounded-full bg-white text-[#C4441C] text-[15px] font-bold active:scale-[0.99]">Message</button>
                    <button type="button" onClick={follow} disabled={busy || rel?.is_friend} className={`flex-1 h-12 rounded-full text-[15px] font-bold active:scale-[0.99] border border-white/70 ${rel?.is_friend ? 'bg-white/20 text-white' : 'text-white'}`}>{rel?.is_friend ? 'Ami' : 'Suivre'}</button>
                  </>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 mt-5 px-4 py-3 rounded-2xl" style={{ background: 'rgba(0,0,0,.18)', border: '1px solid rgba(255,255,255,.22)' }}>
              <span className="text-[20px]">🏆</span>
              <div><div className="text-[13.5px] font-bold text-white">Défis & récompenses</div><div className="text-[12px] text-white/70">Ses badges et sa progression</div></div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/90 text-[11px] font-semibold flex flex-col items-center gap-0.5">
          <span style={{ fontFamily: KICKER, letterSpacing: '0.14em' }}>LE VOYAGE</span>
          <span className={rm ? 'text-[16px] leading-none' : 't2m-bob text-[16px] leading-none'}>⌄</span>
        </div>
      </section>

      {/* ══════ 01 · MUSIQUE (lignes compactes — le son joue au tap) ══════ */}
      {music.length > 0 && (
        <section className="px-4 pt-11 pb-2">
          <ChapterHead n={num()} kicker="Sa musique" title="Sa musique" sub="Classée par écoutes réelles" count={`${music.length} titre${music.length > 1 ? 's' : ''}`} />
          <div className="flex flex-col gap-2.5">
            {musicCov.map((c, k) => <TrackRow key={`m${c.id}${k}`} c={c} onOpen={openCard} />)}
          </div>
        </section>
      )}

      {/* ══════ 02 · VIDÉOS (1 grande qui joue + rail) ══════ */}
      {works.length > 0 && (
        <section className="px-4 pt-11 pb-2">
          <ChapterHead n={num()} kicker="Ses vidéos" title="Ses vidéos" sub="Lecteur 16:9, plein cadre" count={`${works.length} film${works.length > 1 ? 's' : ''}`} />
          <div className="dz-card"><AlignedPostCard item={works[0]} forceSize="full" /></div>
          <CoverRail covers={worksCov.slice(1)} badge="▶" onOpen={openCard} />
        </section>
      )}

      {/* ══════ 03 · PUBLICATIONS (1 lisible + rail) ══════ */}
      {publications.length > 0 && (
        <section className="px-4 pt-11 pb-2">
          <ChapterHead n={num()} kicker="Ses publications" title="Ses publications" sub="Ça se lit ici" count={`${publications.length}`} />
          <div className="dz-card"><AlignedPostCard item={publications[0]} forceSize="full" /></div>
          <CoverRail covers={pubCov.slice(1)} badge="📄" onOpen={openCard} />
        </section>
      )}

      {/* ══════ 04 · PAGES ENREGISTRÉES ══════ */}
      {saved.length > 0 && (
        <section className="px-4 pt-11 pb-2">
          <ChapterHead n={num()} kicker="Pages enregistrées" title="Pages enregistrées" sub="Ce qu'elle garde près d'elle" />
          <div className="dz-rail -mx-4 px-4">
            {saved.map((s, k) => (
              <button key={`s${s.id}${k}`} type="button" onClick={() => openCard(s.cardId)} className="w-[150px] text-left rounded-2xl overflow-hidden bg-white/[0.05] border border-white/10 active:opacity-90">
                <div className="aspect-square relative">
                  {s.cover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 grid place-items-center px-3 text-center" style={{ background: 'linear-gradient(150deg,#2a1c16,#4a2a18 70%,#1a1310)' }}><span className="text-white/80 font-bold text-[14px]" style={{ fontFamily: EDITORIAL }}>{s.title}</span></div>}
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/45 backdrop-blur grid place-items-center text-[12px]">🔖</div>
                </div>
                <div className="p-2.5"><div className="text-[13px] font-bold leading-tight line-clamp-2">{s.title}</div>{s.kind && <div className="text-[11px] text-white/45 mt-1 capitalize">{s.kind.replace(/_/g, ' ')}</div>}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ══════ 05 · COUPS DE CŒUR ══════ */}
      {likesCovers.length > 0 && (
        <section className="px-4 pt-11 pb-2">
          <ChapterHead n={num()} kicker="Ses coups de cœur" title="Ses coups de cœur" sub="Ce qu'elle a aimé, publiquement" />
          <div className="dz-rail -mx-4 px-4">
            {likesCovers.map((c, k) => (
              <button key={`l${c.id}${k}`} type="button" onClick={() => openCard(c.id)} className="w-[150px] text-left rounded-2xl overflow-hidden bg-white/[0.05] border border-white/10 active:opacity-90">
                <div className="aspect-square relative">
                  {c.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 grid place-items-center px-3 text-center" style={{ background: `linear-gradient(150deg, ${c.accent}, ${c.accent}CC 70%, #1a1310)` }}><span className="text-white font-bold text-[14px] leading-tight" style={{ fontFamily: EDITORIAL }}>{c.title}</span></div>}
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/45 backdrop-blur grid place-items-center text-[12px]">❤️</div>
                </div>
                <div className="p-2.5"><div className="text-[13px] font-bold leading-tight line-clamp-2">{c.title}</div>{c.subtitle && <div className="text-[11px] text-white/45 mt-1 line-clamp-1">{c.subtitle}</div>}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ══════ 06 · BOUTIQUE (rendue par le lecteur unique) ══════ */}
      {boutiques.length > 0 && (
        <section className="px-4 pt-11 pb-2">
          <ChapterHead n={num()} kicker="Sa boutique" title="Sa boutique" sub="Ses articles, achat dans l'app" count={boutiques.length > 1 ? `${boutiques.length} boutiques` : undefined} />
          {boutiques.map((b, k) => (
            b.preview_item
              ? <div key={`b${b.id}${k}`} className="dz-card"><AlignedPostCard item={b.preview_item as FeedItem} forceSize="full" /></div>
              : (
                <a key={`b${b.id}${k}`} href={b.href || '#'} onClick={(e) => { if (b.href) { e.preventDefault(); router.push(b.href); } }} className="dz-card flex items-center gap-3 p-3 rounded-2xl bg-white/[0.05] border border-white/10 active:opacity-90">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/10 shrink-0">
                    {b.cover
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={b.cover} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full grid place-items-center text-[22px]">🛍️</div>}
                  </div>
                  <div className="min-w-0 flex-1"><div className="font-bold text-[15px] truncate" style={{ fontFamily: EDITORIAL }}>{b.name}</div><div className="text-[12.5px] text-white/50">Voir la boutique →</div></div>
                </a>
              )
          ))}
        </section>
      )}

      {/* ══════ 07 · SES ARTICLES / MEILLEURES VENTES ══════ */}
      {bestSellers.length > 0 ? (
        <section className="px-4 pt-11 pb-2">
          <ChapterHead n={num()} kicker="Ses articles" title="Meilleures ventes" sub="Ses produits les plus vendus" />
          <div className="grid grid-cols-2 gap-3">
            {bestSellers.map((p, k) => (
              <a key={`bs${p.id}${k}`} href={p.href || '#'} onClick={(e) => { if (p.href) { e.preventDefault(); router.push(p.href); } }} className="rounded-2xl overflow-hidden bg-white/[0.05] border border-white/10 active:opacity-90">
                <div className="aspect-square relative">
                  {p.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 grid place-items-center text-[28px]" style={{ background: 'linear-gradient(150deg,#2a1c16,#4a2a18 70%,#1a1310)' }}>🛍️</div>}
                  {k === 0 && <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-black" style={{ background: '#E8B352', color: '#3a2a08' }}>🏆 N°1</div>}
                </div>
                <div className="p-2.5">
                  <div className="text-[13px] font-semibold leading-tight line-clamp-2 min-h-[34px]">{p.title}</div>
                  <div className="flex items-baseline justify-between mt-1.5">
                    <span className="text-[14.5px] font-black">{ariary(p.price_cents)}</span>
                    {!!p.sold && <span className="text-[11px]" style={{ color: '#37c07a' }}>{p.sold} vendu{p.sold > 1 ? 's' : ''}</span>}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      ) : boutiques.length > 0 ? (
        <section className="px-4 pt-11 pb-2">
          <ChapterHead n={num()} kicker="Ses articles" title="Meilleures ventes" />
          <div className="rounded-2xl p-5 text-center" style={{ background: 'linear-gradient(120deg, rgba(255,127,17,.14), rgba(255,127,17,.05))', border: '1px solid rgba(255,127,17,.28)' }}>
            <div className="text-[34px]">🔥</div>
            <p className="text-white/85 text-[14px] mt-2 leading-relaxed">
              {rel?.is_self ? 'Tes premières ventes s’afficheront ici. Partage ta boutique pour lancer la machine.' : `Aucune vente pour l’instant — sois le premier à commander chez ${name}, ta commande s’affichera ici.`}
            </p>
          </div>
        </section>
      ) : null}

      {/* ══════ 08 · PHOTOS ══════ */}
      {(photos.length > 0 || rel?.is_self) && (
        <section className="px-4 pt-11 pb-2">
          <ChapterHead n={num()} kicker="Ses instants" title="Ses photos" />
          <div className="grid grid-cols-3 gap-2">
            {rel?.is_self && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="aspect-square rounded-2xl border-2 border-dashed border-white/25 bg-white/5 grid place-items-center text-white/70 active:scale-95 disabled:opacity-50">
                {uploading ? <span className="text-[13px]">Envoi…</span> : <span className="text-[28px] leading-none">＋</span>}
              </button>
            )}
            {photos.map((ph) => (
              <div key={ph.id} className="relative aspect-square rounded-2xl overflow-hidden bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.url} alt={ph.caption || ''} className="w-full h-full object-cover" />
                {rel?.is_self && <button type="button" onClick={() => removePhoto(ph.id)} aria-label="Supprimer" className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 text-white grid place-items-center text-[13px] backdrop-blur-md active:scale-95">✕</button>}
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={addPhoto} />
        </section>
      )}

      {/* ══════ FIN DU VOYAGE ══════ */}
      <section className="px-8 pt-14 pb-20 text-center">
        {hasAnything ? (
          <>
            <div className="text-white/45 text-[12px] font-semibold tracking-[0.22em] uppercase" style={{ fontFamily: KICKER, color: '#FFA23D' }}>Fin du voyage</div>
            <p className="text-white/90 text-[20px] mt-3 max-w-[340px] mx-auto leading-snug" style={{ fontFamily: EDITORIAL, fontStyle: 'italic' }}>« Voilà {name}. Sa musique, ses mains, ses goûts — réunis en une seule page. »</p>
            {!rel?.is_self && !anon && (
              <button type="button" onClick={message} className="mt-6 h-12 px-7 rounded-full text-white text-[15px] font-bold active:scale-[0.98]" style={{ background: ORANGE }}>Écrire à {name}</button>
            )}
          </>
        ) : (
          <>
            <div className="text-[42px]">✨</div>
            <div className="text-white font-black text-[26px] mt-2" style={{ fontFamily: EDITORIAL }}>L’aventure commence</div>
            <p className="text-white/70 text-[14px] mt-2 max-w-[300px] mx-auto leading-relaxed">
              {rel?.is_self ? 'Publie ta première carte : elle apparaîtra ici, mise en scène.' : `${name} vient d’arriver sur Talk2Me. Reviens bientôt pour découvrir son univers.`}
            </p>
            {rel?.is_self
              ? <button type="button" onClick={() => router.push('/creer')} className="mt-5 h-11 px-6 rounded-full text-white text-[14px] font-bold active:scale-[0.98]" style={{ background: ORANGE }}>Créer ma première carte</button>
              : !anon && <button type="button" onClick={follow} disabled={busy || rel?.is_friend} className="mt-5 h-11 px-6 rounded-full text-white text-[14px] font-bold active:scale-[0.98]" style={{ background: ORANGE }}>{rel?.is_friend ? 'Vous êtes amis' : `Suivre ${name}`}</button>}
          </>
        )}
      </section>

      {/* PLAN DE LIENS SEO — invisible (sr-only) mais crawlable : la page devient un HUB qui pointe vers TOUS
          les contenus publics de la personne (link graph), ancre = titre réel. Pas de cloaking, pas de PII. */}
      <nav className="sr-only" aria-label={`Contenus de ${name}`}>
        {[...music, ...works, ...publications].map((c: FeedItem, k) => (
          <a key={`seo${c.id}${k}`} href={`/card/${c.id}`}>{(c as { title?: string }).title || 'Card'}</a>
        ))}
        {likesCovers.map((c, k) => <a key={`seol${c.id}${k}`} href={`/card/${c.id}`}>{c.title}</a>)}
        {bestSellers.map((b, k) => b.href ? <a key={`seobs${b.id}${k}`} href={b.href}>{b.title}</a> : null)}
        {boutiques.map((b, k) => b.href ? <a key={`seob${b.id}${k}`} href={b.href}>{b.name}</a> : null)}
      </nav>
    </div>
  );
}
