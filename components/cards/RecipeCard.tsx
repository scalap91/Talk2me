'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface RecipeCardData {
  name: string;
  image: string | null;
  prep_time: string | null;
  servings: string | null;
  difficulty: string | null;
  ingredients: string[];
  description: string | null;
  source_url: string;
  source: 'marmiton' | 'cuisineaz';
}

interface RecipeCardProps {
  recipe: RecipeCardData;
}

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe }) => {
  const [imageError, setImageError] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: recipe.name,
      url: recipe.source_url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or error, do nothing
      }
    } else {
      try {
        await navigator.clipboard.writeText(recipe.source_url);
        setShareFeedback('Lien copié !');
        setTimeout(() => setShareFeedback(null), 2000);
      } catch {
        // Clipboard not available
      }
    }
  }, [recipe.name, recipe.source_url]);

  const metadataParts: { emoji: string; label: string }[] = [];
  if (recipe.prep_time) metadataParts.push({ emoji: '⏱', label: recipe.prep_time });
  if (recipe.servings) metadataParts.push({ emoji: '👥', label: recipe.servings });
  if (recipe.difficulty) metadataParts.push({ emoji: '📊', label: recipe.difficulty });

  const displayIngredients = recipe.ingredients.slice(0, 4);
  const remainingCount = recipe.ingredients.length - 4;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="bg-white/[0.04] border border-white/8 rounded-2xl overflow-hidden"
    >
      {/* Image section */}
      {recipe.image && !imageError ? (
        <div className="h-40 overflow-hidden">
          <img
            src={recipe.image}
            alt={recipe.name}
            className="w-full h-full object-cover"
            onError={handleImageError}
          />
        </div>
      ) : (
        <div className="h-40 bg-gradient-to-br from-red-900/20 to-red-800/10 flex items-center justify-center">
          <span className="text-5xl font-emoji">🍜</span>
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <h3 className="font-semibold text-[16px] text-white leading-tight">
          {recipe.name}
        </h3>

        {/* Metadata row */}
        {metadataParts.length > 0 && (
          <p className="text-xs text-white/65 flex flex-wrap items-center gap-x-2 gap-y-1">
            {metadataParts.map((m, i) => (
              <React.Fragment key={m.emoji}>
                <span className="inline-flex items-center gap-1">
                  <span className="font-emoji">{m.emoji}</span>
                  <span>{m.label}</span>
                </span>
                {i < metadataParts.length - 1 && <span className="text-white/35">·</span>}
              </React.Fragment>
            ))}
          </p>
        )}

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <div>
            <p className="text-[13px] font-medium text-white/80 mb-1">
              Ingrédients principaux :
            </p>
            <ul className="text-[13px] text-white/65 space-y-0.5">
              {displayIngredients.map((ingredient, index) => (
                <li key={index} className="flex items-start gap-1.5">
                  <span className="text-white/40">•</span>
                  <span>{ingredient}</span>
                </li>
              ))}
              {remainingCount > 0 && (
                <li className="text-white/50 italic">
                  + {remainingCount} autres
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Description */}
        {recipe.description && (
          <p className="text-[13px] text-white/65 leading-relaxed">
            {recipe.description}
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center py-2 px-4 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors"
          >
            Voir recette
          </a>
          <button
            onClick={handleShare}
            className="flex-1 text-center py-2 px-4 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors relative"
          >
            {shareFeedback || 'Partager'}
          </button>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-white/35 text-center">
          via {recipe.source === 'marmiton' ? 'Marmiton' : 'Cuisine AZ'}
        </p>
      </div>
    </motion.div>
  );
};

export default RecipeCard;
