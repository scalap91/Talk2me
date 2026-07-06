/**
 * POST /api/compute/worker (Pascal 2026-07-04)
 * Un appareil rapporte ses capacités → on le CLASSE (bon/moyen/faible candidat) et on le
 * garde dans le pool d'ouvriers du compute mesh. Renvoie le tier + pourquoi.
 * (Le scheduling — priorité aux souvent-dispo, calcul de nuit en charge — viendra dessus.)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { scoreWorker, type WorkerCaps } from '@/lib/compute/worker-score';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let _ready = false;
function ensureTable() {
  if (_ready) return;
  getDb().prepare(
    `CREATE TABLE IF NOT EXISTS compute_workers (
      device_id TEXT PRIMARY KEY, user_id TEXT, platform TEXT, native INTEGER,
      tier TEXT, score INTEGER, profile TEXT, charging INTEGER,
      first_seen INTEGER, last_seen INTEGER, seen_count INTEGER DEFAULT 1
    )`
  ).run();
  _ready = true;
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let p: (WorkerCaps & { device_id?: string; charging?: boolean | null }) = {};
  try { p = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const deviceId = String(p.device_id || '').slice(0, 80);
  if (!deviceId) return NextResponse.json({ error: 'no_device_id' }, { status: 400 });

  const { tier, score, reasons } = scoreWorker(p);
  const now = Date.now();
  ensureTable();
  const db = getDb();
  // upsert + incrémente seen_count (base de la « réputation / souvent dispo »).
  db.prepare(
    `INSERT INTO compute_workers (device_id, user_id, platform, native, tier, score, profile, charging, first_seen, last_seen, seen_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(device_id) DO UPDATE SET
       user_id=excluded.user_id, platform=excluded.platform, native=excluded.native,
       tier=excluded.tier, score=excluded.score, profile=excluded.profile, charging=excluded.charging,
       last_seen=excluded.last_seen, seen_count=seen_count+1`
  ).run(
    deviceId, me.id, String(p.platform || 'web'), p.native ? 1 : 0,
    tier, score, JSON.stringify(p).slice(0, 4000), p.charging ? 1 : 0, now, now,
  );

  return NextResponse.json({ ok: true, tier, score, reasons, is_worker: tier !== 'weak' });
}

/**
 * GET /api/compute/worker → état du POOL vivant : combien d'ouvriers dispo MAINTENANT
 * (heartbeat < 90 s), par tier. Rend concret le « il y a toujours quelqu'un de dispo »
 * (population mondiale : quand il fait nuit ici, un autre continent est en charge).
 */
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  ensureTable();
  const since = Date.now() - 90_000; // « dispo » = vu il y a moins de 90 s
  const db = getDb();
  const row = db.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN last_seen > ? THEN 1 ELSE 0 END) AS live,
       SUM(CASE WHEN last_seen > ? AND tier='good' THEN 1 ELSE 0 END) AS live_good,
       SUM(CASE WHEN last_seen > ? AND tier='medium' THEN 1 ELSE 0 END) AS live_medium,
       SUM(CASE WHEN last_seen > ? AND charging=1 THEN 1 ELSE 0 END) AS live_charging
     FROM compute_workers`
  ).get(since, since, since, since) as Record<string, number>;
  return NextResponse.json({
    ok: true,
    pool: {
      registered: row.total || 0,
      available_now: row.live || 0,
      good: row.live_good || 0,
      medium: row.live_medium || 0,
      charging: row.live_charging || 0,
    },
  });
}
