'use client';

/**
 * /legal — Hub des pages légales & institutionnelles (Phase 1.1).
 * Liste tous les documents (mentions, CGU, confidentialité, cookies, RGPD, CGV).
 * Style sobre/premium, cohérent T2M. Accessible depuis Profil + inscription.
 */
import Link from 'next/link';
import { ArrowLeft, FileText, ShieldCheck, Cookie, Scale, UserCheck, ShoppingBag, Info, Mail, HelpCircle } from '@/lib/icons';
import { LEGAL_DOCS, INFO_DOCS, LEGAL_UPDATED } from '@/lib/legal/content';

const INFO_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  about: Info, contact: Mail, faq: HelpCircle,
};

const ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'mentions-legales': FileText,
  cgu: Scale,
  confidentialite: ShieldCheck,
  cookies: Cookie,
  rgpd: UserCheck,
  cgv: ShoppingBag,
};

export default function LegalHub() {
  return (
    <main className="min-h-[100svh] bg-[var(--t2m-paper)] text-[var(--t2m-ink)]">
      <header className="sticky top-0 z-10 bg-[var(--t2m-paper)]/90 backdrop-blur border-b border-[var(--t2m-line)] px-4 py-3 flex items-center gap-3">
        <Link href="/profile" aria-label="Retour" className="w-9 h-9 -ml-1 rounded-full grid place-items-center text-[var(--t2m-ink-2)] hover:bg-[var(--t2m-wash)]">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-[16px] font-bold">Infos, aide & mentions légales</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5">
        <p className="text-[var(--t2m-ink-3)] text-[13px] leading-relaxed mb-5">
          Tout savoir sur Talk2Me, nous contacter, et les documents qui encadrent son utilisation. Mise à jour : {LEGAL_UPDATED}.
        </p>

        <div className="text-[12px] font-semibold text-[var(--t2m-ink-3)] uppercase tracking-wide mb-2">Aide & infos</div>
        <ul className="space-y-2 mb-6">
          {INFO_DOCS.map((d) => {
            const Icon = INFO_ICON[d.slug] || Info;
            return (
              <li key={d.slug}>
                <Link href={`/infos/${d.slug}`} className="flex items-center gap-3 rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] px-4 py-3.5 hover:bg-[var(--t2m-wash)] transition-colors">
                  <span className="w-10 h-10 rounded-xl grid place-items-center bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] shrink-0"><Icon size={19} /></span>
                  <span className="flex-1 text-[14.5px] font-medium text-[var(--t2m-ink)]">{d.title}</span>
                  <span className="text-[var(--t2m-ink-3)] text-lg">›</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="text-[12px] font-semibold text-[var(--t2m-ink-3)] uppercase tracking-wide mb-2">Légal</div>
        <ul className="space-y-2">
          {LEGAL_DOCS.map((d) => {
            const Icon = ICON[d.slug] || FileText;
            return (
              <li key={d.slug}>
                <Link
                  href={`/legal/${d.slug}`}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] px-4 py-3.5 hover:bg-[var(--t2m-wash)] transition-colors"
                >
                  <span className="w-10 h-10 rounded-xl grid place-items-center bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] shrink-0">
                    <Icon size={19} />
                  </span>
                  <span className="flex-1 text-[14.5px] font-medium text-[var(--t2m-ink)]">{d.title}</span>
                  <span className="text-[var(--t2m-ink-3)] text-lg">›</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="text-[var(--t2m-ink-3)] text-[11px] leading-relaxed mt-6">
          Talk2Me est édité par GeniusWeb. Contact : pascal.repir@gmail.com · Hébergeur : OVH (France).
          Ces documents sont un premier socle et seront affinés.
        </p>
      </div>
    </main>
  );
}
