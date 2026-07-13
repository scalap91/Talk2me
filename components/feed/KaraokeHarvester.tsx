'use client';
/**
 * KaraokeHarvester — RÉCOLTE le karaoké via le pool GPU (Pascal 2026-07-13).
 * Quand un tél du pool (capture native) affiche une carte son NON calée : pendant la lecture, il
 * capture l'écran toutes les ~2,6 s, OCR les SOUS-TITRES de la vidéo (ML Kit, GPU), et envoie les
 * FRAGMENTS (texte + temps vidéo) à /api/cards/karaoke-build → collage lrclib+OCR (ou IA en secours).
 *
 * DEUX garde-fous (Pascal 2026-07-13) :
 *  1) COLLÉ À SA CARTE — un marqueur invisible est observé (IntersectionObserver). Dès que la carte
 *     quitte l'écran (l'user scrolle vers un AUTRE post), on ARRÊTE de capturer → on n'avale JAMAIS
 *     la caption de la vidéo voisine (c'est ce qui polluait les fragments).
 *  2) COMPLÉTUDE — on scanne TOUTE la chanson (pas d'arrêt à la 1re calibration partielle) ; le
 *     serveur ne cale (calibrated=true → notre karaoké synchro) QUE si les fragments couvrent ~la
 *     fin de la chanson (maxT ≥ 0,9 × durée). Avant ça : CC natif YouTube + slide lecture. [[compute_mesh]]
 */
import { useEffect, useRef } from 'react';
import { captureScreen, recognizeText, hasNativeCapture } from '@/lib/compute/ondevice-ocr';

export default function KaraokeHarvester({ videoId, timeRef, durationRef, enabled }: {
  videoId: string;
  timeRef: React.MutableRefObject<number>;
  durationRef?: React.MutableRefObject<number>;
  enabled: boolean;
}) {
  const done = useRef(false);
  const markerRef = useRef<HTMLDivElement>(null);
  const onScreen = useRef(true);

  useEffect(() => {
    if (!enabled || done.current || !hasNativeCapture()) return;
    done.current = true;
    let stop = false;
    const frags: { text: string; t: number }[] = [];

    // Garde-fou #1 : SA carte est-elle à l'écran ? Le marqueur vit DANS la carte → quand le feed
    // défile vers un autre post, le marqueur sort de l'écran → on ne capture plus (sinon on lirait
    // la caption du voisin). Pas d'IntersectionObserver dispo → on suppose visible (best-effort).
    let io: IntersectionObserver | null = null;
    if (markerRef.current && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) onScreen.current = e.isIntersecting && e.intersectionRatio > 0.5;
      }, { threshold: [0, 0.5, 1] });
      io.observe(markerRef.current);
    }

    const push = async () => {
      try {
        const res = await fetch('/api/cards/karaoke-build', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ videoId, fragments: frags, duration: durationRef?.current || 0 }),
        });
        const r = await res.json().catch(() => null);
        console.log(`[HARVEST] push frags=${frags.length} dur=${durationRef?.current || 0} -> ${JSON.stringify(r)}`);
        return !!r?.calibrated;
      } catch (e) { console.log('[HARVEST] push ERR ' + String(e)); return false; }
    };

    (async () => {
      // On scanne TOUTE la chanson (jusqu'à ~9 min) pour couvrir toutes les lignes.
      for (let i = 0; i < 220 && !stop; i++) {
        await new Promise((res) => setTimeout(res, 2600));
        if (!onScreen.current) { i--; continue; }   // carte scrollée → on n'avale pas le voisin
        const t = timeRef.current;
        if (t < 1.5) { i--; continue; }              // pas encore en lecture réelle
        try {
          const cap = await captureScreen();
          if (cap.ok && cap.dataUrl) {
            const o = await recognizeText(cap.dataUrl);
            // Compte ce travail GPU dans le tableau de bord du mesh (« GPU natif »).
            fetch('/api/compute/ocr-ping', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ via: o.via }) }).catch(() => {});
            if (o.text && o.text.trim().length > 3) {
              frags.push({ text: o.text, t });
              console.log(`[HARVEST] n=${frags.length} t=${t.toFixed(1)} txt="${o.text.replace(/\s+/g, ' ').slice(0, 70)}"`);
            }
          }
        } catch { /* frame ratée → on continue */ }
        // Envoie régulièrement → le serveur reconstruit et cale DÈS QUE les fragments sont complets
        // (couvrent la fin de la chanson). Calé → on a fini, stop. Sinon on continue à scanner.
        if (frags.length >= 8 && frags.length % 4 === 0) { if (await push()) { stop = true; break; } }
        // Fin de chanson atteinte (on a scanné jusqu'à ~la fin) → dernier envoi puis stop.
        const dur = durationRef?.current || 0;
        if (dur > 1 && t >= dur - 3) { await push(); break; }
      }
      if (!stop && frags.length >= 6) await push();
    })();

    return () => { stop = true; io?.disconnect(); };
  }, [enabled, videoId, timeRef, durationRef]);

  // Marqueur invisible : sert UNIQUEMENT à savoir si la carte est encore à l'écran (garde-fou #1).
  return <div ref={markerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0 }} aria-hidden />;
}
