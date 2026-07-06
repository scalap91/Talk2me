/**
 * Talk2Me — Programme Drive : mon profil porteur + soumission CNI (Brique A).
 * GET  → mon profil (CNI masquée, jamais le numéro complet ici).
 * POST → soumet/màj { phone, cni_number, front_id, back_id, modes } → statut 'pending'.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCarrierProfile, submitCarrierProfile, CARRIER_MODES, type CarrierMode } from '@/lib/transport-profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, profile: getCarrierProfile(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let b: { full_name?: string; phone?: string; cni_number?: string; front_id?: string; back_id?: string; video_id?: string; sim_attested?: boolean; modes?: string[] } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  const fullName = (b.full_name || '').trim();
  const phone = (b.phone || '').trim();
  const cni = (b.cni_number || '').trim();
  const front = (b.front_id || '').trim();
  const back = (b.back_id || '').trim();
  const video = (b.video_id || '').trim();
  if (fullName.length < 3) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (phone.length < 6) return NextResponse.json({ error: 'phone_required' }, { status: 400 });
  if (cni.length < 4) return NextResponse.json({ error: 'cni_required' }, { status: 400 });
  if (!front || !back) return NextResponse.json({ error: 'cni_photos_required' }, { status: 400 });
  if (!video) return NextResponse.json({ error: 'video_required' }, { status: 400 });
  if (b.sim_attested !== true) return NextResponse.json({ error: 'sim_attestation_required' }, { status: 400 });
  // Les pièces doivent appartenir à CE user (l'upload préfixe par l'id).
  if (!front.startsWith(me.id + '_front_') || !back.startsWith(me.id + '_back_') || !video.startsWith(me.id + '_video_')) {
    return NextResponse.json({ error: 'bad_file_owner' }, { status: 403 });
  }
  const modes = (Array.isArray(b.modes) ? b.modes : []).filter((m): m is CarrierMode => CARRIER_MODES.includes(m as CarrierMode));

  const profile = submitCarrierProfile(me.id, { fullName, phone, cniNumber: cni, frontId: front, backId: back, videoId: video, simAttested: true, modes });
  return NextResponse.json({ ok: true, profile });
}
