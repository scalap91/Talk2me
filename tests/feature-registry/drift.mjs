#!/usr/bin/env node
/**
 * Talk2Me #409 — Anti-drift detector.
 *
 * Compare les routes API présentes sur disque (app/api/**) avec celles
 * couvertes dans registry.json. Alerte si une route existe sans test.
 *
 * Usage : node tests/feature-registry/drift.mjs [--no-telegram]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = path.join(__dirname, 'registry.json');
const API_ROOT = path.join(REPO_ROOT, 'app', 'api');
const TG_SEND_PATH = '/home/ubuntu/tg-bridge/tg-send';
const NO_TG = process.argv.includes('--no-telegram');

function walkApi(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkApi(full, acc);
    else if (entry === 'route.ts' || entry === 'route.tsx') acc.push(full);
  }
  return acc;
}

function routeFromPath(file) {
  const rel = file.replace(API_ROOT, '').replace(/\\/g, '/');
  // /folder/route.ts → /api/folder
  const noFile = rel.replace(/\/route\.tsx?$/, '');
  return `/api${noFile}`;
}

function notifyTelegram(msg) {
  if (NO_TG || !existsSync(TG_SEND_PATH)) { console.log('TG SKIP ⇒', msg.split('\n')[0]); return; }
  try { spawn(TG_SEND_PATH, [msg], { detached: true, stdio: 'ignore' }).unref(); } catch {}
}

const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const covered = new Set();
for (const f of reg.features || []) {
  const desc = (f.description || '') + ' ' + (f.name || '');
  const m = desc.match(/\/api\/[a-zA-Z0-9\-_/\[\]]+/g);
  if (m) for (const route of m) covered.add(route);
}

const onDisk = walkApi(API_ROOT).map(routeFromPath).sort();
const onDiskSet = new Set(onDisk);

// Normalise : on considère qu'une route /api/x/[id]/y est couverte si covered
// contient /api/x ou un préfixe correspondant
function isCovered(route) {
  if (covered.has(route)) return true;
  for (const c of covered) {
    // covered avec [id] = wildcard
    const regex = new RegExp('^' + c.replace(/\[[^\]]+\]/g, '[^/]+').replace(/\//g, '\\/') + '$');
    if (regex.test(route)) return true;
  }
  // tolérance : route avec [id] couverte si version sans [id] est couverte
  const stripped = route.replace(/\/\[[^\]]+\]/g, '');
  if (covered.has(stripped)) return true;
  return false;
}

const missing = onDisk.filter((r) => !isCovered(r));

console.log(`Routes API on disk : ${onDisk.length}`);
console.log(`Routes couvertes par registry : ${onDisk.length - missing.length}`);
console.log(`Routes SANS test : ${missing.length}`);
if (missing.length) {
  for (const r of missing) console.log(`  - ${r}`);
}

if (missing.length > 0 && missing.length <= 20) {
  notifyTelegram([
    `⚠️ Talk2Me Feature Registry — DRIFT détecté`,
    ``,
    `${missing.length} route(s) API sans test :`,
    ...missing.slice(0, 12).map((r) => `• ${r}`),
    ``,
    `Ajoute-les via : npm run features:add "<name>" --module=<mod> --task=#X`,
  ].join('\n'));
}

process.exit(missing.length > 0 ? 1 : 0);
