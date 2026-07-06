/**
 * Stockage de fichiers UNIFIÉ — seam multi-serveur (Pascal 2026-06-30).
 * Aujourd'hui : disque LOCAL (public/uploads, servi sur /uploads/...). Demain
 * multi-serveur : on branche un OBJECT STORAGE (S3 / MinIO / Cloudflare R2) ICI →
 * les fichiers deviennent partagés entre tous les serveurs SANS réécriture.
 *
 * Pourquoi : un fichier uploadé sur le disque du serveur A n'existe PAS sur le
 * serveur B → en multi-serveur, les uploads disque local cassent en premier. Ce
 * module est LE point unique de bascule.
 *
 * Migration cible : poser `STORAGE_BACKEND=s3` + creds (S3_BUCKET/S3_ENDPOINT/…),
 * implémenter la branche s3 ci-dessous. Les appelants ne changent pas.
 */
import fs from 'node:fs';
import path from 'node:path';

const BACKEND = process.env.STORAGE_BACKEND || 'local';
const PUBLIC_DIR = path.join(process.cwd(), 'public');

/** Écrit un fichier public et renvoie son URL servable.
 *  relKey ex: "uploads/abc.jpg" → renvoie "/uploads/abc.jpg" (local) ou l'URL CDN (s3). */
export async function storagePutPublic(relKey: string, data: Buffer | Uint8Array): Promise<string> {
  const key = relKey.replace(/^\/+/, '');
  // if (BACKEND === 's3') { return s3Put(key, data); }   // ← seam multi-serveur (renvoie l'URL CDN)
  const full = path.join(PUBLIC_DIR, key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  return '/' + key;
}

/** URL publique d'une clé déjà stockée. */
export function storagePublicUrl(relKey: string): string {
  const key = relKey.replace(/^\/+/, '');
  // if (BACKEND === 's3') { return s3Url(key); }          // ← seam
  return '/' + key;
}

/** Supprime un objet (best-effort). */
export async function storageDelete(relKey: string): Promise<void> {
  const key = relKey.replace(/^\/+/, '');
  // if (BACKEND === 's3') { return s3Delete(key); }       // ← seam
  try { fs.unlinkSync(path.join(PUBLIC_DIR, key)); } catch { /* */ }
}

export function storageBackend() { return BACKEND; }
