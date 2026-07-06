'use client';
/**
 * lib/compute/ondevice-ocr.ts — OCR ON-DEVICE générique (Pascal 2026-07-04).
 *
 * Échelle de capacités, MÊME appel pour tous les téléphones :
 *   1. NATIF (APK) : window.T2MVision (ML Kit, accéléré GPU/NPU) — le meilleur.
 *   2. WEB : Tesseract.js (WASM) — universel, marche partout, sans WebGPU.
 * L'image ne quitte JAMAIS l'appareil. Utilisé par le module Formation pour LIRE les
 * figures du PDF (tableaux, étiquettes, schémas) et nourrir les modules.
 * Voir [[project_talk2me_compute_mesh]], [[project_talk2me_formation_module]].
 */

// Label = classe détectée par ML Kit Image Labeling (ex. { text:'Chart', conf:0.82 }).
export interface VisionLabel { text: string; conf: number }
// Le pont natif renvoie SOIT { ok, text } (OCR) SOIT { ok, labels } (labeling) via le MÊME callback.
type VisionRes = { ok: boolean; text?: string; labels?: VisionLabel[] };
interface NativeVision {
  available?: () => boolean;
  recognizeText: (dataUrl: string, cbId: string) => void;
  labelImage?: (dataUrl: string, cbId: string) => void;
}
type W = Window & { T2MVision?: NativeVision; __t2mVisionCb?: (cbId: string, res: VisionRes) => void };

let seq = 0;
const pending = new Map<string, (r: VisionRes) => void>();

function ensureCb() {
  const w = window as W;
  if (w.__t2mVisionCb) return;
  w.__t2mVisionCb = (cbId, res) => { const fn = pending.get(cbId); if (fn) { pending.delete(cbId); fn(res); } };
}

/** Le pont natif GPU est-il présent (on est dans l'APK avec ML Kit) ? */
export function hasNativeVision(): boolean {
  try { const w = window as W; return !!(w.T2MVision && (!w.T2MVision.available || w.T2MVision.available())); } catch { return false; }
}

// Renvoie { ok } = le natif a RÉPONDU (ML Kit a tourné, même si la figure n'a pas de texte).
// ok:false = pont absent / timeout / exception → alors seulement on retombe en web.
function nativeOcr(dataUrl: string): Promise<{ ok: boolean; text: string }> {
  ensureCb();
  const w = window as W;
  const cbId = 'v' + (++seq);
  return new Promise((resolve) => {
    const to = setTimeout(() => { pending.delete(cbId); resolve({ ok: false, text: '' }); }, 30000);
    pending.set(cbId, (r) => { clearTimeout(to); resolve({ ok: !!r.ok, text: r.text || '' }); });
    try { w.T2MVision!.recognizeText(dataUrl, cbId); } catch { clearTimeout(to); pending.delete(cbId); resolve({ ok: false, text: '' }); }
  });
}

async function webOcr(dataUrl: string, onProgress?: (pct: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('fra+eng', 1, {
    logger: (m: { progress?: number }) => { if (typeof m.progress === 'number') onProgress?.(Math.round(m.progress * 100)); },
  });
  const { data } = await worker.recognize(dataUrl);
  await worker.terminate();
  return (data.text || '').trim();
}

/** Le pont natif de LABELING est-il présent (APK récent avec ML Kit Image Labeling) ? */
export function hasNativeLabeling(): boolean {
  try { const w = window as W; return !!(w.T2MVision && typeof w.T2MVision.labelImage === 'function'); } catch { return false; }
}

// Appelle le labeling natif (ML Kit Image Labeling, GPU/NPU). ok:false = pont absent/timeout.
function nativeLabel(dataUrl: string): Promise<{ ok: boolean; labels: VisionLabel[] }> {
  ensureCb();
  const w = window as W;
  const cbId = 'v' + (++seq);
  return new Promise((resolve) => {
    const to = setTimeout(() => { pending.delete(cbId); resolve({ ok: false, labels: [] }); }, 30000);
    pending.set(cbId, (r) => {
      clearTimeout(to);
      const labels = Array.isArray(r.labels) ? r.labels.filter((l): l is VisionLabel => !!l && typeof l.text === 'string') : [];
      resolve({ ok: !!r.ok, labels });
    });
    try { w.T2MVision!.labelImage!(dataUrl, cbId); } catch { clearTimeout(to); pending.delete(cbId); resolve({ ok: false, labels: [] }); }
  });
}

/**
 * Étiquette une image SUR L'APPAREIL via ML Kit Image Labeling (natif UNIQUEMENT, GPU/NPU).
 * Sert au filtre de figures du module Formation (garder les vraies figures, jeter les logos).
 * Pas de fallback web : le labeling n'existe qu'en natif → via:'none' (l'appelant DOIT alors
 * garder la figure, jamais la jeter : règle anti-catastrophe « ne plus jamais tout supprimer »).
 */
export async function labelImage(dataUrl: string): Promise<{ labels: VisionLabel[]; via: 'native' | 'none' }> {
  if (!hasNativeLabeling()) return { labels: [], via: 'none' };
  const r = await nativeLabel(dataUrl);
  if (!r.ok) return { labels: [], via: 'none' }; // pont a échoué → traité comme « pas d'info » = on garde
  return { labels: r.labels, via: 'native' };
}

/** Lit le texte d'une image SUR L'APPAREIL (natif si dispo, sinon web). */
export async function recognizeText(dataUrl: string, onProgress?: (pct: number) => void): Promise<{ text: string; via: 'native' | 'web' }> {
  const has = hasNativeVision();
  console.log('[T2M-OCR] hasNativeVision=' + has);
  if (has) {
    const r = await nativeOcr(dataUrl);
    console.log('[T2M-OCR] native reply ok=' + r.ok + ' textLen=' + (r.text || '').length);
    if (r.ok) { console.log('[T2M-OCR] => via=native (GPU/NPU ML Kit)'); return { text: r.text, via: 'native' }; }
  }
  console.log('[T2M-OCR] => via=web (Tesseract CPU)');
  return { text: await webOcr(dataUrl, onProgress), via: 'web' };
}
