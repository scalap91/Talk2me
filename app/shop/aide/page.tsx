'use client';

/** Talk2Me — Shop › Aide. FAQ réelle (pas de promesse fausse). */
import ShopPageShell from '@/components/boutique/ShopPageShell';

const FAQ = [
  {
    q: 'Comment créer ma boutique ?',
    a: 'Onglet Shop → bouton + → « Boutique en 1 clic ». Choisis un univers, elle se remplit toute seule de produits, prête à partager.',
  },
  {
    q: 'Comment je gagne de l\'argent ?',
    a: 'Tu partages tes produits à tes contacts. Quand quelqu\'un achète via ton partage, tu touches une part. Tu ne gères ni stock ni envoi.',
  },
  {
    q: 'Qui expédie les produits ?',
    a: 'Le fournisseur expédie directement au client. Toi tu n\'avances rien, tu ne stockes rien.',
  },
  {
    q: 'Et la livraison ?',
    a: 'Selon le produit et le pays. Le délai est affiché avant l\'achat.',
  },
];

export default function AidePage() {
  return (
    <ShopPageShell title="Aide">
      <div className="space-y-3">
        {FAQ.map((f, i) => (
          <div key={i} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
            <p className="text-[14px] font-semibold text-white">{f.q}</p>
            <p className="text-[13px] text-white/60 mt-1.5 leading-relaxed">{f.a}</p>
          </div>
        ))}
        <p className="text-[12px] text-white/35 text-center pt-2">
          Une autre question ? Écris à l&apos;assistance depuis ton profil.
        </p>
      </div>
    </ShopPageShell>
  );
}
