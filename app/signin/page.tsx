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
      <main className="min-h-[100dvh] w-full flex items-center justify-center bg-[#0e0e12] px-4 py-10">
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
    <main className="min-h-[100dvh] w-full flex items-center justify-center bg-[#0e0e12] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center space-y-3">
          {/* Talk2Me #386 — logo T2M officiel intégré (Pascal 2026-06-05) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/t2m-logo-master.png"
            alt="Talk2Me"
            className="w-28 h-28 object-contain"
          />
          <p className="text-[13px] text-white/55">
            Entre ton email, on t&apos;envoie un lien magique.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        >
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-[12px] font-medium text-white/65">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-[14px] text-white/95 placeholder-white/30 outline-none focus:border-red-400/40 focus:bg-black/40 transition-colors"
              placeholder="ton@email.com"
            />
            <div className="text-[11px] text-white/40 pl-1">
              Pas de mot de passe. Pas d&apos;inscription séparée. Juste un lien dans ta boîte.
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-[12px] text-red-300/90">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-full bg-white text-black text-[14px] font-medium hover:bg-white/90 active:bg-white/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Envoi…' : 'Recevoir le lien magique'}
          </button>

          <div className="pt-2 text-center">
            <a
              href="mailto:pascal.repir@gmail.com?subject=Talk2Me%20%E2%80%94%20probl%C3%A8me%20de%20connexion"
              className="text-[12px] text-white/45 hover:text-white/75 transition-colors"
            >
              Problème ? Écris à Pascal.
            </a>
          </div>
        </form>

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
    <Suspense fallback={<main className="min-h-[100dvh] bg-[#0e0e12]" />}>
      <SignInInner />
    </Suspense>
  );
}
