// Talk2Me — plus de SPLASH noir+logo entre les pages (Pascal 2026-09-04).
// Next.js affichait ce fallback pendant CHAQUE Suspense du root layout → un flash noir avec le
// logo s'insérait entre deux écrans. Le natif ne montre jamais ça → on s'aligne : on ne rend RIEN.
// Chaque page porte déjà sa propre coquille instantanée (ex. le chat WhatsApp-style).
export default function Loading() {
  return null;
}
