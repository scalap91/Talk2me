'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import BoutiqueVitrine from '@/components/boutique/BoutiqueVitrine';

interface BoutiqueData {
  name: string;
  description: string | null;
  cover_url: string | null;
}

interface CategoryGroup {
  category: string;
  products: Array<{
    id: string;
    media_url: string | null;
    caption: string | null;
    product: {
      title?: string;
      price_label?: string;
      image_url?: string;
      source?: string;
      source_url?: string;
    } | null;
    boosted?: boolean;
  }>;
}

interface ApiResponse {
  ok: boolean;
  boutique: BoutiqueData;
  categories: CategoryGroup[];
}

export default function BoutiquePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/boutiques/${id}`, { cache: 'no-store' });
        if (!res.ok) {
          setError(true);
          return;
        }
        const json: ApiResponse = await res.json();
        if (!json.ok) {
          setError(true);
          return;
        }
        setData(json);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="bg-[#0a0a0d] min-h-[100dvh] overflow-y-auto flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-[#0a0a0d] min-h-[100dvh] overflow-y-auto flex flex-col items-center justify-center gap-4">
        <p className="text-white/60 text-sm">Boutique introuvable</p>
        <a
          href="/home"
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500 transition-colors"
        >
          Retour à l&apos;accueil
        </a>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0d] min-h-[100dvh] overflow-y-auto">
      <BoutiqueVitrine boutique={data.boutique} categories={data.categories} shopId={id} />
    </div>
  );
}
