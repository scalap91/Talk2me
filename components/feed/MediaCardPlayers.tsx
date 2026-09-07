'use client';
/**
 * Lecteurs ALBUM & FILM du feed web — sous-composants du LECTEUR UNIQUE (AlignedPostCard).
 * Ils lisent les facettes ÉTENDUES du `.card` (audio.tracks[] MP3, video.trailer/full, price),
 * introduites côté natif (Pascal 2026-07-17). AUCUN renderer trafiqué : on lit le `.card`.
 *
 * ACHAT RÉEL (Pascal 2026-09-07) : marketplace média = bien numérique. Le bouton Acheter appelle
 * /api/cards/media/buy → escrow + commission + PaPi (PaymentFrame), puis l'accès est octroyé
 * CÔTÉ SERVEUR (content_unlocks) → `bought` remonte dans le feed → lecture débloquée partout.
 * Aucun leurre : si pas de prix résolu, pas de bouton. On n'achète jamais sa propre création.
 */
import { useRef, useState } from 'react';
import type { SuperCard } from '@/lib/cards/supercard';
import PaymentFrame from '@/components/pay/PaymentFrame';

function priceLabel(p?: SuperCard['price']): string | null {
  if (!p || typeof p.amount !== 'number' || p.amount <= 0) return null;
  const cur = p.currency || 'Ar';
  return `${p.amount.toLocaleString('fr-FR')} ${cur}`;
}

/** Bouton d'achat RÉEL d'une card média (album/film). Rail unique /api/cards/media/buy :
 *  → { unlocked:true } (payé au solde) : on débloque direct ; → { checkout_url } : page PaPi
 *  dans PaymentFrame, on relit le statut à la fermeture. onBought() = accès obtenu. */
function MediaBuyButton({ cardId, label, kind, onBought }: { cardId: string; label: string; kind: 'album' | 'film'; onBought: () => void }) {
  const [busy, setBusy] = useState(false);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function start() {
    if (busy || payUrl) return;
    setBusy(true); setMsg(null);
    try {
      const d = await fetch('/api/cards/media/buy', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: cardId }),
      }).then((r) => r.json());
      if (d?.ok && d.unlocked) { onBought(); setBusy(false); return; }
      if (d?.checkout_url) { setIntent(d.intent_id || null); setPayUrl(d.checkout_url); return; } // busy reste vrai tant que la page PaPi est ouverte
      setMsg(d?.error === 'price_unset' ? 'Prix non défini par le vendeur.' : 'Paiement indisponible, réessaie.');
      setBusy(false);
    } catch { setMsg('Erreur réseau.'); setBusy(false); }
  }

  async function closePay() {
    const it = intent; setPayUrl(null); setIntent(null); setBusy(false);
    if (!it) return;
    try {
      const s = await fetch(`/api/wallet/topup/status?intent=${encodeURIComponent(it)}`, { cache: 'no-store' }).then((r) => r.json());
      if (s?.status === 'paid') onBought();
    } catch { /* le feed relira bought au prochain chargement de toute façon */ }
  }

  return (
    <>
      <button onClick={start} disabled={busy}
        style={{ width: '100%', height: 50, marginTop: 8, borderRadius: 14, border: 0, background: '#FF7F11', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 15.5, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
        {busy && !payUrl ? '…' : `Acheter ${kind === 'film' ? 'le film' : "l'album"} · ${label}`}
      </button>
      {msg && <div style={{ color: '#FCA5A5', fontSize: 12.5, textAlign: 'center', marginTop: 6 }}>{msg}</div>}
      {payUrl && <PaymentFrame url={payUrl} onClose={closePay} />}
    </>
  );
}

/** ALBUM : pochette + liste de pistes MP3 jouables (lecteur audio HTML5 natif). */
export function AlbumPlayer({ card, caption, isOwner, bought }: { card: SuperCard; caption?: string; isOwner?: boolean; bought?: boolean }) {
  const tracks = (card.audio?.tracks || []).filter((t) => t && t.url);
  const cover = card.images?.[0] || card.audio?.thumbnail || '';
  const artist = card.audio?.author || '';
  const price = priceLabel(card.price);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [cur, setCur] = useState<number>(-1);
  const [playing, setPlaying] = useState(false);
  const [owned, setOwned] = useState<boolean>(!!bought); // accès obtenu (payé) → lecture débloquée
  const hasAccess = !!isOwner || owned;

  function toggle(i: number) {
    const a = audioRef.current;
    if (!a) return;
    if (cur === i && playing) { a.pause(); setPlaying(false); return; }
    if (cur !== i) { a.src = tracks[i].url; setCur(i); }
    void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  // Rendu IMMERSIF plein écran — reproduction fidèle de la carte album NATIVE (album_card.dart) :
  // pochette floutée en fond + voile #0E0C13, pochette 190 centrée, titre Outfit 22 w900, badge
  // 🎵 ALBUM orange, liste de pistes jouables, prix. Colonne-téléphone.
  return (
    <div style={{ position: 'relative', minHeight: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#15131C' }}>
      {cover && <img src={cover} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(16px)', transform: 'scale(1.2)' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,12,19,0.72)' }} />

      {/* Haut : on reproduit l'espacement du natif (album_card.dart : SafeArea + 8 + 48 = 56px)
          pour que la pochette NE MONTE PLUS sous le menu du haut (bug Pascal 2026-09-07 :
          « l'image est trop haute et se met sur le menu haut »). safe-area-inset-top = équiv. SafeArea. */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', padding: 'calc(env(safe-area-inset-top) + 56px) 20px calc(96px + env(safe-area-inset-bottom))' }}>
        <div style={{ alignSelf: 'center', width: 190, height: 190, borderRadius: 16, overflow: 'hidden', background: '#2A2340' }}>
          {cover ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 60 }}>🎵</div>}
        </div>
        <div style={{ height: 16 }} />
        <div style={{ fontFamily: "'Outfit',sans-serif", color: '#fff', fontSize: 22, fontWeight: 900, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title || 'Album'}</div>
        <div style={{ height: 2 }} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
          {artist && <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist}</span>}
          <span style={{ flexShrink: 0, whiteSpace: 'nowrap', color: '#FF7F11', fontSize: 10, fontWeight: 800, background: 'rgba(255,127,17,0.18)', border: '1px solid rgba(255,127,17,0.5)', borderRadius: 20, padding: '2px 8px' }}>🎵 ALBUM</span>
        </div>
        {caption && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13.5, textAlign: 'center', margin: '10px 0 0', lineHeight: 1.4 }}>{caption}</div>}
        <div style={{ height: 16 }} />

        <div style={{ flex: 1 }}>
          {tracks.map((t, i) => (
            <button key={i} onClick={() => toggle(i)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 0, cursor: 'pointer', padding: '11px 0', textAlign: 'left' }}>
              <span style={{ width: 26, color: cur === i ? '#FF7F11' : 'rgba(255,255,255,0.54)', fontSize: 18, flexShrink: 0 }}>{cur === i && playing ? '❚❚' : '▶'}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: cur === i ? '#fff' : 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: cur === i ? 700 : 500 }}>{t.title || `Piste ${i + 1}`}</span>
              {price && !hasAccess && <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginRight: 8 }}>30s</span>}
              {t.duration && <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>{t.duration}</span>}
            </button>
          ))}
        </div>

        {/* Info « Aperçu 30 s » EN DUR (persistante, parité natif) quand ni proprio ni acheteur. */}
        {!hasAccess && price && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12.5, textAlign: 'center', lineHeight: 1.3, margin: '2px 0 4px' }}>Aperçu 30 s — achète l’album pour écouter en entier 🎧</div>}
        {/* MON album → « Créé par moi » ; déjà acheté → « Acheté » ; sinon bouton d'ACHAT RÉEL
            (escrow + PaPi). Plus de leurre : si aucun prix, on n'affiche rien. */}
        {isOwner
          ? <div style={{ height: 50, marginTop: 8, borderRadius: 14, border: '1px solid rgba(255,127,17,0.5)', background: 'rgba(255,127,17,0.18)', color: '#FF7F11', display: 'grid', placeItems: 'center', fontFamily: "'Outfit',sans-serif", fontWeight: 800 }}>🎵 Créé par moi</div>
          : owned
            ? <div style={{ height: 50, marginTop: 8, borderRadius: 14, border: '1px solid rgba(74,222,128,0.5)', background: 'rgba(74,222,128,0.16)', color: '#4ADE80', display: 'grid', placeItems: 'center', fontFamily: "'Outfit',sans-serif", fontWeight: 800 }}>🎧 Acheté — écoute complète</div>
            : price && card.id
              ? <MediaBuyButton cardId={card.id} label={price} kind="album" onBought={() => setOwned(true)} />
              : price
                ? <div style={{ textAlign: 'center', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 17, padding: '10px 0 2px' }}>{price}</div>
                : null}
      </div>
      <audio ref={audioRef} onEnded={() => setPlaying(false)} preload="none" />
    </div>
  );
}

/** FILM : lecteur bande-annonce (aperçu gratuit) + prix. Le film complet reste derrière l'achat. */
export function FilmPlayer({ card, caption, isOwner, bought }: { card: SuperCard; caption?: string; isOwner?: boolean; bought?: boolean }) {
  const trailer = card.video?.trailer || card.video?.url || '';
  const hasFull = !!card.video?.full;
  const cover = card.images?.[0] || '';
  const price = priceLabel(card.price);
  const synopsis = card.text?.body || '';
  const [owned, setOwned] = useState<boolean>(!!bought);
  const hasAccess = !!isOwner || owned;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#000', color: '#fff' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
        {trailer ? (
          <video src={trailer} controls playsInline poster={cover || undefined} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : cover ? (
          <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : null}
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18 }}>{card.title || 'Film'}</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: '#fff', background: 'rgba(255,255,255,0.16)', padding: '2px 8px', borderRadius: 6 }}>{hasFull ? 'BANDE-ANNONCE' : 'FILM'}</span>
          {price ? <span style={{ fontSize: 14, fontWeight: 800, color: '#4ADE80' }}>{price}</span> : null}
        </div>
        {synopsis ? <div style={{ fontSize: 14, color: '#D1D5DB', lineHeight: 1.4 }}>{synopsis}</div> : null}
        {caption ? <div style={{ fontSize: 14, color: '#E5E7EB', marginTop: 2 }}>{caption}</div> : null}
        {/* Accès au film complet : le mien / acheté → dispo ; sinon achat RÉEL (escrow + PaPi). */}
        {isOwner
          ? <div style={{ fontSize: 13, color: '#FF7F11', fontWeight: 700, marginTop: 4 }}>🎬 Créé par moi</div>
          : hasAccess
            ? <div style={{ fontSize: 13, color: '#4ADE80', fontWeight: 700, marginTop: 4 }}>🎬 Acheté — film complet disponible</div>
            : hasFull && price && card.id
              ? <MediaBuyButton cardId={card.id} label={price} kind="film" onBought={() => setOwned(true)} />
              : hasFull && price
                ? <div style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>Film complet disponible à l’achat.</div>
                : null}
      </div>
    </div>
  );
}
