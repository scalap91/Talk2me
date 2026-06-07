/**
 * Talk2Me #408b — Source reader pour la Boussole technique (Pascal 2026-06-05).
 *
 * Lit en runtime un fichier source du repo Talk2Me et le renvoie tronqué pour
 * affichage dans /schema/[id]. Sécurise contre les traversals (path resolve
 * dans process.cwd, refus si évadé).
 *
 * Verbatim Pascal : "POURQUOI DANS LA BOUSSOLE ON NE VOIT PAS DE CODE NI DE
 * SCHEMA GRAPHIQUE DES MODULE".
 *
 * Doctrine [[airbizness-schema-technique]] : page = miroir du code.
 */

import { readFile } from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';

export interface SourceResult {
  path: string;
  language: string;
  lines: number;
  truncated: boolean;
  content: string;
  error: string | null;
}

const MAX_LINES = 500;
const MAX_BYTES = 200_000; // ~ 200 KB safety

/** Map extension → langage Prism. */
function detectLanguage(p: string): string {
  const ext = extname(p).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs')
    return 'javascript';
  if (ext === '.json') return 'json';
  if (ext === '.md') return 'markdown';
  if (ext === '.css') return 'css';
  if (ext === '.sh') return 'bash';
  if (ext === '.sql') return 'sql';
  if (ext === '.html') return 'html';
  return 'text';
}

/**
 * Lit le contenu d'un fichier source, troqué à MAX_LINES.
 * Le path doit être relatif à la racine du repo Talk2Me.
 */
export async function readModuleSource(
  relativePath: string,
): Promise<SourceResult> {
  const root = process.cwd();
  const abs = resolve(root, relativePath);
  const safe = relative(root, abs);

  // Anti path-traversal : refuse si le résultat sort de la racine.
  if (safe.startsWith('..') || safe.startsWith(sep) || safe.includes('..' + sep)) {
    return {
      path: relativePath,
      language: 'text',
      lines: 0,
      truncated: false,
      content: '',
      error: 'Path traversal interdit',
    };
  }

  try {
    const raw = await readFile(abs, 'utf8');
    if (raw.length > MAX_BYTES) {
      // On lit quand même mais on tronque hard à MAX_BYTES avant de couper en lignes
      const head = raw.slice(0, MAX_BYTES);
      const lines = head.split('\n');
      return {
        path: relativePath,
        language: detectLanguage(relativePath),
        lines: lines.length,
        truncated: true,
        content: lines.slice(0, MAX_LINES).join('\n'),
        error: null,
      };
    }
    const lines = raw.split('\n');
    const truncated = lines.length > MAX_LINES;
    return {
      path: relativePath,
      language: detectLanguage(relativePath),
      lines: lines.length,
      truncated,
      content: truncated ? lines.slice(0, MAX_LINES).join('\n') : raw,
      error: null,
    };
  } catch (e) {
    return {
      path: relativePath,
      language: detectLanguage(relativePath),
      lines: 0,
      truncated: false,
      content: '',
      error: (e as Error).message,
    };
  }
}

/**
 * Extrait les imports `from '@/...'` ou `from './...'` d'un contenu TS/JS.
 * Retourne la liste dédupliquée. Utilisé pour suggérer les dépendances code.
 */
export function extractImports(content: string): string[] {
  const re = /from\s+['"]([^'"]+)['"]/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const imp = m[1];
    if (imp.startsWith('@/') || imp.startsWith('./') || imp.startsWith('../')) {
      set.add(imp);
    }
  }
  return Array.from(set).sort();
}
