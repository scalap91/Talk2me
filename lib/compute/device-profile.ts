'use client';
/**
 * lib/compute/device-profile.ts — Profil de calcul d'un appareil (Pascal 2026-07-04).
 *
 * Première brique du COMPUTE MESH T2M : chaque appareil rapporte ses capacités (GPU,
 * WebGPU, cœurs, RAM, natif/charge) → le serveur ne retient que les BONS CANDIDATS comme
 * « ouvriers ». Tourne dans le navigateur ET dans le webview de l'APK Capacitor (enrichi
 * par les plugins natifs Device/Battery quand ils sont là). Voir [[project_talk2me_compute_mesh]].
 */

export interface DeviceProfile {
  device_id: string;
  platform: 'android' | 'ios' | 'web';
  native: boolean;          // dans l'APK/native (Capacitor) ?
  webgpu: boolean;          // adaptateur WebGPU réellement obtenu
  gpu: string | null;       // renderer GPU (WebGL UNMASKED)
  cores: number;            // hardwareConcurrency
  memory_gb: number | null; // deviceMemory (Chrome)
  charging: boolean | null; // en charge ? (bon moment pour bosser la nuit)
  model: string | null;     // modèle natif si dispo
  ua: string;
}

function stableDeviceId(): string {
  try {
    const k = 't2m_device_id';
    let id = localStorage.getItem(k);
    if (!id) { id = (globalThis.crypto?.randomUUID?.() || `dev_${Date.now()}_${Math.round(Math.random() * 1e9)}`); localStorage.setItem(k, id); }
    return id;
  } catch { return `dev_${Date.now()}`; }
}

/** Renderer GPU via WebGL (donne « Adreno 730 », « Apple A16 GPU », etc.). */
function gpuRenderer(): string | null {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
  } catch { return null; }
}

/** WebGPU RÉEL : on demande un adaptateur (présence de navigator.gpu ne suffit pas). */
async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch { return false; }
}

export async function getDeviceProfile(): Promise<DeviceProfile> {
  const nav = navigator as unknown as { hardwareConcurrency?: number; deviceMemory?: number; userAgent?: string; getBattery?: () => Promise<{ charging: boolean }> };
  const ua = nav.userAgent || '';
  // Capacitor natif (APK) : plateforme + modèle + batterie fiables si les plugins sont présents.
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  const native = !!cap?.isNativePlatform?.();
  const platform: DeviceProfile['platform'] =
    (cap?.getPlatform?.() as DeviceProfile['platform']) ||
    (/android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'web');

  let charging: boolean | null = null;
  try { if (nav.getBattery) charging = (await nav.getBattery()).charging; } catch { /* */ }

  return {
    device_id: stableDeviceId(),
    platform,
    native,
    webgpu: await hasWebGPU(),
    gpu: gpuRenderer(),
    cores: nav.hardwareConcurrency || 0,
    memory_gb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    charging,
    model: null, // enrichi par le plugin natif Device quand branché
    ua,
  };
}
