/**
 * /home/ubuntu/talktome/lib/audio-lib-resolver.ts
 *
 * Talk2Me #420 — résout un audio_url public vers son chemin disque pour
 * pouvoir le passer à ffmpeg.
 *
 * Deux préfixes autorisés :
 *  - /audio-lib/<category>/<file>.mp3 → catalogue libre de droits
 *  - /uploads/<file>.(mp3|m4a|wav|...)  → musique uploadée par l'user
 *
 * Sécurité :
 *  - On force `path.basename` pour empêcher path traversal
 *  - On vérifie l'extension (whitelist)
 *  - On vérifie l'existence du fichier
 *
 * Retourne null si invalide.
 */

import path from 'path';
import { existsSync } from 'fs';

const AUDIO_LIB_DIR = process.cwd() + '/public/audio-lib';
const UPLOAD_DIR = process.cwd() + '/public/uploads';

const AUDIO_LIB_PREFIX = '/audio-lib/';
const UPLOAD_PREFIX = '/uploads/';

const CATEGORIES = new Set(['chill', 'energetic', 'dramatic', 'lofi', 'ambient']);
const AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|ogg|weba|mp4)$/i;

export function resolveAudioSourcePath(url: string): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();

  // --- Lib catalogue ---
  if (trimmed.startsWith(AUDIO_LIB_PREFIX)) {
    const rest = trimmed.slice(AUDIO_LIB_PREFIX.length);
    const segments = rest.split('/').filter(Boolean);
    if (segments.length !== 2) return null;
    const [cat, file] = segments;
    if (!CATEGORIES.has(cat)) return null;
    const filename = path.basename(file);
    if (!filename || filename.startsWith('.')) return null;
    if (!AUDIO_EXT_RE.test(filename)) return null;
    const fullPath = path.join(AUDIO_LIB_DIR, cat, filename);
    // sécurité supplémentaire : le chemin résolu doit rester sous AUDIO_LIB_DIR
    if (!fullPath.startsWith(AUDIO_LIB_DIR + path.sep)) return null;
    if (!existsSync(fullPath)) return null;
    return fullPath;
  }

  // --- Upload utilisateur ---
  if (trimmed.startsWith(UPLOAD_PREFIX)) {
    const rest = trimmed.slice(UPLOAD_PREFIX.length);
    const filename = path.basename(rest);
    if (!filename || filename.startsWith('.')) return null;
    if (!AUDIO_EXT_RE.test(filename)) return null;
    const fullPath = path.join(UPLOAD_DIR, filename);
    if (!fullPath.startsWith(UPLOAD_DIR + path.sep)) return null;
    if (!existsSync(fullPath)) return null;
    return fullPath;
  }

  return null;
}
