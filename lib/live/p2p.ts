/**
 * Talk2Me — Live WebRTC P2P (Pascal 2026-06-14).
 * 1 diffuseur → N spectateurs, signalisation via /api/live/[room] (SSE + POST).
 * STUN public (pas de TURN → peut échouer sur NAT symétrique). MVP friends-scale.
 */

import { getIceServers } from '@/lib/webrtc-helpers';
const rid = () => Math.random().toString(36).slice(2, 10);

type SigMsg = { sig: string; from?: string; to?: string; sdp?: any; candidate?: any };

function open(room: string, onMsg: (m: SigMsg) => void) {
  const es = new EventSource(`/api/live/${room}`);
  es.addEventListener('call:webrtc', (e: MessageEvent) => { try { onMsg(JSON.parse(e.data)); } catch { /* */ } });
  const post = (kind: string, data: Record<string, unknown>) =>
    fetch(`/api/live/${room}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, data }) }).catch(() => {});
  return { es, post, onHello: (cb: () => void) => es.addEventListener('hello', cb) };
}

/** Diffuseur : envoie `stream` à chaque spectateur qui rejoint. Retourne un stop(). */
export function startBroadcast(room: string, stream: MediaStream): () => void {
  const me = rid();
  const pcs = new Map<string, RTCPeerConnection>();
  const { es, post } = open(room, async (m) => {
    if (!m || m.from === me) return;
    if (m.sig === 'join') {
      const pc = new RTCPeerConnection({ iceServers: await getIceServers() }); pcs.set(m.from!, pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.onicecandidate = (ev) => ev.candidate && post('ice', { from: me, to: m.from, candidate: ev.candidate });
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      post('offer', { from: me, to: m.from, sdp: pc.localDescription });
    } else if (m.sig === 'answer' && m.to === me) {
      const pc = pcs.get(m.from!); if (pc) try { await pc.setRemoteDescription(m.sdp); } catch { /* */ }
    } else if (m.sig === 'ice' && m.to === me) {
      const pc = pcs.get(m.from!); if (pc && m.candidate) try { await pc.addIceCandidate(m.candidate); } catch { /* */ }
    }
  });
  post('announce', { from: me });
  return () => { post('end', { from: me }); es.close(); pcs.forEach((p) => p.close()); pcs.clear(); };
}

/** Spectateur : rejoint la salle, reçoit le flux. onStream(stream|null). Retourne stop(). */
export function startViewer(room: string, onStream: (s: MediaStream | null) => void): () => void {
  const me = rid();
  let pc: RTCPeerConnection | null = null;
  const ch = open(room, async (m) => {
    if (!m) return;
    if (m.sig === 'offer' && m.to === me) {
      pc = new RTCPeerConnection({ iceServers: await getIceServers() });
      pc.ontrack = (ev) => onStream(ev.streams[0]);
      pc.onicecandidate = (ev) => ev.candidate && ch.post('ice', { from: me, to: m.from, candidate: ev.candidate });
      try { await pc.setRemoteDescription(m.sdp); const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); ch.post('answer', { from: me, to: m.from, sdp: pc.localDescription }); } catch { /* */ }
    } else if (m.sig === 'ice' && m.to === me) {
      if (pc && m.candidate) try { await pc.addIceCandidate(m.candidate); } catch { /* */ }
    } else if (m.sig === 'end') { onStream(null); }
  });
  ch.onHello(() => ch.post('join', { from: me }));
  return () => { ch.es.close(); if (pc) pc.close(); };
}
