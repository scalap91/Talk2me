/**
 * CockpitDenied — écran affiché quand l'utilisateur n'a pas accès au cockpit
 * (non connecté, ou connecté mais sans rôle attribué). Pascal 2026-06-30.
 */
import Link from 'next/link';

export default function CockpitDenied({ loggedIn }: { loggedIn: boolean }) {
  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-[17px] font-semibold mb-2">Cockpit T2M — accès restreint</h1>
        {loggedIn ? (
          <>
            <p className="text-[13px] text-white/65 leading-relaxed">
              Tu es connecté, mais aucun <b>rôle cockpit</b> ne t&apos;a encore été attribué.
              Demande à un administrateur de t&apos;en assigner un (Cockpit → Accès).
            </p>
            <p className="text-[11.5px] text-white/40 mt-3">Le périmètre visible dépend du rôle attribué à ton compte.</p>
          </>
        ) : (
          <>
            <p className="text-[13px] text-white/65 leading-relaxed">
              Le cockpit est désormais lié à l&apos;authentification réelle. <b>Connecte-toi</b> pour
              y accéder — ton périmètre sera déterminé par le rôle attribué à ton compte.
            </p>
            <Link href="/" className="inline-block mt-4 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-200 px-3.5 py-1.5 text-[13px] hover:bg-sky-500/30">
              Se connecter →
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
