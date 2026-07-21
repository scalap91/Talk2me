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
import { headers } from 'next/headers';
import { listEnrichments } from '@/lib/cards/engine/enrichments';
import { entityRefFromCardId } from '@/lib/cards/engine/resolve-ref';
import { getArticleMeta } from '@/lib/cards/engine/article';
import { translateArticle, normalizeLang } from '@/lib/cards/engine/translate';
import { getRatingSummary } from '@/lib/cards/engine/ratings';
import { articleFreshness } from '@/lib/cards/engine/freshness';
import LangSwitcher from '@/components/public/LangSwitcher';
import { youtubeId } from '@/lib/cards/entity-key';
import type { SuperCard } from '@/lib/cards/supercard';
import { renderSeo } from '@/lib/cards/v2/reader/seo';
import { convertV1toV2 } from '@/lib/cards/v2/convert';
import PublicShell from '@/components/public/PublicShell';
import ContributionTools from '@/components/cards/ContributionTools';
import EntitySignature from '@/components/cards/EntitySignature';
import EntityRating from '@/components/cards/EntityRating';
import LinkedEntities from '@/components/cards/LinkedEntities';

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

/** Nettoie le markdown INLINE restant (doctrine « pas de markdown brut »). */
function cleanProse(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim();
}

/**
 * Parse un texte (markdown léger) en blocs pour une VRAIE mise en page :
 * les lignes `**Titre**` ou `# Titre` deviennent des sous-titres, le reste des paragraphes.
 */
type ProseBlock = { type: 'h' | 'p'; text: string };
function parseProse(text: string): ProseBlock[] {
  const out: ProseBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      out.push({ type: 'p', text: para.join(' ') });
      para = [];
    }
  };
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = line.match(/^\*\*(.+?)\*\*[:：]?$/) || line.match(/^#{1,6}\s+(.+?)$/);
    if (h) {
      flush();
      out.push({ type: 'h', text: cleanProse(h[1]) });
    } else {
      para.push(line);
    }
  }
  flush();
  return out;
}

/** Rend un texte en article structuré (sous-titres + paragraphes), markdown nettoyé. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {parseProse(text).map((b, i) =>
        b.type === 'h' ? (
          <h2 key={i} style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 800, color: 'var(--t2m-ink)', margin: '24px 0 6px' }}>
            {b.text}
          </h2>
        ) : (
          <p key={i} style={{ fontSize: 16, lineHeight: 1.68, color: 'var(--t2m-ink)', whiteSpace: 'pre-wrap', margin: '10px 0' }}>
            {cleanProse(b.text)}
          </p>
        ),
      )}
    </>
  );
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

/**
 * Chemin SEO v2 (SuperCard) — derrière le flag SUPERCARD_SEO_V2. Le MÊME lecteur unique
 * (contexte `seo`) produit les métadonnées ; on mappe SeoMeta → Metadata Next. og:type ramené
 * aux valeurs acceptées par Next (product/restaurant/boutique → website). Legacy inchangé si flag off.
 */
function buildMetadataV2(card: SuperCard, keywords: string[], flagged: boolean): Metadata {
  const meta = renderSeo(convertV1toV2(card as unknown as Parameters<typeof convertV1toV2>[0]));
  const ogType: 'website' | 'article' | 'music.song' | 'music.album' | 'video.other' =
    meta.ogType === 'article' ? 'article'
    : meta.ogType === 'music.song' ? 'music.song'
    : meta.ogType === 'music.album' ? 'music.album'
    : meta.ogType === 'video.other' ? 'video.other'
    : 'website';
  const images = meta.image ? [meta.image] : [];
  return {
    title: meta.title,
    description: meta.description,
    keywords,
    robots: flagged ? { index: false, follow: true } : undefined,
    alternates: { canonical: meta.canonical },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: meta.canonical,
      type: ogType,
      siteName: meta.siteName,
      images,
    },
    twitter: {
      card: images.length ? 'summary_large_image' : 'summary',
      title: meta.title,
      description: meta.description,
      images,
    },
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const card = loadCard(id);
  if (!card) return { title: 'Contenu introuvable | Talk2Me' };
  const seo = cardSeo(card);
  // Article jugé douteux / signalé → on COUPE l'indexation Google (ne pas ranker du douteux).
  const flagged = (() => {
    try {
      return getRatingSummary(entityRefFromCardId(id)).flagged;
    } catch {
      return false;
    }
  })();
  // Bascule #1 : le lecteur unique v2 produit la SEO si le flag est armé (OFF par défaut → legacy).
  if (process.env.SUPERCARD_SEO_V2 === '1') return buildMetadataV2(card, seo.keywords, flagged);
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    robots: flagged ? { index: false, follow: true } : undefined,
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

export default async function CardPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
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
  // ARTICLE CANONIQUE (M1) : Léa a fusionné les contributions en UN corps cohérent.
  // Repli : tant qu'aucune fusion n'a eu lieu, on montre le texte d'origine + le legacy
  // (anciens enrichissements empilés) — que la 1re fusion remplacera proprement.
  const ref = entityRefFromCardId(card.id);
  const meta = (() => {
    try {
      return getArticleMeta(ref);
    } catch {
      return null;
    }
  })();

  // LANGUE DU LECTEUR : ?lang= explicite > Accept-Language du navigateur > langue source.
  const sp = await searchParams;
  const accept = (await headers()).get('accept-language') || '';
  const readerLang = normalizeLang((sp?.lang as string) || accept.split(',')[0] || meta?.lang || 'français');

  let articleBody: string;
  if (meta) {
    // UN article canonique → traduit à la volée dans la langue du lecteur (caché par langue+version).
    articleBody = await translateArticle({
      entityRef: ref,
      body: meta.body,
      version: meta.version,
      sourceLang: meta.lang,
      targetLang: readerLang,
    });
  } else {
    // Repli legacy (pas encore fusionné) : texte d'origine + anciens enrichissements.
    const legacy = (() => {
      try {
        return listEnrichments(ref).map((e) => e.text);
      } catch {
        return [];
      }
    })();
    articleBody = [card.text?.body, ...legacy].filter(Boolean).join('\n\n');
  }

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

        {/* Bloc SON enrichi natif — l'iframe ci-dessus est le lecteur (doctrine passthrough) ;
            ici on garde la carte riche (source + titre + auteur + lien) pour ne pas perdre
            l'enrichissement du son quand on lit depuis la card. Pascal 2026-07-12. */}
        {card.audio?.title ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--t2m-surface, #f4f4f5)', marginBottom: 18 }}>
            {card.audio.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.audio.thumbnail} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flex: '0 0 auto' }} />
            ) : null}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: 'var(--t2m-primary)', textTransform: 'uppercase' }}>{card.audio.source_label || 'Son'}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2m-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.audio.title}</div>
              {card.audio.author ? <div style={{ fontSize: 12.5, color: 'var(--t2m-ink-soft, #71717a)' }}>{card.audio.author}</div> : null}
            </div>
            {card.audio.external_url ? (
              <a href={card.audio.external_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t2m-primary)', flex: '0 0 auto' }}>Voir ↗</a>
            ) : null}
          </div>
        ) : null}

        <h1 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 26, fontWeight: 800, lineHeight: 1.2, margin: '0 0 8px' }}>
          {seo.heading}
        </h1>

        {/* Traduction lecteur + état du cycle de vie (mûr/figé). */}
        {meta && (
          <div style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <LangSwitcher current={readerLang} />
            {meta.state !== 'developing' && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t2m-ink-3)', border: '1px solid var(--t2m-line)', borderRadius: 999, padding: '2px 9px' }}>
                {meta.state === 'frozen' ? '🔒 Figé' : '✦ Article mûr'}
              </span>
            )}
            {(() => {
              const f = articleFreshness(meta.body);
              return f.stale ? (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 999, padding: '2px 9px' }}>
                  ⏳ Données ~{f.latestYear} · à rafraîchir
                </span>
              ) : null;
            })()}
          </div>
        )}

        {card.source?.name && (
          <p style={{ color: 'var(--t2m-ink-2)', fontSize: 14, margin: '0 0 4px' }}>{card.source.name}</p>
        )}
        {price && (
          <p style={{ color: 'var(--t2m-primary)', fontSize: 20, fontWeight: 800, margin: '4px 0 12px' }}>{price}</p>
        )}

        {/* Article canonique (fusionné par Léa) — un seul corps cohérent, aucune étiquette. */}
        {articleBody && <Prose text={articleBody} />}

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

      {/* NOTE LECTEUR + SIGNALEMENT (M3) — le public juge la fiabilité, remonte la merde. */}
      <EntityRating cardId={card.id} />

      {/* BLOC CONTRIBUTION — séparé, SOUS l'article (sorti du texte) : outil « Enrichir ». */}
      <ContributionTools cardId={card.id} />

      {/* PAGES LIÉES (M7) — Léa propose les entités citées + leur vrai clip ; l'humain crée. */}
      {meta && <LinkedEntities cardId={card.id} />}

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
