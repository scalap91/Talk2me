/* eslint-disable @next/next/no-img-element */
/**
 * Page-entité PUBLIQUE, rendue côté SERVEUR (Next 16 App Router). SEO Platform Core.
 * Les bots reçoivent : <title>/description via generateMetadata (cardSeo), le JSON-LD
 * schema.org dans le HTML, un H1 = le nom de l'entité, et le contenu réel — SANS JS.
 * GROUNDED : lit une vraie card publiée (direct_cards). Privé jamais exposé.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db-core';
import { parseDirectCardRow } from '@/lib/db-direct-cards';
import { cardFromDirectCard } from '@/lib/cards/composer-io';
import { cardSeo } from '@/lib/cards/card-seo';
import { youtubeId } from '@/lib/cards/entity-key';
import type { SuperCard } from '@/lib/cards/supercard';

/** Charge une card publiée (non supprimée/archivée) → SuperCard, ou null. */
function loadCard(id: string): SuperCard | null {
  try {
    const row = getDb()
      .prepare('SELECT * FROM direct_cards WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL LIMIT 1')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return cardFromDirectCard(parseDirectCardRow(row));
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const card = loadCard(id);
  if (!card) return { title: 'Contenu introuvable | Talk2Me' };
  const seo = cardSeo(card);
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: seo.canonical },
    openGraph: {
      title: seo.openGraph.title,
      description: seo.openGraph.description,
      url: seo.openGraph.url,
      type: seo.openGraph.type as 'website' | 'article' | 'music.song',
      siteName: seo.openGraph.siteName,
      images: seo.openGraph.images,
    },
    twitter: {
      card: seo.twitter.card,
      title: seo.twitter.title,
      description: seo.twitter.description,
      images: seo.twitter.images,
    },
  };
}

export default async function CardPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = loadCard(id);
  if (!card) notFound();
  const seo = cardSeo(card);
  const cover = card.images?.[0];
  // Entité YouTube (son/vidéo) → on rend le lecteur officiel embarqué (doctrine passthrough).
  const ytId = youtubeId(card.video?.url) || youtubeId(card.video?.embed) || youtubeId(card.audio?.embed);
  const price =
    typeof card.price?.amount === 'number'
      ? `${card.price.amount}${card.price.currency ? ' ' + card.price.currency : ''}`
      : null;

  return (
    <main style={{ minHeight: '100svh', background: 'var(--t2m-paper)', color: 'var(--t2m-ink)' }}>
      {/* JSON-LD schema.org — rendu SERVEUR, lisible par Google/les IA sans JS. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(seo.jsonLd) }} />

      <article style={{ maxWidth: 720, margin: '0 auto', padding: '20px 18px 64px' }}>
        {ytId ? (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 16, overflow: 'hidden', marginBottom: 18, background: '#000' }}>
            <iframe
              src={`https://www.youtube.com/embed/${ytId}`}
              title={seo.heading}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          </div>
        ) : cover ? (
          <img
            src={cover}
            alt={card.title}
            style={{ width: '100%', maxHeight: 420, objectFit: 'cover', borderRadius: 16, marginBottom: 18 }}
          />
        ) : null}

        <h1 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 26, fontWeight: 800, lineHeight: 1.2, margin: '0 0 8px' }}>
          {seo.heading}
        </h1>

        {card.source?.name && (
          <p style={{ color: 'var(--t2m-ink-2)', fontSize: 14, margin: '0 0 4px' }}>{card.source.name}</p>
        )}
        {price && (
          <p style={{ color: 'var(--t2m-primary)', fontSize: 20, fontWeight: 800, margin: '4px 0 12px' }}>{price}</p>
        )}

        {card.text?.body && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--t2m-ink)', whiteSpace: 'pre-wrap', margin: '10px 0' }}>
            {card.text.body}
          </p>
        )}

        {!!card.specs && Object.keys(card.specs).length > 0 && (
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: '14px 0', fontSize: 14 }}>
            {Object.entries(card.specs).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--t2m-ink-3)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</dt>
                <dd style={{ margin: 0, color: 'var(--t2m-ink)' }}>{v}</dd>
              </div>
            ))}
          </dl>
        )}

        <a
          href="/home"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 20, padding: '12px 22px',
            borderRadius: 14, background: 'var(--t2m-primary)', color: '#fff', fontWeight: 800, fontSize: 15,
            textDecoration: 'none',
          }}
        >
          Ouvrir dans Talk2Me →
        </a>

        <p style={{ marginTop: 28, fontSize: 12, color: 'var(--t2m-ink-3)' }}>
          Publié sur <strong>Talk2Me</strong> · le web qui comprend ta conversation.
        </p>
      </article>
    </main>
  );
}
