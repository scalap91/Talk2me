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
import { writeFile, readFile, mkdir, readdir, access, unlink } from 'fs/promises';
import path from 'path';
import { serializeCard, parseCard, type SuperCard } from '@/lib/cards/supercard';
import type { SuperCardV2 } from '@/lib/cards/v2/types';
import { validateCard } from '@/lib/cards/v2/validate';

const DATA_DIR = path.join(process.cwd(), 'data', 'cards');      // durable (exclu du rsync)
const PUBLIC_DIR = path.join(process.cwd(), 'public', 'cards');  // démos livrées au build (lecture seule)

const isV2 = (c: unknown): c is SuperCardV2 =>
  !!c && typeof c === 'object' && (c as { format?: unknown }).format === 't2m.card' && (c as { spec?: unknown }).spec === 2;

/**
 * PRODUIT : écrit un vrai fichier `.card` durable. Renvoie son URL de partage.
 * SPEC-AWARE (Pascal 2026-07-21) : une carte spec:2 (project/mission/resource…) est VALIDÉE par le
 * rempart canonique AVANT écriture (le .card reste la source — une carte invalide n'entre pas), puis
 * sérialisée en JSON. Le chemin spec:1 legacy (serializeCard) est INCHANGÉ.
 */
export async function writeCardFile(card: SuperCard | SuperCardV2): Promise<string> {
  await mkdir(DATA_DIR, { recursive: true });
  let body: string;
  if (isV2(card)) {
    const v = validateCard(card);
    if (!v.ok) throw new CardValidationError(v.errors.map((e) => `${e.path}: ${e.message}`));
    body = JSON.stringify(card);
  } else {
    body = serializeCard(card as SuperCard);
  }
  await writeFile(path.join(DATA_DIR, `${card.id}.card`), body, 'utf8');
  return `/api/card-file/${card.id}`;
}

/**
 * SUPPRIME le fichier `.card` durable (data/cards/). Les démos `public/cards/` sont EN LECTURE SEULE
 * (livrées au build) : on n'y touche jamais. Renvoie true si un fichier a été retiré.
 * La suppression du FICHIER est la vérité (le .card est la source) — l'index DB suit.
 */
export async function deleteCardFile(id: string): Promise<boolean> {
  try { await unlink(path.join(DATA_DIR, `${id}.card`)); return true; } catch { return false; }
}

/** Erreur d'écriture : la carte spec:2 n'a pas passé le rempart canonique (argent/PII/schéma). */
export class CardValidationError extends Error {
  constructor(public issues: string[]) { super(`carte invalide : ${issues.slice(0, 5).join(' ; ')}`); this.name = 'CardValidationError'; }
}

/** LIT un fichier `.card` spec:2 par id (project/mission/resource…). null si absent ou non-spec:2. */
export async function readCardFileV2(id: string): Promise<SuperCardV2 | null> {
  const raw = await readCardFileRaw(id);
  if (!raw) return null;
  try { const o = JSON.parse(raw); if (isV2(o)) return o as SuperCardV2; } catch { /* pas du JSON spec:2 */ }
  return null;
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
