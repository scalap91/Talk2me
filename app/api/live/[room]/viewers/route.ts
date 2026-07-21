/**
 * Talk2Me — Modération live (Pascal 2026-07-15). Réservé à l'HÔTE de la salle.
 * GET  → { viewers: [{viewer_id, name, ts, banned}] } : historique de connexion (qui est entré).
 * POST { action:'kick'|'ban'|'unban', viewer_id } :
 *   - kick  → diffuse `live_kick` (le spectateur ciblé est éjecté côté client, sans le bannir).
 *   - ban   → bannit (ne pourra plus rejoindre) + éjecte tout de suite (diffuse `live_kick`).
 *   - unban → retire le bannissement.
 * Le viewer_id n'est visible QUE de l'hôte (jamais exposé aux autres spectateurs).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { resolveLiveHost } from '@/lib/simple-shop';
import { listViewers, banViewer, unbanViewer } from '@/lib/live/session';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { room } = await ctx.params;
  if (resolveLiveHost(room) !== me.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, viewers: listViewers(me.id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { room } = await ctx.params;
  if (resolveLiveHost(room) !== me.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let body: { action?: string; viewer_id?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const viewer = (body.viewer_id || '').trim();
  if (!viewer || viewer === me.id) return NextResponse.json({ error: 'bad_viewer' }, { status: 400 });

  if (body.action === 'unban') { unbanViewer(me.id, viewer); return NextResponse.json({ ok: true }); }
  if (body.action === 'ban') banViewer(me.id, viewer);
  // kick + ban → on éjecte immédiatement le client ciblé (il quittera la salle). Canal = clé de la salle.
  publish(`live:${room}`, { kind: 'live_kick', data: { viewer_id: viewer } });
  return NextResponse.json({ ok: true });
}
