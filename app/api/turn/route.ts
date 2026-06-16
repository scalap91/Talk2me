/**
 * GET /api/turn — fournit les serveurs ICE (STUN + TURN) au client avant un appel.
 * TURN = coturn self-hosted (Pascal 2026-06-15) pour les NAT symétriques (4G/CGNAT).
 * Identifiants ÉPHÉMÈRES (REST API coturn use-auth-secret) : username = expiry:label,
 * credential = base64(HMAC-SHA1(secret, username)). Le secret reste serveur-side
 * (env TURN_SECRET). Si pas de secret → STUN seul (comportement d'avant, pas de casse).
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export async function GET() {
  const secret = process.env.TURN_SECRET || '';
  const host = process.env.TURN_HOST || process.env.MEDIASOUP_ANNOUNCED_IP || '';
  if (!secret || !host) return NextResponse.json({ iceServers: STUN });

  const ttlSec = 3600;
  const username = `${Math.floor(Date.now() / 1000) + ttlSec}:t2m`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  const iceServers: RTCIceServer[] = [
    ...STUN,
    { urls: [`turn:${host}:3478?transport=udp`, `turn:${host}:3478?transport=tcp`], username, credential },
  ];
  return NextResponse.json({ iceServers });
}
