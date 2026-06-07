'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '@/lib/store/chat';

const GeolocRequestBubble: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async () => {
    setLoading(true);
    setError(null);
    try {
      await useChatStore.getState().requestGeolocation();
    } catch {
      setError('Permission refusée. Dis-moi la ville (ex : "à Lyon").');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="inline-flex items-center gap-2 bg-gradient-to-r from-red-500/15 to-red-700/15 border border-red-400/30 rounded-full px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm"
      >
        <span aria-hidden="true">🗺️</span>
        <span>Active la position pour chercher autour de toi</span>
        <button
          type="button"
          onClick={handleActivate}
          disabled={loading}
          className="ml-1 px-3 py-1 text-xs font-medium bg-gradient-to-r from-red-500 to-red-700 hover:opacity-90 text-white rounded-full transition disabled:opacity-50"
          aria-label="Activer la géolocalisation"
        >
          {loading ? 'Activation…' : 'Activer'}
        </button>
      </motion.div>
      {error && <p className="text-xs text-red-300 mt-1">{error}</p>}
    </div>
  );
};

export default GeolocRequestBubble;
