/**
 * Talk2Me — /api/live/[room]/comment  (Pascal 2026-07-04)
 * Commentaires temps réel d'un live. room = liveId = id du diffuseur.
 *
 *   GET                → { comments: LiveComment[] } (derniers, pour remplir
 *                         l'overlay d'un spectateur qui arrive en cours de route)
 *   POST { text }      → poste un commentaire : stocké (live_comments) PUIS
 *                        diffusé en temps réel sur le canal bus `live:{room}`
 *                        (même mécanisme que le chat P2P).
 *
 * L'auteur est dérivé du cookie de session côté serveur → { username, display_name }
 * UNIQUEMENT (doctrine [[talk2me-pii-air-gap]]). Le client ne choisit jamais l'auteur.
 */
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { addComment, getRecentComments, isLive, type LiveComment } from '@/lib/live/session';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  // Lecture PUBLIQUE (Pascal 2026-07-05) : un spectateur anonyme peut LIRE les commentaires
  // d'un live. Poster (POST) reste réservé aux connectés.
  const { room } = await ctx.params;
  return Response.json({ comments: getRecentComments(room), live: isLive(room) });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });
  const { room } = await ctx.params;

  let body: { text?: string; system?: boolean; product?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('bad_request', { status: 400 });
  }

  const author = { username: me.username, display_name: me.display_name };
  const ts = Date.now();

  // PREUVE SOCIALE (Live Shopping) : « 🛒 {pseudo} vient d'acheter {produit} ».
  // Le texte est CONSTRUIT SERVEUR à partir de l'utilisateur AUTHENTIFIÉ + du titre
  // produit fourni ; le client ne choisit jamais l'identité affichée (PII air-gap).
  if (body.system) {
    const pseudo = (author.display_name && author.display_name.trim()) || author.username;
    const product = (body.product || '').trim().slice(0, 120) || 'un produit';
    const text = `🛒 ${pseudo} vient d'acheter ${product}`;
    const comment: LiveComment = { author, text, system: true, ts };
    addComment(room, comment);
    publish(`live:${room}`, { kind: 'live_comment', data: comment });
    return Response.json({ ok: true });
  }

  const text = (body.text || '').trim().slice(0, 500);
  if (!text) return new Response('empty', { status: 400 });

  const comment: LiveComment = { author, text, ts };
  // Best-effort persist (no-op si le live est déjà fermé).
  addComment(room, comment);
  // Diffusion temps réel → diffuseur + tous les spectateurs abonnés à `live:{room}`.
  publish(`live:${room}`, { kind: 'live_comment', data: comment });
  return Response.json({ ok: true });
}
