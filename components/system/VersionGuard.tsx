'use client';
/**
 * VersionGuard — RECHARGE AUTO sur nouveau déploiement (Pascal 2026-07-13).
 *
 * L'app Capacitor garde le bundle JS en mémoire tant que le process vit → après un déploiement,
 * "fermer/rouvrir" ne recharge pas forcément le document → vieux code (le "fantôme", des heures
 * perdues). Ici : à l'ouverture ET à chaque retour au premier plan, on compare la version DÉPLOYÉE
 * (/api/version, jamais cachée) à celle du bundle chargé (APP_V). Si ça diffère → un déploiement a
 * eu lieu → on recharge une fois (garde-fou anti-boucle). Plus JAMAIS besoin de vider le cache.
 */
import { useEffect } from 'react';
import { APP_V } from '@/lib/app-version';

export default function VersionGuard() {
  useEffect(() => {
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        const d = await r.json();
        const live = String(d?.v || '');
        // APP_V est un littéral figé au build ; on l'élargit en string pour que la
        // comparaison runtime reste légitime (sinon TS la juge « impossible »).
        const appV: string = APP_V;
        // APP_V='0' = build local non tagué → on ne fait rien (évite les recharges en dev local).
        if (live && appV !== '0' && live !== appV) {
          const k = 't2m_reloaded_' + live;
          if (!sessionStorage.getItem(k)) { // anti-boucle : une seule recharge par version
            sessionStorage.setItem(k, '1');
            location.reload();
            return;
          }
        }
      } catch { /* réseau : on retentera au prochain focus */ }
      busy = false;
    };
    check();
    const onVis = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(check, 60000); // filet : re-check toutes les 60 s si l'app reste ouverte
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(id); };
  }, []);

  return null;
}
