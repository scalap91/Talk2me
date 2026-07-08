'use client';

/**
 * Talk2Me — /link?t=<token> : appairage web déclenché en SCANNANT le QR du PC
 * avec l'appareil photo (App Link → ouvre l'app, session native). Doctrine Pascal
 * 2026-06-26 : « on scan, on accepte, c'est tout » → AUTO-approbation au chargement
 * (le scan EST le consentement, façon WhatsApp Web), puis retour auto dans l'app.
 * JAMAIS bloquant : un bouton « Retour » est toujours présent.
 */
import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Check, ShieldAlert, ArrowLeft } from '@/lib/icons';
import T2MWordmark from '@/components/brand/T2MWordmark';

type St = 'working' | 'done' | 'invalid' | 'expired' | 'used' | 'error';

function LinkInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [state, setState] = useState<St>('working');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // Token robuste : useSearchParams, sinon window.location (cold-start WebView APK).
    let token = search?.get('t') || '';
    if (!token && typeof window !== 'undefined') {
      token = new URLSearchParams(window.location.search).get('t')
        || new URLSearchParams((window.location.hash || '').replace(/^#/, '')).get('t') || '';
    }
    if (!token) { setState('invalid'); return; }
    (async () => {
      try {
        const d = await fetch('/api/auth/qr/approve', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }),
        }).then((r) => r.json());
        if (d?.ok) {
          setState('done');
          setTimeout(() => router.replace('/home'), 1300); // retour auto dans l'app
        } else {
          setState(d?.error === 'expired' ? 'expired' : d?.error === 'already_used' ? 'used' : d?.error === 'not_found' ? 'invalid' : 'error');
        }
      } catch { setState('error'); }
    })();
  }, [search, router]);

  const msg: Record<St, { title: string; sub: string }> = {
    working: { title: 'Connexion de l’ordinateur…', sub: 'Un instant.' },
    done: { title: 'Ordinateur connecté ✅', sub: 'Talk2Me s’ouvre sur ton PC. Retour à l’app…' },
    invalid: { title: 'Lien invalide', sub: 'Scanne à nouveau le QR affiché sur l’ordinateur.' },
    expired: { title: 'QR expiré', sub: 'Régénère le QR sur le PC puis rescanne.' },
    used: { title: 'QR déjà utilisé', sub: 'Génère un nouveau QR sur le PC.' },
    error: { title: 'Échec', sub: 'Réessaie en rescannant le QR.' },
  };
  const m = msg[state];

  return (
    <main className="min-h-[100svh] w-full flex items-center justify-center bg-[var(--t2m-paper)] px-5 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--t2m-line)] bg-white backdrop-blur-xl p-6 text-center shadow-[0_2px_10px_rgba(47,52,58,.05)]">
        <div className="mb-5"><T2MWordmark beat size={72} /></div>

        <div className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-3 border"
          style={{ borderColor: state === 'done' ? 'rgba(16,185,129,.3)' : state === 'working' ? 'rgba(47,52,58,.15)' : 'rgba(245,158,11,.3)', background: state === 'done' ? 'rgba(16,185,129,.12)' : 'transparent' }}>
          {state === 'working' ? <Loader2 className="w-7 h-7 text-[var(--t2m-ink-2)] animate-spin" />
            : state === 'done' ? <Check className="w-7 h-7 text-emerald-300" />
            : <ShieldAlert className="w-7 h-7 text-amber-300" />}
        </div>

        <h1 className="text-[18px] font-semibold text-[var(--t2m-ink)]">{m.title}</h1>
        <p className="text-[13px] text-[var(--t2m-ink-3)] mt-2 leading-relaxed">{m.sub}</p>

        {/* JAMAIS bloquant : retour vers l'app toujours dispo. */}
        <button onClick={() => router.replace('/home')}
          className="mt-6 w-full h-11 rounded-full bg-[var(--t2m-wash)] text-[var(--t2m-ink)] text-[14px] font-medium inline-flex items-center justify-center gap-2 active:scale-[0.99]">
          <ArrowLeft className="w-4 h-4" /> Retour à Talk2Me
        </button>
      </div>
    </main>
  );
}

export default function LinkPage() {
  return (
    <Suspense fallback={<main className="min-h-[100svh] bg-[var(--t2m-paper)]" />}>
      <LinkInner />
    </Suspense>
  );
}
