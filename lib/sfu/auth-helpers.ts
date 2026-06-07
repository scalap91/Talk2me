/**
 * SFU mediasoup — Helpers auth/autorisation pour les routes API.
 *
 * Talk2Me #403 — un user n'a le droit d'entrer dans la Room d'une activity
 * QUE s'il est participant de la conversation à laquelle appartient cette
 * activity. Réutilise userCanAccessActivity() de lib/db.ts qui fait
 * exactement cette jointure activities ↔ conversation_participants.
 */
import 'server-only';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { userCanAccessActivity, type DbUser } from '@/lib/db';
import type { Activity } from '@/lib/activity-types';

export interface SfuAuthCtx {
  me: DbUser;
  activityId: string;
  convId: string;
  activity: Activity<unknown>;
}

export type SfuAuthError =
  | { ok: false; status: 401; error: 'unauthorized' }
  | { ok: false; status: 400; error: 'activity_id_required' }
  | { ok: false; status: 403; error: 'forbidden' };

/**
 * Récupère user + activity + check qu'il est participant.
 * Retourne soit { ok: true, ...ctx }, soit { ok: false, status, error }.
 */
export function authForActivity(
  request: NextRequest,
  activityId: string | undefined | null
): { ok: true; ctx: SfuAuthCtx } | SfuAuthError {
  const me = getCurrentUserFromRequest(request);
  if (!me) return { ok: false, status: 401, error: 'unauthorized' };

  const id = (activityId || '').trim();
  if (!id) return { ok: false, status: 400, error: 'activity_id_required' };

  const access = userCanAccessActivity(id, me.id);
  if (!access) return { ok: false, status: 403, error: 'forbidden' };

  return {
    ok: true,
    ctx: {
      me,
      activityId: id,
      convId: access.convId,
      activity: access.activity,
    },
  };
}
