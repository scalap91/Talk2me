'use client';

/**
 * Talk2Me — VIEWER LIVE plein écran (Pascal 2026-07-05).
 *
 * Sort le live shopping de la salle 3D `/piece` : ici un spectateur regarde le
 * direct d'un vendeur dans une surface plein écran, SANS 3D.
 *
 *   - `host` (param de route) = id du DIFFUSEUR = canal `live:{host}`.
 *   - On REÇOIT le flux caméra du vendeur via la fonction viewer EXISTANTE
 *     `startViewer` (lib/live/p2p.ts) — MÊME signalisation WebRTC/canal que /piece,
 *     zéro nouveau protocole.
 *   - Par-dessus la vidéo : <LiveComments> (canComment) + <LiveProducts> (canBuy),
 *     les overlays qui existent déjà (mêmes que dans /piece côté spectateur).
 *
 * États gérés proprement (pas de crash) :
 *   - `offline`    : le vendeur n'est pas (encore) en direct → on patiente + on
 *                    reprend automatiquement dès qu'il démarre (poll status + re-join).
 *   - `connecting` : direct détecté, négociation WebRTC en cours.
 *   - `live`       : flux reçu, on joue la vidéo.
 *   - `ended`      : le vendeur a coupé son direct.
 *
 * Autoplay : le navigateur peut bloquer le son avant un geste utilisateur →
 * on démarre muet et on propose « Toucher pour le son » (tap → play() non muet).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { startViewer } from '@/lib/live/p2p';
import LiveComments from '@/components/live/LiveComments';
import LiveProducts from '@/components/live/LiveProducts';
import { formatMoney } from '@/lib/money';
import TipSheet from '@/components/commerce/TipSheet';
import { Gift } from '@/lib/icons';

type Phase = 'offline' | 'connecting' | 'live' | 'ended';

export default function LiveViewerPage() {
  const params = useParams<{ host: string }>();
  const host = String((params?.host as string) || '');
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [muted, setMuted] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  // PAYWALL d'entrée (Pascal 2026-07-15) : 'checking' → 'paywall' (payer pour entrer) → 'open'.
  const [gate, setGate] = useState<'checking' | 'paywall' | 'open'>('checking');
  const [priceCents, setPriceCents] = useState(0);
  const [paying, setPaying] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);

  // Vérifie l'accès à la salle AVANT de recevoir le flux : gratuit/déjà payé → open ; sinon paywall.
  useEffect(() => {
    if (!host) return;
    let dead = false;
    fetch(`/api/live/${encodeURIComponent(host)}/enter`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (dead) return;
        if (!j?.live || j.hasAccess || !j.priceCents) { setGate('open'); return; }
        setPriceCents(Math.max(0, Math.round(j.priceCents || 0)));
        setGate('paywall');
      })
      .catch(() => { if (!dead) setGate('open'); });
    return () => { dead = true; };
  }, [host]);

  const payEntry = useCallback(async () => {
    if (paying) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/live/${encodeURIComponent(host)}/enter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await res.json();
      if (j?.access) { setGate('open'); return; }
      if (j?.checkout_url) { window.location.href = j.checkout_url as string; return; }
    } finally { setPaying(false); }
  }, [host, paying]);

  // Réception du flux + gestion du cycle de vie du direct. Ne démarre QU'APRÈS le paywall (gate open).
  useEffect(() => {
    if (!host || gate !== 'open') return;
    let dead = false;
    let stop: (() => void) | null = null;

    const startV = () => {
      if (stop) return; // déjà en écoute
      stop = startViewer(host, (s) => {
        if (dead) return;
        const v = videoRef.current;
        if (s) {
          if (v) {
            v.srcObject = s;
            // Tente le son direct ; si bloqué par la policy autoplay → tap-to-unmute.
            v.muted = muted;
            v.play().catch(() => {
              if (!muted) {
                v.muted = true;
                setMuted(true);
                setNeedsTap(true);
                v.play().catch(() => {});
              }
            });
          }
          setPhase('live');
        } else {
          // Le diffuseur a coupé (signal 'end').
          if (v) v.srcObject = null;
          setPhase('ended');
          try { stop?.(); } catch { /* noop */ }
          stop = null; // autorise un redémarrage si le live reprend
        }
      });
    };

    // Poll du statut : lance/relance le viewer dès que le vendeur est en direct.
    const check = async () => {
      try {
        const r = await fetch(`/api/live/${encodeURIComponent(host)}?status=1`, { cache: 'no-store' });
        const j = r.ok ? await r.json() : { live: false };
        if (dead) return;
        if (j.live) {
          setPhase((p) => (p === 'live' ? p : 'connecting'));
          startV();
        } else if (!stop) {
          // Pas en direct et pas de flux en cours : on attend (ou live terminé).
          setPhase((p) => (p === 'ended' ? 'ended' : 'offline'));
        }
      } catch {
        /* réseau : on retentera au prochain tick */
      }
    };

    void check();
    const poll = setInterval(check, 5000);
    return () => {
      dead = true;
      clearInterval(poll);
      try { stop?.(); } catch { /* noop */ }
    };
    // muted volontairement hors deps : sa valeur initiale (true) suffit au 1er play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, gate]);

  // Tap → active le son (geste utilisateur requis par la policy autoplay).
  const enableSound = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setMuted(false);
    setNeedsTap(false);
    v.play().catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 z-[300] bg-black overflow-hidden select-none">
      {/* Vidéo plein écran (flux du diffuseur). */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={
          'absolute inset-0 w-full h-full object-cover bg-black transition-opacity ' +
          (phase === 'live' ? 'opacity-100' : 'opacity-0')
        }
      />

      {/* pastille repérage test (temporaire) */}
      <span className="absolute top-3 left-1/2 -translate-x-1/2 z-[20] px-2 py-0.5 rounded-md bg-pink-600 text-white text-[11px] font-mono font-bold tracking-widest border border-white pointer-events-none" style={{ marginTop: 'env(safe-area-inset-top,0px)' }}>SALLE-30</span>

      {/* PAYWALL : payer pour entrer dans la salle (Pascal 2026-07-15). */}
      {gate === 'paywall' && (
        <div className="absolute inset-0 z-[10] flex flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: 'rgba(10,8,16,0.92)' }}>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EF4444] text-white text-[12px] font-bold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> LIVE
          </span>
          <p className="text-white text-[17px] font-semibold" style={{ fontFamily: "'Outfit',sans-serif" }}>Cette personne est en live</p>
          <p className="text-white/70 text-[14px]">Entrée dans la salle : <span className="text-white font-bold">{formatMoney(priceCents, 'MGA')}</span></p>
          <button type="button" onClick={payEntry} disabled={paying}
            className="mt-1 px-7 py-3 rounded-full bg-[#EC4899] text-white text-[15px] font-semibold active:scale-95 disabled:opacity-50">
            {paying ? 'Paiement…' : 'Payer pour entrer'}
          </button>
          <button type="button" onClick={() => { if (window.history.length > 1) router.back(); else router.push('/rencontre'); }} className="text-white/55 text-[13px]">Annuler</button>
        </div>
      )}

      {/* OUTILS SPECTATEUR — pourboire à l'hôte pendant le direct (Pascal 2026-07-15). */}
      {gate === 'open' && (
        <button
          type="button"
          onClick={() => setTipOpen(true)}
          aria-label="Envoyer un pourboire"
          className="absolute right-4 bottom-24 z-[9] inline-flex items-center gap-2 px-4 h-11 rounded-full bg-[#EC4899] text-white text-[14px] font-semibold shadow-lg active:scale-95"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <Gift className="w-5 h-5" /> Pourboire
        </button>
      )}
      {tipOpen && <TipSheet open={tipOpen} toUserId={host} toName="l'hôte du live" onClose={() => setTipOpen(false)} />}

      {/* Fermer → retour. */}
      <button
        type="button"
        onClick={() => { if (window.history.length > 1) router.back(); else router.push('/'); }}
        aria-label="Fermer"
        className="absolute top-2 left-2 z-50 w-9 h-9 rounded-full bg-black/55 backdrop-blur flex items-center justify-center text-white text-[18px] leading-none"
        style={{ marginTop: 'env(safe-area-inset-top,0px)' }}
      >
        ✕
      </button>

      {/* Badge EN DIRECT. */}
      {phase === 'live' && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-red-600 text-white text-[12px] font-bold px-3 py-1 rounded-full shadow-lg"
          style={{ marginTop: 'env(safe-area-inset-top,0px)' }}
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />EN DIRECT
        </div>
      )}

      {/* Toucher pour le son (autoplay bloqué). */}
      {phase === 'live' && needsTap && (
        <button
          type="button"
          onClick={enableSound}
          className="absolute top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-black/70 backdrop-blur border border-white/20 px-4 py-2 text-white text-[13px] font-semibold active:scale-95"
          style={{ marginTop: 'env(safe-area-inset-top,0px)' }}
        >
          🔊 Toucher pour le son
        </button>
      )}

      {/* États non-live : message propre, pas de crash. */}
      {phase !== 'live' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-8 text-center">
          {phase === 'connecting' ? (
            <>
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <div className="text-white/85 text-[15px] font-semibold">Connexion au direct…</div>
            </>
          ) : phase === 'ended' ? (
            <>
              <div className="text-white text-[16px] font-bold">Le direct est terminé</div>
              <div className="text-white/55 text-[13px]">Merci d’avoir suivi ce live.</div>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="mt-2 h-10 px-5 rounded-full bg-white/90 text-black text-[13px] font-semibold active:scale-95"
              >
                Retour à l’accueil
              </button>
            </>
          ) : (
            <>
              <div className="text-white text-[16px] font-bold">Ce vendeur n’est pas en direct</div>
              <div className="text-white/55 text-[13px]">Dès qu’il démarre, le live s’affiche ici automatiquement.</div>
            </>
          )}
        </div>
      )}

      {/* Overlays temps réel — EXACTEMENT ceux du spectateur /piece. */}
      {host && phase !== 'ended' && (
        <>
          <LiveComments liveId={host} canComment announceJoin insetBottom={24} />
          <LiveProducts liveId={host} canBuy insetBottom={90} />
        </>
      )}
    </div>
  );
}
