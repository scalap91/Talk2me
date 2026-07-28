/**
 * Talk2Me — Programme Drive : mon profil porteur + soumission CNI (Brique A).
 * GET  → mon profil (CNI masquée, jamais le numéro complet ici).
 * POST → soumet/màj { phone, cni_number, front_id, back_id, modes } → statut 'pending'.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCarrierProfile, submitCarrierProfile, setCarrierLogistics, CARRIER_MODES, type CarrierMode, type Vehicle } from '@/lib/transport-profile';
import { publishAgencyCard } from '@/lib/parcel';
import { getDb } from '@/lib/db';

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

  let b: { full_name?: string; phone?: string; cni_number?: string; front_id?: string; back_id?: string; video_id?: string; selfie_id?: string; sim_attested?: boolean; modes?: string[] } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  const fullName = (b.full_name || '').trim();
  const cni = (b.cni_number || '').trim();
  const front = (b.front_id || '').trim();
  const back = (b.back_id || '').trim();
  const video = (b.video_id || '').trim();
  const selfie = (b.selfie_id || '').trim();
  // Le TÉLÉPHONE vient du COMPTE (login par numéro) — on ne le redemande pas. Fallback body si absent.
  const acc = getDb().prepare('SELECT phone FROM users WHERE id = ?').get(me.id) as { phone: string | null } | undefined;
  const phone = (acc?.phone || b.phone || '').trim();
  // MINIMUM VIABLE (Pascal 2026-07-26) : nom + numéro CNI + photos recto/verso. La vidéo liveness
  // et l'attestation SIM seront rajoutées quand on enrichira le module — pas bloquantes maintenant.
  if (fullName.length < 3) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (cni.length < 4) return NextResponse.json({ error: 'cni_required' }, { status: 400 });
  if (!front || !back) return NextResponse.json({ error: 'cni_photos_required' }, { status: 400 });
  if (!selfie) return NextResponse.json({ error: 'selfie_required' }, { status: 400 }); // photo visage caméra (vérif cam)
  // Les pièces fournies doivent appartenir à CE user (l'upload préfixe par l'id).
  if (!front.startsWith(me.id + '_front_') || !back.startsWith(me.id + '_back_') || !selfie.startsWith(me.id + '_selfie_')) {
    return NextResponse.json({ error: 'bad_file_owner' }, { status: 403 });
  }
  if (video && !video.startsWith(me.id + '_video_')) return NextResponse.json({ error: 'bad_file_owner' }, { status: 403 });
  const modes = (Array.isArray(b.modes) ? b.modes : []).filter((m): m is CarrierMode => CARRIER_MODES.includes(m as CarrierMode));

  const profile = submitCarrierProfile(me.id, { fullName, phone, cniNumber: cni, frontId: front, backId: back, videoId: video, selfieId: selfie, simAttested: b.sim_attested === true, modes });
  return NextResponse.json({ ok: true, profile });
}

// PATCH → DÉPÔT + FLOTTE + TARIFS du transporteur/agence (indépendant du KYC).
// { depot?:{lat,lng,label}|null, fleet?:Vehicle[], pricing?:{base_cents,per_km_cents}|null, accepts_parcels?:boolean }
export async function PATCH(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { depot?: { lat?: number; lng?: number; label?: string } | null; fleet?: Vehicle[]; pricing?: { base_cents?: number; per_km_cents?: number } | null; accepts_parcels?: boolean; docs?: { rcs?: string; nif?: string; statuts?: string; stat?: string } } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const patch: { depot?: { lat: number; lng: number; label?: string } | null; fleet?: Vehicle[]; pricing?: { base_cents: number; per_km_cents: number } | null; acceptsParcels?: boolean; docs?: { rcs?: string; nif?: string; statuts?: string; stat?: string } } = {};
  if ('depot' in b) {
    patch.depot = (b.depot && Number.isFinite(Number(b.depot.lat)) && Number.isFinite(Number(b.depot.lng)))
      ? { lat: Number(b.depot.lat), lng: Number(b.depot.lng), label: (b.depot.label || '').toString() }
      : null;
  }
  if (Array.isArray(b.fleet)) patch.fleet = b.fleet;
  if ('pricing' in b) {
    patch.pricing = (b.pricing && (Number.isFinite(Number(b.pricing.base_cents)) || Number.isFinite(Number(b.pricing.per_km_cents))))
      ? { base_cents: Math.max(0, Math.round(Number(b.pricing.base_cents) || 0)), per_km_cents: Math.max(0, Math.round(Number(b.pricing.per_km_cents) || 0)) }
      : null;
  }
  if (typeof b.accepts_parcels === 'boolean') patch.acceptsParcels = b.accepts_parcels;
  if (b.docs) { // les pièces doivent appartenir à CE user (upload préfixe par l'id)
    const d = b.docs; const own = (v?: string) => (v && v.startsWith(me.id + '_')) ? v : undefined;
    patch.docs = { rcs: own(d.rcs), nif: own(d.nif), statuts: own(d.statuts), stat: own(d.stat) };
  }
  const profile = setCarrierLogistics(me.id, patch);
  // DOCTRINE .card : l'agence (vérifiée + dépôt posé) est un SERVICE sur le hub. On publie/retire sa
  // SuperCard selon « accepte les colis ». Best-effort : n'échoue jamais l'enregistrement logistique.
  try {
    // AGENCE (pro) = vérifié + dépôt + FLOTTE déclarée. Un simple transporteur (CNI seule, sans
    // flotte) n'a PAS de page feed et ne reçoit pas de colis (Pascal 2026-07-26 : dissuader les
    // non-pros). La page n'est publiée QUE si une flotte existe ET qu'il accepte les colis.
    // AGENCE DE TRANSPORT (pro) = flotte + pièces société OBLIGATOIRES (RCS + NIF). Statuts/STAT optionnels.
    const isAgency = !!(profile && profile.fleet && profile.fleet.length > 0 && profile.docs.rcs && profile.docs.nif);
    if (profile && profile.cni_status === 'verified' && profile.depot) {
      const u = getDb().prepare('SELECT COALESCE(display_name, username) AS name FROM users WHERE id = ?').get(me.id) as { name: string | null } | undefined;
      await publishAgencyCard(me.id, {
        uid: me.id, name: u?.name || 'Agence',
        depot_label: profile.depot.label,
        base_cents: profile.pricing?.base_cents ?? 0, per_km_cents: profile.pricing?.per_km_cents ?? 0,
      }, isAgency && !!profile.accepts_parcels); // page + colis SEULEMENT si agence complète (flotte + RCS + NIF) et accepte
    }
  } catch { /* card best-effort */ }
  return NextResponse.json({ ok: true, profile });
}
