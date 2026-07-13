'use client';
/**
 * KaraokeLyrics — paroles synchronisées façon KARAOKÉ (Pascal 2026-07-13).
 * UNE seule page : les lignes DÉFILENT toutes seules, la ligne active (selon le `currentTime` du
 * lecteur, lu dans `timeRef`) est surlignée + recentrée. Pas de pagination, pas de scroll manuel.
 * `timeRef` est alimenté par YouTubeTimedPlayer → aucun re-render du feed, seul ce composant tourne.
 */
import { useEffect, useRef, useState } from 'react';

export default function KaraokeLyrics({ synced, timeRef }: {
  synced: { t: number; text: string }[];
  timeRef: React.MutableRefObject<number>;
}) {
  const [active, setActive] = useState(-1);
  const scRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  // Boucle légère (150 ms) : trouve la DERNIÈRE ligne dont le timestamp est passé.
  useEffect(() => {
    const id = setInterval(() => {
      const t = timeRef.current;
      let idx = -1;
      for (let i = 0; i < synced.length; i++) {
        if (synced[i].t <= t + 0.15) idx = i; else break;
      }
      setActive((prev) => (prev === idx ? prev : idx));
    }, 150);
    return () => clearInterval(id);
  }, [synced, timeRef]);

  // Recentre la ligne active (défilement doux). overflow:hidden → pas de scroll manuel parasite.
  useEffect(() => {
    const sc = scRef.current;
    const el = active >= 0 ? lineRefs.current[active] : null;
    if (sc && el) {
      const top = el.offsetTop - sc.clientHeight / 2 + el.clientHeight / 2;
      sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }, [active]);

  return (
    <div
      ref={scRef}
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden', padding: '10px 22px 0',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)',
      }}
    >
      {synced.map((l, i) => (
        <p
          key={i}
          ref={(e) => { lineRefs.current[i] = e; }}
          style={{
            fontFamily: "'Inter',sans-serif",
            fontSize: i === active ? 19 : 16,
            fontWeight: i === active ? 800 : 600,
            lineHeight: 1.7,
            color: i === active ? '#fff' : 'rgba(255,255,255,.4)',
            margin: '0 0 8px',
            transition: 'color .25s, font-size .25s',
            textShadow: i === active ? '0 1px 10px rgba(0,0,0,.55)' : 'none',
          }}
        >
          {l.text || '♪'}
        </p>
      ))}
    </div>
  );
}
