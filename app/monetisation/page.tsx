import { redirect } from 'next/navigation';

/**
 * « Monétisation » FUSIONNÉ dans « Mon relevé » (/wallet) — Pascal 2026-08-08.
 * Le relevé (non-custodial) porte désormais Mes ventes + Mes commissions + Mes sources de revenus
 * (Boutique/Affiliation/Parrainage) + escrow + journal. On garde une redirection pour ne casser AUCUN
 * lien existant (deep links, WebView natif). Plus de langage custodial « solde · retrait ».
 */
export default function MonetisationRedirect() {
  redirect('/wallet');
}
