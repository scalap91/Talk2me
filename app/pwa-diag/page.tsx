'use client';

/**
 * /pwa-diag — Diagnostic PWA Talk2Me (#335)
 *
 * Page publique (whitelist middleware) pour debug install PWA.
 * Liste verticale de vérifications avec verdict ✅/⚠️/❌ et valeur brute.
 *
 * Doctrine :
 *  - [[talktome-design-premium]] : dark sobre, accents violets discrets,
 *    cards bordure white/8, rounded-2xl, spacing aéré.
 *  - [[feedback_screenshot_avant_url]] : la preuve visuelle de la page
 *    sert à Pascal pour partager exactement ce qui bloque.
 *
 * Aucun appel API : tout est lu côté client depuis navigator/window.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Verdict = 'ok' | 'warn' | 'ko' | 'info';

interface Check {
  key: string;
  label: string;
  verdict: Verdict;
  value: string;
}

const VERDICT_ICON: Record<Verdict, string> = {
  ok: '✅',
  warn: '⚠️',
  ko: '❌',
  info: 'ℹ️',
};

const VERDICT_COLOR: Record<Verdict, string> = {
  ok: 'text-emerald-300/90',
  warn: 'text-amber-300/90',
  ko: 'text-rose-300/90',
  info: 'text-white/55',
};

const BIP_FLAG_KEY = 'talk2me_bip_seen';

function detectPlatform(ua: string): string {
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Browser';
  if (/EdgA?/i.test(ua)) return 'Edge';
  if (/FxiOS|Firefox/i.test(ua)) return 'Firefox';
  if (/CriOS|Chrome/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Inconnu';
}

function detectOs(ua: string): string {
  if (/Android/i.test(ua)) return 'Android';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'iOS';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Inconnu';
}

export default function PwaDiagPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [copied, setCopied] = useState(false);

  // Capture beforeinstallprompt pour bouton "Installer maintenant"
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
      try {
        sessionStorage.setItem(BIP_FLAG_KEY, '1');
      } catch {
        // ignore
      }
      // eslint-disable-next-line no-console
      console.log('[PWA] beforeinstallprompt captured (diag)');
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const runChecks = useCallback(async () => {
    const out: Check[] = [];

    // 1. HTTPS
    const isHttps = window.location.protocol === 'https:';
    out.push({
      key: 'https',
      label: 'HTTPS actif',
      verdict: isHttps ? 'ok' : 'ko',
      value: window.location.protocol,
    });

    // 2. Manifest accessible
    try {
      const res = await fetch('/manifest.json', { cache: 'no-store' });
      if (!res.ok) {
        out.push({
          key: 'manifest',
          label: 'Manifest accessible',
          verdict: 'ko',
          value: `HTTP ${res.status}`,
        });
      } else {
        const m = await res.json();
        const ok = !!(m.name && Array.isArray(m.icons) && m.icons.length > 0);
        out.push({
          key: 'manifest',
          label: 'Manifest accessible',
          verdict: ok ? 'ok' : 'warn',
          value: `name="${m.name ?? '?'}", icons=${
            Array.isArray(m.icons) ? m.icons.length : 0
          }`,
        });
      }
    } catch (e) {
      out.push({
        key: 'manifest',
        label: 'Manifest accessible',
        verdict: 'ko',
        value: `fetch error: ${(e as Error).message}`,
      });
    }

    // 3. Service Worker registered / 4. SW active / 5. Scope
    if ('serviceWorker' in navigator) {
      const controller = navigator.serviceWorker.controller;
      out.push({
        key: 'sw-registered',
        label: 'Service Worker enregistré',
        verdict: controller ? 'ok' : 'warn',
        value: controller
          ? `controller: ${controller.scriptURL}`
          : 'pas de controller (1er chargement ?)',
      });
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          out.push({
            key: 'sw-active',
            label: 'Service Worker actif',
            verdict: 'ko',
            value: 'aucune registration',
          });
          out.push({
            key: 'sw-scope',
            label: 'Scope SW',
            verdict: 'ko',
            value: 'n/a',
          });
        } else {
          const state = reg.active?.state ?? 'aucun';
          out.push({
            key: 'sw-active',
            label: 'Service Worker actif',
            verdict: state === 'activated' ? 'ok' : 'warn',
            value: `state=${state}`,
          });
          out.push({
            key: 'sw-scope',
            label: 'Scope SW',
            verdict: 'info',
            value: reg.scope,
          });
        }
      } catch (e) {
        out.push({
          key: 'sw-active',
          label: 'Service Worker actif',
          verdict: 'ko',
          value: `error: ${(e as Error).message}`,
        });
      }
    } else {
      out.push({
        key: 'sw-registered',
        label: 'Service Worker enregistré',
        verdict: 'ko',
        value: 'navigator.serviceWorker indisponible',
      });
    }

    // 6. Display-mode standalone
    const standalone = window.matchMedia(
      '(display-mode: standalone)'
    ).matches;
    out.push({
      key: 'display-standalone',
      label: 'Display-mode standalone',
      verdict: standalone ? 'ok' : 'info',
      value: String(standalone),
    });

    // 7. Mode app installée
    const iosStandalone =
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true;
    const isInstalled = standalone || iosStandalone;
    setInstalled(isInstalled);
    out.push({
      key: 'installed',
      label: 'Mode app installée',
      verdict: isInstalled ? 'ok' : 'info',
      value: isInstalled ? 'oui' : 'non',
    });

    // 8. beforeinstallprompt déjà reçu (sessionStorage flag)
    let bipSeen = false;
    try {
      bipSeen = sessionStorage.getItem(BIP_FLAG_KEY) === '1';
    } catch {
      // ignore
    }
    out.push({
      key: 'bip-seen',
      label: 'beforeinstallprompt déjà reçu',
      verdict: bipSeen ? 'ok' : 'warn',
      value: bipSeen ? 'oui' : 'non (critères PWA pas encore remplis)',
    });

    // 9. Storage estimate
    if (navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const quotaMB = est.quota ? est.quota / (1024 * 1024) : 0;
        const usageMB = est.usage ? est.usage / (1024 * 1024) : 0;
        const availMB = quotaMB - usageMB;
        const verdict: Verdict =
          availMB < 5 ? 'ko' : availMB < 50 ? 'warn' : 'ok';
        // eslint-disable-next-line no-console
        console.log(
          `[PWA] storage estimate: quota=${quotaMB.toFixed(
            1
          )} usage=${usageMB.toFixed(1)} available=${availMB.toFixed(1)} MB`
        );
        out.push({
          key: 'storage',
          label: 'Storage estimate',
          verdict,
          value: `quota=${quotaMB.toFixed(1)} MB · usage=${usageMB.toFixed(
            1
          )} MB · dispo=${availMB.toFixed(1)} MB`,
        });
      } catch (e) {
        out.push({
          key: 'storage',
          label: 'Storage estimate',
          verdict: 'warn',
          value: `error: ${(e as Error).message}`,
        });
      }
    } else {
      out.push({
        key: 'storage',
        label: 'Storage estimate',
        verdict: 'warn',
        value: 'API indisponible',
      });
    }

    // 10. Plateforme / 11. OS
    const ua = navigator.userAgent;
    const platform = detectPlatform(ua);
    const os = detectOs(ua);
    out.push({
      key: 'platform',
      label: 'Plateforme détectée',
      verdict: 'info',
      value: platform,
    });
    out.push({
      key: 'os',
      label: 'OS',
      verdict: 'info',
      value: os,
    });

    // 12. iOS standalone (si iOS)
    if (os === 'iOS') {
      out.push({
        key: 'ios-standalone',
        label: 'iOS standalone',
        verdict: iosStandalone ? 'ok' : 'info',
        value: String(iosStandalone),
      });
    }

    setChecks(out);
    setLoading(false);
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const handleCopy = useCallback(async () => {
    const report = {
      ts: new Date().toISOString(),
      url: window.location.href,
      ua: navigator.userAgent,
      checks: checks.map((c) => ({
        key: c.key,
        label: c.label,
        verdict: c.verdict,
        value: c.value,
      })),
    };
    const json = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback : ouvre une fenêtre prompt
      try {
        window.prompt('Rapport PWA (copie manuelle) :', json);
      } catch {
        // ignore
      }
    }
  }, [checks]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    // eslint-disable-next-line no-console
    console.log('[PWA] user clicked install (diag)');
    try {
      const p = deferredPrompt as unknown as {
        prompt: () => Promise<void>;
        userChoice: Promise<{
          outcome: 'accepted' | 'dismissed';
          platform: string;
        }>;
      };
      await p.prompt();
      const choice = await p.userChoice;
      // eslint-disable-next-line no-console
      console.log('[PWA] prompt.userChoice:', choice.outcome);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[PWA] prompt failed', e);
    } finally {
      setDeferredPrompt(null);
      setCanInstall(false);
      // re-run pour rafraichir
      runChecks();
    }
  }, [deferredPrompt, runChecks]);

  const allOk =
    checks.length > 0 &&
    checks.every((c) => c.verdict === 'ok' || c.verdict === 'info');

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-white/55 hover:text-white/90 text-[13px]"
          >
            ← Retour
          </Link>
          <h1 className="text-[15px] font-medium tracking-tight">
            Diagnostic PWA
          </h1>
          <span className="text-white/40 text-[12px]">#335</span>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-white/55 text-[13px] leading-relaxed mb-5">
          Vérification de l&apos;installabilité PWA Talk2Me sur cet appareil.
          Partage le rapport (bouton bas) si l&apos;install bloque.
        </p>

        {loading ? (
          <div className="text-white/45 text-[13px]">Chargement…</div>
        ) : (
          <ul className="space-y-2">
            {checks.map((c) => (
              <li
                key={c.key}
                data-testid={`check-${c.key}`}
                className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 flex items-start gap-3"
              >
                <span
                  className={`text-[15px] leading-none mt-0.5 ${
                    VERDICT_COLOR[c.verdict]
                  }`}
                  aria-hidden="true"
                >
                  {VERDICT_ICON[c.verdict]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-white/90 font-medium leading-tight">
                    {c.label}
                  </div>
                  <div className="text-[12px] text-white/55 leading-snug mt-1 font-mono break-all">
                    {c.value}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleCopy}
            data-testid="copy-report"
            className="h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white/90 text-[13.5px] font-medium transition-colors"
          >
            {copied ? '✓ Rapport copié' : '📋 Copier le rapport'}
          </button>

          {!installed && allOk && canInstall && (
            <button
              type="button"
              onClick={handleInstall}
              data-testid="install-now"
              className="h-11 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-red-100 text-[13.5px] font-medium transition-colors"
            >
              Installer maintenant
            </button>
          )}

          {!installed && !canInstall && (
            <div className="text-[12px] text-white/45 leading-snug px-2">
              Le navigateur n&apos;a pas (encore) émis l&apos;événement
              <code className="mx-1 text-white/70">beforeinstallprompt</code>.
              Sur Chrome / Samsung Browser : ouvre le menu (⋮) →
              « Installer l&apos;application » ou « Ajouter à l&apos;écran
              d&apos;accueil ».
            </div>
          )}

          {installed && (
            <div className="text-[12.5px] text-emerald-300/85 leading-snug px-2">
              ✓ Talk2Me tourne déjà en mode application installée.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
