/**
 * Talk2Me — messages d'erreur d'ACHAT lisibles (Pascal 2026-06-24).
 * Un seul endroit : fini les codes bruts (« cannot_buy_own ») affichés à l'user.
 */
export function buyError(code?: string | null): string {
  switch (code) {
    case 'cannot_buy_own': return 'Tu ne peux pas acheter ta propre annonce 🙂';
    case 'insufficient_funds':
    case 'insufficient_balance': return 'Solde insuffisant — recharge ton Wallet.';
    case 'no_seller': return 'Vendeur introuvable.';
    case 'price_unset': return "Cette annonce n'a pas de prix.";
    case 'msisdn_required': return 'Numéro mobile money requis pour payer.';
    case 'annonce_not_found':
    case 'item_not_found':
    case 'shop_not_found': return "Article introuvable (peut-être supprimé).";
    case 'bad_amount': return 'Montant invalide.';
    default: return 'Achat impossible pour le moment, réessaie.';
  }
}
