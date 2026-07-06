/**
 * Talk2Me Admin — "ON PART PROPRE" (Pascal 2026-06-30).
 * Bouton un-clic pour vider le feed social (Card OS clean slate).
 * Appelle /api/cards/wipe-feed via la session super-admin du navigateur.
 */
import { getCurrentUser } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import WipeButton from './WipeButton';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function WipeFeedPage() {
  const me = await getCurrentUser();
  if (!me || !isAiOpsAdmin(me.id, me.email)) notFound();

  return (
    <div
      style={{
        padding: 16,
        fontFamily: 'ui-sans-serif, system-ui',
        maxWidth: 720,
        margin: '0 auto',
        color: '#e5e5e5',
        background: '#0a0a0a',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Card OS — Vider le feed</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
        Repart d&apos;un feed vide pour que tout soit du <code>.card</code> propre.
      </p>

      <div
        style={{
          background: '#141414',
          border: '1px solid #222',
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>Périmètre</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
          <div>
            <p style={{ color: '#ef4444', fontWeight: 600, marginBottom: 6 }}>Supprimé</p>
            <ul style={{ color: '#d4d4d8', lineHeight: 1.7, paddingLeft: 16 }}>
              <li>Posts du feed (image / vidéo / texte)</li>
              <li>Leurs likes & commentaires</li>
              <li>Leurs miroirs unified_posts</li>
            </ul>
          </div>
          <div>
            <p style={{ color: '#10b981', fontWeight: 600, marginBottom: 6 }}>Préservé</p>
            <ul style={{ color: '#d4d4d8', lineHeight: 1.7, paddingLeft: 16 }}>
              <li>Produits de boutique</li>
              <li>Brouillons</li>
              <li>Conversations & messages</li>
              <li>Comptes & boutiques</li>
            </ul>
          </div>
        </div>
      </div>

      <WipeButton />
    </div>
  );
}
