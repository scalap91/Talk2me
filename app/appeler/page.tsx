'use client';

/**
 * Talk2Me — Écran « Appeler » (Pascal 2026-06-25). Pavé pour composer un numéro
 * et lancer un appel AUDIO ou VIDÉO vers le user T2M qui a ce numéro. Pas de nav du
 * bas ici : juste 📞 Appeler + 📹 Appel vidéo + flèche retour. Le numéro = identité.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { ArrowLeft, Phone, Video, Delete } from '@/lib/icons';

const COUNTRIES = [
  { code: 'MG', dial: '+261', flag: '🇲🇬' },
  { code: 'FR', dial: '+33', flag: '🇫🇷' },
  { code: 'BE', dial: '+32', flag: '🇧🇪' },
  { code: 'CI', dial: '+225', flag: '🇨🇮' },
  { code: 'SN', dial: '+221', flag: '🇸🇳' },
];

function buildE164(dial: string, raw: string): string {
  const s = (raw || '').replace(/[\s.\-()]/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return '+' + s.slice(2).replace(/\D/g, '');
  const digits = s.replace(/\D/g, '');
  const dd = dial.replace('+', '');
  if (digits.startsWith(dd)) return '+' + digits;
  return dial + digits.replace(/^0+/, '');
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export default function AppelerPage() {
  const router = useRouter();
  const [dial, setDial] = useState('+261');
  const [num, setNum] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = (k: string) => { setError(null); setNum((n) => (n + k).slice(0, 20)); };
  const del = () => { setError(null); setNum((n) => n.slice(0, -1)); };

  async function call(kind: 'audio' | 'video') {
    if (busy) return;
    const to = buildE164(dial, num);
    if (to.replace(/\D/g, '').length < 8) { setError('Numéro invalide.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/calls/new', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, kind }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok || !j.call_id || !j.callee) {
        const map: Record<string, string> = {
          callee_not_found: "Ce numéro n'est pas encore sur Talk2Me.",
          callee_busy: 'La personne est déjà en appel.',
          caller_already_in_call: 'Tu es déjà en appel.',
          blocked: 'Appel impossible (bloqué).',
          cannot_call_self: "C'est ton propre numéro.",
        };
        setError(map[j?.error] || 'Appel impossible, réessaie.');
        return;
      }
      // CallsRoot (global) ouvre l'écran d'appel sortant.
      window.dispatchEvent(new CustomEvent('ttm:call:start', { detail: { call_id: j.call_id, kind, callee: j.callee } }));
    } catch { setError('Erreur réseau.'); }
    finally { setBusy(false); }
  }

  const country = COUNTRIES.find((c) => c.dial === dial) || COUNTRIES[0];

  return (
    <div className="flex flex-col h-[100svh] t2m-narrow bg-[#0e0e12] overflow-hidden">
      {/* Header : flèche retour */}
      <header className="flex items-center h-14 px-3 border-b border-white/8 shrink-0">
        <button onClick={() => smartBack(router, '/home')} aria-label="Retour" className="p-1.5 -ml-1.5 text-white/70 hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="ml-2 text-[16px] font-semibold text-white/95">Appeler</h1>
      </header>

      {/* Numéro composé */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 min-h-0">
        <div className="flex items-center gap-2">
          <select
            value={dial}
            onChange={(e) => setDial(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-2 h-10 text-[14px] text-white/85 outline-none"
          >
            {COUNTRIES.map((c) => <option key={c.code} value={c.dial} className="bg-[#1a1a22]">{c.flag} {c.dial}</option>)}
          </select>
          <div className="text-[28px] font-medium text-white tracking-wide min-h-[40px] min-w-[80px] text-center">
            {num || <span className="text-white/25">numéro</span>}
          </div>
        </div>
        <div className="text-[12px] text-white/40">{country.flag} On appelle l&apos;ami qui a ce numéro sur Talk2Me</div>
        {error && <div className="rounded-xl border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-[12.5px] text-red-300/90 text-center">{error}</div>}
      </div>

      {/* Pavé numérique */}
      <div className="px-8 pb-2 shrink-0">
        <div className="grid grid-cols-3 gap-y-3 gap-x-6 justify-items-center">
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => press(k)}
              className="w-16 h-16 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-[26px] font-medium active:scale-95 transition">
              {k}
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-1 pr-2">
          {num && (
            <button type="button" onClick={del} aria-label="Effacer" className="w-12 h-12 grid place-items-center text-white/60 hover:text-white">
              <Delete size={24} />
            </button>
          )}
        </div>
      </div>

      {/* Bas : Appeler + Appel vidéo (pas de nav) */}
      <div className="flex items-center justify-center gap-10 px-6 pt-2 pb-[calc(env(safe-area-inset-bottom)+1.2rem)] shrink-0">
        <button type="button" onClick={() => call('audio')} disabled={busy}
          className="flex flex-col items-center gap-1.5 disabled:opacity-50">
          <span className="w-16 h-16 rounded-full bg-emerald-500 grid place-items-center text-white shadow-lg shadow-emerald-500/30 active:scale-95 transition"><Phone size={28} /></span>
          <span className="text-[12px] text-white/70">Appeler</span>
        </button>
        <button type="button" onClick={() => call('video')} disabled={busy}
          className="flex flex-col items-center gap-1.5 disabled:opacity-50">
          <span className="w-16 h-16 rounded-full bg-sky-500 grid place-items-center text-white shadow-lg shadow-sky-500/30 active:scale-95 transition"><Video size={28} /></span>
          <span className="text-[12px] text-white/70">Appel vidéo</span>
        </button>
      </div>
    </div>
  );
}
