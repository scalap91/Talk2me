import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { countFriends, maybeDecayUserHabits } from '@/lib/db';
import { maybeCleanUserMemoryPii } from '@/lib/security/memory-cleaner';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { effectivePermissions, isAdminCapable } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  // Talk2Me #338 — Décay opportuniste des habits (1×/24h max, fail-soft).
  // Évite qu'une habit ancienne pollue éternellement le system prompt.
  try {
    maybeDecayUserHabits(user.id);
  } catch {
    // silencieux — doctrine no-excuses
  }
  // Talk2Me PII air-gap Layer 6 (Pascal 2026-06-05) — Memory cleaner
  // background. Scanne user_habits + ai_memories, supprime toute ligne avec
  // pattern PII (1×/24h via last_pii_clean_at). Fail-soft, jamais bloquant.
  // Doctrine [[talk2me-pii-air-gap]] : "doit effacer en mémoire".
  try {
    maybeCleanUserMemoryPii(user.id);
  } catch {
    // silencieux — doctrine no-excuses
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      talk2me_id: user.talk2me_id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      // Talk2Me #324 — IA personnelle intégrée dans le fil P2P.
      // Défaut SANS nom choisi = « IA » (Pascal 2026-08-13 : jamais « Léa » par défaut, c'est un nom d'user).
      ai_name: user.ai_name || 'IA',
      ai_avatar_url: user.ai_avatar_url,
      // Talk2Me Avatar Streamoji (Pascal 2026-06-17) — corps 3D réaliste de l'IA
      // (GLB plein-corps chargé par /piece et piloté par le cerveau).
      ai_avatar_body_url: user.ai_avatar_body_url,
      // Talk2Me Studio créatif (Pascal 2026-06-18) — vidéo photoréaliste de l'avatar IA (GPU maison)
      ai_avatar_video_url: user.ai_avatar_video_url,
      streamoji_avatar_id: user.streamoji_avatar_id,
      // Talk2Me #325 — genre de l'IA (feminin/masculin/neutre, default neutre)
      ai_gender: user.ai_gender || 'neutre',
      room_photo: user.room_photo || null,
      room_tagline: user.room_tagline || null,
      friends_count: countFriends(user.id),
      // Mode admin — super-admin (env) OU collaborateur avec des droits.
      is_admin: isAiOpsAdmin(user.id, user.email),                 // super-admin (peut donner des droits)
      is_admin_capable: isAdminCapable(user.id, user.email),       // a au moins un droit → voit le mode admin
      permissions: effectivePermissions(user.id, user.email),      // droits effectifs (ex: ['boutique'])
    },
  });
}
