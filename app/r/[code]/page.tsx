'use client';

/**
 * Talk2Me — Page d'invitation /r/<code> (Pascal 2026-06-25, parrainage B1).
 * Le filleul arrive ici via le lien partagé. On pose le cookie t2m_ref (capté à
 * l'inscription) et on affiche QUI l'invite. Bouton → écran d'inscription par numéro.
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
    // Pose le cookie de parrainage (capté au signup, valable 1h).
    try { document.cookie = `t2m_ref=${encodeURIComponent(code)}; path=/; max-age=3600; SameSite=Lax`; } catch { /* */ }
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
