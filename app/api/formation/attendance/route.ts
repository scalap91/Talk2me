/**
 * Acte de présence — le recruté SIGNE le registre d'une session (QR ou OTP), avec sa géoloc.
 * On se fiche de ce qu'il dit : seule compte la signature géolocalisée. Prérequis à la certification.
 *  POST { code, lat?, lng?, via? }   (code = jeton QR OU OTP de la session)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { signAttendance } from '@/lib/formation-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FR: Record<string, string> = {
  session_invalide: 'Session introuvable ou expirée.',
  formateur_ne_signe_pas: 'Le formateur ne signe pas sa propre session.',
  geoloc_requise: 'Active ta position pour signer ta présence.',
  trop_loin: 'Tu es trop loin de la session — la présence exige d\'être sur place.',
};

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { code?: string; lat?: number; lng?: number; via?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const code = String(b.code || '').trim();
  if (!code) return NextResponse.json({ error: 'code_requis' }, { status: 400 });
  const r = signAttendance(code, me.id, typeof b.lat === 'number' ? b.lat : null, typeof b.lng === 'number' ? b.lng : null, b.via === 'otp' ? 'otp' : 'qr');
  if (!r.ok) return NextResponse.json({ error: r.error, message: FR[r.error || ''] || 'Échec.' }, { status: 400 });
  return NextResponse.json({ ok: true, message: '✅ Présence signée. Passe l\'examen pour être certifié.' });
}
