'use client';
/**
 * SuperCardView — MOTEUR DE RENDU UNIQUE de la SuperCard (Card OS, Pascal 2026-06-30).
 * Une seule card. Le LECTEUR décide : la VARIANTE (format connu) ET les FACETTES affichées
 * (`reveal`). Le moteur n'affiche QUE ce qui est demandé (ex. prix seulement si reveal le
 * contient). Remplace les ~15 composants de cards. Hydratation prix LIVE provider-agnostique.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import type { SuperCard, ReadLevel, CardAction } from '@/lib/cards/supercard';
import CardDevButton from '@/components/dev/CardDevButton';
import Markdown from '@/components/cards/Markdown';

type Variant = 'social' | 'fullscreen' | 'detail' | 'product' | 'eat' | 'listing' | 'result' | 'square' | 'mini' | 'pin' | 'bubble' | 'card' | 'boutique' | 'carousel' | 'duo';

function priceLabel(p?: SuperCard['price']) {
  if (!p?.amount) return null;
  return `${p.amount.toLocaleString('fr')} ${p.currency || ''}`.trim();
}

function ActionBtn({ a, onAction, card }: { a: CardAction; onAction?: (kind: string, card?: SuperCard) => void; card?: SuperCard }) {
  const tone =
    a.kind === 'buy' || a.kind === 'pay' ? 'bg-emerald-500 border-emerald-500 text-white'
    : a.kind === 'reserve' || a.kind === 'order' ? 'bg-sky-500 border-sky-500 text-white'
    : 'bg-black/[0.06] border-black/10 text-neutral-800';
  const inner = <span className={`inline-block rounded-xl border px-4 py-2 text-[13px] font-bold shadow-sm ${tone}`}>{a.label}</span>;
  if (a.url) return <a href={a.url} target="_blank" rel="noreferrer">{inner}</a>;
  // Bouton d'action CÂBLÉ (#74) : sans onAction c'était un bouton mort → Acheter ne faisait rien.
  // On passe LA card (le produit) pour que le lecteur sache quoi acheter (paiement direct).
  return <button type="button" onClick={(e) => { e.stopPropagation(); onAction?.(a.kind, card); }}>{inner}</button>;
}

/** DECK DE SLIDES — le lecteur de formation dans la card : swipe horizontal, titre + points + illustration. */
function SlideDeck({ slides, light }: { slides: NonNullable<SuperCard['slides']>; light: boolean }) {
  return (
    <div className="mt-2">
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {slides.map((s, i) => (
          <div key={i} className={`shrink-0 basis-full snap-center rounded-2xl overflow-hidden border ${light ? 'border-neutral-200 bg-white' : 'border-white/10 bg-white/[0.03]'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {s.image && <img src={s.image} alt="" className="w-full h-44 object-cover" loading="lazy" />}
            <div className="p-4">
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${light ? 'text-violet-500' : 'text-violet-300'}`}>Slide {i + 1}/{slides.length}</div>
              <div className={`text-[16.5px] font-bold mb-2.5 leading-tight ${light ? 'text-neutral-900' : 'text-white'}`}>{s.heading}</div>
              <ul className="space-y-2">
                {s.points.map((p, j) => (
                  <li key={j} className={`flex gap-2 text-[14px] leading-snug ${light ? 'text-neutral-700' : 'text-white/85'}`}>
                    <span className="text-violet-500 shrink-0 mt-0.5">▸</span><span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-1">
          {slides.map((_, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${light ? 'bg-black/20' : 'bg-white/30'}`} />)}
        </div>
      )}
    </div>
  );
}

function SuperCardViewInner({ card, level = 'normal', actions, variant, reveal, theme = 'dark', hideMeta = false, size = 'full', onAction }: {
  card: SuperCard; level?: ReadLevel; actions?: CardAction['kind'][]; variant?: Variant; reveal?: string[]; theme?: 'dark' | 'light'; hideMeta?: boolean; size?: 'full' | 'half'; onAction?: (kind: string, card?: SuperCard) => void;
}) {
  const light = theme === 'light';
  // — Le lecteur décide quelles facettes sont visibles. Vide = tout.
  const show = (f: string) => !reveal || reveal.length === 0 || reveal.includes(f);

  const img = show('media') ? card.images?.[0] : undefined;
  const vidUrl = show('media') ? card.video?.url : undefined;
  const hasVideo = show('media') && !!card.video?.embed;
  const src = show('source') ? card.source?.label : null;
  const acts = show('actions') ? (card.actions || []).filter((a) => !actions || actions.includes(a.kind)) : [];

  // Hydratation LIVE (provider-agnostique).
  const wantsLive = !!(card.price?.live && card.api?.provider && card.api?.ref);
  const [livePrice, setLivePrice] = useState<{ amount: number; currency: string } | null>(null);
  const [openProduct, setOpenProduct] = useState<SuperCard | null>(null); // « entrer dans » un produit du conteneur
  const [showAll, setShowAll] = useState(false); // voir TOUS les produits (au-delà de l'aperçu)
  useEffect(() => {
    if (!wantsLive) return;
    let alive = true;
    const q = `provider=${encodeURIComponent(card.api!.provider!)}&ref=${encodeURIComponent(card.api!.ref!)}`;
    fetch(`/api/cards/hydrate?${q}`).then((r) => r.json())
      .then((d) => { if (alive && d?.ok && typeof d.price === 'number') setLivePrice({ amount: d.price, currency: d.currency || '' }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [wantsLive, card.api?.provider, card.api?.ref]);

  // price/rating/text/place : null si le lecteur ne les demande pas → invisibles partout.
  const price = show('price') ? (livePrice ? `${livePrice.amount.toLocaleString('fr')} ${livePrice.currency}`.trim() : priceLabel(card.price)) : null;
  const isLive = wantsLive && show('price');
  const rating = show('rating') && card.rating?.score ? `★ ${card.rating.score}${card.rating.count ? ` (${card.rating.count})` : ''}` : null;
  const body = show('text') ? card.text?.body : null;
  const address = show('place') ? card.place?.address : null;

  const v: Variant = variant || (level === 'mini' ? 'result' : level === 'full' ? 'social' : 'card');
  const Price = () => price ? <span className="font-semibold text-emerald-300">{price}{isLive && ' 🟢'}</span> : null;
  const Acts = ({ max }: { max?: number }) => acts.length ? (
    <div className="flex flex-wrap gap-1.5 mt-2">{(max ? acts.slice(0, max) : acts).map((a, i) => <ActionBtn key={i} a={a} onAction={onAction} card={card} />)}</div>
  ) : null;
  const Media = ({ cls }: { cls: string }) =>
    hasVideo ? (
      <div style={{ aspectRatio: card.video!.aspect || '16 / 9' }} className="w-full bg-black"><iframe src={card.video!.embed} className="w-full h-full" allow="encrypted-media; picture-in-picture" allowFullScreen /></div>
    ) : vidUrl ? (
      // Fichier vidéo direct (uploads) : lu en <video>, pas en iframe. (Fix feed machine, Pascal 2026-07-02)
      <video src={vidUrl} className={cls} playsInline controls preload="metadata" />
    ) : img ? <img src={img} alt={card.title} className={cls} /> : null;

  // ───────── CARROUSEL : plusieurs cartes dans UN post, qu'on SLIDE (swipe horizontal) ─────────
  if (v === 'carousel' && card.items?.length) {
    return (
      <div className="w-full">
        <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {card.items.map((it, i) => (
            <div key={it.id || i} className="shrink-0 basis-full snap-center">
              <SuperCardViewInner card={it} variant="social" theme={theme} hideMeta />
            </div>
          ))}
        </div>
        {card.items.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {card.items.map((_, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${light ? 'bg-black/25' : 'bg-white/35'}`} />)}
          </div>
        )}
      </div>
    );
  }

  // ───────── CONTENEUR (boutique/playlist/formation) : entête + grille de cards EMBARQUÉES ─────────
  // Le lecteur se rappelle lui-même sur chaque enfant (récursif). Card qui contient des cards.
  if (v === 'boutique' && card.items?.length) {
    return (
      <div className={`w-full rounded-2xl overflow-hidden border ${light ? 'border-[#E7EAF0] bg-white' : 'border-white/10 bg-white/[0.03]'}`}>
        {img && <img src={img} alt={card.title} className="w-full h-36 object-cover" />}
        <div className="p-3">
          <div className={`text-[15px] font-bold ${light ? 'text-[#2F343A]' : 'text-white'}`}>{card.title || 'Boutique'}</div>
          {card.text?.body && <div className={`text-[12.5px] mt-0.5 ${light ? 'text-[#6A7585]' : 'text-white/60'}`}>{card.text.body}</div>}
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            {card.items.slice(0, 6).map((it, i) => (
              <button key={it.id || i} type="button" onClick={(e) => { e.stopPropagation(); setOpenProduct(it); }} className="text-left active:scale-95 transition">
                <SuperCardViewInner card={it} variant="square" theme={theme} hideMeta />
              </button>
            ))}
          </div>
          {card.items.length > 6 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
              className={`mt-2.5 w-full rounded-xl py-2 text-[13px] font-semibold ${light ? 'bg-[#F0F2F5] text-[#2F343A]' : 'bg-white/10 text-white'}`}>
              Voir tout ({card.items.length})
            </button>
          )}
        </div>

        {/* Voir TOUS les produits (au-delà des 6 de l'aperçu) — la boutique complète. */}
        {showAll && typeof document !== 'undefined' && createPortal(
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} onClick={() => setShowAll(false)} style={{ position: 'fixed', inset: 0, zIndex: 2147482000, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', damping: 32, stiffness: 320 }} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, height: '90dvh', overflowY: 'auto', background: light ? '#fff' : '#0b0c10', borderRadius: '18px 18px 0 0', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: light ? '#2F343A' : '#fff' }}>{card.title || 'Boutique'} · {card.items.length} produits</div>
                <button type="button" onClick={() => setShowAll(false)} style={{ background: 'transparent', border: 'none', fontSize: 22, color: light ? '#2F343A' : '#8b93a7', cursor: 'pointer' }}>✕</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {card.items.map((it, i) => (
                  <button key={it.id || i} type="button" onClick={() => setOpenProduct(it)} className="text-left active:scale-95 transition">
                    <SuperCardViewInner card={it} variant="square" theme={theme} hideMeta />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>, document.body)}

        {/* « Entrer dans » un produit : détail + Acheter + inspecter (même lecteur, variant detail). */}
        {openProduct && typeof document !== 'undefined' && createPortal(
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} onClick={() => setOpenProduct(null)} style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', damping: 32, stiffness: 320 }} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '88dvh', overflowY: 'auto', background: light ? '#fff' : '#0b0c10', borderRadius: '18px 18px 0 0', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setOpenProduct(null)} style={{ background: 'transparent', border: 'none', fontSize: 22, color: light ? '#2F343A' : '#8b93a7', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ position: 'relative' }}>
                <SuperCardViewInner card={openProduct} variant="detail" theme={theme} onAction={onAction} />
                {openProduct.id && <CardDevButton cardId={openProduct.id} className="absolute right-1.5 top-1.5 z-40" />}
              </div>
            </motion.div>
          </motion.div>, document.body)}
      </div>
    );
  }

  // ───────── FULLSCREEN (feed immersif : média plein cadre + contenu en bas) ─────────
  // La barre sociale (♥/💬/↗) et l'auteur sont posés par le LECTEUR autour, pas ici.
  if (v === 'fullscreen') {
    return (
      <div className="relative h-full w-full bg-black overflow-hidden">
        {hasVideo ? (
          <iframe src={card.video!.embed} className="absolute inset-0 w-full h-full" allow="encrypted-media; picture-in-picture" allowFullScreen />
        ) : img ? <img src={img} alt={card.title} className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 grid place-items-center text-5xl">🃏</div>}
        <div className="absolute inset-x-0 bottom-0 p-4 pb-28 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
          {card.title && card.title.trim() && <div className="text-white text-[17px] font-semibold leading-snug">{card.title}</div>}
          {body && <p className="text-white/85 text-[13.5px] mt-1 line-clamp-4 whitespace-pre-wrap">{body}</p>}
          {(price || address) && (
            <div className="mt-1.5 flex items-center gap-3 text-[13px]">{price && <Price />}{address && <span className="text-white/70">📍 {address}</span>}</div>
          )}
          <Acts max={2} />
        </div>
      </div>
    );
  }

  // ───────── DETAIL (fiche pleine : galerie + titre + prix + lieu + description + specs) ─────────
  // Le LECTEUR pose les ACTIONS réelles (paiement/contact) autour ; ici = présentation.
  if (v === 'detail') {
    const imgs = show('media') ? (card.images || []) : [];
    const specs = show('specs') ? card.specs : undefined;
    return (
      <div className={light ? 'text-neutral-900' : 'text-white'}>
        {hasVideo ? (
          <div style={{ aspectRatio: card.video!.aspect || '16 / 9' }} className="w-full bg-black rounded-2xl overflow-hidden">
            <iframe src={card.video!.embed} className="w-full h-full" allow="encrypted-media; picture-in-picture" allowFullScreen />
          </div>
        ) : card.video?.url ? (
          <video src={card.video.url} controls playsInline className="w-full max-h-[55dvh] bg-black rounded-2xl" />
        ) : imgs.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory rounded-2xl no-scrollbar">
            {imgs.map((u, i) => <img key={i} src={u} alt="" className="w-full shrink-0 snap-center max-h-[55dvh] object-contain bg-black rounded-2xl" />)}
          </div>
        ) : imgs[0] ? (
          <img src={imgs[0]} alt={card.title} className="w-full max-h-[55dvh] object-contain bg-black rounded-2xl" />
        ) : null}
        <div className="mt-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[18px] font-semibold leading-tight">{card.title}</h2>
            {price && <span className="shrink-0 text-[17px] font-bold text-emerald-400">{price}{isLive && ' 🟢'}</span>}
          </div>
          {address && <div className={`text-[12.5px] mt-1 ${light ? 'text-neutral-500' : 'text-white/55'}`}>📍 {address}</div>}
          {card.slides?.length ? <SlideDeck slides={card.slides} light={light} />
            : body && <div className="mt-2"><Markdown light={light}>{body}</Markdown></div>}
          {specs && Object.keys(specs).length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {Object.entries(specs).filter(([, val]) => val && String(val).trim()).map(([k, val]) => (
                <div key={k} className={`rounded-lg px-2.5 py-1.5 ${light ? 'bg-black/[0.04] border border-black/10' : 'bg-white/[0.05] border border-white/10'}`}>
                  <div className={`text-[10px] uppercase tracking-wide ${light ? 'text-neutral-400' : 'text-white/40'}`}>{k}</div>
                  <div className={`text-[12.5px] ${light ? 'text-neutral-800' : 'text-white/85'}`}>{val}</div>
                </div>
              ))}
            </div>
          )}
          <Acts />
        </div>
      </div>
    );
  }

  // ───────── RESULT (Google) ─────────
  if (v === 'result') {
    return (
      <div className="flex gap-3 w-full rounded-xl border border-white/8 bg-white/[0.02] p-2.5">
        {img && <img src={img} alt="" className="w-16 h-16 rounded-md object-cover shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-sky-200/90 line-clamp-1">{card.title}</div>
          {body && <p className="text-[11.5px] text-white/55 line-clamp-2">{body}</p>}
          <div className="text-[10.5px] text-white/35 mt-0.5">{src || card.types[0]}{price && <> · <Price /></>}</div>
        </div>
      </div>
    );
  }

  // ───────── SQUARE (Insta grid) ─────────
  if (v === 'square' || v === 'mini') {
    // `mini` = miniature AU FORMAT DU FEED (portrait 3:4) ; `square` = grille profil.
    const ratio = v === 'mini' ? 'aspect-[3/4]' : 'aspect-square';
    return (
      <div className={`relative ${ratio} w-full rounded-lg overflow-hidden border border-white/10 bg-white/[0.05]`}>
        {vidUrl ? (
          // Lecteur vidéo (style Reels) : lit le fichier, muet, en boucle.
          <video src={vidUrl} muted loop playsInline autoPlay preload="metadata" className="w-full h-full object-cover" />
        ) : img ? (
          <img src={img} alt={card.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-2xl">🃏</div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
          <div className="text-[10.5px] text-white/90 line-clamp-1">{card.title}</div>
          {price && <div className="text-[10px] text-emerald-300">{price}</div>}
        </div>
      </div>
    );
  }

  // ───────── PIN (Maps) ─────────
  if (v === 'pin') {
    return (
      <div className="flex items-center gap-2.5 w-full rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <div className="text-lg">📍</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-white/90 line-clamp-1">{card.title}</div>
          {address && <div className="text-[10.5px] text-white/45">{address}</div>}
        </div>
        <Acts max={1} />
      </div>
    );
  }

  // ───────── LISTING (leboncoin) ─────────
  if (v === 'listing') {
    return (
      <div className="flex gap-3 w-full rounded-xl border border-white/10 bg-white/[0.03] p-2">
        {img && <img src={img} alt="" className="w-24 h-24 rounded-md object-cover shrink-0" />}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="text-[13px] font-medium text-white/90 line-clamp-2">{card.title}</div>
          {price && <div className="text-[15px] mt-0.5"><Price /></div>}
          <div className="mt-auto flex items-center justify-between">
            {address && <span className="text-[10.5px] text-white/45">📍 {address}</span>}
            <Acts max={1} />
          </div>
        </div>
      </div>
    );
  }

  // ───────── PRODUCT (Shein) / EAT (Uber Eats) ─────────
  if (v === 'product' || v === 'eat') {
    const tall = v === 'product' ? 'aspect-[3/4]' : 'aspect-[16/10]';
    return (
      <div className={`w-full rounded-xl overflow-hidden border ${light ? 'border-neutral-200 bg-white' : 'border-white/10 bg-white/[0.03]'}`}>
        <Media cls={`w-full ${tall} object-cover ${light ? 'bg-neutral-100' : ''}`} />
        <div className="p-2">
          <div className={`text-[12.5px] line-clamp-2 min-h-[2.4em] ${light ? 'text-neutral-700' : 'text-white/90'}`}>{card.title}</div>
          {(rating || price) && (
            <div className={`mt-1 flex items-center justify-between text-[11px] ${light ? 'text-neutral-500' : 'text-white/45'}`}>
              {rating && <span>{rating}</span>}
              {price && <span className={`text-[13px] font-bold ${light ? 'text-red-600' : 'text-emerald-300'}`}>{price}{isLive && ' 🟢'}</span>}
            </div>
          )}
          {address && <div className={`text-[10.5px] mt-0.5 ${light ? 'text-neutral-400' : 'text-white/40'}`}>📍 {address}</div>}
          <Acts max={2} />
        </div>
      </div>
    );
  }

  // ───────── BUBBLE (iMessage) ─────────
  if (v === 'bubble') {
    return (
      <div className="w-full">
        <div className="text-[10.5px] text-white/40 mb-1">💬 Léa</div>
        <div className="rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.06] overflow-hidden">
          <Media cls="w-full h-32 object-cover" />
          <div className="p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-semibold text-white/90 line-clamp-1">{card.title}</div>
              {price && <span className="text-[13px]"><Price /></span>}
            </div>
            {body && <p className="text-[11.5px] text-white/65 mt-1 line-clamp-2">{body}</p>}
            {address && <p className="text-[10.5px] text-white/45 mt-1">📍 {address}</p>}
            <Acts max={3} />
          </div>
        </div>
      </div>
    );
  }

  // ───────── SOCIAL (TikTok/Insta) ─────────
  if (v === 'social') {
    return (
      <div className={`w-full rounded-2xl overflow-hidden ${light ? 'border border-[#E7EAF0] bg-white shadow-[0_4px_16px_rgba(47,52,58,0.06)]' : 'border border-white/10 bg-white/[0.03]'}`}>
        <Media cls="w-full aspect-[4/5] max-h-[72vh] object-cover" />
        {hasVideo && card.images && card.images.length > 0 && show('media') && (
          <div className={`flex gap-1.5 p-2 overflow-x-auto border-t ${light ? 'border-[#E7EAF0]' : 'border-white/8'}`}>
            {card.images.map((u, i) => <img key={i} src={u} alt="" className={`h-14 w-20 object-cover rounded-md shrink-0 border ${light ? 'border-[#E7EAF0]' : 'border-white/10'}`} />)}
          </div>
        )}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            {card.title && <div className={`text-[15.5px] font-semibold ${light ? 'text-[#2F343A]' : 'text-white/95'}`} style={{ fontFamily: "'Outfit',sans-serif" }}>{card.title}</div>}
            {price && <div className="text-[15px] shrink-0"><Price /></div>}
          </div>
          {!hideMeta && (
            <div className={`mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] ${light ? 'text-[#9DAAB7]' : 'text-white/45'}`}>
              {card.types.map((t) => <span key={t} className={`rounded px-1.5 py-0.5 border ${light ? 'bg-[#F5F6F8] border-[#E7EAF0]' : 'bg-white/[0.06] border-white/10'}`}>{t}</span>)}
              {src && <span>· {src}</span>}{rating && <span>· {rating}</span>}
            </div>
          )}
          {body && <p className={`text-[12.5px] mt-2 ${light ? 'text-[#6A7585]' : 'text-white/70'}`}>{body}</p>}
          {card.affiliation?.ownerCut != null && <p className={`text-[11px] mt-1.5 ${light ? 'text-fuchsia-500/70' : 'text-fuchsia-200/50'}`}>📣 promu par un user · part owner {card.affiliation.ownerCut}%</p>}
          {/* Pas de barre ♥/💬/↗ ici : le social appartient au LECTEUR (Feed), pas à la card. */}
          <Acts max={2} />
        </div>
      </div>
    );
  }

  // ───────── CARD (défaut) ─────────
  return (
    <div className={`w-full rounded-2xl overflow-hidden ${light ? 'border border-[#E7EAF0] bg-white shadow-[0_4px_16px_rgba(47,52,58,0.06)]' : 'border border-white/10 bg-white/[0.03]'}`}>
      <Media cls="w-full h-36 object-cover" />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className={`text-[15px] font-semibold ${light ? 'text-[#2F343A]' : 'text-white/95'}`} style={{ fontFamily: "'Outfit',sans-serif" }}>{card.title}</div>
          {price && <div className="text-[14px] shrink-0"><Price /></div>}
        </div>
        {body && <p className={`text-[12.5px] mt-1.5 line-clamp-2 ${light ? 'text-[#6A7585]' : 'text-white/70'}`}>{body}</p>}
        <Acts max={2} />
      </div>
    </div>
  );
}

// Lecteur unique + INSPECTEUR (🔍 dev, admin only) sur CHAQUE carte, partout où le lecteur sert.
export default function SuperCardView(props: Parameters<typeof SuperCardViewInner>[0]) {
  const full = props.variant === 'fullscreen';
  return (
    <div className={full ? 'relative h-full w-full' : 'relative w-full'}>
      <SuperCardViewInner {...props} />
      {props.card?.id && <CardDevButton cardId={props.card.id} className="absolute right-1.5 top-1.5 z-40" />}
    </div>
  );
}
