/**
 * Talk2Me Admin Fuzz API #405 (Pascal 2026-06-05).
 *
 * POST /api/admin/fuzz/run { profiles: 'all'|string[], count: number, rate?: number }
 *
 * Lance le fuzz en background (spawn `node scripts/ai-fuzz-tester/index.mjs`).
 * Retourne immédiatement avec le PID. Le rapport apparaîtra dans
 * /reports/fuzz/ + ligne dans la DB fuzz_run.
 *
 * Auth admin via env FUZZ_ADMIN_USER_IDS=<csv> ou FUZZ_ADMIN_EMAILS=<csv>.
 *
 * Sécurité : pas d'injection — args parsés/validés avant spawn.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { spawn } from 'node:child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Note Turbopack #405 : on construit le chemin script à RUNTIME via
// process.cwd() + join dynamique pour éviter que Turbopack tente de le
// bundler comme un import relatif statique.
function getScriptPath(): string {
  const root = process.env.TALKTOME_REPO_ROOT || process.cwd();
  const parts = ['scripts', 'ai-fuzz-tester', 'index.mjs'];
  return [root, ...parts].join('/');
}
function getRepoRoot(): string {
  return process.env.TALKTOME_REPO_ROOT || process.cwd();
}

const VALID_PROFILES = new Set([
  'novice', 'presse', 'fautes', 'abrege', 'hotels',
  'musique', 'voyage', 'business', 'limites', 'all',
]);

function isAdmin(userId: string, email: string | null | undefined): boolean {
  const ids = (process.env.FUZZ_ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.includes(userId)) return true;
  const emails = (process.env.FUZZ_ADMIN_EMAILS || 'pascal.repir@gmail.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (email && emails.includes(email.toLowerCase())) return true;
  return false;
}

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me || !isAdmin(me.id, me.email)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  let body: { profiles?: unknown; count?: unknown; rate?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }

  const profilesRaw = Array.isArray(body.profiles)
    ? body.profiles
    : typeof body.profiles === 'string'
      ? [body.profiles]
      : ['all'];
  const profiles = profilesRaw
    .map((p) => String(p).trim().toLowerCase())
    .filter((p) => VALID_PROFILES.has(p));
  if (profiles.length === 0) {
    return NextResponse.json({ error: 'no_valid_profiles' }, { status: 400 });
  }
  const count = Math.min(500, Math.max(1, Number(body.count) || 10));
  const rate = Math.min(5000, Math.max(50, Number(body.rate) || 200));

  const scriptPath = getScriptPath();
  const args = [
    scriptPath,
    `--profiles=${profiles.join(',')}`,
    `--count=${count}`,
    `--rate=${rate}`,
  ];

  // Spawn detached pour qu'il survive à la requête HTTP. Le script est
  // résolu relativement à cwd=REPO_ROOT (cf. note Turbopack ci-dessus).
  const child = spawn('node', args, {
    cwd: getRepoRoot(),
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();

  return NextResponse.json({
    ok: true,
    pid: child.pid,
    profiles,
    count,
    rate,
    started_by: me.username,
    note: 'Run started in background. Check /admin/fuzz dashboard for results.',
  });
}
