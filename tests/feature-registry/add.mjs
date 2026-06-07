#!/usr/bin/env node
/**
 * Talk2Me #409 — CLI ajout feature.
 *
 * Usage :
 *   node tests/feature-registry/add.mjs "Drag reorder" --module=drafts-page --task=#383
 *   node tests/feature-registry/add.mjs "Foo" --module=bar --id=ui-foo --scaffold
 *
 * Effets :
 *   1. Ajoute la feature dans registry.json (idempotent par id)
 *   2. Si --scaffold : crée un check skeleton dans checks/<id>.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY = path.join(__dirname, 'registry.json');
const CHECKS_DIR = path.join(__dirname, 'checks');

const args = process.argv.slice(2);
function argVal(name) {
  const f = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!f) return null;
  if (f === `--${name}`) return true;
  return f.split('=').slice(1).join('=');
}

const positional = args.filter((a) => !a.startsWith('--'));
const name = positional.join(' ').trim();
const module_ = argVal('module');
const task = argVal('task');
const explicitId = argVal('id');
const scaffold = argVal('scaffold') === true;
const description = argVal('description') || null;

if (!name || !module_) {
  console.error('Usage : add.mjs "Name" --module=<mod> [--task=#N] [--id=<id>] [--scaffold] [--description="..."]');
  process.exit(2);
}

const id = explicitId || (module_ + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 64);

const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
reg.features = reg.features || [];
const exists = reg.features.find((f) => f.id === id);
if (exists) {
  console.log(`[add] feature ${id} existe déjà — update name/module/task`);
  exists.module = module_;
  exists.name = name;
  if (task) exists.added_in_task = task;
  if (description) exists.description = description;
} else {
  reg.features.push({
    id, module: module_, name, description, added_in_task: task || null,
  });
  console.log(`[add] nouvelle feature ${id}`);
}
writeFileSync(REGISTRY, JSON.stringify(reg, null, 2));

if (scaffold) {
  const target = path.join(CHECKS_DIR, `${id}.mjs`);
  if (existsSync(target)) {
    console.log(`[add] check ${id}.mjs existe déjà — pas écrasé`);
  } else {
    writeFileSync(target, `/**
 * Talk2Me #409 — Check ${id}.
 * Feature : ${name}
 * Module : ${module_}
 * Task : ${task || ''}
 */
import { safeFetch, DEFAULT_BASE_URL } from '../_helpers.mjs';

export const FEATURE = { id: '${id}' };
export async function run(ctx) {
  const t0 = Date.now();
  const base = ctx.fetchUrl || DEFAULT_BASE_URL;
  // TODO : remplacer par le vrai check.
  const r = await safeFetch(\`\${base}/\`);
  const passed = r.status === 200;
  return {
    passed,
    duration_ms: Date.now() - t0,
    error: passed ? null : \`HTTP \${r.status}\`,
    evidence: { url: '/', status: r.status },
  };
}
`);
    console.log(`[add] check scaffold créé : ${target}`);
  }
}

console.log('OK.');
