'use client';
/**
 * ComputeWorker — le TÉLÉPHONE dans le pool qui TRAVAILLE (Pascal 2026-07-04).
 * Monté globalement, SILENCIEUX (aucune UI, on n'expose pas la mécanique). Si l'appareil est
 * un bon/moyen candidat et l'app visible : il prend une tâche (`claim`), télécharge la figure,
 * l'OCR sur SON GPU (natif/web), et renvoie le résultat (`result`). C'est le cœur du dispatch :
 * le calcul se fait sur les GPU des téléphones connectés. [[project_talk2me_compute_mesh]]
 */
import { useEffect, useRef } from 'react';
import { getDeviceProfile } from '@/lib/compute/device-profile';
import { scoreWorker } from '@/lib/compute/worker-score';
import { recognizeText, labelImage } from '@/lib/compute/ondevice-ocr';

export default function ComputeWorker() {
  const busy = useRef(false);
  const eligible = useRef(false);
  const deviceId = useRef('');

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const blobToDataUrl = (b: Blob) => new Promise<string>((ok, ko) => {
      const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = ko; fr.readAsDataURL(b);
    });

    const tick = async () => {
      if (stop) return;
      const idle = document.visibilityState === 'visible';
      if (eligible.current && !busy.current && idle) {
        busy.current = true;
        try {
          const r = await fetch('/api/compute/claim', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: deviceId.current }) });
          const d = await r.json();
          if (d?.task?.imageUrl) {
            const img = await fetch(d.task.imageUrl, { credentials: 'include' });
            const dataUrl = await blobToDataUrl(await img.blob());
            // Selon le type : LABEL (objets/couleurs, ML Kit) ou OCR (texte). Sur CE téléphone (GPU natif / web).
            let text = '', via: 'native' | 'web' | undefined;
            if (d.task.type === 'label') {
              const lab = await labelImage(dataUrl);
              text = JSON.stringify(lab.labels || []);
              via = lab.via === 'native' ? 'native' : undefined;
            } else {
              const o = await recognizeText(dataUrl);
              text = o.text; via = o.via;
            }
            await fetch('/api/compute/result', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: d.task.id, device_id: deviceId.current, text, via }) });
            busy.current = false;
            timer = setTimeout(tick, 150); // enchaîne s'il reste des tâches
            return;
          }
        } catch { /* réseau : on retentera */ }
        busy.current = false;
      }
      timer = setTimeout(tick, 4000); // rien à faire → repoll tranquille
    };

    (async () => {
      try {
        const p = await getDeviceProfile();
        deviceId.current = p.device_id;
        // Doctrine : seuls les MOBILES bossent (le desktop envoie, les GPU mobiles traitent).
        const isMobile = p.native || p.platform === 'android' || p.platform === 'ios';
        eligible.current = isMobile && scoreWorker(p).tier !== 'weak';
        try { await fetch('/api/compute/worker', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }); } catch {}
      } catch { /* détection impossible → on ne bosse pas */ }
      tick();
    })();

    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, []);

  return null;
}
