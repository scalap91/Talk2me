import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { cjConfigured, cjProductFull, cjFreight } from '@/lib/cj-dropshipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cache mémoire (pid|country → livrable ?) pour éviter de re-taper CJ.
const cache = new Map<string, boolean>();
const MAX_CHECK = 48; // garde-fou anti rate-limit CJ

// POST { pids:[], country } → { results: {pid: bool}, checked, total }
// Vérifie, produit par produit, si CJ livre DIRECT au pays donné.
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!cjConfigured()) return NextResponse.json({ ok: true, results: {}, checked: 0, total: 0 });

  let body: { pids?: string[]; country?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const cc = (body.country || 'FR').toUpperCase().slice(0, 2);
  const all = Array.isArray(body.pids) ? body.pids.filter(Boolean) : [];
  const list = all.slice(0, MAX_CHECK);

  const results: Record<string, boolean> = {};
  const queue = [...list];
  async function worker() {
    while (queue.length) {
      const pid = queue.shift()!;
      const key = `${pid}|${cc}`;
      if (cache.has(key)) { results[pid] = cache.get(key)!; continue; }
      try {
        const full = await cjProductFull(pid);
        const vid = full.variants.find((v) => v.vid)?.vid || '';
        const ships = vid ? (await cjFreight(vid, cc, 1)).length > 0 : false;
        cache.set(key, ships);
        results[pid] = ships;
      } catch {
        results[pid] = false;
      }
    }
  }
  // Concurrence limitée (3) pour rester soft avec l'API CJ.
  await Promise.all([worker(), worker(), worker()]);

  return NextResponse.json({ ok: true, country: cc, results, checked: list.length, total: all.length });
}
