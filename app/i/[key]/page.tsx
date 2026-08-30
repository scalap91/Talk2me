'use client';

/**
 * /i/<public_key> — INVITATION PAR UNE FICHE (Pascal 2026-08-30). Un commerçant partage sa fiche
 * (boutique/resto/plat/service/emploi/rencontre) pour faire découvrir T2M. L'invité arrive ici :
 *  1) on pose le parrainage (cookie t2m_ref = pseudo du proprio, comme /r/<code>) ;
 *  2) on mémorise la fiche à mettre en favori + Enregistrées à la 1re ouverture (localStorage) ;
 *  3) déjà connecté → on « claim » tout de suite et on ouvre la fiche ; sinon → inscription.
 * « Faire connaître ≠ parrainer » : aucune chaîne gouvernance ici.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Fiche { key: string; name: string; kind: string; kind_label: string; cover: string | null; owner_username: string | null; owner_name: string | null }

export default function InviteFichePage() {
  const params = useParams();
  const router = useRouter();
  const key = decodeURIComponent(String(params?.key || ''));
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!key) return;
    // Mémorise la fiche à mettre en favori + Enregistrées dès la 1re ouverture connectée.
    try { localStorage.setItem('t2m_pending_fiche', key); } catch { /* */ }

    fetch(`/api/invite/${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then(async (d) => {
        if (d?.ok && d.fiche) {
          setFiche(d.fiche);
          // Parrainage : cookie t2m_ref = pseudo du proprio (posé au signup via linkReferral).
          if (d.fiche.owner_username) {
            try { document.cookie = `t2m_ref=${encodeURIComponent(d.fiche.owner_username)}; path=/; max-age=3600; SameSite=Lax`; } catch { /* */ }
          }
          // Déjà connecté ? → on claim et on ouvre la fiche directement.
          try {
            const me = await fetch('/api/auth/me', { cache: 'no-store' });
            if (me.ok) {
              const j = await me.json();
              if (j?.user) {
                await fetch('/api/invite/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }).catch(() => {});
                try { localStorage.removeItem('t2m_pending_fiche'); } catch { /* */ }
                router.replace(`/b/${encodeURIComponent(key)}`);
                return;
              }
            }
          } catch { /* pas connecté → on montre l'invitation */ }
        }
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [key, router]);

  const who = fiche?.owner_name || '';
  return (
    <main className="min-h-[100svh] w-full flex items-center justify-center bg-[var(--t2m-paper)] px-5 py-10">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-512.png" alt="Talk2Me" className="w-16 h-16 mx-auto rounded-3xl" />

        {fiche ? (
          <div className="space-y-4">
            {fiche.cover
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={fiche.cover} alt="" className="w-full aspect-[16/10] object-cover rounded-2xl border border-[var(--t2m-line)]" />
              : <div className="w-full aspect-[16/10] rounded-2xl bg-[var(--t2m-wash)] grid place-items-center text-[40px]">🛍️</div>}
            <div className="space-y-1.5">
              <h1 className="text-[22px] font-semibold text-[var(--t2m-ink)] leading-tight">{fiche.name}</h1>
              <p className="text-[14px] text-[var(--t2m-ink-3)] leading-relaxed">
                {who ? <b className="text-[var(--t2m-ink-2)]">{who}</b> : 'Quelqu’un'} t’invite à découvrir sa {fiche.kind_label} sur <b className="text-[var(--t2m-ink-2)]">Talk2Me</b>.
                Installe l’appli : la {fiche.kind_label} sera déjà dans tes favoris.
              </p>
            </div>
          </div>
        ) : (
          <h1 className="text-[22px] font-semibold text-[var(--t2m-ink)]">{checked ? 'Bienvenue sur Talk2Me' : '…'}</h1>
        )}

        <button
          type="button"
          onClick={() => router.push('/signin')}
          className="w-full h-12 rounded-full bg-[var(--t2m-primary)] text-white text-[15px] font-semibold hover:opacity-90 active:opacity-80 transition-colors"
        >
          Installer Talk2Me →
        </button>
        <p className="text-[12px] text-[var(--t2m-ink-3)]">Inscription en 10 secondes avec ton numéro. C’est gratuit.</p>
      </div>
    </main>
  );
}
