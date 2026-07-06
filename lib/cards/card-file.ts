import 'server-only';
/**
 * Talk2Me — le `.card` comme vrai FICHIER DURABLE (Pascal 2026-07-03).
 *
 * PRODUCTEUR : écrit la SuperCard dans `data/cards/<id>.card`.
 *   → `data/` est exclu du rsync de déploiement (comme la DB) donc le fichier
 *     SURVIT aux déploiements (contrairement à `public/`, remis à zéro et que Next
 *     ne sert de toute façon qu'au build-time).
 * LECTEUR : lit `data/cards/` puis, en repli, `public/cards/` (les démos livrées au build).
 * PARTAGE : l'URL envoyable est `/api/card-file/<id>` (durable, sert le fichier avec le bon
 *   Content-Type + filename, avec repli sur l'index moteur si le fichier manque).
 * La base `cards` reste l'INDEX ; le fichier `.card` est l'artefact source partageable.
 */
import { writeFile, readFile, mkdir, readdir, access } from 'fs/promises';
import path from 'path';
import { serializeCard, parseCard, type SuperCard } from '@/lib/cards/supercard';

const DATA_DIR = path.join(process.cwd(), 'data', 'cards');      // durable (exclu du rsync)
const PUBLIC_DIR = path.join(process.cwd(), 'public', 'cards');  // démos livrées au build (lecture seule)

/** PRODUIT : écrit un vrai fichier `.card` durable. Renvoie son URL de partage. */
export async function writeCardFile(card: SuperCard): Promise<string> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, `${card.id}.card`), serializeCard(card), 'utf8');
  return `/api/card-file/${card.id}`;
}

/** OÙ est stockée la carte : chemin relatif du fichier `.card` (data/ ou démos public/), ou null. */
export async function cardFilePath(id: string): Promise<string | null> {
  const dirs: Array<[string, string]> = [['data/cards', DATA_DIR], ['public/cards', PUBLIC_DIR]];
  for (const [rel, dir] of dirs) {
    try { await access(path.join(dir, `${id}.card`)); return `${rel}/${id}.card`; } catch { /* dossier suivant */ }
  }
  return null;
}

/** LIT le TEXTE brut d'un fichier `.card` (data/ puis démos public/), sans parser. */
export async function readCardFileRaw(id: string): Promise<string | null> {
  for (const dir of [DATA_DIR, PUBLIC_DIR]) {
    try {
      return await readFile(path.join(dir, `${id}.card`), 'utf8');
    } catch { /* dossier suivant */ }
  }
  return null;
}

/** LIT un fichier `.card` par id → SuperCard (data/ d'abord, puis démos public/). */
export async function readCardFile(id: string): Promise<SuperCard | null> {
  for (const dir of [DATA_DIR, PUBLIC_DIR]) {
    try {
      const text = await readFile(path.join(dir, `${id}.card`), 'utf8');
      const r = parseCard(text);
      if (r.ok && r.card) return r.card;
    } catch { /* dossier suivant */ }
  }
  return null;
}

/** Liste les ids des fichiers `.card` présents (data/ + démos public/). */
export async function listCardFiles(): Promise<string[]> {
  const ids = new Set<string>();
  for (const dir of [DATA_DIR, PUBLIC_DIR]) {
    try {
      const files = await readdir(dir);
      for (const f of files) if (f.endsWith('.card')) ids.add(f.slice(0, -5));
    } catch { /* dossier absent */ }
  }
  return [...ids];
}
