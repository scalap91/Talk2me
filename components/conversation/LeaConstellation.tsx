'use client';

/**
 * LeaConstellation — POSE fidèle de conversation.html (Gemini, SPEC-CONV-CONSTEL.md).
 * Les Éclats (cards de Léa) NAISSENT en grappe flottante : naissance séquencée,
 * dérive/parallaxe au drag, tap = éclosion plein écran (fil flouté derrière),
 * « Garder » = l'Éclat s'envole vers le Hub. Mêmes styles/gestes que le prototype.
 * Câblé sur de VRAIES cards ; `onKeep` remonte au parent (→ Hub réel).
 */

import { useEffect, useRef } from 'react';

export interface Eclat {
  id: string;
  tag: string;                 // RESTO / CINÉ / CONCERT…
  title: string;
  sub: string;
  tone: 'r' | 'c' | 'u';       // couleur média (vert / sombre / violet)
  body?: string;               // contenu à l'ouverture
  x: number; y: number;        // position dans la grappe
  depth: number;               // parallaxe (data-d)
}

const TONE: Record<string, string> = {
  r: 'linear-gradient(135deg,#c9e4b8,#a7d38f)',
  c: 'linear-gradient(135deg,#3a3f47,#22252b)',
  u: 'linear-gradient(135deg,#7C5CFF,#5E80FE)',
};

export default function LeaConstellation({ eclats, onKeep }: { eclats: Eclat[]; onKeep?: (e: Eclat) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const buzz = (m: number) => { try { navigator.vibrate?.(m); } catch { /* */ } };

  useEffect(() => {
    const wrap = wrapRef.current, veil = veilRef.current;
    if (!wrap || !veil) return;
    const els = Array.from(wrap.querySelectorAll<HTMLElement>('.ttm-eclat'));

    // NAISSANCE : chaque Éclat pousse depuis la bulle de Léa, un par un.
    const timers: ReturnType<typeof setTimeout>[] = [];
    els.forEach((el, i) => {
      timers.push(setTimeout(() => {
        el.style.transition = 'opacity .4s, transform .5s cubic-bezier(.175,.885,.32,1.275)';
        el.style.opacity = '0'; el.style.transform = 'translateY(20px) scale(.8)'; void el.offsetWidth;
        el.style.opacity = '1'; el.style.transform = 'translateY(0) scale(1)';
        timers.push(setTimeout(() => el.classList.add('ttm-drift'), 520));
        buzz(6);
      }, 500 + i * 140));
    });

    // DÉRIVE locale (parallaxe) + tap = éclosion.
    let ox = 0, drag = false, moved = false, sx = 0, lx = 0, downEl: HTMLElement | null = null, openEl: HTMLElement | null = null;
    const place = () => els.forEach((el) => { if (el.classList.contains('ttm-open')) return; const d = +(el.dataset.d || 1); el.style.transform = `translateX(${ox * d}px)`; });

    const open = (el: HTMLElement) => {
      openEl = el; buzz(14); el.classList.remove('ttm-drift');
      if (!el.querySelector('.ttm-oc')) {
        const oc = document.createElement('div');
        oc.className = 'ttm-oc';
        const body = el.dataset.body || 'Cet Éclat s\'est ouvert SANS quitter la conversation — le fil est flouté derrière. Garde-le : il s\'envolera vers ton Hub.';
        oc.innerHTML = `<div class="ttm-p">${body}</div><button class="ttm-keep">✦ Garder dans mon Hub</button>`;
        el.appendChild(oc);
        oc.querySelector('.ttm-keep')!.addEventListener('click', (ev) => { ev.stopPropagation(); keep(el); });
      }
      veil.classList.add('on'); el.classList.add('ttm-open');
    };
    const closeOpen = () => { if (!openEl) return; openEl.classList.remove('ttm-open'); openEl.classList.add('ttm-drift'); veil.classList.remove('on'); openEl.style.transform = `translateX(${ox * (+(openEl.dataset.d || 1))}px)`; openEl = null; buzz(6); };

    // GARDER → envol vers le Hub (cible : [data-hub-target] sinon coin haut-droit).
    const keep = (el: HTMLElement) => {
      const hub = document.querySelector<HTMLElement>('[data-hub-target]');
      const hr = hub ? hub.getBoundingClientRect() : ({ left: window.innerWidth - 40, top: 60, width: 24, height: 24 } as DOMRect);
      const er = el.getBoundingClientRect();
      const fly = el.cloneNode(true) as HTMLElement;
      fly.querySelector('.ttm-oc')?.remove();
      fly.className = 'ttm-eclat';
      fly.style.cssText = `position:fixed;left:${er.left}px;top:${er.top}px;width:${er.width}px;z-index:60;opacity:1;box-shadow:0 10px 30px rgba(255,127,17,.5)`;
      document.body.appendChild(fly);
      el.classList.remove('ttm-open'); veil.classList.remove('on'); el.style.opacity = '0'; openEl = null; buzz(18);
      const id = el.dataset.id || '';
      const found = eclats.find((e) => e.id === id);
      if (found && onKeep) onKeep(found);
      fly.animate([
        { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
        { transform: `translate(${hr.left + 12 - er.left}px,${hr.top + 12 - er.top}px) scale(.08) rotate(200deg)`, opacity: .2 },
      ], { duration: 560, easing: 'cubic-bezier(.55,.06,.68,.19)' }).onfinish = () => {
        fly.remove();
        if (hub) { hub.style.transform = 'scale(1.25)'; setTimeout(() => { hub.style.transform = ''; }, 200); }
        buzz(10);
      };
    };

    const onDown = (e: PointerEvent) => { drag = true; moved = false; sx = lx = e.clientX; downEl = (e.target as HTMLElement).closest('.ttm-eclat'); };
    const onMove = (e: PointerEvent) => { if (!drag) return; const dx = e.clientX - lx; ox += dx; lx = e.clientX; if (Math.abs(e.clientX - sx) > 7) moved = true; place(); };
    const onUp = () => { drag = false; if (!moved && downEl && !downEl.classList.contains('ttm-open')) open(downEl); };
    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    veil.addEventListener('click', closeOpen);
    return () => {
      timers.forEach(clearTimeout);
      wrap.removeEventListener('pointerdown', onDown);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerup', onUp);
      veil.removeEventListener('click', closeOpen);
    };
  }, [eclats, onKeep]);

  return (
    <>
      <style>{`
        .ttm-constel{position:relative;height:300px;margin:6px 0 10px;touch-action:pan-y}
        .ttm-eclat{position:absolute;width:150px;border-radius:18px;background:#fff;overflow:hidden;box-shadow:0 10px 26px rgba(47,52,58,.16);opacity:0;cursor:pointer;will-change:transform;font-family:'Outfit',sans-serif}
        .ttm-eclat::after{content:"";position:absolute;inset:-5px;border-radius:24px;background:radial-gradient(closest-side,rgba(255,127,17,.18),transparent);z-index:-1}
        .ttm-eclat .ttm-m{height:96px}
        .ttm-eclat .ttm-tb{position:absolute;top:8px;left:8px;background:rgba(0,0,0,.45);color:#fff;font-size:9px;font-weight:600;letter-spacing:.05em;padding:3px 7px;border-radius:5px}
        .ttm-eclat .ttm-eb{padding:10px 11px 12px}.ttm-eclat .ttm-t{font-weight:600;font-size:14px;line-height:1.2;color:#2F343A}.ttm-eclat .ttm-s{font-size:11px;color:#6A7585;margin-top:3px}
        .ttm-drift{animation:ttmdrift 14s ease-in-out infinite alternate}
        @keyframes ttmdrift{from{filter:none}to{filter:none}}
        #ttm-veil{position:fixed;inset:0;z-index:40;background:rgba(20,20,25,.28);backdrop-filter:blur(5px);opacity:0;pointer-events:none;transition:opacity .3s}
        #ttm-veil.on{opacity:1;pointer-events:auto}
        .ttm-eclat.ttm-open{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:88%;max-width:360px;max-height:82%;overflow-y:auto;z-index:50;box-shadow:0 20px 60px rgba(0,0,0,.35),0 0 40px rgba(255,127,17,.4)}
        .ttm-eclat.ttm-open .ttm-m{height:38vh}
        .ttm-oc{padding:16px;opacity:0;transition:opacity .25s .15s}.ttm-eclat.ttm-open .ttm-oc{opacity:1}
        .ttm-oc .ttm-p{font-size:14.5px;color:#6A7585;line-height:1.6;margin-top:8px;font-family:'Inter',sans-serif}
        .ttm-oc .ttm-keep{margin-top:16px;width:100%;background:#FF7F11;color:#fff;font-weight:600;font-size:15px;border:none;border-radius:12px;padding:13px;font-family:'Inter',sans-serif}
      `}</style>
      <div ref={wrapRef} className="ttm-constel">
        {eclats.map((e) => (
          <div key={e.id} className="ttm-eclat" data-id={e.id} data-d={e.depth} data-body={e.body} style={{ left: e.x, top: e.y }}>
            <div className="ttm-m" style={{ background: TONE[e.tone] || TONE.r }} />
            <span className="ttm-tb">{e.tag}</span>
            <div className="ttm-eb"><div className="ttm-t">{e.title}</div><div className="ttm-s">{e.sub}</div></div>
          </div>
        ))}
      </div>
      <div id="ttm-veil" ref={veilRef} />
    </>
  );
}
