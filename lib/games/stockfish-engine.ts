/**
 * Talk2Me #408 — Wrapper Node.js pour Stockfish 18 WASM (Pascal 2026-06-05).
 *
 * On spawn le binaire JS du package `stockfish` via child_process (UCI sur
 * stdin/stdout). Une seule instance par appel (spawn court, kill après best
 * move trouvé) — pas de pool ni de réutilisation : le coût est ~150ms pour
 * load + 500ms pour move time, acceptable pour une partie tour par tour.
 *
 * Skill level : 5 (niveau amateur fort, ~1500 ELO). Configurable via
 * STOCKFISH_SKILL_LEVEL env. Movetime : 800ms par défaut, ajustable via
 * STOCKFISH_MOVETIME_MS.
 *
 * Si Stockfish indisponible (binaire manquant, crash spawn) on tombe sur un
 * fallback : un coup random légal via chess.js. Doctrine
 * [[talktome-produit-abouti]] : la partie continue, jamais bloquée.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { Chess } from 'chess.js';

const SKILL_LEVEL = clampInt(process.env.STOCKFISH_SKILL_LEVEL, 0, 20, 5);
const MOVETIME_MS = clampInt(process.env.STOCKFISH_MOVETIME_MS, 100, 5000, 800);
const SPAWN_TIMEOUT_MS = MOVETIME_MS + 4000;

function clampInt(v: string | undefined, min: number, max: number, def: number): number {
  if (!v) return def;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function resolveEnginePath(): string {
  // node_modules/stockfish/bin/stockfish.js charge la variante optimale.
  return path.join(
    process.cwd(),
    'node_modules',
    'stockfish',
    'bin',
    'stockfish.js'
  );
}

/**
 * Demande à Stockfish le meilleur coup depuis une position FEN.
 * Retourne le coup au format UCI (ex "e2e4", "e7e8q" pour promotion).
 *
 * Si l'engine échoue, retourne un coup légal random via chess.js (fallback).
 */
export async function pickBestChessMoveUci(fen: string): Promise<string | null> {
  // Validation : si pas de coup légal, on ne lance même pas l'engine
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;
    // Tente Stockfish
    try {
      const uci = await runStockfishOnce(fen);
      if (uci && /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) return uci.toLowerCase();
    } catch (e) {
      console.warn('[stockfish] engine error, falling back to random', e);
    }
    // Fallback : coup random légal
    const pick = moves[Math.floor(Math.random() * moves.length)];
    const promo = pick.promotion ? pick.promotion : '';
    return `${pick.from}${pick.to}${promo}`;
  } catch (e) {
    console.error('[stockfish] invalid fen?', e);
    return null;
  }
}

function runStockfishOnce(fen: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const enginePath = resolveEnginePath();
    let child;
    try {
      child = spawn(process.execPath, [enginePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      reject(e);
      return;
    }
    let resolved = false;
    let buf = '';
    const cleanup = () => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    };
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error('stockfish timeout'));
    }, SPAWN_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf-8');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        // Cherche "bestmove xxxx [ponder yyyy]"
        const m = line.match(/^bestmove\s+(\S+)/);
        if (m) {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          cleanup();
          if (m[1] === '(none)' || m[1] === '0000') {
            resolve(null);
          } else {
            resolve(m[1]);
          }
          return;
        }
      }
    });
    child.stderr.on('data', () => { /* ignore */ });
    child.on('error', (e) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanup();
      reject(e);
    });
    child.on('exit', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      // Si on n'a pas eu de bestmove avant exit, c'est un fail
      reject(new Error('stockfish exit without bestmove'));
    });

    const send = (cmd: string) => {
      try {
        child.stdin.write(cmd + '\n');
      } catch (e) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        cleanup();
        reject(e);
      }
    };

    // Sequence UCI
    send('uci');
    send(`setoption name Skill Level value ${SKILL_LEVEL}`);
    send('isready');
    send(`position fen ${fen}`);
    send(`go movetime ${MOVETIME_MS}`);
  });
}
