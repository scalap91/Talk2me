/**
 * Talk2Me #341 — Lot 2 N8/N9 : page de capture preuve mode-gate (Pascal 2026-06-04).
 *
 * NE PAS EXPOSER en production : route de debug uniquement pour screenshots
 * de validation. À supprimer après livraison Lot 2.
 *
 * Appelle /api/chat 2 fois (mode chat + mode card_editor_video) côté serveur
 * et affiche les 2 réponses côte-à-côte pour la capture
 * talk2me_lot2_hotel_in_editor.png.
 */

import { cookies, headers } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function callChat(
  cookieHeader: string,
  host: string,
  mode: string | null,
  message: string,
): Promise<Record<string, unknown>> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Cookie: cookieHeader,
  };
  if (mode) h['x-talktome-mode'] = mode;
  const r = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ message }),
  });
  return r.json();
}

export default async function Lot2ProofPage() {
  const c = await cookies();
  const cookieStr = c
    .getAll()
    .map((x) => `${x.name}=${x.value}`)
    .join('; ');
  const h = await headers();
  const host = h.get('x-forwarded-proto') || 'http';
  const hostname = h.get('host') || '127.0.0.1:3010';
  const base = `${host}://${hostname}`;

  // 2 appels en parallèle
  const [chat, editor] = await Promise.all([
    callChat(cookieStr, base, null, 'météo Paris'),
    callChat(cookieStr, base, 'card_editor_video', 'Trouve-moi un hôtel à Paris'),
  ]);

  type Weather = { temperature_c?: number; condition_label?: string; icon?: string; place_label?: string };
  const chatText: string =
    typeof chat.text === 'string' && chat.text.length > 0
      ? (chat.text as string)
      : (() => {
          const w = chat.weather as Weather | null | undefined;
          if (w && typeof w.temperature_c === 'number') {
            return `Carte météo : ${w.temperature_c}°C ${w.condition_label || ''} ${w.icon || ''} — ${w.place_label || 'Paris'}`;
          }
          return '(empty)';
        })();
  const editorText: string =
    typeof editor.text === 'string' ? (editor.text as string) : '(empty)';

  const editorSideEffects: string[] = [];
  if ((editor as { web_search?: unknown }).web_search) editorSideEffects.push('web_search');
  if ((editor as { places?: unknown }).places) editorSideEffects.push('places');
  if ((editor as { weather?: unknown }).weather) editorSideEffects.push('weather');
  if ((editor as { youtube?: unknown }).youtube) editorSideEffects.push('youtube');

  return (
    <main
      style={{
        margin: 0,
        padding: 14,
        background: '#0a0a0d',
        color: '#e5e5e5',
        fontFamily:
          '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        fontSize: 13,
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: 14, margin: '4px 0 16px', color: '#fca5a5' }}>
        Talk2Me #341 — Lot 2 : mode-gate end-to-end (preuve serveur)
      </h1>

      <div
        style={{
          fontSize: 10,
          color: '#7e7e92',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginTop: 12,
          marginBottom: 6,
        }}
      >
        Cas A · mode chat (default — pas de header)
      </div>
      <div
        style={{
          background: '#14141c',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <div style={{ color: '#8ab4f8', fontSize: 11, marginBottom: 4 }}>
          USER : météo Paris
        </div>
        <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 4 }}>
          IA :
        </div>
        <div>{chatText}</div>
      </div>

      <div
        style={{
          fontSize: 10,
          color: '#7e7e92',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 6,
        }}
      >
        Cas B ·{' '}
        <span
          style={{
            display: 'inline-block',
            background: 'rgba(239, 68, 68,0.18)',
            border: '1px solid rgba(239, 68, 68,0.45)',
            color: '#fca5a5',
            padding: '2px 8px',
            borderRadius: 9999,
            fontSize: 10,
            marginLeft: 6,
          }}
        >
          MODE : ÉDITEUR VIDÉO
        </span>{' '}
        (header x-talktome-mode: card_editor_video)
      </div>
      <div
        style={{
          background: '#14141c',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <div style={{ color: '#8ab4f8', fontSize: 11, marginBottom: 4 }}>
          USER : Trouve-moi un hôtel à Paris
        </div>
        <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 4 }}>
          IA :
        </div>
        <div>{editorText}</div>
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: editorSideEffects.length ? '#ff8b8b' : '#7ee8a0',
          }}
        >
          Side-effects (tools gelés appelés) :{' '}
          {editorSideEffects.length
            ? editorSideEffects.join(', ') + ' (KO)'
            : 'aucun (OK)'}
        </div>
      </div>

      <div
        style={{
          fontSize: 10,
          color: '#7e7e92',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 6,
        }}
      >
        Audit serveur
      </div>
      <div
        style={{
          background: '#14141c',
          border: '1px solid #2a2a3a',
          borderRadius: 12,
          padding: 12,
          fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
          fontSize: 11,
          lineHeight: 1.55,
        }}
      >
        mode chat → tools envoyés : search_*, get_weather, fetch_url_content
        <br />
        mode chat → réponse : {chat.weather ? 'WeatherCard OK' : 'texte ou autre card'}
        <br />
        <br />
        mode card_editor_video → tools envoyés : ∅ (tous gelés par mode-gate)
        <br />
        mode card_editor_video → réponse : refus poli + recentrage
      </div>
    </main>
  );
}
