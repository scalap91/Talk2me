'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { InstallAppButton } from '@/components/pwa/InstallAppButton';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SentState = {
  email: string;
  fallbackLink?: string;
};

function SignInInner() {
  const search = useSearchParams();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<SentState | null>(null);
  // Inscription/connexion par TÉLÉPHONE (Mada-first) — code OTP.
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);

  async function requestPhoneCode(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (phone.replace(/\D/g, '').length < 8) { setError('Numéro invalide.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/phone/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error === 'invalid_phone' ? 'Numéro invalide.' : 'Erreur, réessaie.'); return; }
      setOtpSent(true);
      setDevCode(json.dev_code || null);
    } catch { setError('Erreur réseau. Réessaie.'); }
    finally { setLoading(false); }
  }

  async function verifyPhoneCode(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) { setError('Entre le code à 6 chiffres.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/phone/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error === 'invalid_code' ? 'Code incorrect ou expiré.' : 'Erreur, réessaie.'); return; }
      window.location.replace('/home');
    } catch { setError('Erreur réseau. Réessaie.'); }
    finally { setLoading(false); }
  }

  // Talk2Me (Pascal 2026-06-07) : si déjà connecté, on saute le formulaire et
  // on file sur le Hub (point d'entrée PWA, start_url = /signin).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' });
        if (alive && r.ok) window.location.replace('/home');
      } catch {
        /* pas connecté → on laisse le formulaire */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Affiche les erreurs venant du callback verify (lien expiré / utilisé / etc.)
  useEffect(() => {
    const err = search?.get('error');
    if (!err) return;
    const map: Record<string, string> = {
      invalid_link: "Ce lien n'est plus valide. Demande un nouveau lien ci-dessous.",
      signup_failed: 'Impossible de créer ton compte. Réessaie.',
    };
    setError(map[err] || 'Lien invalide. Demande un nouveau lien.');
  }, [search]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError('Format email invalide.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map: Record<string, string> = {
          invalid_email: 'Format email invalide.',
          invalid_body: 'Requête invalide.',
        };
        setError(map[json?.error] || 'Erreur, réessaie.');
        return;
      }
      setSent({ email: clean, fallbackLink: json.fallback_link });
    } catch {
      setError('Erreur réseau. Réessaie.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <main className="min-h-[100svh] w-full flex items-center justify-center bg-[#0e0e12] px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-[28px] font-medium tracking-tight text-white/95">
              Vérifie ta boîte mail
            </h1>
            <p className="text-[13px] text-white/55 leading-relaxed">
              On vient d&apos;envoyer un lien magique à
              <br />
              <span className="text-white/90 font-medium">{sent.email}</span>
            </p>
            <p className="text-[12px] text-white/40 pt-2">
              Le lien est valable 15 minutes, à usage unique.
            </p>
          </div>

          {sent.fallbackLink && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-amber-300/80 font-medium">
                Mode dev (SMTP non configuré)
              </div>
              <p className="text-[12px] text-white/70 leading-relaxed">
                Pas d&apos;envoi réel. Ouvre directement&nbsp;:
              </p>
              <a
                href={sent.fallbackLink}
                className="block break-all rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-[11px] font-mono text-amber-200 hover:bg-black/60 transition-colors"
              >
                {sent.fallbackLink}
              </a>
            </div>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setSent(null);
                setError(null);
              }}
              className="text-[12px] text-white/55 hover:text-white/85 transition-colors underline-offset-4 hover:underline"
            >
              Mauvaise adresse ? Recommencer.
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] w-full flex items-center justify-center bg-[#0e0e12] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center space-y-3">
          {/* Talk2Me #386 — logo T2M officiel intégré (Pascal 2026-06-05) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-512.png"
            alt="Talk2Me"
            className="w-24 h-24 object-contain rounded-3xl"
          />
          <p className="text-[13px] text-white/55">
            {mode === 'email'
              ? "Entre ton email, on t'envoie un lien magique."
              : "Entre ton numéro, on t'envoie un code par SMS."}
          </p>
        </div>

        {/* Bascule Email / Téléphone */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-black/30 p-1">
          {(['email', 'phone'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); setOtpSent(false); setCode(''); }}
              className={'h-9 rounded-full text-[13px] font-medium transition-colors ' +
                (mode === m ? 'bg-white text-black' : 'text-white/60 hover:text-white/90')}
            >
              {m === 'email' ? 'Email' : 'Téléphone'}
            </button>
          ))}
        </div>

        {mode === 'email' && (
          <form
            onSubmit={onSubmit}
            className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          >
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[12px] font-medium text-white/65">Email</label>
              <input
                id="email" name="email" type="email" inputMode="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-[14px] text-white/95 placeholder-white/30 outline-none focus:border-red-400/40 focus:bg-black/40 transition-colors"
                placeholder="ton@email.com"
              />
              <div className="text-[11px] text-white/40 pl-1">
                Pas de mot de passe. Juste un lien dans ta boîte.
              </div>
            </div>
            {error && (
              <div className="rounded-xl border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-[12px] text-red-300/90">{error}</div>
            )}
            <button type="submit" disabled={loading}
              className="w-full h-11 rounded-full bg-white text-black text-[14px] font-medium hover:bg-white/90 active:bg-white/80 transition-colors disabled:opacity-50">
              {loading ? 'Envoi…' : 'Recevoir le lien magique'}
            </button>
          </form>
        )}

        {mode === 'phone' && (
          <form
            onSubmit={otpSent ? verifyPhoneCode : requestPhoneCode}
            className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          >
            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-[12px] font-medium text-white/65">Numéro de téléphone</label>
              <input
                id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required disabled={otpSent}
                value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-[14px] text-white/95 placeholder-white/30 outline-none focus:border-red-400/40 focus:bg-black/40 transition-colors disabled:opacity-60"
                placeholder="034 12 345 67"
              />
              <div className="text-[11px] text-white/40 pl-1">Madagascar : 03X… ou format international +261…</div>
            </div>

            {otpSent && (
              <div className="space-y-1.5">
                <label htmlFor="code" className="text-[12px] font-medium text-white/65">Code reçu par SMS</label>
                <input
                  id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-[18px] tracking-[0.4em] text-center text-white/95 placeholder-white/30 outline-none focus:border-red-400/40 focus:bg-black/40 transition-colors"
                  placeholder="••••••"
                />
                {devCode && (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-200">
                    Mode dev (SMS non branché) — ton code : <span className="font-mono font-bold">{devCode}</span>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-[12px] text-red-300/90">{error}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full h-11 rounded-full bg-white text-black text-[14px] font-medium hover:bg-white/90 active:bg-white/80 transition-colors disabled:opacity-50">
              {loading ? '…' : otpSent ? 'Valider le code' : 'Recevoir le code'}
            </button>

            {otpSent && (
              <button type="button" onClick={() => { setOtpSent(false); setCode(''); setDevCode(null); setError(null); }}
                className="w-full text-center text-[12px] text-white/55 hover:text-white/85 transition-colors">
                Changer de numéro
              </button>
            )}
          </form>
        )}

        <div className="pt-3 text-center">
          <a
            href="mailto:pascal.repir@gmail.com?subject=Talk2Me%20%E2%80%94%20probl%C3%A8me%20de%20connexion"
            className="text-[12px] text-white/45 hover:text-white/75 transition-colors"
          >
            Problème ? Écris à Pascal.
          </a>
        </div>

        {/* Talk2Me #332 — Bouton install PWA custom (Chrome ne propose plus
            systématiquement l'install dans son menu auto) */}
        <div className="mt-6 flex justify-center">
          <InstallAppButton variant="inline" />
        </div>
      </div>
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
