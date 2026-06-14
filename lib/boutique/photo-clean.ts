'use server-only';

/**
 * Nettoyage photo produit boutique (Pascal 2026-06-11). Détourage `rembg` +
 * fond propre, SUR NOTRE SERVEUR (CPU, sans GPU). L'ORIGINALE est TOUJOURS
 * conservée — on écrit une nouvelle image, on ne touche jamais à la source.
 * Grounding : on améliore le vrai produit, on n'invente rien.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

const PY = '/home/ubuntu/rembg-venv/bin/python3';
const SCRIPT = '/home/ubuntu/talktome/scripts/rembg_clean.py';
const PUBLIC = '/home/ubuntu/talktome/public';
const OUT_DIR = path.join(PUBLIC, 'uploads', 'clean');

export function photoCleanAvailable(): boolean {
  return existsSync(PY) && existsSync(SCRIPT);
}

/** /uploads/x.jpg → chemin absolu (seulement nos uploads, pas d'URL externe). */
function resolveLocal(imageUrl: string): string | null {
  if (!imageUrl?.startsWith('/uploads/')) return null;
  const p = path.join(PUBLIC, imageUrl.replace(/^\//, ''));
  return existsSync(p) ? p : null;
}

/**
 * Nettoie une photo produit. bg : 'white' | 'soft' | 'none' (PNG transparent).
 * Retourne la NOUVELLE url /uploads (l'originale reste intacte) ou null.
 */
export function cleanProductPhoto(imageUrl: string, bg: 'white' | 'soft' | 'none' | 'enhance' = 'white'): Promise<string | null> {
  return new Promise(async (resolve) => {
    if (!photoCleanAvailable()) return resolve(null);
    const src = resolveLocal(imageUrl);
    if (!src) return resolve(null);
    try {
      const { mkdir } = await import('fs/promises');
      if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
      const ext = bg === 'none' ? 'png' : 'jpg';
      const name = `clean-${randomUUID()}.${ext}`;
      const out = path.join(OUT_DIR, name);
      const child = spawn(PY, [SCRIPT, src, out, bg], { stdio: ['ignore', 'ignore', 'pipe'] });
      const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 120000);
      child.on('error', () => { clearTimeout(to); resolve(null); });
      child.on('close', (code) => {
        clearTimeout(to);
        resolve(code === 0 && existsSync(out) ? `/uploads/clean/${name}` : null);
      });
    } catch { resolve(null); }
  });
}
