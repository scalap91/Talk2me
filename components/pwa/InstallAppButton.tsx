'use client';

import { useCallback, useEffect, useState } from 'react';
import { Smartphone, X, Loader2 } from '@/lib/icons';
import { IosInstallModal } from './IosInstallModal';

/**
 * Talk2Me #332 / #335 — Bouton "Installer l'app" custom PWA.
 *
 * Chrome ne propose plus systématiquement l'installation dans son menu auto :
 * on capture nous-mêmes `beforeinstallprompt` et on déclenche le prompt natif
 * au tap utilisateur.
 *
 * Variants :
 *   - "inline" : pill sobre à placer dans un formulaire / une section profil
 *   - "banner" : bandeau dismissable au-dessus de la home conv solo
 *
 * Comportements (#335) :
 *   - cache si app déjà installée (display-mode: standalone)
 *   - iOS Safari : tap → ouvre la modale d'instructions manuelles
 *   - Chrome desktop/Android : tap → check storage, modal spinner pendant
 *     install, toast résultat selon userChoice
 *   - listener appinstalled → toast vert confirm
 *   - banner dismissable une fois par session (sessionStorage)
 *   - logs console verbeux (préfixe [PWA]) pour debug remote Chrome DevTools
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'talk2me_install_dismissed';
const BIP_FLAG_KEY = 'talk2me_bip_seen';
// Seuil sous lequel on warn l'utilisateur (Chrome rejette typiquement
// l'install si < quelques Mo disponibles)
const STORAGE_WARN_MB = 5;

type ToastKind = 'success' | 'warn' | 'neutral';

function Toast({
  kind,
  message,
  onClose,
}: {
  kind: ToastKind;
  message: string;
  onClose: () => void;
}) {
  // Auto-dismiss
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);

  const styles: Record<ToastKind, string> = {
    success: 'border-emerald-400/30 bg-emerald-500/[0.12] text-emerald-100',
    warn: 'border-amber-400/30 bg-amber-500/[0.12] text-amber-100',
    neutral: 'border-white/12 bg-white/[0.08] text-white/90',
  };

  return (
    <div
      data-testid="install-toast"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] rounded-2xl border px-4 py-3 text-[13px] font-medium shadow-xl backdrop-blur-xl ${styles[kind]}`}
      role="status"
    >
      {message}
    </div>
  );
}

function InstallingModal() {
  return (
    <div
      data-testid="install-modal"
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="rounded-3xl border border-white/12 bg-[#16161c] px-7 py-6 flex items-center gap-3 max-w-[88vw]">
        <Loader2 size={18} className="text-red-300 animate-spin" />
        <div className="text-white/90 text-[13.5px] font-medium">
          Installation en cours…
        </div>
      </div>
    </div>
  );
}

export function InstallAppButton({
  variant = 'inline',
}: {
  variant?: 'inline' | 'banner';
}) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(
    null
  );
  // Évite un rendu serveur incohérent (window non dispo en SSR)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Standalone ?
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setIsStandalone(standalone);
    if (standalone) {
      // eslint-disable-next-line no-console
      console.log('[PWA] standalone mode detected');
    }

    // iOS ?
    const ua = window.navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIos(ios);

    // Banner déjà dismissé sur cette session ?
    if (variant === 'banner') {
      try {
        if (sessionStorage.getItem(DISMISS_KEY) === '1') {
          setBannerDismissed(true);
        }
      } catch {
        // sessionStorage peut être bloqué (mode privé), on ignore
      }
    }

    // Capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      try {
        sessionStorage.setItem(BIP_FLAG_KEY, '1');
      } catch {
        // ignore
      }
      // eslint-disable-next-line no-console
      console.log('[PWA] beforeinstallprompt captured');
    };

    const installedHandler = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      setInstalling(false);
      setToast({
        kind: 'success',
        message: '✅ Talk2Me installée. Trouve l’icône sur ton écran d’accueil.',
      });
      // eslint-disable-next-line no-console
      console.log('[PWA] appinstalled fired');
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [variant]);

  const handleInstall = useCallback(async () => {
    // eslint-disable-next-line no-console
    console.log('[PWA] user clicked install');

    // Vérif storage avant prompt (Chrome rejette si quota dispo trop faible)
    if (navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const quotaMB = est.quota ? est.quota / (1024 * 1024) : 0;
        const usageMB = est.usage ? est.usage / (1024 * 1024) : 0;
        const availMB = quotaMB - usageMB;
        // eslint-disable-next-line no-console
        console.log(
          `[PWA] storage estimate: quota=${quotaMB.toFixed(
            1
          )} usage=${usageMB.toFixed(1)} available=${availMB.toFixed(1)} MB`
        );
        if (availMB > 0 && availMB < STORAGE_WARN_MB) {
          setToast({
            kind: 'warn',
            message: `Espace très faible (~${availMB.toFixed(
              1
            )} Mo). Libère de l’espace avant d’installer.`,
          });
          return;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[PWA] storage estimate failed', e);
      }
    }

    if (deferredPrompt) {
      setInstalling(true);
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        // eslint-disable-next-line no-console
        console.log('[PWA] prompt.userChoice:', choice.outcome);
        if (choice.outcome === 'accepted') {
          // appinstalled handler s'occupe du toast success
          // (mais en fallback si l'event ne fire pas, on toast quand même)
          setToast({
            kind: 'success',
            message:
              '✅ Talk2Me installée. Trouve l’icône sur ton écran d’accueil.',
          });
        } else {
          setToast({ kind: 'neutral', message: 'Installation annulée.' });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[PWA] prompt failed', err);
        setToast({
          kind: 'warn',
          message:
            'Installation impossible. Ouvre le menu Chrome (⋮) → Installer l’app.',
        });
      } finally {
        setDeferredPrompt(null);
        setInstalling(false);
      }
      return;
    }
    if (isIos) {
      setShowIosModal(true);
      return;
    }
    // Chrome n'a pas (encore) fired beforeinstallprompt → instructions manuelles
    setToast({
      kind: 'neutral',
      message:
        'Ouvre le menu Chrome (⋮) → « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
    });
  }, [deferredPrompt, isIos]);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  // Pas de rendu côté serveur (évite hydration mismatch sur display-mode)
  if (!mounted) return null;
  // Déjà installé → on cache complètement
  if (isStandalone) return null;
  // Banner dismissé pour cette session
  if (variant === 'banner' && bannerDismissed) return null;
  // iOS sans prompt natif : on garde le bouton ouvert (il déclenche la modale)
  // Chrome sans event ni iOS : on garde quand même le bouton (fallback toast)

  const overlays = (
    <>
      {installing && <InstallingModal />}
      {toast && (
        <Toast
          kind={toast.kind}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
      {showIosModal && (
        <IosInstallModal onClose={() => setShowIosModal(false)} />
      )}
    </>
  );

  if (variant === 'banner') {
    return (
      <>
        <div
          data-testid="install-app-banner"
          className="flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/[0.08] px-3 py-2.5 mx-3 mt-2"
        >
          <Smartphone
            size={16}
            className="text-red-300/90 shrink-0"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-white/90 font-medium leading-tight">
              Installer Talk2Me
            </div>
            <div className="text-[11.5px] text-white/55 leading-tight mt-0.5">
              Accès direct, plein écran, comme une app native.
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstall}
            disabled={installing}
            data-testid="install-app-button"
            className="shrink-0 h-8 px-3 rounded-full bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 border border-red-400/40 text-red-100 text-[12.5px] font-medium transition-colors"
          >
            Installer
          </button>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Masquer"
            className="shrink-0 p-1 rounded-full text-white/45 hover:text-white/85 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        {overlays}
      </>
    );
  }

  // variant = "inline" : pill sobre
  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        disabled={installing}
        data-testid="install-app-button"
        className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 border border-red-400/30 text-red-100 text-[12.5px] font-medium transition-colors"
      >
        <Smartphone size={14} aria-hidden="true" />
        Installer l&apos;app Talk2Me
      </button>
      {overlays}
    </>
  );
}

export default InstallAppButton;
