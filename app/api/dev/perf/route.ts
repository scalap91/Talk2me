/**
 * /api/dev/perf — collecteur RUM (Real User Monitoring), DEV uniquement (Pascal 2026-08-27).
 * POST : le device réel envoie ses métriques feed (FCP/LCP/CLS/longtasks/réseau) → append JSONL.
 * GET  : lit les dernières entrées (pour lecture par l'agent). Pas de PII (juste UA + réseau).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILE = path.join(process.cwd(), 'data', 'perf-rum.jsonl');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid' }, { status: 400 });
    const rec = { ...body, at: Date.now(), ua: request.headers.get('user-agent') || null };
    fs.appendFileSync(FILE, JSON.stringify(rec) + '\n');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'fail' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const n = Number(request.nextUrl.searchParams.get('n') || '20');
    if (!fs.existsSync(FILE)) return NextResponse.json({ ok: true, records: [] });
    const lines = fs.readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean);
    const recs = lines.slice(-Math.max(1, Math.min(n, 200))).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return NextResponse.json({ ok: true, count: recs.length, records: recs });
  } catch {
    return NextResponse.json({ error: 'fail' }, { status: 500 });
  }
}
