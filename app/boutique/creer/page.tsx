// app/boutique/creer/page.tsx
// Écran 'Boutique en 1 clic' — 3 étapes dans une seule page
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Loader2,
  CheckCircle2,
  PartyPopper,
  Share2,
  Copy,
  Store,
} from 'lucide-react';

// Types
interface Theme {
  key: string;
  name: string;
  emoji: string;
}

interface OneClickConfig {
  ok: boolean;
  configured: boolean;
  themes: Theme[];
}

interface BoutiqueResult {
  id: string;
  slug: string;
  name: string;
}

interface CreateResponse {
  ok: boolean;
  boutique: BoutiqueResult;
  count: number;
}

type Mode = 'choose' | 'creating' | 'done';

export default function CreerBoutiquePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('choose');
  const [config, setConfig] = useState<OneClickConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boutiqueName, setBoutiqueName] = useState('');
  const [result, setResult] = useState<{
    boutique: BoutiqueResult;
    count: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Charger la configuration au montage
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/boutiques/one-click', {
          cache: 'no-store',
        });

        if (res.status === 401) {
          router.push('/signin');
          return;
        }

        if (!res.ok) {
          throw new Error('Erreur de chargement');
        }

        const data: OneClickConfig = await res.json();
        setConfig(data);
      } catch (err) {
        setError('Impossible de charger la configuration');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [router]);

  // Créer la boutique
  const handleThemeClick = async (themeKey: string) => {
    setMode('creating');
    setError(null);

    try {
      const res = await fetch('/api/boutiques/one-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: themeKey,
          name: boutiqueName.trim() || undefined,
        }),
        cache: 'no-store',
      });

      if (res.status === 401) {
        router.push('/signin');
        return;
      }

      const data: CreateResponse = await res.json();

      if (!data.ok) {
        throw new Error(data.ok === false ? 'Erreur serveur' : 'Échec de création');
      }

      setResult({ boutique: data.boutique, count: data.count });
      setMode('done');
    } catch (err) {
      setError('La création a échoué. Réessaie.');
      setMode('choose');
    }
  };

  // Partager la boutique
  const handleShare = async () => {
    if (!result) return;

    const url = `https://talk2me.fr/${result.boutique.slug}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: result.boutique.name,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setToast('Lien copié');
        setTimeout(() => setToast(null), 2000);
      }
    } catch {
      // Fallback si share échoue
      try {
        await navigator.clipboard.writeText(url);
        setToast('Lien copié');
        setTimeout(() => setToast(null), 2000);
      } catch {
        setToast('Erreur de partage');
        setTimeout(() => setToast(null), 2000);
      }
    }
  };

  // Réinitialiser pour créer une autre boutique
  const handleReset = () => {
    setMode('choose');
    setResult(null);
    setBoutiqueName('');
    setError(null);
  };

  // État de chargement initial
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0d] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#ef4444] animate-spin" />
      </div>
    );
  }

  // Erreur de chargement
  if (error && !config) {
    return (
      <div className="min-h-screen bg-[#0a0a0d] flex items-center justify-center">
        <div className="text-center text-white/60">
          <p className="text-lg">{error}</p>
          <button
            onClick={() => router.push('/home')}
            className="mt-4 text-[#ef4444] hover:text-[#dc2626] transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0d] text-white">
      {/* Header sticky */}
      <header className="sticky top-0 z-10 bg-[#0a0a0d]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push('/home')}
            className="p-2 -ml-2 hover:bg-white/5 rounded-xl active:scale-95 transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-white/70" />
          </button>
          <h1 className="text-lg font-semibold text-white/90">
            Boutique en 1 clic
          </h1>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="max-w-md mx-auto px-4 py-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2 text-sm text-white/80 shadow-lg">
            {toast}
          </div>
        )}

        {/* ÉTAPE 1 : Choix du thème */}
        {mode === 'choose' && (
          <div className="space-y-6">
            {/* Titre */}
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">
                Crée ta boutique en 1 clic
              </h2>
              <p className="text-white/50 text-sm leading-relaxed">
                Choisis un univers, on la remplit de produits pour toi.
              </p>
            </div>

            {/* Vérification configuration */}
            {config && !config.configured ? (
              <div className="bg-white/5 rounded-3xl p-6 text-center">
                <Store className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/60 text-sm">
                  Le dropshipping n'est pas encore activé.
                </p>
              </div>
            ) : (
              <>
                {/* Champ nom optionnel */}
                <div>
                  <input
                    type="text"
                    placeholder="Nom de ta boutique (optionnel)"
                    value={boutiqueName}
                    onChange={(e) => setBoutiqueName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#ef4444]/50 focus:bg-white/[0.07] transition-all"
                  />
                </div>

                {/* Grille des thèmes */}
                <div className="grid grid-cols-2 gap-3">
                  {config?.themes.map((theme) => (
                    <button
                      key={theme.key}
                      onClick={() => handleThemeClick(theme.key)}
                      className="flex flex-col items-center gap-2 p-4 bg-white/5 border border-white/5 rounded-3xl hover:bg-white/[0.07] hover:border-white/10 active:scale-95 transition-all shadow-sm"
                    >
                      <span className="text-3xl">{theme.emoji}</span>
                      <span className="text-sm font-medium text-white/80">
                        {theme.name}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Message d'erreur */}
                {error && (
                  <p className="text-red-400/80 text-sm text-center bg-red-500/10 rounded-2xl px-4 py-2">
                    {error}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ÉTAPE 2 : Création en cours */}
        {mode === 'creating' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="bg-white/5 rounded-full p-4">
              <Loader2 className="w-10 h-10 text-[#ef4444] animate-spin" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-lg font-medium text-white/90">
                On monte ta boutique…
              </p>
              <p className="text-sm text-white/40">
                On ajoute de vrais produits, ça prend quelques secondes
              </p>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 : Succès */}
        {mode === 'done' && result && (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            {/* Icône succès */}
            <div className="bg-[#ef4444]/10 rounded-full p-4">
              <PartyPopper className="w-12 h-12 text-[#ef4444]" />
            </div>

            {/* Texte */}
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Ta boutique est prête 🎉</h2>
              <p className="text-white/60 text-sm">
                {result.count} produits ajoutés dans{' '}
                <span className="text-white/80 font-medium">
                  {result.boutique.name}
                </span>
              </p>
            </div>

            {/* Boutons */}
            <div className="w-full space-y-3 pt-4">
              <button
                onClick={() => router.push(`/${result.boutique.slug}`)}
                className="w-full bg-[#ef4444] hover:bg-[#dc2626] text-white font-medium rounded-2xl px-6 py-3.5 active:scale-95 transition-all shadow-lg shadow-[#ef4444]/20"
              >
                Voir ma boutique
              </button>

              <button
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2 bg-transparent border border-white/10 hover:bg-white/5 text-white/80 font-medium rounded-2xl px-6 py-3.5 active:scale-95 transition-all"
              >
                <Share2 className="w-4 h-4" />
                Partager
              </button>

              <button
                onClick={handleReset}
                className="w-full text-center text-white/30 hover:text-white/50 text-sm py-2 transition-colors"
              >
                Créer une autre boutique
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
