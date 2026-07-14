'use client';
/**
 * KaraokeLyrics — SLIDE GAUCHE « Paroles » (Pascal 2026-07-13).
 *  - mode 'karaoke' (chanson CALÉE via OCR→offset) : la ligne chantée se surligne + GROSSIT toute
 *    seule au rythme du son (timing = video, cues déjà décalés serveur), recentrage auto. Le vrai
 *    karaoké. Le CC natif est coupé côté lecteur.
 *  - mode 'read' (pas encore calée) : scroll MANUEL, la ligne au centre grossit (aide à suivre).
 * Dans les deux cas la ligne active grossit + s'éclaire ; ce qui la choisit change (son vs scroll).
 */
import { useEffect, useRef, useState } from 'react';

export default function KaraokeLyrics({ synced, timeRef, mode = 'read' }: {
  synced: { t: number; text: string }[];
  timeRef?: React.MutableRefObject<number>;
  mode?: 'karaoke' | 'read';
}) {
  const scRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const [active, setActive] = useState(0);

  // KARAOKÉ : ligne active = dernière dont le timestamp (calé) est passé, AVEC une petite AVANCE
  // (LEAD) : l'OCR capte la caption au milieu de la ligne → l'offset ressort trop grand → sans
  // avance, ça s'éclaire en retard. LEAD ~0,8 s recale « pile poil ». Réglable. Pascal 2026-07-13.
  const LEAD = 0.8;
  useEffect(() => {
    if (mode !== 'karaoke' || !timeRef) return;
    const id = setInterval(() => {
      const t = timeRef.current + LEAD;
      let idx = 0;
      for (let i = 0; i < synced.length; i++) { if (synced[i].t <= t) idx = i; else break; }
      // AU DÉMARRAGE : tant que la lecture n'a pas VRAIMENT dépassé la 1re ligne calée, on RESTE sur
      // la 1re ligne (le calage OCR est peu fiable au début → ne PAS sauter au milieu). Pascal 2026-07-14.
      const firstT = Math.max(synced[0]?.t ?? 0, 1);
      if (timeRef.current < firstT) idx = 0;
      setActive((a) => (a === idx ? a : idx));
    }, 90);
    return () => clearInterval(id);
  }, [mode, synced, timeRef]);

  // KARAOKÉ : recentre la ligne active (défilement doux).
  useEffect(() => {
    if (mode !== 'karaoke') return;
    const sc = scRef.current, el = lineRefs.current[active];
    if (sc && el) sc.scrollTo({ top: Math.max(0, el.offsetTop - sc.clientHeight / 2 + el.clientHeight / 2), behavior: 'smooth' });
  }, [mode, active]);

  // LECTURE (manuel) : la ligne au centre du scroll = active.
  useEffect(() => {
    if (mode === 'karaoke') return;
    const sc = scRef.current;
    if (!sc) return;
    let raf = 0;
    const update = () => {
      const mid = sc.scrollTop + sc.clientHeight / 2;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < lineRefs.current.length; i++) {
        const el = lineRefs.current[i]; if (!el) continue;
        const c = el.offsetTop + el.clientHeight / 2, d = Math.abs(c - mid);
        if (d < bestD) { bestD = d; best = i; }
      }
      setActive((a) => (a === best ? a : best));
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => { sc.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [mode, synced]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 4, left: 22, zIndex: 3, fontFamily: "'Outfit',sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>
        Paroles{mode === 'karaoke' ? ' 🎤' : ''}
      </div>
      <div
        ref={scRef}
        style={{
          position: 'absolute', inset: 0, overflowY: 'auto', padding: '34px 22px 24px',
          // Scroller les PAROLES ne doit PAS déclencher le slide vertical du feed (Pascal 2026-07-14 :
          // « slide haut/bas interdit en karaoké, on scrolle le texte »). overscroll-behavior contain =
          // le scroll ne se propage pas au snap-y parent ; touchAction pan-y = le vertical scrolle les
          // paroles, l'horizontal reste au swiper (retour à la vidéo perso).
          overscrollBehavior: 'contain', touchAction: 'pan-y',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 18%, #000 84%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, #000 18%, #000 84%, transparent 100%)',
        }}
      >
        {synced.map((l, i) => {
          const on = i === active;
          return (
            <p
              key={i}
              ref={(e) => { lineRefs.current[i] = e; }}
              style={{
                fontFamily: "'Inter',sans-serif",
                fontSize: on ? 20 : 16,
                fontWeight: on ? 800 : 600,
                lineHeight: 1.7,
                color: on ? '#fff' : 'rgba(255,255,255,.42)',
                margin: '0 0 9px',
                transition: 'color .18s, font-size .18s, font-weight .18s',
                textShadow: on ? '0 1px 10px rgba(0,0,0,.55)' : 'none',
              }}
            >
              {l.text || '♪'}
            </p>
          );
        })}
      </div>
    </div>
  );
}
