'use client';

/**
 * Talk2Me — Connexion/Inscription par TÉLÉPHONE UNIQUEMENT, flow façon WhatsApp
 * (Pascal 2026-06-24, Mada-first) :
 *   1. Choix du pays (🇲🇬 +261 par défaut) + numéro.
 *   2. Confirmation « On envoie un SMS à +261… — correct ? ».
 *   3. Saisie du code à 6 chiffres (cases, auto-avance, validation auto).
 * SMS réels via Orange SMS Madagascar (lib/sms.ts). Pas d'email, pas de mot de passe.
 */
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { InstallAppButton } from '@/components/pwa/InstallAppButton';

const COUNTRIES = [
  { code: 'MG', name: 'Madagascar', dial: '+261', flag: '🇲🇬' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { code: 'BE', name: 'Belgique', dial: '+32', flag: '🇧🇪' },
  { code: 'CI', name: "Côte d'Ivoire", dial: '+225', flag: '🇨🇮' },
  { code: 'SN', name: 'Sénégal', dial: '+221', flag: '🇸🇳' },
  { code: 'CM', name: 'Cameroun', dial: '+237', flag: '🇨🇲' },
  { code: 'MA', name: 'Maroc', dial: '+212', flag: '🇲🇦' },
];

/** Construit le E.164 quel que soit le format saisi + l'indicatif choisi. */
function buildE164(dial: string, raw: string): string {
  const s = (raw || '').replace(/[\s.\-()]/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return '+' + s.slice(2).replace(/\D/g, '');
  const digits = s.replace(/\D/g, '');
  const dd = dial.replace('+', '');
  if (digits.startsWith(dd)) return '+' + digits;           // a déjà l'indicatif sans +
  return dial + digits.replace(/^0+/, '');                   // local : retire le 0, préfixe l'indicatif
}

function SignInInner() {
  const search = useSearchParams();
  const [dial, setDial] = useState('+261');
  const [localNumber, setLocalNumber] = useState('');
  const [step, setStep] = useState<'number' | 'code'>('number');
  const [showConfirm, setShowConfirm] = useState(false);
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  // Numéro complet E.164, INTELLIGENT : marche que l'user tape +261374571519,
  // 00261374571519, 261374571519 OU 0374571519 (avec l'indicatif sélectionné).
  const e164 = buildE164(dial, localNumber);
  const prettyFull = e164;

  // Déjà connecté → Hub.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' });
        if (alive && r.ok) window.location.replace('/home');
      } catch { /* pas connecté */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const err = search?.get('error');
    if (err) setError('Lien expiré. Connecte-toi avec ton numéro.');
  }, [search]);

  // Auto-read SMS NATIF (APK) : le code natif (SMS Retriever) lit le SMS sans popup ni
  // permission et émet 'ttm:otp'. On écoute + on démarre le retriever. (Web pur : autofill clavier.)
  useEffect(() => {
    if (step !== 'code') return;
    const onOtp = (e: Event) => {
      const c = String((e as CustomEvent).detail || '').replace(/\D/g, '').slice(0, 6);
      if (c.length === 6) { setCode(c.split('')); verify(c); }
    };
    window.addEventListener('ttm:otp', onOtp as EventListener);
    try { (window as unknown as { T2MSms?: { start?: () => void } }).T2MSms?.start?.(); } catch { /* pas l'APK */ }
    return () => window.removeEventListener('ttm:otp', onOtp as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function onContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (localNumber.replace(/\D/g, '').length < 8) { setError('Numéro invalide.'); return; }
    setShowConfirm(true);
  }

  async function sendCode() {
    setShowConfirm(false);
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/phone/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: e164 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error === 'invalid_phone' ? 'Numéro invalide.' : 'Erreur, réessaie.'); return; }
      setStep('code');
      setCode(['', '', '', '', '', '']);
      setTimeout(() => boxes.current[0]?.focus(), 60);
    } catch { setError('Erreur réseau. Réessaie.'); }
    finally { setLoading(false); }
  }

  async function verify(full: string) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/phone/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: e164, code: full }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error === 'invalid_code' ? 'Code incorrect ou expiré.' : 'Erreur, réessaie.');
        setCode(['', '', '', '', '', '']);
        setTimeout(() => boxes.current[0]?.focus(), 40);
        return;
      }
      window.location.replace('/home');
    } catch { setError('Erreur réseau. Réessaie.'); }
    finally { setLoading(false); }
  }

  function onBox(i: number, v: string) {
    const d = v.replace(/\D/g, '');
    setError(null);
    if (d.length > 1) {
      // collage du code complet
      const arr = d.slice(0, 6).split('');
      const next = ['', '', '', '', '', ''].map((_, k) => arr[k] || '');
      setCode(next);
      if (arr.length >= 6) verify(next.join(''));
      else boxes.current[Math.min(arr.length, 5)]?.focus();
      return;
    }
    const next = [...code];
    next[i] = d;
    setCode(next);
    if (d && i < 5) boxes.current[i + 1]?.focus();
    if (next.every((c) => c !== '')) verify(next.join(''));
  }

  function onBoxKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !code[i] && i > 0) boxes.current[i - 1]?.focus();
  }

  const country = COUNTRIES.find((c) => c.dial === dial) || COUNTRIES[0];

  return (
    <main className="min-h-[100svh] w-full flex items-center justify-center bg-[#0e0e12] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-512.png" alt="Talk2Me" className="w-24 h-24 object-contain rounded-3xl" />
          <h1 className="text-[22px] font-semibold text-white/95">
            {step === 'number' ? 'Ton numéro' : 'Vérifie ton numéro'}
          </h1>
          <p className="text-[13px] text-white/55 leading-relaxed">
            {step === 'number'
              ? "Talk2Me t'envoie un code par SMS pour confirmer ton numéro."
              : <>Entre le code à 6 chiffres envoyé au<br /><span className="text-white/90 font-medium">{prettyFull}</span></>}
          </p>
        </div>

        {step === 'number' && (
          <form onSubmit={onContinue} className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-white/65">Pays</label>
              <select
                value={dial}
                onChange={(e) => setDial(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 h-12 text-[14px] text-white/95 outline-none focus:border-red-400/40"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.dial} className="bg-[#1a1a22]">{c.flag} {c.name} ({c.dial})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-white/65">Numéro de téléphone</label>
              <div className="flex items-stretch gap-2">
                <span className="inline-flex items-center px-3 rounded-2xl border border-white/10 bg-black/40 text-[15px] text-white/80 shrink-0">
                  {country.flag} {dial}
                </span>
                <input
                  type="tel" inputMode="tel" autoComplete="tel" autoFocus required
                  value={localNumber}
                  onChange={(e) => setLocalNumber(e.target.value)}
                  className="flex-1 min-w-0 rounded-2xl border border-white/10 bg-black/30 px-3 h-12 text-[16px] text-white/95 placeholder-white/30 outline-none focus:border-red-400/40 focus:bg-black/40"
                  placeholder="34 12 345 67"
                />
              </div>
            </div>

            {error && <div className="rounded-xl border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-[12px] text-red-300/90">{error}</div>}

            <button type="submit" disabled={loading}
              className="w-full h-12 rounded-full bg-white text-black text-[15px] font-semibold hover:bg-white/90 active:bg-white/80 transition-colors disabled:opacity-50">
              {loading ? '…' : 'Suivant'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <div className="flex justify-between gap-2">
              {code.map((c, i) => (
                <input
                  key={i}
                  ref={(el) => { boxes.current[i] = el; }}
                  type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={1}
                  value={c}
                  onChange={(e) => onBox(i, e.target.value)}
                  onKeyDown={(e) => onBoxKey(i, e)}
                  className="w-11 h-14 rounded-2xl border border-white/12 bg-black/30 text-center text-[22px] font-semibold text-white/95 outline-none focus:border-red-400/60 focus:bg-black/40"
                />
              ))}
            </div>

            {error && <div className="rounded-xl border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-[12px] text-red-300/90 text-center">{error}</div>}
            {loading && <div className="text-center text-[12px] text-white/50">Vérification…</div>}

            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => { setStep('number'); setError(null); }}
                className="text-[12px] text-white/55 hover:text-white/85 transition-colors">
                ← Modifier le numéro
              </button>
              <button type="button" onClick={sendCode} disabled={loading}
                className="text-[12px] text-white/70 hover:text-white transition-colors disabled:opacity-50">
                Renvoyer le code
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <InstallAppButton variant="inline" />
        </div>
      </div>

      {/* Confirmation façon WhatsApp */}
      {showConfirm && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setShowConfirm(false)}>
          <div className="w-full max-w-xs rounded-3xl bg-[#15151c] border border-white/10 p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-[14px] text-white/85 leading-relaxed">
              On va envoyer un SMS avec un code à&nbsp;:
            </p>
            <p className="text-[18px] font-semibold text-white my-3">{prettyFull}</p>
            <p className="text-[12px] text-white/45 mb-4">Ce numéro est-il correct ?</p>
            <div className="flex gap-2.5">
              <button type="button" onClick={() => setShowConfirm(false)}
                className="flex-1 h-11 rounded-full border border-white/12 text-white/70 text-[14px]">Modifier</button>
              <button type="button" onClick={sendCode}
                className="flex-1 h-11 rounded-full bg-white text-black text-[14px] font-semibold">Oui, envoyer</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-[100svh] bg-[#0e0e12]" />}>
      <SignInInner />
    </Suspense>
  );
}
