/**
 * /u/<username> — Profil « Discovery » MAGAZINE, PUBLIC + SSR + SEO (Pascal 2026-08-30).
 * Server component : agrège la vie T2M (getProfileDiscovery) + génère les métadonnées (title,
 * description, og:image = la photo) + JSON-LD Person → indexable Google. Le rendu magazine + les
 * interactions (Suivre/Message) sont dans le client ProfileDiscoveryClient. `/u/` est whitelisté
 * public dans le middleware ; l'API /api/users reste gated → on lit les fonctions lib en direct.
 */
import type { Metadata } from 'next';
import { getProfileDiscovery } from '@/lib/profile-discovery';
import ProfileDiscoveryClient from '@/components/profile/ProfileDiscoveryClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE = 'https://talk2me.fr';
const abs = (u: string | null | undefined) => (!u ? `${SITE}/icons/icon-512.png` : u.startsWith('http') ? u : `${SITE}${u}`);

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const d = getProfileDiscovery(decodeURIComponent(username));
  const u = d.user;
  if (!u) return { title: 'Profil introuvable · Talk2Me' };
  const name = u.display_name || u.username;
  // Description SEO = portrait IA (riche, unique) en priorité ; repli tagline puis générique.
  const desc = (d.ai?.portrait || u.tagline || `Découvre ${name} sur Talk2Me : ses publications, ses boutiques, sa musique et ses coups de cœur.`).replace(/\s+/g, ' ').trim();
  const url = `${SITE}/u/${encodeURIComponent(u.username)}`;
  const img = abs(u.avatar_url);
  return {
    title: `${name} (@${u.username}) · Talk2Me`,
    description: desc,
    alternates: { canonical: url },
    openGraph: { title: `${name} sur Talk2Me`, description: desc, url, type: 'profile', siteName: 'Talk2Me', images: [{ url: img }] },
    twitter: { card: 'summary_large_image', title: `${name} sur Talk2Me`, description: desc, images: [img] },
    robots: { index: true, follow: true },
  };
}

export default async function ProfileDiscoveryPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const data = getProfileDiscovery(decodeURIComponent(username));
  const u = data.user;
  const jsonLd = u ? {
    '@context': 'https://schema.org', '@type': 'Person',
    name: u.display_name || u.username, alternateName: `@${u.username}`,
    image: abs(u.avatar_url), url: `${SITE}/u/${encodeURIComponent(u.username)}`,
  } : null;
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <ProfileDiscoveryClient data={data} />
    </>
  );
}
