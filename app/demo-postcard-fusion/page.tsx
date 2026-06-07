'use client';

/**
 * /demo-postcard-fusion — Démo visuelle de l'heuristique de fusion des slides
 * dans PostCard (mode fullScreen).
 *
 * Doctrine `talktome-card-vivante` + retour Pascal 2026-06-04 :
 *   "il avait la place pour mettre le commentaire en dessous il la mis en
 *    caroussel cest pas bon on vois pas quil y a un commentaire"
 *
 * Cette page mounte PostCard avec deux fixtures côte à côte :
 *  - ?case=fusion → YouTubeCard + texte court "Un son de ouf" → 1 SEULE slide
 *  - ?case=multi  → 3 cards riches (YT, Place, Recipe) → 3 slides justifiées
 *
 * Aucun appel API, aucune PII, fixtures statiques. Page whitelistée par
 * middleware.ts (PUBLIC_PATH_PREFIXES) pour permettre la capture headless.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PostCard from '@/components/feed/PostCard';

const FIXTURE_FUSION = {
  id: 'demo-fusion',
  createdAt: Date.now() - 5 * 60 * 1000,
  likes: 42,
  views: 318,
  messages: [
    {
      id: 'm1',
      role: 'agent' as const,
      content: '',
      youtube: {
        video_id: 'L_jWHffIx5E',
        title: 'Joé Dwèt Filé - Slowly (Clip Officiel)',
        channel: 'Joé Dwèt Filé',
        description: 'Slowly disponible partout en streaming.',
        thumbnail: 'https://i.ytimg.com/vi/L_jWHffIx5E/hqdefault.jpg',
      },
    },
    {
      id: 'm2',
      role: 'user' as const,
      content: 'Un son de ouf',
    },
  ],
};

const FIXTURE_MULTI = {
  id: 'demo-multi',
  createdAt: Date.now() - 30 * 60 * 1000,
  likes: 12,
  views: 87,
  messages: [
    {
      id: 'm1',
      role: 'agent' as const,
      content: '',
      youtube: {
        video_id: 'aqz-KE-bpKQ',
        title: 'Big Buck Bunny (Open Movie)',
        channel: 'Blender Foundation',
        description: 'Court-métrage open-source.',
        thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
      },
    },
    {
      id: 'm2',
      role: 'agent' as const,
      content: '',
      places: [
        {
          name: 'Le Petit Bistrot',
          category: 'restaurant',
          cuisine: 'french',
          address: '12 rue des Lilas, 75011 Paris',
          distance_m: 320,
          maps_url: 'https://maps.google.com/?q=Le+Petit+Bistrot',
          google_maps_url: 'https://maps.google.com/?q=Le+Petit+Bistrot',
          lat: 48.857,
          lng: 2.378,
          image_url: null,
        },
      ],
    },
    {
      id: 'm3',
      role: 'agent' as const,
      content: '',
      recipe: {
        name: 'Tarte au citron meringuée',
        image: null,
        prep_time: '45min',
        servings: '6 pers.',
        difficulty: 'Moyen',
        ingredients: ['Pâte sablée', 'Citrons jaunes', 'Sucre', 'Œufs'],
        description: 'Le grand classique acidulé.',
        source_url: 'https://www.marmiton.org/recettes/recette_tarte-au-citron-meringuee_15904.aspx',
        source: 'marmiton' as const,
      },
    },
  ],
};

function Inner() {
  const params = useSearchParams();
  const caseName = params?.get('case') || 'fusion';
  const fixture = caseName === 'multi' ? FIXTURE_MULTI : FIXTURE_FUSION;
  return (
    <div className="fixed inset-0 bg-[#0a0a0d] flex flex-col">
      {/* Header de demo (hors PostCard) */}
      <div className="flex-none px-4 py-1.5 bg-[#101015] border-b border-white/8 text-[10px] text-white/55 font-mono">
        demo-postcard-fusion · case={caseName} · viewport simulé S23 FE
      </div>
      {/* Bottom-nav factice (hors PostCard) pour reproduire la chrome */}
      <div className="flex-1 min-h-0">
        <PostCard post={fixture} fullScreen isOwner={false} />
      </div>
      <div className="flex-none h-[64px] bg-[#101015] border-t border-white/8 flex items-center justify-around text-[10px] text-white/40">
        <span>Accueil</span>
        <span>Recherche</span>
        <span>+</span>
        <span>Amis</span>
        <span>Moi</span>
      </div>
    </div>
  );
}

export default function DemoPostCardFusion() {
  return (
    <Suspense fallback={<div className="p-6 text-white">…</div>}>
      <Inner />
    </Suspense>
  );
}
