'use client';
/**
 * OUTIL SECRET — CALAGE KARAOKÉ (Pascal 2026-07-13). URL non liée : /labo/kscan?v=<videoId>.
 *
 * Lecteur YouTube PLEIN ÉCRAN PROPRE (juste la vidéo + la caption forcée, RIEN d'autre) → l'OCR ne
 * lit QUE la caption (plus de nav/description qui polluaient). Un tél du pool (capture native ML Kit)
 * scanne la caption pendant la lecture, envoie (texte, temps vidéo) au serveur qui compare à lrclib →
 * offset médian → stocké sur l'entité yt:<id>. Fait UNE fois, partagé pour tous. Le feed n'affiche
 * QUE le karaoké calé (il ne scanne pas). [[compute_mesh]]
 */
import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import YouTubeTimedPlayer from '@/components/feed/YouTubeTimedPlayer';
import { captureScreen, recognizeText, hasNativeCapture } from '@/lib/compute/ondevice-ocr';

function Scanner() {
  const sp = useSearchParams();
  const videoId = (sp.get('v') || '').trim();
  const timeRef = useRef(0);
  const [status, setStatus] = useState('init');
  const [n, setN] = useState(0);
  const [matches, setMatches] = useState(0);
  const [offset, setOffset] = useState<number | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) { setStatus('videoId invalide (?v=)'); return; }
    if (!hasNativeCapture()) { setStatus('capture native absente (ouvre dans l\'APK)'); return; }
    if (done.current) return;
    done.current = true;
    let stop = false;
    const samples: { text: string; time: number }[] = [];

    const push = async () => {
      try {
        const res = await fetch('/api/cards/lyrics-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ videoId, samples }),
        });
        const r = await res.json().catch(() => null);
        if (typeof r?.matches === 'number') setMatches(r.matches);
        if (r?.calibrated && typeof r?.offsetSec === 'number') { setOffset(r.offsetSec); return true; }
        return false;
      } catch { return false; }
    };

    (async () => {
      setStatus('scan en cours…');
      for (let i = 0; i < 40 && !stop; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const t = timeRef.current;
        if (t < 1.5) { i--; continue; }
        try {
          const cap = await captureScreen();
          if (cap.ok && cap.dataUrl) {
            const o = await recognizeText(cap.dataUrl);
            if (o.text && o.text.trim().length > 3) { samples.push({ text: o.text, time: t }); setN(samples.length); }
          }
        } catch { /* frame ratée */ }
        if (samples.length >= 4 && samples.length % 2 === 0) {
          if (await push()) { setStatus('✅ CALÉ'); stop = true; break; }
        }
      }
      if (!stop) setStatus('fini sans calage (pas assez de matches — la caption s\'affiche-t-elle ?)');
    })();

    return () => { stop = true; };
  }, [videoId]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      {/* LECTEUR PLEIN ÉCRAN PROPRE — RIEN d'autre → l'OCR ne lit que la caption */}
      {/^[A-Za-z0-9_-]{6,20}$/.test(videoId) && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <YouTubeTimedPlayer videoId={videoId} onTime={(t) => { timeRef.current = t; }} captions={true} />
        </div>
      )}
      {/* Bandeau statut minuscule en haut (le seul texte non-vidéo ; petit → n'écrase pas la caption) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '4px 8px', fontSize: 11, fontFamily: 'monospace', color: '#0f0', background: 'rgba(0,0,0,.5)', zIndex: 5, pointerEvents: 'none' }}>
        kscan {videoId} · {status} · n={n} match={matches}{offset !== null ? ` · offset=${offset}s` : ''}
      </div>
    </div>
  );
}

export default function KScanPage() {
  return <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#000' }} />}><Scanner /></Suspense>;
}
