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
import { cardSeo, cardPath } from '@/lib/cards/card-seo';
import { youtubeId } from '@/lib/cards/entity-key';
import type { SuperCard } from '@/lib/cards/supercard';
import PublicShell from '@/components/public/PublicShell';
import ContributionTools from '@/components/cards/ContributionTools';
import EntitySignature from '@/components/cards/EntitySignature';

/** Entités liées (maillage interne SEO) : cards publiées récentes, hors la courante. */
function loadRelated(excludeId: string, limit = 6): { path: string; title: string; thumb: string | null }[] {
  try {
    const rows = getDb()
      .prepare('SELECT * FROM direct_cards WHERE id != ? AND deleted_at IS NULL AND archived_at IS NULL ORDER BY created_at DESC LIMIT ?')
      .all(excludeId, limit) as Record<string, unknown>[];
    return rows.map((row) => {
      const c = cardFromDirectCard(parseDirectCardRow(row));
      const yt = youtubeId(c.video?.url) || youtubeId(c.video?.embed) || youtubeId(c.audio?.embed);
      const thumb = c.images?.[0] || (yt ? `https://i.ytimg.com/vi/${yt}/mqdefault.jpg` : null);
      return { path: cardPath(c), title: cardSeo(c).heading, thumb };
    });
  } catch {
    return [];
  }
}

/** L'URL est `/card/{slug}--{id}` : on extrait l'id (autorité), le slug est cosmétique. */
function idFromParam(param: string): string {
  return param.includes('--') ? param.split('--').pop() || param : param;
}

/** Charge une card publiée (non supprimée/archivée) → SuperCard, ou null. */
function loadCard(param: string): SuperCard | null {
  const id = idFromParam(param);
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
  // PAS de redirect ici : une redirection sur une navigation + un vieux SW = about:blank
  // (cf. historique sw.js). Le tag <link rel="canonical"> (dans generateMetadata) suffit à
  // consolider l'URL nue vers l'URL sluggée pour Google. Pascal 2026-07-08.
  const seo = cardSeo(card);
  const cover = card.images?.[0];
  // Entité YouTube (son/vidéo) → on rend le lecteur officiel embarqué (doctrine passthrough).
  const ytId = youtubeId(card.video?.url) || youtubeId(card.video?.embed) || youtubeId(card.audio?.embed);
  const price =
    typeof card.price?.amount === 'number'
      ? `${card.price.amount}${card.price.currency ? ' ' + card.price.currency : ''}`
      : null;

  const related = loadRelated(card.id);

  return (
    <PublicShell>
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
          Voir sur le feed →
        </a>

        {/* SIGNATURE journalistique — byline qui FERME le bloc entité (vidéo+texte+signature). */}
        <EntitySignature cardId={card.id} />
      </article>

      {/* BLOC CONTRIBUTION — séparé, SOUS l'article (sorti du texte) : outil « Enrichir ». */}
      <ContributionTools cardId={card.id} />

      {/* ENTITÉS LIÉES — maillage interne (crawl + le visiteur explore, il ne rebondit pas). */}
      {related.length > 0 && (
        <section style={{ maxWidth: 720, margin: '0 auto', padding: '4px 18px 40px' }}>
          <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 800, margin: '0 0 14px' }}>À découvrir aussi</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14 }}>
            {related.map((r) => (
              <li key={r.path}>
                <a href={r.path} style={{ textDecoration: 'none', color: 'var(--t2m-ink)', display: 'block' }}>
                  <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', background: 'var(--t2m-wash)', marginBottom: 6 }}>
                    {r.thumb && <img src={r.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PublicShell>
  );
}
