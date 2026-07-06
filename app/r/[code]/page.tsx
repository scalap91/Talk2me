'use client';

/**
 * Talk2Me — Page d'invitation /r/<code> (Pascal 2026-06-25).
 * L'invité arrive ici via le lien partagé par un ami. On affiche QUI l'invite et
 * un bouton → écran d'inscription par numéro. Connexion pure : PAS de parrainage,
 * PAS de filleul, PAS de profit. C'est juste un lien sympa pour rejoindre l'app.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Inviter { username: string; display_name: string | null; avatar_url: string | null }

export default function ReferralPage() {
  const params = useParams();
  const router = useRouter();
  const code = decodeURIComponent(String(params?.code || ''));
  const [inviter, setInviter] = useState<Inviter | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!code) return;
    // Mémorise qui a partagé le lien (purement pour dire "X t'a invité", 1h). Aucun profit.
    try { document.cookie = `t2m_ref=${encodeURIComponent(code)}; path=/; max-age=3600; SameSite=Lax`; } catch { /* */ }

    // Tracking prospectus (Pascal 2026-07-01) : on note OÙ le lien est scanné.
    // 1) tout de suite via l'IP (aucune permission) ; 2) plus précis si géoloc accordée.
    const post = (b: Record<string, unknown>) =>
      fetch('/api/flyer/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, ...b }) }).catch(() => {});
    post({});
    try {
      navigator.geolocation?.getCurrentPosition(
        (p) => post({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => {}, // refus → on garde le repli IP
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    } catch { /* */ }
    fetch(`/api/referral/who?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setInviter(d.inviter); })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [code]);

  const name = inviter?.display_name || inviter?.username || '';

  return (
    <main className="min-h-[100svh] w-full flex items-center justify-center bg-[#0e0e12] px-5 py-10">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-512.png" alt="Talk2Me" className="w-20 h-20 mx-auto rounded-3xl" />

        {inviter ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2">
              {inviter.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={inviter.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border border-white/15" />
                : <div className="w-16 h-16 rounded-full grid place-items-center bg-white/10 text-white text-[22px] font-bold">{(name || '?')[0]?.toUpperCase()}</div>}
              <h1 className="text-[22px] font-semibold text-white/95">{name} t&apos;invite sur Talk2Me</h1>
            </div>
            <p className="text-[14px] text-white/60 leading-relaxed">
              Rejoins {name} sur Talk2Me : discute, appelle, vends, achète — tout au même endroit.
            </p>
          </div>
        ) : (
          <h1 className="text-[22px] font-semibold text-white/95">
            {checked ? 'Bienvenue sur Talk2Me' : '…'}
          </h1>
        )}

        <button
          type="button"
          onClick={() => router.push('/signin')}
          className="w-full h-12 rounded-full bg-white text-black text-[15px] font-semibold hover:bg-white/90 active:bg-white/80 transition-colors"
        >
          Rejoindre {name ? `(${name})` : ''} →
        </button>
        <p className="text-[12px] text-white/40">Inscription en 10 secondes avec ton numéro.</p>
      </div>
    </main>
  );
}
