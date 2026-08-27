'use client';
/**
 * PerfBeacon — collecteur RUM DEV (Pascal 2026-08-27). Capte les vraies Web Vitals du DEVICE réel
 * (FCP, LCP, CLS, tâches longues, timings réseau + contexte device/connexion) et les envoie à
 * /api/dev/perf. Envoi UNE fois (après ~12 s de feed OU au masquage de la page). Aucune PII.
 */
import { useEffect } from 'react';

export default function PerfBeacon({ page = 'feed' }: { page?: string }) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
    let lcp = 0, cls = 0, ltCount = 0, ltMs = 0, fcp = 0, sent = false;
    const obs: PerformanceObserver[] = [];
    const mk = (type: string, cb: (e: PerformanceEntry) => void) => {
      try { const o = new PerformanceObserver((l) => l.getEntries().forEach(cb)); o.observe({ type, buffered: true } as PerformanceObserverInit); obs.push(o); } catch { /* non supporté */ }
    };
    mk('largest-contentful-paint', (e) => { lcp = Math.round(e.startTime); });
    mk('paint', (e) => { if (e.name === 'first-contentful-paint') fcp = Math.round(e.startTime); });
    mk('layout-shift', (e) => { const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean }; if (!s.hadRecentInput) cls += s.value; });
    mk('longtask', (e) => { ltCount++; ltMs += e.duration; });

    const send = () => {
      if (sent) return; sent = true;
      obs.forEach((o) => o.disconnect());
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const conn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
      const payload = {
        page,
        ttfb: nav ? Math.round(nav.responseStart) : null,
        dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        load: nav ? Math.round(nav.loadEventEnd) : null,
        fcp, lcp, cls: Math.round(cls * 1000) / 1000, longtasks: ltCount, longtaskMs: Math.round(ltMs),
        domNodes: document.querySelectorAll('*').length,
        iframes: document.querySelectorAll('iframe').length,
        net: conn ? { type: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt } : null,
        dpr: window.devicePixelRatio, vw: window.innerWidth, vh: window.innerHeight,
        mem: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
      };
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        if (navigator.sendBeacon) navigator.sendBeacon('/api/dev/perf', blob);
        else fetch('/api/dev/perf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true });
      } catch { /* */ }
    };

    const t = setTimeout(send, 12000);
    const onHide = () => { if (document.visibilityState === 'hidden') send(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', send);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', send); };
  }, [page]);
  return null;
}
